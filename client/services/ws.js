class WebSocketClient {
  constructor() {
    this.ws = null;
    this.listeners = new Map();
    this.connected = false;
    this.reconnectTimer = null;
  }

  connect() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    // Same origin: Vite proxies /ws to the API in dev, Express serves it in production.
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.connected = true;
        this.emit('connection_status', { connected: true });
        if (this.reconnectTimer) {
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = null;
        }
      };

      this.ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.event) {
            this.emit(payload.event, payload.data);
          }
        } catch (e) {
          console.error('WS Parse error:', e);
        }
      };

      this.ws.onclose = () => {
        this.connected = false;
        this.emit('connection_status', { connected: false });
        this.scheduleReconnect();
      };

      this.ws.onerror = () => {
        this.connected = false;
        this.emit('connection_status', { connected: false });
      };
    } catch (err) {
      this.scheduleReconnect();
    }
  }

  scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 3000);
  }

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(callback);

    // Return unsubscribe function
    return () => {
      const set = this.listeners.get(event);
      if (set) {
        set.delete(callback);
      }
    };
  }

  emit(event, data) {
    const set = this.listeners.get(event);
    if (set) {
      set.forEach(cb => {
        try {
          cb(data);
        } catch (e) {
          console.error(`Error in WS listener for ${event}:`, e);
        }
      });
    }
  }
}

export const wsClient = new WebSocketClient();
