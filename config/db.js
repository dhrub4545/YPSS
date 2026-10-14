const mongoose = require('mongoose');
const dns = require('dns');

// Configure reliable DNS servers (Google DNS & Cloudflare) to prevent querySrv ECONNREFUSED on Windows/ISP DNS
try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch (err) {
  console.warn('Warning: Could not set custom DNS servers:', err.message);
}

// Global connection cache for serverless environments (Vercel Lambdas)
let cached = global.mongoose;
if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

const connectDB = async () => {
  // If connection is already established and open, reuse it immediately
  if (cached.conn && mongoose.connection.readyState >= 1) {
    return cached.conn;
  }

  if (!cached.promise) {
    const connectionString = process.env.MONGO_URI || process.env.MONGO_DB_ATLAS;
    if (!connectionString) {
      throw new Error('FATAL: MONGO_URI is not defined in environment variables.');
    }

    const opts = {
      serverSelectionTimeoutMS: 15000,
      maxPoolSize: process.env.VERCEL ? 10 : 30,
      minPoolSize: 1,
      socketTimeoutMS: 45000,
    };

    cached.promise = (async () => {
      try {
        const conn = await mongoose.connect(connectionString, opts);
        console.log(`MongoDB Connected: ${conn.connection.host}`);
        return conn;
      } catch (error) {
        console.error(`Database connection error: ${error.message}`);
        // If SRV lookup failed (querySrv ECONNREFUSED) and direct URI is available in env, retry
        const directUri = process.env.MONGO_URI_DIRECT || process.env.MONGO_URI;
        if (directUri && directUri !== connectionString && (error.message.includes('querySrv') || error.message.includes('ECONNREFUSED') || error.code === 'ECONNREFUSED')) {
          try {
            console.log('Retrying with direct MongoDB Atlas replica set hosts from environment...');
            const conn = await mongoose.connect(directUri, opts);
            console.log(`MongoDB Connected (via direct replica set): ${conn.connection.host}`);
            return conn;
          } catch (directErr) {
            console.error(`Direct replica set connection also failed: ${directErr.message}`);
            throw directErr;
          }
        }
        throw error;
      }
    })();
  }

  try {
    cached.conn = await cached.promise;
  } catch (err) {
    cached.promise = null;
    throw err;
  }

  return cached.conn;
};

module.exports = connectDB;
