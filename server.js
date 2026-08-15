const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const path = require('path');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const multer = require('multer');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;
const MONGO_URI = process.env.MONGO_URI;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

// Newsletter sending (optional — the site runs fine without these set,
// the adminnnnnnn panel will just show a clear message instead of sending).
const SMTP_HOST = process.env.SMTP_HOST || 'smtp-relay.brevo.com';
const SMTP_PORT = Number(process.env.SMTP_PORT) || 587;
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const FROM_EMAIL = process.env.FROM_EMAIL;
const FROM_NAME = process.env.FROM_NAME || 'Ladies, Leadership & Logistics';
const SITE_URL = (process.env.SITE_URL || 'http://localhost:' + (process.env.PORT || 3000)).replace(/\/$/, '');
const ORG_ADDRESS = process.env.ORG_ADDRESS || '';

// Episode carousel images are committed straight to a GitHub repo (instead of
// the server's own disk) so they survive redeploys and are served over a CDN.
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_OWNER = process.env.GITHUB_OWNER;
const GITHUB_REPO = process.env.GITHUB_REPO;
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || 'main';
// Folder inside the repo that images are committed to. Keep this under
// `public/` so it's served by GitHub Pages / your static host if you use one.
const GITHUB_IMAGE_DIR = (process.env.GITHUB_IMAGE_DIR || 'public/episodes').replace(/^\/|\/$/g, '');
const githubEnabled = Boolean(GITHUB_TOKEN && GITHUB_OWNER && GITHUB_REPO);
if (!githubEnabled) {
  console.warn('Episode image uploads are disabled: set GITHUB_TOKEN, GITHUB_OWNER and GITHUB_REPO in .env to enable them.');
}

if (!MONGO_URI || !JWT_SECRET || !ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error('Missing MONGO_URI, JWT_SECRET, ADMIN_EMAIL or ADMIN_PASSWORD in .env');
  process.exit(1);
}

const mailEnabled = Boolean(SMTP_USER && SMTP_PASS && FROM_EMAIL);
let transporter = null;
if (mailEnabled) {
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: false, // Brevo/most relays use STARTTLS on 587
    auth: { user: SMTP_USER, pass: SMTP_PASS }
  });
} else {
  console.warn('Newsletter sending is disabled: set SMTP_USER, SMTP_PASS and FROM_EMAIL in .env to enable it.');
}

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());
app.use("/admin", express.static(path.join(__dirname, "admin")));

