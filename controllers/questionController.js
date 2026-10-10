const QuestionPaper = require('../models/QuestionPaper');
const Class = require('../models/Class');
const { parseHandwrittenPaper } = require('../utils/geminiParser');
const { generateQuestionDocx } = require('../utils/wordGenerator');
const { uploadToCloud, deleteFromCloud } = require('../utils/cloudStorage');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');

const hasSameId = (left, right) => String(left?._id || left || '') === String(right?._id || right || '');

const os = require('os');

const getUploadDir = (subDir = '') => {
  const base = process.env.VERCEL
    ? path.join(os.tmpdir(), 'ypss_uploads')
    : path.join(__dirname, '../uploads');
  const target = subDir ? path.join(base, subDir) : base;
  try {
    fs.mkdirSync(target, { recursive: true });
  } catch (_) {}
  return target;
};

const setupUploadDirs = () => {
  getUploadDir();
  getUploadDir('docs');
  getUploadDir('figures');
};

const canCreateForSubject = (user, classItem, subject) => {
  if (user.role === 'principal') return true;
  if (user.role !== 'teacher') return false;
  return classItem.subjects.some(
    (item) => item.name.toLowerCase() === subject.toLowerCase() && hasSameId(item.teacher, user._id)
  );
};

const canAccessPaper = (user, paper) => user.role === 'principal' || (user.role === 'teacher' && hasSameId(paper.author, user._id));

const { generateGeometricDiagramFromImage } = require('../utils/diagramGenerator');

const uploadAndParseQuestion = async (req, res) => {
  const photoFiles = req.files?.['photo'] || (req.file ? [req.file] : []);
  if (!photoFiles.length) {
    return res.status(400).json({ success: false, message: 'Choose at least one handwritten question-paper photo' });
  }

  const paperImagePaths = photoFiles.map((f) => f.path);
  const primaryScanPath = paperImagePaths[0];

  const classId = req.body.classId;
  const subject = req.body.subject?.trim();
  const examTerm = Number(req.body.examTerm);
  const language = (req.body.mode || req.body.language || 'english').toLowerCase().trim();
  const time = req.body.time?.trim() || '3';
  const fullMarks = Number(req.body.fullMarks) || 100;
  const passMarks = Number(req.body.passMarks) || 40;
  const year = req.body.year?.trim() || '2081 B.S.';

  if (!classId || !subject || ![1, 2, 3, 4].includes(examTerm)) {
    photoFiles.forEach((f) => f.path && fs.unlink(f.path, () => {}));
    return res.status(400).json({ success: false, message: 'Class, subject, and a valid terminal are required' });
  }

  try {
    setupUploadDirs();
    const classItem = await Class.findById(classId);
    if (!classItem) {
      photoFiles.forEach((f) => f.path && fs.unlink(f.path, () => {}));
      return res.status(404).json({ success: false, message: 'Class not found' });
    }
    if (!canCreateForSubject(req.user, classItem, subject)) {
      photoFiles.forEach((f) => f.path && fs.unlink(f.path, () => {}));
      return res.status(403).json({ success: false, message: 'You are not assigned to create a paper for this class and subject' });
    }

    // Process attached question figures if any
    let figureItems = [];
    if (req.files?.['figures']?.length) {
      let metaList = [];
      try {
        metaList = typeof req.body.figureMeta === 'string' ? JSON.parse(req.body.figureMeta) : (req.body.figureMeta || []);
      } catch (e) {
        metaList = [];
      }
      req.files['figures'].forEach((file, idx) => {
        const qNum = metaList[idx]?.questionNumber || req.body[`figure_qNum_${idx}`] || '9';
        const figMode = metaList[idx]?.mode || req.body[`figure_mode_${idx}`] || 'auto';
        figureItems.push({
          questionNumber: String(qNum).trim(),
          mode: figMode,
          originalImagePath: file.path,
        });
      });
    }

    const autoTitle = `${classItem.name} ${subject} - Terminal ${examTerm}`;

    const paper = await QuestionPaper.create({
      title: autoTitle,
      class: classItem._id,
      subject,
      examTerm,
      year,
      language: ['english', 'nepali'].includes(language) ? language : 'english',
      time,
      fullMarks,
      passMarks,
      author: req.user._id,
      handwrittenImage: primaryScanPath,
      handwrittenImages: paperImagePaths,
      figures: figureItems,
      status: 'processing',
    });
    if (process.env.VERCEL) {
      await processPaperInBackground(paper._id, classItem.name);
      const freshPaper = await QuestionPaper.findById(paper._id);
      return res.status(201).json({ success: true, message: 'Question paper generated successfully', data: freshPaper || paper });
    } else {
      processPaperInBackground(paper._id, classItem.name);
      return res.status(201).json({ success: true, message: 'Question paper queued for formatting', data: paper });
    }
  } catch (error) {
    photoFiles.forEach((f) => f.path && fs.unlink(f.path, () => {}));
    return res.status(500).json({ success: false, message: error.message });
  }
};

