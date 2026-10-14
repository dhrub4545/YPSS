const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const {
  uploadAndParseQuestion,
  getCloudinarySignature,
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
  filename: (req, file, callback) => {
    let ext = path.extname(file.originalname || '').toLowerCase();
    if (!ext || ext === '.') {
      ext = file.mimetype === 'image/png' ? '.png' : file.mimetype === 'image/webp' ? '.webp' : '.jpg';
    }
    callback(null, `${file.fieldname}-${Date.now()}-${Math.random().toString(36).substring(2, 8)}${ext}`);
  },
});

const ALLOWED_IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const ALLOWED_IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp']);

const fileFilter = (req, file, callback) => {
  const ext = path.extname(file.originalname || '').toLowerCase();
  if (ALLOWED_IMAGE_MIMES.has(file.mimetype) && (ALLOWED_IMAGE_EXTS.has(ext) || !ext)) {
    return callback(null, true);
  }
  return callback(new Error('Only JPEG, PNG, and WebP images are accepted'), false);
};

const upload = multer({ storage, fileFilter, limits: { fileSize: 5 * 1024 * 1024 } });

const handleMulterUpload = (req, res, next) => {
  const contentType = req.headers['content-type'] || '';
  if (!contentType.includes('multipart/form-data')) {
    return next();
  }
  upload.fields([
    { name: 'photo', maxCount: 10 },
    { name: 'figures', maxCount: 10 },
  ])(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          success: false,
          message: 'One of the photos exceeds 5MB. Please upload compressed images or use direct cloud upload.',
        });
      }
      return res.status(400).json({
        success: false,
        message: err.message || 'Error uploading files',
      });
    }
    next();
  });
};

router.get('/cloud-sign', protect, authorize('principal', 'teacher'), getCloudinarySignature);
router.get('/', protect, authorize('principal', 'teacher'), getQuestionPapers);
router.get('/tracker', protect, authorize('principal', 'teacher'), getQuestionPaperTracker);
router.post(
  '/upload',
  protect,
  authorize('principal', 'teacher'),
  handleMulterUpload,
  uploadAndParseQuestion
);
router.post('/:id/retry', protect, authorize('principal', 'teacher'), retryQuestionPaper);
router.get('/:id/download/:format', protect, authorize('principal', 'teacher'), downloadQuestionPaper);
router.get('/:id', protect, authorize('principal', 'teacher'), getQuestionPaperDetails);
router.delete('/:id', protect, authorize('principal', 'teacher'), deleteQuestionPaper);

module.exports = router;
