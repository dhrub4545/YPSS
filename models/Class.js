const mongoose = require('mongoose');

const ClassSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true,
  },
  subjects: [
    {
      name: {
        type: String,
        required: true,
      },
      teacher: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    },
  ],
  classTeacher: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  academicYear: {
    type: String,
    required: true,
    default: '2083',
  },
  monthlyFee: {
    type: Number,
    default: 0,
    min: 0,
  },
  additionalFees: [
    {
      title: {
        type: String,
        required: true,
        trim: true,
      },
      amount: {
        type: Number,
        required: true,
        min: 0,
      },
      month: {
        type: String,
        required: true,
        default: 'Baishakh',
      },
    },
  ],
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('Class', ClassSchema);
