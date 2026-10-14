const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const os = require('os');
const fs = require('fs');
const {
  registerUser,
  loginUser,
  getUserProfile,
  updateLanguagePreference,
  updatePassword,
  getProfileCloudinarySignature,
  updateProfilePicture,
} = require('../controllers/authController');
const { protect } = require('../middleware/auth');

const uploadDirectory = process.env.VERCEL
  ? path.join(os.tmpdir(), 'ypss_uploads')
  : path.join(__dirname, '../uploads');

try {
  fs.mkdirSync(uploadDirectory, { recursive: true });
} catch (_) {}

const ALLOWED_IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const ALLOWED_IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp']);

const imageFileFilter = (req, file, callback) => {
  const ext = path.extname(file.originalname || '').toLowerCase();
  if (ALLOWED_IMAGE_MIMES.has(file.mimetype) && (ALLOWED_IMAGE_EXTS.has(ext) || !ext)) {
    return callback(null, true);
  }
  callback(new Error('Invalid image file type. Only JPG, PNG, and WebP are allowed.'));
};

const storage = multer.diskStorage({
  destination: (req, file, callback) => callback(null, uploadDirectory),
  filename: (req, file, callback) => {
    let ext = path.extname(file.originalname || '').toLowerCase();
    if (!ALLOWED_IMAGE_EXTS.has(ext)) {
      ext = file.mimetype === 'image/png' ? '.png' : file.mimetype === 'image/webp' ? '.webp' : '.jpg';
    }
    callback(null, `profile-${Date.now()}-${Math.random().toString(36).substring(2, 8)}${ext}`);
  },
});

const upload = multer({
  storage,
  fileFilter: imageFileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

const handleProfileUpload = (req, res, next) => {
  const contentType = req.headers['content-type'] || '';
  if (!contentType.includes('multipart/form-data')) {
    return next();
  }
  upload.single('photo')(req, res, (err) => {
    if (err) {
      return res.status(400).json({ success: false, message: err.message });
    }
    next();
  });
};

router.post('/register', registerUser);
router.post('/login', loginUser);
router.get('/profile', protect, getUserProfile);
router.put('/language', protect, updateLanguagePreference);
router.put('/password', protect, updatePassword);
router.get('/cloud-sign', protect, getProfileCloudinarySignature);
router.post('/profile-picture', protect, handleProfileUpload, updateProfilePicture);
router.put('/profile-picture', protect, handleProfileUpload, updateProfilePicture);

module.exports = router;
