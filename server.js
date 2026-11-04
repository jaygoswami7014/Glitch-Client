const express = require('express');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const { db, UPLOAD_DIR, getSetting, setSetting, getAllSettings } = require('./src/db');
const SQLiteStore = require('./src/session-store');
const updater = require('./src/updater');

const app = express();
const PORT = process.env.PORT || 3000;
const MAX_FILE_SIZE = 80 * 1024 * 1024; // 80MB

app.set('trust proxy', 1);

// ---- Middleware ----
app.use(cors({ origin: true, credentials: true }));
app.use(cookieParser());
app.use(express.urlencoded({ extended: true, limit: '85mb' }));
app.use(express.json({ limit: '85mb' }));
app.use(session({
  store: new SQLiteStore(db),
  secret: process.env.SESSION_SECRET || 'glitch-client-secret-change-me-in-prod',
  resave: false,
  saveUninitialized: false,
  proxy: true,
  cookie: {
    maxAge: 7 * 24 * 60 * 60 * 1000,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production'
  }
}));

app.use('/uploads', express.static(UPLOAD_DIR));
app.use(express.static(path.join(__dirname, 'public')));

// Multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const base = path.basename(file.originalname, ext).replace(/[^a-z0-9_\-]/gi, '_');
    cb(null, `${base}_${Date.now()}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE }
});
const memoryUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE }
});

// ---- Helpers ----
function json(res, data, code = 200) {
  res.status(code).json(data);
}

function getLoggedUser(req) {
  return req.session.user || null;
}

function isAdmin(req) {
  const u = getLoggedUser(req);
  return u && (u.is_admin == 1 || u.rank === 'admin' || u.rank === 'owner');
}

function requireAdmin(req, res) {
  if (!isAdmin(req)) {
    json(res, { error: 'Unauthorized - Admin required' }, 401);
    return false;
  }
  return true;
}

function requireLogin(req, res) {
  if (!getLoggedUser(req)) {
    json(res, { error: 'Login required' }, 401);
    return false;
  }
  return true;
}

// ---- Auth Routes ----
app.post('/api/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    if (!username || !email || !password) return json(res, { error: 'All fields required' }, 400);
    if (username.length < 3 || username.length > 24) return json(res, { error: 'Username 3-24 chars' }, 400);
    if (password.length < 6) return json(res, { error: 'Password min 6 chars' }, 400);
    if (!/^[a-zA-Z0-9_]+$/.test(username)) return json(res, { error: 'Username: letters, numbers, _ only' }, 400);

    const existing = db.prepare('SELECT id FROM users WHERE username = ? OR email = ?').get(username, email);
    if (existing) return json(res, { error: 'Username or email already taken' }, 400);

    const count = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
    const isFirst = count === 0;
    const hash = await bcrypt.hash(password, 10);

    const info = db.prepare(
      'INSERT INTO users (username, email, password, is_admin, rank) VALUES (?, ?, ?, ?, ?)'
    ).run(username, email, hash, isFirst ? 1 : 0, isFirst ? 'owner' : 'member');

    const user = {
      id: info.lastInsertRowid,
      username,
      email,
      is_admin: isFirst ? 1 : 0,
      rank: isFirst ? 'owner' : 'member'
    };
    req.session.user = user;
    json(res, { ok: true, user, message: isFirst ? 'Registered as Owner (Admin)!' : 'Registered successfully!' });
  } catch (e) {
    console.error(e);
    json(res, { error: 'Registration failed' }, 500);
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return json(res, { error: 'Username and password required' }, 400);

    const row = db.prepare('SELECT * FROM users WHERE username = ? OR email = ?').get(username, username);
    if (!row) return json(res, { error: 'Invalid credentials' }, 401);

    const match = await bcrypt.compare(password, row.password);
    if (!match) return json(res, { error: 'Invalid credentials' }, 401);

    const user = {
      id: row.id,
      username: row.username,
      email: row.email,
      is_admin: row.is_admin,
      rank: row.rank
    };
    req.session.user = user;
    json(res, { ok: true, user });
  } catch (e) {
    console.error(e);
    json(res, { error: 'Login failed' }, 500);
  }
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    json(res, { ok: true });
  });
});

app.get('/api/me', (req, res) => {
  const user = getLoggedUser(req);
  if (!user) return json(res, { user: null });
  // refresh from db
  const row = db.prepare('SELECT id, username, email, is_admin, rank FROM users WHERE id = ?').get(user.id);
  if (!row) {
    req.session.destroy(() => {});
    return json(res, { user: null });
  }
  req.session.user = row;
  json(res, { user: row });
});

// ---- Public API ----
app.get('/api/settings', (req, res) => {
  const s = getAllSettings();
  // don't expose sensitive stuff
  json(res, {
    site_name: s.site_name,
    hero_title: s.hero_title,
    hero_desc: s.hero_desc,
    download_label: s.download_label,
    footer_text: s.footer_text,
    color_accent: s.color_accent,
    color_accent2: s.color_accent2,
    color_bg: s.color_bg,
    color_bg2: s.color_bg2,
    color_text: s.color_text,
    color_card: s.color_card,
    discord_link: s.discord_link,
    maintenance_mode: s.maintenance_mode,
    maintenance_msg: s.maintenance_msg
  });
});

app.get('/api/download', (req, res) => {
  if (getSetting('maintenance_mode') === '1') {
    return res.status(503).send(getSetting('maintenance_msg') || 'Maintenance');
  }
  const filename = getSetting('download_filename') || 'glitch-client.txt';
  const filePath = path.join(UPLOAD_DIR, filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).send('Download file not found. Admin please upload the client file.');
  }
  res.download(filePath, filename);
});

// ---- Admin API ----
app.get('/api/admin/settings', (req, res) => {
  if (!requireAdmin(req, res)) return;
  json(res, getAllSettings());
});

app.post('/api/admin/settings', (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const allowed = [
      'site_name', 'hero_title', 'hero_desc', 'download_label', 'footer_text',
      'color_accent', 'color_accent2', 'color_bg', 'color_bg2', 'color_text', 'color_card',
      'discord_link', 'maintenance_mode', 'maintenance_msg'
    ];
    for (const key of allowed) {
      if (req.body[key] !== undefined) setSetting(key, req.body[key]);
    }
    json(res, { ok: true, settings: getAllSettings() });
  } catch (e) {
    json(res, { error: e.message }, 500);
  }
});

app.post('/api/admin/upload-client', upload.single('file'), (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    if (!req.file) return json(res, { error: 'No file uploaded' }, 400);
    // delete old download file if different
    const oldName = getSetting('download_filename');
    if (oldName && oldName !== req.file.filename) {
      const oldPath = path.join(UPLOAD_DIR, oldName);
      if (fs.existsSync(oldPath)) {
        try { fs.unlinkSync(oldPath); } catch {}
      }
    }
    setSetting('download_filename', req.file.filename);
    json(res, {
      ok: true,
      filename: req.file.filename,
      size: req.file.size,
      message: 'Client file uploaded successfully!'
    });
  } catch (e) {
    json(res, { error: e.message }, 500);
  }
});

app.get('/api/admin/users', (req, res) => {
  if (!requireAdmin(req, res)) return;
  const users = db.prepare('SELECT id, username, email, is_admin, rank, created_at FROM users ORDER BY id').all();
  json(res, { users });
});

app.post('/api/admin/user-rank', (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const { userId, rank } = req.body;
    if (!['member', 'admin', 'owner'].includes(rank)) return json(res, { error: 'Invalid rank' }, 400);
    const me = getLoggedUser(req);
    if (me.id === Number(userId) && rank !== 'owner') {
      return json(res, { error: 'Cannot demote yourself' }, 400);
    }
    db.prepare('UPDATE users SET rank = ?, is_admin = ? WHERE id = ?')
      .run(rank, rank === 'admin' || rank === 'owner' ? 1 : 0, userId);
    json(res, { ok: true });
  } catch (e) {
    json(res, { error: e.message }, 500);
  }
});

// ---- ZIP Update System (from your other site) ----
app.get('/api/admin/updater/info', (req, res) => {
  if (!requireAdmin(req, res)) return;
  json(res, updater.info());
});

app.post('/api/admin/updater/check', memoryUpload.single('zip'), (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    if (!req.file) return json(res, { error: 'No ZIP uploaded' }, 400);
    const result = updater.check(req.file.buffer);
    json(res, result);
  } catch (e) {
    json(res, { error: e.message }, 400);
  }
});

app.post('/api/admin/updater/apply', (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const { token } = req.body;
    if (!token) return json(res, { error: 'Token required' }, 400);
    const me = getLoggedUser(req);
    const result = updater.apply(token, me.username);
    json(res, result);
  } catch (e) {
    json(res, { error: e.message }, 400);
  }
});

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Glitch Client running on http://localhost:${PORT}`);
});
