const express = require('express')
var cors = require('cors')
const dotenv = require('dotenv');
const { MongoClient, ServerApiVersion } = require('mongodb');
const app = express()
const port = process.env.PORT || 3000;

// Load environment variables from .env file
dotenv.config();

app.use(cors())
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.x4uxqpq.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});
async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        await client.connect();

        // create collections 
        const db = client.db('bikroy_haat'); // database name
        const usersCollection = db.collection('users');
        const productsCollection = db.collection('products');

        // add user data to DB
        app.post("/users", async (req, res) => {
            const { name, email, profilePhoto, password, lastSignIn, createdAt } = req.body;

            // Check if user already exists
            const existing = await usersCollection.findOne({ email });
            if (existing) {
                // update last log in
                const filter = { email: email }
                const updateDocument = {
                    $set: {
                        lastSignIn: new Date().toISOString(),
                    },
                };
                const result = await usersCollection.updateOne(filter, updateDocument)
                return res.status(200).send({ message: 'User already exists', inserted: false });
            }

            const newUser = {
                name,
                email,
                password,
                profilePhoto,
                role: "user",
                createdAt,
                lastSignIn,
            };

            const result = await usersCollection.insertOne(newUser);
            res.status(201).json({ message: "User added", insertedId: result.insertedId });
        });

        // add products data tp DB & products API
        app.post("/products", async (req, res) => {
            try {
                const product = req.body;

                // Add a timestamp and set default status
                product.status = "pending";
                product.createdAt = new Date();

                const result = await productsCollection.insertOne(product);

                res.status(201).json({
                    message: "Product added successfully",
                    insertedId: result.insertedId,
                });
                console.log(result.insertedId)
            } catch (err) {
                console.error("Failed to insert product:", err);
                res.status(500).json({ error: "Internal Server Error" });
            }
        });


        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);

app.get('/', (req, res) => {
    res.send('Hello World!')
})

app.listen(port, () => {
    console.log(`Example app listening on port ${port}`)
})