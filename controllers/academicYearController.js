const AcademicYear = require('../models/AcademicYear');
const Class = require('../models/Class');
const Student = require('../models/Student');
const Fee = require('../models/Fee');
const User = require('../models/User');

// Default initial academic years if db empty
const DEFAULT_YEARS = [
  { year: '2083', label: '2083 B.S.', isActive: true },
  { year: '2082', label: '2082 B.S.', isActive: false },
  { year: '2084', label: '2084 B.S.', isActive: false },
];

// GET /api/academic-years
const getAcademicYears = async (req, res) => {
  try {
    let years = await AcademicYear.find().sort({ year: -1 });

    if (years.length === 0) {
      years = await AcademicYear.insertMany(DEFAULT_YEARS);
    }

    const activeYearObj = years.find((y) => y.isActive) || years[0];

    return res.json({
      success: true,
      data: years,
      activeYear: activeYearObj?.year || '2083',
    });
  } catch (err) {
    console.error('getAcademicYears error:', err);
    return res.status(500).json({ success: false, message: 'Server error listing academic years.' });
  }
};

// POST /api/academic-years
const createAcademicYear = async (req, res) => {
  try {
    const { year, label } = req.body;
    const trimmedYear = String(year || '').trim();

    if (!trimmedYear) {
      return res.status(400).json({ success: false, message: 'Academic year value is required.' });
    }

    const existing = await AcademicYear.findOne({ year: trimmedYear });
    if (existing) {
      return res.status(400).json({ success: false, message: `Academic year ${trimmedYear} already exists.` });
    }

    const newYear = await AcademicYear.create({
      year: trimmedYear,
      label: label ? label.trim() : `${trimmedYear} B.S.`,
      isActive: false,
    });

    return res.status(201).json({
      success: true,
      message: `Academic year ${trimmedYear} created successfully.`,
      data: newYear,
    });
  } catch (err) {
    console.error('createAcademicYear error:', err);
    return res.status(500).json({ success: false, message: 'Server error creating academic year.' });
  }
};

// POST /api/academic-years/switch-active
const setActiveAcademicYear = async (req, res) => {
  try {
    const { year } = req.body;
    const targetYear = String(year || '').trim();

    if (!targetYear) {
      return res.status(400).json({ success: false, message: 'Target year is required.' });
    }

    await AcademicYear.updateMany({}, { isActive: false });
    await AcademicYear.findOneAndUpdate({ year: targetYear }, { isActive: true }, { upsert: true });

    return res.json({
      success: true,
      message: `System active academic year updated to ${targetYear} B.S.`,
      activeYear: targetYear,
    });
  } catch (err) {
    console.error('setActiveAcademicYear error:', err);
    return res.status(500).json({ success: false, message: 'Server error setting active year.' });
  }
};

// GET /api/academic-years/transition-status?targetYear=2084
const getTransitionStatus = async (req, res) => {
  try {
    const targetYear = req.query.targetYear || '2084';
    const sourceYear = req.query.sourceYear || '2083';

    // Fetch classes for target year vs source year
    let targetClasses = await Class.find({ academicYear: targetYear });
    let sourceClasses = await Class.find({ academicYear: sourceYear });

    if (sourceClasses.length === 0) {
      sourceClasses = await Class.find();
    }

    // Students in target year & source year
    const targetStudents = await Student.find({ academicYear: targetYear }).populate('class', 'name');
    const sourceStudentQuery = sourceYear
      ? { $or: [{ academicYear: sourceYear }, { academicYear: { $exists: false } }, { academicYear: '' }] }
      : {};
    const sourceStudents = await Student.find(sourceStudentQuery).populate('class', 'name');

    const totalSourceClasses = sourceClasses.length;
    const configuredTargetClasses = targetClasses.filter((c) => Number(c.monthlyFee || 0) > 0).length;

    const classReadiness = sourceClasses.map((sClass) => {
      const tClass = targetClasses.find((tc) => tc.name === sClass.name);
      const sStudentsCount = sourceStudents.filter((st) => String(st.class?._id) === String(sClass._id)).length;
      const tStudentsCount = targetStudents.filter((st) => String(st.class?._id) === String(tClass?._id)).length;

      return {
        sourceClassId: sClass._id,
        className: sClass.name,
        targetClassId: tClass?._id || null,
        feeConfigured: Boolean(tClass && Number(tClass.monthlyFee || 0) > 0),
        targetMonthlyFee: tClass ? tClass.monthlyFee : 0,
        sourceStudentCount: sStudentsCount,
        targetStudentCount: tStudentsCount,
        isReady: Boolean(tClass && Number(tClass.monthlyFee || 0) > 0 && tStudentsCount > 0),
      };
    });

    return res.json({
      success: true,
      meta: {
        sourceYear,
        targetYear,
        totalSourceClasses,
        configuredTargetClasses,
        sourceTotalStudents: sourceStudents.length,
        targetTotalStudents: targetStudents.length,
      },
      data: classReadiness,
    });
  } catch (err) {
    console.error('getTransitionStatus error:', err);
    return res.status(500).json({ success: false, message: 'Server error retrieving transition status.' });
  }
};

