const Class = require('../models/Class');
const Student = require('../models/Student');
const User = require('../models/User');

const populateClassTeachers = [
  { path: 'subjects.teacher', select: 'name username' },
  { path: 'classTeacher', select: 'name username phone' },
];

const isTeacherAssigned = (classItem, teacherId) =>
  String(classItem.classTeacher?._id || classItem.classTeacher || '') === String(teacherId) ||
  (classItem.subjects || []).some(
    (subject) => String(subject.teacher?._id || subject.teacher || '') === String(teacherId)
  );

const mapSubjects = async (subjects) => {
  if (!Array.isArray(subjects)) return [];
  const mapped = [];
  const seenNames = new Set();
  for (const subject of subjects) {
    const name = subject?.name?.trim();
    if (!name || seenNames.has(name.toLowerCase())) continue;
    seenNames.add(name.toLowerCase());
    let teacher = null;
    if (subject.teacherId) {
      const teacherRecord = await User.findOne({ _id: subject.teacherId, role: 'teacher' });
      if (teacherRecord) teacher = teacherRecord._id;
    }
    mapped.push({ name, teacher });
  }
  return mapped;
};

const getPublicClassCatalog = async (req, res) => {
  try {
    const classes = await Class.find().select('name').sort({ name: 1 });
    return res.json({ success: true, data: classes });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const createClass = async (req, res) => {
  const name = req.body.name?.trim();
  if (!name) {
    return res.status(400).json({ success: false, message: 'Class name is required' });
  }

  try {
    const classExists = await Class.findOne({ name });
    if (classExists) {
      return res.status(400).json({ success: false, message: 'Class name already exists' });
    }

    const subjects = await mapSubjects(req.body.subjects);
    let classTeacher = null;
    if (req.body.classTeacher) {
      const teacherRecord = await User.findOne({ _id: req.body.classTeacher, role: 'teacher' });
      if (teacherRecord) classTeacher = teacherRecord._id;
    }
    const academicYear = req.body.academicYear || '2083';
    const newClass = await Class.create({ name, subjects, classTeacher, academicYear });
    await newClass.populate(populateClassTeachers);
    return res.status(201).json({ success: true, data: newClass });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const getClasses = async (req, res) => {
  try {
    let query = {};
    if (req.user.role === 'teacher') {
      query = { $or: [{ 'subjects.teacher': req.user._id }, { classTeacher: req.user._id }] };
    }
    if (req.user.role === 'student') {
      const student = await Student.findOne({ user: req.user._id });
      query = student ? { _id: student.class } : { _id: null };
    }
    if (req.user.role === 'parent') {
      const children = await Student.find({ parent: req.user._id }).select('class');
      query = { _id: { $in: children.map((child) => child.class) } };
    }

    let classes = await Class.find(query).populate(populateClassTeachers).sort({ name: 1 });
    if (req.user.role === 'teacher') {
      classes = classes.map((classItem) => {
        const value = classItem.toObject();
        value.subjects = value.subjects.filter((subject) => String(subject.teacher?._id || subject.teacher || '') === String(req.user._id));
        return value;
      });
    }
    return res.json({ success: true, data: classes });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const getClassDetails = async (req, res) => {
  try {
    const classItem = await Class.findById(req.params.id).populate(populateClassTeachers);
    if (!classItem) {
      return res.status(404).json({ success: false, message: 'Class not found' });
    }

    let studentQuery = { class: classItem._id };
    if (req.user.role === 'teacher') {
      if (!isTeacherAssigned(classItem, req.user._id)) {
        return res.status(403).json({ success: false, message: 'You are not assigned to this class' });
      }
    }
    if (req.user.role === 'student') {
      const student = await Student.findOne({ user: req.user._id, class: classItem._id });
      if (!student) {
        return res.status(403).json({ success: false, message: 'You can only view your own class' });
      }
      studentQuery = { _id: student._id };
    }
    if (req.user.role === 'parent') {
      const children = await Student.find({ parent: req.user._id, class: classItem._id }).select('_id');
      if (!children.length) {
        return res.status(403).json({ success: false, message: 'You can only view classes for your linked children' });
      }
      studentQuery = { _id: { $in: children.map((child) => child._id) } };
    }

    const students = await Student.find(studentQuery)
      .populate({ path: 'user', select: 'name username phone profilePicture photo' })
      .populate({ path: 'parent', select: 'name phone' })
      .sort({ rollNumber: 1 });

    return res.json({
      success: true,
      data: {
        class: classItem,
        students: students.map((student) => ({
          studentId: student._id,
          userId: student.user?._id || null,
          name: student.user?.name || 'Student',
          username: student.user?.username || '',
          phone: student.user?.phone || '',
          profilePicture: student.user?.profilePicture || student.user?.photo || null,
          photo: student.user?.photo || student.user?.profilePicture || null,
          rollNumber: student.rollNumber,
          fatherName: student.fatherName || '',
          parentName: student.parent?.name || '',
          parentPhone: student.parent?.phone || '',
        })),
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const updateClass = async (req, res) => {
  try {
    const classItem = await Class.findById(req.params.id);
    if (!classItem) {
      return res.status(404).json({ success: false, message: 'Class not found' });
    }

    if (req.body.name?.trim() && req.body.name.trim() !== classItem.name) {
      const duplicate = await Class.findOne({ name: req.body.name.trim(), _id: { $ne: classItem._id } });
      if (duplicate) {
        return res.status(400).json({ success: false, message: 'Class name already exists' });
      }
      classItem.name = req.body.name.trim();
    }
    if (Array.isArray(req.body.subjects)) {
      classItem.subjects = await mapSubjects(req.body.subjects);
    }
    if (req.body.classTeacher !== undefined) {
      let classTeacher = null;
      if (req.body.classTeacher) {
        const teacherRecord = await User.findOne({ _id: req.body.classTeacher, role: 'teacher' });
        if (teacherRecord) classTeacher = teacherRecord._id;
      }
      classItem.classTeacher = classTeacher;
    }
    if (req.body.academicYear !== undefined) {
      classItem.academicYear = req.body.academicYear || '2083';
    }

    await classItem.save();
    await classItem.populate(populateClassTeachers);
    return res.json({ success: true, data: classItem });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const deleteClass = async (req, res) => {
  try {
    const classItem = await Class.findById(req.params.id);
    if (!classItem) {
      return res.status(404).json({ success: false, message: 'Class not found' });
    }
    const studentCount = await Student.countDocuments({ class: classItem._id });
    if (studentCount > 0) {
      return res.status(400).json({ success: false, message: `Cannot delete class because it has ${studentCount} students` });
    }
    await Class.findByIdAndDelete(classItem._id);
    return res.json({ success: true, message: 'Class deleted successfully' });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  createClass,
  getPublicClassCatalog,
  getClasses,
  getClassDetails,
  updateClass,
  deleteClass,
};