const processPaperInBackground = async (paperId, className) => {
  try {
    const paper = await QuestionPaper.findById(paperId);
    if (!paper) return;
    setupUploadDirs();

    console.log(`[AI Pipeline] Starting background processing for Paper ID: ${paper._id}`);

    // Pre-upload scans to Cloudinary to ensure they are preserved for retries even after local cleanup
    if (!paper.handwrittenImageUrl && paper.handwrittenImage && fs.existsSync(paper.handwrittenImage)) {
      try {
        const cloudUrl = await uploadToCloud(paper.handwrittenImage, 'ypss_question_papers/scans');
        if (cloudUrl) {
          paper.handwrittenImageUrl = cloudUrl;
          await paper.save();
        }
      } catch (uploadErr) {
        console.warn('[CloudStorage] Failed pre-upload scan to cloud:', uploadErr.message);
      }
    }

    // Resolve scan inputs: prioritize local existing file, fallback to Cloudinary URL
    const rawScans = paper.handwrittenImages?.length ? paper.handwrittenImages : [paper.handwrittenImage];
    const scanInput = rawScans.map((p, idx) => {
      if (p && fs.existsSync(p)) return p;
      if (paper.handwrittenImageUrls && paper.handwrittenImageUrls[idx]) return paper.handwrittenImageUrls[idx];
      if (paper.handwrittenImageUrl) return paper.handwrittenImageUrl;
      return p;
    });

    // Wait for BOTH AI text OCR transcription and AI geometrical figure generation concurrently
    const [parsedContent] = await Promise.all([
      parseHandwrittenPaper(
        scanInput,
        paper.subject,
        className,
        `Terminal ${paper.examTerm}`
      ),
      (async () => {
        if (Array.isArray(paper.figures) && paper.figures.length > 0) {
          console.log(`[AI Pipeline] Processing ${paper.figures.length} attached figure(s)...`);
          for (let i = 0; i < paper.figures.length; i++) {
            const fig = paper.figures[i];
            const figSrc = (fig.originalImagePath && fs.existsSync(fig.originalImagePath))
              ? fig.originalImagePath
              : (fig.originalImageUrl || fig.originalImagePath);

            if (figSrc) {
              try {
                const figureDir = getUploadDir('figures');
                const genPath = path.join(figureDir, `fig_${paper._id}_${fig.questionNumber}_${Date.now()}.png`);
                console.log(`[AI Pipeline] Requesting AI diagram (${fig.mode || 'auto'} mode) for Q.${fig.questionNumber}...`);
                await generateGeometricDiagramFromImage(figSrc, genPath, fig.mode || 'auto');
                paper.figures[i].generatedImagePath = genPath;
                console.log(`[AI Pipeline] AI diagram created at: ${genPath}`);
              } catch (err) {
                console.warn(`[AI Pipeline] Figure diagram generation fallback for Q.${fig.questionNumber}:`, err.message);
                paper.figures[i].generatedImagePath = figSrc;
              }
            }
          }
          paper.markModified('figures');
          await paper.save();
        }
      })(),
    ]);

    console.log('[AI Pipeline] Both AI text and AI image generation complete!');

    // Apply template mode, time, fullMarks and passMarks to parsedContent
    if (paper.language === 'nepali') {
      parsedContent.template = 'npqp';
      parsedContent.useNepaliTemplate = true;
    } else {
      parsedContent.template = 'enqp';
    }

    if (paper.time) {
      parsedContent.time = String(paper.time);
      parsedContent['exam time'] = String(paper.time).replace(/\s*hrs?/gi, '');
    }
    if (paper.fullMarks) {
      parsedContent.fullMarks = Number(paper.fullMarks);
      parsedContent['Full marks'] = Number(paper.fullMarks);
    }
    if (paper.passMarks) {
      parsedContent.passMarks = Number(paper.passMarks);
      parsedContent['pass'] = Number(paper.passMarks);
    }
    if (paper.year) {
      parsedContent.year = String(paper.year);
    }

    paper.parsedContent = parsedContent;

    // Convert paper.figures to plain object array to ensure no Mongoose getter issues
    const plainPaperObj = paper.toObject();
    const plainFigures = plainPaperObj.figures || [];

    const baseName = `YPSS_${paper.subject.replace(/\s+/g, '_')}_Terminal_${paper.examTerm}_${Date.now()}`;
    const docxFileName = `${baseName}.docx`;
    const docxPath = path.join(getUploadDir('docs'), docxFileName);

    console.log('[DocxGenerator] Compiling MS Word .docx document with figures...');
    await generateQuestionDocx(parsedContent, docxPath, plainFigures);

    // Upload files online to Cloudinary if configured
    const [docxUrl, imageUrl] = await Promise.all([
      uploadToCloud(docxPath, 'ypss_question_papers/docs'),
      uploadToCloud(paper.handwrittenImage, 'ypss_question_papers/scans'),
    ]);

    // Upload extra handwritten scan pages if any
    const handwrittenImageUrls = [];
    if (Array.isArray(paper.handwrittenImages) && paper.handwrittenImages.length > 0) {
      for (const scanPath of paper.handwrittenImages) {
        if (scanPath && fs.existsSync(scanPath)) {
          const scanUrl = await uploadToCloud(scanPath, 'ypss_question_papers/scans');
          if (scanUrl) handwrittenImageUrls.push(scanUrl);
        }
      }
    }

    // Upload figure photos (original input fed to AI, and generated diagram response from AI)
    if (Array.isArray(paper.figures) && paper.figures.length > 0) {
      for (let i = 0; i < paper.figures.length; i++) {
        const fig = paper.figures[i];
        if (fig.originalImagePath && fs.existsSync(fig.originalImagePath)) {
          const origUrl = await uploadToCloud(fig.originalImagePath, 'ypss_question_papers/figures');
          if (origUrl) paper.figures[i].originalImageUrl = origUrl;
        }
        if (fig.generatedImagePath && fs.existsSync(fig.generatedImagePath) && fig.generatedImagePath !== fig.originalImagePath) {
          const genUrl = await uploadToCloud(fig.generatedImagePath, 'ypss_question_papers/figures');
          if (genUrl) paper.figures[i].generatedImageUrl = genUrl;
        } else if (paper.figures[i].originalImageUrl) {
          paper.figures[i].generatedImageUrl = paper.figures[i].originalImageUrl;
        }
      }
      paper.markModified('figures');
    }

    paper.docxPath = `/uploads/docs/${docxFileName}`;
    if (docxUrl) paper.docxUrl = docxUrl;
    if (imageUrl) paper.handwrittenImageUrl = imageUrl;
    if (handwrittenImageUrls.length) paper.handwrittenImageUrls = handwrittenImageUrls;
    paper.status = 'completed';
    await paper.save();

    // Delete all local photo files, pdf, and docx files after saving to Cloudinary
    const localFilesToDelete = new Set();
    if (paper.handwrittenImage) localFilesToDelete.add(paper.handwrittenImage);
    if (Array.isArray(paper.handwrittenImages)) {
      paper.handwrittenImages.forEach((img) => img && localFilesToDelete.add(img));
    }
    if (Array.isArray(paper.figures)) {
      paper.figures.forEach((fig) => {
        if (fig.originalImagePath) {
          localFilesToDelete.add(fig.originalImagePath);
          localFilesToDelete.add(fig.originalImagePath.replace(/\.[^.]+$/, '.svg'));
        }
        if (fig.generatedImagePath) {
          localFilesToDelete.add(fig.generatedImagePath);
          localFilesToDelete.add(fig.generatedImagePath.replace(/\.[^.]+$/, '.svg'));
        }
      });
    }
    if (docxUrl && docxPath) localFilesToDelete.add(docxPath);

    localFilesToDelete.forEach((filePath) => {
      if (filePath && fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
          console.log(`[Local Cleanup] Deleted local file after cloud upload: ${filePath}`);
        } catch (e) {
          console.warn(`[Local Cleanup] Failed to delete ${filePath}:`, e.message);
        }
      }
    });
  } catch (error) {
    console.error(`[AI Pipeline Error] Question paper processing failed for ${paperId}:`, error);
    await QuestionPaper.findByIdAndUpdate(paperId, {
      status: 'failed',
      failureReason: error.message || String(error) || 'Generation failed',
    });
  }
};

