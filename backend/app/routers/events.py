import time

from app.core.database import get_db
from app.core.socket import sio


@sio.on("join_room")
async def handle_join(sid: str, data: dict) -> None:
    code = (data.get("code") or "").upper()
    await sio.enter_room(sid, code)


@sio.on("leave_room")
async def handle_leave(sid: str, data: dict) -> None:
    code = (data.get("code") or "").upper()
    await sio.leave_room(sid, code)


@sio.on("video_set")
async def handle_video_set(sid: str, data: dict) -> None:
    code = (data.get("code") or "").upper()
    round_id = data.get("round_id")
    video_id = (data.get("video_id") or "").strip() or None
    db = get_db()
    room = db.rooms.find_one({"code": code})
    if not room:
        return
    update = {"$set": {"video_id": video_id}} if video_id else {"$unset": {"video_id": "", "video_state": ""}}
    db.rounds.update_one({"_id": round_id}, update)
    await sio.emit("video_set", {"round_id": round_id, "video_id": video_id or ""}, room=code)


@sio.on("video_control")
async def handle_video_control(sid: str, data: dict) -> None:
    code = (data.get("code") or "").upper()
    db = get_db()
    room = db.rooms.find_one({"code": code})
    if not room:
        return
    round_id = data.get("round_id")
    action = data.get("action", "sync")
    position = float(data.get("position", 0))
    server_ts = int(time.time() * 1000)
    db.rounds.update_one(
        {"_id": round_id},
        {"$set": {"video_state": {"playing": action != "pause", "position": position, "position_at_ms": server_ts}}},
    )
    await sio.emit(
        "video_control",
        {"round_id": round_id, "action": action, "position": position, "server_ts": server_ts},
        room=code,
    )


@sio.on("typing_indicator")
async def handle_typing(sid: str, data: dict) -> None:
    code = (data.get("code") or "").upper()
    await sio.emit(
        "typing_update",
        {
            "user_id": data.get("user_id"),
            "is_typing": bool(data.get("is_typing", False)),
            "session_id": data.get("session_id", ""),
        },
        room=code,
    )
