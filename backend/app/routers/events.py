import time

from app.core.database import get_db, get_rounds_data, get_totals_data
from app.core.socket import sio


@sio.on("join_room")
async def handle_join(sid: str, data: dict) -> None:
    code = (data.get("code") or "").upper()
    await sio.enter_room(sid, code)
    db = get_db()
    room = db.rooms.find_one({"code": code})
    if room:
        rounds = get_rounds_data(room["_id"])
        totals = get_totals_data(room["_id"])
        await sio.emit("state_update", {"rounds": rounds, "totals": totals}, to=sid)
        # Send immediate video sync for any active video so the joining player
        # doesn't wait up to 2 seconds for the next periodic sync
        for r in rounds:
            vs = r.get("video_state")
            if vs and r.get("video_id") and vs.get("playing"):
                server_ts = int(time.time() * 1000)
                elapsed = (server_ts - vs["position_at_ms"]) / 1000
                current_pos = vs["position"] + elapsed
                await sio.emit("video_control", {
                    "round_id": r["id"],
                    "action": "sync",
                    "position": current_pos,
                    "server_ts": server_ts,
                }, to=sid)


@sio.on("leave_room")
async def handle_leave(sid: str, data: dict) -> None:
    code = (data.get("code") or "").upper()
    user_id = data.get("user_id")
    await sio.leave_room(sid, code)
    if user_id:
        db = get_db()
        room = db.rooms.find_one({"code": code})
        if room and room["host_id"] == int(user_id):
            await sio.emit("room_closed", {}, room=code)


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


@sio.on("score_change")
async def handle_score_change(sid: str, data: dict) -> None:
    code = (data.get("code") or "").upper()
    try:
        user_id = int(data.get("user_id", 0))
        round_id = int(data.get("round_id", 0))
        delta = int(data.get("delta", 0))
    except (TypeError, ValueError):
        return
    if delta not in (1, -1):
        return
    db = get_db()
    room = db.rooms.find_one({"code": code})
    if not room or room["host_id"] != user_id:
        return
    await sio.emit("score_change", {"round_id": round_id, "uid": data.get("uid"), "delta": delta}, room=code, skip_sid=sid)


@sio.on("finish_round")
async def handle_finish_round(sid: str, data: dict) -> None:
    code = (data.get("code") or "").upper()
    try:
        user_id = int(data.get("user_id", 0))
        round_id = int(data.get("round_id", 0))
    except (TypeError, ValueError):
        return
    db = get_db()
    room = db.rooms.find_one({"code": code})
    if not room or room["host_id"] != user_id:
        return
    await sio.emit("round_finished", {"round_id": round_id}, room=code)


@sio.on("navigate_to_round")
async def handle_navigate_to_round(sid: str, data: dict) -> None:
    code = (data.get("code") or "").upper()
    try:
        user_id = int(data.get("user_id", 0))
        round_id = int(data.get("round_id", 0))
    except (TypeError, ValueError):
        return
    db = get_db()
    room = db.rooms.find_one({"code": code})
    if not room or room["host_id"] != user_id:
        return
    await sio.emit("navigate_to_round", {"round_id": round_id}, room=code)


@sio.on("keep_round")
async def handle_keep_round(sid: str, data: dict) -> None:
    code = (data.get("code") or "").upper()
    try:
        user_id = int(data.get("user_id", 0))
    except (TypeError, ValueError):
        return
    db = get_db()
    room = db.rooms.find_one({"code": code})
    if not room or room["host_id"] != user_id:
        return
    await sio.emit("keep_round", {}, room=code)


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
