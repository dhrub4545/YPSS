const User = require('../models/User');
const Student = require('../models/Student');
const Class = require('../models/Class');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { uploadToCloud, deleteFromCloud, isCloudinaryConfigured } = require('../utils/cloudStorage');

const generateToken = (id) => jwt.sign(
  { id },
  process.env.JWT_SECRET,
  { expiresIn: '30d' }
);

const buildSessionData = async (user) => {
  const session = {
    _id: user._id,
    name: user.name,
    username: user.username,
    role: user.role,
    phone: user.phone,
    profilePicture: user.profilePicture || user.photo || '',
    photo: user.photo || user.profilePicture || '',
    languagePreference: user.languagePreference,
  };

  if (user.role === 'student') {
    const student = await Student.findOne({ user: user._id }).populate('class');
    if (student) {
      session.studentId = student._id;
      session.class = student.class?.name || '';
      session.classId = student.class?._id || '';
      session.rollNumber = student.rollNumber;
      session.academicYear = student.academicYear;
    }
  }

  if (user.role === 'parent') {
    const children = await Student.find({ parent: user._id })
      .populate({ path: 'user', select: 'name username' })
      .populate('class');
    session.students = children
      .filter((child) => child.user)
      .map((child) => ({
        studentId: child._id,
        userId: child.user._id,
        name: child.user.name,
        username: child.user.username,
        rollNumber: child.rollNumber,
        className: child.class?.name || '',
        classId: child.class?._id || '',
      }));
  }

  return session;
};

