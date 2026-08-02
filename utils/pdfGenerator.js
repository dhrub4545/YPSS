const PDFDocument = require('pdfkit');
const fs = require('fs');
const { BRAND, drawBrandHeader, drawFooter, drawPageFrame, drawWatermark } = require('./brandTemplate');

const termName = (terminal) => ['First', 'Second', 'Third', 'Fourth'][terminal - 1] || `Terminal ${terminal}`;

const generateMarksCardPDF = (studentInfo, marksList, terminal, outputPath) => new Promise((resolve, reject) => {
  try {
    const doc = new PDFDocument({ size: 'A4', margin: 36 });
    const stream = fs.createWriteStream(outputPath);
    doc.pipe(stream);
    drawPageFrame(doc);
    drawWatermark(doc);
    drawBrandHeader(doc, {
      eyebrow: 'Official academic record',
      title: `${termName(terminal).toUpperCase()} TERMINAL REPORT CARD`,
      subtitle: `Academic year ${studentInfo.academicYear}`,
    });

    const infoTop = 184;
    doc.roundedRect(40, infoTop, doc.page.width - 80, 55, 10).fillAndStroke('#F7FAFC', BRAND.mist);
    doc.font('Helvetica-Bold').fontSize(8).fillColor(BRAND.slate).text('LEARNER', 54, infoTop + 11, { characterSpacing: 0.8 });
    doc.font('Helvetica-Bold').fontSize(11).fillColor(BRAND.ink).text(studentInfo.name, 54, infoTop + 24);
    doc.font('Helvetica-Bold').fontSize(8).fillColor(BRAND.slate).text('CLASS', 295, infoTop + 11, { characterSpacing: 0.8 });
    doc.font('Helvetica-Bold').fontSize(11).fillColor(BRAND.ink).text(studentInfo.className, 295, infoTop + 24);
    doc.font('Helvetica-Bold').fontSize(8).fillColor(BRAND.slate).text('ROLL NUMBER', 435, infoTop + 11, { characterSpacing: 0.8 });
    doc.font('Helvetica-Bold').fontSize(11).fillColor(BRAND.ink).text(String(studentInfo.rollNumber || '—'), 435, infoTop + 24);

    const startX = 40;
    const tableTop = 260;
    const columnWidths = [171, 60, 60, 83, 68, 81];
    const headers = ['Subject', 'Full', 'Pass', 'Obtained', 'Percent', 'Result'];
    let x = startX;
    doc.roundedRect(startX, tableTop, doc.page.width - 80, 25, 8).fill(BRAND.ink);
    headers.forEach((header, index) => {
      doc.font('Helvetica-Bold').fontSize(8).fillColor('#FFFFFF').text(header, x + 4, tableTop + 9, { width: columnWidths[index] - 8, align: index ? 'center' : 'left' });
      x += columnWidths[index];
    });

    let currentY = tableTop + 25;
    let totalObtained = 0;
    let totalFull = 0;
    let failedSubjects = 0;
    marksList.forEach((mark, index) => {
      const rowHeight = 25;
      if (index % 2 === 0) {
        doc.rect(startX, currentY, doc.page.width - 80, rowHeight).fill('#F7FAFC');
      }
      const passed = Number(mark.marksObtained) >= Number(mark.passMarks);
      if (!passed) failedSubjects += 1;
      totalObtained += Number(mark.marksObtained);
      totalFull += Number(mark.fullMarks);
      const values = [
        mark.subject,
        mark.fullMarks,
        mark.passMarks,
        mark.marksObtained,
        `${mark.percentage}%`,
        passed ? 'PASS' : 'REVIEW',
      ];
      let rowX = startX;
      values.forEach((value, columnIndex) => {
        doc.font(columnIndex === 5 ? 'Helvetica-Bold' : 'Helvetica').fontSize(8.3).fillColor(columnIndex === 5 ? (passed ? BRAND.teal : '#C44757') : BRAND.ink).text(String(value), rowX + 4, currentY + 8, { width: columnWidths[columnIndex] - 8, align: columnIndex ? 'center' : 'left' });
        rowX += columnWidths[columnIndex];
      });
      doc.moveTo(startX, currentY + rowHeight).lineTo(doc.page.width - 40, currentY + rowHeight).lineWidth(0.4).strokeColor(BRAND.mist).stroke();
      currentY += rowHeight;
    });

    const percentage = totalFull ? Math.round((totalObtained / totalFull) * 10000) / 100 : 0;
    currentY += 17;
    doc.roundedRect(startX, currentY, doc.page.width - 80, 64, 10).fillAndStroke('#F1F5FF', '#CAD5FF');
    doc.font('Helvetica-Bold').fontSize(8).fillColor(BRAND.slate).text('TOTAL MARKS', 54, currentY + 13, { characterSpacing: 0.8 });
    doc.font('Helvetica-Bold').fontSize(15).fillColor(BRAND.ink).text(`${totalObtained} / ${totalFull}`, 54, currentY + 26);
    doc.font('Helvetica-Bold').fontSize(8).fillColor(BRAND.slate).text('AGGREGATE', 238, currentY + 13, { characterSpacing: 0.8 });
    doc.font('Helvetica-Bold').fontSize(15).fillColor(BRAND.indigo).text(`${percentage}%`, 238, currentY + 26);
    doc.font('Helvetica-Bold').fontSize(8).fillColor(BRAND.slate).text('RESULT', 390, currentY + 13, { characterSpacing: 0.8 });
    doc.font('Helvetica-Bold').fontSize(14).fillColor(failedSubjects ? '#C44757' : BRAND.teal).text(failedSubjects ? `${failedSubjects} SUBJECT${failedSubjects === 1 ? '' : 'S'} TO REVIEW` : 'PROMOTED', 390, currentY + 27, { width: 135, align: 'left' });

    const signatureY = Math.max(currentY + 125, 675);
    doc.moveTo(60, signatureY).lineTo(190, signatureY).lineWidth(0.7).strokeColor(BRAND.slate).stroke();
    doc.moveTo(doc.page.width - 190, signatureY).lineTo(doc.page.width - 60, signatureY).lineWidth(0.7).strokeColor(BRAND.slate).stroke();
    doc.font('Helvetica-Bold').fontSize(8).fillColor(BRAND.slate).text('CLASS TEACHER', 60, signatureY + 7, { width: 130, align: 'center', characterSpacing: 0.55 });
    doc.font('Helvetica-Bold').fontSize(8).fillColor(BRAND.slate).text('PRINCIPAL', doc.page.width - 190, signatureY + 7, { width: 130, align: 'center', characterSpacing: 0.55 });
    drawFooter(doc, 'YPSS SCHOOL · GENERATED FROM VERIFIED ACADEMIC RECORDS');
    doc.end();
    stream.on('finish', () => resolve(outputPath));
    stream.on('error', reject);
  } catch (error) {
    reject(error);
  }
});

module.exports = { generateMarksCardPDF };
