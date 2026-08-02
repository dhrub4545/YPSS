const mongoose = require('mongoose');

const AcademicYearSchema = new mongoose.Schema({
  year: {
    type: String,
    required: true,
    unique: true,
    trim: true,
  },
  label: {
    type: String,
    required: true,
    trim: true,
  },
  isActive: {
    type: Boolean,
    default: false,
  },
  isLocked: {
    type: Boolean,
    default: false,
  },
  startDate: {
    type: String, // BS format YYYY-MM-DD
  },
  endDate: {
    type: String, // BS format YYYY-MM-DD
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('AcademicYear', AcademicYearSchema);
