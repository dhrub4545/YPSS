const fs = require('fs');
const path = require('path');
const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');
const cloudinary = require('cloudinary').v2;

if (process.env.CLOUDINARY_CLOUD_NAME) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
}

const extractQuestionText = (q) => {
  if (typeof q === 'string') return q;
  if (!q || typeof q !== 'object') return '';
  return String(
    q.text ||
    q.question ||
    q.questionText ||
    q.statement ||
    q.content ||
    q.q ||
    q.title ||
    q.name ||
    ''
  ).trim();
};

const extractQuestionNumber = (q, index) => {
  if (typeof q === 'object' && q !== null) {
    const num = String(
      q.questionNumber ||
      q.qNum ||
      q.number ||
      q.no ||
      q.id ||
      ''
    ).trim();
    if (num && num.toLowerCase() !== 'undefined') return num;
  }
  return String(index + 1);
};

const xmlEscape = (str) =>
  String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

const renderLineRuns = (lineStr) => {
  const parts = lineStr.split('\t');
  let xml = '';
  parts.forEach((part, idx) => {
    if (part) {
      xml += `<w:r><w:rPr><w:sz w:val="26"/><w:szCs w:val="26"/></w:rPr><w:t xml:space="preserve">${xmlEscape(part)}</w:t></w:r>`;
    }
    if (idx < parts.length - 1) {
      xml += `<w:r><w:tab/></w:r>`;
    }
  });
  return xml;
};

const calculateOptimalCols = (columnBlocks, maxAllowed = 5) => {
  let maxLen = 0;
  columnBlocks.forEach((col) => {
    if (Array.isArray(col)) {
      col.forEach((line) => {
        const len = String(line || '').length;
        if (len > maxLen) maxLen = len;
      });
    } else if (typeof col === 'object' && col !== null) {
      Object.values(col).forEach((val) => {
        const len = String(val || '').length;
        if (len > maxLen) maxLen = len;
      });
    } else {
      const len = String(col || '').length;
      if (len > maxLen) maxLen = len;
    }
  });

  const TOTAL_PRINTABLE_DXA = 7600;
  const estimatedColDxa = Math.max(1400, (maxLen + 3) * 130);
  const calculatedCols = Math.floor(TOTAL_PRINTABLE_DXA / estimatedColDxa);
  return Math.max(1, Math.min(maxAllowed, calculatedCols));
};

const generateTabStopsXml = (colCount) => {
  if (colCount <= 1) return '';
  const TOTAL_PRINTABLE_DXA = 7500;
  const colStep = Math.floor(TOTAL_PRINTABLE_DXA / colCount);
  let tabsXml = '<w:tabs>';
  for (let i = 1; i < colCount; i++) {
    tabsXml += `<w:tab w:val="left" w:pos="${i * colStep}"/>`;
  }
  tabsXml += '</w:tabs>';
  return tabsXml;
};

const parseLine1Parts = (str) => {
  const parts = [];
  const regex = /(?:\([a-z0-9]+\)|[a-z0-9]+[\.\)])\s*\d+/gi;
  let match;
  while ((match = regex.exec(str)) !== null) {
    parts.push(match[0].trim());
  }
  if (!parts.length) {
    return str.includes('\t')
      ? str.split('\t').map((s) => s.trim()).filter(Boolean)
      : str.split(/(\s{2,}|\s+(?=\([a-z0-9]+\)|[a-z0-9]+[\.\)]))/i).map((s) => s.trim()).filter((s) => s && !/^\s+$/.test(s));
  }
  return parts;
};

const parseLine2Parts = (str) => {
  const parts = [];
  const regex = /(?:[x\+\-\÷\*\×]\s*\d+|\b\d+\b)/gi;
  let match;
  while ((match = regex.exec(str)) !== null) {
    parts.push(match[0].trim());
  }
  if (!parts.length) {
    return str.includes('\t')
      ? str.split('\t').map((s) => s.trim()).filter(Boolean)
      : str.trim().split(/\s{2,}/).map((s) => s.trim()).filter(Boolean);
  }
  return parts;
};

const formatArithmeticColumn = (subtag, topVal, opSymbol, bottomVal) => {
  const topDigits = String(topVal || '').trim();
  const bottomDigits = String(bottomVal || '').trim();
  const op = String(opSymbol || '').trim() || '+';

  const maxDigits = Math.max(topDigits.length, bottomDigits.length, 3);

  const topPadded = topDigits.padStart(maxDigits, ' ');
  const bottomPadded = bottomDigits.padStart(maxDigits, ' ');

  const topLine = `${subtag}   ${topPadded}`;
  const indentSpaces = ' '.repeat(subtag.length + 1);
  const bottomLine = `${indentSpaces}${op} ${bottomPadded}`;
  const dashLine = `${indentSpaces}${'-'.repeat(maxDigits + 3)}`;

  return { topLine, bottomLine, dashLine };
};

