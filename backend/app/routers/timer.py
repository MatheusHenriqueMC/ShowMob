import asyncio
import secrets
import time

from fastapi import APIRouter, Depends, HTTPException

from app.core.database import get_db
from app.core.dependencies import get_auth_user
from app.core.socket import sio
from app.schemas.timer import StartTimerRequest, SaveAnswerRequest

router = APIRouter()


async def _end_timer(session_id: str, room_code: str) -> None:
    db = get_db()
    session = db.timer_sessions.find_one({"_id": session_id})
    if not session or session["ended"]:
        return
    db.timer_sessions.update_one({"_id": session_id}, {"$set": {"ended": True}})
    db.rooms.update_one({"code": room_code}, {"$unset": {"active_timer": ""}})
    room = db.rooms.find_one({"code": room_code})
    if not room:
        return
    member_ids = [m["user_id"] for m in db.room_members.find({"room_id": room["_id"]})]
    stored = {a["user_id"]: a["text"] for a in db.answers.find({"session_id": session_id})}
    answer_list = [{"user_id": uid, "text": stored.get(uid) or "X - X"} for uid in member_ids]
    await sio.emit(
        "timer_ended",
        {"session_id": session_id, "round_id": session["round_id"], "answers": answer_list},
        room=room_code,
    )


@router.get("/{code}/timer")
async def get_timer(code: str, user=Depends(get_auth_user)):
    db = get_db()
    room = db.rooms.find_one({"code": code.upper()})
    if not room or "active_timer" not in room:
        return {"active": False}
    session = db.timer_sessions.find_one({"_id": room["active_timer"]})
    if not session or session["ended"]:
        return {"active": False}
    if session["started_at_ms"] + session["duration"] * 1000 < int(time.time() * 1000):
        await _end_timer(session["_id"], code.upper())
        return {"active": False}
    return {
        "active": True,
        "session_id": session["_id"],
        "duration": session["duration"],
        "started_at_ms": session["started_at_ms"],
        "round_id": session["round_id"],
    }


@router.post("/{code}/timer/start")
async def start_timer(code: str, body: StartTimerRequest, user=Depends(get_auth_user)):
    db = get_db()
    room = db.rooms.find_one({"code": code.upper()})
    if not room:
        raise HTTPException(status_code=404, detail="Sala não encontrada")
    if user["id"] != room["host_id"]:
        raise HTTPException(status_code=403, detail="Apenas o líder pode iniciar o timer")
    duration = max(5, min(60, body.duration))
    round_id = body.round_id
    if room.get("active_timer"):
        db.timer_sessions.update_one({"_id": room["active_timer"]}, {"$set": {"ended": True}})
    session_id = secrets.token_hex(8)
    started_at_ms = int(time.time() * 1000)
    db.timer_sessions.insert_one({
        "_id": session_id,
        "room_code": code.upper(),
        "round_id": round_id,
        "duration": duration,
        "started_at_ms": started_at_ms,
        "ended": False,
    })
    db.rooms.update_one({"_id": room["_id"]}, {"$set": {"active_timer": session_id}})
    await sio.emit(
        "timer_started",
        {
            "session_id": session_id,
            "duration": duration,
            "started_at_ms": started_at_ms,
            "round_id": round_id,
        },
        room=code.upper(),
    )

    async def run() -> None:
        await asyncio.sleep(duration)
        await _end_timer(session_id, code.upper())

    asyncio.create_task(run())
    return {"ok": True, "session_id": session_id, "started_at_ms": started_at_ms}


@router.post("/{code}/timer/answer")
def save_timer_answer(code: str, body: SaveAnswerRequest, user=Depends(get_auth_user)):
    db = get_db()
    session = db.timer_sessions.find_one({"_id": body.session_id})
    if not session or session["ended"] or session["room_code"] != code.upper():
        raise HTTPException(status_code=400, detail="Sessão inválida")
    db.answers.update_one(
        {"session_id": body.session_id, "user_id": user["id"]},
        {"$set": {"session_id": body.session_id, "user_id": user["id"], "text": body.text}},
        upsert=True,
    )
    return {"ok": True}
