const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;
const MONGO_URI = process.env.MONGO_URI;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

if (!MONGO_URI || !JWT_SECRET || !ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error('Missing MONGO_URI, JWT_SECRET, ADMIN_EMAIL or ADMIN_PASSWORD in .env');
  process.exit(1);
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
  createdAt: { type: Date, default: Date.now }
});

const adminSchema = new mongoose.Schema({
  email: { type: String, trim: true, lowercase: true, unique: true, required: true },
  passwordHash: { type: String, required: true }
});

const Feedback = mongoose.model('Feedback', feedbackSchema);
const GuestRequest = mongoose.model('GuestRequest', guestSchema);
const Subscriber = mongoose.model('Subscriber', subscriberSchema);
const Admin = mongoose.model('Admin', adminSchema);

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
