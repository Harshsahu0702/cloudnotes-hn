const express = require('express');
const multer = require('multer');
const router = express.Router();
const { v2: cloudinary } = require('cloudinary');
const mongoose = require('mongoose');
const noteSchema = require('../models/noteSchema');
const { requireAuth, validateObjectId, checkOwnership } = require('../middleware/auth');
const { asyncHandler, apiResponse } = require('../utils/helpers');
const { generatePdfThumbnailFromUrl } = require('../services/thumbnailService');

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

    // Upload to Cloudinary as raw to preserve the PDF
    const result = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          resource_type: 'raw',
          folder: 'pdf_uploads',
          public_id: `${Date.now()}-${req.file.originalname.replace(/\s+/g, '_')}`,
        },
        (error, uploadResult) => {
          if (error) return reject(error);
          resolve(uploadResult);
        }
      );
      uploadStream.end(req.file.buffer);
    });

    // Create note first to obtain _id for thumbnail filename
    const note = new Note({
      title: req.body.title || req.file.originalname,
      fileUrl: result.secure_url,
      fileType: req.file.mimetype,
      publicId: result.public_id,
      uploader: req.session.user.id,
      uploaderName: req.session.user.name || req.session.user.username,
    });

    await note.save();

    // Generate local PNG thumbnail using pdf-poppler
    try {
      const thumbPublicPath = await generatePdfThumbnailFromUrl(note._id, note.fileUrl);
      if (thumbPublicPath) {
        note.thumbnailUrl = thumbPublicPath;
        await note.save();
      }
    } catch (thumbErr) {
      console.warn('[routes] Thumbnail generation failed:', thumbErr.message);
    }
    
    apiResponse(res, {
      status: 201,
      message: 'File uploaded successfully',
      data: note
    });
  })
);

// Create a note by saving metadata after client-direct Cloudinary upload
router.post('/create', 
  requireAuth,
  asyncHandler(async (req, res) => {
    const { title, fileUrl, fileType, publicId } = req.body || {};

    if (!fileUrl || typeof fileUrl !== 'string') {
      return apiResponse(res, { success: false, status: 400, message: 'fileUrl is required' });
    }

    const note = new Note({
      title: title && String(title).trim() ? String(title).trim() : 'Untitled',
      fileUrl,
      fileType: fileType || 'application/pdf',
      publicId: publicId || undefined,
      uploader: req.session.user.id,
      uploaderName: req.session.user.name || req.session.user.username,
    });

    await note.save();

    // Generate local PNG thumbnail using pdf-poppler
    try {
      const thumbPublicPath = await generatePdfThumbnailFromUrl(note._id, note.fileUrl);
      if (thumbPublicPath) {
        note.thumbnailUrl = thumbPublicPath;
        await note.save();
      }
    } catch (thumbErr) {
      console.warn('[routes] Thumbnail generation failed (create):', thumbErr.message);
    }

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
    
    // Forward to the file URL (or replace with proxy logic if needed)
    const targetUrl = note.fileUrl;
    return res.redirect(targetUrl);
  })
);

module.exports = router;
