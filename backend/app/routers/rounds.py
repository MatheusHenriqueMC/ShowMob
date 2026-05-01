from fastapi import APIRouter, Depends, HTTPException

from app.core.database import get_db, get_next_id, now, get_rounds_data
from app.core.dependencies import get_auth_user
from app.core.helpers import push_state
from app.schemas.rounds import UpdateRoundRequest

router = APIRouter()


@router.get("/{code}/rounds")
def get_rounds(code: str, user=Depends(get_auth_user)):
    db = get_db()
    room = db.rooms.find_one({"code": code.upper()})
    if not room:
        raise HTTPException(status_code=404, detail="Sala não encontrada")
    return get_rounds_data(room["_id"])


@router.post("/{code}/rounds", status_code=201)
def create_round(code: str, user=Depends(get_auth_user)):
    db = get_db()
    room = db.rooms.find_one({"code": code.upper()})
    if not room:
        raise HTTPException(status_code=404, detail="Sala não encontrada")
    room_id = room["_id"]
    last_round = db.rounds.find_one({"room_id": room_id}, sort=[("number", -1)])
    last_number = last_round["number"] if last_round else 0
    rid = get_next_id("rounds")
    db.rounds.insert_one({
        "_id": rid,
        "room_id": room_id,
        "number": last_number + 1,
        "title": None,
        "created_at": now(),
    })
    for m in db.room_members.find({"room_id": room_id}):
        db.scores.update_one(
            {"round_id": rid, "user_id": m["user_id"]},
            {"$setOnInsert": {"round_id": rid, "user_id": m["user_id"], "points": 0}},
            upsert=True,
        )
    push_state(code, room_id)
    return {"id": rid, "number": last_number + 1}


@router.patch("/{code}/rounds/{rid}")
def update_round(code: str, rid: int, body: UpdateRoundRequest, user=Depends(get_auth_user)):
    db = get_db()
    room = db.rooms.find_one({"code": code.upper()})
    if not room:
        raise HTTPException(status_code=404, detail="Sala não encontrada")
    db.rounds.update_one({"_id": rid}, {"$set": {"title": body.title or None}})
    push_state(code, room["_id"])
    return {"ok": True}


@router.delete("/{code}/rounds/{rid}")
def delete_round(code: str, rid: int, user=Depends(get_auth_user)):
    db = get_db()
    room = db.rooms.find_one({"code": code.upper()})
    if not room:
        raise HTTPException(status_code=404, detail="Sala não encontrada")
    db.scores.delete_many({"round_id": rid})
    db.rounds.delete_one({"_id": rid})
    push_state(code, room["_id"])
    return {"ok": True}
