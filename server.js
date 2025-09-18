require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const { v2: cloudinary } = require('cloudinary');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const { generatePdfThumbnailFromUrl } = require('./services/thumbnailService');

// Nodemailer transporter setup
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD
  },
});

// Import routes
const authRoutes = require('./routes/authRoutes');
const noteRoutes = require('./routes/noteRoutes');

// Initialize Express app
const app = express();

// Trust the first proxy (Vercel/Render/NGINX) so secure cookies work
app.set('trust proxy', 1);

// Basic, dependency-free CORS middleware with credentials support
// Configure allowed frontend origins via CORS_ORIGIN or FRONTEND_ORIGIN (comma-separated)
const isProd = process.env.NODE_ENV === 'production';
const ALLOWED_ORIGINS = (process.env.CORS_ORIGIN || process.env.FRONTEND_ORIGIN || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.length && ALLOWED_ORIGINS.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Vary', 'Origin');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(204);
    }
  }
  next();
});

// Cloudinary Configuration
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// Ensure GET to delete-account never 404s (placed before static)
app.get('/profile/delete-account', (req, res) => {
  return res.redirect(303, '/profile');
});
app.use(express.static(path.join(__dirname, 'public')));

// View Engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Session Configuration is initialized after DB connections

// Expose user to views (must come AFTER session middleware)

// ======================
// Database Connections
// ======================

// PDF Database
const pdfDB = mongoose.createConnection(process.env.PDF_DB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});
pdfDB.on('connected', () => console.log('✅ Connected to PDF Database'));
pdfDB.on('error', (err) => console.error('❌ PDF DB connection error:', err));

// User Database
const userDB = mongoose.createConnection(process.env.USER_DB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});
userDB.on('connected', () => console.log('✅ Connected to User Database'));
userDB.on('error', (err) => console.error('❌ User DB connection error:', err));

// Import schemas
const noteSchema = require('./models/noteSchema');
const userLoginSchema = require('./models/userlogin');

// Create models using the connections
const Note = pdfDB.model('Note', noteSchema);
const User = userDB.model('UserLogin', userLoginSchema);

// In-memory store for OTPs (in production, use Redis or database)
const otpStore = new Map(); // used for signup
const resetOtpStore = new Map(); // used for password reset

// Session Configuration (after DB connections so we can reuse the Mongo client)
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    // Prefer using the existing MongoDB client from the User DB connection
    client: userDB.getClient(),
    collectionName: 'sessions'
  }),
  cookie: {
    maxAge: 1000 * 60 * 60 * 24 * 7,
    httpOnly: true,
    // Secure cookies in production; requires trust proxy on platforms like Vercel/Render
    secure: isProd,
    // Use SameSite=None for cross-domain setups so cookies are accepted by browsers
    sameSite: (ALLOWED_ORIGINS && ALLOWED_ORIGINS.length) ? 'none' : 'lax',
    // Optionally scope cookie to a parent domain (e.g., .example.com)
    ...(process.env.COOKIE_DOMAIN ? { domain: process.env.COOKIE_DOMAIN } : {})
  }
}));

// Expose user to views
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  next();
});

