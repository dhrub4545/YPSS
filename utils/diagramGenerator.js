require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const { getGeminiApiKeys, markKeyExhausted } = require('./geminiParser');
const cloudinary = require('cloudinary').v2;

if (process.env.CLOUDINARY_CLOUD_NAME) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
}

async function rasterizeSvgToPng(svgString, tempSvgPath, outputPath) {
  fs.writeFileSync(tempSvgPath, svgString, 'utf-8');
  let cloudUrl = null;

  // 1. Attempt local Python fitz & PIL ImageChops (if Python & PyMuPDF fitz are installed)
  try {
    const pythonBin = process.platform === 'win32' ? 'python' : 'python3';
    const pyCmd = `${pythonBin} -c "import fitz, sys; from PIL import Image, ImageChops; doc = fitz.open('${tempSvgPath.replace(/\\/g, '/')}'); page = doc[0]; pix = page.get_pixmap(dpi=300); pix.save('${outputPath.replace(/\\/g, '/')}'); img = Image.open('${outputPath.replace(/\\/g, '/')}').convert('RGB'); bg = Image.new('RGB', img.size, (255, 255, 255)); diff = ImageChops.difference(img, bg); bbox = diff.getbbox(); (bbox and img.crop((max(0, bbox[0]-10), max(0, bbox[1]-10), min(img.width, bbox[2]+10), min(img.height, bbox[3]+10))).save('${outputPath.replace(/\\/g, '/')}'))"`;
    execSync(pyCmd, { stdio: 'pipe' });

    if (fs.existsSync(outputPath)) {
      const checkBuf = fs.readFileSync(outputPath);
      if (checkBuf.length > 8 && checkBuf[0] === 0x89 && checkBuf[1] === 0x50 && checkBuf[2] === 0x4E && checkBuf[3] === 0x47) {
        console.log(`[DiagramGenerator] Successfully rendered high-res PNG via local Python fitz (${checkBuf.length} bytes) at: ${outputPath}`);
        return { outputPath, imageUrl: null };
      }
    }
  } catch (pyErr) {
    console.log(`[DiagramGenerator] Python rendering unavailable in environment (${pyErr.message}). Using Cloudinary high-fidelity SVG rasterization...`);
  }

  // 2. Cloudinary High-Fidelity SVG Rasterization (Standard for Vercel Serverless & cloud runtimes)
  if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY) {
    try {
      const base64Data = 'data:image/svg+xml;base64,' + Buffer.from(svgString, 'utf-8').toString('base64');
      const uploadRes = await cloudinary.uploader.upload(base64Data, {
        folder: 'ypss_question_papers/figures',
        format: 'png',
        resource_type: 'image',
        transformation: [
          { effect: 'trim' }
        ]
      });

      if (uploadRes && uploadRes.secure_url) {
        cloudUrl = uploadRes.secure_url;
        console.log(`[DiagramGenerator] Cloudinary rasterized PNG URL: ${cloudUrl}`);
        const pngRes = await fetch(uploadRes.secure_url);
        if (pngRes.ok) {
          const pngBuf = Buffer.from(await pngRes.arrayBuffer());
          if (pngBuf[0] === 0x89 && pngBuf[1] === 0x50 && pngBuf[2] === 0x4E && pngBuf[3] === 0x47) {
            fs.writeFileSync(outputPath, pngBuf);
            console.log(`[DiagramGenerator] Successfully saved binary PNG from Cloudinary (${pngBuf.length} bytes) to: ${outputPath}`);
            return { outputPath, imageUrl: cloudUrl };
          }
        }
      }
    } catch (cloudErr) {
      console.warn(`[DiagramGenerator] Cloudinary SVG rasterization with trim failed (${cloudErr.message}). Retrying standard upload...`);
      try {
        const base64Data = 'data:image/svg+xml;base64,' + Buffer.from(svgString, 'utf-8').toString('base64');
        const uploadRes = await cloudinary.uploader.upload(base64Data, {
          folder: 'ypss_question_papers/figures',
          format: 'png',
          resource_type: 'image',
        });
        if (uploadRes && uploadRes.secure_url) {
          cloudUrl = uploadRes.secure_url;
          const pngRes = await fetch(uploadRes.secure_url);
          if (pngRes.ok) {
            const pngBuf = Buffer.from(await pngRes.arrayBuffer());
            fs.writeFileSync(outputPath, pngBuf);
            return { outputPath, imageUrl: cloudUrl };
          }
        }
      } catch (retryErr) {
        console.warn('[DiagramGenerator] Cloudinary fallback upload also failed:', retryErr.message);
      }
    }
  }

  return { outputPath, imageUrl: cloudUrl };
}