const normalizeAndSplitSubquestions = (text, qNum) => {
  let rawLines = String(text || '').split('\n');

  // Clean up duplicate Q.1., Q1., Question 1., 1. prefixes matching qNum
  rawLines = rawLines.map((line, idx) => {
    if (idx === 0) {
      let cleaned = line;
      if (qNum) {
        const qEscaped = qNum.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const pattern = new RegExp(`^\\s*(?:Q\\.?\\s*${qEscaped}[\\:\\.\\s]*|Question\\s*${qEscaped}[\\:\\.\\s]*|${qEscaped}[\\:\\.\\s]+)`, 'i');
        cleaned = cleaned.replace(pattern, '');
      }
      return cleaned.replace(/^\s*(?:Q\.?\s*\d+[\:\.\s]*|Question\s*\d+[\:\.\s]*)/i, '').trim();
    }
    return line;
  });

  // Check if lines represent vertical math operations (multiplication/addition/subtraction)
  if (rawLines.length >= 2) {
    let subtagLineIdx = -1;

    for (let k = 1; k < rawLines.length; k++) {
      if (/(?:\([a-z0-9]+\)|[a-z0-9]+[\.\)])/i.test(rawLines[k])) {
        subtagLineIdx = k;
        break;
      }
    }

    if (subtagLineIdx !== -1) {
      const line1 = rawLines[subtagLineIdx] || '';
      const line2 = rawLines[subtagLineIdx + 1] || '';
      const line3 = rawLines[subtagLineIdx + 2] || '';

      // CASE B: Line 1 has subtags ONLY (e.g. "(a) (b) (c) (d)"), Line 2 has top numbers ("76 58 525"), Line 3 has op+bottom ("+ 19 + 27")
      const line1HasOnlySubtags = /^\s*(?:(?:\([a-z0-9]+\)|[a-z0-9]+[\.\)])\s*)+$/i.test(line1.replace(/\t/g, ' '));
      const line2HasNumbers = /^\s*(?:\d+\s*)+$/.test(line2.replace(/\t/g, ' '));
      const line3HasOpNumbers = /(?:[x\+\-\÷\*\×]\s*\d+|\b\d+\b)/i.test(line3);

      if (line1HasOnlySubtags && line2HasNumbers && line3HasOpNumbers) {
        const subtags = parseLine1Parts(line1);
        const topNums = parseLine2Parts(line2);
        const bottomOps = parseLine2Parts(line3);

        if (subtags.length >= 2) {
          const formattedCols = [];
          subtags.forEach((subtag, idx) => {
            const topVal = topNums[idx] || '';
            const bottomPart = bottomOps[idx] || '';

            const match2 = bottomPart.match(/^([x\+\-\÷\*\×\=])\s*(.*)$/i);
            const op = match2 ? match2[1] : (bottomPart.match(/[x\+\-\÷\*\×\=]/i)?.[0] || '+');
            const bottomVal = match2 ? match2[2] : bottomPart.replace(/[x\+\-\÷\*\×\=]/gi, '').trim();

            const subtagClean = subtag.match(/^(\([a-z0-9]+\)|[a-z0-9]+[\.\)])/i)?.[1] || subtag;
            formattedCols.push(formatArithmeticColumn(subtagClean, topVal, op, bottomVal));
          });

          const optimalCols = calculateOptimalCols(formattedCols, 5);
          const resultLines = [rawLines[0]];

          for (let start = 0; start < formattedCols.length; start += optimalCols) {
            const chunk = formattedCols.slice(start, start + optimalCols);
            const l1 = chunk.map((c) => c.topLine).join('\t');
            const l2 = chunk.map((c) => c.bottomLine).join('\t');
            const l3 = chunk.map((c) => c.dashLine).join('\t');

            resultLines.push(l1, l2, l3, '');
          }

          let endIdx = subtagLineIdx + 3;
          if (endIdx < rawLines.length && /^\s*[\-\=]{3,}/.test(rawLines[endIdx].trim())) {
            endIdx++;
          }
          if (endIdx < rawLines.length) {
            resultLines.push(...rawLines.slice(endIdx));
          }

          return resultLines.join('\n');
        }
      }

      // CASE A: Line 1 has subtags + top numbers (e.g. "(a) 76 (b) 58"), Line 2 has op+bottom (e.g. "+ 19 + 27")
      const line1HasSubtagAndNum = /(?:\([a-z0-9]+\)|[a-z0-9]+[\.\)])\s*\d+/i.test(line1);
      const line2HasOpNumber = /(?:[x\+\-\÷\*\×]\s*\d+|\b\d+\b)/i.test(line2.trim());

      if (line1HasSubtagAndNum && line2HasOpNumber) {
        const col1Parts = parseLine1Parts(line1);
        const col2Parts = parseLine2Parts(line2);

        if (col1Parts.length >= 2) {
          const formattedCols = [];

          col1Parts.forEach((part1, idx) => {
            const match1 = part1.match(/^(\([a-z0-9]+\)|[a-z0-9]+[\.\)])\s*(.*)$/i);
            const subtag = match1 ? match1[1] : `(${String.fromCharCode(97 + idx)})`;
            const topNum = match1 ? match1[2] : part1;

            const part2 = col2Parts[idx] || '';
            const match2 = part2.match(/^([x\+\-\÷\*\×\=])\s*(.*)$/i);
            const op = match2 ? match2[1] : (part2.match(/[x\+\-\÷\*\×\=]/i)?.[0] || '+');
            const bottomNum = match2 ? match2[2] : part2.replace(/[x\+\-\÷\*\×\=]/gi, '').trim();

            formattedCols.push(formatArithmeticColumn(subtag, topNum, op, bottomNum));
          });

          const optimalCols = calculateOptimalCols(formattedCols, 5);
          const resultLines = [rawLines[0]];

          for (let start = 0; start < formattedCols.length; start += optimalCols) {
            const chunk = formattedCols.slice(start, start + optimalCols);
            const l1 = chunk.map((c) => c.topLine).join('\t');
            const l2 = chunk.map((c) => c.bottomLine).join('\t');
            const l3 = chunk.map((c) => c.dashLine).join('\t');

            resultLines.push(l1, l2, l3, '');
          }

          let endIdx = subtagLineIdx + 2;
          if (endIdx < rawLines.length && /^\s*[\-\=]{3,}/.test(rawLines[endIdx].trim())) {
            endIdx++;
          }
          if (endIdx < rawLines.length) {
            resultLines.push(...rawLines.slice(endIdx));
          }

          return resultLines.join('\n');
        }
      }
    }
  }

  // Fallback for general text or horizontal equation sub-questions (like Q.6)
  const processedLines = [];
  let i = 0;

  while (i < rawLines.length) {
    const line = rawLines[i];
    const trimmed = line.trim();

    const hasSubtags = /(?:\([a-z0-9]+\)|[a-z0-9]+\))\s+/i.test(trimmed);

    if (hasSubtags) {
      let col1Parts = line.includes('\t')
        ? line.split('\t').map((s) => s.trim()).filter(Boolean)
        : line.split(/(\s{2,}|\s+(?=\([a-z0-9]+\)|[a-z0-9]+\)))/i).map((s) => s.trim()).filter((s) => s && !/^\s+$/.test(s));

      const numCols = col1Parts.length;
      const optimalCols = calculateOptimalCols(col1Parts, 5);

      if (numCols > optimalCols) {
        for (let startCol = 0; startCol < numCols; startCol += optimalCols) {
          const endCol = Math.min(startCol + optimalCols, numCols);
          const chunk = col1Parts.slice(startCol, endCol);
          processedLines.push(chunk.join('\t'));
        }
        i++;
        continue;
      } else if (numCols >= 2) {
        processedLines.push(col1Parts.join('\t'));
        i++;
        continue;
      }
    }

    processedLines.push(line);
    i++;
  }

  return processedLines.join('\n');
};