// Generate random 6-digit OTP
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Send OTP email
async function sendOTP(email, otp) {
  console.log('Preparing to send OTP to:', email);
  console.log('Using Gmail user:', process.env.GMAIL_USER);
  
  const mailOptions = {
    from: `"Cloud Notes" <${process.env.GMAIL_USER}>`,
    to: email,
    subject: 'Your OTP for Cloud Notes Signup',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #4f46e5;">Verify Your Email</h2>
        <p>Your OTP for Cloud Notes signup is:</p>
        <div style="background: #f3f4f6; padding: 20px; text-align: center; margin: 20px 0;">
          <span style="font-size: 28px; font-weight: bold; letter-spacing: 5px; color: #111827;">${otp}</span>
        </div>
        <p>This OTP is valid for 5 minutes.</p>
        <p>If you didn't request this, please ignore this email.</p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
        <p style="color: #6b7280; font-size: 14px;">This is an automated message, please do not reply.</p>
      </div>
    `
  };

  try {
    console.log('Sending email...');
    const info = await transporter.sendMail(mailOptions);
    console.log('Email sent successfully:', info.messageId);
    return true;
  } catch (error) {
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      stack: error.stack
    });
    return false;
  }
}

// Send Reset OTP email
async function sendResetOTP(email, otp) {
  const mailOptions = {
    from: `"Cloud Notes" <${process.env.GMAIL_USER}>`,
    to: email,
    subject: 'Cloud Notes Password Reset Code',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #4f46e5;">Reset Your Password</h2>
        <p>Your password reset code is:</p>
        <div style="background: #f3f4f6; padding: 20px; text-align: center; margin: 20px 0;">
          <span style="font-size: 28px; font-weight: bold; letter-spacing: 5px; color: #111827;">${otp}</span>
        </div>
        <p>This code is valid for 5 minutes.</p>
      </div>
    `
  };
  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('Reset email sent:', info.messageId);
    return true;
  } catch (error) {
    console.error('Send reset OTP error:', error);
    return false;
  }
}

// Multer Setup - Memory storage
const storage = multer.memoryStorage();
const upload = multer({ storage });

// ======================
// Routes
// ======================

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/notes', noteRoutes);

// Web Routes
app.get('/', (req, res) => {
  res.render('index');
});
app.get('/register', (req, res) => res.render('register'));
app.get('/login', (req, res) => res.render('login'));

// Logout
app.post('/logout', (req, res) => {
  const cookieOpts = {
    httpOnly: true,
    secure: isProd,
    sameSite: (ALLOWED_ORIGINS && ALLOWED_ORIGINS.length) ? 'none' : 'lax',
    ...(process.env.COOKIE_DOMAIN ? { domain: process.env.COOKIE_DOMAIN } : {})
  };
  req.session.destroy(() => {
    res.clearCookie('connect.sid', cookieOpts);
    res.redirect('/');
  });
});

// ======================
// OTP Endpoints
// ======================

// Send OTP to email
app.post('/api/send-otp', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ success: false, message: 'Email is required' });
    }

    // Check if user already exists
    const userExists = await User.findOne({ username: email });
    if (userExists) {
      console.log('User already exists:', email);
      return res.status(400).json({ success: false, message: 'User already exists' });
    }

    // Generate and store OTP
    const otp = generateOTP();
    otpStore.set(email, {
      otp,
      expiresAt: Date.now() + 300000, // 5 minutes
      verified: false
    });

    console.log('Generated OTP for', email, ':', otp);

    // Send OTP via email
    console.log('Attempting to send OTP to:', email);
    const emailSent = await sendOTP(email, otp);
    
    if (!emailSent) {
      console.error('Failed to send OTP email to:', email);
      return res.status(500).json({ 
        success: false, 
        message: 'Failed to send OTP. Please try again later.' 
      });
    }

    console.log('OTP sent successfully to:', email);
    res.json({ 
      success: true, 
      message: 'OTP sent successfully',
      // For development only - remove in production
      debug: { otp }
    });
  } catch (error) {
    console.error('Error in send-otp endpoint:', {
      message: error.message,
      stack: error.stack,
      requestBody: req.body
    });
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error',
      // For development only - remove in production
      error: error.message
    });
  }
});

