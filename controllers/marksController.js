const Marks = require('../models/Marks');
const Student = require('../models/Student');
const Class = require('../models/Class');
const ExamConfig = require('../models/ExamConfig');
const QuestionPaper = require('../models/QuestionPaper');
const { generateMarksCardPDF } = require('../utils/pdfGenerator');
const path = require('path');
const fs = require('fs');

const hasSameId = (left, right) => String(left?._id || left || '') === String(right?._id || right || '');

const canViewStudent = async (user, student) => {
  if (user.role === 'principal') return true;
  if (user.role === 'student') return hasSameId(student.user, user._id);
  if (user.role === 'parent') return !!student.parent && hasSameId(student.parent, user._id);
  if (user.role === 'teacher') {
    const classItem = await Class.findById(student.class?._id || student.class);
    return !!classItem && classItem.subjects.some((subject) => hasSameId(subject.teacher, user._id));
  }
  return false;
};

const enterMarks = async (req, res) => {
  const studentId = req.body.studentId;
  const classId = req.body.classId;
  const subject = req.body.subject?.trim();
  const academicYear = req.body.academicYear?.trim();
  const terminal = Number(req.body.terminal);
  const marksObtained = Number(req.body.marksObtained);

  if (!studentId || !classId || !subject || !academicYear || ![1, 2, 3, 4].includes(terminal) || marksObtained === undefined || isNaN(marksObtained)) {
    return res.status(400).json({ success: false, message: 'Student, class, subject, year, terminal, and valid obtained marks are required' });
  }

  try {
    const [student, classItem] = await Promise.all([
      Student.findById(studentId),
      Class.findById(classId),
    ]);
    if (!student || !classItem || !hasSameId(student.class, classItem._id)) {
      return res.status(400).json({ success: false, message: 'The student does not belong to the selected class' });
    }
    const classSubject = classItem.subjects.find((item) => item.name.toLowerCase() === subject.toLowerCase());
    if (!classSubject) {
      return res.status(400).json({ success: false, message: 'The selected subject is not configured for this class' });
    }
    if (req.user.role === 'teacher' && !hasSameId(classSubject.teacher, req.user._id)) {
      return res.status(403).json({ success: false, message: 'You are not assigned to enter marks for this subject' });
    }

    // Verify and retrieve exam configuration
    let examConfig = await ExamConfig.findOne({
      class: classItem._id,
      subject: classSubject.name,
      terminal,
      academicYear,
    });

    if (!examConfig) {
      const paper = await QuestionPaper.findOne({
        class: classItem._id,
        subject: new RegExp(`^${classSubject.name}$`, 'i'),
        examTerm: terminal,
      }).sort({ createdAt: -1 });

      if (paper) {
        examConfig = {
          fullMarks: paper.fullMarks || 100,
          passMarks: paper.passMarks || 40,
        };
      } else {
        examConfig = {
          fullMarks: 100,
          passMarks: 40,
        };
      }
    }

    if (marksObtained < 0 || marksObtained > examConfig.fullMarks) {
      return res.status(400).json({ success: false, message: `Marks obtained must be between 0 and full marks of ${examConfig.fullMarks}` });
    }

    let markRecord = await Marks.findOne({ student: student._id, class: classItem._id, subject: classSubject.name, academicYear, terminal });
    if (markRecord) {
      markRecord.marksObtained = marksObtained;
      markRecord.fullMarks = examConfig.fullMarks;
      markRecord.passMarks = examConfig.passMarks;
      markRecord.enteredBy = req.user._id;
      await markRecord.save();
    } else {
      markRecord = await Marks.create({
        student: student._id,
        class: classItem._id,
        subject: classSubject.name,
        academicYear,
        terminal,
        marksObtained,
        fullMarks: examConfig.fullMarks,
        passMarks: examConfig.passMarks,
        enteredBy: req.user._id,
      });
    }
    return res.json({ success: true, data: markRecord });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const getStudentMarks = async (req, res) => {
  try {
    const student = await Student.findById(req.params.studentId).populate({ path: 'user', select: 'name username' });
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }
    if (!(await canViewStudent(req.user, student))) {
      return res.status(403).json({ success: false, message: 'You are not authorized to view these marks' });
    }
    const marks = await Marks.find({ student: student._id }).sort({ academicYear: -1, terminal: 1, subject: 1 });
    return res.json({ success: true, data: marks });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const getClassMarks = async (req, res) => {
  const subject = req.query.subject?.trim();
  const terminal = Number(req.query.terminal);
  const academicYear = req.query.academicYear?.trim();
  if (!subject || !academicYear || ![1, 2, 3, 4].includes(terminal)) {
    return res.status(400).json({ success: false, message: 'Subject, terminal, and academic year are required' });
  }

  try {
    const classItem = await Class.findById(req.params.classId);
    if (!classItem) {
      return res.status(404).json({ success: false, message: 'Class not found' });
    }
    const classSubject = classItem.subjects.find((item) => item.name.toLowerCase() === subject.toLowerCase());
    if (!classSubject) {
      return res.status(400).json({ success: false, message: 'The selected subject is not configured for this class' });
    }
    if (req.user.role === 'teacher' && !hasSameId(classSubject.teacher, req.user._id)) {
      return res.status(403).json({ success: false, message: 'You are not assigned to this subject' });
    }

    const marks = await Marks.find({ class: classItem._id, subject: classSubject.name, terminal, academicYear })
      .populate({ path: 'student', populate: { path: 'user', select: 'name username' } });
    return res.json({ success: true, data: marks });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const downloadMarksCard = async (req, res) => {
  const terminal = Number(req.query.terminal);
  const academicYear = req.query.academicYear?.trim();
  if (!academicYear || ![1, 2, 3, 4].includes(terminal)) {
    return res.status(400).json({ success: false, message: 'A valid terminal and academic year are required' });
  }

  try {
    const student = await Student.findById(req.params.studentId)
      .populate({ path: 'user', select: 'name' })
      .populate('class');
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }
    if (!(await canViewStudent(req.user, student))) {
      return res.status(403).json({ success: false, message: 'You are not authorized to download this report card' });
    }

    const marksList = await Marks.find({ student: student._id, terminal, academicYear }).sort({ subject: 1 });
    if (!marksList.length) {
      return res.status(404).json({ success: false, message: 'No marks records found for this terminal' });
    }

    const os = require('os');
    const temporaryDirectory = path.join(os.tmpdir(), 'ypss_temp_marks');
    try {
      fs.mkdirSync(temporaryDirectory, { recursive: true });
    } catch (_) {}
    const downloadName = `YPSS_${student.user.name.replace(/\s+/g, '_')}_Terminal_${terminal}.pdf`;
    const outputPath = path.join(temporaryDirectory, `${student._id}_${terminal}_${Date.now()}.pdf`);
    await generateMarksCardPDF({
      name: student.user.name,
      rollNumber: student.rollNumber,
      className: student.class?.name || 'Class',
      academicYear,
    }, marksList, terminal, outputPath);

    res.download(outputPath, downloadName, () => {
      fs.unlink(outputPath, () => {});
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const setExamConfig = async (req, res) => {
  const { classId, subject, terminal, academicYear, fullMarks, passMarks } = req.body;

  if (!classId || !subject || !terminal || !academicYear || fullMarks === undefined || passMarks === undefined) {
    return res.status(400).json({ success: false, message: 'All fields (classId, subject, terminal, academicYear, fullMarks, passMarks) are required' });
  }

  const fMarks = Number(fullMarks);
  const pMarks = Number(passMarks);

  if (isNaN(fMarks) || isNaN(pMarks) || fMarks <= 0 || pMarks < 0 || pMarks > fMarks) {
    return res.status(400).json({ success: false, message: 'Full marks must be positive, and pass marks must be valid and <= full marks' });
  }

  try {
    const classItem = await Class.findById(classId);
    if (!classItem) {
      return res.status(404).json({ success: false, message: 'Class not found' });
    }
    const classSubject = classItem.subjects.find((item) => item.name.toLowerCase() === subject.trim().toLowerCase());
    if (!classSubject) {
      return res.status(400).json({ success: false, message: 'The selected subject is not configured for this class' });
    }
    if (req.user.role === 'teacher' && !hasSameId(classSubject.teacher, req.user._id)) {
      return res.status(403).json({ success: false, message: 'You are not assigned to this subject' });
    }

    let config = await ExamConfig.findOne({
      class: classItem._id,
      subject: classSubject.name,
      terminal: Number(terminal),
      academicYear: academicYear.trim(),
    });

    if (config) {
      config.fullMarks = fMarks;
      config.passMarks = pMarks;
      config.configuredBy = req.user._id;
      await config.save();
    } else {
      config = await ExamConfig.create({
        class: classItem._id,
        subject: classSubject.name,
        terminal: Number(terminal),
        academicYear: academicYear.trim(),
        fullMarks: fMarks,
        passMarks: pMarks,
        configuredBy: req.user._id,
      });
    }

    return res.json({ success: true, data: config });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const getExamConfig = async (req, res) => {
  const { classId, subject, terminal, academicYear } = req.query;

  if (!classId || !subject || !terminal || !academicYear) {
    return res.status(400).json({ success: false, message: 'classId, subject, terminal, and academicYear are required' });
  }

  try {
    let config = await ExamConfig.findOne({
      class: classId,
      subject: subject.trim(),
      terminal: Number(terminal),
      academicYear: academicYear.trim(),
    });

    if (!config) {
      const paper = await QuestionPaper.findOne({
        class: classId,
        subject: new RegExp(`^${subject.trim()}$`, 'i'),
        examTerm: Number(terminal),
      }).sort({ createdAt: -1 });

      if (paper) {
        config = {
          class: classId,
          subject: subject.trim(),
          terminal: Number(terminal),
          academicYear: academicYear.trim(),
          fullMarks: paper.fullMarks || 100,
          passMarks: paper.passMarks || 40,
        };
      }
    }

    if (!config) {
      return res.json({ success: true, data: null });
    }

    return res.json({ success: true, data: config });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const { generateStudentMarksCard } = require('../utils/marksCardDocxGenerator');
const MarksCard = require('../models/MarksCard');

const generateMarksCard = async (req, res) => {
  const { studentId, classId, terminal, academicYear } = req.body;

  if (!studentId || !terminal) {
    return res.status(400).json({ success: false, message: 'studentId and terminal are required' });
  }

  try {
    const cardResult = await generateStudentMarksCard({
      studentId,
      classId,
      terminal: Number(terminal),
      academicYear: academicYear || '2083 B.S.',
    });

    return res.json({ success: true, data: cardResult });
  } catch (error) {
    console.error('[GenerateMarksCard Error]:', error.message);
    return res.status(500).json({ success: false, message: error.message || 'Could not generate marks card' });
  }
};

const Attendance = require('../models/Attendance');

const generateClassMarksCards = async (req, res) => {
  const { classId, terminal, academicYear } = req.body;
  if (!classId || !terminal) {
    return res.status(400).json({ success: false, message: 'classId and terminal are required' });
  }

  try {
    const classItem = await Class.findById(classId);
    if (!classItem) {
      return res.status(404).json({ success: false, message: 'Class not found' });
    }

    const students = await Student.find({ class: classId })
      .populate({ path: 'user', select: 'name username' })
      .populate({ path: 'parent', select: 'name' });

    if (!students.length) {
      return res.status(400).json({ success: false, message: 'No students enrolled in this class' });
    }

    const yrStr = String(academicYear || '2083').replace(/\s*B\.S\./i, '').trim();
    const yrPattern = new RegExp(`^${yrStr}`, 'i');
    const termNum = Number(terminal);

    const [allClassMarks, attendanceRecords] = await Promise.all([
      Marks.find({ class: classItem._id, terminal: termNum, academicYear: yrPattern }),
      Attendance.find({ class: classItem._id }),
    ]);

    const results = [];
    const errors = [];

    for (const student of students) {
      try {
        const cardResult = await generateStudentMarksCard({
          studentId: student._id,
          classId: classItem._id,
          terminal: termNum,
          academicYear: academicYear || '2083 B.S.',
          preloadedStudent: student,
          preloadedClass: classItem,
          preloadedAllClassMarks: allClassMarks,
          preloadedAttendanceRecords: attendanceRecords,
        });
        results.push(cardResult);
      } catch (err) {
        console.error(`[Bulk Generate] Failed for student ${student.user?.name || student._id}:`, err.message);
        errors.push({ studentId: student._id, studentName: student.user?.name || 'Student', error: err.message });
      }
    }

    if (results.length === 0 && errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Could not generate marks cards: ${errors[0]?.error || 'Compilation failed'}`,
        errors,
      });
    }

    return res.json({
      success: true,
      message: `Generated ${results.length} of ${students.length} student marks cards for ${classItem.name}.`,
      generatedCount: results.length,
      totalStudents: students.length,
      data: results,
      errors,
    });
  } catch (error) {
    console.error('[GenerateClassMarksCards Error]:', error.message);
    return res.status(500).json({ success: false, message: error.message || 'Could not bulk generate marks cards' });
  }
};

const publishClassMarksCards = async (req, res) => {
  const { classId, terminal, academicYear } = req.body;
  if (!classId || !terminal) {
    return res.status(400).json({ success: false, message: 'classId and terminal are required' });
  }

  try {
    const yr = academicYear || '2083 B.S.';
    const updateResult = await MarksCard.updateMany(
      { class: classId, terminal: Number(terminal), academicYear: String(yr) },
      {
        isPublished: true,
        publishedAt: new Date(),
        publishedBy: req.user._id,
      }
    );

    const publishedCount = updateResult.modifiedCount !== undefined ? updateResult.modifiedCount : updateResult.n || 0;

    return res.json({
      success: true,
      message: `Successfully published ${publishedCount} marks cards for Terminal ${terminal}.`,
      publishedCount,
    });
  } catch (error) {
    console.error('[PublishClassMarksCards Error]:', error.message);
    return res.status(500).json({ success: false, message: error.message || 'Could not publish marks cards' });
  }
};

const getClassCardsStatus = async (req, res) => {
  const { classId, terminal, academicYear } = req.query;
  if (!classId || !terminal) {
    return res.status(400).json({ success: false, message: 'classId and terminal are required' });
  }

  try {
    const classItem = await Class.findById(classId);
    if (!classItem) {
      return res.status(404).json({ success: false, message: 'Class not found' });
    }

    const yr = academicYear || '2083 B.S.';
    const students = await Student.find({ class: classId });
    const totalStudents = students.length;

    const cards = await MarksCard.find({ class: classId, terminal: Number(terminal), academicYear: String(yr) });
    const generatedCount = cards.length;
    const publishedCount = cards.filter((c) => c.isPublished).length;

    return res.json({
      success: true,
      data: {
        totalStudents,
        generatedCount,
        publishedCount,
        isFullyGenerated: totalStudents > 0 && generatedCount >= totalStudents,
        isPublished: publishedCount > 0 && publishedCount >= generatedCount,
        cards,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const getStudentPublishedCards = async (req, res) => {
  const { studentId } = req.params;
  try {
    const student = await Student.findById(studentId);
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student record not found' });
    }
    if (!(await canViewStudent(req.user, student))) {
      return res.status(403).json({ success: false, message: 'You are not authorized to view these report cards' });
    }

    const cards = await MarksCard.find({ student: student._id, isPublished: true }).sort({ academicYear: -1, terminal: 1 });
    const classItem = await Class.findById(student.class);

    const enhancedCards = await Promise.all(
      cards.map(async (card) => {
        const cardObj = card.toObject();
        const termNum = Number(card.terminal);

        const allClassMarks = await Marks.find({
          class: card.class,
          terminal: termNum,
        });

        const markSubjects = Array.from(new Set(allClassMarks.map((m) => m.subject?.trim()).filter(Boolean)));
        const classSubjects = classItem?.subjects ? classItem.subjects.map((s) => (typeof s === 'string' ? s : s.name)).filter(Boolean) : [];
        const allSubjectNames = Array.from(new Set([...markSubjects, ...classSubjects]));

        const studentMarks = allClassMarks.filter(
          (m) => String(m.student?._id || m.student) === String(student._id)
        );

        const subjects = [];
        for (const subName of allSubjectNames) {
          const subMark = studentMarks.find(
            (m) => m.subject?.trim()?.toLowerCase() === subName.trim().toLowerCase()
          );

          let fMarks = subMark?.fullMarks || 100;
          let pMarks = subMark?.passMarks || 40;

          if (!subMark && card.class) {
            const config = await ExamConfig.findOne({ class: card.class, subject: subName, terminal: termNum });
            if (config) {
              fMarks = config.fullMarks;
              pMarks = config.passMarks;
            }
          }

          const classMarksForSub = allClassMarks.filter(
            (m) => m.subject?.trim()?.toLowerCase() === subName.trim().toLowerCase()
          );
          const highest = classMarksForSub.length > 0
            ? Math.max(...classMarksForSub.map((m) => Number(m.marksObtained || 0)))
            : (subMark ? Number(subMark.marksObtained) : 0);

          subjects.push({
            subject: subName,
            fullMarks: fMarks,
            passMarks: pMarks,
            marksObtained: subMark ? Number(subMark.marksObtained) : '—',
            highestMarks: highest,
            hasRecordedMark: !!subMark,
          });
        }

        const allPublishedClassCards = await MarksCard.find({
          class: card.class,
          terminal: termNum,
          isPublished: true,
        });

        const cardTotals = {};
        allPublishedClassCards.forEach((c) => {
          cardTotals[String(c.student)] = Number(c.totalObtainedMarks || 0);
        });

        allClassMarks.forEach((m) => {
          const stIdStr = String(m.student?._id || m.student);
          if (cardTotals[stIdStr] === undefined) {
            cardTotals[stIdStr] = (cardTotals[stIdStr] || 0) + Number(m.marksObtained || 0);
          }
        });

        const enrolledStudents = await Student.find({ class: card.class });
        const sortedStudentTotals = Object.entries(cardTotals).sort((a, b) => b[1] - a[1]);
        const rankIndex = sortedStudentTotals.findIndex(([stId]) => stId === String(student._id));
        const rank = rankIndex !== -1 ? rankIndex + 1 : null;

        const totalClassStudents = Math.max(enrolledStudents.length, sortedStudentTotals.length);
        const classTopScore = sortedStudentTotals.length > 0 ? sortedStudentTotals[0][1] : Number(card.totalObtainedMarks || 0);
        const totalSum = sortedStudentTotals.reduce((acc, [, score]) => acc + score, 0);
        const classAverageScore = sortedStudentTotals.length > 0 ? Math.round(totalSum / sortedStudentTotals.length) : 0;

        return {
          ...cardObj,
          subjects,
          rank,
          totalClassStudents,
          classTopScore,
          classAverageScore,
        };
      })
    );

    return res.json({ success: true, data: enhancedCards });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const https = require('https');
const http = require('http');
const cloudinary = require('cloudinary').v2;
const { isCloudinaryConfigured } = require('../utils/cloudStorage');

const viewMarksCardPdf = async (req, res) => {
  const { cardId } = req.params;
  try {
    const card = await MarksCard.findById(cardId);
    if (!card || !card.pdfUrl) {
      return res.status(404).json({ success: false, message: 'Marks card PDF not found' });
    }

    if (!/^https?:\/\//i.test(card.pdfUrl)) {
      const localPath = path.join(__dirname, '..', card.pdfUrl);
      if (fs.existsSync(localPath)) {
        return res.sendFile(localPath);
      }
      return res.status(404).json({ success: false, message: 'Local PDF file not found' });
    }

    if (isCloudinaryConfigured()) {
      cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET,
      });
    }

    let targetStreamUrl = card.pdfUrl;
    const match = card.pdfUrl.match(/\/(?:raw|image)\/(?:upload|authenticated|private)\/(?:s--[^/]+--\/)?(?:v\d+\/)?(.+?)$/);
    if (match && match[1]) {
      const publicId = match[1];
      targetStreamUrl =
        cloudinary.utils.private_download_url(publicId, '', {
          resource_type: 'raw',
          type: 'authenticated',
        }) || card.pdfUrl;
    }

    const client = targetStreamUrl.startsWith('https') ? https : http;
    client.get(targetStreamUrl, (cloudRes) => {
      if (cloudRes.statusCode >= 400) {
        console.error(`[ViewPdf Cloudinary Error]: HTTP ${cloudRes.statusCode} for ${targetStreamUrl}`);
        return res.status(cloudRes.statusCode).json({ success: false, message: 'Cloudinary document not available' });
      }
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `inline; filename="${(card.studentName || 'Student').replace(/\s+/g, '_')}_Term_${card.terminal}.pdf"`
      );
      cloudRes.pipe(res);
    }).on('error', (err) => {
      console.error('[ViewPdf Stream Error]:', err.message);
      res.status(500).json({ success: false, message: 'Could not stream PDF file' });
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const downloadMarksCardDocxFile = async (req, res) => {
  const { cardId } = req.params;
  try {
    const card = await MarksCard.findById(cardId);
    if (!card || !card.docxUrl) {
      return res.status(404).json({ success: false, message: 'Marks card DOCX not found' });
    }

    if (!/^https?:\/\//i.test(card.docxUrl)) {
      const localPath = path.join(__dirname, '..', card.docxUrl);
      if (fs.existsSync(localPath)) {
        return res.sendFile(localPath);
      }
      return res.status(404).json({ success: false, message: 'Local DOCX file not found' });
    }

    const client = card.docxUrl.startsWith('https') ? https : http;
    client.get(card.docxUrl, (cloudRes) => {
      if (cloudRes.statusCode >= 400) {
        console.error(`[DownloadDocx Cloudinary Error]: HTTP ${cloudRes.statusCode}`);
        return res.status(cloudRes.statusCode).json({ success: false, message: 'Cloudinary document not available' });
      }
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      res.setHeader('Content-Disposition', `attachment; filename="${(card.studentName || 'Student').replace(/\s+/g, '_')}_Term_${card.terminal}.docx"`);
      cloudRes.pipe(res);
    }).on('error', (err) => {
      console.error('[DownloadDocx Stream Error]:', err.message);
      res.status(500).json({ success: false, message: 'Could not stream DOCX file' });
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
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
};
