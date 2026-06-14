'use client';

import { useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3005';

const socketCache = new Map<string, { socket: Socket; refs: number }>();

export function useSocket(operatorId?: string) {
  const key = operatorId || 'default';
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const cached = socketCache.get(key);
    if (cached) {
      cached.refs++;
      socketRef.current = cached.socket;
    } else {
      const token = typeof window !== 'undefined' ? localStorage.getItem('afiliators-token') : null;
      const socket = io(SOCKET_URL, {
        auth: { token, operatorId },
        transports: ['websocket', 'polling'],
        autoConnect: true,
      });

      socket.on('connect', () => {
        if (operatorId) {
          socket.emit('join:operator', { operatorId });
        }
      });

      socketCache.set(key, { socket, refs: 1 });
      socketRef.current = socket;
    }

    return () => {
      const cached = socketCache.get(key);
      if (cached) {
        cached.refs--;
        if (cached.refs <= 0) {
          cached.socket.disconnect();
          socketCache.delete(key);
        }
      }
    };
  }, [key, operatorId]);

  const on = useCallback((event: string, handler: (...args: any[]) => void) => {
    socketRef.current?.on(event, handler);
    return () => socketRef.current?.off(event, handler);
  }, []);

  const emit = useCallback((event: string, data?: any) => {
    socketRef.current?.emit(event, data);
  }, []);

  return { socket: socketRef.current, on, emit };
}
