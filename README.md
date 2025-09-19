# Cloud Notes — PDF Upload & Sharing Web App

A full-stack Node.js app to upload, manage, and share PDF notes. Users can sign up with email OTP verification, log in, upload PDFs directly to Cloudinary with thumbnails, browse all notes, view single PDFs, manage their profile, and reset passwords via email OTP.

- Backend: Express + MongoDB (Mongoose) + Sessions (connect-mongo)
- Storage/Media: Cloudinary (direct client uploads, eager thumbnail)
- Auth: Session-based; OTP for signup and password reset via Nodemailer (Gmail)
- Views: EJS templates with a modern, lightweight front-end (`public/script.js`)

## Features

- User registration and login (session-based)
- Email OTP verification for signup
- Password reset via OTP email flow
- Upload PDFs directly from the browser to Cloudinary (securely signed)
- Automatic first-page thumbnail generation
- Browse all notes, view single PDF, see notes per user
- Personal profile: view and manage your uploads, update profile/password, delete account
- Feedback form emailing to admin inbox

## Tech Stack

- Node.js, Express, EJS
- MongoDB (separate databases for users and PDFs)
- Mongoose for ODM
- Sessions with `express-session` + `connect-mongo`
- Multer (in-memory) for server uploads, but prefers direct client upload to Cloudinary
- Cloudinary for media storage and transformations
- Nodemailer (Gmail) for OTP and feedback emails
- Dotenv for config

## Project Structure

```
pdf-upload-web/
├─ server.js
├─ package.json
├─ .env
├─ routes/
│  └─ noteRoutes.js
├─ services/
│  ├─ noteService.js
│  └─ userService.js
├─ models/
│  ├─ noteSchema.js
│  └─ userlogin.js
├─ middleware/
│  └─ auth.js            (referenced by routes)
├─ utils/
│  └─ helpers.js
├─ views/                (EJS templates: index, login, register, read, profile, userProfile, viewFile, error)
├─ public/
│  ├─ script.js
│  └─ (assets)
└─ node_modules/
```

Key files to know:
- `server.js`: App bootstrap, DB connections, sessions, OTP flow, signature generation, routes
- `routes/noteRoutes.js`: RESTful note endpoints
- `public/script.js`: Client-side upload flow, UI behavior, OTP UX
- `models/noteSchema.js`, `models/userlogin.js`: Mongoose schemas
- `middleware/auth.js`: Route guards/utilities (e.g. `requireAuth`, `validateObjectId`, `checkOwnership`)
- `utils/helpers.js`: Common utilities

## Environment Variables

Create a `.env` in the project root with:

- App/Environment
  - `NODE_ENV` = development | production
  - `SESSION_SECRET` = strong random string
  - `CORS_ORIGIN` = comma-separated list of allowed front-end origins (e.g., https://your-site.com, http://localhost:3000)
  - `COOKIE_DOMAIN` = optional parent domain for cookies (e.g., .your-site.com)

- MongoDB (two DBs recommended; separate URIs)
  - `PDF_DB_URI` = MongoDB URI for notes (PDF metadata)
  - `USER_DB_URI` = MongoDB URI for users and sessions

- Cloudinary
  - `CLOUDINARY_CLOUD_NAME`
  - `CLOUDINARY_API_KEY`
  - `CLOUDINARY_API_SECRET`

- Gmail (for OTP and feedback)
  - `GMAIL_USER` = your Gmail address
  - `GMAIL_APP_PASSWORD` = app password for Gmail (not your regular password)

Recommended:
- Use dedicated MongoDB Atlas clusters or databases for `PDF_DB_URI` and `USER_DB_URI`.
- For production behind a proxy (Vercel/Render/NGINX), `server.js` already sets `app.set('trust proxy', 1)`.

## Getting Started

1) Prerequisites
- Node.js 18+
- MongoDB databases (Atlas or local)
- Cloudinary account
- Gmail account with App Password enabled

2) Install dependencies
```
npm install
```

3) Configure environment
- Create `.env` and fill values (see above)

4) Run the app
```
npm start
```
By default it listens on the port provided by your host (Render/Heroku) or a default Express port if set elsewhere. If you need a specific port locally, you can add logic or a start script that sets `PORT`.

Optional for dev convenience (if you want auto-restart):
- Add a script in `package.json` like `"dev": "nodemon server.js"`, then:
```
npm run dev
```

## How It Works

- Session auth: Users authenticate with sessions stored in MongoDB via `connect-mongo`. Cookies are configured for secure cross-site usage in production when `CORS_ORIGIN` is set.
- OTP signup flow:
  - Client requests `/api/send-otp` with email.
  - Server emails a 6-digit code via Gmail using Nodemailer.
  - Client verifies via `/api/verify-otp`, then calls `/register`.
  - Note: OTP is stored in-memory for simplicity; use Redis/datastore in production.
- Upload flow (recommended: direct client upload to Cloudinary):
  - Client requests `/api/cloudinary/signature` to get a signed payload.
  - Client uploads file directly to Cloudinary’s `image/upload` endpoint with `allowed_formats=pdf` and an eager transform for a first-page PNG.
  - Client calls `/api/notes/create` with metadata (URL, thumbnail, title).
