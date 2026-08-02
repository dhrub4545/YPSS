const mongoose = require('mongoose');

const MarksCardSchema = new mongoose.Schema({
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
  terminal: {
    type: Number,
    required: true,
    enum: [1, 2, 3, 4],
  },
  academicYear: {
    type: String,
    required: true,
  },
  pdfUrl: {
    type: String,
    required: true,
  },
  docxUrl: {
    type: String,
    required: true,
  },
  studentName: {
    type: String,
  },
  rollNumber: {
    type: String,
  },
  className: {
    type: String,
  },
  totalFullMarks: {
    type: Number,
    default: 0,
  },
  totalObtainedMarks: {
    type: Number,
    default: 0,
  },
  percentage: {
    type: String,
  },
  grade: {
    type: String,
  },
  remarks: {
    type: String,
  },
  isPublished: {
    type: Boolean,
    default: false,
  },
  publishedAt: {
    type: Date,
  },
  publishedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

MarksCardSchema.index({ student: 1, class: 1, terminal: 1, academicYear: 1 }, { unique: true });

module.exports = mongoose.model('MarksCard', MarksCardSchema);
