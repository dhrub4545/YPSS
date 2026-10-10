const fs = require('fs');
const path = require('path');
const PizZip = require('pizzip');
const Student = require('../models/Student');
const Class = require('../models/Class');
const Marks = require('../models/Marks');
const ExamConfig = require('../models/ExamConfig');
const QuestionPaper = require('../models/QuestionPaper');
const Attendance = require('../models/Attendance');
const MarksCard = require('../models/MarksCard');
const { convertDocxToPdf } = require('./docToPdfConverter');
const { uploadToCloud, deleteFromCloud } = require('./cloudStorage');

const TEMPLATE_FILES = {
  1: 'first_term_markscard.docx',
  2: 'Second_term_markscard.docx',
  3: 'third_term_markscard.docx',
  4: 'final_term_markscard.docx',
};

const getGradingDetails = (percentage) => {
  const pct = Number(percentage);
  if (isNaN(pct) || pct < 0) return { grade: 'NG', gpa: '0.0', remark: 'Needs Improvement' };
  if (pct >= 90) return { grade: 'A+', gpa: '4.0', remark: 'Outstanding' };
  if (pct >= 80) return { grade: 'A', gpa: '3.6', remark: 'Excellent' };
  if (pct >= 70) return { grade: 'B+', gpa: '3.2', remark: 'Very Good' };
  if (pct >= 60) return { grade: 'B', gpa: '2.8', remark: 'Good' };
  if (pct >= 50) return { grade: 'C+', gpa: '2.4', remark: 'Satisfactory' };
  if (pct >= 40) return { grade: 'C', gpa: '2.0', remark: 'Acceptable' };
  if (pct >= 35) return { grade: 'D', gpa: '1.6', remark: 'Basic' };
  return { grade: 'NG', gpa: '0.0', remark: 'Needs Improvement' };
};

