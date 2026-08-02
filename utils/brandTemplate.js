const path = require('path');
const fs = require('fs');

const BRAND = {
  ink: '#1A2A3A',
  indigo: '#C11C54',
  teal: '#0D9E88',
  gold: '#C47D12',
  cloud: '#FAF6EE',
  mist: '#E2D4B7',
  slate: '#60778E',
};

const drawBrandMark = (doc, x, y, size) => {
  const logoPath = path.join(__dirname, '../assets/logo.png');
  if (fs.existsSync(logoPath)) {
    try {
      doc.image(logoPath, x, y, { fit: [size, size], align: 'center', valign: 'center' });
      return;
    } catch (e) {
      // Fallback
    }
  }

  const centerX = x + (size / 2);
  const centerY = y + (size / 2);
  doc.save();
  doc.lineWidth(Math.max(1.2, size * 0.035)).strokeColor(BRAND.teal).circle(centerX, centerY, size / 2).stroke();
  doc.fillColor(BRAND.ink).circle(centerX, centerY, size * 0.27).fill();
  doc.save();
  doc.rotate(-28, { origin: [centerX, centerY] }).fillColor(BRAND.gold).roundedRect(x + size * 0.18, y + size * 0.43, size * 0.32, size * 0.12, size * 0.06).fill();
  doc.restore();
  doc.save();
  doc.rotate(28, { origin: [centerX, centerY] }).fillColor(BRAND.teal).roundedRect(x + size * 0.5, y + size * 0.43, size * 0.32, size * 0.12, size * 0.06).fill();
  doc.restore();
  doc.fillColor('#FFFFFF').circle(centerX, y + size * 0.33, size * 0.055).fill();
  doc.restore();
};

const drawWatermark = (doc) => {
  const markSize = 280;
  const x = (doc.page.width - markSize) / 2;
  const y = (doc.page.height - markSize) / 2 - 8;
  doc.save();
  doc.opacity(0.04);
  drawBrandMark(doc, x, y, markSize);
  doc.fillColor(BRAND.teal).circle(80, doc.page.height - 110, 150).fill();
  doc.fillColor(BRAND.gold).circle(doc.page.width - 55, 125, 115).fill();
  doc.restore();
};

const drawPageFrame = (doc) => {
  doc.save();
  doc.lineWidth(1.2).strokeColor(BRAND.ink).roundedRect(18, 18, doc.page.width - 36, doc.page.height - 36, 10).stroke();
  doc.lineWidth(0.8).strokeColor(BRAND.gold).roundedRect(23, 23, doc.page.width - 46, doc.page.height - 46, 8).stroke();
  doc.restore();
};

const drawBrandHeader = (doc, { eyebrow, title, subtitle }) => {
  drawBrandMark(doc, 40, 34, 60);
  doc.font('Helvetica-Bold').fontSize(17).fillColor(BRAND.ink).text('YASHODA PREM SHISHU SADAN', 110, 36);
  doc.font('Helvetica-Bold').fontSize(7.5).fillColor(BRAND.gold).text('Harmonizing Spirituality, Materialism & Traditional Values', 111, 58, { characterSpacing: 0.5 });
  doc.font('Helvetica').fontSize(8).fillColor(BRAND.slate).text('Janakpurdham-18, Pra. Ko. Mahuwa (Dhanusha) | Ph: 9760402101, 9807897455', 111, 72);
  doc.moveTo(40, 102).lineTo(doc.page.width - 40, 102).lineWidth(1.2).strokeColor(BRAND.gold).stroke();
  doc.font('Helvetica-Bold').fontSize(8).fillColor(BRAND.teal).text(eyebrow.toUpperCase(), 40, 112, { characterSpacing: 1.15 });
  doc.font('Helvetica-Bold').fontSize(14).fillColor(BRAND.ink).text(title, 40, 125, { width: doc.page.width - 80, align: 'center' });
  if (subtitle) {
    doc.font('Helvetica').fontSize(8.5).fillColor(BRAND.slate).text(subtitle, 40, 143, { width: doc.page.width - 80, align: 'center' });
  }
};

const drawFooter = (doc, label) => {
  const y = doc.page.height - 48;
  doc.moveTo(40, y - 10).lineTo(doc.page.width - 40, y - 10).lineWidth(0.5).strokeColor(BRAND.mist).stroke();
  doc.font('Helvetica-Bold').fontSize(7).fillColor(BRAND.slate).text(label, 40, y, { width: doc.page.width - 80, align: 'center', characterSpacing: 0.45 });
};

module.exports = { BRAND, drawBrandMark, drawWatermark, drawPageFrame, drawBrandHeader, drawFooter };
