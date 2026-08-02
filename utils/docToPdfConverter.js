const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { generateQuestionPdf: fallbackPdfGenerator } = require('./questionPdfGenerator');

/**
 * Converts a generated MS Word (.docx) file directly into a PDF file so both documents are 100% identical.
 * Uses MS Word COM object on Windows, or falls back to standard PDF compiler if Word is unavailable.
 * 
 * @param {String} docxPath Absolute path to the source .docx file
 * @param {String} pdfPath Absolute path to the destination .pdf file
 * @param {Object} fallbackData Data object for fallback generation if conversion fails
 */
const convertDocxToPdf = async (docxPath, pdfPath, fallbackData) => {
  const absDocx = path.resolve(docxPath).replace(/\//g, '\\');
  const absPdf = path.resolve(pdfPath).replace(/\//g, '\\');

  if (process.platform === 'win32') {
    try {
      const psScript = `
$ErrorActionPreference = 'Stop'
$docxPath = '${absDocx}'
$pdfPath = '${absPdf}'
$word = $null
$doc = $null
try {
    $word = New-Object -ComObject Word.Application
    $word.Visible = $false
    $word.DisplayAlerts = 0
    $doc = $word.Documents.Open($docxPath)
    $doc.SaveAs([ref]$pdfPath, [ref]17)
} finally {
    if ($doc) { $doc.Close() }
    if ($word) {
        $word.Quit()
        [System.Runtime.Interopservices.Marshal]::ReleaseComObject($word) | Out-Null
    }
}
`;
      const tempPsFile = path.join(__dirname, `convert_${Date.now()}_${Math.floor(Math.random()*1000)}.ps1`);
      fs.writeFileSync(tempPsFile, psScript);
      try {
        execSync(`powershell -ExecutionPolicy Bypass -File "${tempPsFile}"`, { timeout: 30000 });
      } finally {
        if (fs.existsSync(tempPsFile)) fs.unlinkSync(tempPsFile);
      }

      if (fs.existsSync(absPdf) && fs.statSync(absPdf).size > 0) {
        console.log(`[DocToPdf] Successfully converted DOCX to PDF via MS Word COM: ${pdfPath}`);
        return pdfPath;
      }
    } catch (err) {
      console.warn(`[DocToPdf] MS Word COM conversion failed: ${err.message}. Using fallback generator.`);
    }
  }

  // Fallback if MS Word conversion is unavailable
  console.log(`[DocToPdf] Generating PDF using fallback kit for ${pdfPath}`);
  await fallbackPdfGenerator(fallbackData, pdfPath);
  return pdfPath;
};

module.exports = { convertDocxToPdf };
