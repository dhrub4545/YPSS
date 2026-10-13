const Notice = require('../models/Notice');
const nd = require('nepali-date-converter');
const NepaliDate = nd.default || nd;
const { notifyNoticePublished } = require('../utils/pushNotifier');

const getNotices = async (req, res) => {
  try {
    const user = req.user;
    let filter = {};

    if (user?.role === 'principal') {
      // Principal oversees all notices across the school
      filter = {};
    } else if (user?.role === 'student') {
      // Students see public notices and only their own private notices
      filter = {
        $or: [
          { audience: { $in: ['all', 'students'] } },
          { audience: 'individual', targetUsers: user._id },
        ],
      };
    } else if (user?.role === 'parent') {
      // Parents see public notices, plus private notices where they or their children are targeted
      const Student = require('../models/Student');
      const children = await Student.find({ parent: user._id }).select('_id');
      const childStudentIds = children.map((c) => c._id);

      filter = {
        $or: [
          { audience: { $in: ['all', 'parents'] } },
          { audience: 'individual', targetUsers: user._id },
          { audience: 'individual', targetStudent: { $in: childStudentIds } },
        ],
      };
    } else if (user?.role === 'teacher') {
      // Teachers see general and teacher-targeted notices
      filter = {
        audience: { $in: ['all', 'teachers'] },
      };
    } else {
      filter = { audience: 'all' };
    }

    const notices = await Notice.find(filter)
      .populate('postedBy', 'name role')
      .populate({
        path: 'targetStudent',
        select: 'rollNumber user class',
        populate: [
          { path: 'user', select: 'name' },
          { path: 'class', select: 'name' },
        ],
      })
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

    let dateBS = '';
    try {
      const today = new NepaliDate();
      dateBS = today.format('YYYY-MM-DD');
    } catch (e) {
      console.warn('[NoticeController] NepaliDate format error:', e.message);
      dateBS = new Date().toISOString().slice(0, 10);
    }

    const notice = await Notice.create({
      title: title.trim(),
      content: content.trim(),
      category: category || 'general',
      audience: audience || 'all',
      postedBy: req.user?._id,
      dateBS,
    });

    // Fire-and-forget push notification dispatch to target audience
    notifyNoticePublished({ notice, sender: req.user }).catch((err) => {
      console.warn('[NoticeController] Failed to dispatch notice push notification:', err.message);
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
