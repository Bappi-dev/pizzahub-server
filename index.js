import express from "express";
import { MongoClient, ObjectId } from "mongodb";
import cors from "cors";
import { betterAuth } from "better-auth";
import { mongodbAdapter } from "@better-auth/mongo-adapter";
import "dotenv/config";

const app = express();
const PORT = process.env.PORT || 5000;

app.use(
  cors({
    origin: process.env.CORS_ORIGIN ?? true,
    credentials: true,
  }),
);
app.use(express.json());

const client = new MongoClient(process.env.DB_URI);
export async function connectToMongoDB() {
  try {
    await client.connect();
    console.log("You successfully connected to MongoDB!");
    return client;
  } catch (err) {
    console.dir(err);
  }
}
const Client = await connectToMongoDB();
const db = Client.db("Pizzahub");
const pizzaCollection = db.collection("menu");
const pizzaBookingsCollection = db.collection("oder");
const auth = betterAuth({
  database: mongodbAdapter(db, { client }),
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL ?? `http://localhost:${PORT}`,
  emailAndPassword: {
    enabled: true,
  },
  user: {
    additionalFields: {
      role: {
        type: ["vendor", "admin", "customer"],
        input: false,
        defaultValue: "customer",
      },
      plan: {
        type: ["free", "premium"],
        input: false,
        defaultValue: "free",
      },
    },
  },
});
const visibleToCustomers = {
  approvalStatus: "approved",
  status: "active",
};

app.patch("/api/admin/users/:id", async (req, res) => {
  const requestHeaders = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (typeof value === "string") requestHeaders.set(name, value);
    else if (Array.isArray(value)) requestHeaders.set(name, value.join(", "));
  }

  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session) {
    return res.status(401).send({ error: "Sign in to manage users." });
  }
  if (session.user.role !== "admin") {
    return res.status(403).send({ error: "Only admins can manage users." });
  }

  const { id } = req.params;
  const { blocked } = req.body ?? {};
  if (typeof blocked !== "boolean") {
    return res.status(400).send({ error: "Choose Block or Unblock." });
  }
  if (id === session.user.id) {
    return res
      .status(409)
      .send({ error: "You cannot block your own admin account." });
  }

  const identities = [{ _id: id }, { id }];
  if (/^[\da-f]{24}$/i.test(id)) {
    identities.push({ _id: new ObjectId(id) });
  }
  const updated = await db.collection("user").updateOne(
    { $or: identities },
    {
      $set: {
        blocked,
        banned: blocked,
        blockedAt: blocked ? new Date() : null,
        updatedAt: new Date(),
      },
    },
  );
  if (!updated.matchedCount) {
    return res.status(404).send({ error: "User not found." });
  }
  return res.send({ id, blocked });
});

app.post("/menuItems", (req, res) => {
  res.status(410).send({
    error: "Submit menu items through the authenticated vendor workspace.",
  });
});

app.get("/menuItems/:id", async (req, res) => {
  const { id } = req.params;
  const result = await pizzaCollection.findOne({
    _id: new ObjectId(id),
    ...visibleToCustomers,
  });
  res.send(result);
});

app.get("/menuItems", async (req, res) => {
  const result = await pizzaCollection.find(visibleToCustomers).toArray();
  res.send(result);
});

app.get("/", (req, res) => {
  res.send({ msg: "PizzaHub....!!" });
});

app.listen(PORT, () => {
  console.log(`Server is running on port: ${PORT}`);
});
