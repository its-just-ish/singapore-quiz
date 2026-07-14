import { useEffect, useRef, useState } from "react";
import { roomSocketUrl } from "./api";
import type { RoomEvent } from "./types";

/** WebSocket connection to a room DO with basic auto-reconnect. */
export function useRoomSocket(
  code: string | null,
  playerId: string | null,
  token: string | null,
  onEvent: (event: RoomEvent) => void
) {
  const [connected, setConnected] = useState(false);
  const handler = useRef(onEvent);
  handler.current = onEvent;

  useEffect(() => {
    if (!code || !playerId || !token) return;
    let socket: WebSocket | null = null;
    let closed = false;
    let retry: ReturnType<typeof setTimeout>;

    function connect() {
      socket = new WebSocket(roomSocketUrl(code!, playerId!, token!));
      socket.onopen = () => setConnected(true);
      socket.onmessage = (e) => {
        try {
          handler.current(JSON.parse(e.data) as RoomEvent);
        } catch {
          /* ignore malformed frames */
        }
      };
      socket.onclose = () => {
        setConnected(false);
        if (!closed) retry = setTimeout(connect, 1200);
      };
    }
    connect();

    return () => {
      closed = true;
      clearTimeout(retry);
      socket?.close();
    };
  }, [code, playerId, token]);

  return connected;
}