const resolveImageBuffer = async (imgSource) => {
  if (!imgSource) return null;
  if (typeof imgSource === 'string' && (imgSource.startsWith('http://') || imgSource.startsWith('https://'))) {
    try {
      const res = await fetch(imgSource);
      if (res.ok) {
        return Buffer.from(await res.arrayBuffer());
      }
    } catch (err) {
      console.warn(`[WordGenerator] Failed to fetch image from URL: ${imgSource}`, err.message);
    }
    return null;
  }
  if (typeof imgSource === 'string' && fs.existsSync(imgSource)) {
    try {
      return fs.readFileSync(imgSource);
    } catch (err) {
      console.warn(`[WordGenerator] Failed to read local image: ${imgSource}`, err.message);
    }
  }
  return null;
};

const getImageDimensions = (buffer) => {
  if (!buffer || !Buffer.isBuffer(buffer)) return { width: 900, height: 220 };
  try {
    if (buffer.length >= 24 && buffer[0] === 0x89 && buffer.toString('ascii', 1, 4) === 'PNG') {
      const width = buffer.readUInt32BE(16);
      const height = buffer.readUInt32BE(20);
      if (width > 0 && height > 0) return { width, height };
    }
    if (buffer.length >= 4 && buffer[0] === 0xFF && buffer[1] === 0xD8) {
      let offset = 2;
      while (offset < buffer.length - 8) {
        if (buffer[offset] !== 0xFF) break;
        const marker = buffer[offset + 1];
        if (marker === 0xC0 || marker === 0xC2) {
          const height = buffer.readUInt16BE(offset + 5);
          const width = buffer.readUInt16BE(offset + 7);
          if (width > 0 && height > 0) return { width, height };
          break;
        }
        const length = buffer.readUInt16BE(offset + 2);
        offset += 2 + length;
      }
    }
  } catch (e) {
    console.warn('[WordGenerator] Dimension detection fallback:', e.message);
  }
  return { width: 900, height: 220 };
};

