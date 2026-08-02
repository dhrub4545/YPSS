const express = require('express');
const router = express.Router();
const { getNotices, createNotice } = require('../controllers/noticeController');
const { protect } = require('../middleware/auth');

router.get('/', protect, getNotices);
router.post('/', protect, createNotice);

module.exports = router;
