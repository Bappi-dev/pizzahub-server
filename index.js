import express from "express";
import { MongoClient, ObjectId } from "mongodb";
import cors from "cors";
import "dotenv/config";

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
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
const visibleToCustomers = {
  approvalStatus: { $not: /^rejected$/i },
  status: { $not: /^rejected$/i },
};

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