// Verify OTP
app.post('/api/verify-otp', (req, res) => {
  try {
    const { email, otp } = req.body;
    
    if (!email || !otp) {
      return res.status(400).json({ success: false, message: 'Email and OTP are required' });
    }

    const otpData = otpStore.get(email);
    
    // Check if OTP exists
    if (!otpData) {
      return res.status(400).json({ success: false, message: 'No OTP found for this email. Please request a new OTP.' });
    }

    // Check if OTP is expired
    if (otpData.expiresAt < Date.now()) {
      otpStore.delete(email); // Clean up expired OTP
      return res.status(400).json({ success: false, message: 'OTP has expired. Please request a new one.' });
    }

    // Check if OTP matches
    if (otpData.otp !== otp) {
      return res.status(400).json({ success: false, message: 'Invalid OTP. Please try again.' });
    }

    // Mark as verified
    otpData.verified = true;
    otpStore.set(email, otpData);

    res.json({ 
      success: true, 
      message: 'OTP verified successfully',
      data: {
        emailVerified: true
      }
    });
  } catch (error) {
    console.error('Error verifying OTP:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// ======================
// Password Reset (OTP)
// ======================

// Send password reset OTP
app.post('/api/password-reset/send-otp', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, message: 'Email is required' });

    const user = await User.findOne({ username: email });
    if (!user) return res.status(404).json({ success: false, message: 'No account found for this email' });

    const otp = generateOTP();
    resetOtpStore.set(email, {
      otp,
      expiresAt: Date.now() + 300000,
      verified: false
    });

    const ok = await sendResetOTP(email, otp);
    if (!ok) return res.status(500).json({ success: false, message: 'Failed to send reset code' });
    return res.json({ success: true, message: 'Reset code sent' });
  } catch (err) {
    console.error('Reset send-otp error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Verify password reset OTP
app.post('/api/password-reset/verify-otp', (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) return res.status(400).json({ success: false, message: 'Email and OTP are required' });

    const rec = resetOtpStore.get(email);
    if (!rec) return res.status(400).json({ success: false, message: 'No reset code found. Send a new one.' });
    if (rec.expiresAt < Date.now()) {
      resetOtpStore.delete(email);
      return res.status(400).json({ success: false, message: 'Reset code expired. Send a new one.' });
    }
    if (rec.otp !== otp) return res.status(400).json({ success: false, message: 'Invalid reset code' });

    rec.verified = true;
    resetOtpStore.set(email, rec);
    return res.json({ success: true, message: 'Code verified' });
  } catch (err) {
    console.error('Reset verify-otp error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Confirm password reset
app.post('/api/password-reset/confirm', async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;
    if (!email || !otp || !newPassword) return res.status(400).json({ success: false, message: 'Missing fields' });

    const rec = resetOtpStore.get(email);
    if (!rec || !rec.verified || rec.otp !== otp || rec.expiresAt < Date.now()) {
      return res.status(400).json({ success: false, message: 'Invalid or expired code' });
    }

    const user = await User.findOne({ username: email });
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();

    resetOtpStore.delete(email);
    return res.json({ success: true, message: 'Password updated' });
  } catch (err) {
    console.error('Reset confirm error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// ======================
// User Registration
// ======================
app.post('/register', async (req, res) => {
  try {
    const { name, username, password } = req.body;

    if (!name || !username || !password) return res.status(400).send('Name, email and password are required');

    const existingUser = await User.findOne({ username });
    if (existingUser) return res.status(409).send('User already exists');

    const hashed = await bcrypt.hash(password, 10);
    const newUser = new User({ name, username, password: hashed });
    await newUser.save();

    req.session.user = { id: newUser._id.toString(), name: newUser.name, username: newUser.username };
    res.status(201).send('Registration successful');
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).send('Registration failed');
  }
});

// ======================
// User Login
// ======================
app.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).send('Username and password are required');

    const user = await User.findOne({ username });
    if (!user) return res.status(401).send('Invalid username or password');

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).send('Invalid username or password');

    // Store user in session
    req.session.user = {
      id: user._id,
      name: user.name,
      username: user.username
    };

    await req.session.save();

    // Handle redirect after login
    const redirectTo = req.query.redirect || '/';
    res.redirect(redirectTo);
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).send('Login failed');
  }
});

// ======================
// Upload PDF
// ======================
function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ success: false, message: 'Unauthorized' });
  next();
}

