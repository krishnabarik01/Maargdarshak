import express from 'express';
import bcrypt from 'bcryptjs';
import { db } from '../db.js';
import { authenticate, authorize } from '../middleware.js';

const router = express.Router();

router.get('/', authenticate, (req, res) => {
  const settingsRows = db.prepare('SELECT key, value FROM settings').all();
  const settings = {};
  settingsRows.forEach(r => { settings[r.key] = r.value; });
  res.json(settings);
});

router.post('/', authenticate, authorize('admin'), (req, res) => {
  const updates = req.body;
  
  db.transaction(() => {
    Object.entries(updates).forEach(([key, value]) => {
      db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
        .run(key, String(value));
    });
  })();

  const settingsRows = db.prepare('SELECT key, value FROM settings').all();
  const settings = {};
  settingsRows.forEach(r => { settings[r.key] = r.value; });

  res.json({ success: true, settings });
});

// Users management (Admin only)
router.get('/users', authenticate, authorize('admin'), (req, res) => {
  const users = db.prepare('SELECT id, name, email, role, created_at FROM users ORDER BY id ASC').all();
  res.json(users);
});

router.post('/users', authenticate, authorize('admin'), (req, res) => {
  const { name, email, password, role = 'operator' } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'name, email, and password are required.' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase().trim());
  if (existing) {
    return res.status(400).json({ error: 'User with this email already exists.' });
  }

  const salt = bcrypt.genSaltSync(10);
  const hash = bcrypt.hashSync(password, salt);

  db.prepare('INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)')
    .run(name, email.toLowerCase().trim(), hash, role);

  const users = db.prepare('SELECT id, name, email, role, created_at FROM users ORDER BY id ASC').all();
  res.status(201).json({ success: true, users });
});

router.delete('/users/:id', authenticate, authorize('admin'), (req, res) => {
  const { id } = req.params;
  if (parseInt(id, 10) === req.user.id) {
    return res.status(400).json({ error: 'Cannot delete your own account.' });
  }
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
  res.json({ success: true, message: `User ${id} removed.` });
});

export default router;
