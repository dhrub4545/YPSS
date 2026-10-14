const mongoose = require('mongoose');

const NoticeSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
  },
  content: {
    type: String,
    required: true,
  },
  category: {
    type: String,
    enum: ['general', 'exam', 'holiday', 'fee', 'urgent'],
    default: 'general',
  },
  audience: {
    type: String,
    enum: ['all', 'students', 'teachers', 'parents', 'individual'],
    default: 'all',
  },
  targetUsers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  }],
  targetStudent: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
  },
  postedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  dateBS: {
    type: String,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

NoticeSchema.index({ audience: 1, createdAt: -1 });
NoticeSchema.index({ targetUsers: 1, createdAt: -1 });
NoticeSchema.index({ targetStudent: 1, createdAt: -1 });

module.exports = mongoose.model('Notice', NoticeSchema);