- Viewing/Downloading:
  - Browse all notes at `/read`.
  - View a single PDF page `/view/:id`.
  - Proxy download `/download/:id` streams bytes (supports range requests).

## Web Routes

- `GET /` — Home (upload UI)
- `GET /read` — All notes
- `GET /user/:username` — Public profile style page with a user’s uploaded notes
- `GET /view/:id` — Single note viewer
- `GET /login`, `GET /register` — Auth pages
- `GET /profile` — Logged-in user’s dashboard
- `POST /logout` — Logout
- `POST /send-feedback` — Sends feedback email to admin inbox

## API Endpoints

Auth and OTP
- `POST /api/send-otp`
  - Body: `{ email }`
  - Sends OTP to email if user doesn’t exist
- `POST /api/verify-otp`
  - Body: `{ email, otp }`
  - Verifies OTP in memory store

Password Reset (OTP)
- `POST /api/password-reset/send-otp`
  - Body: `{ email }` (must exist)
- `POST /api/password-reset/verify-otp`
  - Body: `{ email, otp }`
- `POST /api/password-reset/confirm`
  - Body: `{ email, otp, newPassword }`

Session Auth
- `POST /register`
  - Body: `{ name, username, password }` (requires OTP-verified email workflow on the client)
- `POST /login`
  - Body: `application/x-www-form-urlencoded` `{ username, password }`
  - On success, sets session and redirects

Cloudinary Signature + Notes
- `POST /api/cloudinary/signature` (auth required)
  - Body: `{ filename }`
  - Returns signed payload for client-direct Cloudinary upload
- `POST /api/notes/create` (auth required)
  - Body: `{ title, fileUrl, fileType, thumbnailUrl? }`
  - Saves metadata after a successful client-direct upload
- `GET /api/notes` (via `routes/noteRoutes.js`)
  - List all notes (JSON if `Accept: application/json`, otherwise renders)
- `GET /api/notes/user/:username`
  - All notes by uploaderName or embedded uploader username
- `DELETE /api/notes/:id` (auth + owner)
  - Deletes own note
- `GET /api/notes/download/:id`
  - Redirects to Cloudinary URL (lightweight)

Proxy Download (Server)
- `GET /download/:id`
  - Streams the underlying Cloudinary asset to the client and mirrors range headers for better PDF viewer performance

Profile Management
- `POST /profile` (auth)
  - Body: `{ name, username }`
  - Updates profile
- `POST /profile/password` (auth)
  - Body: `{ currentPassword, newPassword }`
- `POST /profile/delete-account` (auth)
  - Deletes user’s notes and account, destroys session

## Example: Client-Direct Upload Flow

1) Get signature
```
POST /api/cloudinary/signature
Content-Type: application/json
Body: { "filename": "my-notes.pdf" }
```

2) Upload to Cloudinary (client)
- POST to `https://api.cloudinary.com/v1_1/<cloudName>/image/upload`
- Form fields: `file`, `api_key`, `timestamp`, `signature`, `folder`, `public_id`, `resource_type=image`, `allowed_formats=pdf`, plus `eager` params for the thumbnail

3) Save metadata
```
POST /api/notes/create
Content-Type: application/json
Body: {
  "title": "My Notes",
  "fileUrl": "<secure_url_from_cloudinary>",
  "fileType": "application/pdf",
  "thumbnailUrl": "<first-page-png-from-eager>"
}
```

## Deployment Notes

- CORS and Cookies:
  - Set `CORS_ORIGIN` to the front-end origin(s). The server sets `Access-Control-Allow-Credentials: true`.
  - In production, cookies are set `secure: true` and `sameSite: 'none'` when `CORS_ORIGIN` is defined.
  - Consider setting `COOKIE_DOMAIN` (e.g. `.your-domain.com`) when using a subdomain front-end.

- Proxies:
  - `app.set('trust proxy', 1)` is enabled so secure cookies work behind reverse proxies.

- Cloudinary:
  - This app signs only the parameters Cloudinary expects.
  - Uses an eager transform to generate a first-page PNG at upload time (works even if “Strict Transformations” is on).

- OTP store:
  - The OTP store is in-memory for simplicity. Use Redis/memory store in production if you need multi-instance scale or durability.

## Troubleshooting

- OTP emails not sending:
  - Ensure `GMAIL_USER` and `GMAIL_APP_PASSWORD` are correct and App Passwords are enabled.
- Session not persisting:
  - Verify `USER_DB_URI` is reachable and sessions collection is created.
  - Check cookie settings for your environment (`secure`, `sameSite`, `domain`).
- Cloudinary 400 errors:
  - Ensure you’re uploading to `/image/upload` with `allowed_formats=pdf` and using the signed fields from `/api/cloudinary/signature`.
- CORS errors:
  - Add your front-end domain to `CORS_ORIGIN`.
  - Ensure the client requests include `credentials: 'include'`.

## Scripts

- Start: `npm start` (runs `node server.js`)
- You can add `"dev": "nodemon server.js"` if you prefer auto-reloads in dev.

## License

ISC (see `package.json`)

## Acknowledgements

- Cloudinary for robust media management
- MongoDB Atlas for managed database
- Nodemailer for simple email delivery
