const express = require('express');
const router = express.Router();
const {
  getTeachers,
  getParents,
  getStudents,
  createManagedUser,
  updateManagedUser,
  removeUser,
  registerPushToken,
} = require('../controllers/userController');
const { protect, authorize } = require('../middleware/auth');

router.post('/push-token', protect, registerPushToken);
router.get('/teachers', protect, authorize('principal'), getTeachers);
router.get('/parents', protect, authorize('principal'), getParents);
router.get('/students', protect, authorize('principal'), getStudents);
router.post('/', protect, authorize('principal'), createManagedUser);
router.put('/:id', protect, authorize('principal'), updateManagedUser);
router.delete('/:id', protect, authorize('principal'), removeUser);

module.exports = router;