// Generate Cloudinary signature for direct client upload
app.post('/api/cloudinary/signature', requireAuth, (req, res) => {
  try {
    const filename = (req.body && req.body.filename ? String(req.body.filename) : 'file').trim();
    const timestamp = Math.round(Date.now() / 1000);
    const folder = 'pdf_uploads';
    const public_id = `${Date.now()}-${filename.replace(/\s+/g, '_')}`;

    const paramsToSign = {
      timestamp,
      folder,
      public_id,
    };

    const signature = cloudinary.utils.api_sign_request(
      paramsToSign,
      process.env.CLOUDINARY_API_SECRET
    );

    return res.json({
      success: true,
      cloudName: process.env.CLOUDINARY_CLOUD_NAME,
      apiKey: process.env.CLOUDINARY_API_KEY,
      timestamp,
      signature,
      folder,
      public_id,
      resource_type: 'raw'
    });
  } catch (err) {
    console.error('Signature generation error:', err);
    return res.status(500).json({ success: false, message: 'Failed to generate signature' });
  }
});

app.post('/upload', requireAuth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });

    // Upload to Cloudinary
    const result = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          resource_type: 'raw', // Required for PDFs
          folder: 'pdf_uploads', // Cloudinary auto-creates this folder
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
    const newNote = new Note({
      title: req.body.title || req.file.originalname,
      fileUrl: result.secure_url,
      fileType: req.file.mimetype,
      publicId: result.public_id,
      uploader: req.session.user.id,
      uploaderName: req.session.user.name || req.session.user.username,
    });
    await newNote.save();

    // Generate local PNG thumbnail using pdf-poppler
    try {
      const thumbPublicPath = await generatePdfThumbnailFromUrl(newNote._id, newNote.fileUrl);
      if (thumbPublicPath) {
        newNote.thumbnailUrl = thumbPublicPath;
        await newNote.save();
      }
    } catch (thumbErr) {
      console.warn('Thumbnail generation failed:', thumbErr.message);
    }

    res.json({
      success: true,
      message: 'File uploaded successfully',
      data: newNote,
    });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ success: false, message: 'File upload failed' });
  }
});

// ======================
// View All PDFs
// ======================
app.get('/read', async (req, res) => {
  try {
    const notes = await Note.find()
      .populate({ path: 'uploader', model: User, select: 'name username' })
      .sort({ uploadedAt: -1 });
    // Do not override `user`; it's already exposed via res.locals from the session middleware
    res.render('read', { notes });
  } catch (err) {
    console.error('Read error:', err);
    res.status(500).send('Error reading files');
  }
});

// ======================
// User uploads by username
// ======================
app.get('/user/:username', async (req, res) => {
  try {
    const { username } = req.params;
    if (!username) return res.status(400).send('Username required');

    // Try to find actual user by username (email/handle)
    const userDoc = await User.findOne({ username }).select('name username');

    let query = {};
    if (userDoc) {
      // Match either by ObjectId reference or by stored name/username string
      query = {
        $or: [
          { uploader: userDoc._id },
          { uploaderName: userDoc.username },
          { uploaderName: userDoc.name }
        ]
      };
    } else {
      // Fallback: match by uploaderName equals the provided param (supports name or username in URL)
      query = { uploaderName: username };
    }

    const notes = await Note.find(query).sort({ uploadedAt: -1 });

    const displayName = userDoc ? (userDoc.name || userDoc.username) : username;
    return res.render('userProfile', { username: displayName, notes, user: req.session.user || null });
  } catch (err) {
    console.error('User uploads error:', err);
    res.status(500).send('Failed to load user uploads');
  }
});

// ======================
// API: Notes by uploader (username or display name)
// ======================
app.get('/api/notes/by-uploader', async (req, res) => {
  try {
    const name = (req.query.name || '').trim();
    if (!name) return res.status(400).json({ success: false, message: 'Missing name' });

    const userDoc = await User.findOne({ username: name }).select('_id name username');
    const query = userDoc
      ? { $or: [{ uploader: userDoc._id }, { uploaderName: userDoc.username }, { uploaderName: userDoc.name }] }
      : { uploaderName: name };

    const notes = await Note.find(query)
      .sort({ uploadedAt: -1 })
      .select('title fileUrl fileType uploadedAt');

    res.json({ success: true, notes });
  } catch (err) {
    console.error('API by-uploader error:', err);
    res.status(500).json({ success: false, message: 'Failed to load notes' });
  }
});

