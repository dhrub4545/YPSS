const PDFDocument = require('pdfkit');
const fs = require('fs');
const { BRAND, drawBrandHeader, drawFooter, drawPageFrame, drawWatermark } = require('./brandTemplate');

const termName = (terminal) => {
  const t = Number(terminal);
  return ['First', 'Second', 'Third', 'Final'][t - 1] || `Terminal ${terminal}`;
};

const generateMarksCardPDF = (studentInfo, marksList = [], terminal = 1, outputPath) => new Promise((resolve, reject) => {
  try {
    const doc = new PDFDocument({ size: 'A4', margin: 36 });
    const stream = fs.createWriteStream(outputPath);
    doc.pipe(stream);
    drawPageFrame(doc);
    drawWatermark(doc);

    const termLabel = termName(terminal);
    drawBrandHeader(doc, {
      eyebrow: 'Official Academic Record',
      title: `${termLabel.toUpperCase()} TERMINAL EXAMINATION REPORT CARD`,
      subtitle: `Academic Year: ${studentInfo.academicYear || '2083 B.S.'}`,
    });

    const infoTop = 180;
    doc.roundedRect(40, infoTop, doc.page.width - 80, 58, 8).fillAndStroke('#F7FAFC', BRAND.mist);

    // Learner & Father info
    const stName = studentInfo.name || studentInfo.studentName || '—';
    const faName = studentInfo.fatherName || '—';
    const clName = studentInfo.className || 'Class';
    const rollNo = String(studentInfo.rollNumber || '—');

    doc.font('Helvetica-Bold').fontSize(7.5).fillColor(BRAND.slate).text('STUDENT NAME', 54, infoTop + 9, { characterSpacing: 0.6 });
    doc.font('Helvetica-Bold').fontSize(10).fillColor(BRAND.ink).text(stName, 54, infoTop + 21, { width: 230 });

    doc.font('Helvetica-Bold').fontSize(7.5).fillColor(BRAND.slate).text("FATHER'S NAME", 305, infoTop + 9, { characterSpacing: 0.6 });
    doc.font('Helvetica-Bold').fontSize(10).fillColor(BRAND.ink).text(faName, 305, infoTop + 21, { width: 210 });

    // Class, Roll No, Attendance
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor(BRAND.slate).text('CLASS / GRADE', 54, infoTop + 37, { characterSpacing: 0.6 });
    doc.font('Helvetica').fontSize(9).fillColor(BRAND.ink).text(clName, 126, infoTop + 36);

    doc.font('Helvetica-Bold').fontSize(7.5).fillColor(BRAND.slate).text('ROLL NO', 215, infoTop + 37, { characterSpacing: 0.6 });
    doc.font('Helvetica').fontSize(9).fillColor(BRAND.ink).text(rollNo, 265, infoTop + 36);

    doc.font('Helvetica-Bold').fontSize(7.5).fillColor(BRAND.slate).text('ATTENDANCE', 335, infoTop + 37, { characterSpacing: 0.6 });
    const attStr = studentInfo.attendancePct ? `${studentInfo.attendancePct}% (${studentInfo.totalPresentDays || 0}/${studentInfo.totalWorkingDays || 0} days)` : 'Regular';
    doc.font('Helvetica').fontSize(9).fillColor(BRAND.ink).text(attStr, 405, infoTop + 36);

    // Marks Table
    const startX = 40;
    const tableTop = 252;
    // Total width = doc.page.width - 80 = 515 pt
    const columnWidths = [170, 45, 45, 55, 65, 55, 80];
    const headers = ['Subject', 'Full', 'Pass', 'Highest', 'Obtained', 'Grade', 'Remark'];

    let x = startX;
    doc.roundedRect(startX, tableTop, doc.page.width - 80, 22, 6).fill(BRAND.ink);
    headers.forEach((header, index) => {
      doc.font('Helvetica-Bold').fontSize(8).fillColor('#FFFFFF').text(header, x + 4, tableTop + 7, {
        width: columnWidths[index] - 8,
        align: index === 0 ? 'left' : 'center',
      });
      x += columnWidths[index];
    });

    let currentY = tableTop + 22;
    let totalObtained = 0;
    let totalFull = 0;
    let failedSubjects = 0;

    const rowsToRender = marksList.length ? marksList : [
      { subject: 'No subject marks recorded', fullMarks: 0, passMarks: 0, marksObtained: '—', highestMarks: '—', grade: '—', remark: '—' }
    ];

    rowsToRender.forEach((mark, index) => {
      const rowHeight = 22;
      if (index % 2 === 0) {
        doc.rect(startX, currentY, doc.page.width - 80, rowHeight).fill('#F8FAFC');
      }

      const isRecorded = mark.marksObtained !== '—' && mark.marksObtained !== undefined && mark.marksObtained !== null;
      const numObtained = isRecorded ? Number(mark.marksObtained) : 0;
      const numPass = Number(mark.passMarks) || 40;
      const numFull = Number(mark.fullMarks) || 100;
      const passed = isRecorded ? numObtained >= numPass : true;
      if (isRecorded && !passed) failedSubjects += 1;
      if (isRecorded) {
        totalObtained += numObtained;
        totalFull += numFull;
      }

      const values = [
        mark.subject || '—',
        mark.fullMarks !== undefined ? String(mark.fullMarks) : '—',
        mark.passMarks !== undefined ? String(mark.passMarks) : '—',
        mark.highestMarks !== undefined ? String(mark.highestMarks) : (mark.marksObtained !== undefined ? String(mark.marksObtained) : '—'),
        isRecorded ? String(mark.marksObtained) : '—',
        mark.grade || (isRecorded ? (passed ? 'B' : 'NG') : '—'),
        mark.remark || (isRecorded ? (passed ? 'Good' : 'Needs Work') : '—'),
      ];

      let rowX = startX;
      values.forEach((value, columnIndex) => {
        const isFailCol = columnIndex === 4 && isRecorded && !passed;
        const fontName = columnIndex === 0 || columnIndex === 4 || columnIndex === 5 ? 'Helvetica-Bold' : 'Helvetica';
        const fontColor = isFailCol ? '#DC2626' : (columnIndex === 5 && passed && isRecorded ? BRAND.teal : BRAND.ink);

        doc.font(fontName).fontSize(8.5).fillColor(fontColor).text(String(value), rowX + 4, currentY + 6, {
          width: columnWidths[columnIndex] - 8,
          align: columnIndex === 0 ? 'left' : 'center',
        });
        rowX += columnWidths[columnIndex];
      });

      doc.moveTo(startX, currentY + rowHeight).lineTo(doc.page.width - 40, currentY + rowHeight).lineWidth(0.4).strokeColor(BRAND.mist).stroke();
      currentY += rowHeight;
    });

    // Minimum rows padding for aesthetic balance
    const minRows = 8;
    for (let r = rowsToRender.length; r < minRows; r++) {
      const rowHeight = 20;
      if (r % 2 === 0) {
        doc.rect(startX, currentY, doc.page.width - 80, rowHeight).fill('#F8FAFC');
      }
      doc.moveTo(startX, currentY + rowHeight).lineTo(doc.page.width - 40, currentY + rowHeight).lineWidth(0.3).strokeColor(BRAND.mist).stroke();
      currentY += rowHeight;
    }

    // Results Box
    const calcFull = studentInfo.totalFullMarks !== undefined && Number(studentInfo.totalFullMarks) > 0 ? Number(studentInfo.totalFullMarks) : totalFull;
    const calcObtained = studentInfo.totalObtainedMarks !== undefined ? Number(studentInfo.totalObtainedMarks) : totalObtained;
    const percentageStr = studentInfo.percentage || (calcFull > 0 ? `${((calcObtained / calcFull) * 100).toFixed(2)}%` : '0.00%');
    const finalGrade = studentInfo.grade || (failedSubjects > 0 ? 'F' : 'B');
    const finalRemarks = studentInfo.remarks || (failedSubjects > 0 ? 'Needs Improvement' : 'Promoted');

    currentY += 12;
    doc.roundedRect(startX, currentY, doc.page.width - 80, 56, 8).fillAndStroke('#F1F5FF', '#CAD5FF');

    doc.font('Helvetica-Bold').fontSize(7.5).fillColor(BRAND.slate).text('TOTAL MARKS', 54, currentY + 11, { characterSpacing: 0.6 });
    doc.font('Helvetica-Bold').fontSize(14).fillColor(BRAND.ink).text(`${calcObtained} / ${calcFull}`, 54, currentY + 24);

    doc.font('Helvetica-Bold').fontSize(7.5).fillColor(BRAND.slate).text('PERCENTAGE', 185, currentY + 11, { characterSpacing: 0.6 });
    doc.font('Helvetica-Bold').fontSize(14).fillColor(BRAND.indigo).text(percentageStr, 185, currentY + 24);

    doc.font('Helvetica-Bold').fontSize(7.5).fillColor(BRAND.slate).text('FINAL GRADE', 310, currentY + 11, { characterSpacing: 0.6 });
    doc.font('Helvetica-Bold').fontSize(14).fillColor(finalGrade === 'F' ? '#DC2626' : BRAND.teal).text(finalGrade, 310, currentY + 24);

    doc.font('Helvetica-Bold').fontSize(7.5).fillColor(BRAND.slate).text('STATUS / REMARKS', 405, currentY + 11, { characterSpacing: 0.6 });
    doc.font('Helvetica-Bold').fontSize(11).fillColor(finalGrade === 'F' ? '#DC2626' : BRAND.teal).text(finalRemarks, 405, currentY + 25, { width: 140 });

    // Grading Scheme Legend
    currentY += 66;
    doc.roundedRect(startX, currentY, doc.page.width - 80, 26, 6).fill('#F8FAFC');
    doc.font('Helvetica-Bold').fontSize(7).fillColor(BRAND.slate).text('GRADING SCALE:', startX + 10, currentY + 5);
    doc.font('Helvetica').fontSize(6.8).fillColor(BRAND.ink).text(
      'A+ (90-100% · Outstanding)  |  A (80-89% · Excellent)  |  B+ (70-79% · Very Good)  |  B (60-69% · Good)  |  C+ (50-59% · Satisfactory)  |  C (40-49% · Acceptable)  |  D (35-39% · Basic)  |  NG (<35% · Needs Improvement)',
      startX + 10,
      currentY + 15,
      { width: doc.page.width - 100 }
    );

    // Signatures
    const signatureY = Math.max(currentY + 68, 715);
    doc.moveTo(54, signatureY).lineTo(170, signatureY).lineWidth(0.7).strokeColor(BRAND.slate).stroke();
    doc.moveTo((doc.page.width - 120) / 2, signatureY).lineTo((doc.page.width - 120) / 2 + 120, signatureY).lineWidth(0.7).strokeColor(BRAND.slate).stroke();
    doc.moveTo(doc.page.width - 170, signatureY).lineTo(doc.page.width - 54, signatureY).lineWidth(0.7).strokeColor(BRAND.slate).stroke();

    doc.font('Helvetica-Bold').fontSize(8).fillColor(BRAND.slate).text('CLASS TEACHER', 54, signatureY + 6, { width: 116, align: 'center', characterSpacing: 0.4 });
    doc.font('Helvetica-Bold').fontSize(8).fillColor(BRAND.slate).text('EXAM CONTROLLER', (doc.page.width - 120) / 2, signatureY + 6, { width: 120, align: 'center', characterSpacing: 0.4 });
    doc.font('Helvetica-Bold').fontSize(8).fillColor(BRAND.slate).text('PRINCIPAL', doc.page.width - 170, signatureY + 6, { width: 116, align: 'center', characterSpacing: 0.4 });

    drawFooter(doc, 'YASHODA PREM SHISHU SADAN · OFFICIAL REPORT CARD · ISSUED FROM VERIFIED RECORDS');
    doc.end();
    stream.on('finish', () => resolve(outputPath));
    stream.on('error', reject);
  } catch (error) {
    reject(error);
  }
});

module.exports = { generateMarksCardPDF };
