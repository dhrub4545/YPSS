const mongoose = require('mongoose');

const ExamConfigSchema = new mongoose.Schema({
  class: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Class',
    required: true,
  },
  subject: {
    type: String,
    required: true,
  },
  terminal: {
    type: Number,
    required: true,
    enum: [1, 2, 3, 4],
  },
  academicYear: {
    type: String,
    required: true,
  },
  fullMarks: {
    type: Number,
    required: true,
  },
  passMarks: {
    type: Number,
    required: true,
  },
  configuredBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Ensure a class, subject, terminal, and year combination has unique configs
ExamConfigSchema.index({ class: 1, subject: 1, terminal: 1, academicYear: 1 }, { unique: true });

module.exports = mongoose.model('ExamConfig', ExamConfigSchema);