const fileToGenerativePart = async (filePathOrUrl, mimeType) => {
  if (typeof filePathOrUrl === 'string' && (filePathOrUrl.startsWith('http://') || filePathOrUrl.startsWith('https://'))) {
    const res = await fetch(filePathOrUrl);
    if (!res.ok) throw new Error(`Failed to download diagram image from ${filePathOrUrl}`);
    const arrayBuf = await res.arrayBuffer();
    const contentType = res.headers.get('content-type') || '';
    const resolvedMime = mimeType || (contentType.includes('png') ? 'image/png' : contentType.includes('webp') ? 'image/webp' : 'image/jpeg');
    return {
      inlineData: {
        data: Buffer.from(arrayBuf).toString('base64'),
        mimeType: resolvedMime,
      },
    };
  }

  let finalPath = filePathOrUrl;
  if (!fs.existsSync(finalPath)) {
    const os = require('os');
    const base = path.basename(finalPath);
    const candidateUploads = [
      path.join(os.tmpdir(), 'ypss_uploads/figures', base),
      path.join(os.tmpdir(), 'ypss_uploads', base),
      path.join(__dirname, '../uploads/figures', base),
      path.join(__dirname, '../uploads', base),
    ];
    const found = candidateUploads.find((p) => fs.existsSync(p));
    if (found) finalPath = found;
  }

  const ext = path.extname(finalPath).toLowerCase();
  const resolvedMime = mimeType || (ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg');

  return {
    inlineData: {
      data: Buffer.from(fs.readFileSync(finalPath)).toString('base64'),
      mimeType: resolvedMime,
    },
  };
};

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
    'gemini-3.5-flash-lite',
    'gemini-flash-lite-latest',
    'gemini-3.8-flash',
    'gemini-3.7-flash',
    'gemini-3.1-flash-lite',
    'gemini-3.5-flash',
  ];

  let svgText = '';

  for (const mName of modelsToTry) {
    for (let i = 0; i < apiKeys.length; i++) {
      const apiKey = apiKeys[i];
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          const genAI = new GoogleGenerativeAI(apiKey);
          const model = genAI.getGenerativeModel({
            model: mName,
            generationConfig: { maxOutputTokens: 8192 },
          });
          const imagePart = await fileToGenerativePart(imagePath);
          const callPromise = model.generateContent([prompt, imagePart]);
          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error(`Timeout after 25s for model ${mName}`)), 25000)
          );
          const result = await Promise.race([callPromise, timeoutPromise]);
          svgText = result.response.text();
          if (svgText && svgText.includes('<svg')) {
            console.log(`Successfully generated diagram SVG using model ${mName} and Gemini API key #${i + 1}`);
            break;
          }
        } catch (e) {
          if (e.message && (e.message.includes('429') || e.message.includes('Quota exceeded') || e.message.includes('RESOURCE_EXHAUSTED'))) {
            markKeyExhausted(apiKey);
          }
          console.warn(`[DiagramGenerator] Model ${mName} Key #${i + 1} (attempt ${attempt}) error: ${e.message}`);
          if (attempt < 2) {
            await new Promise((r) => setTimeout(r, 1000));
          }
        }
      }
      if (svgText && svgText.includes('<svg')) break;
    }
    if (svgText && svgText.includes('<svg')) break;
  }

  if (!svgText || !svgText.includes('<svg')) {
    throw new Error('Failed to generate SVG from diagram image.');
  }

  // Extract SVG snippet
  let cleanSvg = '';
  const svgMatch = svgText.match(/<svg[\s\S]*?<\/svg>/i);
  if (svgMatch) {
    cleanSvg = svgMatch[0];
  } else {
    const openIdx = svgText.indexOf('<svg');
    if (openIdx !== -1) {
      cleanSvg = svgText.slice(openIdx).replace(/```.*/gs, '').trim();
      if (!cleanSvg.includes('</svg>')) cleanSvg += '\n</svg>';
    }
  }

  if (!cleanSvg || !cleanSvg.includes('<svg')) {
    throw new Error('No valid <svg> element found in AI response');
  }

  const tempSvgPath = outputPath.replace(/\.[^.]+$/, '.svg');
  const rasterResult = await rasterizeSvgToPng(cleanSvg, tempSvgPath, outputPath);

  console.log(`Successfully generated diagram PNG (${mode} mode) at: ${outputPath}`);
  return {
    outputPath: rasterResult.outputPath || outputPath,
    imageUrl: rasterResult.imageUrl || null,
    toString: () => rasterResult.outputPath || outputPath,
  };
}

module.exports = { generateGeometricDiagramFromImage };
