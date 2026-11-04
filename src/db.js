const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'glitch.db');
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '..', 'public', 'uploads');

// Ensure directories exist
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function initDB() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      skey TEXT NOT NULL PRIMARY KEY,
      svalue TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      is_admin INTEGER DEFAULT 0,
      rank TEXT DEFAULT 'member' CHECK(rank IN ('member','admin','owner')),
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // Default settings for Glitch Client
  const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (skey, svalue) VALUES (?, ?)');
  const defaults = [
    ['site_name', 'Glitch Client'],
    ['hero_title', 'Glitch Client'],
    ['hero_desc', 'Experience Minecraft like never before. Fast, smooth, and packed with features. Download the official Glitch Client now.'],
    ['download_filename', 'glitch-client.txt'],
    ['download_label', 'Download Glitch Client'],
    ['footer_text', '© Glitch Client. Not affiliated with Mojang or Microsoft.'],
    ['color_accent', '#a855f7'],
    ['color_accent2', '#c084fc'],
    ['color_bg', '#faf5ff'],
    ['color_bg2', '#f3e8ff'],
    ['color_text', '#1e1b4b'],
    ['color_card', '#ffffff'],
    ['discord_link', ''],
    ['maintenance_mode', '0'],
    ['maintenance_msg', 'Site currently under maintenance. Please check back soon!']
  ];
  for (const [k, v] of defaults) insertSetting.run(k, v);

  // Create a placeholder download file if it doesn't exist
  const dlName = getSetting('download_filename') || 'glitch-client.txt';
  const dlPath = path.join(UPLOAD_DIR, dlName);
  if (!fs.existsSync(dlPath)) {
    fs.writeFileSync(dlPath, 'Glitch Client - Placeholder Download File\n\nReplace this file from Admin Panel with the real client ZIP/JAR.\n\nVersion: 1.0.0\n');
  }
}

function getSetting(key, fallback = '') {
  const row = db.prepare('SELECT svalue FROM settings WHERE skey = ?').get(key);
  return row ? row.svalue : fallback;
}

function setSetting(key, value) {
  db.prepare('INSERT INTO settings (skey, svalue) VALUES (?, ?) ON CONFLICT(skey) DO UPDATE SET svalue = excluded.svalue').run(key, String(value));
}

function getAllSettings() {
  const rows = db.prepare('SELECT skey, svalue FROM settings').all();
  const obj = {};
  for (const r of rows) obj[r.skey] = r.svalue;
  return obj;
}

initDB();

module.exports = { db, UPLOAD_DIR, getSetting, setSetting, getAllSettings };
