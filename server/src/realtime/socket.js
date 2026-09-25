import { Server } from 'socket.io';

// Server → browser push. The rest of the app only calls emit(event, data);
// before initSocket() runs (e.g. in tests) emit is a harmless no-op.
let io = null;

export function initSocket(httpServer, { origin, onConnect } = {}) {
  io = new Server(httpServer, { cors: { origin } });
  io.on('connection', (socket) => onConnect?.(socket));
  return io;
}

export function emit(event, data) {
  io?.emit(event, data);
}

export function closeSocket() {
  return new Promise((resolve) => (io ? io.close(() => resolve()) : resolve()));
}
