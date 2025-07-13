const express = require('express')
var cors = require('cors')
const dotenv = require('dotenv');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const app = express()
const port = process.env.PORT || 3000;

const jwt = require("jsonwebtoken");
const secret = "sghsifgnfgnfdknfdklgfngkl";

// Load environment variables from .env file
dotenv.config();

app.use(cors())
app.use(express.json());

// verify jwt token
function verifyToken(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader) return res.status(401).send({ error: "Unauthorized" });

    const token = authHeader.split(" ")[1];

    jwt.verify(token, secret, (err, decoded) => {
        if (err) return res.status(403).send({ error: "Forbidden" });

        req.decoded = decoded; // put decoded info in req
        next();
    });
}


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

        // generate jwt token
        app.post("/api/jwt", async (req, res) => {
            const user = req.body.email; // should contain at least email
            try {
                const token = jwt.sign({ user }, secret, {
                    expiresIn: "7d", // optional: token expires in 7 days
                });
                res.send({ token });

            } catch (error) {
                console.log(error)
                res.status(500).send({ error: "Token generation failed" });
            }
        });


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

        // get my products added by vendor
        app.get("/products", verifyToken, async (req, res) => {
            const vendorEmail = req.query.email;
            if (vendorEmail !== req.decoded.user) {
                return res.status(403).send({ error: "Forbidden" });
            }
            try {
                const products = await productsCollection
                    .find({ vendorEmail: vendorEmail })
                    .sort({ createdAt: -1 }) // optional: newest first
                    .toArray();

                res.status(200).send(products);
            } catch (error) {
                console.error("Error fetching vendor products:", error);
                res.status(500).json({ error: "Failed to fetch vendor products" });
            }
        });

        // get single product by id
        app.get('/products/:id', async (req, res) => {
            const productId = req.params.id;

            console.log(productId)

            if (!ObjectId.isValid(productId)) {
                return res.status(400).json({ error: "Invalid product ID" });
            }

            try {
                const product = await productsCollection.findOne({ _id: new ObjectId(productId) });

                if (!product) {
                    return res.status(404).json({ error: "Product not found" });
                }

                res.json(product);
            } catch (error) {
                console.error("Error fetching product by ID:", error);
                res.status(500).json({ error: "Internal server error" });
            }
        });

        // update product api
        app.put("/products/:id", async (req, res) => {
            try {
                const productId = req.params.id;
                const {
                    marketName,
                    marketDescription,
                    date,
                    itemName,
                    pricePerUnit,
                    itemDescription,
                    image,
                } = req.body;

                const query = { _id: new ObjectId(productId) };

                const updateDoc = {
                    $set: {
                        marketName,
                        marketDescription,
                        date,
                        itemName,
                        pricePerUnit,
                        itemDescription,
                        image,
                    },
                    $push: {
                        prices: {
                            date: date,
                            price: parseFloat(pricePerUnit),
                        },
                    },
                };

                const result = await productsCollection.updateOne(query, updateDoc);

                if (result.modifiedCount > 0) {
                    res.send(result);
                } else {
                    res.status(404).send({ error: "Product not found or no changes made" });
                }
            } catch (error) {
                console.error("Update Error:", error);
                res.status(500).send({ error: "Internal Server Error" });
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