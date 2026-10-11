require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db');

// Enforce JWT_SECRET configuration
if (!process.env.JWT_SECRET) {
  console.error('FATAL ERROR: JWT_SECRET environment variable is not defined.');
  process.exit(1);
}

// Connect to database
connectDB();

const app = express();

// Middleware
const defaultAllowedOrigins = [
  'http://localhost:3000',
  'http://localhost:8080',
  'http://localhost:8081',
  'http://localhost:8082',
  'http://127.0.0.1:8080',
  'http://127.0.0.1:8081',
  'http://127.0.0.1:8082',
  'http://localhost:19006',
];

const allowedOrigins = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',').map((s) => s.trim()) 
  : defaultAllowedOrigins;

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, server-to-server, curl)
    if (!origin) return callback(null, true);

    // Allow all local development and LAN origins (localhost, 127.0.0.1, 192.168.x.x, 10.x.x.x) on any port
    if (/^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+)(:\d+)?$/.test(origin)) {
      return callback(null, true);
    }

    if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    // Return null, false for disallowed origins instead of throwing 500
    return callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
}));
app.options('*', cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Database connection readiness middleware for stateless/serverless requests
app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (dbErr) {
    console.error('Database connection failed for request:', dbErr.message);
    res.status(503).json({
      success: false,
      message: 'Database is currently connecting or unavailable. Please retry in a moment.',
    });
  }
});

// Serve uploaded files statically (fallback to os.tmpdir when in serverless)
const path = require('path');
const os = require('os');
const uploadsStaticDir = process.env.VERCEL
  ? path.join(os.tmpdir(), 'ypss_uploads')
  : path.join(__dirname, 'uploads');
app.use('/uploads', express.static(uploadsStaticDir));

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/classes', require('./routes/class'));
app.use('/api/users', require('./routes/users'));
app.use('/api/marks', require('./routes/marks'));
app.use('/api/fees', require('./routes/fee'));
app.use('/api/questions', require('./routes/question'));
app.use('/api/attendance', require('./routes/attendanceRoutes'));
app.use('/api/academic-years', require('./routes/academicYear'));
app.use('/api/notices', require('./routes/noticeRoutes'));
app.use('/api/walkie-talkie', require('./routes/walkieTalkie'));

// Basic route
app.get('/', (req, res) => {
  res.send('YPSS School Management System Backend API is running...');
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    message: err.message || 'Internal Server Error',
  });
});

const PORT = process.env.PORT || 5000;

if (require.main === module && !process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
    try {
      const { startMonthlyFeeScheduler } = require('./utils/monthlyFeeScheduler');
      startMonthlyFeeScheduler();
    } catch (e) {
      console.error('Failed to start monthly fee scheduler:', e.message);
    }
  });
}

module.exports = app;
