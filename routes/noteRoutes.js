const express = require('express');
const multer = require('multer');
const router = express.Router();
const { v2: cloudinary } = require('cloudinary');
const mongoose = require('mongoose');
const noteSchema = require('../models/noteSchema');
const { requireAuth, validateObjectId, checkOwnership } = require('../middleware/auth');
const { asyncHandler, apiResponse } = require('../utils/helpers');

// Ensure we have a connection to the PDF DB and a compiled Note model
// This avoids 'Note is not a constructor' (was importing a schema previously)
const pdfDB = mongoose.createConnection(process.env.PDF_DB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});
const Note = pdfDB.model('Note', noteSchema);

// Multer configuration
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Get all notes
router.get('/', asyncHandler(async (req, res) => {
  const notes = await Note.find()
    .populate({ path: 'uploader', select: 'name username' })
    .sort({ uploadedAt: -1 });
  
  if (req.accepts('html')) {
    return res.render('read', { notes });
  }
  
  apiResponse(res, { data: notes });
}));

// Get notes by uploader
router.get('/user/:username', asyncHandler(async (req, res) => {
  const { username } = req.params;
  if (!username) {
    return apiResponse(res, { 
      success: false, 
      message: 'Username is required',
      status: 400 
    });
  }

  // If HTML requested, redirect to the canonical public profile route
  if (req.accepts('html')) {
    return res.redirect(`/user/${encodeURIComponent(username)}`);
  }

  const notes = await Note.find({
    $or: [
      { 'uploader.username': username },
      { uploaderName: username }
    ]
  }).sort({ uploadedAt: -1 });
  
  apiResponse(res, { data: notes });
}));

// Upload a new note (requires authentication)
router.post('/upload', 
  requireAuth,
  upload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      return apiResponse(res, {
        success: false,
        message: 'No file uploaded',
        status: 400
      });
    }

    // Build a clean base name for Cloudinary public_id (no extension, spaces -> underscores)
    const originalName = req.file.originalname || 'file.pdf';
    const baseName = originalName.replace(/\.[^.]+$/, '').replace(/\s+/g, '_').trim();

    // Upload to Cloudinary using the image pipeline so it can render PDF pages
    const result = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          resource_type: 'image',
          folder: 'pdf_uploads',
          public_id: baseName,
          // Ensure the original is stored as a PDF
          format: 'pdf',
          // Eagerly generate first-page PNG at max width 600px
          eager: [
            { format: 'png', page: 1, width: 600, crop: 'limit', quality: 'auto' }
          ],
          eager_async: false,
        },
        (error, uploadResult) => {
          if (error) return reject(error);
          resolve(uploadResult);
        }
      );
      uploadStream.end(req.file.buffer);
    });

    const eagerThumb = Array.isArray(result.eager) && result.eager[0] && result.eager[0].secure_url
      ? result.eager[0].secure_url
      : '';

    // Create note in database, persisting the thumbnailUrl
    const note = new Note({
      title: req.body.title || originalName,
      fileUrl: result.secure_url, // Cloudinary secure URL to the PDF
      fileType: 'application/pdf',
      thumbnailUrl: eagerThumb,
      uploader: req.session.user.id,
      uploaderName: req.session.user.name || req.session.user.username,
    });

    await note.save();
    
    apiResponse(res, {
      status: 201,
      message: 'File uploaded successfully',
      data: note
    });
  })
);

// Helper: best-effort derive Cloudinary public_id (with folder) from a fileUrl
function derivePublicIdFromUrl(url) {
  try {
    const u = new URL(url);
    const parts = u.pathname.split('/');
    const uploadIdx = parts.findIndex(p => p === 'upload');
    if (uploadIdx === -1) return null;
    const afterUpload = parts.slice(uploadIdx + 1); // [ 'v123', 'folder', 'name.ext' ]
    const withoutVersion = afterUpload[0] && /^v\d+$/i.test(afterUpload[0])
      ? afterUpload.slice(1)
      : afterUpload;
    if (!withoutVersion.length) return null;
    const last = withoutVersion[withoutVersion.length - 1];
    const base = last.replace(/\.[^.]+$/, ''); // remove extension
    const folders = withoutVersion.slice(0, -1);
    return [...folders, base].join('/');
  } catch {
    return null;
  }
}

// Create a note by saving metadata after client-direct Cloudinary upload
router.post('/create', 
  requireAuth,
  asyncHandler(async (req, res) => {
    const { title, fileUrl, fileType, thumbnailUrl } = req.body || {};

    if (!fileUrl || typeof fileUrl !== 'string') {
      return apiResponse(res, { success: false, status: 400, message: 'fileUrl is required' });
    }

    // If client did not provide thumbnailUrl, compute a deterministic first-page PNG URL
    let finalThumb = (typeof thumbnailUrl === 'string' && thumbnailUrl.trim()) ? thumbnailUrl.trim() : '';
    if (!finalThumb) {
      const pid = derivePublicIdFromUrl(fileUrl);
      if (pid) {
        finalThumb = cloudinary.url(`${pid}.png`, {
          resource_type: 'image',
          page: 1,
          transformation: [ { width: 600, crop: 'limit', quality: 'auto' } ],
          secure: true,
        });
      }
    }

    const note = new Note({
      title: title && String(title).trim() ? String(title).trim() : 'Untitled',
      fileUrl,
      fileType: fileType || 'application/pdf',
      thumbnailUrl: finalThumb || '',
      uploader: req.session.user.id,
      uploaderName: req.session.user.name || req.session.user.username,
    });

    await note.save();

    return apiResponse(res, { status: 201, message: 'Note saved', data: note });
  })
);

// Delete a note
router.delete('/:id',
  requireAuth,
  validateObjectId,
  checkOwnership(Note),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    await Note.findByIdAndDelete(id);
    
    apiResponse(res, {
      message: 'Note deleted successfully'
    });
  })
);

// Download a note
router.get('/download/:id', 
  validateObjectId,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const note = await Note.findById(id);
    
    if (!note) {
      return apiResponse(res, {
        success: false,
        message: 'File not found',
        status: 404
      });
    }
    
    // Forward the request to Cloudinary
    const targetUrl = note.fileUrl;
    // ... (existing download logic)
    
    // For now, redirect to the file URL
    res.redirect(targetUrl);
  })
);

module.exports = router;
