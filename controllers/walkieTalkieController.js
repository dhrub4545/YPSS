const path = require('path');
const fs = require('fs');
const os = require('os');
const cloudinary = require('cloudinary').v2;
const WalkieTalkieConfig = require('../models/WalkieTalkieConfig');
const WalkieTalkieMessage = require('../models/WalkieTalkieMessage');
const User = require('../models/User');
const { uploadToCloud, isCloudinaryConfigured } = require('../utils/cloudStorage');
const { notifyWalkieTalkieDispatch } = require('../utils/pushNotifier');

const getOrCreateConfig = async () => {
  let config = await WalkieTalkieConfig.findOne();
  if (!config) {
    config = await WalkieTalkieConfig.create({
      isEnabled: true,
      allowedBroadcastTeacherIds: [],
    });
  }
  return config;
};

// @desc    Get walkie-talkie status and current user permissions
// @route   GET /api/walkie-talkie/config
// @access  Private (Principal, Teacher)
exports.getConfig = async (req, res) => {
  try {
    const config = await getOrCreateConfig();
    const isPrincipal = req.user.role === 'principal';
    const isAllowedTeacher = (config.allowedBroadcastTeacherIds || []).some(
      (id) => id.toString() === req.user._id.toString()
    );

    res.json({
      success: true,
      data: {
        isEnabled: config.isEnabled,
        canBroadcast: isPrincipal || isAllowedTeacher,
        isPrincipal,
        allowedBroadcastTeacherIds: config.allowedBroadcastTeacherIds || [],
      },
    });
  } catch (err) {
    console.error('[WalkieTalkie] getConfig error:', err.message);
    res.status(500).json({ success: false, message: 'Server error reading walkie-talkie config' });
  }
};

// @desc    Update walkie-talkie enabled state and broadcast permissions
// @route   PUT /api/walkie-talkie/config
// @access  Private (Principal only)
exports.updateConfig = async (req, res) => {
  try {
    if (req.user.role !== 'principal') {
      return res.status(403).json({
        success: false,
        message: 'Only the Principal can change walkie-talkie controls.',
      });
    }

    const { isEnabled, allowedBroadcastTeacherIds } = req.body;
    let config = await getOrCreateConfig();

    if (typeof isEnabled === 'boolean') {
      config.isEnabled = isEnabled;
    }
    if (Array.isArray(allowedBroadcastTeacherIds)) {
      config.allowedBroadcastTeacherIds = allowedBroadcastTeacherIds;
    }

    config.updatedBy = req.user._id;
    config.updatedAt = new Date();
    await config.save();

    console.log(`[WalkieTalkie] Config updated by Principal: isEnabled=${config.isEnabled}, broadcastTeachers=${config.allowedBroadcastTeacherIds.length}`);

    res.json({
      success: true,
      data: {
        isEnabled: config.isEnabled,
        canBroadcast: true,
        allowedBroadcastTeacherIds: config.allowedBroadcastTeacherIds,
      },
    });
  } catch (err) {
    console.error('[WalkieTalkie] updateConfig error:', err.message);
    res.status(500).json({ success: false, message: 'Server error updating walkie-talkie config' });
  }
};

// @desc    Get contacts list for 1-on-1 walkie-talkie
// @route   GET /api/walkie-talkie/contacts
// @access  Private (Principal, Teacher)
exports.getContacts = async (req, res) => {
  try {
    const config = await getOrCreateConfig();
    const allowedBroadcastSet = new Set(
      (config.allowedBroadcastTeacherIds || []).map((id) => id.toString())
    );

    const users = await User.find({
      _id: { $ne: req.user._id },
      role: { $in: ['principal', 'teacher'] },
    })
      .select('name role username phone profilePicture photo avatar profilePhoto image')
      .sort({ role: 1, name: 1 })
      .lean();

    const formatted = users.map((u) => ({
      _id: u._id,
      name: u.name,
      username: u.username,
      role: u.role,
      phone: u.phone,
      photo: u.profilePicture || u.photo || u.avatar || u.profilePhoto || u.image || null,
      canBroadcast: u.role === 'principal' || allowedBroadcastSet.has(u._id.toString()),
    }));

    res.json({
      success: true,
      data: formatted,
    });
  } catch (err) {
    console.error('[WalkieTalkie] getContacts error:', err.message);
    res.status(500).json({ success: false, message: 'Server error fetching contacts' });
  }
};

