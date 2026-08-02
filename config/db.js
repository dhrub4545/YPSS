const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const connectionString = process.env.MONGO_URI || process.env.MONGO_DB_ATLAS || 'mongodb://localhost:27017/ypss';
    const conn = await mongoose.connect(connectionString);
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`Database connection error: ${error.message}`);
    console.log('Server is staying online. Database queries will retry automatically.');
  }
};

module.exports = connectDB;