const getQuestionPaperDetails = async (req, res) => {
  try {
    const paper = await QuestionPaper.findById(req.params.id)
      .populate('class')
      .populate({ path: 'author', select: 'name role' });
    if (!paper) {
      return res.status(404).json({ success: false, message: 'Question paper not found' });
    }
    if (!canAccessPaper(req.user, paper)) {
      return res.status(403).json({ success: false, message: 'You are not authorized to view this paper' });
    }
    return res.json({ success: true, data: paper });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const getQuestionPapers = async (req, res) => {
  try {
    const query = req.user.role === 'teacher' ? { author: req.user._id } : {};
    if (req.query.year) {
      query.year = req.query.year;
    }
    const papers = await QuestionPaper.find(query)
      .populate('class')
      .populate({ path: 'author', select: 'name' })
      .sort({ createdAt: -1 });
    return res.json({ success: true, data: papers });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const streamRemoteFile = (targetUrl, res, fileName, mimeType) => {
  const client = targetUrl.startsWith('https') ? https : http;
  client.get(targetUrl, (cloudRes) => {
    if (cloudRes.statusCode >= 300 && cloudRes.statusCode < 400 && cloudRes.headers.location) {
      return streamRemoteFile(cloudRes.headers.location, res, fileName, mimeType);
    }
    if (cloudRes.statusCode !== 200) {
      console.warn(`[CloudStorage Stream] Cloud returned HTTP ${cloudRes.statusCode} for ${targetUrl}`);
      return res.status(cloudRes.statusCode || 500).json({ success: false, message: 'Could not fetch file from cloud storage' });
    }
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
    if (cloudRes.headers['content-length']) {
      res.setHeader('Content-Length', cloudRes.headers['content-length']);
    }
    cloudRes.pipe(res);
  }).on('error', (err) => {
    console.error('[CloudStorage Stream] Error streaming file:', err.message);
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: 'Cloud stream failed' });
    }
  });
};

const downloadQuestionPaper = async (req, res) => {
  const format = req.params.format?.toLowerCase();
  if (format === 'pdf') {
    return res.status(400).json({ success: false, message: 'PDF format for question papers has been removed. Please use MS Word (.docx).' });
  }
  if (format !== 'docx') {
    return res.status(400).json({ success: false, message: 'Choose docx format' });
  }

  try {
    const paper = await QuestionPaper.findById(req.params.id);
    if (!paper) {
      return res.status(404).json({ success: false, message: 'Question paper not found' });
    }
    if (!canAccessPaper(req.user, paper)) {
      return res.status(403).json({ success: false, message: 'You are not authorized to download this paper' });
    }

    let cloudUrl = format === 'pdf' ? paper.pdfUrl : paper.docxUrl;
    const safeSubject = (paper.subject || 'paper').replace(/[^a-z0-9]+/gi, '_');
    const fileName = `YPSS_${safeSubject}_Terminal_${paper.examTerm}.${format}`;
    const mimeType = format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

    if (cloudUrl) {
      // Clean up legacy authenticated path if present
      const cleanCloudUrl = cloudUrl.replace(/\/raw\/authenticated\//i, '/raw/upload/');
      return streamRemoteFile(cleanCloudUrl, res, fileName, mimeType);
    }

    const storedPath = format === 'pdf' ? paper.pdfPath : paper.docxPath;
    let filePath = null;
    if (storedPath) {
      const fileName = path.basename(storedPath);
      const candidates = [
        path.join(getUploadDir('docs'), fileName),
        path.join(getUploadDir(), fileName),
        path.resolve(__dirname, '..', storedPath.replace(/^\//, '')),
      ];
      filePath = candidates.find((p) => fs.existsSync(p));
    }

    if (filePath && fs.existsSync(filePath)) {
      return res.download(filePath, fileName);
    } else {
      return res.status(404).json({ success: false, message: 'Generated file not found' });
    }
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const deleteQuestionPaper = async (req, res) => {
  try {
    const paper = await QuestionPaper.findById(req.params.id);
    if (!paper) {
      return res.status(404).json({ success: false, message: 'Question paper not found' });
    }
    if (!canAccessPaper(req.user, paper)) {
      return res.status(403).json({ success: false, message: 'You are not authorized to delete this paper' });
    }

    // Clean up local files if present
    const filesToDelete = new Set();
    if (paper.handwrittenImage) filesToDelete.add(paper.handwrittenImage);
    if (Array.isArray(paper.handwrittenImages)) {
      paper.handwrittenImages.forEach((img) => img && filesToDelete.add(img));
    }
    if (Array.isArray(paper.figures)) {
      paper.figures.forEach((fig) => {
        if (fig.originalImagePath) {
          filesToDelete.add(fig.originalImagePath);
          filesToDelete.add(fig.originalImagePath.replace(/\.[^.]+$/, '.svg'));
        }
        if (fig.generatedImagePath) {
          filesToDelete.add(fig.generatedImagePath);
          filesToDelete.add(fig.generatedImagePath.replace(/\.[^.]+$/, '.svg'));
        }
      });
    }
    if (paper.docxPath) filesToDelete.add(path.join(__dirname, '..', paper.docxPath.replace(/^\//, '')));
    if (paper.pdfPath) filesToDelete.add(path.join(__dirname, '..', paper.pdfPath.replace(/^\//, '')));

    filesToDelete.forEach((filePath) => {
      if (filePath && fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
        } catch (e) {
          console.warn('Could not delete local file:', filePath, e.message);
        }
      }
    });

    // Clean up Cloudinary cloud storage files if present (PDF, Word, scans, and figures)
    const cloudUrlsToDelete = new Set();
    if (paper.pdfUrl) cloudUrlsToDelete.add(paper.pdfUrl);
    if (paper.docxUrl) cloudUrlsToDelete.add(paper.docxUrl);
    if (paper.handwrittenImageUrl) cloudUrlsToDelete.add(paper.handwrittenImageUrl);
    if (Array.isArray(paper.handwrittenImageUrls)) {
      paper.handwrittenImageUrls.forEach((url) => url && cloudUrlsToDelete.add(url));
    }
    if (Array.isArray(paper.figures)) {
      paper.figures.forEach((fig) => {
        if (fig.originalImageUrl) cloudUrlsToDelete.add(fig.originalImageUrl);
        if (fig.generatedImageUrl) cloudUrlsToDelete.add(fig.generatedImageUrl);
      });
    }

    for (const url of cloudUrlsToDelete) {
      if (url) {
        await deleteFromCloud(url);
      }
    }

    await QuestionPaper.findByIdAndDelete(req.params.id);
    return res.json({ success: true, message: 'Question paper deleted successfully' });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const getQuestionPaperTracker = async (req, res) => {
  try {
    const examTerm = Number(req.query.examTerm) || 1;
    const year = req.query.year;
    const classes = await Class.find()
      .populate('subjects.teacher', 'name username role')
      .sort({ name: 1 });

    const paperQuery = { examTerm };
    if (year) {
      paperQuery.year = year;
    }

    const papers = await QuestionPaper.find(paperQuery)
      .populate('class')
      .populate('author', 'name role');

    const trackerItems = [];

    (classes || []).forEach((classItem) => {
      if (!classItem) return;
      (classItem.subjects || []).forEach((subject) => {
        if (!subject || !subject.name) return;
        const assignedTeacher = subject.teacher;
        const isTeacherRole = req.user.role === 'teacher';

        // Filter for teacher role: only include subjects assigned to this teacher
        if (isTeacherRole) {
          const isAssigned = hasSameId(assignedTeacher, req.user._id);
          if (!isAssigned) return;
        }

        const existingPaper = papers.find(
          (p) =>
            p &&
            hasSameId(p.class, classItem._id) &&
            (p.subject || '').toLowerCase() === (subject.name || '').toLowerCase()
        );

        let status = 'pending'; // Left to generate
        if (existingPaper) {
          status = existingPaper.status || 'pending'; // 'completed', 'processing', 'failed'
        }

        trackerItems.push({
          classId: classItem._id,
          className: classItem.name,
          subject: subject.name,
          teacherName: assignedTeacher?.name || 'Unassigned',
          teacherId: assignedTeacher?._id || null,
          status: status, // 'completed', 'processing', 'failed', 'pending'
          paper: existingPaper || null,
        });
      });
    });

    const generatedCount = trackerItems.filter((i) => i.status === 'completed' || i.status === 'processing').length;
    const pendingCount = trackerItems.filter((i) => i.status === 'pending' || i.status === 'failed').length;

    return res.json({
      success: true,
      data: {
        examTerm,
        summary: {
          totalRequired: trackerItems.length,
          generatedCount,
          pendingCount,
        },
        items: trackerItems,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const retryQuestionPaper = async (req, res) => {
  try {
    const paper = await QuestionPaper.findById(req.params.id).populate('class');
    if (!paper) {
      return res.status(404).json({ success: false, message: 'Question paper not found' });
    }
    if (!canAccessPaper(req.user, paper)) {
      return res.status(403).json({ success: false, message: 'You are not authorized to retry this paper' });
    }

    paper.status = 'processing';
    await paper.save();

    if (process.env.VERCEL) {
      await processPaperInBackground(paper._id, paper.class?.name);
      const freshPaper = await QuestionPaper.findById(paper._id);
      return res.json({ success: true, message: 'Paper generation completed', data: freshPaper || paper });
    } else {
      processPaperInBackground(paper._id, paper.class?.name);
      return res.json({ success: true, message: 'Retrying paper generation...', data: paper });
    }
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  uploadAndParseQuestion,
  getQuestionPaperDetails,
  getQuestionPapers,
  downloadQuestionPaper,
  deleteQuestionPaper,
  getQuestionPaperTracker,
  retryQuestionPaper,
};