// @desc    Send a voice dispatch (broadcast or 1-on-1 direct)
// @route   POST /api/walkie-talkie/send
// @access  Private (Principal, Teacher)
exports.sendMessage = async (req, res) => {
  try {
    const config = await getOrCreateConfig();
    const isPrincipal = req.user.role === 'principal';

    // 1. Verify system is enabled
    if (!config.isEnabled && !isPrincipal) {
      return res.status(403).json({
        success: false,
        message: 'Walkie-Talkie is currently turned off by the Principal for off-hours.',
      });
    }

    const { type = 'broadcast', recipientId, duration = 0 } = req.body;

    // 2. Verify broadcast permission
    if (type === 'broadcast') {
      const isAllowed = isPrincipal || (config.allowedBroadcastTeacherIds || []).some(
        (id) => id.toString() === req.user._id.toString()
      );
      if (!isAllowed) {
        return res.status(403).json({
          success: false,
          message: 'You do not have permission to broadcast to all teachers. Ask the Principal for broadcast access.',
        });
      }
    }

    // 3. Resolve recipient for 1-on-1 direct
    let recipientName = null;
    let targetRecipientId = null;
    if (type === 'direct') {
      if (!recipientId) {
        return res.status(400).json({ success: false, message: 'recipientId is required for 1-on-1 direct walkie-talkie' });
      }
      const recipientUser = await User.findById(recipientId).select('name');
      if (!recipientUser) {
        return res.status(404).json({ success: false, message: 'Recipient not found' });
      }
      recipientName = recipientUser.name;
      targetRecipientId = recipientUser._id;
    }

    // 4. Resolve audio URL
    let audioUrl = req.body.audioUrl;

    // If file uploaded via multer
    if (req.file && req.file.path) {
      try {
        const cloudUrl = await uploadToCloud(req.file.path, 'ypss_walkie_talkie', { resource_type: 'video' });
        audioUrl = cloudUrl || `/uploads/${path.basename(req.file.path)}`;
      } catch (uploadErr) {
        console.warn('[WalkieTalkie] Cloudinary upload fallback:', uploadErr.message);
        audioUrl = `/uploads/${path.basename(req.file.path)}`;
      }
    }

    // If sent as base64 string
    if (!audioUrl && req.body.audioBase64) {
      try {
        let base64Payload = req.body.audioBase64;
        let ext = '.m4a';
        if (base64Payload.startsWith('data:')) {
          const match = base64Payload.match(/^data:([a-zA-Z0-9/]+);base64,/);
          if (match && match[1]) {
            const mime = match[1].toLowerCase();
            if (mime.includes('webm')) ext = '.webm';
            else if (mime.includes('3gp')) ext = '.3gp';
            else if (mime.includes('wav')) ext = '.wav';
            else if (mime.includes('mp4') || mime.includes('m4a')) ext = '.m4a';
          }
        } else {
          base64Payload = `data:audio/m4a;base64,${base64Payload}`;
        }

        if (isCloudinaryConfigured()) {
          try {
            const cloudRes = await cloudinary.uploader.upload(base64Payload, {
              folder: 'ypss_walkie_talkie',
              resource_type: 'video',
            });
            audioUrl = cloudRes.secure_url;
          } catch (cloudErr) {
            console.warn('[WalkieTalkie] Cloudinary base64 upload failed, falling back to local storage:', cloudErr.message);
          }
        }

        if (!audioUrl) {
          // Save locally if Cloudinary not available or failed
          const uploadDir = process.env.VERCEL
            ? path.join(os.tmpdir(), 'ypss_uploads')
            : path.join(__dirname, '../uploads');
          fs.mkdirSync(uploadDir, { recursive: true });
          const fname = `voice_${Date.now()}_${Math.random().toString(36).substring(2, 6)}${ext}`;
          const filePath = path.join(uploadDir, fname);
          const rawBase64 = base64Payload.replace(/^data:[^;]+;base64,/, '');
          fs.writeFileSync(filePath, Buffer.from(rawBase64, 'base64'));
          audioUrl = `/uploads/${fname}`;
        }
      } catch (b64Err) {
        console.error('[WalkieTalkie] Base64 processing failed:', b64Err.message);
        return res.status(500).json({ success: false, message: 'Failed to process voice audio data' });
      }
    }

    if (!audioUrl) {
      return res.status(400).json({ success: false, message: 'Audio voice data is required' });
    }

    // 5. Create WalkieTalkieMessage
    const message = await WalkieTalkieMessage.create({
      type,
      senderId: req.user._id,
      senderName: req.user.name,
      senderRole: req.user.role,
      recipientId: targetRecipientId,
      recipientName,
      audioUrl,
      duration: Number(duration) || 0,
      createdAt: new Date(),
    });

    console.log(`[WalkieTalkie] Voice dispatch created: type=${type}, sender=${req.user.name} (${req.user.role}), duration=${duration}s`);

    // Wake up locked or backgrounded phones via High-Priority Expo Push Notification
    notifyWalkieTalkieDispatch({
      sender: req.user,
      type,
      recipientId: targetRecipientId,
      duration: Number(duration) || 0,
      audioUrl: message.audioUrl,
      messageId: message._id,
    }).catch((pushErr) => console.warn('[WalkieTalkie] Background push notification error:', pushErr.message));

    res.status(201).json({
      success: true,
      data: message,
    });
  } catch (err) {
    console.error('[WalkieTalkie] sendMessage error:', err.message);
    res.status(500).json({ success: false, message: 'Server error sending voice dispatch' });
  }
};

// @desc    Get recent voice dispatches (feed / real-time polling)
// @route   GET /api/walkie-talkie/feed
// @access  Private (Principal, Teacher)
exports.getFeed = async (req, res) => {
  try {
    const { since, contactId, limit = 50 } = req.query;
    const query = {};

    if (since) {
      const sinceDate = new Date(since);
      if (!isNaN(sinceDate.getTime())) {
        query.createdAt = { $gt: sinceDate };
      }
    }

    if (contactId) {
      // Direct 1-on-1 thread between current user and contactId
      query.$or = [
        { type: 'direct', senderId: req.user._id, recipientId: contactId },
        { type: 'direct', senderId: contactId, recipientId: req.user._id },
      ];
    } else {
      // Full inbox: all broadcasts + 1-on-1 where current user is sender or recipient
      query.$or = [
        { type: 'broadcast' },
        { type: 'direct', recipientId: req.user._id },
        { type: 'direct', senderId: req.user._id },
      ];
    }

    let messages;
    if (since) {
      messages = await WalkieTalkieMessage.find(query)
        .sort({ createdAt: 1 })
        .limit(Number(limit))
        .lean();
    } else {
      messages = await WalkieTalkieMessage.find(query)
        .sort({ createdAt: -1 })
        .limit(Number(limit))
        .lean();
      messages.reverse();
    }

    res.json({
      success: true,
      data: messages,
    });
  } catch (err) {
    console.error('[WalkieTalkie] getFeed error:', err.message);
    res.status(500).json({ success: false, message: 'Server error fetching voice messages' });
  }
};
