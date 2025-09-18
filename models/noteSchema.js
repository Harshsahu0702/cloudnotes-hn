const mongoose = require('mongoose');

// Mongoose schema for storing only file metadata
const noteSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
  },
  fileUrl: {
    type: String, // Cloudinary URL
    required: true,
  },
  fileType: {
    type: String, // e.g., 'application/pdf'
    required: true,
  },
  // URL of the generated thumbnail image (PNG of first page)
  thumbnailUrl: {
    type: String,
  },
  uploader: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'UserLogin',
    required: true,
  },
  uploaderName: {
    type: String,
    required: true,
  },
  uploadedAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = noteSchema;
