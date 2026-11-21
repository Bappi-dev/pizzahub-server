import express from "express";
import { MongoClient, ObjectId } from "mongodb";
import cors from "cors";
import { betterAuth } from "better-auth";
import { mongodbAdapter } from "@better-auth/mongo-adapter";
import { jwt } from "better-auth/plugins";
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
  plugins: [
    jwt({
      jwt: {
        expirationTime: "5m",
        issuer: "pizzahub-api",
        audience: "pizzahub-api",
        definePayload: ({ user }) => ({ role: user.role }),
      },
    }),
  ],
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

function getRequestHeaders(req) {
  const requestHeaders = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (typeof value === "string") requestHeaders.set(name, value);
    else if (Array.isArray(value)) requestHeaders.set(name, value.join(", "));
  }
  return requestHeaders;
}

async function requireSession(req, res, next) {
  try {
    const session = await auth.api.getSession({
      headers: getRequestHeaders(req),
    });
    if (!session) {
      return res.status(401).send({ error: "Sign in to get an access token." });
    }

    req.authSession = session;
    return next();
  } catch (error) {
    return next(error);
  }
}

async function verifyJwt(req, res, next) {
  const authorization = req.get("authorization") ?? "";
  const match = /^Bearer\s+(\S+)$/i.exec(authorization);
  if (!match) {
    return res.status(401).send({ error: "A valid Bearer JWT is required." });
  }

  try {
    const { payload } = await auth.api.verifyJWT({
      body: { token: match[1] },
    });
    if (!payload || typeof payload.sub !== "string") {
      return res.status(401).send({ error: "Invalid or expired JWT." });
    }
    const user = await db.collection("user").findOne({
      $or: [
        { _id: payload.sub },
        { id: payload.sub },
      ],
    });
    if (!user || user.blocked === true || user.banned === true) {
      return res.status(403).send({ error: "This account is blocked." });
    }

    req.authSession = {
      user: { id: payload.sub, role: payload.role },
    };
    return next();
  } catch (error) {
    return next(error);
  }
}

function requireRole(role) {
  return (req, res, next) => {
    if (req.authSession?.user.role !== role) {
      return res.status(403).send({ error: "Only admins can manage users." });
    }
    return next();
  };
}

app.get("/api/auth/token", requireSession, async (req, res, next) => {
  try {
    const { token } = await auth.api.getToken({
      headers: getRequestHeaders(req),
    });
    return res.send({ token, tokenType: "Bearer", expiresIn: 300 });
  } catch (error) {
    return next(error);
  }
});

app.patch(
  "/api/admin/users/:id",
  verifyJwt,
  requireRole("admin"),
  async (req, res) => {
    const session = req.authSession;
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
  },
);

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
  const result = await pizzaCollection
    .find({
      ...visibleToCustomers,
      name: { $type: "string", $ne: "" },
      itemImage: { $type: "string", $ne: "" },
      category: { $type: "string", $ne: "" },
      location: { $type: "string", $ne: "" },
      price: { $type: "number", $gt: 0 },
    })
    .sort({ createdAt: -1 })
    .limit(6)
    .toArray();

  res.send(
    await Promise.all(result.map(async (item) => {
      const vendor = typeof item.vendorId === "string"
        ? await db.collection("user").findOne({
            $or: [{ id: item.vendorId }, { _id: item.vendorId }],
          })
        : null;
      return {
      _id: item._id.toString(),
      name: item.name,
      itemImage: item.itemImage,
      category: item.category,
      price: item.price,
      location: item.location,
      vendorName:
        typeof item.vendorName === "string" && item.vendorName.trim()
          ? item.vendorName.trim()
          : "Local restaurant",
      premium:
        vendor?.plan === "premium" ||
        vendor?.subscriptionPlan === "premium",
      };
    })),
  );
});

app.get("/", (req, res) => {
  res.send({ msg: "PizzaHub....!!" });
});

if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Server is running on port: ${PORT}`);
  });
}

export default app;
