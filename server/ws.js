import { WebSocketServer, WebSocket } from 'ws';

let wss = null;

export function initWebSocketServer(server) {
  // Dedicated path so the same port can also serve the HTTP API / built frontend.
  wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws) => {
    ws.isAlive = true;
    ws.on('pong', () => {
      ws.isAlive = true;
    });
    ws.on('error', () => {});

    ws.send(JSON.stringify({
      event: 'connected',
      data: { message: 'Connected to Maargdarshak real-time gateway', timestamp: new Date().toISOString() },
    }));
  });

  const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (ws.isAlive === false) return ws.terminate();
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);

  wss.on('close', () => clearInterval(interval));
  return wss;
}

export function broadcast(event, data) {
  if (!wss) return;
  const payload = JSON.stringify({ event, data, timestamp: new Date().toISOString() });
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) client.send(payload);
  });
}

export function clientCount() {
  return wss ? wss.clients.size : 0;
}
