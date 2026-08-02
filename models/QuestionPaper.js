const mongoose = require('mongoose');

const QuestionPaperSchema = new mongoose.Schema({
  title: {
    type: String,
  },
  class: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Class',
    required: true,
  },
  subject: {
    type: String,
    required: true,
  },
  examTerm: {
    type: Number,
    required: true,
    enum: [1, 2, 3, 4],
  },
  language: {
    type: String,
    enum: ['english', 'nepali'],
    default: 'english',
  },
  year: {
    type: String,
    default: '2081 B.S.',
  },
  time: {
    type: String,
    default: '3',
  },
  fullMarks: {
    type: Number,
    default: 100,
  },
  passMarks: {
    type: Number,
    default: 40,
  },
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  handwrittenImage: {
    type: String,
    required: true,
  },
  handwrittenImages: [String],
  figures: [
    {
      questionNumber: String,
      mode: {
        type: String,
        default: 'auto',
      },
      originalImagePath: String,
      originalImageUrl: String,
      generatedImagePath: String,
      generatedImageUrl: String,
    },
  ],
  parsedContent: {
    type: mongoose.Schema.Types.Mixed, // structured questions, sections, marks
  },
  pdfPath: {
    type: String,
  },
  docxPath: {
    type: String,
  },
  pdfUrl: {
    type: String,
  },
  docxUrl: {
    type: String,
  },
  handwrittenImageUrl: {
    type: String,
  },
  handwrittenImageUrls: [String],
  status: {
    type: String,
    enum: ['processing', 'completed', 'failed'],
    default: 'processing',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('QuestionPaper', QuestionPaperSchema);
