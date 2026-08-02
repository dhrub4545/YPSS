require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const getGeminiApiKeys = () => {
  const keys = [];
  ['GEMINI_API_KEY_1', 'GEMINI_API_KEY_2', 'GEMINI_API_KEY_3', 'GEMINI_API_KEY'].forEach((keyName) => {
    const val = process.env[keyName]?.trim();
    if (val && !keys.includes(val)) keys.push(val);
  });
  return keys;
};

const fileToGenerativePart = (filePath, mimeType) => ({
  inlineData: {
    data: Buffer.from(fs.readFileSync(filePath)).toString('base64'),
    mimeType,
  },
});

async function generateGeometricDiagramFromImage(imagePath, outputPath, mode = 'auto') {
  const apiKeys = getGeminiApiKeys();
  if (!apiKeys.length) {
    throw new Error('No Gemini API keys found in environment');
  }

  let prompt = '';

  if (mode === 'book_cleanup') {
    prompt = `You are a world-class textbook illustration and worksheet graphic designer.
Analyze this textbook page / illustration image carefully. Notice that it contains student pen/pencil markings, scribbles, red lines, checkmarks, fold marks, or background paper shadows.

Re-create this page/figure as a pristine, high-fidelity SVG graphics string (<svg xmlns="http://www.w3.org/2000/svg" ...>):

CRITICAL RESTORATION & CLEANUP RULES:
1. Canvas Proportions: viewBox="0 0 650 750", width="650", height="750".
2. Background: <rect width="100%" height="100%" fill="#ffffff"/> (clean pure white background).
3. REMOVE ALL PEN / PENCIL MARKS & SCRIBBLES:
   - Completely REMOVE all student pencil/pen lines, red matching lines, checkmarks, scribbles, underline marks, paper shadows, and page tilt!
   - Do NOT draw any red lines or student matching lines.
4. LAYOUT & COLUMN ALIGNMENT (Compact, Zero Wasted Gap):
   - Left Column (Illustrations): Place all original colored illustrations cleanly on the left (e.g. school bag, pencil, box of toys, uniform dress, tiffin box, sharpener). Make illustrations LARGE and VIVID (occupying x=30 to x=220).
   - Alignment Dots: Place left connector dots at x=250 and right connector dots at x=340. Do NOT leave huge empty gaps between columns!
   - Right Column (Printed Text): Start printed text at x=370, neatly aligned vertically with each corresponding item.
5. LARGE BOLD READABLE TYPOGRAPHY (CRITICAL FOR WORD/PDF):
   - Make all printed Devanagari and English text LARGE, BOLD, and DARK (font-family="Arial, sans-serif, Noto Sans Devanagari", font-size="30", font-weight="900", fill="#000000").
   - Text MUST be large, clear, and prominent so it is 100% readable when embedded into Microsoft Word (.docx) and PDF test papers!
6. Return ONLY valid SVG XML code block wrapped in \`\`\`xml ... \`\`\` or \`\`\`svg ... \`\`\` tags without extra conversational text.`;
  } else if (mode === 'geometry') {
    prompt = `You are a world-class geometry diagram graphic designer for school question papers.
Analyze this handwritten figure / geometry diagram image carefully.
Re-create this exact geometrical figure as a clean, self-contained SVG graphics string (<svg xmlns="http://www.w3.org/2000/svg" ...>).

CRITICAL SPECIFICATIONS:
1. Canvas Size: viewBox="0 0 900 220", width="900", height="220".
2. Background: <rect width="100%" height="100%" fill="#ffffff"/> (clean pure white background).
3. PROPORTIONS & SIZE:
   - Make all geometric shapes (parallelograms, triangles, circles, squares, rectangles, angles) LARGE, PROMINENT, BOLD, and fill the height of the canvas cleanly!
   - Do NOT leave huge empty vertical margins at top or bottom.
4. Geometric Shapes & Lines:
   - Use crisp, solid black strokes (#000000) with stroke-width="3" or "3.5".
   - Render exact geometric angles, triangles, right-angle corner boxes (<rect ... fill="none" stroke="#000000"/> or L-shapes), arc curves for acute/obtuse angles.
5. Text & Labels:
   - Sub-figure circled numbers/letters like (a), (b), (c) in clean circles <circle cx="..." cy="..." r="14" fill="none" stroke="#000000" stroke-width="2"/> with bold centered text.
   - Vertices & Rays labels (e.g., M, O, N, X, Y, Z, A, B, C) in bold sans-serif font (font-family="Arial, sans-serif", font-weight="bold", font-size="18").
   - Include any fill-in-the-blank text lines under each figure (e.g., "Name of angle — — —", "Vertex of angle — — —", "Arms of angle — — —, — — —") aligned in neat columns under each figure.
6. Return ONLY the valid SVG XML code block wrapped in \`\`\`xml ... \`\`\` or \`\`\`svg ... \`\`\` tags without extra conversational text.`;
  } else {
    prompt = `You are an expert school examination figure graphics designer and textbook page restoration artist.
Analyze this image carefully.

IF THIS IS A TEXTBOOK / WORKSHEET PAGE OR ILLUSTRATION PHOTO:
- Re-create a pristine, clean SVG version of the illustrations, items, pictures, and printed text.
- Completely REMOVE all student pen/pencil marks, red lines, checkmarks, scribbles, underline marks, stains, and background paper shadows!
- Make all text font size LARGE, BOLD, and crisp (font-size="36", font-weight="bold", fill="#000000").
- Render clean vector illustrations and sharp Devanagari/English text on a pure white background (<rect width="100%" height="100%" fill="#ffffff"/>).

IF THIS IS A GEOMETRY DIAGRAM / HANDWRITTEN SHAPE:
- Re-create exact crisp black vector lines (#000000), geometric shapes (triangles, angles, circles), right-angle boxes, vertex labels (M, O, N, A, B, C), and fill-in-the-blank lines on a pure white background (<rect width="100%" height="100%" fill="#ffffff"/>).

Return ONLY the valid SVG XML code block wrapped in \`\`\`xml ... \`\`\` or \`\`\`svg ... \`\`\` tags without extra conversational text.`;
  }

  const modelsToTry = [
    process.env.GEMINI_MODEL,
    'gemini-1.5-flash',
    'gemini-1.5-pro',
    'gemini-2.0-flash-exp',
  ].filter(Boolean);

  let svgText = '';

  for (const apiKey of apiKeys) {
    const genAI = new GoogleGenerativeAI(apiKey);
    for (const mName of modelsToTry) {
      try {
        const model = genAI.getGenerativeModel({ model: mName });
        const imagePart = fileToGenerativePart(imagePath, 'image/png');
        const result = await model.generateContent([prompt, imagePart]);
        svgText = result.response.text();
        if (svgText && svgText.includes('<svg')) break;
      } catch (e) {
        // try next model or key
      }
    }
    if (svgText && svgText.includes('<svg')) break;
  }

  if (!svgText || !svgText.includes('<svg')) {
    throw new Error('Failed to generate SVG from diagram image.');
  }

  // Extract SVG snippet
  const svgMatch = svgText.match(/<svg[\s\S]*?<\/svg>/i);
  if (!svgMatch) {
    throw new Error('No valid <svg> element found in AI response');
  }

  const cleanSvg = svgMatch[0];
  const tempSvgPath = outputPath.replace(/\.[^.]+$/, '.svg');
  fs.writeFileSync(tempSvgPath, cleanSvg, 'utf-8');

  // Convert SVG to high-resolution PNG via Python fitz & Auto-crop top/bottom white margins via PIL ImageChops
  const pythonBin = process.platform === 'win32' ? 'python' : 'python3';
  const pyCmd = `${pythonBin} -c "import fitz, sys; from PIL import Image, ImageChops; doc = fitz.open('${tempSvgPath.replace(/\\/g, '/')}'); page = doc[0]; pix = page.get_pixmap(dpi=300); pix.save('${outputPath.replace(/\\/g, '/')}'); img = Image.open('${outputPath.replace(/\\/g, '/')}').convert('RGB'); bg = Image.new('RGB', img.size, (255, 255, 255)); diff = ImageChops.difference(img, bg); bbox = diff.getbbox(); (bbox and img.crop((max(0, bbox[0]-10), max(0, bbox[1]-10), min(img.width, bbox[2]+10), min(img.height, bbox[3]+10))).save('${outputPath.replace(/\\/g, '/')}'))"`;
  execSync(pyCmd);

  console.log(`Successfully generated cropped diagram PNG (${mode} mode) at: ${outputPath}`);
  return outputPath;
}

module.exports = { generateGeometricDiagramFromImage };
