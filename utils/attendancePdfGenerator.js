const PDFDocument = require('pdfkit');
const fs = require('fs');
const { BRAND, drawBrandHeader, drawFooter, drawPageFrame, drawWatermark } = require('./brandTemplate');

const generateAttendancePDF = (classInfo, attendanceData, recordsList, outputPath) =>
  new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 36 });
      const stream = fs.createWriteStream(outputPath);
      doc.pipe(stream);

      drawPageFrame(doc);
      drawWatermark(doc);
      drawBrandHeader(doc, {
        eyebrow: 'Official School Attendance Record',
        title: 'DAILY CLASS ATTENDANCE REPORT',
        subtitle: `Class: ${classInfo.className} | Date: ${attendanceData.date}`,
      });

      // Info Card (Matching App UI #FAF6EE Cream Card)
      const infoTop = 175;
      doc.roundedRect(40, infoTop, doc.page.width - 80, 58, 8).fillAndStroke('#FAF6EE', BRAND.mist);

      doc.font('Helvetica-Bold').fontSize(7.5).fillColor(BRAND.slate).text('CLASS NAME', 52, infoTop + 9);
      doc.font('Helvetica-Bold').fontSize(10.5).fillColor(BRAND.ink).text(classInfo.className, 52, infoTop + 22);

      doc.font('Helvetica-Bold').fontSize(7.5).fillColor(BRAND.slate).text('DATE (B.S.)', 145, infoTop + 9);
      doc.font('Helvetica-Bold').fontSize(10.5).fillColor(BRAND.ink).text(attendanceData.date || '—', 145, infoTop + 22);

      doc.font('Helvetica-Bold').fontSize(7.5).fillColor(BRAND.slate).text('TOTAL LEARNERS', 240, infoTop + 9);
      doc.font('Helvetica-Bold').fontSize(10.5).fillColor(BRAND.ink).text(String(attendanceData.total || 0), 240, infoTop + 22);

      doc.font('Helvetica-Bold').fontSize(7.5).fillColor(BRAND.slate).text('PRESENT / ABSENT', 345, infoTop + 9);
      doc.font('Helvetica-Bold').fontSize(10.5).fillColor('#0D9E88').text(`${attendanceData.present} P  /  `, 345, infoTop + 22, { continued: true });
      doc.fillColor('#CB4255').text(`${attendanceData.absent} A`);

      doc.font('Helvetica-Bold').fontSize(7.5).fillColor(BRAND.slate).text('RECORDED BY', 52, infoTop + 38);
      doc.font('Helvetica-Bold').fontSize(9).fillColor(BRAND.ink).text(attendanceData.recordedBy || 'Not Specified', 125, infoTop + 38);

      // Table Headers (Without Username)
      const startX = 40;
      const tableTop = 245;
      const columnWidths = [55, 205, 165, 90];
      const headers = ['ROLL', 'STUDENT NAME', "FATHER'S NAME", 'STATUS'];
      
      let x = startX;
      doc.roundedRect(startX, tableTop, doc.page.width - 80, 24, 6).fill(BRAND.ink);
      headers.forEach((header, index) => {
        const align = index === 0 ? 'left' : index === 3 ? 'center' : 'left';
        doc
          .font('Helvetica-Bold')
          .fontSize(8)
          .fillColor('#FFFFFF')
          .text(header, x + 6, tableTop + 8, { width: columnWidths[index] - 8, align });
        x += columnWidths[index];
      });

      let currentY = tableTop + 24;
      const pageBottomLimit = doc.page.height - 80;

      recordsList.forEach((student, index) => {
        const rowHeight = 22;

        // Auto Page Break if rows exceed page
        if (currentY + rowHeight > pageBottomLimit) {
          doc.addPage({ size: 'A4', margin: 36 });
          drawPageFrame(doc);
          drawWatermark(doc);
          currentY = 40;

          // Repeat Header on new page
          let rx = startX;
          doc.roundedRect(startX, currentY, doc.page.width - 80, 24, 6).fill(BRAND.ink);
          headers.forEach((header, hIdx) => {
            const align = hIdx === 0 ? 'left' : hIdx === 3 ? 'center' : 'left';
            doc
              .font('Helvetica-Bold')
              .fontSize(8)
              .fillColor('#FFFFFF')
              .text(header, rx + 6, currentY + 8, { width: columnWidths[hIdx] - 8, align });
            rx += columnWidths[hIdx];
          });
          currentY += 24;
        }

        // Alternating row background (Matching App UI #FAFAFA / #FFFFFF)
        if (index % 2 === 0) {
          doc.rect(startX, currentY, doc.page.width - 80, rowHeight).fill('#FAFAFA');
        }

        let cellX = startX;
        // Roll No
        doc.font('Helvetica-Bold').fontSize(8.5).fillColor(BRAND.ink).text(`#${student.rollNumber || '—'}`, cellX + 6, currentY + 6);
        cellX += columnWidths[0];

        // Student Name
        doc.font('Helvetica-Bold').fontSize(9).fillColor(BRAND.ink).text(student.name || 'Student', cellX + 6, currentY + 6, { width: columnWidths[1] - 8, lineBreak: false });
        cellX += columnWidths[1];

        // Father's Name
        doc.font('Helvetica').fontSize(8.5).fillColor(BRAND.slate).text(student.fatherName || '—', cellX + 6, currentY + 6, { width: columnWidths[2] - 8, lineBreak: false });
        cellX += columnWidths[2];

        // Status (Present: #0D9E88, Absent: #CB4255)
        const isPresent = student.status === 'present';
        doc
          .font('Helvetica-Bold')
          .fontSize(9)
          .fillColor(isPresent ? '#0D9E88' : '#CB4255')
          .text(isPresent ? 'PRESENT' : 'ABSENT', cellX + 6, currentY + 6, { width: columnWidths[3] - 8, align: 'center' });

        currentY += rowHeight;
      });

      // Summary & Signatures Section
      const sigTop = Math.max(currentY + 25, doc.page.height - 110);
      if (sigTop + 60 > doc.page.height - 40) {
        doc.addPage({ size: 'A4', margin: 36 });
        drawPageFrame(doc);
        drawWatermark(doc);
      }

      // Signature Lines
      const lineY = sigTop + 20;
      doc.moveTo(60, lineY).lineTo(200, lineY).lineWidth(0.8).strokeColor(BRAND.slate).stroke();
      doc.font('Helvetica-Bold').fontSize(8).fillColor(BRAND.ink).text('CLASS ADVISOR SIGNATURE', 60, lineY + 6, { width: 140, align: 'center' });

      doc.moveTo(doc.page.width - 200, lineY).lineTo(doc.page.width - 60, lineY).lineWidth(0.8).strokeColor(BRAND.slate).stroke();
      doc.font('Helvetica-Bold').fontSize(8).fillColor(BRAND.ink).text('PRINCIPAL STAMP & SIGNATURE', doc.page.width - 200, lineY + 6, { width: 140, align: 'center' });

      drawFooter(doc, `Generated on ${new Date().toLocaleDateString()} | Yashoda Prem Shishu Sadan Official Attendance Log`);

      doc.end();

      stream.on('finish', () => resolve(outputPath));
      stream.on('error', (err) => reject(err));
    } catch (err) {
      reject(err);
    }
  });

module.exports = { generateAttendancePDF };