const getPngDimensions = (filePath) => {
  if (!filePath || !fs.existsSync(filePath)) return { width: 900, height: 220 };
  try {
    const fd = fs.openSync(filePath, 'r');
    const buffer = Buffer.alloc(24);
    fs.readSync(fd, buffer, 0, 24, 0);
    fs.closeSync(fd);
    if (buffer.toString('ascii', 1, 4) === 'PNG') {
      const width = buffer.readUInt32BE(16);
      const height = buffer.readUInt32BE(20);
      if (width > 0 && height > 0) return { width, height };
    }
  } catch (e) {
    console.warn('Could not read PNG dimensions:', e.message);
  }
  return { width: 900, height: 220 };
};

const calculateWordDrawingExtent = (target) => {
  let width = 900;
  let height = 220;

  if (target && typeof target === 'object') {
    width = target.width || 900;
    height = target.height || 220;
  } else if (typeof target === 'string') {
    const dims = getPngDimensions(target);
    width = dims.width;
    height = dims.height;
  }

  const aspectRatio = width / Math.max(1, height);

  const fullColumnWidthEMU = 5200000; // ~5.46 inches wide
  let cx = fullColumnWidthEMU;
  let cy = Math.round(fullColumnWidthEMU / aspectRatio);

  if (aspectRatio >= 3.0) {
    cy = Math.min(1400000, Math.max(850000, Math.round(fullColumnWidthEMU / aspectRatio)));
  } else if (cy > 3200000) {
    cy = 3200000;
    cx = Math.round(cy * aspectRatio);
  } else if (cy < 750000) {
    cy = 750000;
  }

  return { cx, cy };
};

