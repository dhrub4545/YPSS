const mongoose = require('mongoose');
const dns = require('dns');

// Configure reliable DNS servers (Google DNS & Cloudflare) to prevent querySrv ECONNREFUSED on Windows/ISP DNS
try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch (err) {
  console.warn('Warning: Could not set custom DNS servers:', err.message);
}

// Direct replica set connection string for Cluster0 that bypasses flaky Windows DNS SRV queries
const DIRECT_REPLICA_URI = 'mongodb://panditdhrub0_db_user:bmHYqQBIqYP7pwaI@ac-luhjmom-shard-00-00.ipqtphp.mongodb.net:27017,ac-luhjmom-shard-00-01.ipqtphp.mongodb.net:27017,ac-luhjmom-shard-00-02.ipqtphp.mongodb.net:27017/test?ssl=true&replicaSet=atlas-nrgb8e-shard-0&authSource=admin';

/**
 * Global connection cache for serverless environments (Vercel Lambdas).
 * Preserves the active Mongoose connection across warm invocations.
 */
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
    const connectionString = process.env.MONGO_URI || process.env.MONGO_DB_ATLAS || DIRECT_REPLICA_URI;
    const opts = {
      serverSelectionTimeoutMS: 15000,
    };

    cached.promise = (async () => {
      try {
        const conn = await mongoose.connect(connectionString, opts);
        console.log(`MongoDB Connected: ${conn.connection.host}`);
        return conn;
      } catch (error) {
        console.error(`Database connection error: ${error.message}`);
        // If SRV lookup failed (querySrv ECONNREFUSED), automatically retry with direct replica set hosts
        if (error.message.includes('querySrv') || error.message.includes('ECONNREFUSED') || error.code === 'ECONNREFUSED') {
          try {
            console.log('Retrying with direct MongoDB Atlas replica set hosts...');
            const conn = await mongoose.connect(DIRECT_REPLICA_URI, opts);
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
