import express from "express";
import { MongoClient } from "mongodb";
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
const pizzaCollection = db.collection("user");
const pizzaBookingsCollection = db.collection("oder");

app.post("/menuItems", async (req, res) => {
  const data = req.body;
  const result = await pizzaCollection.insertOne(data)
  res.send(result);
});
app.get("/menuItems", async (req, res) =>{
     const result = await pizzaCollection.find().toArray()
     res.send(result)
})

app.get("/", (req, res) => {
  res.send({ msg: "PizzaHub....!!" });
});

app.listen(PORT, () => {
  console.log(`Server is running on port: ${PORT}`);
});