const buildQuestionXml = (qNum, rawText, marksText, figureImgId = null, figurePath = null, figureDimensions = null, drawingId = 100) => {
  const text = normalizeAndSplitSubquestions(rawText, qNum);
  const rawLines = String(text || '').split('\n');
  const blocks = [];
  let currentTable = null;
  let currentTextLines = [];

  const flushText = () => {
    if (currentTextLines.length) {
      blocks.push({ type: 'text', lines: currentTextLines });
      currentTextLines = [];
    }
  };

  const flushTable = () => {
    if (currentTable && currentTable.length) {
      blocks.push({ type: 'table', rows: currentTable });
      currentTable = null;
    }
  };

  for (let line of rawLines) {
    const trimmed = line.trim();
    if (trimmed.includes('|') && trimmed.split('|').map((s) => s.trim()).filter(Boolean).length >= 2) {
      flushText();
      if (!currentTable) currentTable = [];
      const cells = trimmed
        .split('|')
        .map((s) => s.trim())
        .filter((cell, idx, arr) => {
          if ((idx === 0 || idx === arr.length - 1) && cell === '') return false;
          return true;
        });

      // Filter out Markdown table alignment/separator rows like | --- | --- | --- |
      const isSeparatorRow = cells.every((cell) => /^[\:\-\s]+$/.test(cell));
      if (!isSeparatorRow && cells.length > 0) {
        currentTable.push(cells);
      }
    } else {
      flushTable();
      currentTextLines.push(line);
    }
  }
  flushText();
  flushTable();

  let resultXml = '';

  blocks.forEach((block, bIdx) => {
    if (block.type === 'text') {
      const isFirstBlock = bIdx === 0;
      const lineCount = block.lines.length;

      const isMathBlock = block.lines.some((l) =>
        /^\s*[\(\[a-z0-9\)\.]*\s*(x|\+|\-)\s*\d+/i.test(l) ||
        /^\s*[\-\=]{3,}\s*/.test(l)
      );

      block.lines.forEach((line, lIdx) => {
        const isFirstLineOfQuestion = isFirstBlock && lIdx === 0;
        const isLastLineOfBlock = lIdx === lineCount - 1;
        const isDashLine = /^\s*[\-\=]{3,}/.test(line.trim());

        let spacingBefore = '0';
        let spacingAfter = isDashLine
          ? '160'
          : (isLastLineOfBlock && bIdx === blocks.length - 1)
          ? '120'
          : (isMathBlock ? '0' : '40');
        let lineSpacingAttr = isMathBlock && !isDashLine ? ' w:line="240" w:lineRule="exact"' : '';

        const hasTabs = line.includes('\t');
        const colCount = hasTabs ? line.split('\t').length : 1;
        const tabsXml = hasTabs ? generateTabStopsXml(colCount) : '';

        resultXml += `<w:p><w:pPr>${tabsXml}<w:spacing w:before="${spacingBefore}" w:after="${spacingAfter}"${lineSpacingAttr}/></w:pPr>`;

        if (isFirstLineOfQuestion) {
          resultXml += `<w:r><w:rPr><w:b/><w:sz w:val="28"/><w:szCs w:val="28"/></w:rPr><w:t xml:space="preserve">${xmlEscape(qNum)}.  </w:t></w:r>`;
        }

        resultXml += renderLineRuns(line);

        if (isFirstLineOfQuestion && marksText) {
          resultXml += `<w:r><w:rPr><w:b/><w:sz w:val="24"/><w:szCs w:val="24"/><w:color w:val="555555"/></w:rPr><w:t xml:space="preserve">${xmlEscape(marksText)}</w:t></w:r>`;
        }

        resultXml += `</w:p>`;
      });
    } else if (block.type === 'table') {
      let tblXml = `<w:tbl>`;
      tblXml += `
<w:tblPr>
  <w:tblStyle w:val="TableGrid"/>
  <w:tblW w:w="0" w:type="auto"/>
  <w:jc w:val="center"/>
  <w:tblBorders>
    <w:top w:val="single" w:sz="6" w:space="0" w:color="444444"/>
    <w:left w:val="single" w:sz="6" w:space="0" w:color="444444"/>
    <w:bottom w:val="single" w:sz="6" w:space="0" w:color="444444"/>
    <w:right w:val="single" w:sz="6" w:space="0" w:color="444444"/>
    <w:insideH w:val="single" w:sz="4" w:space="0" w:color="777777"/>
    <w:insideV w:val="single" w:sz="4" w:space="0" w:color="777777"/>
  </w:tblBorders>
  <w:tblCellMar>
    <w:top w:w="120" w:type="dxa"/>
    <w:bottom w:w="120" w:type="dxa"/>
    <w:left w:w="180" w:type="dxa"/>
    <w:right w:w="180" w:type="dxa"/>
  </w:tblCellMar>
</w:tblPr>`;

      block.rows.forEach((rowCells, rIdx) => {
        tblXml += `<w:tr>`;
        const isHeaderRow = rIdx === 0;

        rowCells.forEach((cellText) => {
          const shdXml = isHeaderRow ? `<w:shd w:val="clear" w:color="auto" w:fill="F0F4F8"/>` : '';
          const bXml = isHeaderRow ? `<w:b/>` : '';

          tblXml += `<w:tc>`;
          tblXml += `<w:tcPr>${shdXml}</w:tcPr>`;
          tblXml += `<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="60" w:after="60"/></w:pPr>`;
          tblXml += `<w:r><w:rPr>${bXml}<w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr><w:t xml:space="preserve">${xmlEscape(cellText)}</w:t></w:r>`;
          tblXml += `</w:p></w:tc>`;
        });

        tblXml += `</w:tr>`;
      });

      tblXml += `</w:tbl>`;
      tblXml += `<w:p><w:pPr><w:spacing w:before="0" w:after="80"/></w:pPr></w:p>`;

      resultXml += tblXml;
    }
  });

  // If a figure diagram image is attached to this question, embed it directly under the question with calculated extents
  if (figureImgId) {
    const { cx, cy } = calculateWordDrawingExtent(figureDimensions || figurePath);
    resultXml += `
<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="60" w:after="80"/></w:pPr>
  <w:r>
    <w:drawing>
      <wp:inline distT="0" distB="0" distL="0" distR="0">
        <wp:extent cx="${cx}" cy="${cy}"/>
        <wp:docPr id="${drawingId}" name="Figure ${drawingId}"/>
        <a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
          <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
            <pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
              <pic:nvPicPr>
                <pic:cNvPr id="${drawingId}" name="Figure ${drawingId}"/>
                <pic:cNvPicPr/>
              </pic:nvPicPr>
              <pic:blipFill>
                <a:blip r:embed="${figureImgId}"/>
                <a:stretch><a:fillRect/></a:stretch>
              </pic:blipFill>
              <pic:spPr>
                <a:xfrm>
                  <a:off x="0" y="0"/>
                  <a:ext cx="${cx}" cy="${cy}"/>
                </a:xfrm>
                <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
              </pic:spPr>
            </pic:pic>
          </a:graphicData>
        </a:graphic>
      </wp:inline>
    </w:drawing>
  </w:r>
</w:p>`;
  }

  return resultXml;
};

const normalizeDigits = (val) => {
  const nepaliToAscii = { '०': '0', '१': '1', '२': '2', '३': '3', '४': '4', '५': '5', '६': '6', '७': '7', '८': '8', '९': '9' };
  return String(val || '').replace(/[०-९]/g, (w) => nepaliToAscii[w] || w).replace(/[^\d]/g, '');
};

const toNepaliDigits = (val) => {
  const digitsMap = { '0': '०', '1': '१', '2': '२', '3': '३', '4': '४', '5': '५', '6': '६', '7': '७', '8': '८', '9': '९' };
  return String(val ?? '').replace(/[0-9]/g, (w) => digitsMap[w] || w);
};

const toNepaliTerm = (termVal) => {
  const t = String(termVal || '').trim().toLowerCase();
  if (t.includes('1') || t.includes('first') || t.includes('प्रथम')) return 'प्रथम';
  if (t.includes('2') || t.includes('second') || t.includes('दोस्रो')) return 'दोस्रो';
  if (t.includes('3') || t.includes('third') || t.includes('तेस्रो')) return 'तेस्रो';
  if (t.includes('4') || t.includes('fourth') || t.includes('चौथो')) return 'चौथो';
  return toNepaliDigits(termVal || 'प्रथम');
};

const toNepaliClass = (classVal) => {
  let str = String(classVal || '').trim();
  // Strip "Class" or "कक्षा" prefix to avoid duplicate "कक्षा :- कक्षा ५"
  str = str.replace(/^(?:class|कक्षा)\s*/i, '').trim();
  return toNepaliDigits(str);
};

const toNepaliSubject = (subVal) => {
  const str = String(subVal || '').trim();
  const lower = str.toLowerCase();
  const subjectMap = {
    'nepali': 'नेपाली',
    'mathematics': 'गणित',
    'math': 'गणित',
    'maths': 'गणित',
    'science': 'विज्ञान',
    'social': 'सामाजिक शिक्षा',
    'social studies': 'सामाजिक शिक्षा',
    'english': 'अंग्रेजी',
    'computer': 'कम्प्युटर',
    'health': 'स्वास्थ्य तथा शारीरिक शिक्षा',
    'moral': 'नैतिक शिक्षा',
    'gk': 'सामान्य ज्ञान',
    'g.k.': 'सामान्य ज्ञान',
  };
  return subjectMap[lower] || toNepaliDigits(str);
};

/**
 * Generates an MS Word (.docx) file for a question paper using the official enqp_template.docx or npqp_template.docx
 * @param {Object} data Structured question paper data
 * @param {String} outputPath Path to save docx file
 * @param {Array} figures Optional attached figures [{ questionNumber, imagePath, generatedImagePath }]
 */
const generateQuestionDocx = async (data, outputPath, figures = []) => {
  return new Promise(async (resolve, reject) => {
    try {
      const isNepali =
        data.template === 'npqp' ||
        data.useNepaliTemplate ||
        String(data.subject || '').toLowerCase() === 'nepali' ||
        String(data.language || '').toLowerCase() === 'nepali' ||
        String(data.mode || '').toLowerCase() === 'nepali';

      const preferredTemplate = isNepali ? 'npqp_template.docx' : 'enqp_template.docx';
      const candidatePaths = [
        path.join(__dirname, `../${preferredTemplate}`),
        path.join(process.cwd(), preferredTemplate),
        path.join(process.cwd(), 'backend', preferredTemplate),
        path.join(__dirname, '../enqp_template.docx'),
        path.join(process.cwd(), 'enqp_template.docx'),
        path.join(process.cwd(), 'backend', 'enqp_template.docx'),
      ];
      let templatePath = candidatePaths.find((p) => fs.existsSync(p));
      if (!templatePath) {
        return reject(new Error('Template file enqp_template.docx not found in backend directory'));
      }

      const content = fs.readFileSync(templatePath);
      const zip = new PizZip(content);

      // Handle figure image embeddings
      const figureMap = {};
      let relsXml = zip.file('word/_rels/document.xml.rels')?.asText() || '';
      let ctXml = zip.file('[Content_Types].xml')?.asText() || '';
      let ctModified = false;

      if (Array.isArray(figures) && figures.length > 0) {
        for (let idx = 0; idx < figures.length; idx++) {
          const fig = figures[idx];
          const candidate =
            fig.generatedImagePath ||
            fig.generatedImageUrl ||
            fig.originalImagePath ||
            fig.originalImageUrl ||
            fig.imagePath ||
            fig.path;

          let imgBuf = await resolveImageBuffer(candidate);
          if (!imgBuf && (fig.originalImagePath || fig.originalImageUrl)) {
            imgBuf = await resolveImageBuffer(fig.originalImageUrl || fig.originalImagePath);
          }

          if (imgBuf && imgBuf.length > 0) {
            // If the buffer is SVG XML text, rasterize to true binary PNG via Cloudinary
            if (imgBuf[0] === 0x3C || imgBuf.toString('utf-8', 0, 50).includes('<svg')) {
              try {
                if (cloudinary && process.env.CLOUDINARY_CLOUD_NAME) {
                  const base64Data = 'data:image/svg+xml;base64,' + imgBuf.toString('base64');
                  const uploadRes = await cloudinary.uploader.upload(base64Data, {
                    folder: 'ypss_question_papers/figures',
                    format: 'png',
                    resource_type: 'image',
                    transformation: [{ effect: 'trim' }],
                  });
                  if (uploadRes && uploadRes.secure_url) {
                    const pngRes = await fetch(uploadRes.secure_url);
                    if (pngRes.ok) {
                      imgBuf = Buffer.from(await pngRes.arrayBuffer());
                    }
                  }
                }
              } catch (svgErr) {
                console.warn('[WordGenerator] SVG on-the-fly rasterization fallback failed:', svgErr.message);
              }
            }

            const isJpeg = imgBuf[0] === 0xFF && imgBuf[1] === 0xD8;
            const ext = isJpeg ? 'jpeg' : 'png';
            const relId = `rIdFig_${idx + 10}`;
            const targetMedia = `media/figure_${idx + 1}.${ext}`;

            // Add image file into Word zip archive
            zip.file(`word/${targetMedia}`, imgBuf);

            // Add Relationship entry in document.xml.rels
            if (!relsXml.includes(relId)) {
              const relEntry = `<Relationship Id="${relId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${targetMedia}"/>`;
              relsXml = relsXml.replace('</Relationships>', `${relEntry}</Relationships>`);
            }

            // Ensure [Content_Types].xml includes the image format
            if (isJpeg && !ctXml.includes('Extension="jpeg"')) {
              ctXml = ctXml.replace('</Types>', '<Default Extension="jpeg" ContentType="image/jpeg"/><Default Extension="jpg" ContentType="image/jpeg"/></Types>');
              ctModified = true;
            }
            if (!ctXml.includes('Extension="png"')) {
              ctXml = ctXml.replace('</Types>', '<Default Extension="png" ContentType="image/png"/></Types>');
              ctModified = true;
            }

            const dimensions = getImageDimensions(imgBuf);
            const rawQNum = String(fig.questionNumber || fig.qNum || '').trim();
            const cleanQNum = normalizeDigits(rawQNum);
            const figData = { relId, imgFile: candidate, dimensions };

            if (cleanQNum) figureMap[cleanQNum] = figData;
            if (rawQNum) figureMap[rawQNum] = figData;
            figureMap[`idx_${idx}`] = figData;
          }
        }
        zip.file('word/_rels/document.xml.rels', relsXml);
        if (ctModified) {
          zip.file('[Content_Types].xml', ctXml);
        }
      }

      // Clean up XML tags in memory to sanitize any Word bracket typos in enqp_template.docx
      let xml = zip.file('word/document.xml').asText();
      xml = xml.replace(/\{pass\}[^<}]*marks\}/gi, '{pass}');
      xml = xml.replace(/\{pass\}[^<}]*marks/gi, '{pass}');
      xml = xml.replace(/\}[\s]*marks\}/gi, '');
      xml = xml.replace(/\}[\s]*marks/gi, '');
      xml = xml.replace(/\{\s*exam time\s*\}/g, '{exam time}');
      xml = xml.replace(/\{\s*term name\s*\}/g, '{term name}');
      xml = xml.replace(/\{\s*class name\s*\}/g, '{class name}');
      xml = xml.replace(/\{\s*Full marks\s*\}/g, '{Full marks}');

      // Inject flat sequential questions structure directly after "Attempt all question" BEFORE w:sectPr
      if (!xml.includes('{#sections}')) {
        const loopXml = `
<w:p><w:r><w:t>{#sections}</w:t></w:r></w:p>
<w:p><w:r><w:t>{#questions}</w:t></w:r></w:p>
<w:p><w:r><w:t>{@questionXml}</w:t></w:r></w:p>
<w:p><w:r><w:t>{/questions}</w:t></w:r></w:p>
<w:p><w:r><w:t>{/sections}</w:t></w:r></w:p>
`;
        xml = xml.replace(/<w:sectPr[\s\S]*?<\/w:sectPr>/, (match) => loopXml + match);
      }

      zip.file('word/document.xml', xml);

      // Configure docxtemplater with nullGetter returning "" and linebreaks enabled
      const doc = new Docxtemplater(zip, {
        paragraphLoop: true,
        linebreaks: true,
        nullGetter() {
          return '';
        },
      });

      // Flatten all questions into a single sequential list
      let allQuestions = [];
      if (Array.isArray(data.sections)) {
        data.sections.forEach((sec) => {
          if (Array.isArray(sec.questions)) {
            allQuestions.push(...sec.questions);
          }
        });
      } else if (Array.isArray(data.questions)) {
        allQuestions = data.questions;
      }

      const usedRelIds = new Set();
      const sortedQuestionItems = [];
      let drawingCounter = 100;

      // 1. Process OCR questions from handwritten paper
      allQuestions.forEach((q, idx) => {
        if (!q) return;

        let rawQNum = extractQuestionNumber(q, idx)
          .replace(/\[\s*undefined\s*\]/gi, '')
          .replace(/\bundefined\b/gi, '')
          .trim();
        if (!rawQNum) rawQNum = `${idx + 1}`;

        const cleanDigitsQNum = normalizeDigits(rawQNum);
        const numVal = parseInt(cleanDigitsQNum, 10) || (idx + 1);

        let matchingRelId = null;
        let matchingImgFile = null;
        let matchingDimensions = null;

        const tryMatch = (key) => {
          const entry = figureMap[key];
          if (entry && !usedRelIds.has(entry.relId)) {
            matchingRelId = entry.relId;
            matchingImgFile = entry.imgFile;
            matchingDimensions = entry.dimensions;
            return true;
          }
          return false;
        };

        if (cleanDigitsQNum) tryMatch(cleanDigitsQNum);
        if (!matchingRelId) tryMatch(rawQNum);

        if (!matchingRelId && figures.length > 0) {
          const matchedFigIdx = figures.findIndex((f, fIdx) => {
            const figQNum = normalizeDigits(f.questionNumber || f.qNum || '');
            const entry = figureMap[`idx_${fIdx}`];
            return figQNum && figQNum === cleanDigitsQNum && entry && !usedRelIds.has(entry.relId);
          });
          if (matchedFigIdx !== -1) {
            const entry = figureMap[`idx_${matchedFigIdx}`];
            matchingRelId = entry.relId;
            matchingImgFile = entry.imgFile;
            matchingDimensions = entry.dimensions;
          }
        }

        // Mark relationship ID as used so it is NEVER added multiple times!
        if (matchingRelId) {
          usedRelIds.add(matchingRelId);
        }

        let qNumDisplay = isNepali ? toNepaliDigits(rawQNum) : rawQNum;

        let text = extractQuestionText(q)
          .replace(/\[\s*undefined\s*\]/gi, '')
          .replace(/\bundefined\b/gi, '')
          .trim();

        if (!text || text.toLowerCase() === 'undefined') return;

        const marksNum = Number(q.marks);
        const hasValidMarks =
          q.marks !== null &&
          q.marks !== undefined &&
          q.marks !== '' &&
          !isNaN(marksNum) &&
          marksNum > 0;

        const formattedMarks = isNepali ? toNepaliDigits(marksNum) : marksNum;
        const marksText = hasValidMarks ? `  [${formattedMarks}]` : '';

        drawingCounter++;
        sortedQuestionItems.push({
          sortNum: numVal,
          questionXml: buildQuestionXml(qNumDisplay, text, marksText, matchingRelId, matchingImgFile, matchingDimensions, drawingCounter),
        });
      });

      // 2. Auto-inject any attached figures whose question number was NOT found in handwritten text OCR
      if (Array.isArray(figures) && figures.length > 0) {
        figures.forEach((fig, fIdx) => {
          const rawFigQNum = String(fig.questionNumber || fIdx + 1).trim();
          const cleanFigQNum = normalizeDigits(rawFigQNum);

          const entry =
            figureMap[cleanFigQNum] ||
            figureMap[rawFigQNum] ||
            figureMap[`idx_${fIdx}`];

          if (entry && !usedRelIds.has(entry.relId)) {
            usedRelIds.add(entry.relId);

            const figDigits = parseInt(cleanFigQNum, 10) || (fIdx + 1);
            const figQNumDisplay = isNepali ? toNepaliDigits(rawFigQNum) : rawFigQNum;
            const placeholderText = isNepali ? '[तलको चित्र हेर्नुहोस्]' : '[See Figure below]';

            drawingCounter++;
            sortedQuestionItems.push({
              sortNum: figDigits,
              questionXml: buildQuestionXml(figQNumDisplay, placeholderText, '', entry.relId, entry.imgFile, entry.dimensions, drawingCounter),
            });
          }
        });
      }

      // 3. Sort all questions into exact numerical sequence (Q.1, Q.2, Q.3...)
      sortedQuestionItems.sort((a, b) => a.sortNum - b.sortNum);

      const cleanedQuestions = sortedQuestionItems.map((item) => ({
        questionXml: item.questionXml,
      }));

      if (!cleanedQuestions.length) {
        throw new Error('No valid questions found to generate Word paper document.');
      }

      let termName = data['term name'] || data.termName || '1st';
      let className = data['class name'] || data.className || 'Class';
      let subject = data.subject || 'Subject';
      let timeVal = String(data['exam time'] || data.time || '3').replace(/\s*hrs?/gi, '');
      let fullMarksVal = String(data['Full marks'] || data.fullMarks || 100);
      let passMarksVal = String(data.pass || data.passMarks || 40);
      let yearVal = data.year || '2081 B.S.';

      if (isNepali) {
        termName = toNepaliTerm(termName);
        className = toNepaliClass(className);
        subject = toNepaliSubject(subject);
        timeVal = toNepaliDigits(timeVal);
        fullMarksVal = toNepaliDigits(fullMarksVal);
        passMarksVal = toNepaliDigits(passMarksVal);
        yearVal = toNepaliDigits(yearVal);
      }

      const templateData = {
        'term name': termName,
        'year': yearVal,
        'class name': className,
        'subject': subject,
        'exam time': timeVal,
        'Full marks': fullMarksVal,
        'pass': passMarksVal,
        sections: [{ questions: cleanedQuestions }],
      };

      doc.render(templateData);

      const buffer = doc.getZip().generate({
        type: 'nodebuffer',
        compression: 'DEFLATE',
      });

      fs.writeFileSync(outputPath, buffer);
      resolve(outputPath);
    } catch (error) {
      console.error('Template docx generation error:', error);
      reject(error);
    }
  });
};

module.exports = { generateQuestionDocx };

