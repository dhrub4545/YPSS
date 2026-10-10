const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const {
  uploadAndParseQuestion,
  getQuestionPaperDetails,
  getQuestionPapers,
  downloadQuestionPaper,
  deleteQuestionPaper,
  getQuestionPaperTracker,
  retryQuestionPaper,
} = require('../controllers/questionController');
const { protect, authorize } = require('../middleware/auth');

const os = require('os');
const router = express.Router();

const uploadDirectory = process.env.VERCEL
  ? path.join(os.tmpdir(), 'ypss_uploads')
  : path.join(__dirname, '../uploads');

try {
  fs.mkdirSync(uploadDirectory, { recursive: true });
} catch (_) {}

const storage = multer.diskStorage({
  destination: (req, file, callback) => callback(null, uploadDirectory),
  filename: (req, file, callback) => callback(null, `${file.fieldname}-${Date.now()}${path.extname(file.originalname).toLowerCase()}`),
});

const fileFilter = (req, file, callback) => {
  const allowedExtensions = /jpeg|jpg|png|webp/;
  const hasAllowedExtension = allowedExtensions.test(path.extname(file.originalname).toLowerCase());
  const hasAllowedMimeType = allowedExtensions.test(file.mimetype);
  if (hasAllowedExtension && hasAllowedMimeType) {
    return callback(null, true);
  }
  return callback(new Error('Only JPEG, PNG, and WebP images are accepted'), false);
};

const upload = multer({ storage, fileFilter, limits: { fileSize: 5 * 1024 * 1024 } });

router.get('/', protect, authorize('principal', 'teacher'), getQuestionPapers);
router.get('/tracker', protect, authorize('principal', 'teacher'), getQuestionPaperTracker);
router.post(
  '/upload',
  protect,
  authorize('principal', 'teacher'),
  upload.fields([
    { name: 'photo', maxCount: 10 },
    { name: 'figures', maxCount: 10 },
  ]),
  uploadAndParseQuestion
);
router.post('/:id/retry', protect, authorize('principal', 'teacher'), retryQuestionPaper);
router.get('/:id/download/:format', protect, authorize('principal', 'teacher'), downloadQuestionPaper);
router.get('/:id', protect, authorize('principal', 'teacher'), getQuestionPaperDetails);
router.delete('/:id', protect, authorize('principal', 'teacher'), deleteQuestionPaper);

module.exports = router;
