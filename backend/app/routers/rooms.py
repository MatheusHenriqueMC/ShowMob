from fastapi import APIRouter, Depends, HTTPException

from app.core.database import get_db, get_next_id, gen_code, now, get_room_members
from app.core.dependencies import get_auth_user
from app.core.helpers import push_state
from app.core.socket import emit_sync
from app.schemas.rooms import CreateRoomRequest, JoinRoomRequest

router = APIRouter()


@router.post("", status_code=201)
def create_room(body: CreateRoomRequest, user=Depends(get_auth_user)):
    db = get_db()
    name = (body.name or "").strip() or "Sala sem nome"
    code = ""
    for _ in range(10):
        code = gen_code()
        if not db.rooms.find_one({"code": code}):
            break
    room_id = get_next_id("rooms")
    db.rooms.insert_one({
        "_id": room_id,
        "code": code,
        "name": name,
        "host_id": user["id"],
        "created_at": now(),
    })
    db.room_members.update_one(
        {"room_id": room_id, "user_id": user["id"]},
        {"$setOnInsert": {"room_id": room_id, "user_id": user["id"]}},
        upsert=True,
    )
    return {"id": room_id, "code": code, "name": name, "host_id": user["id"]}


@router.post("/join")
def join_room(body: JoinRoomRequest, user=Depends(get_auth_user)):
    db = get_db()
    code = body.code.strip().upper()
    room = db.rooms.find_one({"code": code})
    if not room:
        raise HTTPException(status_code=404, detail="Sala não encontrada")
    room_id = room["_id"]
    db.room_members.update_one(
        {"room_id": room_id, "user_id": user["id"]},
        {"$setOnInsert": {"room_id": room_id, "user_id": user["id"]}},
        upsert=True,
    )
    for r in db.rounds.find({"room_id": room_id}, {"_id": 1}):
        db.scores.update_one(
            {"round_id": r["_id"], "user_id": user["id"]},
            {"$setOnInsert": {"round_id": r["_id"], "user_id": user["id"], "points": 0}},
            upsert=True,
        )
    members = get_room_members(room_id)
    emit_sync("members_updated", {"members": members}, room=code)
    push_state(code, room_id)
    return {"id": room_id, "code": room["code"], "name": room["name"], "host_id": room["host_id"]}


@router.get("/{code}")
def get_room(code: str, user=Depends(get_auth_user)):
    db = get_db()
    room = db.rooms.find_one({"code": code.upper()})
    if not room:
        raise HTTPException(status_code=404, detail="Sala não encontrada")
    members = get_room_members(room["_id"])
    return {
        "id": room["_id"],
        "code": room["code"],
        "name": room["name"],
        "host_id": room["host_id"],
        "members": members,
    }
