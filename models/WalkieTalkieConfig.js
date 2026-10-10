const mongoose = require('mongoose');

const WalkieTalkieConfigSchema = new mongoose.Schema({
  isEnabled: {
    type: Boolean,
    default: true,
  },
  allowedBroadcastTeacherIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  }],
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('WalkieTalkieConfig', WalkieTalkieConfigSchema);
