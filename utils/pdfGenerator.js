const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const { BRAND, drawBrandHeader, drawFooter, drawPageFrame, drawWatermark } = require('./brandTemplate');

const termName = (terminal) => {
  const t = Number(terminal);
  return ['First', 'Second', 'Third', 'Final'][t - 1] || `Terminal ${terminal}`;
};

/**
 * Retrieves the official MS Word template background image for the given terminal.
 * Checks assets cache first, falling back to on-the-fly extraction from Markscardtemplate/*.docx.
 */
function getTemplateBackgroundBuffer(termNum) {
  const num = Math.min(4, Math.max(1, Number(termNum) || 1));
  const assetName = `term_${num}_bg.png`;

  const candidateAssetPaths = [
    path.join(__dirname, '../assets/markscard_templates', assetName),
    path.join(process.cwd(), 'assets/markscard_templates', assetName),
    path.join(process.cwd(), 'backend/assets/markscard_templates', assetName),
  ];

  for (const p of candidateAssetPaths) {
    if (fs.existsSync(p)) {
      try {
        return fs.readFileSync(p);
      } catch (_) {}
    }
  }

  // Fallback: extract directly from the Word .docx template
  const TEMPLATE_FILES = {
    1: 'first_term_markscard.docx',
    2: 'second_term_markscard.docx',
    3: 'third_term_markscard.docx',
    4: 'final_term_markscard.docx',
  };

  const docxName = TEMPLATE_FILES[num] || TEMPLATE_FILES[1];
  const candidateDocxPaths = [
    path.join(__dirname, '../Markscardtemplate', docxName),
    path.join(process.cwd(), 'Markscardtemplate', docxName),
    path.join(process.cwd(), 'backend/Markscardtemplate', docxName),
    path.join(__dirname, '../Markscardtemplate', num === 2 ? 'Second_term_markscard.docx' : docxName),
    path.join(process.cwd(), 'backend/Markscardtemplate', num === 2 ? 'Second_term_markscard.docx' : docxName),
  ];

  for (const dp of candidateDocxPaths) {
    if (fs.existsSync(dp)) {
      try {
        const PizZip = require('pizzip');
        const zip = new PizZip(fs.readFileSync(dp));
        const imgKey = Object.keys(zip.files).find((k) => k.startsWith('word/media/image') && !k.endsWith('.xml'));
        if (imgKey && zip.files[imgKey]) {
          return zip.files[imgKey].asNodeBuffer();
        }
      } catch (_) {}
    }
  }

  return null;
}

/**
 * Fallback branded layout if template background image cannot be loaded.
 */
function drawFallbackMarksCard(doc, studentInfo, marksList, terminal) {
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

  const stName = studentInfo.name || studentInfo.studentName || '—';
  const faName = studentInfo.fatherName || '—';
  const clName = studentInfo.className || 'Class';
  const rollNo = String(studentInfo.rollNumber || '—');

  doc.font('Helvetica-Bold').fontSize(7.5).fillColor(BRAND.slate).text('STUDENT NAME', 54, infoTop + 9);
  doc.font('Helvetica-Bold').fontSize(10).fillColor(BRAND.ink).text(stName, 54, infoTop + 21, { width: 230 });

  doc.font('Helvetica-Bold').fontSize(7.5).fillColor(BRAND.slate).text("FATHER'S NAME", 305, infoTop + 9);
  doc.font('Helvetica-Bold').fontSize(10).fillColor(BRAND.ink).text(faName, 305, infoTop + 21, { width: 210 });

  doc.font('Helvetica-Bold').fontSize(7.5).fillColor(BRAND.slate).text('CLASS / GRADE', 54, infoTop + 37);
  doc.font('Helvetica').fontSize(9).fillColor(BRAND.ink).text(clName, 126, infoTop + 36);

  doc.font('Helvetica-Bold').fontSize(7.5).fillColor(BRAND.slate).text('ROLL NO', 215, infoTop + 37);
  doc.font('Helvetica').fontSize(9).fillColor(BRAND.ink).text(rollNo, 265, infoTop + 36);

  drawFooter(doc, 'YASHODA PREM SHISHU SADAN · OFFICIAL REPORT CARD · ISSUED FROM VERIFIED RECORDS');
}

/**
 * Generates the official Marks Card PDF.
 * Uses the exact MS Word template background image and typography layout so the PDF
 * is 100% identical to the institutional template.
 */
