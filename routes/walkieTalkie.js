const express = require('express');
const multer = require('multer');
const path = require('path');
const os = require('os');
const fs = require('fs');
const {
  getConfig,
  updateConfig,
  getContacts,
  sendMessage,
  getFeed,
} = require('../controllers/walkieTalkieController');
const { protect, authorize } = require('../middleware/auth');

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
      ext = '.m4a';
    }
    callback(null, `voice-${Date.now()}-${Math.random().toString(36).substring(2, 8)}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit for audio clips
});

const handleAudioUpload = (req, res, next) => {
  const contentType = req.headers['content-type'] || '';
  if (!contentType.includes('multipart/form-data')) {
    return next();
  }
  upload.single('audio')(req, res, (err) => {
    if (err) {
      return res.status(400).json({ success: false, message: err.message });
    }
    next();
  });
};

router.use(protect);
router.use(authorize('principal', 'teacher'));

router.get('/config', getConfig);
router.put('/config', authorize('principal'), updateConfig);
router.get('/contacts', getContacts);
router.post('/send', handleAudioUpload, sendMessage);
router.get('/feed', getFeed);

module.exports = router;
