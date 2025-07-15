const express = require('express')
var cors = require('cors')
const dotenv = require('dotenv');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const app = express()
const port = process.env.PORT || 3000;

// Load environment variables from .env file
dotenv.config();

// Stripe Payment Intent and Secret
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const jwt = require("jsonwebtoken");
const secret = "sghsifgnfgnfdknfdklgfngkl";

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
        const advertisementsCollection = db.collection('advertisements');
        const reviewsCollection = db.collection('reviews');

        // Strip Payment Instent API
        app.post("/create-payment-intent", async (req, res) => {
            const { amount } = req.body;

            try {
                const paymentIntent = await stripe.paymentIntents.create({
                    amount: amount * 100, // Stripe uses smallest currency unit (e.g. cents)
                    currency: "usd", // or "bdt" if available for your account
                    payment_method_types: ['card']
                });

                res.send({ clientSecret: paymentIntent.client_secret });
            } catch (err) {
                console.error(err);
                res.status(500).json({ error: "Payment intent creation failed" });
            }
        });

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

        // insert advertisements to MongoDB
        app.post("/advertisements", async (req, res) => {
            try {
                const data = req.body;

                // if (!ad.title || !ad.description || !ad.image) {
                //     return res.status(400).json({ error: "Missing required fields" });
                // }

                // Default status to pending if not provided
                const ad = {
                    ...data,
                    status: "pending",
                    createdAt: new Date()
                }

                const result = await advertisementsCollection.insertOne(ad);

                res.status(201).json({
                    message: "Advertisement added successfully",
                    insertedId: result.insertedId,
                });
            } catch (error) {
                console.error("Error adding advertisement:", error);
                res.status(500).json({ error: "Failed to add advertisement" });
            }
        });

        // insert user review in database
        app.post("/reviews", async (req, res) => {
            const { name, review, rating, productId } = req.body;
            const today = new Date().toISOString().split("T")[0];

            try {
                const newReview = {
                    name,
                    review,
                    productId,
                    rating: Number(rating),
                    createdAt: today,
                };

                const result = await reviewsCollection.insertOne(newReview);

                res.status(201).json({
                    message: "Review submitted successfully",
                    insertedId: result.insertedId,
                });
            } catch (error) {
                console.error("Failed to insert review:", error);
                res.status(500).json({ message: "Server error" });
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
        app.get('/products/:id', verifyToken, async (req, res) => {
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

                res.send(product);
            } catch (error) {
                console.error("Error fetching product by ID:", error);
                res.status(500).json({ error: "Internal server error" });
            }
        });

        // get ads by vendor email
        app.get("/advertisements", verifyToken, async (req, res) => {
            try {
                const email = req.query.email;

                if (email !== req.decoded.user) {
                    return res.status(403).send({ error: "Forbidden" });
                }

                if (!email) {
                    return res.status(400).send({ error: "Email query is required" });
                }

                const ad = await advertisementsCollection.find({ vendorEmail: email }).toArray();

                if (!ad) {
                    return res.status(404).send({ error: "Advertisement not found for this email" });
                }

                res.send(ad);
            } catch (error) {
                console.error("Failed to fetch advertisement:", error);
                res.status(500).send({ error: "Internal server error" });
            }
        });

        // get 6 product by different market date 
        // GET: /api/products/cards
        app.get("/card/products", async (req, res) => {
            try {
                const today = new Date().toISOString().split("T")[0];

                const result = await productsCollection.find({
                    status: "pending",
                    // date: { $lte: today }  // Only products for today or earlier
                })
                    .sort({ date: -1 })  // Sort by date descending (most recent first)
                    .limit(6)            // Limit to 6 documents
                    .toArray();

                console.log(result)

                // Convert _id ObjectId to string
                const formattedResult = result.map(product => ({
                    ...product,
                    _id: product._id.toString()
                }));

                res.send(formattedResult);
            } catch (error) {
                console.error("Failed to fetch product cards", error);
                res.status(500).send({ error: "Failed to fetch product cards" });
            }
        });

        // get review by product id
        app.get("/reviews", async (req, res) => {
            const productId = req.query.productId;

            if (!productId) {
                return res.status(400).json({ error: "Missing productId in query" });
            }

            try {
                const reviews = await reviewsCollection.find({ productId }).sort({ createdAt: -1 }).toArray();

                res.status(200).send(reviews);
            } catch (error) {
                console.error("Failed to get reviews:", error);
                console.log(error.stack)
                res.status(500).json({ error: "Failed to retrieve reviews" });
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

        // update ads data in DB
        // Assuming you're using Express and MongoDB client
        app.put("/advertisements/:id", async (req, res) => {
            const { id } = req.params;
            const updatedData = req.body;

            try {
                const result = await
                    advertisementsCollection.updateOne(
                        { _id: new ObjectId(id) },
                        {
                            $set: {
                                title: updatedData.title,
                                description: updatedData.description,
                                image: updatedData.image,
                            },
                        }
                    );

                if (result.modifiedCount > 0) {
                    res.send({ success: true, message: "Ad updated", modifiedCount: result.modifiedCount });
                } else {
                    res.status(404).send({ success: false, message: "No ad found or data unchanged" });
                }
            } catch (error) {
                console.error("Failed to update ad:", error);
                res.status(500).send({ success: false, error: "Internal Server Error" });
            }
        });


        // delete ads api
        app.delete("/advertisements/:id", async (req, res) => {
            const { id } = req.params;

            try {
                const result = await advertisementsCollection.deleteOne({ _id: new ObjectId(id) });

                if (result.deletedCount > 0) {
                    res.send({ success: true, message: "Advertisement deleted successfully." });
                } else {
                    res.status(404).send({ success: false, message: "Advertisement not found." });
                }
            } catch (error) {
                console.error("Error deleting advertisement:", error);
                res.status(500).send({ success: false, error: "Internal Server Error" });
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