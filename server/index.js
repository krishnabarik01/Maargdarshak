import express from 'express';
import http from 'http';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

dotenv.config(); // must run before modules that read process.env

const { initDatabase, recordSnapshot } = await import('./db.js');
const { initWebSocketServer, clientCount } = await import('./ws.js');
const { startSimulator } = await import('./simulator.js');
const { initGuidance } = await import('./guidance.js');
const { rateLimit, USING_DEV_SECRET } = await import('./middleware.js');

const routes = {
  auth: (await import('./routes/auth.js')).default,
  slots: (await import('./routes/slots.js')).default,
  sensors: (await import('./routes/sensors.js')).default,
  vehicles: (await import('./routes/vehicles.js')).default,
  layout: (await import('./routes/layout.js')).default,
  lasers: (await import('./routes/lasers.js')).default,
  devices: (await import('./routes/devices.js')).default,
  alerts: (await import('./routes/alerts.js')).default,
  analytics: (await import('./routes/analytics.js')).default,
  settings: (await import('./routes/settings.js')).default,
  guidance: (await import('./routes/guidance.js')).default,
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const server = http.createServer(app);

app.disable('x-powered-by');
app.set('trust proxy', 'loopback');
app.use(cors());
app.use(express.json({ limit: '256kb' }));

initDatabase();
initGuidance();
initWebSocketServer(server);
startSimulator();

recordSnapshot();
setInterval(() => { try { recordSnapshot(); } catch (e) { console.error('Snapshot error:', e.message); } }, 60_000).unref();

app.use('/api/auth', routes.auth);
app.use('/api/slots', routes.slots);
app.use('/api/lot', routes.slots);
app.use('/api/sensors', routes.sensors);
app.use('/api/vehicles', routes.vehicles);
app.use('/api', routes.vehicles); // exposes /api/sessions
app.use('/api/layout', routes.layout);
app.use('/api/lasers', routes.lasers);
app.use('/api/devices', routes.devices);
app.use('/api/alerts', routes.alerts);
app.use('/api/analytics', routes.analytics);
app.use('/api/settings', routes.settings);
app.use('/api/guidance', routes.guidance);

app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    system: 'Maargdarshak Control Server',
    version: '3.0.0',
    realtimeClients: clientCount(),
    timestamp: new Date().toISOString(),
  });
});

app.use('/api', (req, res) => res.status(404).json({ error: `Unknown API route: ${req.method} ${req.originalUrl}` }));

// Production: serve the built React app from the same port (run `npm run build` first).
const dist = path.join(__dirname, '..', 'dist');
if (fs.existsSync(path.join(dist, 'index.html'))) {
  app.use(express.static(dist));
  app.use((req, res, next) => (req.method === 'GET' ? res.sendFile(path.join(dist, 'index.html')) : next()));
}

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.status && err.status < 500 ? err.message : 'Internal server error.' });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`🧭 Maargdarshak server running on http://localhost:${PORT}`);
  if (USING_DEV_SECRET) console.warn('⚠️  JWT_SECRET is not set – using an insecure development secret. Copy .env.example to .env and change it before deploying.');
});

for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => process.exit(0));
