const mongoose = require('mongoose');

const FeeSchema = new mongoose.Schema({
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
    required: true,
  },
  academicYear: {
    type: String,
    required: true,
  },
  feeType: {
    type: String,
    required: true,
    enum: ['tuition', 'bus', 'exam', 'admission', 'uniform', 'other'],
  },
  amountDue: {
    type: Number,
    required: true,
  },
  amountPaid: {
    type: Number,
    required: true,
    default: 0,
  },
  dueDate: {
    type: Date,
  },
  transactions: [
    {
      amount: {
        type: Number,
        required: true,
      },
      date: {
        type: Date,
        default: Date.now,
      },
      paymentMethod: {
        type: String,
        default: 'cash',
      },
      receiptNo: {
        type: String,
      },
    },
  ],
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Virtual for remaining balance
FeeSchema.virtual('remainingBalance').get(function () {
  return this.amountDue - this.amountPaid;
});

// Virtual for payment status
FeeSchema.virtual('status').get(function () {
  if (this.amountPaid >= this.amountDue) return 'paid';
  if (this.amountPaid > 0) return 'partial';
  return 'unpaid';
});

// Configure schemas to output virtuals
FeeSchema.set('toJSON', { virtuals: true });
FeeSchema.set('toObject', { virtuals: true });

FeeSchema.index({ student: 1, academicYear: 1 });
FeeSchema.index({ 'transactions.receiptNo': 1 });
FeeSchema.index({ academicYear: 1, feeType: 1 });

module.exports = mongoose.model('Fee', FeeSchema);
