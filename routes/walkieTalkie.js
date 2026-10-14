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

const ALLOWED_AUDIO_EXTS = new Set(['.m4a', '.mp3', '.wav', '.aac', '.ogg', '.webm']);

const audioFileFilter = (req, file, callback) => {
  const ext = path.extname(file.originalname || '').toLowerCase();
  if (file.mimetype.startsWith('audio/') || ALLOWED_AUDIO_EXTS.has(ext)) {
    return callback(null, true);
  }
  callback(new Error('Invalid audio file type. Only audio recordings are permitted.'));
};

const storage = multer.diskStorage({
  destination: (req, file, callback) => callback(null, uploadDirectory),
  filename: (req, file, callback) => {
    let ext = path.extname(file.originalname || '').toLowerCase();
    if (!ALLOWED_AUDIO_EXTS.has(ext)) {
      ext = '.m4a';
    }
    callback(null, `voice-${Date.now()}-${Math.random().toString(36).substring(2, 8)}${ext}`);
  },
});

const upload = multer({
  storage,
  fileFilter: audioFileFilter,
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
