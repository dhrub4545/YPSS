const Fee = require('../models/Fee');
const Student = require('../models/Student');
const Class = require('../models/Class');
const User = require('../models/User');
const PDFDocument = require('pdfkit');
const nd = require('nepali-date-converter');
const NepaliDate = nd.default || nd;

const hasSameId = (left, right) => String(left?._id || left || '') === String(right?._id || right || '');

const generateFeeBill = async (req, res) => {
  const studentId = req.body.studentId;
  const classId = req.body.classId;
  const academicYear = req.body.academicYear?.trim();
  const feeType = req.body.feeType;
  const amountDue = Number(req.body.amountDue);
  const dueDate = req.body.dueDate;

  if (!academicYear || !['tuition', 'bus', 'exam', 'admission', 'uniform', 'other'].includes(feeType) || !Number.isFinite(amountDue) || amountDue <= 0) {
    return res.status(400).json({ success: false, message: 'Academic year, fee type, and a positive amount are required' });
  }
  if ((studentId && classId) || (!studentId && !classId)) {
    return res.status(400).json({ success: false, message: 'Choose either one student or one class to bill' });
  }

  try {
    let studentsToBill = [];
    if (studentId) {
      const student = await Student.findById(studentId);
      if (student) studentsToBill = [student];
    } else {
      const classItem = await Class.findById(classId);
      if (!classItem) {
        return res.status(404).json({ success: false, message: 'Class not found' });
      }
      studentsToBill = await Student.find({ class: classItem._id });
    }
    if (!studentsToBill.length) {
      return res.status(404).json({ success: false, message: 'No students found to bill' });
    }

    const bills = await Fee.insertMany(studentsToBill.map((student) => ({
      student: student._id,
      academicYear,
      feeType,
      amountDue,
      dueDate: dueDate ? new Date(dueDate) : undefined,
    })));
    return res.status(201).json({ success: true, count: bills.length, data: bills });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const getNextSequentialReceiptNo = async () => {
  const fees = await Fee.find({}, { 'transactions.receiptNo': 1 });
  let maxSeq = 0;
  fees.forEach((fee) => {
    (fee.transactions || []).forEach((t) => {
      if (t.receiptNo) {
        const match = String(t.receiptNo).match(/REC-(\d+)/i);
        if (match && match[1]) {
          const num = parseInt(match[1], 10);
          if (num > maxSeq) maxSeq = num;
        }
      }
    });
  });
  const nextSeq = maxSeq + 1;
  return `REC-${String(nextSeq).padStart(4, '0')}`;
};

const recordPayment = async (req, res) => {
  const amountPaid = Number(req.body.amountPaid);
  const paymentMethod = req.body.paymentMethod?.trim() || 'cash';

  if (!Number.isFinite(amountPaid) || amountPaid <= 0) {
    return res.status(400).json({ success: false, message: 'Enter a positive payment amount' });
  }

  try {
    const fee = await Fee.findById(req.params.id);
    if (!fee) {
      return res.status(404).json({ success: false, message: 'Fee record not found' });
    }
    const remaining = Number(fee.amountDue) - Number(fee.amountPaid);
    if (amountPaid > remaining) {
      return res.status(400).json({ success: false, message: `Payment exceeds the remaining balance of ${remaining}` });
    }

    const receiptNo = await getNextSequentialReceiptNo();

    fee.amountPaid += amountPaid;
    fee.transactions.push({
      amount: amountPaid,
      paymentMethod,
      receiptNo,
      date: new Date(),
    });
    await fee.save();
    return res.json({ success: true, data: fee });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const getStudentFeeStatus = async (req, res) => {
  try {
    const student = await Student.findById(req.params.studentId)
      .populate({ path: 'user', select: 'name' })
      .populate('class');
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }
    if (req.user.role === 'student' && !hasSameId(student.user, req.user._id)) {
      return res.status(403).json({ success: false, message: 'You can only view your own fee statement' });
    }
    if (req.user.role === 'parent' && (!student.parent || !hasSameId(student.parent, req.user._id))) {
      return res.status(403).json({ success: false, message: 'You can only view fee statements for linked children' });
    }

    const today = new NepaliDate();
    const currentMonthIndex = today.getMonth() + 1;
    const currentMonthName = NEPALI_MONTH_NAMES[currentMonthIndex - 1] || 'Baishakh';
    const elapsedMonths = currentMonthIndex;

    const classObj = student.class;
    const baseMonthly = Number(classObj?.monthlyFee || 0);
    const addFees = Array.isArray(classObj?.additionalFees) ? classObj.additionalFees : [];
    const previousArrears = Number(student.previousYearArrears || 0);

    const cumulativeBaseFee = baseMonthly * elapsedMonths;

    const formattedAdditionalFees = addFees
      .filter((item) => {
        const itemMonthIndex = NEPALI_MONTH_NAMES.indexOf(item.month) + 1;
        const monthNum = itemMonthIndex > 0 ? itemMonthIndex : 1;
        return monthNum <= currentMonthIndex;
      })
      .map((f) => ({
        title: f.title,
        amount: Number(f.amount || 0),
        month: f.month || 'Baishakh',
      }));

    if (previousArrears > 0) {
      formattedAdditionalFees.unshift({
        title: 'Previous Session Arrears',
        amount: previousArrears,
        month: 'Baishakh',
      });
    }

    const applicableAdditionalTotal = formattedAdditionalFees.reduce(
      (sum, item) => sum + Number(item.amount || 0),
      0
    );

    const totalInvoicedFromClass = cumulativeBaseFee + applicableAdditionalTotal;

    const fees = await Fee.find({ student: student._id }).sort({ createdAt: -1 });
    const explicitInvoiced = fees.reduce((total, fee) => total + Number(fee.amountDue || 0), 0);
    const totalPaid = fees.reduce((total, fee) => total + Number(fee.amountPaid || 0), 0);

    const totalDue = Math.max(totalInvoicedFromClass, explicitInvoiced);
    const totalRemaining = Math.max(0, totalDue - totalPaid);

    let currentPaidPool = totalPaid;

    let tuitionPaid = Math.min(currentPaidPool, cumulativeBaseFee);
    currentPaidPool = Math.max(0, currentPaidPool - tuitionPaid);

    const feeList = [
      {
        _id: `class-tuition-${student._id}`,
        feeType: 'tuition',
        title: `Base Monthly Tuition Fee (Baishakh to ${currentMonthName} B.S.)`,
        academicYear: `${classObj?.academicYear || '2083'} B.S.`,
        amountDue: cumulativeBaseFee,
        amountPaid: tuitionPaid,
        status: tuitionPaid >= cumulativeBaseFee ? 'paid' : tuitionPaid > 0 ? 'partial' : 'unpaid',
      },
      ...formattedAdditionalFees.map((f, idx) => {
        const itemPaid = Math.min(currentPaidPool, f.amount);
        currentPaidPool = Math.max(0, currentPaidPool - itemPaid);
        return {
          _id: `add-fee-${idx}-${student._id}`,
          feeType: f.title.toLowerCase().includes('exam') ? 'exam' : 'other',
          title: `${f.title} (${f.month || 'Baishakh'})`,
          academicYear: `${classObj?.academicYear || '2083'} B.S.`,
          amountDue: f.amount,
          amountPaid: itemPaid,
          status: itemPaid >= f.amount ? 'paid' : itemPaid > 0 ? 'partial' : 'unpaid',
        };
      }),
    ];

    const allTransactions = fees
      .flatMap((f) => f.transactions || [])
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .map((t) => {
        let dateBS = '—';
        try {
          dateBS = new NepaliDate(new Date(t.date)).format('YYYY-MM-DD');
        } catch (e) {
          dateBS = new Date(t.date).toLocaleDateString();
        }
        return {
          receiptNo: t.receiptNo || '—',
          amount: Number(t.amount || 0),
          paymentMethod: t.paymentMethod || 'cash',
          dateBS: `${dateBS} B.S.`,
          dateAD: new Date(t.date).toLocaleDateString(),
          rawDate: t.date,
        };
      });

    return res.json({
      success: true,
      summary: { totalDue, totalPaid, totalRemaining },
      data: feeList,
      transactions: allTransactions,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const getFeeAudit = async (req, res) => {
  try {
    const fees = await Fee.find().populate({
      path: 'student',
      populate: [
        { path: 'user', select: 'name' },
        { path: 'class', select: 'name monthlyFee additionalFees academicYear' },
        { path: 'parent', select: 'name phone' },
      ],
    });
    const audit = { totalInvoiced: 0, totalCollected: 0, totalOutstanding: 0, byFeeType: {}, transactions: [] };

    const today = new NepaliDate();
    const currentMonthIndex = today.getMonth() + 1;
    const currentMonthName = NEPALI_MONTH_NAMES[currentMonthIndex - 1] || 'Baishakh';
    const elapsedMonths = currentMonthIndex;
    const periodCovered = currentMonthIndex === 1 ? 'Baishakh' : `Baishakh to ${currentMonthName}`;

    fees.forEach((fee) => {
      const student = fee.student;
      const invoiced = Number(fee.amountDue || 0);
      const collected = Number(fee.amountPaid || 0);
      audit.totalInvoiced += invoiced;
      audit.totalCollected += collected;

      if (!audit.byFeeType[fee.feeType]) {
        audit.byFeeType[fee.feeType] = { invoiced: 0, collected: 0, outstanding: 0 };
      }
      audit.byFeeType[fee.feeType].invoiced += invoiced;
      audit.byFeeType[fee.feeType].collected += collected;

      if (!student) return;

      const baseMonthly = Number(student.class?.monthlyFee || 0);
      const cumulativeBaseFee = baseMonthly * elapsedMonths;
      const addFees = Array.isArray(student.class?.additionalFees) ? student.class.additionalFees : [];
      const previousArrears = Number(student.previousYearArrears || 0);

      const formattedAdditionalFees = addFees
        .filter((item) => {
          const itemMonthIndex = NEPALI_MONTH_NAMES.indexOf(item.month) + 1;
          const monthNum = itemMonthIndex > 0 ? itemMonthIndex : 1;
          return monthNum <= currentMonthIndex;
        })
        .map((f) => ({
          title: f.title,
          amount: Number(f.amount || 0),
          month: f.month || 'Baishakh',
        }));

      if (previousArrears > 0) {
        formattedAdditionalFees.unshift({
          title: 'Previous Session Arrears',
          amount: previousArrears,
          month: 'Baishakh',
        });
      }

      const applicableAdditionalTotal = formattedAdditionalFees.reduce(
        (sum, item) => sum + Number(item.amount || 0),
        0
      );

      const totalInvoiced = cumulativeBaseFee + applicableAdditionalTotal;
      const remainingBalance = Math.max(0, totalInvoiced - fee.amountPaid);
      const fatherName = student.fatherName || student.parent?.name || '—';
      const activeYear = student.class?.academicYear || fee.academicYear || '2083';

      (fee.transactions || []).forEach((transaction) => {
        let dateBS = '—';
        try {
          dateBS = new NepaliDate(new Date(transaction.date)).format('YYYY-MM-DD');
        } catch (e) {
          dateBS = new Date(transaction.date).toLocaleDateString();
        }

        const cleanTxReceiptNo = transaction.receiptNo || `REC-${Date.now().toString().slice(-6)}`;
        const txAmount = Number(transaction.amount || 0);

        const priorTxForThisTx = (fee.transactions || [])
          .filter((t) => t.receiptNo !== cleanTxReceiptNo && new Date(t.date) <= new Date(transaction.date))
          .map((t) => {
            let tDateBs = '—';
            try {
              tDateBs = new NepaliDate(new Date(t.date)).format('YYYY-MM-DD');
            } catch (e) {
              tDateBs = new Date(t.date).toLocaleDateString();
            }
            return {
              amount: Number(t.amount || 0),
              receiptNo: t.receiptNo || '—',
              paymentMethod: t.paymentMethod || 'cash',
              dateBS: tDateBs,
            };
          });

        audit.transactions.push({
          receiptNo: cleanTxReceiptNo,
          studentId: student._id,
          studentName: student.user?.name || 'Student',
          className: student.class?.name || 'Class',
          rollNumber: student.rollNumber || '—',
          fatherName: fatherName,
          amountPaid: txAmount,
          amount: txAmount,
          paymentMethod: transaction.paymentMethod || 'cash',
          date: new Date(transaction.date).toLocaleDateString(),
          dateBS: dateBS,
          periodCovered: periodCovered,
          baseMonthly: baseMonthly,
          elapsedMonths: elapsedMonths,
          cumulativeBaseFee: cumulativeBaseFee,
          applicableAdditionalFees: formattedAdditionalFees,
          applicableAdditionalTotal: applicableAdditionalTotal,
          totalInvoiced: totalInvoiced,
          totalPaidPrior: Math.max(0, fee.amountPaid - txAmount),
          priorTransactions: priorTxForThisTx,
          totalPaidCumulative: fee.amountPaid,
          remainingBalance: remainingBalance,
          academicYear: `${activeYear} B.S.`,
          rawDate: transaction.date,
        });
      });
    });

    audit.totalOutstanding = audit.totalInvoiced - audit.totalCollected;
    Object.values(audit.byFeeType).forEach((summary) => {
      summary.outstanding = summary.invoiced - summary.collected;
    });
    audit.transactions.sort((left, right) => new Date(right.rawDate || right.date) - new Date(left.rawDate || left.date));
    return res.json({ success: true, data: audit });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/fee/class-structures
const getClassFeeStructures = async (req, res) => {
  try {
    const classes = await Class.find().sort({ name: 1 }).populate('classTeacher', 'name');
    const data = classes.map((c) => {
      const monthlyFee = Number(c.monthlyFee || 0);
      const addFees = Array.isArray(c.additionalFees) ? c.additionalFees : [];
      const additionalTotal = addFees.reduce((sum, item) => sum + Number(item.amount || 0), 0);
      const totalMonthlyFee = monthlyFee + additionalTotal;
      return {
        _id: c._id,
        name: c.name,
        academicYear: c.academicYear || '2083',
        classTeacher: c.classTeacher?.name || 'Unassigned',
        monthlyFee,
        additionalFees: addFees,
        additionalTotal,
        totalMonthlyFee,
      };
    });
    return res.json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// POST /api/fee/class-structure
const updateClassFeeStructure = async (req, res) => {
  try {
    const { classId, monthlyFee, additionalFees, academicYear } = req.body;
    if (!classId) {
      return res.status(400).json({ success: false, message: 'Class ID is required' });
    }

    const classRecord = await Class.findById(classId);
    if (!classRecord) {
      return res.status(404).json({ success: false, message: 'Class not found' });
    }

    if (academicYear && academicYear.trim()) {
      classRecord.academicYear = academicYear.trim();
    }

    const numMonthly = Number(monthlyFee);
    if (!Number.isFinite(numMonthly) || numMonthly <= 0) {
      return res.status(400).json({ success: false, message: 'Compulsory base monthly tuition fee is required and must be greater than 0.' });
    }
    classRecord.monthlyFee = numMonthly;

    if (Array.isArray(additionalFees)) {
      const formatted = [];
      for (const item of additionalFees) {
        const title = item.title?.trim();
        const amount = Number(item.amount);
        const month = item.month?.trim() || 'Baishakh';
        if (title && Number.isFinite(amount) && amount >= 0) {
          formatted.push({ title, amount, month });
        }
      }
      classRecord.additionalFees = formatted;
    }

    await classRecord.save();

    const addFees = Array.isArray(classRecord.additionalFees) ? classRecord.additionalFees : [];
    const additionalTotal = addFees.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const totalMonthlyFee = Number(classRecord.monthlyFee || 0) + additionalTotal;

    return res.json({
      success: true,
      message: `Fee structure updated for ${classRecord.name}`,
      data: {
        _id: classRecord._id,
        name: classRecord.name,
        academicYear: classRecord.academicYear || '2083',
        monthlyFee: classRecord.monthlyFee,
        additionalFees: classRecord.additionalFees,
        additionalTotal,
        totalMonthlyFee,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const NEPALI_MONTH_NAMES = [
  'Baishakh',
  'Jestha',
  'Ashadh',
  'Shrawan',
  'Bhadra',
  'Ashwin',
  'Kartik',
  'Mangsir',
  'Poush',
  'Magh',
  'Falgun',
  'Chaitra',
];

// GET /api/fees/current-month-status
const getCurrentMonthStudentFeeStatus = async (req, res) => {
  try {
    const today = new NepaliDate();
    const currentMonthIndex = today.getMonth() + 1; // 1-indexed (1: Baishakh ... 12: Chaitra)
    const currentMonthName = NEPALI_MONTH_NAMES[currentMonthIndex - 1] || 'Baishakh';
    const elapsedMonths = currentMonthIndex; // Months elapsed since Baishakh (inclusive)

    const students = await Student.find()
      .populate('user', 'name username phone')
      .populate('parent', 'name phone')
      .populate('class', 'name monthlyFee additionalFees academicYear')
      .sort({ rollNumber: 1 });

    const studentIds = students.map((s) => s._id);
    const fees = await Fee.find({ student: { $in: studentIds } });

    const feesByStudent = new Map();
    fees.forEach((fee) => {
      const sId = String(fee.student);
      if (!feesByStudent.has(sId)) {
        feesByStudent.set(sId, []);
      }
      feesByStudent.get(sId).push(fee);
    });

    const data = students.map((s) => {
      const classObj = s.class;
      const baseMonthly = Number(classObj?.monthlyFee || 0);
      const addFees = Array.isArray(classObj?.additionalFees) ? classObj.additionalFees : [];
      const previousArrears = Number(s.previousYearArrears || 0);

      // Cumulative base tuition from Baishakh to current month
      const cumulativeBaseFee = baseMonthly * elapsedMonths;

      // Filter additional fees up to current month B.S.
      const formattedAdditionalFees = addFees
        .filter((item) => {
          const itemMonthIndex = NEPALI_MONTH_NAMES.indexOf(item.month) + 1;
          const monthNum = itemMonthIndex > 0 ? itemMonthIndex : 1;
          return monthNum <= currentMonthIndex;
        })
        .map((f) => ({
          title: f.title,
          amount: Number(f.amount || 0),
          month: f.month || 'Baishakh',
        }));

      // If previous session arrears exist, prepend as an itemized entry
      if (previousArrears > 0) {
        const prevLabel = reqYear ? `${Number(reqYear) - 1} B.S.` : 'Previous Session';
        formattedAdditionalFees.unshift({
          title: `Previous Session Arrears (${prevLabel} Dues)`,
          amount: previousArrears,
          month: 'Baishakh',
        });
      }

      const applicableAdditionalTotal = formattedAdditionalFees.reduce(
        (sum, item) => sum + Number(item.amount || 0),
        0
      );

      // Total Cumulative Invoiced Up to Current Month
      const totalInvoicedUpToCurrentMonth = cumulativeBaseFee + applicableAdditionalTotal;

      const studentFees = feesByStudent.get(String(s._id)) || [];
      const totalPaid = studentFees.reduce((sum, f) => sum + Number(f.amountPaid || 0), 0);
      const remainingBalance = Math.max(0, totalInvoicedUpToCurrentMonth - totalPaid);

      let status = 'unpaid';
      if (totalPaid >= totalInvoicedUpToCurrentMonth && totalInvoicedUpToCurrentMonth > 0) {
        status = 'cleared';
      } else if (totalPaid > 0) {
        status = 'partial';
      }

      return {
        studentId: s._id,
        name: s.user?.name || 'Student',
        username: s.user?.username || '',
        rollNumber: s.rollNumber || '—',
        className: classObj?.name || 'Unassigned',
        classId: classObj?._id,
        fatherName: s.fatherName || s.parent?.name || '—',
        phone: s.parent?.phone || s.user?.phone || '—',
        baseMonthly,
        elapsedMonths,
        cumulativeBaseFee,
        applicableAdditionalTotal,
        applicableAdditionalFees: formattedAdditionalFees,
        previousYearArrears: previousArrears,
        totalInvoiced: totalInvoicedUpToCurrentMonth,
        totalPaid,
        remainingBalance,
        status,
        currentMonthName,
        currentMonthIndex,
        recentFeeId: studentFees[0]?._id,
        recentReceiptNo: studentFees[0]?.transactions?.slice(-1)[0]?.receiptNo || '',
      };
    });

    // Sort naturally by class then roll number
    data.sort((a, b) => {
      if (a.className !== b.className) return a.className.localeCompare(b.className);
      const numA = parseInt(String(a.rollNumber).replace(/\D/g, ''), 10) || 0;
      const numB = parseInt(String(b.rollNumber).replace(/\D/g, ''), 10) || 0;
      return numA - numB;
    });

    return res.json({
      success: true,
      data,
      meta: {
        currentMonthName,
        currentMonthIndex,
        elapsedMonths,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// POST /api/fees/record-direct-payment
const recordDirectPayment = async (req, res) => {
  try {
    const { studentId, amountPaid, paymentMethod, receiptNo, academicYear } = req.body;
    const amount = Number(amountPaid);

    if (!studentId || !Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ success: false, message: 'Student ID and a positive payment amount are required' });
    }

    const student = await Student.findById(studentId)
      .populate('user', 'name')
      .populate('parent', 'name phone')
      .populate('class', 'name monthlyFee additionalFees academicYear');
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    let fee = await Fee.findOne({ student: student._id }).sort({ createdAt: -1 });
    const activeYear = academicYear || student.class?.academicYear || '2083';

    if (!fee) {
      const baseMonthly = Number(student.class?.monthlyFee || 0);
      const addFees = Array.isArray(student.class?.additionalFees) ? student.class.additionalFees : [];
      const addTotal = addFees.reduce((sum, f) => sum + Number(f.amount || 0), 0);
      const totalDue = baseMonthly + addTotal || amount;

      fee = await Fee.create({
        student: student._id,
        academicYear: activeYear,
        feeType: 'tuition',
        amountDue: totalDue,
        amountPaid: 0,
      });
    }

    fee.amountPaid += amount;
    const cleanReceiptNo = await getNextSequentialReceiptNo();

    fee.transactions.push({
      amount,
      paymentMethod: paymentMethod || 'cash',
      receiptNo: cleanReceiptNo,
      date: new Date(),
    });

    await fee.save();

    // Calculate full cumulative fee breakdown up to current Nepali month
    const today = new NepaliDate();
    const currentMonthIndex = today.getMonth() + 1;
    const currentMonthName = NEPALI_MONTH_NAMES[currentMonthIndex - 1] || 'Baishakh';
    const elapsedMonths = currentMonthIndex;

    const baseMonthly = Number(student.class?.monthlyFee || 0);
    const cumulativeBaseFee = baseMonthly * elapsedMonths;
    const addFees = Array.isArray(student.class?.additionalFees) ? student.class.additionalFees : [];
    const previousArrears = Number(student.previousYearArrears || 0);

    const formattedAdditionalFees = addFees
      .filter((item) => {
        const itemMonthIndex = NEPALI_MONTH_NAMES.indexOf(item.month) + 1;
        const monthNum = itemMonthIndex > 0 ? itemMonthIndex : 1;
        return monthNum <= currentMonthIndex;
      })
      .map((f) => ({
        title: f.title,
        amount: Number(f.amount || 0),
        month: f.month || 'Baishakh',
      }));

    if (previousArrears > 0) {
      formattedAdditionalFees.unshift({
        title: 'Previous Session Arrears',
        amount: previousArrears,
        month: 'Baishakh',
      });
    }

    const applicableAdditionalTotal = formattedAdditionalFees.reduce(
      (sum, item) => sum + Number(item.amount || 0),
      0
    );

    const totalInvoiced = cumulativeBaseFee + applicableAdditionalTotal;
    const remainingBalance = Math.max(0, totalInvoiced - fee.amountPaid);
    const fatherName = student.fatherName || student.parent?.name || '—';
    const periodCovered = currentMonthIndex === 1 ? 'Baishakh' : `Baishakh to ${currentMonthName}`;

    const priorTransactions = fee.transactions
      .filter((t) => t.receiptNo !== cleanReceiptNo)
      .map((t) => {
        let dateBS = '—';
        try {
          dateBS = new NepaliDate(new Date(t.date)).format('YYYY-MM-DD');
        } catch (e) {
          dateBS = new Date(t.date).toLocaleDateString();
        }
        return {
          amount: Number(t.amount || 0),
          receiptNo: t.receiptNo || '—',
          paymentMethod: t.paymentMethod || 'cash',
          dateBS: dateBS,
        };
      });

    return res.json({
      success: true,
      message: `Payment of NPR ${amount} recorded for ${student.user?.name || 'Student'}`,
      receipt: {
        receiptNo: cleanReceiptNo,
        studentName: student.user?.name || 'Student',
        className: student.class?.name || 'Class',
        rollNumber: student.rollNumber || '—',
        fatherName: fatherName,
        amountPaid: amount,
        paymentMethod: paymentMethod || 'cash',
        date: new Date().toLocaleDateString(),
        dateBS: today.format('YYYY-MM-DD'),
        periodCovered: periodCovered,
        baseMonthly: baseMonthly,
        elapsedMonths: elapsedMonths,
        cumulativeBaseFee: cumulativeBaseFee,
        applicableAdditionalFees: formattedAdditionalFees,
        applicableAdditionalTotal: applicableAdditionalTotal,
        totalInvoiced: totalInvoiced,
        totalPaidPrior: Math.max(0, fee.amountPaid - amount),
        priorTransactions: priorTransactions,
        totalPaidCumulative: fee.amountPaid,
        remainingBalance: remainingBalance,
        academicYear: `${activeYear} B.S.`,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const downloadReceiptPdf = async (req, res) => {
  try {
    const rawReceiptNo = req.params.receiptNo || req.query.receiptNo || 'REC-0001';
    const cleanReceiptNo = String(rawReceiptNo).trim().replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `${cleanReceiptNo}.pdf`;

    let txData = null;
    const fees = await Fee.find().populate({
      path: 'student',
      populate: [
        { path: 'user', select: 'name' },
        { path: 'class', select: 'name monthlyFee additionalFees academicYear' },
        { path: 'parent', select: 'name phone' },
      ],
    });

    const today = new NepaliDate();
    const currentMonthIndex = today.getMonth() + 1;
    const currentMonthName = NEPALI_MONTH_NAMES[currentMonthIndex - 1] || 'Baishakh';
    const elapsedMonths = currentMonthIndex;
    const periodCovered = currentMonthIndex === 1 ? 'Baishakh' : `Baishakh to ${currentMonthName}`;

    fees.forEach((fee) => {
      const student = fee.student;
      if (!student) return;

      const baseMonthly = Number(student.class?.monthlyFee || 0);
      const cumulativeBaseFee = baseMonthly * elapsedMonths;
      const addFees = Array.isArray(student.class?.additionalFees) ? student.class.additionalFees : [];
      const previousArrears = Number(student.previousYearArrears || 0);

      const formattedAdditionalFees = addFees
        .filter((item) => {
          const itemMonthIndex = NEPALI_MONTH_NAMES.indexOf(item.month) + 1;
          const monthNum = itemMonthIndex > 0 ? itemMonthIndex : 1;
          return monthNum <= currentMonthIndex;
        })
        .map((f) => ({
          title: f.title,
          amount: Number(f.amount || 0),
          month: f.month || 'Baishakh',
        }));

      if (previousArrears > 0) {
        formattedAdditionalFees.unshift({
          title: 'Previous Session Arrears',
          amount: previousArrears,
          month: 'Baishakh',
        });
      }

      const applicableAdditionalTotal = formattedAdditionalFees.reduce(
        (sum, item) => sum + Number(item.amount || 0),
        0
      );

      const totalInvoiced = cumulativeBaseFee + applicableAdditionalTotal;

      (fee.transactions || []).forEach((t) => {
        if (String(t.receiptNo).toUpperCase() === String(rawReceiptNo).toUpperCase()) {
          let dateBS = '2083-01-15';
          try {
            dateBS = new NepaliDate(new Date(t.date)).format('YYYY-MM-DD');
          } catch (e) {}

          const txAmount = Number(t.amount || 0);
          const remainingBalance = Math.max(0, totalInvoiced - fee.amountPaid);

          txData = {
            receiptNo: t.receiptNo,
            studentName: student.user?.name || 'Student',
            className: student.class?.name || 'Class',
            rollNumber: student.rollNumber || '—',
            fatherName: student.fatherName || student.parent?.name || '—',
            amountPaid: txAmount,
            paymentMethod: t.paymentMethod || 'cash',
            dateBS: dateBS,
            dateAD: new Date(t.date).toLocaleDateString(),
            academicYear: `${student.class?.academicYear || '2083'} B.S.`,
            periodCovered: periodCovered,
            baseMonthly: baseMonthly,
            elapsedMonths: elapsedMonths,
            cumulativeBaseFee: cumulativeBaseFee,
            applicableAdditionalFees: formattedAdditionalFees,
            totalInvoiced: totalInvoiced,
            totalPaidPrior: Math.max(0, fee.amountPaid - txAmount),
            remainingBalance: remainingBalance,
          };
        }
      });
    });

    if (!txData) {
      txData = {
        receiptNo: cleanReceiptNo,
        studentName: req.query.studentName || 'Student',
        className: req.query.className || 'Class',
        rollNumber: req.query.rollNumber || '—',
        fatherName: req.query.fatherName || '—',
        amountPaid: Number(req.query.amountPaid || 0),
        paymentMethod: req.query.paymentMethod || 'cash',
        dateBS: req.query.dateBS || '2083-01-15',
        dateAD: new Date().toLocaleDateString(),
        academicYear: '2083 B.S.',
        periodCovered: 'Baishakh B.S.',
        baseMonthly: 0,
        elapsedMonths: 1,
        cumulativeBaseFee: 0,
        applicableAdditionalFees: [],
        totalInvoiced: Number(req.query.amountPaid || 0),
        totalPaidPrior: 0,
        remainingBalance: 0,
      };
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    const doc = new PDFDocument({ size: 'A4', margin: 36 });
    doc.pipe(res);

    doc.rect(30, 30, 535, 782).lineWidth(2).stroke('#8A1538');

    doc.fillColor('#8A1538').fontSize(18).font('Helvetica-Bold').text('Yashoda Prem Shishu Sadan', 45, 48);
    doc.fillColor('#4A5568').fontSize(9).font('Helvetica').text('Pra. Ko. Mahuwa, Dhanusha • Secondary Academic Level', 45, 70);

    doc.fillColor('#8A1538').fontSize(14).font('Helvetica-Bold').text('FEE RECEIPT', 45, 48, { width: 505, align: 'right' });
    doc.fillColor('#111111').fontSize(10).font('Helvetica-Bold').text(`Ref No: ${txData.receiptNo}`, 45, 66, { width: 505, align: 'right' });
    doc.fillColor('#666666').fontSize(9).font('Helvetica').text(`Date: ${txData.dateBS} B.S.`, 45, 80, { width: 505, align: 'right' });

    doc.moveTo(45, 96).lineTo(550, 96).strokeColor('#8A1538').lineWidth(1.5).stroke();

    doc.rect(45, 106, 505, 74).fillAndStroke('#FDFBF7', '#EADEC9');
    
    doc.fillColor('#8A1538').fontSize(9.5).font('Helvetica-Bold').text('Student Name:', 55, 116);
    doc.fillColor('#222222').fontSize(9.5).font('Helvetica').text(txData.studentName, 150, 116);

    doc.fillColor('#8A1538').fontSize(9.5).font('Helvetica-Bold').text('Academic Session:', 320, 116);
    doc.fillColor('#222222').fontSize(9.5).font('Helvetica').text(txData.academicYear, 420, 116);

    doc.fillColor('#8A1538').fontSize(9.5).font('Helvetica-Bold').text('Class & Roll:', 55, 134);
    doc.fillColor('#222222').fontSize(9.5).font('Helvetica').text(`${txData.className} (Roll #${txData.rollNumber})`, 150, 134);

    doc.fillColor('#8A1538').fontSize(9.5).font('Helvetica-Bold').text('Payment Mode:', 320, 134);
    doc.fillColor('#222222').fontSize(9.5).font('Helvetica').text(String(txData.paymentMethod).toUpperCase(), 420, 134);

    doc.fillColor('#8A1538').fontSize(9.5).font('Helvetica-Bold').text('Father / Guardian:', 55, 152);
    doc.fillColor('#222222').fontSize(9.5).font('Helvetica').text(txData.fatherName, 150, 152);

    doc.fillColor('#8A1538').fontSize(9.5).font('Helvetica-Bold').text('Period Billed:', 320, 152);
    doc.fillColor('#222222').fontSize(9.5).font('Helvetica').text(txData.periodCovered, 420, 152);

    let y = 195;
    doc.rect(45, y, 505, 22).fill('#8A1538');
    doc.fillColor('#FFFFFF').fontSize(9).font('Helvetica-Bold').text('S.N.', 55, y + 6);
    doc.text('Particulars / Description', 95, y + 6);
    doc.text('Amount (NPR)', 410, y + 6, { width: 130, align: 'right' });

    y += 22;
    let rowNum = 1;

    if (txData.baseMonthly > 0 || txData.cumulativeBaseFee > 0) {
      doc.rect(45, y, 505, 22).fillAndStroke('#FFFFFF', '#EADEC9');
      doc.fillColor('#333333').fontSize(9).font('Helvetica').text(String(rowNum++), 55, y + 6);
      doc.font('Helvetica-Bold').text(`Tuition Fee (${txData.periodCovered})`, 95, y + 6);
      doc.font('Helvetica-Bold').text(`NPR ${Number(txData.cumulativeBaseFee).toLocaleString('en-US', { minimumFractionDigits: 2 })}`, 410, y + 6, { width: 130, align: 'right' });
      y += 22;
    }

    if (Array.isArray(txData.applicableAdditionalFees)) {
      txData.applicableAdditionalFees.forEach((fee) => {
        doc.rect(45, y, 505, 22).fillAndStroke('#FAFAFA', '#EADEC9');
        doc.fillColor('#333333').fontSize(9).font('Helvetica').text(String(rowNum++), 55, y + 6);
        doc.font('Helvetica-Bold').text(`${fee.title} (${fee.month || 'Baishakh'})`, 95, y + 6);
        doc.font('Helvetica-Bold').text(`NPR ${Number(fee.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}`, 410, y + 6, { width: 130, align: 'right' });
        y += 22;
      });
    }

    if (rowNum === 1) {
      doc.rect(45, y, 505, 22).fillAndStroke('#FFFFFF', '#EADEC9');
      doc.fillColor('#333333').fontSize(9).font('Helvetica').text('1', 55, y + 6);
      doc.font('Helvetica-Bold').text('School Tuition & Academic Fee Payment', 95, y + 6);
      doc.font('Helvetica-Bold').text(`NPR ${Number(txData.amountPaid).toLocaleString('en-US', { minimumFractionDigits: 2 })}`, 410, y + 6, { width: 130, align: 'right' });
      y += 22;
    }

    doc.rect(45, y, 505, 22).fillAndStroke('#FDFBF7', '#EADEC9');
    doc.fillColor('#333333').fontSize(9).font('Helvetica-Bold').text('Total Invoiced Dues (Up to Current Month):', 95, y + 6);
    doc.fillColor('#111111').text(`NPR ${Number(txData.totalInvoiced || txData.amountPaid).toLocaleString('en-US', { minimumFractionDigits: 2 })}`, 410, y + 6, { width: 130, align: 'right' });
    y += 22;

    doc.rect(45, y, 505, 24).fillAndStroke('#FFF0F3', '#8A1538');
    doc.fillColor('#8A1538').fontSize(10).font('Helvetica-Bold').text('CURRENT AMOUNT PAID THIS RECEIPT:', 95, y + 7);
    doc.text(`NPR ${Number(txData.amountPaid).toLocaleString('en-US', { minimumFractionDigits: 2 })}`, 410, y + 7, { width: 130, align: 'right' });
    y += 32;

    const isCleared = Number(txData.remainingBalance) <= 0;

    doc.rect(45, y, 320, 42).fillAndStroke('#FDFBF7', '#EADEC9');
    doc.fillColor('#8A1538').fontSize(8.5).font('Helvetica-Bold').text('Current Amount Received:', 53, y + 6);
    doc.fillColor('#111111').fontSize(9.5).font('Helvetica-Bold').text(`NPR ${Number(txData.amountPaid).toLocaleString('en-US', { minimumFractionDigits: 2 })} Paid via ${String(txData.paymentMethod).toUpperCase()}`, 53, y + 20, { width: 304 });

    const statusBg = isCleared ? '#DCFCE7' : '#FEF3C7';
    const statusText = isCleared ? '#15803D' : '#B45309';
    const statusLabel = isCleared ? 'STATUS: FULL CLEARED' : `REMAINING DUE: NPR ${Number(txData.remainingBalance).toLocaleString()}`;

    doc.rect(375, y, 175, 42).fillAndStroke(statusBg, statusText);
    doc.fillColor(statusText).fontSize(8.5).font('Helvetica-Bold').text(statusLabel, 380, y + 16, { align: 'center', width: 165 });

    y += 75;

    doc.moveTo(70, y).lineTo(180, y).strokeColor('#8A1538').lineWidth(1).stroke();
    doc.fillColor('#4A5568').fontSize(8.5).font('Helvetica-Bold').text('Student / Parent', 70, y + 4, { width: 110, align: 'center' });

    doc.circle(297, y - 10, 22).strokeColor('#8A1538').lineWidth(1).stroke();
    doc.fillColor('#8A1538').fontSize(7.5).font('Helvetica-Bold').text('SEAL', 277, y - 14, { width: 40, align: 'center' });

    doc.moveTo(415, y).lineTo(525, y).strokeColor('#8A1538').lineWidth(1).stroke();
    doc.fillColor('#4A5568').fontSize(8.5).font('Helvetica-Bold').text('Cashier / Accountant', 415, y + 4, { width: 110, align: 'center' });

    doc.fillColor('#888888').fontSize(8).font('Helvetica').text('Official Computer Generated Fee Receipt • Yashoda Prem Shishu Sadan, Pra. Ko. Mahuwa (Dhanusha)', 45, 770, { align: 'center', width: 505 });

    doc.end();
  } catch (error) {
    console.error('PDF Generation Error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

const pushFeeAlerts = async (req, res) => {
  try {
    const students = await Student.find().populate('user class parent');
    const allFees = await Fee.find().lean();
    const Notice = require('../models/Notice');
    const { notifyNoticePublished } = require('../utils/pushNotifier');

    let totalNotified = 0;
    let grandOutstanding = 0;

    for (const student of students) {
      const studentFees = allFees.filter((f) => String(f.student) === String(student._id));
      const totalDue = studentFees.reduce((acc, f) => acc + (f.amountDue || 0), 0);
      const totalPaid = studentFees.reduce((acc, f) => acc + (f.amountPaid || 0), 0);
      const remaining = Math.max(0, totalDue - totalPaid);

      if (remaining > 0) {
        grandOutstanding += remaining;
        totalNotified++;

        const studentName = student.user?.name || 'Student';
        const className = student.class?.name || 'Class';
        const nepaliDateStr = new NepaliDate(new Date()).format('YYYY-MM-DD');

        const targetUserIds = [];
        if (student.user?._id) targetUserIds.push(student.user._id);
        if (student.parent?._id) targetUserIds.push(student.parent._id);
        else if (student.parent) targetUserIds.push(student.parent);

        const notice = await Notice.create({
          title: `📢 Fee Reminder: ${studentName}`,
          content: `Dear Parent & Student,\nThis is a fee reminder for ${studentName} (${className}, Roll #${student.rollNumber || '—'}).\nTotal Remaining Fee Balance: NPR ${remaining.toLocaleString()}.\nKindly make payment at the school accounts section or via direct bank transfer at your earliest convenience. Thank you!\n\n— Yashoda Prem Shishu Sadan Administration`,
          category: 'fee',
          audience: 'individual',
          targetUsers: targetUserIds,
          targetStudent: student._id,
          postedBy: req.user?._id || null,
          dateBS: `${nepaliDateStr} B.S.`,
        });

        // Dispatch push notification directly to targeted student & parent devices only
        notifyNoticePublished({ notice, sender: req.user }).catch((err) => {
          console.warn('[FeeController] Failed to dispatch fee notice push notification:', err.message);
        });
      }
    }

    return res.json({
      success: true,
      message: `Fee reminder push notifications sent to ${totalNotified} student and parent accounts.`,
      count: totalNotified,
      grandOutstanding,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const { checkAndTriggerMonthlyFeeNotifications } = require('../utils/monthlyFeeScheduler');

const triggerMonthlyFeeCron = async (req, res) => {
  try {
    if (process.env.CRON_SECRET) {
      const authHeader = req.headers.authorization;
      if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return res.status(401).json({ success: false, message: 'Unauthorized cron request' });
      }
    }
    const force = req.query.force === 'true' || req.body?.force === true;
    const result = await checkAndTriggerMonthlyFeeNotifications(force);
    return res.json({ success: true, ...result });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
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
  triggerMonthlyFeeCron,
};
