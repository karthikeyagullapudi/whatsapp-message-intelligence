import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { isMock } from '../api/http.js';
import { mockBus } from '../api/mock/bus.js';

// One shared connection for the whole app (Vite proxies /socket.io to the API).
// In mock mode the in-browser mock bus plays the same role.
const socket = isMock ? mockBus : io({ autoConnect: true });

// Subscribe to a server event for the lifetime of the component.
export function useSocketEvent(event, handler) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const listener = (data) => handlerRef.current(data);
    socket.on(event, listener);
    return () => socket.off(event, listener);
  }, [event]);
}

export function useSocketConnected() {
  const [connected, setConnected] = useState(socket.connected);
  useSocketEvent('connect', () => setConnected(true));
  useSocketEvent('disconnect', () => setConnected(false));
  return connected;
}
