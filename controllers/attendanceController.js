const path = require('path');
const fs = require('fs');
const Attendance = require('../models/Attendance');
const Class = require('../models/Class');
const Student = require('../models/Student');
const User = require('../models/User');
const { generateAttendancePDF } = require('../utils/attendancePdfGenerator');

const getTodayDateStr = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const sortByRollNumber = (list) => {
  return list.sort((a, b) => {
    const numA = parseInt(String(a.rollNumber || '').replace(/\D/g, ''), 10) || 0;
    const numB = parseInt(String(b.rollNumber || '').replace(/\D/g, ''), 10) || 0;
    if (numA !== numB) return numA - numB;
    return String(a.rollNumber || '').localeCompare(String(b.rollNumber || ''), undefined, { numeric: true });
  });
};

// GET /api/attendance/class/:classId?date=YYYY-MM-DD
const getClassAttendance = async (req, res) => {
  try {
    const { classId } = req.params;
    const targetDate = req.query.date?.trim() || getTodayDateStr();

    const classRecord = await Class.findById(classId);
    if (!classRecord) {
      return res.status(404).json({ success: false, message: 'Class not found' });
    }

    // Permission check for teacher
    if (req.user.role === 'teacher') {
      const isAdvisor = String(classRecord.classTeacher || '') === String(req.user._id);
      if (!isAdvisor) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. You can only view and take attendance for classes where you are the class advisor.',
        });
      }
    }

    // Find attendance record for this class and date
    let attendance = await Attendance.findOne({ class: classId, date: targetDate })
      .populate({
        path: 'records.student',
        populate: { path: 'user', select: 'name username phone' },
      })
      .populate('takenBy', 'name role username');

    // Fetch enrolled students for this class
    const enrolledStudents = await Student.find({ class: classId })
      .populate('user', 'name username phone');

    if (!attendance) {
      // Return template with default 'present' for all students
      const defaultRecords = enrolledStudents.map((s) => ({
        studentId: s._id,
        userId: s.user?._id,
        name: s.user?.name || 'Student',
        username: s.user?.username || '',
        rollNumber: s.rollNumber,
        fatherName: s.fatherName || '',
        status: 'present',
        remarks: '',
      }));

      sortByRollNumber(defaultRecords);

      return res.json({
        success: true,
        data: {
          classId,
          date: targetDate,
          isNew: true,
          records: defaultRecords,
        },
      });
    }

    // Merge existing attendance record with enrolled students list
    const existingMap = new Map();
    (attendance.records || []).forEach((r) => {
      if (r.student) {
        existingMap.set(String(r.student._id || r.student), r);
      }
    });

    const mergedRecords = enrolledStudents.map((s) => {
      const rec = existingMap.get(String(s._id));
      return {
        studentId: s._id,
        userId: s.user?._id,
        name: s.user?.name || 'Student',
        username: s.user?.username || '',
        rollNumber: s.rollNumber,
        fatherName: s.fatherName || '',
        status: rec ? rec.status : 'present',
        remarks: rec ? rec.remarks || '' : '',
      };
    });

    sortByRollNumber(mergedRecords);

    return res.json({
      success: true,
      data: {
        _id: attendance._id,
        classId,
        date: attendance.date,
        dateBs: attendance.dateBs,
        takenBy: attendance.takenBy,
        isNew: false,
        records: mergedRecords,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// POST /api/attendance/mark
const markClassAttendance = async (req, res) => {
  try {
    const { classId, date, dateBs, records } = req.body;
    const targetDate = date?.trim() || getTodayDateStr();
    const todayStr = getTodayDateStr();

    if (!classId || !Array.isArray(records)) {
      return res.status(400).json({ success: false, message: 'Class ID and student records array are required' });
    }

    const classRecord = await Class.findById(classId);
    if (!classRecord) {
      return res.status(404).json({ success: false, message: 'Class not found' });
    }

    // Role-based restrictions
    if (req.user.role === 'teacher') {
      const isAdvisor = String(classRecord.classTeacher || '') === String(req.user._id);
      if (!isAdvisor) {
        return res.status(403).json({
          success: false,
          message: 'Teachers can only mark attendance for the class where they are the class advisor.',
        });
      }

      if (targetDate !== todayStr) {
        return res.status(403).json({
          success: false,
          message: `Teachers can only take or modify attendance for today's date (${todayStr}). Only the principal can modify past dates.`,
        });
      }
    }

    const formattedRecords = records.map((r) => ({
      student: r.studentId,
      status: ['present', 'absent'].includes(r.status) ? r.status : 'present',
      remarks: r.remarks?.trim() || '',
    }));

    let attendance = await Attendance.findOne({ class: classId, date: targetDate });

    if (attendance) {
      attendance.records = formattedRecords;
      attendance.takenBy = req.user._id;
      if (dateBs) attendance.dateBs = dateBs;
      await attendance.save();
    } else {
      attendance = await Attendance.create({
        class: classId,
        date: targetDate,
        dateBs: dateBs || '',
        takenBy: req.user._id,
        records: formattedRecords,
      });
    }

    await attendance.populate('takenBy', 'name role username');

    return res.json({
      success: true,
      message: `Attendance saved for ${targetDate}`,
      data: attendance,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/attendance/student/me or /api/attendance/student/:studentId
const getStudentAttendance = async (req, res) => {
  try {
    let studentRecord = null;

    if (req.user.role === 'student') {
      studentRecord = await Student.findOne({ user: req.user._id }).populate('class');
    } else if (req.params.studentId) {
      studentRecord = await Student.findById(req.params.studentId).populate('class');
    }

    if (!studentRecord) {
      return res.status(404).json({ success: false, message: 'Student profile not found' });
    }

    // Find all attendance records for this student's class
    const allAttendance = await Attendance.find({ class: studentRecord.class._id })
      .sort({ date: -1 })
      .lean();

    let totalClasses = 0;
    let presentDays = 0;
    let absentDays = 0;
    let lateDays = 0;
    let excusedDays = 0;

    const history = [];

    allAttendance.forEach((att) => {
      const match = (att.records || []).find(
        (r) => String(r.student) === String(studentRecord._id)
      );

      if (match) {
        totalClasses++;
        const status = match.status === 'absent' ? 'absent' : match.status === 'late' ? 'late' : match.status === 'excused' ? 'excused' : 'present';
        if (status === 'present') presentDays++;
        else if (status === 'absent') absentDays++;
        else if (status === 'late') lateDays++;
        else if (status === 'excused') excusedDays++;

        let dateBsStr = att.dateBs || '';
        if (!dateBsStr && att.date) {
          try {
            dateBsStr = new NepaliDate(new Date(att.date)).format('YYYY-MM-DD');
          } catch (e) {}
        }

        history.push({
          date: att.date,
          dateBs: dateBsStr ? `${dateBsStr} B.S.` : '',
          status,
          remarks: match.remarks || '',
        });
      }
    });

    const attendancePercentage = totalClasses > 0 ? Math.round((presentDays / totalClasses) * 100) : 100;

    return res.json({
      success: true,
      data: {
        studentId: studentRecord._id,
        className: studentRecord.class?.name || '',
        rollNumber: studentRecord.rollNumber,
        fatherName: studentRecord.fatherName || '',
        totalClasses,
        presentDays,
        absentDays,
        lateDays,
        excusedDays,
        attendancePercentage,
        history,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/attendance/class/:classId/download-pdf?date=YYYY-MM-DD
const downloadClassAttendancePDF = async (req, res) => {
  try {
    const { classId } = req.params;
    const targetDate = req.query.date;

    if (!classId || !targetDate) {
      return res.status(400).json({ success: false, message: 'Class ID and Date are required' });
    }

    const classRecord = await Class.findById(classId).populate('classTeacher');
    if (!classRecord) {
      return res.status(404).json({ success: false, message: 'Class record not found' });
    }

    const enrolledStudents = await Student.find({ class: classId })
      .populate('user', 'name username phone')
      .sort({ rollNumber: 1 })
      .lean();

    const attendance = await Attendance.findOne({ class: classId, date: targetDate }).populate('takenBy', 'name role');

    let recordedBy = 'Not Specified';
    if (attendance?.takenBy?.name) {
      const roleStr = attendance.takenBy.role === 'principal' ? 'Principal' : 'Class Advisor';
      recordedBy = `${attendance.takenBy.name} (${roleStr})`;
    } else if (req.user?.name) {
      const roleStr = req.user.role === 'principal' ? 'Principal' : 'Class Advisor';
      recordedBy = `${req.user.name} (${roleStr})`;
    }

    const existingMap = new Map();
    if (attendance) {
      (attendance.records || []).forEach((r) => {
        if (r.student) {
          existingMap.set(String(r.student._id || r.student), r);
        }
      });
    }

    let presentCount = 0;
    let absentCount = 0;

    const recordsList = enrolledStudents.map((s) => {
      const rec = existingMap.get(String(s._id));
      const status = rec ? rec.status : 'present';
      if (status === 'present') presentCount++;
      else absentCount++;

      return {
        rollNumber: s.rollNumber || '—',
        name: s.user?.name || 'Student',
        username: s.user?.username || '',
        fatherName: s.fatherName || '—',
        status,
      };
    });

    sortByRollNumber(recordsList);

    const os = require('os');
    const tempDir = path.join(os.tmpdir(), 'ypss_temp');
    if (!fs.existsSync(tempDir)) {
      try {
        fs.mkdirSync(tempDir, { recursive: true });
      } catch (_) {}
    }

    const cleanClassName = classRecord.name.replace(/[^a-zA-Z0-9]/g, '_');
    const pdfPath = path.join(tempDir, `Attendance_${cleanClassName}_${targetDate}_${Date.now()}.pdf`);

    await generateAttendancePDF(
      { className: classRecord.name, teacherName: classRecord.classTeacher?.name || '' },
      { date: targetDate, total: enrolledStudents.length, present: presentCount, absent: absentCount, recordedBy },
      recordsList,
      pdfPath
    );

    const downloadFileName = `YPSS_Attendance_${cleanClassName}_${targetDate}.pdf`;
    return res.download(pdfPath, downloadFileName, (err) => {
      if (err) console.error('PDF Send Error:', err);
      try {
        if (fs.existsSync(pdfPath)) fs.unlinkSync(pdfPath);
      } catch (_) {}
    });
  } catch (error) {
    console.error('Download Attendance PDF Error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  getClassAttendance,
  markClassAttendance,
  getStudentAttendance,
  downloadClassAttendancePDF,
};
