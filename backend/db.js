const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config();

// MONGODB_URI will fallback to local if not provided
const MONGO_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/digital_twin';

const connectDB = async () => {
    try {
        const conn = await mongoose.connect(MONGO_URI);
        console.log(`MongoDB Connected: ${conn.connection.host}`);
    } catch (error) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
    }
};

module.exports = connectDB;