const cleanDocxXmlPlaceholders = (xml, dataMap) => {
  let cleaned = xml;

  // Remove embedded rId5 drawing runs ({sub1} vector image) inside <w:txbxContent> textboxes
  cleaned = cleaned.replace(/(<w:txbxContent>[^]*?)(<w:r\b[^>]*>(?:(?!<\/w:r>)[^])*?rId5(?:(?!<\/w:r>)[^])*?<\/w:r>)/g, (match, prefix) => prefix);

  // Strip Word proofing error tags
  cleaned = cleaned.replace(/<w:proofErr[^>]*\/>/g, '').replace(/<w:noProof[^>]*\/>/g, '');

  // Strip XML tags and remove internal whitespace inside placeholders (e.g., '{father name}' -> '{fathername}', '{sub1 rmk }' -> '{sub1rmk}')
  cleaned = cleaned.replace(/\{([^{}]*?)\}/gs, (match, p1) => {
    const noXml = p1.replace(/<[^>]+>/g, '');
    const normalized = noXml.replace(/\s+/g, '');
    return `{${normalized}}`;
  });

  // Sort keys by length DESCENDING so longer composite tags ('totalobtainedmarks', 'sub10rmk', 'sub1rmk') are replaced before short prefix keys ('sub10', 'sub1')
  const sortedKeys = Object.keys(dataMap).sort((a, b) => b.length - a.length);

  sortedKeys.forEach((key) => {
    const rawVal = String(dataMap[key] ?? '');
    const xmlVal = rawVal
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');

    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\{\\s*${escapedKey}\\s*\\}`, 'gi');
    cleaned = cleaned.replace(regex, xmlVal);
  });

  // Final Scrubbing Pass: Remove any remaining placeholders left behind in template cells
  cleaned = cleaned.replace(/\{[^{}]*?\}/gi, '');

  return cleaned;
};

const generateStudentMarksCard = async ({
  studentId,
  classId,
  terminal,
  academicYear = '2083 B.S.',
  preloadedStudent = null,
  preloadedClass = null,
  preloadedAllClassMarks = null,
  preloadedAttendanceRecords = null,
}) => {
  const termNum = Number(terminal);
  if (!TEMPLATE_FILES[termNum]) {
    throw new Error(`Invalid terminal examination term: ${terminal}`);
  }

  const student =
    preloadedStudent ||
    (await Student.findById(studentId)
      .populate({ path: 'user', select: 'name username' })
      .populate({ path: 'parent', select: 'name' }));
  if (!student) throw new Error('Student record not found');

  const classItem = preloadedClass || (await Class.findById(classId || student.class));
  if (!classItem) throw new Error('Class record not found');

  const yrStr = String(academicYear).replace(/\s*B\.S\./i, '').trim();
  const yrPattern = new RegExp(`^${yrStr}`, 'i');

  const allClassMarks =
    preloadedAllClassMarks ||
    (await Marks.find({
      class: classItem._id,
      terminal: termNum,
      academicYear: yrPattern,
    }));

  const studentMarks = allClassMarks.filter(
    (m) => String(m.student?._id || m.student) === String(student._id)
  );

  const highestMarksBySubject = {};
  allClassMarks.forEach((m) => {
    const subName = m.subject?.trim()?.toLowerCase();
    if (subName) {
      const currentHighest = highestMarksBySubject[subName] || 0;
      if (m.marksObtained > currentHighest) {
        highestMarksBySubject[subName] = m.marksObtained;
      }
    }
  });

  const attendanceRecords =
    preloadedAttendanceRecords ||
    (await Attendance.find({
      class: classItem._id,
    }));
  let totalWorkingDays = 120;
  let totalPresentDays = 112;

  if (attendanceRecords.length) {
    totalWorkingDays = attendanceRecords.length;
    let presentCount = 0;
    attendanceRecords.forEach((rec) => {
      const stAtt = rec.records?.find((r) => String(r.student) === String(student._id));
      if (stAtt && stAtt.status === 'present') {
        presentCount++;
      }
    });
    if (presentCount > 0) totalPresentDays = presentCount;
  }

  const attendancePct = ((totalPresentDays / Math.max(1, totalWorkingDays)) * 100).toFixed(1);

  const subjectsList = classItem.subjects?.length
    ? classItem.subjects.map((s) => s.name)
    : Array.from(new Set(studentMarks.map((m) => m.subject)));

  const sName = student.user?.name || student.name || '—';
  const fName = student.fatherName || student.parent?.name || '—';
  const cName = classItem.name || 'Class';
  const rNo = String(student.rollNumber || '1');
  const yr = String(academicYear || '2083 B.S.').endsWith('B.S.') ? String(academicYear) : `${academicYear} B.S.`;

  const dataMap = {
    'name': sName,
    'student name': sName,
    'studentname': sName,
    'student_name': sName,
    'father name': fName,
    'fathername': fName,
    'father_name': fName,
    'class name': cName,
    'classname': cName,
    'class_name': cName,
    'RollNo': rNo,
    'rollno': rNo,
    'roll_no': rNo,
    'year': yr,
    'academicyear': yr,
    'academic_year': yr,
    'TWD': String(totalWorkingDays),
    'TDP': String(totalPresentDays),
    'PER': `${attendancePct}%`,
  };

  let totalFullMarks = 0;
  let totalObtainedMarks = 0;
  let hasFailedSubject = false;

  for (let i = 1; i <= 10; i++) {
    const subName = subjectsList[i - 1];

    if (subName) {
      const subMark = studentMarks.find((m) => m.subject?.trim()?.toLowerCase() === subName.trim().toLowerCase());

      let fMarks = subMark?.fullMarks || 100;
      let pMarks = subMark?.passMarks || 40;

      if (!subMark) {
        const config = await ExamConfig.findOne({ class: classItem._id, subject: subName, terminal: termNum });
        if (config) {
          fMarks = config.fullMarks;
          pMarks = config.passMarks;
        } else {
          const qp = await QuestionPaper.findOne({ class: classItem._id, subject: new RegExp(`^${subName}$`, 'i'), examTerm: termNum });
          if (qp) {
            fMarks = qp.fullMarks || 100;
            pMarks = qp.passMarks || 40;
          }
        }
      }

      const obtained = subMark ? Number(subMark.marksObtained) : 0;
      const highest = highestMarksBySubject[subName.trim().toLowerCase()] || obtained;

      totalFullMarks += fMarks;
      totalObtainedMarks += obtained;

      const subPct = (obtained / Math.max(1, fMarks)) * 100;
      const subGradeObj = getGradingDetails(subPct);

      if (obtained < pMarks) {
        hasFailedSubject = true;
      }

      dataMap[`sub${i}`] = subName;
      dataMap[`sub${i}fm`] = String(fMarks);
      dataMap[`sub${i}pm`] = String(pMarks);
      dataMap[`sub${i}om`] = subMark ? String(obtained) : '—';
      dataMap[`sub${i}hm`] = String(highest);
      dataMap[`sub${i}rmk`] = subMark ? subGradeObj.grade : '—';
    } else {
      dataMap[`sub${i}`] = '';
      dataMap[`sub${i}fm`] = '';
      dataMap[`sub${i}pm`] = '';
      dataMap[`sub${i}om`] = '';
      dataMap[`sub${i}hm`] = '';
      dataMap[`sub${i}rmk`] = '';
    }
  }

  const overallPct = totalFullMarks > 0 ? (totalObtainedMarks / totalFullMarks) * 100 : 0;
  const overallGradeObj = getGradingDetails(overallPct);

  dataMap['totalfullmarks'] = String(totalFullMarks);
  dataMap['totalobtainedmarks'] = String(totalObtainedMarks);
  dataMap['percentage'] = `${overallPct.toFixed(2)}%`;
  dataMap['grade'] = hasFailedSubject ? 'F' : overallGradeObj.grade;
  dataMap['remarks'] = hasFailedSubject ? 'Needs Improvement' : overallGradeObj.remark;

  const templateFileName = TEMPLATE_FILES[termNum];
  const candidateTemplatePaths = [
    path.join(__dirname, '../Markscardtemplate', templateFileName),
    path.join(process.cwd(), 'Markscardtemplate', templateFileName),
    path.join(process.cwd(), 'backend/Markscardtemplate', templateFileName),
  ];
  const templatePath = candidateTemplatePaths.find((p) => fs.existsSync(p));
  if (!templatePath) {
    throw new Error(`Marks card template file not found: ${templateFileName}`);
  }

  const zip = new PizZip(fs.readFileSync(templatePath));
  let xml = zip.file('word/document.xml').asText();
  const updatedXml = cleanDocxXmlPlaceholders(xml, dataMap);
  zip.file('word/document.xml', updatedXml);

  const os = require('os');
  const baseTmp = process.env.VERCEL ? os.tmpdir() : path.join(__dirname, '..');
  const outputDirDocx = path.join(baseTmp, 'uploads/markscards/docs');
  const outputDirPdf = path.join(baseTmp, 'uploads/markscards/pdf');
  try {
    fs.mkdirSync(outputDirDocx, { recursive: true });
    fs.mkdirSync(outputDirPdf, { recursive: true });
  } catch (_) {}

  const safeStudentName = (student.user?.name || 'Student').replace(/\s+/g, '_');
  const fileBase = `YPSS_MarksCard_${safeStudentName}_Term_${termNum}_${Date.now()}`;
  const docxPath = path.join(outputDirDocx, `${fileBase}.docx`);
  const pdfPath = path.join(outputDirPdf, `${fileBase}.pdf`);

  const docxBuffer = zip.generate({ type: 'nodebuffer' });
  fs.writeFileSync(docxPath, docxBuffer);

  await convertDocxToPdf(docxPath, pdfPath, {
    className: classItem.name,
    subject: `Terminal ${termNum} Marks Card`,
    subtitle: `${student.user?.name || 'Student'} - Terminal ${termNum}`,
  });

  // Check for existing card record and delete old Cloudinary files to free storage quota
  const existingCard = await MarksCard.findOne({
    student: student._id,
    class: classItem._id,
    terminal: termNum,
    academicYear: String(academicYear),
  });

  if (existingCard) {
    if (existingCard.pdfUrl) {
      await deleteFromCloud(existingCard.pdfUrl).catch((err) =>
        console.warn('[CloudStorage] Old PDF cleanup warning:', err.message)
      );
    }
    if (existingCard.docxUrl) {
      await deleteFromCloud(existingCard.docxUrl).catch((err) =>
        console.warn('[CloudStorage] Old DOCX cleanup warning:', err.message)
      );
    }
  }

  let pdfCloudUrl = null;
  let docxCloudUrl = null;

  try {
    // Upload generated files to Cloudinary
    [pdfCloudUrl, docxCloudUrl] = await Promise.all([
      uploadToCloud(pdfPath, 'ypss_marks_cards/pdf'),
      uploadToCloud(docxPath, 'ypss_marks_cards/docs'),
    ]);
  } finally {
    // Zero Local Clutter: Delete local temporary files immediately after uploading to Cloudinary
    try {
      if (fs.existsSync(docxPath)) fs.unlinkSync(docxPath);
      if (fs.existsSync(pdfPath)) fs.unlinkSync(pdfPath);
      console.log(`[CleanLocalFiles] Unlinked local temp files: ${docxPath}, ${pdfPath}`);
    } catch (cleanupErr) {
      console.warn('[CleanLocalFiles] Error unlinking temp files:', cleanupErr.message);
    }
  }

  const finalPdfUrl = pdfCloudUrl || `/uploads/markscards/pdf/${fileBase}.pdf`;
  const finalDocxUrl = docxCloudUrl || `/uploads/markscards/docs/${fileBase}.docx`;

  const finalGrade = hasFailedSubject ? 'F' : overallGradeObj.grade;
  const finalRemarks = hasFailedSubject ? 'Needs Improvement' : overallGradeObj.remark;
  const finalPercentage = `${overallPct.toFixed(2)}%`;
  const studentNameStr = student.user?.name || student.name || 'Student';

  // Save/Update record in MarksCard collection
  const cardRecord = await MarksCard.findOneAndUpdate(
    {
      student: student._id,
      class: classItem._id,
      terminal: termNum,
      academicYear: String(academicYear),
    },
    {
      student: student._id,
      class: classItem._id,
      terminal: termNum,
      academicYear: String(academicYear),
      pdfUrl: finalPdfUrl,
      docxUrl: finalDocxUrl,
      studentName: studentNameStr,
      rollNumber: student.rollNumber,
      className: classItem.name,
      totalFullMarks,
      totalObtainedMarks,
      percentage: finalPercentage,
      grade: finalGrade,
      remarks: finalRemarks,
      updatedAt: new Date(),
    },
    { upsert: true, new: true }
  );

  return {
    _id: cardRecord._id,
    docxUrl: finalDocxUrl,
    pdfUrl: finalPdfUrl,
    studentName: studentNameStr,
    rollNumber: student.rollNumber,
    className: classItem.name,
    terminal: termNum,
    totalFullMarks,
    totalObtainedMarks,
    percentage: finalPercentage,
    grade: finalGrade,
    remarks: finalRemarks,
    isPublished: cardRecord.isPublished,
    isCloudinary: Boolean(pdfCloudUrl),
  };
};

module.exports = { generateStudentMarksCard };