// POST /api/academic-years/copy-class-structure
const copyClassStructureAndFees = async (req, res) => {
  try {
    const { sourceYear = '2083', targetYear = '2084', feeAdjustmentPercent = 0 } = req.body;

    let sourceClasses = await Class.find({ academicYear: sourceYear });
    if (sourceClasses.length === 0) {
      sourceClasses = await Class.find();
    }
    if (sourceClasses.length === 0) {
      return res.status(400).json({ success: false, message: `No classes found to copy.` });
    }

    const multiplier = 1 + (Number(feeAdjustmentPercent) || 0) / 100;
    const updatedOrCreated = [];

    for (const sClass of sourceClasses) {
      const newMonthlyFee = Math.round(Number(sClass.monthlyFee || 0) * multiplier);
      const newAdditionalFees = Array.isArray(sClass.additionalFees)
        ? sClass.additionalFees.map((f) => ({
            title: f.title,
            amount: Math.round(Number(f.amount || 0) * multiplier),
            month: f.month || 'Baishakh',
          }))
        : [];

      const targetClass = await Class.findOneAndUpdate(
        { name: sClass.name, academicYear: targetYear },
        {
          name: sClass.name,
          subjects: sClass.subjects || [],
          academicYear: targetYear,
          monthlyFee: newMonthlyFee,
          additionalFees: newAdditionalFees,
        },
        { upsert: true, new: true }
      );

      // Auto-update student class enrollments for targetYear
      const sourceClassStudents = await Student.find({ class: sClass._id });
      for (const st of sourceClassStudents) {
        await Student.findOneAndUpdate(
          { user: st.user, academicYear: targetYear },
          {
            user: st.user,
            class: targetClass._id,
            rollNumber: st.rollNumber,
            fatherName: st.fatherName,
            parent: st.parent,
            academicYear: targetYear,
          },
          { upsert: true, new: true }
        );
      }

      updatedOrCreated.push(targetClass);
    }

    return res.json({
      success: true,
      message: `Successfully set up class fee structures & updated student rosters for Academic Year ${targetYear} B.S.`,
      count: updatedOrCreated.length,
      data: updatedOrCreated,
    });
  } catch (err) {
    console.error('copyClassStructureAndFees error:', err);
    return res.status(500).json({ success: false, message: 'Server error setting up class fee structures.' });
  }
};

// Helper: Calculate student's unpaid remaining balance in source academic year
const calculateStudentSourceYearArrears = async (studentObj, sourceClassObj, sourceYear) => {
  try {
    if (!sourceClassObj) return 0;
    const baseMonthly = Number(sourceClassObj.monthlyFee || 0);
    const addFees = Array.isArray(sourceClassObj.additionalFees) ? sourceClassObj.additionalFees : [];
    const totalAdditional = addFees.reduce((sum, item) => sum + Number(item.amount || 0), 0);

    const totalInvoicedInSourceYear = (baseMonthly * 12) + totalAdditional;

    const fees = await Fee.find({ student: studentObj._id });
    const totalPaid = fees.reduce((sum, f) => sum + Number(f.amountPaid || 0), 0);

    return Math.max(0, totalInvoicedInSourceYear - totalPaid);
  } catch (err) {
    console.error('calculateStudentSourceYearArrears error:', err);
    return 0;
  }
};

// POST /api/academic-years/promote-students
const promoteStudentRoster = async (req, res) => {
  try {
    const { sourceClassId, targetClassName, sourceYear = '2083', targetYear = '2084' } = req.body;

    if (!sourceClassId || !targetClassName) {
      return res
        .status(400)
        .json({ success: false, message: 'Source class ID and target class name are required.' });
    }

    const sourceClassObj = await Class.findById(sourceClassId);

    // Find target class for target year
    let targetClassObj = await Class.findOne({ name: targetClassName, academicYear: targetYear });
    if (!targetClassObj) {
      // Create if missing
      targetClassObj = await Class.create({
        name: targetClassName,
        academicYear: targetYear,
        monthlyFee: sourceClassObj?.monthlyFee || 0,
        additionalFees: sourceClassObj?.additionalFees || [],
        subjects: sourceClassObj?.subjects || [],
      });
    }

    // Find students in source class & year (supporting missing academicYear field gracefully)
    const studentQuery = { class: sourceClassId };
    if (sourceYear) {
      studentQuery.$or = [{ academicYear: sourceYear }, { academicYear: { $exists: false } }, { academicYear: '' }];
    }

    const sourceStudents = await Student.find(studentQuery);
    if (sourceStudents.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: 'No students found in the selected source class.' });
    }

    let promotedCount = 0;
    for (const s of sourceStudents) {
      const unpaidArrears = await calculateStudentSourceYearArrears(s, sourceClassObj, sourceYear);

      await Student.findOneAndUpdate(
        { user: s.user, academicYear: targetYear },
        {
          user: s.user,
          class: targetClassObj._id,
          rollNumber: s.rollNumber,
          fatherName: s.fatherName,
          parent: s.parent,
          academicYear: targetYear,
          previousYearArrears: unpaidArrears,
        },
        { upsert: true, new: true }
      );
      promotedCount++;
    }

    return res.json({
      success: true,
      message: `Successfully promoted ${promotedCount} student(s) to ${targetClassName} for Academic Year ${targetYear} B.S. Previous remaining fee balances have been carried forward.`,
      promotedCount,
    });
  } catch (err) {
    console.error('promoteStudentRoster error:', err);
    return res.status(500).json({ success: false, message: 'Server error promoting student roster.' });
  }
};

module.exports = {
  getAcademicYears,
  createAcademicYear,
  setActiveAcademicYear,
  getTransitionStatus,
  copyClassStructureAndFees,
  promoteStudentRoster,
};
