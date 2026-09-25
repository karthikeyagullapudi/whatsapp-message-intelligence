import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

// One shared connection for the whole app (Vite proxies /socket.io to the API).
const socket = io({ autoConnect: true });

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

// true/false: is the browser connected to our API's socket?
export function useSocketConnected() {
  const [connected, setConnected] = useState(socket.connected);
  useEffect(() => {
    const on = () => setConnected(true);
    const off = () => setConnected(false);
    socket.on('connect', on);
    socket.on('disconnect', off);
    return () => {
      socket.off('connect', on);
      socket.off('disconnect', off);
    };
  }, []);
  return connected;
}
