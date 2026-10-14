require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const path = require('path');

const fileToGenerativePart = async (filePathOrUrl, mimeType) => {
  if (typeof filePathOrUrl === 'string' && (filePathOrUrl.startsWith('http://') || filePathOrUrl.startsWith('https://'))) {
    const res = await fetch(filePathOrUrl);
    if (!res.ok) throw new Error(`Failed to download image from ${filePathOrUrl} (status ${res.status})`);
    const arrayBuf = await res.arrayBuffer();
    const resolvedMime = mimeType || res.headers.get('content-type') || 'image/jpeg';
    return {
      inlineData: {
        data: Buffer.from(arrayBuf).toString('base64'),
        mimeType: resolvedMime.includes('png') ? 'image/png' : 'image/jpeg',
      },
    };
  }

  let finalPath = filePathOrUrl;
  if (!fs.existsSync(finalPath)) {
    // Check if file exists in local uploads directory by base name
    const os = require('os');
    const base = path.basename(finalPath);
    const candidateUploads = [
      path.join(os.tmpdir(), 'ypss_uploads', base),
      path.join(os.tmpdir(), 'ypss_uploads/figures', base),
      path.join(os.tmpdir(), 'ypss_uploads/docs', base),
      path.join(__dirname, '../uploads', base),
      path.join(__dirname, '../uploads/figures', base),
      path.join(__dirname, '../uploads/docs', base),
    ];
    const found = candidateUploads.find((p) => fs.existsSync(p));
    if (found) {
      finalPath = found;
    } else {
      throw new Error(`Image file not found: ${base}. Please upload the photo again.`);
    }
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

const NepaliDate = require('nepali-date-converter').default || require('nepali-date-converter');

const formatTermName = (examName) => {
  const match = String(examName).match(/\d+/);
  if (!match) return examName || '1st';
  const num = parseInt(match[0], 10);
  if (num === 1) return '1st';
  if (num === 2) return '2nd';
  if (num === 3) return '3rd';
  if (num === 4) return '4th';
  return `${num}th`;
};

const exhaustedKeys = new Map();

const isKeyExhausted = (key) => {
  const expiresAt = exhaustedKeys.get(key);
  if (!expiresAt) return false;
  if (Date.now() > expiresAt) {
    exhaustedKeys.delete(key);
    return false;
  }
  return true;
};

const markKeyExhausted = (key, durationMs = 14400000) => {
  exhaustedKeys.set(key, Date.now() + durationMs);
};

const getGeminiApiKeys = () => {
  const keys = [];
  ['GEMINI_API_KEY_1', 'GEMINI_API_KEY_2', 'GEMINI_API_KEY_3', 'GEMINI_API_KEY'].forEach((keyName) => {
    const val = process.env[keyName]?.trim();
    if (val && !keys.includes(val)) {
      keys.push(val);
    }
  });
  if (process.env.GEMINI_API_KEYS) {
    process.env.GEMINI_API_KEYS.split(',').forEach((k) => {
      const trimmed = k.trim();
      if (trimmed && !keys.includes(trimmed)) keys.push(trimmed);
    });
  }
  // Sort so available working keys are prioritized first over exhausted keys
  return keys.sort((a, b) => (isKeyExhausted(a) ? 1 : 0) - (isKeyExhausted(b) ? 1 : 0));
};

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

const parseHandwrittenPaper = async (imageInput, subject, className, examName) => {
  const apiKeys = getGeminiApiKeys();
  if (!apiKeys.length) {
    throw new Error('GEMINI_API_KEY is required to process handwritten question papers');
  }

  const imagePaths = Array.isArray(imageInput) ? imageInput.filter(Boolean) : [imageInput];
  if (!imagePaths.length) {
    throw new Error('No handwritten paper scan provided');
  }

  const imageParts = await Promise.all(
    imagePaths.map((p) => {
      const ext = path.extname(p).toLowerCase();
      const mimeType = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
      return fileToGenerativePart(p, mimeType);
    })
  );

  const termOrd = formatTermName(examName);
  const nepaliYear = `${new NepaliDate().getYear()} B.S.`;

  const prompt = `You are an expert school examination question-paper OCR scanner for Yashoda Prem Shishu Sadan (YPSS) school.
Transcribe all handwritten question paper pages provided (${imagePaths.length} page(s) attached) accurately into clean, structured JSON format for MS Word output.

CRITICAL OCR TRANSCRIBING RULES:
1. Preserve exact math expressions, numbers, arithmetic equations, vertical digit alignment, and operators (+, -, x, ÷).
2. FOR VERTICAL ARITHMETIC / MATH COLUMN OPERATIONS (e.g. Addition, Subtraction, Multiplication in Q.7, Q.8, Q.9):
   - Always put each subtag and its top number together on line 1, e.g. "(a) 76 \t (b) 58 \t (c) 525 \t (d) 531 \t (e) 213"
   - Put the operator and bottom number on line 2, e.g. "+ 19 \t + 27 \t + 463 \t + 168 \t + 925"
   - Separate horizontal sub-questions with \t (Tab) characters.
   - Do NOT put subtags (a), (b), (c) on their own separate line without their top numbers.
3. FOR TABLES AND DATA GRIDS (e.g. Q.10):
   - If the handwritten paper has a table, data grid, or boxed values with columns/rows, transcribe it using Markdown pipe table format:
     | Header1 | Header2 | Header3 |
     | Data1   | Data2   | Data3   |
4. Keep all questions across all pages in a single flat sequential array list in exact order.
5. For each question, provide:
   - "questionNumber": string question number (e.g. "1", "2", "3")
   - "text": complete transcribed text with preserved \\n linebreaks and \\t tabs.
   - "marks": number of marks ONLY if explicitly written in the photo (e.g. 2, 5). If marks are not written, set "marks": null.

Return ONLY valid JSON in this exact structure:
{
  "title": "YPSS SCHOOL",
  "subtitle": "${termOrd.toUpperCase()} TERMINAL EXAMINATION - ${nepaliYear}",
  "className": "${className}",
  "subject": "${subject}",
  "fullMarks": 100,
  "passMarks": 40,
  "time": "3",
  "questions": [
    { "questionNumber": "1", "text": "Transcribed question text with preserved \\n linebreaks...", "marks": null }
  ]
}

Do not include markdown code block backticks.
`;

  let result = null;
  let lastError = null;
  const modelsToTry = [
    'gemini-3.5-flash-lite',
    'gemini-flash-lite-latest',
    'gemini-3.8-flash',
    'gemini-3.7-flash',
    'gemini-3.1-flash-lite',
    'gemini-3.5-flash',
  ];

  for (const mName of modelsToTry) {
    for (let i = 0; i < apiKeys.length; i++) {
      const apiKey = apiKeys[i];
      try {
        const client = new GoogleGenerativeAI(apiKey);
        const model = client.getGenerativeModel({
          model: mName,
          generationConfig: { maxOutputTokens: 8192 },
        });
        const callPromise = model.generateContent([prompt, ...imageParts]);
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`Timeout after 25s for model ${mName}`)), 25000)
        );
        result = await Promise.race([callPromise, timeoutPromise]);
        console.log(`Successfully generated content using model ${mName} and Gemini API key #${i + 1}`);
        break;
      } catch (error) {
        if (error.message && (error.message.includes('429') || error.message.includes('Quota exceeded') || error.message.includes('RESOURCE_EXHAUSTED'))) {
          markKeyExhausted(apiKey);
        }
        console.warn(`Model ${mName} with Gemini API Key #${i + 1} failed (${error.message}). Trying next key/model...`);
        lastError = error;
      }
    }
    if (result) break;
  }

  if (!result) {
    throw new Error(`All Gemini models (${modelsToTry.join(', ')}) across ${apiKeys.length} API keys failed. Last error: ${lastError?.message}`);
  }

  const responseText = result.response.text().trim();
  let cleanJson = responseText;
  const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (jsonMatch) {
    cleanJson = jsonMatch[1].trim();
  } else {
    const firstBrace = responseText.indexOf('{');
    const lastBrace = responseText.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      cleanJson = responseText.substring(firstBrace, lastBrace + 1).trim();
    }
  }

  let parsed;
  try {
    parsed = JSON.parse(cleanJson);
  } catch (parseErr) {
    console.error('[GeminiParser] Failed to parse JSON response. Raw output:\n', responseText);
    throw new Error(`AI generated invalid response format: ${parseErr.message}`);
  }

  let rawQuestions = [];
  if (Array.isArray(parsed.questions) && parsed.questions.length) {
    rawQuestions = parsed.questions;
  } else if (Array.isArray(parsed.sections) && parsed.sections.length) {
    parsed.sections.forEach((sec) => {
      if (Array.isArray(sec.questions)) {
        rawQuestions.push(...sec.questions);
      }
    });
  } else if (Array.isArray(parsed) && parsed.length) {
    rawQuestions = parsed;
  }

  if (!rawQuestions.length) {
    throw new Error('Gemini could not detect readable questions in this photo. Please upload a clearer handwritten photo.');
  }

  let totalQuestions = 0;
  const validQuestions = rawQuestions
    .map((q, idx) => {
      let t = extractQuestionText(q)
        .replace(/\[\s*undefined\s*\]/gi, '')
        .replace(/\bundefined\b/gi, '')
        .trim();

      if (!t) return null;
      totalQuestions++;

      const marksNum = typeof q === 'object' && q ? Number(q.marks) : NaN;
      const hasValidMarks = !isNaN(marksNum) && marksNum > 0;

      return {
        questionNumber: extractQuestionNumber(q, idx),
        text: t,
        marks: hasValidMarks ? marksNum : null,
      };
    })
    .filter(Boolean);

  if (totalQuestions === 0 || !validQuestions.length) {
    throw new Error('Gemini could not detect readable questions in this photo. Please upload a clearer handwritten photo.');
  }

  const cleanTime = String(parsed.time || '3').replace(/\s*hrs?/gi, '').trim();

  return {
    title: 'YPSS SCHOOL',
    subtitle: `${termOrd.toUpperCase()} TERMINAL EXAMINATION - ${nepaliYear}`,
    className: className || parsed.className,
    subject: subject || parsed.subject,
    fullMarks: Number(parsed.fullMarks) || 100,
    passMarks: Number(parsed.passMarks) || 40,
    time: cleanTime,
    year: nepaliYear,
    termName: termOrd,

    // Template specific keys matching enqp_template.docx
    'term name': termOrd,
    'year': nepaliYear,
    'class name': className || parsed.className,
    'subject': subject || parsed.subject,
    'exam time': cleanTime,
    'Full marks': Number(parsed.fullMarks) || 100,
    'pass': Number(parsed.passMarks) || 40,
    sections: [{ sectionName: '', sectionInstruction: '', questions: validQuestions }],
  };
};

module.exports = {
  parseHandwrittenPaper,
  getGeminiApiKeys,
  isKeyExhausted,
  markKeyExhausted,
};
