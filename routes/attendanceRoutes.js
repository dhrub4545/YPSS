const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const {
  getClassAttendance,
  markClassAttendance,
  getStudentAttendance,
  downloadClassAttendancePDF,
} = require('../controllers/attendanceController');

router.use(protect);

router.get('/class/:classId/download-pdf', authorize('principal', 'teacher'), downloadClassAttendancePDF);
router.get('/class/:classId', authorize('principal', 'teacher'), getClassAttendance);
router.post('/mark', authorize('principal', 'teacher'), markClassAttendance);
router.get('/student/me', authorize('student'), getStudentAttendance);
router.get('/student/:studentId', authorize('principal', 'teacher', 'parent'), getStudentAttendance);

module.exports = router;
