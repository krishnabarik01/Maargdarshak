import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { db } from './db.js';

const DEV_SECRET = 'maargdarshak-dev-secret-change-me';
export const JWT_SECRET = process.env.JWT_SECRET || DEV_SECRET;
export const USING_DEV_SECRET = JWT_SECRET === DEV_SECRET;

export function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required. No token provided.' });
  }
  try {
    req.user = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
}

export function authorize(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized.' });
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: `Forbidden. Role '${req.user.role}' lacks permission.` });
    }
    next();
  };
}

const safeEqual = (a, b) => {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
};

/** Hardware (ESP32 / Arduino) authentication via the X-API-Key header. */
export function apiKeyAuth(req, res, next) {
  const key = req.headers['x-api-key'];
  const expected = db.prepare("SELECT value FROM settings WHERE key = 'api_key'").get()?.value;
  if (!key || !expected || !safeEqual(key, expected)) {
    return res.status(401).json({ error: 'Unauthorized hardware node. Invalid or missing X-API-Key header.' });
  }
  next();
}

/** Tiny in-memory fixed-window rate limiter (per client IP). */
export function rateLimit({ windowMs, max, message = 'Too many requests, please slow down.' }) {
  const hits = new Map();
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.reset <= now) hits.delete(k);
  }, windowMs).unref();

  return (req, res, next) => {
    const now = Date.now();
    const key = req.ip;
    let entry = hits.get(key);
    if (!entry || entry.reset <= now) {
      entry = { count: 0, reset: now + windowMs };
      hits.set(key, entry);
    }
    entry.count++;
    if (entry.count > max) {
      res.setHeader('Retry-After', Math.ceil((entry.reset - now) / 1000));
      return res.status(429).json({ error: message });
    }
    next();
  };
}
