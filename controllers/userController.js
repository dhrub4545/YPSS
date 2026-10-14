const User = require('../models/User');
const Student = require('../models/Student');
const Class = require('../models/Class');

const getTeachers = async (req, res) => {
  try {
    const teachers = await User.find({ role: 'teacher' }).select('-password').sort({ name: 1 }).lean();
    return res.json({ success: true, data: teachers });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const getParents = async (req, res) => {
  try {
    const parents = await User.find({ role: 'parent' }).select('-password').sort({ name: 1 }).lean();
    const populatedParents = await Promise.all(parents.map(async (parent) => {
      const children = await Student.find({ parent: parent._id }).populate({ path: 'user', select: 'username name profilePicture photo' }).lean();
      return {
        ...parent,
        studentUsernames: children.map(child => child.user?.username).filter(Boolean)
      };
    }));
    return res.json({ success: true, data: populatedParents });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const getStudents = async (req, res) => {
  try {
    const students = await Student.find()
      .populate({ path: 'user', select: '-password' })
      .populate('class')
      .populate({ path: 'parent', select: 'name username profilePicture photo' })
      .sort({ createdAt: -1 })
      .lean();
    return res.json({ success: true, data: students });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const createManagedUser = async (req, res) => {
  const name = req.body.name?.trim();
  const username = req.body.username?.trim();
  const password = req.body.password;
  const email = req.body.email?.trim();
  const phone = req.body.phone?.trim();
  const role = req.body.role?.toLowerCase();
  let dateOfJoining = req.body.dateOfJoining;

  if (role === 'teacher' && (!dateOfJoining || dateOfJoining === 'null')) {
    dateOfJoining = new Date();
  }

  if (!name || !username || !password || !role) {
    return res.status(400).json({ success: false, message: 'Name, username, password, and role are required' });
  }
  if (!['teacher', 'student', 'parent'].includes(role)) {
    return res.status(400).json({ success: false, message: 'Principal accounts cannot be created from this workspace' });
  }

  try {
    const duplicateQuery = [{ username }];
    if (email) duplicateQuery.push({ email });
    const existing = await User.findOne({ $or: duplicateQuery });
    if (existing) {
      return res.status(400).json({ success: false, message: existing.username === username ? 'Username already exists' : 'Email already in use' });
    }

    let classRecord = null;
    let parent = null;
    let studentUsers = [];
    if (role === 'student') {
      if (!req.body.classId || !req.body.rollNumber?.trim() || !req.body.academicYear) {
        return res.status(400).json({ success: false, message: 'Student accounts require class, roll number, and academic year' });
      }
      classRecord = await Class.findById(req.body.classId);
      if (!classRecord) {
        return res.status(400).json({ success: false, message: 'Selected class does not exist' });
      }
      if (req.body.parentUsername?.trim()) {
        parent = await User.findOne({ username: req.body.parentUsername.trim(), role: 'parent' });
        if (!parent) {
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

    const user = await User.create({ name, username, password, email, phone, role, dateOfJoining });
    if (role === 'student') {
      await Student.create({
        user: user._id,
        class: classRecord._id,
        rollNumber: req.body.rollNumber.trim(),
        fatherName: req.body.fatherName?.trim() || '',
        academicYear: req.body.academicYear?.trim() || classRecord?.academicYear || '2083',
        parent: parent?._id,
      });
    }
    if (role === 'parent' && studentUsers.length) {
      await Student.updateMany({ user: { $in: studentUsers.map((student) => student._id) } }, { parent: user._id });
    }

    return res.status(201).json({
      success: true,
      data: { _id: user._id, name: user.name, username: user.username, role: user.role, phone: user.phone, dateOfJoining: user.dateOfJoining },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const updateManagedUser = async (req, res) => {
  try {
    const userId = req.params.id || req.params.userId;
    const { name, username, password, email, phone } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (username && username !== user.username) {
      const existingUser = await User.findOne({ username, _id: { $ne: userId } });
      if (existingUser) {
        return res.status(400).json({ success: false, message: 'Username is already taken' });
      }
      user.username = username;
    }

    if (name) user.name = name;
    if (email !== undefined) user.email = email;
    if (phone !== undefined) user.phone = phone;
    if (req.body.dateOfJoining !== undefined) {
      user.dateOfJoining = req.body.dateOfJoining || null;
    }
    if (password && password.trim()) {
      user.password = password.trim();
    }

    await user.save();

    if (user.role === 'student') {
      const student = await Student.findOne({ user: userId });
      if (student) {
        if (req.body.classId) {
          const classRecord = await Class.findById(req.body.classId);
          if (classRecord) student.class = classRecord._id;
        }
        if (req.body.rollNumber) {
          student.rollNumber = req.body.rollNumber.trim();
        }
        if (req.body.fatherName !== undefined) {
          student.fatherName = req.body.fatherName.trim();
        }
        if (req.body.parentUsername !== undefined) {
          if (req.body.parentUsername.trim() === '') {
            student.parent = undefined;
          } else {
            const parentUser = await User.findOne({ username: req.body.parentUsername.trim(), role: 'parent' });
            if (parentUser) {
              student.parent = parentUser._id;
            } else {
              return res.status(400).json({ success: false, message: 'The parent username could not be found' });
            }
          }
        }
        await student.save();
      }
    }

    if (user.role === 'parent' && req.body.studentUsernames !== undefined) {
      await Student.updateMany({ parent: userId }, { $unset: { parent: 1 } });
      if (Array.isArray(req.body.studentUsernames) && req.body.studentUsernames.length > 0) {
        const studentUsers = await User.find({ username: { $in: req.body.studentUsernames }, role: 'student' });
        if (studentUsers.length > 0) {
          await Student.updateMany({ user: { $in: studentUsers.map((s) => s._id) } }, { parent: userId });
        }
      }
    }

    return res.json({ success: true, message: 'Account updated successfully' });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const removeUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    if (user.role === 'principal') {
      return res.status(400).json({ success: false, message: 'Cannot remove the principal account' });
    }

    if (user.role === 'student') {
      await Student.findOneAndDelete({ user: user._id });
    }
    if (user.role === 'parent') {
      await Student.updateMany({ parent: user._id }, { $unset: { parent: 1 } });
    }
    if (user.role === 'teacher') {
      await Class.updateMany(
        { 'subjects.teacher': user._id },
        { $set: { 'subjects.$[subject].teacher': null } },
        { arrayFilters: [{ 'subject.teacher': user._id }] }
      );
    }

    await User.findByIdAndDelete(user._id);
    return res.json({ success: true, message: 'User removed successfully' });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const registerPushToken = async (req, res) => {
  try {
    const { pushToken } = req.body;
    if (!pushToken || typeof pushToken !== 'string') {
      return res.status(400).json({ success: false, message: 'Valid pushToken string is required' });
    }

    await User.findByIdAndUpdate(req.user._id, {
      $addToSet: { pushTokens: pushToken.trim() },
    });

    console.log(`[PushToken] Registered push token for user ${req.user.name} (${req.user.role})`);
    return res.json({ success: true, message: 'Push token registered successfully' });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  getTeachers,
  getParents,
  getStudents,
  createManagedUser,
  updateManagedUser,
  removeUser,
  registerPushToken,
};