const feedbackSchema = new mongoose.Schema({
  name: { type: String, trim: true, maxlength: 100, default: 'Community Member' },
  rating: { type: Number, min: 1, max: 5, required: true },
  message: { type: String, trim: true, maxlength: 2000, required: true },
  approved: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

const guestSchema = new mongoose.Schema({
  name: { type: String, trim: true, maxlength: 100, required: true },
  email: { type: String, trim: true, lowercase: true, maxlength: 254, required: true },
  message: { type: String, trim: true, maxlength: 3000, required: true },
  status: { type: String, enum: ['new', 'contacted', 'closed'], default: 'new' },
  createdAt: { type: Date, default: Date.now }
});

const subscriberSchema = new mongoose.Schema({
  name: { type: String, trim: true, maxlength: 100, required: true },
  email: { type: String, trim: true, lowercase: true, maxlength: 254, unique: true, required: true },
  active: { type: Boolean, default: true },
  unsubscribeToken: { type: String, default: () => crypto.randomBytes(20).toString('hex'), unique: true },
  createdAt: { type: Date, default: Date.now }
});

const adminSchema = new mongoose.Schema({
  email: { type: String, trim: true, lowercase: true, unique: true, required: true },
  passwordHash: { type: String, required: true }
});

const episodeSchema = new mongoose.Schema({
  title: { type: String, trim: true, maxlength: 150, default: '' },
  youtubeLink: { type: String, trim: true, maxlength: 500, required: true },
  spotifyLink: { type: String, trim: true, maxlength: 500, required: true },
  imageUrl: { type: String, required: true },
  imagePath: { type: String, required: true }, // path inside the GitHub repo
  imageSha: { type: String, required: true },  // needed to delete/replace the file later
  order: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

const newsletterSchema = new mongoose.Schema({
  subject: { type: String, trim: true, maxlength: 200, required: true },
  bodyHtml: { type: String, required: true },
  isRawHtml: { type: Boolean, default: false },
  recipientCount: { type: Number, default: 0 },
  failedCount: { type: Number, default: 0 },
  sentBy: { type: String, trim: true, lowercase: true },
  sentAt: { type: Date, default: Date.now }
});

const Feedback = mongoose.model('Feedback', feedbackSchema);
const GuestRequest = mongoose.model('GuestRequest', guestSchema);
const Subscriber = mongoose.model('Subscriber', subscriberSchema);
const Admin = mongoose.model('Admin', adminSchema);
const Newsletter = mongoose.model('Newsletter', newsletterSchema);
const Episode = mongoose.model('Episode', episodeSchema);

/* ---------- GitHub-backed image storage for the episode carousel ---------- */

const GITHUB_API = 'https://api.github.com';

async function githubRequest(method, urlPath, body) {
  const res = await fetch(`${GITHUB_API}${urlPath}`, {
    method,
    headers: {
      'Authorization': `Bearer ${GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github+json',
      'User-Agent': 'lll-admin',
      'Content-Type': 'application/json'
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data && data.message ? data.message : `GitHub API error (${res.status})`;
    throw new Error(msg);
  }
  return data;
}

/** Commits a file (image) to the configured GitHub repo and returns its
 * public raw URL, repo path and blob sha (needed later to delete it). */
async function uploadImageToGithub(buffer, originalName) {
  const ext = (path.extname(originalName || '').toLowerCase() || '.jpg').replace(/[^a-z0-9.]/g, '') || '.jpg';
  const filename = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`;
  const repoPath = `${GITHUB_IMAGE_DIR}/${filename}`;
  const data = await githubRequest('PUT', `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${repoPath}`, {
    message: `Add episode image ${filename}`,
    content: buffer.toString('base64'),
    branch: GITHUB_BRANCH
  });
  const rawUrl = `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/${GITHUB_BRANCH}/${repoPath}`;
  return { imageUrl: rawUrl, imagePath: repoPath, imageSha: data.content && data.content.sha };
}

async function deleteImageFromGithub(repoPath, sha) {
  if (!repoPath || !sha) return;
  try {
    await githubRequest('DELETE', `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${repoPath}`, {
      message: `Remove episode image ${repoPath}`,
      sha,
      branch: GITHUB_BRANCH
    });
  } catch (err) {
    // Non-fatal: the DB record change should still succeed even if the
    // repo cleanup fails (e.g. file already removed manually).
    console.error('Failed to delete image from GitHub:', err.message);
  }
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 }, // 8MB
  fileFilter: (req, file, cb) => {
    const ok = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.mimetype);
    cb(ok ? null : new Error('Only PNG, JPEG, WEBP or GIF images are allowed.'), ok);
  }
});

function handleUploadError(err, req, res, next) {
  if (err) return res.status(400).json({ message: err.message || 'Image upload failed.' });
  next();
}

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function cleanString(value, max) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function auth(req, res, next) {
  const token = req.cookies.admin_token;
  if (!token) return res.status(401).json({ message: 'Authentication required.' });
  try {
    req.admin = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.clearCookie('admin_token');
    return res.status(401).json({ message: 'Session expired. Please log in again.' });
  }
}

function escapeHtml(v = '') {
  return String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));
}

// Turns plain typed text into safe paragraph HTML (used unless the admin
// explicitly opts into sending raw HTML they wrote themselves).
function textToHtmlParagraphs(text) {
  return String(text)
    .split(/\n{2,}/)
    .map(block => `<p style="margin:0 0 16px;">${escapeHtml(block).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

// Wraps newsletter content in a branded, professional-looking email template
// that matches the site's gold/ivory theme, with a required unsubscribe link.
function buildNewsletterHtml({ subject, contentHtml, subscriberName, unsubscribeUrl }) {
  const logoUrl = `${SITE_URL}/lll.png`;
  const greetingName = subscriberName ? escapeHtml(subscriberName.split(' ')[0]) : 'there';
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f3ede0;font-family:Georgia,'Times New Roman',serif;color:#2b2622;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3ede0;padding:32px 12px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fffdf9;border-radius:16px;overflow:hidden;border:1px solid #e6dac1;">
        <tr>
          <td style="background:linear-gradient(135deg,#8c6518,#b8862f);padding:28px 32px;text-align:center;">
            <img src="${logoUrl}" alt="Ladies, Leadership & Logistics" width="48" height="48" style="display:block;margin:0 auto 10px;">
            <p style="margin:0;color:#fffdf9;font-size:13px;letter-spacing:0.14em;text-transform:uppercase;">Ladies, Leadership &amp; Logistics</p>
          </td>
        </tr>
        <tr>
          <td style="padding:36px 32px 8px;">
            <h1 style="margin:0 0 18px;font-size:24px;font-weight:500;color:#2b2622;">${escapeHtml(subject)}</h1>
            <p style="margin:0 0 20px;font-size:15px;color:#70675e;">Hi ${greetingName},</p>
            <div style="font-size:15px;line-height:1.7;color:#2b2622;">${contentHtml}</div>
          </td>
        </tr>
        <tr>
          <td style="padding:28px 32px 32px;">
            <p style="margin:0;font-size:14px;">— The Ladies, Leadership &amp; Logistics team</p>
          </td>
        </tr>
        <tr>
          <td style="background:#f6f0e2;padding:20px 32px;border-top:1px solid #e6dac1;text-align:center;">
            <p style="margin:0 0 8px;font-size:11.5px;color:#8f8577;font-family:Arial,sans-serif;">
              You're receiving this because you subscribed at Ladies, Leadership &amp; Logistics.
              ${ORG_ADDRESS ? escapeHtml(ORG_ADDRESS) + '<br>' : ''}
            </p>
            <a href="${unsubscribeUrl}" style="font-size:11.5px;color:#a83d35;font-family:Arial,sans-serif;">Unsubscribe</a>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

app.get('/api/health', (req, res) => {
  res.json({ ok: true, database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected' });
});

app.post('/api/feedback', async (req, res) => {
  try {
    const rating = Number(req.body.rating);
    const name = cleanString(req.body.name, 100);
    const message = cleanString(req.body.message, 2000);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5 || !message) {
      return res.status(400).json({ message: 'Please provide a rating and feedback.' });
    }
    await Feedback.create({ rating, name: name || 'Community Member', message });
    res.status(201).json({ message: 'Feedback received.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Unable to save feedback right now.' });
  }
});

app.get('/api/reviews', async (req, res) => {
  try {
    const reviews = await Feedback.find({ approved: true })
      .sort({ createdAt: -1 })
      .limit(12)
      .select('name rating message createdAt');
    res.json({ reviews });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Unable to load reviews.' });
  }
});

app.get('/api/episodes', async (req, res) => {
  try {
    const episodes = await Episode.find()
      .sort({ order: 1, createdAt: 1 })
      .select('title youtubeLink spotifyLink imageUrl')
      .lean();
    res.json({ episodes });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Unable to load episodes.' });
  }
});

app.post('/api/guest-requests', async (req, res) => {
  try {
    const name = cleanString(req.body.name, 100);
    const email = cleanString(req.body.email, 254).toLowerCase();
    const message = cleanString(req.body.message, 3000);
    if (!name || !emailRegex.test(email) || !message) {
      return res.status(400).json({ message: 'Please provide a valid name, email and message.' });
    }
    await GuestRequest.create({ name, email, message });
    res.status(201).json({ message: 'Guest request received.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Unable to save the guest request right now.' });
  }
});

app.post('/api/subscribers', async (req, res) => {
  try {
    const name = cleanString(req.body.name, 100);
    const email = cleanString(req.body.email, 254).toLowerCase();
    if (!name || !emailRegex.test(email)) {
      return res.status(400).json({ message: 'Please provide a valid name and email.' });
    }
    await Subscriber.findOneAndUpdate(
      { email },
      { $set: { name, active: true }, $setOnInsert: { email } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    res.status(201).json({ message: 'Subscribed successfully.' });
  } catch (err) {
    if (err.code === 11000) return res.status(200).json({ message: 'This email is already subscribed.' });
    console.error(err);
    res.status(500).json({ message: 'Unable to subscribe right now.' });
  }
});

app.post('/api/admin/login', async (req, res) => {
  try {
    const email = cleanString(req.body.email, 254).toLowerCase();
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    const admin = await Admin.findOne({ email });
    if (!admin || !(await bcrypt.compare(password, admin.passwordHash))) {
      return res.status(401).json({ message: 'Invalid admin credentials.' });
    }
    const token = jwt.sign({ id: admin._id.toString(), email: admin.email, role: 'admin' }, JWT_SECRET, { expiresIn: '8h' });
    res.cookie('admin_token', token, {
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 8 * 60 * 60 * 1000
    });
    res.json({ message: 'Logged in.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Unable to log in.' });
  }
});

app.post('/api/admin/logout', auth, (req, res) => {
  res.clearCookie('admin_token');
  res.json({ message: 'Logged out.' });
});

app.get('/api/admin/me', auth, (req, res) => res.json({ email: req.admin.email }));

app.get('/api/admin/feedback', auth, async (req, res) => {
  const feedback = await Feedback.find().sort({ createdAt: -1 }).lean();
  res.json({ feedback });
});

app.patch('/api/admin/feedback/:id', auth, async (req, res) => {
  const allowed = {};
  if (typeof req.body.approved === 'boolean') allowed.approved = req.body.approved;
  if (!Object.keys(allowed).length) return res.status(400).json({ message: 'Nothing to update.' });
  const item = await Feedback.findByIdAndUpdate(req.params.id, allowed, { new: true }).lean();
  if (!item) return res.status(404).json({ message: 'Feedback not found.' });
  res.json({ item });
});

app.delete('/api/admin/feedback/:id', auth, async (req, res) => {
  await Feedback.findByIdAndDelete(req.params.id);
  res.json({ message: 'Feedback deleted.' });
});

app.get('/api/admin/guests', auth, async (req, res) => {
  const guests = await GuestRequest.find().sort({ createdAt: -1 }).lean();
  res.json({ guests });
});

app.patch('/api/admin/guests/:id', auth, async (req, res) => {
  const status = ['new', 'contacted', 'closed'].includes(req.body.status) ? req.body.status : null;
  if (!status) return res.status(400).json({ message: 'Invalid status.' });
  const item = await GuestRequest.findByIdAndUpdate(req.params.id, { status }, { new: true }).lean();
  if (!item) return res.status(404).json({ message: 'Request not found.' });
  res.json({ item });
});

app.delete('/api/admin/guests/:id', auth, async (req, res) => {
  await GuestRequest.findByIdAndDelete(req.params.id);
  res.json({ message: 'Request deleted.' });
});

app.get('/api/admin/subscribers', auth, async (req, res) => {
  const subscribers = await Subscriber.find().sort({ createdAt: -1 }).lean();
  res.json({ subscribers });
});

app.patch('/api/admin/subscribers/:id', auth, async (req, res) => {
  if (typeof req.body.active !== 'boolean') return res.status(400).json({ message: 'Invalid active value.' });
  const item = await Subscriber.findByIdAndUpdate(req.params.id, { active: req.body.active }, { new: true }).lean();
  if (!item) return res.status(404).json({ message: 'Subscriber not found.' });
  res.json({ item });
});

app.delete('/api/admin/subscribers/:id', auth, async (req, res) => {
  await Subscriber.findByIdAndDelete(req.params.id);
  res.json({ message: 'Subscriber deleted.' });
});

/* ---------- Episode carousel ---------- */

const urlLikeRegex = /^https?:\/\/.+/i;

app.get('/api/admin/episodes', auth, async (req, res) => {
  const episodes = await Episode.find().sort({ order: 1, createdAt: 1 }).lean();
  res.json({ episodes, githubEnabled });
});

app.post('/api/admin/episodes', auth, upload.single('image'), handleUploadError, async (req, res) => {
  try {
    if (!githubEnabled) {
      return res.status(503).json({ message: "Image uploads aren't configured yet. Add GITHUB_TOKEN, GITHUB_OWNER and GITHUB_REPO to your .env file (see README), then restart the server." });
    }
    const title = cleanString(req.body.title, 150);
    const youtubeLink = cleanString(req.body.youtubeLink, 500);
    const spotifyLink = cleanString(req.body.spotifyLink, 500);
    if (!urlLikeRegex.test(youtubeLink) || !urlLikeRegex.test(spotifyLink)) {
      return res.status(400).json({ message: 'Please provide a valid YouTube link and Spotify link.' });
    }
    if (!req.file) {
      return res.status(400).json({ message: 'Please choose a cover image.' });
    }

    const { imageUrl, imagePath, imageSha } = await uploadImageToGithub(req.file.buffer, req.file.originalname);

    const maxOrder = await Episode.findOne().sort({ order: -1 }).select('order').lean();
    const episode = await Episode.create({
      title,
      youtubeLink,
      spotifyLink,
      imageUrl,
      imagePath,
      imageSha,
      order: maxOrder ? maxOrder.order + 1 : 0
    });

    res.status(201).json({ episode });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message || 'Unable to save the episode right now.' });
  }
});

app.patch('/api/admin/episodes/reorder', auth, async (req, res) => {
  const ids = Array.isArray(req.body.order) ? req.body.order : null;
  if (!ids || !ids.length) return res.status(400).json({ message: 'Provide an ordered list of episode ids.' });
  await Promise.all(ids.map((id, index) => Episode.findByIdAndUpdate(id, { order: index })));
  res.json({ message: 'Order updated.' });
});

app.patch('/api/admin/episodes/:id', auth, upload.single('image'), handleUploadError, async (req, res) => {
  try {
    const episode = await Episode.findById(req.params.id);
    if (!episode) return res.status(404).json({ message: 'Episode not found.' });

    const updates = {};
    if (typeof req.body.title === 'string') updates.title = cleanString(req.body.title, 150);
    if (typeof req.body.youtubeLink === 'string') {
      const v = cleanString(req.body.youtubeLink, 500);
      if (!urlLikeRegex.test(v)) return res.status(400).json({ message: 'Please provide a valid YouTube link.' });
      updates.youtubeLink = v;
    }
    if (typeof req.body.spotifyLink === 'string') {
      const v = cleanString(req.body.spotifyLink, 500);
      if (!urlLikeRegex.test(v)) return res.status(400).json({ message: 'Please provide a valid Spotify link.' });
      updates.spotifyLink = v;
    }

    if (req.file) {
      if (!githubEnabled) {
        return res.status(503).json({ message: "Image uploads aren't configured yet. Add GITHUB_TOKEN, GITHUB_OWNER and GITHUB_REPO to your .env file (see README), then restart the server." });
      }
      const { imageUrl, imagePath, imageSha } = await uploadImageToGithub(req.file.buffer, req.file.originalname);
      // Swap in the new image, then remove the old one from the repo.
      const oldPath = episode.imagePath;
      const oldSha = episode.imageSha;
      updates.imageUrl = imageUrl;
      updates.imagePath = imagePath;
      updates.imageSha = imageSha;
      await deleteImageFromGithub(oldPath, oldSha);
    }

    Object.assign(episode, updates);
    await episode.save();
    res.json({ episode });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message || 'Unable to update the episode right now.' });
  }
});

app.delete('/api/admin/episodes/:id', auth, async (req, res) => {
  const episode = await Episode.findByIdAndDelete(req.params.id);
  if (!episode) return res.status(404).json({ message: 'Episode not found.' });
  await deleteImageFromGithub(episode.imagePath, episode.imageSha);
  res.json({ message: 'Episode deleted.' });
});

/* ---------- Newsletter ---------- */

app.get('/api/admin/newsletters', auth, async (req, res) => {
  const newsletters = await Newsletter.find().sort({ sentAt: -1 }).limit(50)
    .select('subject recipientCount failedCount sentAt sentBy').lean();
  res.json({ newsletters, mailEnabled });
});

app.post('/api/admin/newsletter/preview', auth, (req, res) => {
  const subject = cleanString(req.body.subject, 200) || '(No subject)';
  const rawBody = typeof req.body.body === 'string' ? req.body.body.slice(0, 50000) : '';
  const isRawHtml = Boolean(req.body.isRawHtml);
  const contentHtml = isRawHtml ? rawBody : textToHtmlParagraphs(rawBody);
  const html = buildNewsletterHtml({
    subject,
    contentHtml,
    subscriberName: 'Preview Reader',
    unsubscribeUrl: `${SITE_URL}/api/unsubscribe/preview`
  });
  res.json({ html });
});

app.post('/api/admin/newsletter/send', auth, async (req, res) => {
  if (!mailEnabled) {
    return res.status(503).json({ message: 'Email sending isn\'t configured yet. Add SMTP_USER, SMTP_PASS and FROM_EMAIL to your .env file (see README).' });
  }
  const subject = cleanString(req.body.subject, 200);
  const rawBody = typeof req.body.body === 'string' ? req.body.body.slice(0, 50000) : '';
  const isRawHtml = Boolean(req.body.isRawHtml);
  if (!subject || !rawBody.trim()) {
    return res.status(400).json({ message: 'Please provide a subject and a message.' });
  }

  const subscribers = await Subscriber.find({ active: true });
  if (!subscribers.length) {
    return res.status(400).json({ message: 'There are no active subscribers to send to.' });
  }

  const contentHtml = isRawHtml ? rawBody : textToHtmlParagraphs(rawBody);
  let sent = 0;
  const failedEmails = [];

  for (const sub of subscribers) {
    // Backfill an unsubscribe token for subscribers created before this feature existed.
    if (!sub.unsubscribeToken) {
      sub.unsubscribeToken = crypto.randomBytes(20).toString('hex');
      await sub.save();
    }
    const html = buildNewsletterHtml({
      subject,
      contentHtml,
      subscriberName: sub.name,
      unsubscribeUrl: `${SITE_URL}/api/unsubscribe/${sub.unsubscribeToken}`
    });
    try {
      await transporter.sendMail({
        from: `"${FROM_NAME}" <${FROM_EMAIL}>`,
        to: sub.email,
        subject,
        html
      });
      sent++;
    } catch (err) {
      console.error('Newsletter send failed for', sub.email, err.message);
      failedEmails.push(sub.email);
    }
    // Small pacing delay so we send steadily rather than in one burst.
    await new Promise(r => setTimeout(r, 250));
  }

  await Newsletter.create({
    subject,
    bodyHtml: contentHtml,
    isRawHtml,
    recipientCount: sent,
    failedCount: failedEmails.length,
    sentBy: req.admin.email
  });

  res.json({
    message: `Sent to ${sent} of ${subscribers.length} subscriber${subscribers.length === 1 ? '' : 's'}.`,
    sent,
    total: subscribers.length,
    failedEmails
  });
});

app.get('/api/unsubscribe/:token', async (req, res) => {
  const sub = await Subscriber.findOneAndUpdate(
    { unsubscribeToken: req.params.token },
    { $set: { active: false } },
    { new: true }
  ).lean();
  res.set('Content-Type', 'text/html');
  res.send(`<!doctype html><html><head><meta charset="utf-8"><title>Unsubscribed</title>
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <style>body{font-family:Georgia,serif;background:#f3ede0;color:#2b2622;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;padding:24px;}
  .card{background:#fffdf9;border:1px solid #e6dac1;border-radius:16px;padding:40px;max-width:420px;text-align:center;}
  a{color:#b8862f;}</style></head>
  <body><div class="card">
    <h1 style="font-size:22px;font-weight:500;">${sub ? 'You\'ve been unsubscribed' : 'Link no longer valid'}</h1>
    <p>${sub ? 'You will no longer receive newsletter emails from Ladies, Leadership &amp; Logistics. You can resubscribe anytime from our website.' : 'This unsubscribe link has already been used or is invalid.'}</p>
    <p><a href="${SITE_URL}">Return to the site</a></p>
  </div></body></html>`);
});

app.use(express.static(path.join(__dirname, 'public')));

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin', 'index.html'));
});

app.get('/admin/', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin', 'index.html'));
});

async function start() {
  await mongoose.connect(MONGO_URI);
  console.log('MongoDB connected.');
  const email = ADMIN_EMAIL.toLowerCase();
  let admin = await Admin.findOne({ email });
  if (!admin) {
    const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);
    admin = await Admin.create({ email, passwordHash });
    console.log(`Admin created: ${email}`);
  }
  app.listen(PORT, () => console.log(`Website running on http://localhost:${PORT}`));
}

start().catch(err => {
  console.error('Startup failed:', err);
  process.exit(1);
});