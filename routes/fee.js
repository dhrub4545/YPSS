const express = require('express');
const router = express.Router();
const {
  generateFeeBill,
  recordPayment,
  getStudentFeeStatus,
  getFeeAudit,
  getClassFeeStructures,
  updateClassFeeStructure,
  getCurrentMonthStudentFeeStatus,
  recordDirectPayment,
  downloadReceiptPdf,
  pushFeeAlerts,
} = require('../controllers/feeController');
const { protect, authorize } = require('../middleware/auth');

router.get('/class-structures', protect, authorize('principal'), getClassFeeStructures);
router.post('/class-structure', protect, authorize('principal'), updateClassFeeStructure);
router.get('/current-month-status', protect, authorize('principal'), getCurrentMonthStudentFeeStatus);
router.post('/record-direct-payment', protect, authorize('principal'), recordDirectPayment);
router.post('/push-fee-alerts', protect, authorize('principal'), pushFeeAlerts);
router.get('/receipt/:receiptNo/pdf', protect, downloadReceiptPdf);
router.post('/generate', protect, authorize('principal'), generateFeeBill);
router.post('/:id/pay', protect, authorize('principal'), recordPayment);
router.get('/student/:studentId', protect, authorize('principal', 'parent', 'student'), getStudentFeeStatus);
router.get('/audit', protect, authorize('principal'), getFeeAudit);

module.exports = router;