// ======================
// View Single PDF
// ======================
app.get('/view/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Validate ObjectId before querying MongoDB
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).send('Invalid file ID');
    }

    const note = await Note.findById(id).populate({ path: 'uploader', model: User, select: 'name username' });
    if (!note) return res.status(404).send('File not found');

    // Render viewer page with EJS (nicer experience)
    return res.render('viewFile', { note });
  } catch (err) {
    console.error('View error:', err);
    res.status(500).send('Error loading file');
  }
});

// ======================
// Download/Proxy PDF (streams bytes to avoid CORS for previews)
// ======================
app.get('/download/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).send('Invalid file ID');
    }
    const note = await Note.findById(id);
    if (!note) return res.status(404).send('File not found');

    const targetUrl = note.fileUrl;
    const https = require('https');
    const { URL } = require('url');

    res.setHeader('Content-Type', note.fileType || 'application/pdf');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');

    const forward = (urlStr, redirects = 0) => {
      if (redirects > 5) {
        res.status(502).end('Too many redirects');
        return;
      }
      const u = new URL(urlStr);
      const options = {
        method: 'GET',
        hostname: u.hostname,
        path: u.pathname + (u.search || ''),
        headers: {
          'User-Agent': 'Mozilla/5.0',
          // Forward range requests to enable partial fetch (helps PDF.js)
          ...(req.headers['range'] ? { Range: req.headers['range'] } : {}),
        },
      };
      const request = https.request(options, (r) => {
        const status = r.statusCode || 500;
        if (status >= 300 && status < 400 && r.headers.location) {
          const nextUrl = r.headers.location.startsWith('http') ? r.headers.location : `${u.protocol}//${u.host}${r.headers.location}`;
          r.resume();
          return forward(nextUrl, redirects + 1);
        }
        if (status >= 400) {
          res.status(status).end('Upstream error');
          return;
        }
        // Mirror useful headers
        if (r.headers['content-length']) res.setHeader('Content-Length', r.headers['content-length']);
        if (r.headers['accept-ranges']) res.setHeader('Accept-Ranges', r.headers['accept-ranges']);
        if (r.headers['content-range']) res.setHeader('Content-Range', r.headers['content-range']);
        if (req.headers['range'] && status === 206) res.status(206);
        r.pipe(res);
      });
      request.on('error', (e) => {
        console.error('Proxy error:', e);
        res.status(500).end('Proxy failed');
      });
      request.end();
    };

    forward(targetUrl);
  } catch (err) {
    console.error('Download error:', err);
    res.status(500).send('Error downloading file');
  }
});

// ======================
// Profile
// ======================
app.get('/profile', async (req, res) => {
  if (!req.session.user) return res.redirect('/');
  try {
    const me = await User.findById(req.session.user.id);
    const myNotes = await Note.find({ uploader: req.session.user.id }).sort({ uploadedAt: -1 });
    res.render('profile', { me, notes: myNotes });
  } catch (err) {
    console.error('Profile error:', err);
    res.status(500).send('Failed to load profile');
  }
});

app.post('/profile', async (req, res) => {
  if (!req.session.user) return res.status(401).send('Unauthorized');
  try {
    const { name, username } = req.body;
    if (!name || !username) return res.status(400).send('Name and email are required');
    const existing = await User.findOne({ username, _id: { $ne: req.session.user.id } });
    if (existing) return res.status(409).send('Email already in use');
    const updated = await User.findByIdAndUpdate(
      req.session.user.id,
      { $set: { name, username } },
      { new: true }
    );
    req.session.user = { id: updated._id.toString(), name: updated.name, username: updated.username };
    res.send('Profile updated');
  } catch (err) {
    console.error('Profile update error:', err);
    res.status(500).send('Update failed');
  }
});

