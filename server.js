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
const allowedOrigins = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',') 
  : ['http://localhost:3000', 'http://localhost:8082', 'http://127.0.0.1:8082'];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || process.env.NODE_ENV !== 'production') {
      return callback(null, true);
    }
    if (allowedOrigins.indexOf(origin) !== -1 || allowedOrigins.includes('*')) {
      return callback(null, true);
    }
    return callback(new Error('Blocked by CORS'));
  }
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploaded files statically
const path = require('path');
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

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

app.listen(PORT, () => {
  console.log(`Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
  try {
    const { startMonthlyFeeScheduler } = require('./utils/monthlyFeeScheduler');
    startMonthlyFeeScheduler();
  } catch (e) {
    console.error('Failed to start monthly fee scheduler:', e.message);
  }
});
