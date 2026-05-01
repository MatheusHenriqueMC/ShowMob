import { io, Socket } from "socket.io-client";

let _socket: Socket | null = null;

export function getSocket(): Socket {
  if (!_socket) {
    const url = process.env.NEXT_PUBLIC_API_URL ?? window.location.origin;
    _socket = io(url, { transports: ["websocket", "polling"] });
  }
  return _socket;
}

export function disconnectSocket(): void {
  if (_socket) {
    _socket.disconnect();
    _socket = null;
  }
}
