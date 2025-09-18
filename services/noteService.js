const mongoose = require('mongoose');
const noteSchema = require('../models/noteSchema');
const { isValidObjectId } = require('../utils/helpers');

// Create a dedicated connection to the PDF DB and compile the Note model
const pdfDB = mongoose.createConnection(process.env.PDF_DB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});
const Note = pdfDB.model('Note', noteSchema);

class NoteService {
  // Get all notes with optional filtering
  static async getAllNotes(filters = {}) {
    return await Note.find(filters)
      .sort({ uploadedAt: -1 });
  }

  // Get notes by uploader (username or ID)
  static async getNotesByUploader(identifier) {
    const query = isValidObjectId(identifier)
      ? { uploader: identifier }
      : { 
          $or: [
            { uploaderName: identifier },
            { 'uploader.username': identifier }
          ]
        };
    
    return await this.getAllNotes(query);
  }

  // Create a new note
  static async createNote(noteData) {
    const note = new Note(noteData);
    return await note.save();
  }

  // Get a single note by ID
  static async getNoteById(id) {
    if (!isValidObjectId(id)) return null;
    return await Note.findById(id);
  }

  // Delete a note
  static async deleteNote(id) {
    if (!isValidObjectId(id)) return null;
    return await Note.findByIdAndDelete(id);
  }
}

module.exports = NoteService;
