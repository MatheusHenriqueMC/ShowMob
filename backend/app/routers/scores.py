from fastapi import APIRouter, Depends, HTTPException

from app.core.database import get_db
from app.core.dependencies import get_auth_user
from app.core.helpers import push_state

router = APIRouter()


@router.post("/{code}/scores/{rid}/{uid}/increment")
def increment_score(code: str, rid: int, uid: int, user=Depends(get_auth_user)):
    db = get_db()
    room = db.rooms.find_one({"code": code.upper()})
    if not room:
        raise HTTPException(status_code=404, detail="Sala não encontrada")
    if user["id"] != room["host_id"]:
        raise HTTPException(status_code=403, detail="Apenas o líder pode pontuar")
    db.scores.update_one({"round_id": rid, "user_id": uid}, {"$inc": {"points": 1}})
    score = db.scores.find_one({"round_id": rid, "user_id": uid})
    pts = score["points"] if score else 0
    push_state(code, room["_id"])
    return {"points": pts}


@router.post("/{code}/scores/{rid}/{uid}/decrement")
def decrement_score(code: str, rid: int, uid: int, user=Depends(get_auth_user)):
    db = get_db()
    room = db.rooms.find_one({"code": code.upper()})
    if not room:
        raise HTTPException(status_code=404, detail="Sala não encontrada")
    if user["id"] != room["host_id"]:
        raise HTTPException(status_code=403, detail="Apenas o líder pode pontuar")
    db.scores.update_one(
        {"round_id": rid, "user_id": uid, "points": {"$gt": 0}},
        {"$inc": {"points": -1}},
    )
    score = db.scores.find_one({"round_id": rid, "user_id": uid})
    pts = score["points"] if score else 0
    push_state(code, room["_id"])
    return {"points": pts}
