const mongoose = require('mongoose');

const MarksSchema = new mongoose.Schema({
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
    required: true,
  },
  class: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Class',
    required: true,
  },
  subject: {
    type: String,
    required: true,
  },
  academicYear: {
    type: String,
    required: true,
  },
  terminal: {
    type: Number,
    required: true,
    enum: [1, 2, 3, 4], // 4 terminals in a year
  },
  marksObtained: {
    type: Number,
    required: true,
  },
  fullMarks: {
    type: Number,
    required: true,
    default: 100,
  },
  passMarks: {
    type: Number,
    required: true,
    default: 40,
  },
  percentage: {
    type: Number,
  },
  enteredBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Auto-calculate percentage before saving
MarksSchema.pre('save', function (next) {
  if (this.fullMarks > 0) {
    this.percentage = parseFloat(((this.marksObtained / this.fullMarks) * 100).toFixed(2));
  } else {
    this.percentage = 0;
  }
  next();
});

module.exports = mongoose.model('Marks', MarksSchema);
