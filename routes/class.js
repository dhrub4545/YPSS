const express = require('express');
const router = express.Router();
const {
  createClass,
  getPublicClassCatalog,
  getClasses,
  getClassDetails,
  updateClass,
  deleteClass,
} = require('../controllers/classController');
const { protect, authorize } = require('../middleware/auth');

router.get('/catalog', getPublicClassCatalog);
router.post('/', protect, authorize('principal'), createClass);
router.get('/', protect, getClasses);
router.get('/:id', protect, getClassDetails);
router.put('/:id', protect, authorize('principal'), updateClass);
router.delete('/:id', protect, authorize('principal'), deleteClass);

module.exports = router;
