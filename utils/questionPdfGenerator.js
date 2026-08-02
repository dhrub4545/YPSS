const PDFDocument = require('pdfkit');
const fs = require('fs');
const { BRAND, drawBrandHeader, drawFooter, drawPageFrame, drawWatermark } = require('./brandTemplate');

const generateQuestionPdf = (data, outputPath) => new Promise((resolve, reject) => {
  try {
    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    const stream = fs.createWriteStream(outputPath);
    doc.pipe(stream);

    const drawPage = (continuation = false) => {
      drawPageFrame(doc);
      drawWatermark(doc);
      drawBrandHeader(doc, {
        eyebrow: continuation ? 'Examination paper · continued' : 'Examination paper',
        title: continuation ? 'QUESTION PAPER (CONTINUED)' : 'QUESTION PAPER',
        subtitle: data.subtitle || 'TERMINAL EXAMINATION',
      });
    };

    drawPage();
    doc.roundedRect(40, 184, doc.page.width - 80, 57, 10).fillAndStroke('#F7FAFC', BRAND.mist);
    doc.font('Helvetica-Bold').fontSize(8).fillColor(BRAND.slate).text('CLASS', 54, 196, { characterSpacing: 0.8 });
    doc.font('Helvetica-Bold').fontSize(10).fillColor(BRAND.ink).text(data.className || 'Class', 54, 210);
    doc.font('Helvetica-Bold').fontSize(8).fillColor(BRAND.slate).text('SUBJECT', 210, 196, { characterSpacing: 0.8 });
    doc.font('Helvetica-Bold').fontSize(10).fillColor(BRAND.ink).text(data.subject || 'Subject', 210, 210, { width: 150 });
    doc.font('Helvetica-Bold').fontSize(8).fillColor(BRAND.slate).text('FULL / PASS', 388, 196, { characterSpacing: 0.8 });
    doc.font('Helvetica-Bold').fontSize(10).fillColor(BRAND.ink).text(`${data.fullMarks || 100} / ${data.passMarks || 40}`, 388, 210);
    const displayTime = String(data.time || '3').includes('hr') ? data.time : `${data.time || '3'} hrs`;
    doc.font('Helvetica-Bold').fontSize(10).fillColor(BRAND.ink).text(displayTime, 494, 210, { width: 55, align: 'right' });

    let currentY = 266;
    const nextPage = () => {
      drawFooter(doc, 'YPSS SCHOOL · EXAMINATION PAPER');
      doc.addPage();
      drawPage(true);
      currentY = 188;
    };

    (data.sections || []).forEach((section) => {
      const sectionTitle = section.sectionName || 'Section';
      const instruction = section.sectionInstruction || '';
      const sectionHeight = 22 + (instruction ? doc.heightOfString(instruction, { width: doc.page.width - 110 }) + 12 : 0);
      if (currentY + sectionHeight > doc.page.height - 80) nextPage();
      doc.roundedRect(40, currentY, doc.page.width - 80, 22, 7).fill('#EEF2FF');
      doc.font('Helvetica-Bold').fontSize(10).fillColor(BRAND.indigo).text(sectionTitle, 52, currentY + 7);
      currentY += 30;
      if (instruction) {
        doc.font('Helvetica-Oblique').fontSize(8.7).fillColor(BRAND.slate).text(instruction, 52, currentY, { width: doc.page.width - 104 });
        currentY += doc.heightOfString(instruction, { width: doc.page.width - 104 }) + 11;
      }

      (section.questions || []).forEach((question) => {
        const questionText = question.text || '[Question text unavailable]';
        const textHeight = doc.heightOfString(questionText, { width: doc.page.width - 173, align: 'justify' });
        const rowHeight = Math.max(textHeight, 15) + 12;
        if (currentY + rowHeight > doc.page.height - 72) nextPage();
        doc.font('Helvetica-Bold').fontSize(9.4).fillColor(BRAND.ink).text(`${question.questionNumber || '—'}.`, 52, currentY, { width: 18 });
        doc.font('Helvetica').fontSize(9.4).fillColor(BRAND.ink).text(questionText, 76, currentY, { width: doc.page.width - 173, align: 'justify' });
        doc.font('Helvetica-Bold').fontSize(8.5).fillColor(BRAND.slate).text(`[${question.marks || 0}]`, doc.page.width - 83, currentY, { width: 30, align: 'right' });
        currentY += rowHeight;
      });
      currentY += 7;
    });

    drawFooter(doc, 'YPSS SCHOOL · EXAMINATION PAPER');
    doc.end();
    stream.on('finish', () => resolve(outputPath));
    stream.on('error', reject);
  } catch (error) {
    reject(error);
  }
});

module.exports = { generateQuestionPdf };
