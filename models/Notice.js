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
    enum: ['all', 'students', 'teachers', 'parents'],
    default: 'all',
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

module.exports = mongoose.model('Notice', NoticeSchema);
