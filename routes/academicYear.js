const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const {
  getAcademicYears,
  createAcademicYear,
  setActiveAcademicYear,
  getTransitionStatus,
  copyClassStructureAndFees,
  promoteStudentRoster,
} = require('../controllers/academicYearController');

router.use(protect);

router.get('/', getAcademicYears);
router.post('/', authorize('principal'), createAcademicYear);
router.post('/switch-active', authorize('principal'), setActiveAcademicYear);
router.get('/transition-status', authorize('principal'), getTransitionStatus);
router.post('/copy-class-structure', authorize('principal'), copyClassStructureAndFees);
router.post('/promote-students', authorize('principal'), promoteStudentRoster);

module.exports = router;
