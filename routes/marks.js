const express = require('express');
const router = express.Router();
const {
  enterMarks,
  getStudentMarks,
  getClassMarks,
  downloadMarksCard,
  setExamConfig,
  getExamConfig,
  generateMarksCard,
  generateClassMarksCards,
  publishClassMarksCards,
  getClassCardsStatus,
  getStudentPublishedCards,
  viewMarksCardPdf,
  downloadMarksCardDocxFile,
} = require('../controllers/marksController');
const { protect, authorize } = require('../middleware/auth');

router.post('/', protect, authorize('principal', 'teacher'), enterMarks);
router.post('/config', protect, authorize('principal', 'teacher'), setExamConfig);
router.get('/config', protect, authorize('principal', 'teacher'), getExamConfig);
router.post('/generate-card', protect, authorize('principal', 'teacher'), generateMarksCard);
router.post('/generate-class-cards', protect, authorize('principal', 'teacher'), generateClassMarksCards);
router.post('/publish-class-cards', protect, authorize('principal', 'teacher'), publishClassMarksCards);
router.get('/class-cards-status', protect, authorize('principal', 'teacher'), getClassCardsStatus);
router.get('/student-published-cards/:studentId', protect, getStudentPublishedCards);
router.get('/card-pdf/:cardId', protect, viewMarksCardPdf);
router.get('/card-docx/:cardId', protect, downloadMarksCardDocxFile);
router.get('/student/:studentId', protect, getStudentMarks);
router.get('/class/:classId', protect, authorize('principal', 'teacher'), getClassMarks);
router.get('/student/:studentId/download', protect, downloadMarksCard);

module.exports = router;
