import asyncio
import socketio
from typing import Optional

sio = socketio.AsyncServer(cors_allowed_origins="*", async_mode="asgi")
_loop: Optional[asyncio.AbstractEventLoop] = None


def set_loop(loop: asyncio.AbstractEventLoop) -> None:
    global _loop
    _loop = loop


def emit_sync(event: str, data: dict, room: Optional[str] = None) -> None:
    if _loop and _loop.is_running():
        asyncio.run_coroutine_threadsafe(sio.emit(event, data, room=room), _loop)
