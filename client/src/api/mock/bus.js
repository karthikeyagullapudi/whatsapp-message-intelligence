// Stand-in for the Socket.IO connection in mock mode.
const listeners = new Map();

export const mockBus = {
  connected: true,
  on(event, fn) {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event).add(fn);
  },
  off(event, fn) {
    listeners.get(event)?.delete(fn);
  },
  emit(event, data) {
    listeners.get(event)?.forEach((fn) => fn(data));
  },
  setConnected(value) {
    this.connected = value;
    this.emit(value ? 'connect' : 'disconnect');
  },
};
