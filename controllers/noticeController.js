const Notice = require('../models/Notice');
const NepaliDate = require('nepali-date-converter');

const getNotices = async (req, res) => {
  try {
    const notices = await Notice.find()
      .populate('postedBy', 'name role')
      .sort({ createdAt: -1 });
    return res.json({ success: true, notices });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const createNotice = async (req, res) => {
  try {
    if (req.user?.role !== 'principal') {
      return res.status(403).json({ success: false, message: 'Only the Principal can create school notices.' });
    }

    const { title, content, category, audience } = req.body;
    if (!title || !content) {
      return res.status(400).json({ success: false, message: 'Title and Content are required.' });
    }

    let dateBS = '2083-01-15';
    try {
      dateBS = new NepaliDate().format('YYYY-MM-DD');
    } catch (e) {}

    const notice = await Notice.create({
      title,
      content,
      category: category || 'general',
      audience: audience || 'all',
      postedBy: req.user?._id,
      dateBS,
    });

    return res.status(201).json({
      success: true,
      message: 'Notice published successfully!',
      notice,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  getNotices,
  createNotice,
};
