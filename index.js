const express = require('express')
var cors = require('cors')
const dotenv = require('dotenv');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const { nanoid } = require('nanoid');
const app = express()
const port = process.env.PORT || 3000;

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
};


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
        // await client.connect();

        // create collections 
        const db = client.db('bikroy_haat'); // database name
        const usersCollection = db.collection('users');
        const productsCollection = db.collection('products');
        const advertisementsCollection = db.collection('advertisements');
        const reviewsCollection = db.collection('reviews');
        const ordersCollection = db.collection('orders');
        const watchlistCollection = db.collection('watchlists');

        // verify admin
        const verifyAdmin = async (req, res, next) => {
            const { user } = req.decoded;

            const userData = await usersCollection.findOne({ email: user });

            if (!user || userData.role !== "admin") {
                return res.status(403).send({ error: "Forbidden Access" });
            }

            next();
        }
        // verify admin
        const verifyVendor = async (req, res, next) => {
            const { user } = req.decoded;

            const userData = await usersCollection.findOne({ email: user });

            if (!user || userData.role !== "vendor") {
                return res.status(403).send({ error: "Forbidden Access" });
            }

            next();
        }

        // generate jwt token
        app.post("/api/jwt", async (req, res) => {
            const { email } = req.body; // should contain at least email
            // console.log(email)
            try {
                const token = jwt.sign({ user: email }, secret, {
                    expiresIn: "7d", // optional: token expires in 7 days
                });
                res.send({ token });

            } catch (error) {
                // console.log(error)
                res.status(500).send({ error: "Token generation failed" });
            }
        });

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

        app.post("/products", verifyToken, verifyVendor, async (req, res) => {
            try {
                const product = req.body;

                product.status = "pending";
                product.createdAt = new Date();

                // Format each price entry's date as 'YYYY-MM-DD'
                product.prices = product.prices.map(entry => {
                    const dateObj = new Date(entry.date);
                    const formattedDate = dateObj.toISOString().split("T")[0]; // "YYYY-MM-DD"
                    return {
                        date: formattedDate,
                        price: parseFloat(entry.price)
                    };
                });

                const result = await productsCollection.insertOne(product);

                res.status(201).send({
                    message: "Product added successfully",
                    insertedId: result.insertedId,
                });
            } catch (err) {
                console.error("Failed to insert product:", err);
                res.status(500).send({ error: "Internal Server Error" });
            }
        });



        // insert advertisements to MongoDB
        app.post("/advertisements", verifyToken, verifyVendor, async (req, res) => {
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
        app.post("/reviews", verifyToken, async (req, res) => {
            const { name, review, rating, productId, email, image } = req.body;
            const today = new Date().toISOString().split("T")[0];

            try {
                const newReview = {
                    name,
                    email,
                    image,
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

        // save cutomer orders data in DB
        app.post('/orders', verifyToken, async (req, res) => {
            try {
                const paymentData = req.body;

                // Generate order ID
                const orderId = 'ORD-' + new Date().toISOString().slice(0, 10).replace(/-/g, '') + '-' + nanoid(6);

                const finalData = {
                    ...paymentData,
                    orderId,
                    paymentStatus: 'succeess'
                };

                const result = await ordersCollection.insertOne(finalData);
                res.status(200).send({
                    success: true,
                    insertedId: result.insertedId,
                    orderId, // you can return it to show user
                });
            } catch (error) {
                console.error('Error saving payment:', error);
                res.status(500).send({ success: false });
            }
        });

        // POST API to add a product to the watchlist
        app.post('/watchlist', verifyToken, async (req, res) => {
            const watchlistData = req.body;

            // Basic validation
            if (!watchlistData) {
                return res.status(400).json({ message: 'Missing Watchlist Data, Failed To Save!' });
            }

            try {
                // Optional: Check if the product is already in the user's watchlist
                // This prevents duplicate entries for the same user and product
                const existingEntry = await watchlistCollection.findOne({
                    user: watchlistData.user,
                    productId: watchlistData.productId
                });

                if (existingEntry) {
                    return res.status(409).json({ message: 'Product already in watchlist' });
                }

                // Insert the document into the collection
                const result = await watchlistCollection.insertOne(watchlistData);

                // Respond with success
                res.status(201).send({
                    message: 'Product added to watchlist successfully!',
                    insertedId: result.insertedId,
                    data: watchlistData
                });

            } catch (error) {
                console.error('Error adding to watchlist:', error);
                res.status(500).send({ message: 'Failed to add product to watchlist', error: error.message });
            }
        });

        app.get('/user/:email', async (req, res) => {
            try {
                const { email } = req.params;
                const user = await usersCollection.findOne({ email: email });
                res.status(200).send(user);
            } catch (error) {
                console.error('Error fetching user:', error);
                res.status(500).json({ message: 'Failed to retrieve user', error: error.message });
            }
        })

        // GET API to retrieve all users with optional role filtering, searching, and pagination
        app.get('/admin/users', verifyToken, verifyAdmin, async (req, res) => {
            // console.log(req.decoded);
            try {
                const { role, search, page = 1, limit = 10 } = req.query;

                const skip = (parseInt(page) - 1) * parseInt(limit);
                const queryLimit = parseInt(limit);

                let query = {};

                // If a role is provided, add it to the query filter
                if (role && role !== 'all') {
                    query.role = role;
                }

                // Apply Search Filter (if provided)
                if (search) {
                    const searchRegExp = new RegExp(search, 'i');
                    query.$or = [
                        { name: searchRegExp },
                        { email: searchRegExp }
                    ];
                }

                // Get total count of users matching the filter (important for pagination)
                const totalUsers = await usersCollection.countDocuments(query);

                // Fetch users with pagination
                const users = await usersCollection.find(query)
                    .skip(skip)
                    .limit(queryLimit)
                    .toArray();

                res.status(200).json({
                    users,
                    totalUsers,
                    currentPage: parseInt(page),
                    totalPages: Math.ceil(totalUsers / queryLimit)
                });

            } catch (error) {
                console.error('Error fetching users:', error);
                res.status(500).json({ message: 'Failed to retrieve users', error: error.message });
            }
        });

        // ADMIN dashboard states
        app.get("/admin/stats", verifyToken, verifyAdmin, async (req, res) => {
            try {
                const totalUsers = await usersCollection.countDocuments({ role: "user" });
                const totalVendors = await usersCollection.countDocuments({ role: "vendor" });
                const totalProducts = await productsCollection.countDocuments();
                const totalAdvertisements = await advertisementsCollection.countDocuments();
                // const totalSales = await ordersCollection.aggregate([
                //     { $match: { paymentStatus: { $in: ["succeess", "success"] } } },
                //     { $group: { _id: null, total: { $sum: { $toInt: "$amount" } } } },
                // ]);

                const countOrders = await ordersCollection.countDocuments();

                const totalSales = await ordersCollection.aggregate([
                    { $group: { _id: null, total: { $sum: "$amount" } } }
                ]).toArray();



                res.json({
                    totalUsers,
                    totalVendors,
                    totalProducts,
                    totalAdvertisements,
                    totalSales: totalSales[0]?.total || 0,
                });
            } catch (error) {
                res.status(500).json({ message: "Error fetching stats", error });
            }
        });

        // GET /admin/orders-per-month?last=12&successOnly=true&tz=%2B06:00
        // Defaults: last=12 months, successOnly=true, timezone=+06:00 (Dhaka)
        app.get("/admin/orders-per-month", verifyToken, verifyAdmin, async (req, res) => {
            try {
                const last = Math.max(1, parseInt(req.query.last || "12", 10));
                const successOnly = (req.query.successOnly ?? "true") !== "false";
                const tz = decodeURIComponent(req.query.tz || "+06:00"); // e.g. "+06:00"

                // Build a JS date for the start of the first month included
                const now = new Date();
                const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)); // first of this month (UTC)
                start.setUTCMonth(start.getUTCMonth() - (last - 1)); // go back last-1 months

                // Helper to format YYYY-MM in Node
                const ymLabel = (y, m) => `${y}-${String(m).padStart(2, "0")}`;

                // Build a skeleton for the last N months so missing months become 0s
                const buckets = [];
                {
                    const temp = new Date(start);
                    for (let i = 0; i < last; i++) {
                        const y = temp.getUTCFullYear();
                        const m = temp.getUTCMonth() + 1; // 1-12
                        buckets.push({ year: y, month: m, label: ymLabel(y, m), orders: 0, revenue: 0, qty: 0 });
                        temp.setUTCMonth(temp.getUTCMonth() + 1);
                    }
                }
                const bucketMap = new Map(buckets.map(b => [b.label, b]));

                // Build the pipeline
                const pipeline = [
                    // 1) Normalize date → parsedDate (handles both Date and String)
                    {
                        $addFields: {
                            parsedDate: {
                                $cond: [
                                    { $eq: [{ $type: "$date" }, "date"] },
                                    "$date",
                                    { $dateFromString: { dateString: "$date", timezone: tz } } // e.g. "2025-07-17"
                                ]
                            }
                        }
                    },
                    // 2) Optional: only successful orders
                    ...(successOnly
                        ? [{
                            $match: {
                                $or: [
                                    { status: "succeeded" },
                                    { paymentStatus: "succeess" } // your stored typo
                                ]
                            }
                        }]
                        : []),
                    // 3) Only last N months (match on parsedDate >= start)
                    { $match: { parsedDate: { $gte: start } } },
                    // 4) Extract year & month in your timezone (ensures correct month boundaries)
                    {
                        $addFields: {
                            parts: { $dateToParts: { date: "$parsedDate", timezone: tz } }
                        }
                    },
                    // 5) Group by (year, month)
                    {
                        $group: {
                            _id: { y: "$parts.year", m: "$parts.month" },
                            orders: { $sum: 1 },
                            revenue: { $sum: { $toDouble: "$amount" } },
                            qty: { $sum: { $toInt: "$quantity" } }
                        }
                    },
                    // 6) Project clean fields
                    {
                        $project: {
                            _id: 0,
                            year: "$_id.y",
                            month: "$_id.m",
                            orders: 1,
                            revenue: 1,
                            qty: 1
                        }
                    },
                    // 7) Sort chronological
                    { $sort: { year: 1, month: 1 } }
                ];

                const rows = await ordersCollection.aggregate(pipeline).toArray();

                // Merge real data into the fixed buckets
                for (const r of rows) {
                    const label = `${r.year}-${String(r.month).padStart(2, "0")}`;
                    const b = bucketMap.get(label);
                    if (b) {
                        b.orders = r.orders;
                        b.revenue = r.revenue;
                        b.qty = r.qty;
                    }
                }

                // Final array ordered oldest → newest
                const result = buckets;

                res.json({
                    range: { months: last, start: ymLabel(buckets[0].year, buckets[0].month), end: buckets[buckets.length - 1].label, timezone: tz },
                    successOnly,
                    data: result
                });
            } catch (err) {
                console.error(err);
                res.status(500).json({ message: "Failed to compute orders per month", error: err.message });
            }
        });

        // VENDOR dashboard stats
        app.get("/vendor/stats", verifyToken, verifyVendor, async (req, res) => {
            try {
                const vendorEmail = req.query.email; // vendor's email passed as query ?email=vendor@mail.com
                if (!vendorEmail) {
                    return res.status(400).json({ message: "Vendor email is required" });
                }

                // Vendor's products count
                const totalProducts = await productsCollection.countDocuments({ vendorEmail });

                // Vendor's advertisements count
                const totalAdvertisements = await advertisementsCollection.countDocuments({ vendorEmail });

                // Vendor's orders (filtering by vendorEmail inside orders)
                const vendorOrders = await ordersCollection.find({ vendorEmail }).toArray();
                const totalOrders = vendorOrders.length;

                // Vendor's total sales (sum of amount)
                const salesAgg = await ordersCollection.aggregate([
                    { $match: { vendorEmail } },
                    {
                        $group: {
                            _id: null,
                            total: { $sum: { $toInt: "$amount" } },
                        },
                    },
                ]).toArray();

                res.json({
                    vendorEmail,
                    totalProducts,
                    totalAdvertisements,
                    totalOrders,
                    totalSales: salesAgg[0]?.total || 0,
                });
            } catch (error) {
                res.status(500).json({ message: "Error fetching vendor stats", error });
            }
        });


        // USER dashboard stats
        app.get("/user/dashboard/stats", verifyToken, async (req, res) => {
            try {
                const userEmail = req.query.email; // passed as ?email=user@mail.com
                if (!userEmail) {
                    return res.status(400).json({ message: "User email is required" });
                }


                // Total watchlist items
                const totalWatchlist = await watchlistCollection.countDocuments({ user: userEmail });

                // Total pending orders
                // const totalPendingOrders = await ordersCollection.countDocuments({ userEmail, paymentStatus: "pending" });

                // Total successful orders
                const totalOrders = await ordersCollection.countDocuments({ userEmail});

                res.json({
                    totalOrders,
                    totalWatchlist,
                });
            } catch (error) {
                console.error("Error fetching user stats:", error);
                res.status(500).json({ message: "Error fetching user stats", error });
            }
        });



        // GET user role by email
        app.get('/users/role/:email', async (req, res) => {
            const { email } = req.params;

            if (!email) {
                return res.status(400).json({ message: 'Email parameter is required.' });
            }

            try {
                const user = await usersCollection.findOne({ email: email });

                if (!user) {
                    // If user not found, return a default role (e.g., 'guest' or 'unregistered')
                    return res.status(200).json({ role: 'guest', message: 'User not found, defaulting to guest role.' });
                }

                // Assuming the user document has a 'role' field
                res.status(200).send({ role: user.role || 'user' }); // Default to 'user' if role field is missing
            } catch (error) {
                console.error('Error fetching user role:', error);
                res.status(500).json({ message: 'Failed to fetch user role', error: error.message });
            }
        });

        // get my products added by vendor
        app.get("/products/vendor", verifyToken, verifyVendor, async (req, res) => {
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

        // GET API to retrieve products for public view with filtering and sorting
        app.get('/products', async (req, res) => {
            try {
                const { sortBy, sortOrder, startDate, endDate } = req.query; // Removed page and limit

                let query = { status: 'approved' }; // Public API only shows 'approved' products by default
                let sortOptions = {};

                // Date filtering (for 'createdAt' field)
                if (startDate || endDate) {
                    query.createdAt = {};
                    if (startDate) {
                        query.createdAt.$gte = new Date(startDate);
                    }
                    if (endDate) {
                        const endOfDay = new Date(endDate);
                        endOfDay.setHours(23, 59, 59, 999);
                        query.createdAt.$lte = endOfDay;
                    }
                }

                // Sorting Logic
                if (sortBy === 'price') {
                    const order = sortOrder === 'desc' ? -1 : 1;
                    sortOptions.pricePerUnit = order;
                } else if (sortBy === 'date') {
                    const order = sortOrder === 'desc' ? -1 : 1;
                    sortOptions.createdAt = order;
                }

                // Removed skip and limit from here
                const products = await productsCollection.find(query)
                    .sort(sortOptions)
                    .toArray(); // Get all matching products

                res.status(200).send(products); // Send just the array of products

            } catch (error) {
                console.error('Error fetching public products:', error);
                res.status(500).send({ message: 'Failed to retrieve products', error: error.message });
            }
        });

        // GET API to retrieve all products with filtering, sorting, and pagination
        app.get('/admin/all-products', verifyToken, verifyAdmin, async (req, res) => {
            try {
                const { sortBy, sortOrder, startDate, endDate, status, page = 1, limit = 10 } = req.query; // Add page and limit

                // console.log(limit)

                const skip = (parseInt(page) - 1) * parseInt(limit); // Calculate how many documents to skip
                const queryLimit = parseInt(limit); // Number of documents to return per page

                let query = {};
                let sortOptions = {};

                // Date filtering
                if (startDate || endDate) {
                    query.createdAt = {};
                    if (startDate) {
                        query.createdAt.$gte = new Date(startDate);
                    }
                    if (endDate) {
                        const endOfDay = new Date(endDate);
                        endOfDay.setHours(23, 59, 59, 999);
                        query.createdAt.$lte = endOfDay;
                    }
                }

                // Status filtering
                if (status && ['pending', 'approved', 'rejected'].includes(status)) {
                    query.status = status;
                }

                // Sorting Logic
                if (sortBy === 'price') {
                    const order = sortOrder === 'desc' ? -1 : 1;
                    sortOptions.pricePerUnit = order;
                } else if (sortBy === 'date') {
                    const order = sortOrder === 'desc' ? -1 : 1;
                    sortOptions.createdAt = order;
                }

                const totalProducts = await productsCollection.countDocuments(query); // Get total count for pagination
                const products = await productsCollection.find(query)
                    .sort(sortOptions)
                    .skip(skip)   // Apply skip for pagination
                    .limit(queryLimit) // Apply limit for pagination
                    .toArray();

                res.status(200).send({
                    products,
                    totalProducts,
                    currentPage: parseInt(page),
                    totalPages: Math.ceil(totalProducts / queryLimit)
                });

            } catch (error) {
                console.error('Error fetching products:', error);
                res.status(500).send({ message: 'Failed to retrieve products', error: error.message });
            }
        });

        // get single product by id
        app.get('/products/:id', async (req, res) => {
            const productId = req.params.id;

            // console.log(productId)

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

        // get all advertisement (public)
        app.get('/advertisements', async (req, res) => {
            try {
                const ads = await advertisementsCollection.find({ status: 'approved' }).toArray();
                res.status(200).send(ads);
            } catch (error) {
                res.status(500).send({ success: false, message: 'Failed to fetch advertisements', error });
            }
        });

        // get ads by vendor email
        app.get("/vendor/advertisements", verifyToken, verifyVendor, async (req, res) => {
            try {
                const { email } = req.query;

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

        // GET all advertisements (Admin)
        app.get('/allAds', verifyToken, verifyAdmin, async (req, res) => {
            try {
                const advertisements = await advertisementsCollection.find({}).toArray();
                res.status(200).send(advertisements);
            } catch (error) {
                console.error('Error fetching advertisements:', error);
                res.status(500).send({ message: 'Failed to fetch advertisements', error: error.message });
            }
        });

        // get 6 product by different market date 
        // GET: /products/cards
        app.get("/card/products", async (req, res) => {
            try {
                const today = new Date().toISOString().split("T")[0];

                const result = await productsCollection.find({
                    status: "approved",
                    $expr: { $lt: [{ $toInt: "$pricePerUnit" }, 100] }
                    // date: { $lte: today }  // Only products for today or earlier
                })
                    .sort({ pricePerUnit: -1 })  // Sort by date descending (most recent first)
                    .limit(8)            // Limit to 6 documents
                    .toArray();

                // console.log(result)

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

        app.get("/recent-products", async (req, res) => {
            try {
                const today = new Date().toISOString().split("T")[0];

                const result = await productsCollection.find({
                    status: "approved",
                    // date: { $lte: today }  // Only products for today or earlier
                })
                    .sort({ date: -1 })  // Sort by date descending (most recent first)
                    .limit(8)            // Limit to 6 documents
                    .toArray();

                // console.log(result)

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

        app.get("/top-selling-products", async (req, res) => {
            try {
                const topSelling = await ordersCollection.aggregate([
                    // 1. Group orders by productId and productName
                    {
                        $group: {
                            _id: { productId: "$productId", productName: "$productName", marketName: "$marketName" },
                            totalQuantity: { $sum: "$quantity" } // sum quantity
                        }
                    },
                    // 2. Sort by totalQuantity descending
                    { $sort: { totalQuantity: -1 } },
                    // 3. Optional: limit to top 5 products
                    { $limit: 5 }
                ]).toArray();

                res.send(topSelling);

            } catch (error) {
                console.error("Failed to fetch top-selling products:", error);
                res.status(500).send({ error: "Failed to fetch top-selling products" });
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
                // console.log(error.stack)
                res.status(500).json({ error: "Failed to retrieve reviews" });
            }
        });

        // get watchlist filtered by user email
        app.get('/watchlists', verifyToken, async (req, res) => {
            // Get the userEmail from query parameters (e.g., /api/watchlists?userEmail=test@example.com)
            const userEmail = req.query.email;

            // Basic validation
            if (!userEmail) {
                return res.status(400).json({ message: 'User email is required as a query parameter (e.g., ?userEmail=your@email.com)' });
            }

            try {
                const userWatchlists = await watchlistCollection.find({ user: userEmail }).toArray();

                if (userWatchlists.length === 0) {
                    return res.status(200).send([]);
                }

                res.status(200).send(userWatchlists);

            } catch (error) {
                console.error('Error fetching user watchlists:', error);
                res.status(500).send({ message: 'Failed to retrieve user watchlists', error: error.message });
            }
        });

        app.get('/orders', verifyToken, async (req, res) => {
            const userEmail = req.query.email;
            try {
                const orderLists = await ordersCollection.find({ userEmail }).toArray();

                res.status(200).send(orderLists);
            } catch (error) {
                console.error('Error fetching user order list:', error);
                res.status(500).send({ message: 'Failed to retrieve user orders', error: error.message });
            }
        });

        // GET all orders (Admin)
        app.get('/allOrders', verifyToken, verifyAdmin, async (req, res) => {
            try {
                const orders = await ordersCollection.find({}).toArray();
                res.status(200).send(orders);
            } catch (error) {
                console.error('Error fetching orders:', error);
                res.status(500).send({ message: 'Failed to fetch orders', error: error.message });
            }
        });


        // update product api
        app.put("/products/:id", verifyToken, async (req, res) => {
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
        app.put("/advertisements/:id", verifyToken, verifyVendor, async (req, res) => {
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

        // PATCH /api/users/:id - Update user profile
        app.patch('/user/:id', verifyToken, async (req, res) => {
            const { id } = req.params; // Get user ID from URL parameters
            const updates = {};

            // Only allow specific fields to be updated
            if (req.body.name !== undefined) {
                updates.name = req.body.name;
            }
            if (req.body.phone !== undefined) {
                updates.phone = req.body.phone;
            }
            if (req.body.location !== undefined) {
                updates.location = req.body.location;
            }
            if (req.body.profilePhoto !== undefined) {
                updates.profilePhoto = req.body.profilePhoto;
            }

            try {
                const user = await usersCollection.updateOne({ _id: new ObjectId(id) }, { $set: updates })

                if (!user) {
                    return res.status(404).json({ message: 'User not found.' });
                }

                res.status(200).send(user);

            } catch (error) {
                // Handle Mongoose validation errors or other database errors
                if (error.name === 'ValidationError') {
                    return res.status(400).json({ message: error.message });
                }
                res.status(500).json({ message: 'Server error', error: error.message });
            }
        });

        // PATCH API to update a user's role by ID
        app.patch('/admin/update-user-role/:id', verifyToken, verifyAdmin, async (req, res) => {
            const { id } = req.params; // Get user ID from URL parameters
            const { role } = req.body; // Get new role from request body

            if (!role || !['user', 'vendor', 'admin'].includes(role)) {
                return res.status(400).json({ message: 'Invalid role provided.' });
            }

            try {
                const result = await usersCollection.updateOne(
                    { _id: new ObjectId(id) }, // Find the user by ID
                    { $set: { role: role } }    // Set the new role
                );

                if (result.matchedCount === 0) {
                    return res.status(404).json({ message: 'User not found.' });
                }
                if (result.modifiedCount === 0) {
                    return res.status(200).json({ message: 'User role already set to this value or no changes made.' });
                }

                res.status(200).json({ message: 'User role updated successfully!', userId: id, newRole: role });

            } catch (error) {
                console.error('Error updating user role:', error);
                res.status(500).json({ message: 'Failed to update user role', error: error.message });
            }
        });

        // PATCH API to update product status (approve/reject/pending)
        app.patch('/products/:id/status', verifyToken, verifyAdmin, async (req, res) => {
            const { id } = req.params;   // Get the product ID from the URL parameters
            const { status, rejectionReason, feedback } = req.body; // Get the new status from the request body

            // Basic validation for ObjectId format
            if (!ObjectId.isValid(id)) {
                return res.status(400).json({ message: 'Invalid product ID format.' });
            }

            // Validate the incoming status value
            const validStatuses = ['pending', 'approved', 'rejected'];
            if (!status || !validStatuses.includes(status)) {
                return res.status(400).json({ message: `Invalid status provided. Must be one of: ${validStatuses.join(', ')}.` });
            }

            // If status is 'rejected', ensure a rejectionReason is provided
            if (status === 'rejected' && (!rejectionReason || typeof rejectionReason !== 'string' || rejectionReason.trim() === '')) {
                return res.status(400).json({ message: 'Rejection reason is required when setting status to "rejected".' });
            }

            try {
                let updateFields = { status: status };

                // If status is rejected, store the reason.
                // If status is changed *from* rejected to something else, clear the reason.
                if (status === 'rejected') {
                    updateFields.rejectionReason = rejectionReason.trim();
                    updateFields.feedback = feedback ? feedback.trim() : null;
                } else {
                    updateFields.rejectionReason = null;
                    updateFields.feedback = null;
                }

                const result = await productsCollection.updateOne(
                    { _id: new ObjectId(id) },
                    { $set: updateFields }
                );

                if (result.matchedCount === 0) {
                    return res.status(404).json({ message: 'Product not found.' });
                }
                if (result.modifiedCount === 0) {
                    return res.status(200).json({ message: `Product status is already '${status}' and reason is consistent. No changes made.`, productId: id, currentStatus: status });
                }

                res.status(200).json({ message: `Product status updated to '${status}' successfully!`, productId: id, newStatus: status });

            } catch (error) {
                console.error('Error updating product status:', error);
                res.status(500).json({ message: 'Failed to update product status', error: error.message });
            }
        });

        // PATCH update advertisement status (approve/reject/pending)
        app.patch('/advertisements/:id/status', verifyToken, verifyAdmin, async (req, res) => {
            const { id } = req.params;
            const { status } = req.body; // 'approved', 'rejected', 'pending'

            if (!ObjectId.isValid(id)) {
                return res.status(400).json({ message: 'Invalid advertisement ID format.' });
            }

            const validStatuses = ['pending', 'approved', 'rejected']; // Define your valid statuses
            if (!status || !validStatuses.includes(status)) {
                return res.status(400).json({ message: `Invalid status provided. Must be one of: ${validStatuses.join(', ')}.` });
            }

            try {
                const result = await advertisementsCollection.updateOne(
                    { _id: new ObjectId(id) },
                    { $set: { status: status } }
                );

                if (result.matchedCount === 0) {
                    return res.status(404).json({ message: 'Advertisement not found.' });
                }
                if (result.modifiedCount === 0) {
                    return res.status(200).json({ message: `Advertisement status is already '${status}'. No changes made.`, advertisementId: id, currentStatus: status });
                }

                res.status(200).send({ message: `Advertisement status updated to '${status}' successfully!`, advertisementId: id, newStatus: status });

            } catch (error) {
                console.error('Error updating advertisement status:', error);
                res.status(500).send({ message: 'Failed to update advertisement status', error: error.message });
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

        // DELETE API to remove a product by its ID
        app.delete('/products/:id', async (req, res) => {
            const { id } = req.params; // Get the product ID from the URL parameters

            // Basic validation for ObjectId format (optional but recommended)
            if (!ObjectId.isValid(id)) {
                return res.status(400).json({ message: 'Invalid product ID format.' });
            }

            try {
                const result = await productsCollection.deleteOne({ _id: new ObjectId(id) });

                if (result.deletedCount === 0) {
                    // If no document was deleted, it means the product with that ID wasn't found
                    return res.status(404).json({ message: 'Product not found.' });
                }

                // Success response
                res.status(200).json({ message: 'Product deleted successfully!', productId: id });

            } catch (error) {
                console.error('Error deleting product:', error);
                // Generic server error response
                res.status(500).json({ message: 'Failed to delete product', error: error.message });
            }
        });

        // Delete API for users Watchlist
        app.delete("/watchlists/:id", async (req, res) => {
            const { id } = req.params;

            try {
                const result = await watchlistCollection.deleteOne({ _id: new ObjectId(id) });

                if (result.deletedCount > 0) {
                    res.send({ success: true, message: "Product removed from watchlist ." });
                } else {
                    res.status(404).send({ success: false, message: "Product not found." });
                }
            } catch (error) {
                console.error("Error deleting advertisement:", error);
                res.status(500).send({ success: false, error: "Internal Server Error" });
            }
        });


        // Send a ping to confirm a successful connection
        // await client.db("admin").command({ ping: 1 });
        // console.log("Pinged your deployment. You successfully connected to MongoDB!");
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