# Daily Price Tracker for Local Markets (BIKROY HAAT) - Server Side 📈
This repository contains the server-side code for the "Daily Price Tracker for Local Markets" project. This API serves as the backbone for managing market product data, user authentication, and various other functionalities, ensuring a seamless experience for both users and vendors.

## Project Purpose 🎯**
The primary objective of this project is to provide a comprehensive platform for users to track and compare daily prices of essential items across different local markets. Vendors can update prices, while users can leverage the platform to view, track, and compare this data. The project also incorporates monetization options through product purchases and sponsored advertisements.

## Live URL 🌐
[[Please insert your live server URL here](https://bikroy-haat-server.vercel.app/)]

## Key Features ✨
User Authentication & Authorization: Secure JWT-based authentication, Google social login, and Role-Based Access Control (RBAC) for users, vendors, and admins. 🔐

Product Management: API endpoints for vendors to add, update, and delete product price updates. Admin functionalities to approve, reject (with feedback), update, and delete products. Includes filtering and sorting options. 🥕

Advertisement Management: Vendors can submit advertisements, and admins can approve, reject, update, and delete them. 📢

Watchlist & Order Management: API endpoints for users to add/remove items from their watchlist and manage purchase orders. 🛒

Review and Comment System: API endpoints for users to submit reviews and star ratings for market prices. 💬

Price Trend Data: Endpoints to fetch historical price data for items, facilitating price trend comparisons. 📊

Search Functionality: Backend search implementation for users in the admin panel. 🔍

Secure Environment Variables: Secure handling of MongoDB credentials using environment variables. 🛡️

## npm Packages Used 📦
The following key npm packages are used on the server-side:

Express.js: Fast, unopinionated, minimalist web framework for Node.js. 🚀

Mongoose: MongoDB object modeling for Node.js. 🍃

jsonwebtoken: JSON Web Token implementation for Node.js for authentication. 🔑

dotenv: Loads environment variables from a .env file. 📜

cors: Enables Cross-Origin Resource Sharing. 🔗

nanoid: For hashing passwords. 🔒

stripe: For handling payment gateway integrations. 💳

## API Endpoints 🛣️
A detailed API documentation (e.g., using Postman collection or Swagger) would typically be provided here. For this README, a high-level overview of the major endpoint categories is given:

Authentication: /api/auth/register, /api/auth/login, /api/auth/googleLogin

Users: /api/users, /api/users/:id, /api/users/:id/role (Admin)

Products: /api/products, /api/products/:id, /api/products/vendor/:vendorId, /api/products/approve/:id (Admin), /api/products/reject/:id (Admin)

Advertisements: /api/advertisements, /api/advertisements/:id, /api/advertisements/vendor/:vendorId, /api/advertisements/status/:id (Admin)

Watchlist: /api/watchlist, /api/watchlist/:id

Orders: /api/orders, /api/orders/:id

Reviews: /api/reviews, /api/reviews/:productId

Price Trends: /api/price-trends/:productId