app.post('/profile/password', async (req, res) => {
  if (!req.session.user) return res.status(401).send('Unauthorized');
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) return res.status(400).send('Both current and new passwords are required');
    const user = await User.findById(req.session.user.id);
    if (!user) return res.status(404).send('User not found');
    const ok = await bcrypt.compare(currentPassword, user.password);
    if (!ok) return res.status(400).send('Current password is incorrect');
    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();
    res.send('Password updated');
  } catch (err) {
    console.error('Password update error:', err);
    res.status(500).send('Password update failed');
  }
});

// Delete account
app.post('/profile/delete-account', async (req, res) => {
  if (!req.session.user) return res.status(401).send('Unauthorized');
  try {
    const userId = req.session.user.id;
    // Delete user's notes
    await Note.deleteMany({ uploader: userId });
    // Delete user
    await User.findByIdAndDelete(userId);
    // Destroy session and redirect home
    req.session.destroy((err) => {
      if (err) {
        console.error('Session destroy error:', err);
      }
      res.clearCookie('connect.sid');
      res.redirect(303, '/');
    });
  } catch (err) {
    console.error('Delete account error:', err);
    res.status(500).send('Failed to delete account');
  }
});

// (handled earlier, before static)

// Delete an upload (owned by the logged-in user)
app.delete('/uploads/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).send('Invalid file ID');
    }
    const note = await Note.findById(id);
    if (!note) return res.status(404).send('File not found');
    if (!note.uploader || String(note.uploader) !== String(req.session.user.id)) {
      return res.status(403).send('Not allowed');
    }
    await Note.deleteOne({ _id: id });
    // Optional: Also delete from Cloudinary if you store public_id
    return res.send('Deleted');
  } catch (err) {
    console.error('Delete upload error:', err);
    res.status(500).send('Delete failed');
  }
});

// Feedback endpoint
app.post('/send-feedback', async (req, res) => {
    try {
        const { message } = req.body;

        if (!message || message.trim().length === 0) {
            return res.redirect('/?feedback=error');
        }

        const userId = req.session.user?.id;
        if (!userId) {
            return res.redirect('/login?redirect=/&message=Please login to send feedback');
        }

        const user = await User.findById(userId).select('name username');
        if (!user) {
            return res.redirect('/?feedback=error');
        }

        const userEmail = user.username;

        // Email content
        const mailOptions = {
            from: `"${user.name || 'Feedback'}" <${process.env.GMAIL_USER}>`,
            to: process.env.GMAIL_USER,
            subject: `New Feedback from ${user.name || 'User'}`,
            html: `
                <h3>New Feedback Received</h3>
                <p><strong>User Name:</strong> ${user.name || 'Not provided'}</p>
                <p><strong>User Email:</strong> ${userEmail}</p>
                <hr>
                <p><strong>Message:</strong></p>
                <p>${message.replace(/\n/g, '<br>')}</p>
            `
        };

        await transporter.sendMail(mailOptions);
        console.log(`✅ Feedback email sent from ${userEmail}`);
        res.redirect('/?feedback=success');
    } catch (error) {
        console.error('❌ Error sending feedback email:', error);
        res.redirect('/?feedback=error');
    }
});

// ======================
// Error Handling Middleware
// ======================
app.use((err, req, res, next) => {
  console.error('Error:', err);
  const status = err.status || 500;
  const message = process.env.NODE_ENV === 'production' 
    ? 'Something went wrong!' 
    : err.message;
  
  if (req.accepts('json')) {
    return res.status(status).json({ success: false, message });
  }
  
  res.status(status).render('error', { message });
});

// 404 Handler
app.use((req, res) => {
  if (req.accepts('json')) {
    return res.status(404).json({ success: false, message: 'Not Found' });
  }
  res.status(404).render('404');
});

// ======================
// Server Initialization
// ======================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

module.exports = app;