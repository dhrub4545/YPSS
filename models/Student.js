const mongoose = require('mongoose');

const StudentSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  class: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Class',
    required: true,
  },
  rollNumber: {
    type: String,
    required: true,
  },
  fatherName: {
    type: String,
    trim: true,
  },
  parent: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User', // Ref to parent user
  },
  academicYear: {
    type: String,
    required: true,
  },
  previousYearArrears: {
    type: Number,
    default: 0,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

StudentSchema.index({ user: 1 }, { unique: true });
StudentSchema.index({ class: 1, academicYear: 1 });
StudentSchema.index({ class: 1, rollNumber: 1, academicYear: 1 });
StudentSchema.index({ parent: 1 });

module.exports = mongoose.model('Student', StudentSchema);