const generateMarksCardPDF = (studentInfo, marksList = [], terminal = 1, outputPath) => new Promise((resolve, reject) => {
  try {
    const termNum = Math.min(4, Math.max(1, Number(terminal) || 1));
    const bgBuffer = getTemplateBackgroundBuffer(termNum);

    const doc = new PDFDocument({
      size: 'A4',
      margin: 0,
    });

    const stream = fs.createWriteStream(outputPath);
    doc.pipe(stream);

    if (bgBuffer) {
      // 1. Draw the exact official MS Word template background image (full bleed A4: 595.28 x 841.89)
      doc.image(bgBuffer, 0, 0, { width: 595.28, height: 841.89 });

      // 2. Student Information (positioned right on the dotted lines)
      doc.fillColor('#000000');
      doc.font('Helvetica-Bold').fontSize(10);

      const sName = studentInfo.name || studentInfo.studentName || '—';
      const fName = studentInfo.fatherName || '—';
      const cName = String(studentInfo.className || 'Class');
      const rNo = String(studentInfo.rollNumber || '—');
      const yr = String(studentInfo.academicYear || '2083 B.S.');
      const sec = String(studentInfo.section || 'A');

      // Line 1: Student Name & Roll No (baseline ~202 pt)
      doc.text(sName, 131, 202, { width: 200, lineBreak: false });
      doc.text(rNo, 421, 202, { width: 140, lineBreak: false });

      // Line 2: Father Name & Academic Year (baseline ~220 pt)
      doc.text(fName, 131, 220, { width: 200, lineBreak: false });
      doc.text(yr, 421, 220, { width: 140, lineBreak: false });

      // Line 3: Class & Section (baseline ~237 pt)
      doc.text(cName, 131, 237, { width: 150, lineBreak: false });
      if (sec && sec !== '—' && sec !== 'A') {
        doc.text(sec, 421, 237, { width: 100, lineBreak: false });
      }

      // 3. Subject Rows (Rows 1 to 15)
      const rowY = [293, 310.5, 328, 346, 364.5, 382.5, 400, 418, 436.5, 455.5, 473, 491, 508.8, 526.8, 545.2];
      const validMarks = marksList.slice(0, 15);

      validMarks.forEach((sub, i) => {
        const y = rowY[i];
        const subName = sub.subject || sub.name || `Subject ${i + 1}`;
        const pm = sub.passMarks !== undefined ? String(sub.passMarks) : '40';
        const fm = sub.fullMarks !== undefined ? String(sub.fullMarks) : '100';
        const om = sub.marksObtained !== undefined && sub.marksObtained !== null ? String(sub.marksObtained) : '—';
        const hm = sub.highestMarks !== undefined ? String(sub.highestMarks) : om;
        const rmk = sub.remark || sub.remarks || (om !== '—' && Number(om) < Number(pm) ? 'Fail' : 'Good');

        // Subject Name
        doc.font('Helvetica-Bold').fontSize(9.5).text(subName, 68, y, { width: 175, lineBreak: false });
        // Pass Marks
        doc.font('Helvetica').fontSize(10).text(pm, 250, y, { width: 55, align: 'center', lineBreak: false });
        // Full Marks
        doc.font('Helvetica').fontSize(10).text(fm, 307, y, { width: 55, align: 'center', lineBreak: false });
        // Obtained Marks
        doc.font('Helvetica-Bold').fontSize(10).text(om, 366, y, { width: 62, align: 'center', lineBreak: false });
        // Highest Marks
        doc.font('Helvetica').fontSize(10).text(hm, 432, y, { width: 62, align: 'center', lineBreak: false });
        // Remarks
        doc.font('Helvetica').fontSize(9.5).text(rmk, 498, y, { width: 62, align: 'center', lineBreak: false });
      });

      // 4. Summary Table (Bottom Left)
      const summaryX = 168;
      const summaryW = 153;
      doc.font('Helvetica-Bold').fontSize(10);
      doc.text(String(studentInfo.totalFullMarks || '—'), summaryX, 577, { width: summaryW, align: 'center', lineBreak: false });
      doc.text(String(studentInfo.totalObtainedMarks || '—'), summaryX, 595, { width: summaryW, align: 'center', lineBreak: false });
      doc.text(String(studentInfo.percentage || '—'), summaryX, 612, { width: summaryW, align: 'center', lineBreak: false });
      doc.text(String(studentInfo.grade || '—'), summaryX, 630, { width: summaryW, align: 'center', lineBreak: false });
      doc.text(String(studentInfo.remarks || '—'), 167, 667, { width: 153, align: 'center', lineBreak: false });

      // 5. Attendance (Bottom Left)
      const attX = 130;
      const attW = 47;
      const twd = studentInfo.totalWorkingDays !== undefined && studentInfo.totalWorkingDays !== null ? String(studentInfo.totalWorkingDays) : '—';
      const tdp = studentInfo.totalPresentDays !== undefined && studentInfo.totalPresentDays !== null ? String(studentInfo.totalPresentDays) : '—';
      const per = studentInfo.attendancePct !== undefined && studentInfo.attendancePct !== null ? `${studentInfo.attendancePct}%` : '—';

      doc.font('Helvetica-Bold').fontSize(9.5);
      doc.text(twd, attX, 730, { width: attW, align: 'center', lineBreak: false });
      doc.text(tdp, attX, 752, { width: attW, align: 'center', lineBreak: false });
      doc.text(per, attX, 774, { width: attW, align: 'center', lineBreak: false });
    } else {
      drawFallbackMarksCard(doc, studentInfo, marksList, terminal);
    }

    doc.end();
    stream.on('finish', () => resolve(outputPath));
    stream.on('error', reject);
  } catch (error) {
    reject(error);
  }
});

module.exports = { generateMarksCardPDF };
