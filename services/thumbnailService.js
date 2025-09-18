const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');
const os = require('os');
const https = require('https');
const http = require('http');
const url = require('url');
let pdfPoppler;

try {
  pdfPoppler = require('pdf-poppler');
} catch (e) {
  // Module not installed; service will no-op with a warning
  pdfPoppler = null;
}

// On Windows, allow setting POPPLER_PATH to the bin folder where poppler utilities live.
if (process.platform === 'win32' && process.env.POPPLER_PATH) {
  process.env.PATH = `${process.env.POPPLER_PATH};${process.env.PATH}`;
}

const THUMBS_DIR = path.join(process.cwd(), 'public', 'uploads', 'thumbnails');
const PUBLIC_PREFIX = '/uploads/thumbnails';

// Detect serverless platforms where writing to disk or spawning binaries is not supported
function isServerlessEnv() {
  return Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.NETLIFY || process.env.SERVERLESS);
}

async function ensureDirs() {
  await fsp.mkdir(THUMBS_DIR, { recursive: true });
}

function downloadToTemp(pdfUrl) {
  return new Promise((resolve, reject) => {
    try {
      const parsed = url.parse(pdfUrl);
      const mod = parsed.protocol === 'http:' ? http : https;
      const tmpPath = path.join(os.tmpdir(), `pdf-${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`);
      const file = fs.createWriteStream(tmpPath);
      const req = mod.get(pdfUrl, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          // follow redirect
          file.close(); fs.unlink(tmpPath, () => {});
          return resolve(downloadToTemp(res.headers.location));
        }
        if (!res.statusCode || res.statusCode >= 400) {
          file.close(); fs.unlink(tmpPath, () => {});
          return reject(new Error(`Failed to download PDF: ${res.statusCode}`));
        }
        res.pipe(file);
        file.on('finish', () => file.close(() => resolve(tmpPath)));
      });
      req.on('error', (err) => {
        try { file.close(); fs.unlink(tmpPath, () => {}); } catch {}
        reject(err);
      });
    } catch (err) {
      reject(err);
    }
  });
}

async function generatePdfThumbnailFromUrl(noteId, pdfUrl) {
  // Skip on serverless envs
  if (isServerlessEnv()) {
    console.warn('[thumbnailService] Serverless environment detected; skipping local thumbnail generation');
    return null;
  }
  if (!pdfPoppler) {
    console.warn('[thumbnailService] pdf-poppler not available; skipping thumbnail generation');
    return null;
  }
  try {
    await ensureDirs();
    const tmpPdf = await downloadToTemp(pdfUrl);
    const outPrefix = String(noteId);
    const opts = {
      format: 'png',
      out_dir: THUMBS_DIR,
      out_prefix: outPrefix,
      page: 1,
      // density: 150,
    };

    await pdfPoppler.convert(tmpPdf, opts);

    // pdf-poppler names the file like <prefix>-1.png for page 1
    const generatedPath = path.join(THUMBS_DIR, `${outPrefix}-1.png`);
    const finalPath = path.join(THUMBS_DIR, `${outPrefix}.png`);

    // If output name differs, attempt to find the first page file
    let srcPath = generatedPath;
    try {
      await fsp.access(srcPath);
    } catch {
      // Fallback: try `${outPrefix}.png` directly
      srcPath = finalPath;
    }

    if (srcPath !== finalPath) {
      try { await fsp.rename(srcPath, finalPath); } catch { /* ignore if rename fails */ }
    }

    // Cleanup temp file
    try { await fsp.unlink(tmpPdf); } catch {}

    // Return public URL path
    return `${PUBLIC_PREFIX}/${outPrefix}.png`;
  } catch (err) {
    console.warn('[thumbnailService] Failed to generate thumbnail:', err.message);
    return null;
  }
}

module.exports = {
  generatePdfThumbnailFromUrl,
};
