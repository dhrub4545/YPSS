const mongoose = require('mongoose');

const AttendanceRecordSchema = new mongoose.Schema({
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
    required: true,
  },
  status: {
    type: String,
    enum: ['present', 'absent'],
    default: 'present',
  },
  remarks: {
    type: String,
    trim: true,
  },
});

const AttendanceSchema = new mongoose.Schema({
  class: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Class',
    required: true,
  },
  date: {
    type: String, // YYYY-MM-DD
    required: true,
  },
  dateBs: {
    type: String, // YYYY-MM-DD BS
  },
  takenBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  records: [AttendanceRecordSchema],
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

AttendanceSchema.index({ class: 1, date: 1 }, { unique: true });
AttendanceSchema.index({ 'records.student': 1, date: 1 });

module.exports = mongoose.model('Attendance', AttendanceSchema);
