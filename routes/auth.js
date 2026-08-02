const express = require('express');
const router = express.Router();
const {
  registerUser,
  loginUser,
  getUserProfile,
  updateLanguagePreference,
  updatePassword,
} = require('../controllers/authController');
const { protect } = require('../middleware/auth');

router.post('/register', registerUser);
router.post('/login', loginUser);
router.get('/profile', protect, getUserProfile);
router.put('/language', protect, updateLanguagePreference);
router.put('/password', protect, updatePassword);

module.exports = router;