const registerUser = async (req, res) => {
  const name = req.body.name?.trim();
  const username = req.body.username?.trim();
  const email = req.body.email?.trim();
  const password = req.body.password;
  const role = req.body.role?.toLowerCase();
  const phone = req.body.phone?.trim();
  const languagePreference = req.body.languagePreference || 'en';

  if (!name || !username || !password || !role) {
    return res.status(400).json({ success: false, message: 'Name, username, password, and role are required' });
  }

  if (!['student', 'parent', 'teacher', 'principal'].includes(role)) {
    return res.status(400).json({ success: false, message: 'Invalid account role' });
  }

  if (!['student', 'parent'].includes(role) && process.env.ALLOW_PUBLIC_STAFF_REGISTRATION !== 'true') {
    return res.status(403).json({ success: false, message: 'Teacher and principal accounts must be created by a principal' });
  }

  try {
    const duplicateQuery = [{ username }];
    if (email) duplicateQuery.push({ email });
    const userExists = await User.findOne({ $or: duplicateQuery });
    if (userExists) {
      return res.status(400).json({ success: false, message: userExists.username === username ? 'Username already exists' : 'Email already in use' });
    }

    let classRecord = null;
    let parentUser = null;
    let studentUsers = [];

    if (role === 'student') {
      const { classId, rollNumber, academicYear, parentUsername } = req.body;
      if (!classId || !rollNumber || !academicYear) {
        return res.status(400).json({ success: false, message: 'Student registrations require class, roll number, and academic year' });
      }
      classRecord = await Class.findById(classId);
      if (!classRecord) {
        return res.status(400).json({ success: false, message: 'Selected class no longer exists' });
      }
      if (parentUsername?.trim()) {
        parentUser = await User.findOne({ username: parentUsername.trim(), role: 'parent' });
        if (!parentUser) {
          return res.status(400).json({ success: false, message: 'The parent username could not be found' });
        }
      }
    }

    if (role === 'parent' && Array.isArray(req.body.studentUsernames) && req.body.studentUsernames.length) {
      studentUsers = await User.find({ username: { $in: req.body.studentUsernames }, role: 'student' });
      if (!studentUsers.length) {
        return res.status(400).json({ success: false, message: 'No matching student usernames were found' });
      }
    }

    const user = await User.create({ name, username, email, password, role, phone, languagePreference });

    if (role === 'student') {
      await Student.create({
        user: user._id,
        class: classRecord._id,
        rollNumber: req.body.rollNumber.trim(),
        fatherName: req.body.fatherName?.trim() || '',
        academicYear: req.body.academicYear,
        parent: parentUser?._id,
      });
    }

    if (role === 'parent' && studentUsers.length) {
      await Student.updateMany({ user: { $in: studentUsers.map((student) => student._id) } }, { parent: user._id });
    }

    const session = await buildSessionData(user);
    return res.status(201).json({ success: true, data: { ...session, token: generateToken(user._id) } });
  } catch (error) {
    console.error('Registration Error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

const loginUser = async (req, res) => {
  const username = req.body.username?.trim();
  const password = req.body.password;

  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'Username and password are required' });
  }

  try {
    const user = await User.findOne({ $or: [{ username }, { email: username }] });
    if (!user || !(await user.matchPassword(password))) {
      return res.status(401).json({ success: false, message: 'Invalid username or password' });
    }

    const session = await buildSessionData(user);
    return res.json({ success: true, data: { ...session, token: generateToken(user._id) } });
  } catch (error) {
    console.error('Login Error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

const getUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    return res.json({ success: true, data: await buildSessionData(user) });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const updateLanguagePreference = async (req, res) => {
  const { language } = req.body;
  if (!['en', 'np'].includes(language)) {
    return res.status(400).json({ success: false, message: 'Invalid language code' });
  }

  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    user.languagePreference = language;
    await user.save();
    return res.json({ success: true, message: 'Language preference updated', language: user.languagePreference });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const updatePassword = async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ success: false, message: 'Current and new passwords are required' });
  }

  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const isMatch = await user.matchPassword(currentPassword);
    if (!isMatch) {
      return res.status(400).json({ success: false, message: 'Incorrect current password' });
    }

    user.password = newPassword;
    await user.save();
    return res.json({ success: true, message: 'Password updated successfully' });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const getProfileCloudinarySignature = async (req, res) => {
  try {
    if (!process.env.CLOUDINARY_API_SECRET || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_CLOUD_NAME) {
      return res.status(400).json({ success: false, message: 'Cloudinary storage is not configured' });
    }
    const timestamp = Math.floor(Date.now() / 1000);
    const folder = 'ypss_profiles';
    const cloudinary = require('cloudinary').v2;
    const signature = cloudinary.utils.api_sign_request(
      { timestamp, folder },
      process.env.CLOUDINARY_API_SECRET
    );
    return res.json({
      success: true,
      data: {
        timestamp,
        folder,
        signature,
        apiKey: process.env.CLOUDINARY_API_KEY,
        cloudName: process.env.CLOUDINARY_CLOUD_NAME,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

const updateProfilePicture = async (req, res) => {
  try {
    let photoUrl = req.body?.photoUrl;

    // 1. If file uploaded via multer
    if (req.file && req.file.path) {
      try {
        const cloudUrl = await uploadToCloud(req.file.path, 'ypss_profiles', { resource_type: 'image' });
        photoUrl = cloudUrl || `/uploads/${path.basename(req.file.path)}`;
      } catch (uploadErr) {
        console.warn('[ProfilePic] Multer upload to cloud error:', uploadErr.message);
        photoUrl = `/uploads/${path.basename(req.file.path)}`;
      }
      try {
        if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      } catch (_) {}
    }

    // 2. If sent as base64 string
    if (!photoUrl && (req.body?.image || req.body?.photoBase64)) {
      const base64Data = req.body.image || req.body.photoBase64;
      const formattedBase64 = base64Data.startsWith('data:')
        ? base64Data
        : `data:image/jpeg;base64,${base64Data}`;

      if (isCloudinaryConfigured()) {
        try {
          const cloudinary = require('cloudinary').v2;
          const cloudRes = await cloudinary.uploader.upload(formattedBase64, {
            folder: 'ypss_profiles',
            resource_type: 'image',
          });
          photoUrl = cloudRes.secure_url;
        } catch (cloudErr) {
          console.warn('[ProfilePic] Cloudinary base64 upload error:', cloudErr.message);
        }
      }

      if (!photoUrl) {
        // Fallback: save to uploads folder locally / os.tmpdir
        const uploadDir = process.env.VERCEL
          ? path.join(os.tmpdir(), 'ypss_uploads')
          : path.join(__dirname, '../uploads');
        fs.mkdirSync(uploadDir, { recursive: true });
        const fname = `profile_${Date.now()}_${Math.random().toString(36).substring(2, 6)}.jpg`;
        const fpath = path.join(uploadDir, fname);
        const dataOnly = formattedBase64.replace(/^data:image\/\w+;base64,/, '');
        fs.writeFileSync(fpath, Buffer.from(dataOnly, 'base64'));
        photoUrl = `/uploads/${fname}`;
      }
    }

    if (!photoUrl) {
      return res.status(400).json({ success: false, message: 'No photo provided or upload failed' });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Clean up previous Cloudinary photo if it belongs to our cloud
    if (user.profilePicture && user.profilePicture.includes('cloudinary.com') && user.profilePicture !== photoUrl) {
      deleteFromCloud(user.profilePicture).catch(() => {});
    }

    user.profilePicture = photoUrl;
    user.photo = photoUrl;
    await user.save();

    const session = await buildSessionData(user);
    return res.json({
      success: true,
      message: 'Profile picture updated successfully',
      data: session,
      profilePicture: photoUrl,
      photo: photoUrl,
    });
  } catch (error) {
    console.error('Update Profile Picture Error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  registerUser,
  loginUser,
  getUserProfile,
  updateLanguagePreference,
  updatePassword,
  getProfileCloudinarySignature,
  updateProfilePicture,
};
