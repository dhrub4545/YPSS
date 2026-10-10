const mongoose = require('mongoose');

const WalkieTalkieMessageSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['broadcast', 'direct'],
    required: true,
    default: 'broadcast',
  },
  senderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  senderName: {
    type: String,
    required: true,
  },
  senderRole: {
    type: String,
    enum: ['principal', 'teacher'],
    required: true,
  },
  recipientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  recipientName: {
    type: String,
    default: null,
  },
  audioUrl: {
    type: String,
    required: true,
  },
  duration: {
    type: Number,
    default: 0,
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 86400 * 3, // Auto-cleans after 3 days to maintain clean storage
  },
});

WalkieTalkieMessageSchema.index({ type: 1, createdAt: 1 });
WalkieTalkieMessageSchema.index({ recipientId: 1, createdAt: 1 });
WalkieTalkieMessageSchema.index({ senderId: 1, createdAt: 1 });

module.exports = mongoose.model('WalkieTalkieMessage', WalkieTalkieMessageSchema);
