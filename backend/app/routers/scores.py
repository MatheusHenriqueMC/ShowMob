from fastapi import APIRouter, Depends, HTTPException

from app.core.database import get_db, get_totals_data
from app.core.dependencies import get_auth_user

router = APIRouter()


@router.get("/{code}/totals")
def get_totals(code: str, user=Depends(get_auth_user)):
    db = get_db()
    room = db.rooms.find_one({"code": code.upper()})
    if not room:
        raise HTTPException(status_code=404, detail="Sala não encontrada")
    return get_totals_data(room["_id"])


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
    return {"points": score["points"] if score else 0}


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
    return {"points": score["points"] if score else 0}
