from fastapi import APIRouter, Depends, HTTPException
from pymongo import ASCENDING
from pymongo.errors import DuplicateKeyError
from werkzeug.security import generate_password_hash

from app.core.database import get_db, doc_to_dict, get_next_id, now, COLORS
from app.core.dependencies import get_admin_user, get_auth_user
from app.schemas.users import CreateUserRequest, ResetPasswordRequest

router = APIRouter()


@router.get("/")
def list_users(user=Depends(get_admin_user)):
    db = get_db()
    result = [
        doc_to_dict(u)
        for u in db.users.find({}, {"password_hash": 0}).sort("_id", ASCENDING)
    ]
    return result


@router.post("/", status_code=201)
def create_user(body: CreateUserRequest, user=Depends(get_admin_user)):
    db = get_db()
    username = body.username.strip()
    password = body.password
    role = body.role if body.role in ("user", "admin") else "user"
    if not username or not password:
        raise HTTPException(status_code=400, detail="Usuário e senha obrigatórios")
    count = db.users.count_documents({})
    color = COLORS[count % len(COLORS)]
    new_id = get_next_id("users")
    try:
        db.users.insert_one({
            "_id": new_id,
            "username": username,
            "password_hash": generate_password_hash(password),
            "role": role,
            "display_name": username,
            "avatar": None,
            "color": color,
            "created_at": now(),
        })
    except DuplicateKeyError:
        raise HTTPException(status_code=409, detail="Usuário já existe")
    return {"id": new_id, "username": username, "role": role, "color": color}


@router.delete("/{uid}")
def delete_user(uid: int, user=Depends(get_admin_user)):
    db = get_db()
    if uid == user["id"]:
        raise HTTPException(status_code=400, detail="Não pode deletar a si mesmo")
    db.tokens.delete_many({"user_id": uid})
    db.room_members.delete_many({"user_id": uid})
    db.scores.delete_many({"user_id": uid})
    db.users.delete_one({"_id": uid})
    return {"ok": True}


@router.patch("/{uid}/password")
def reset_password(uid: int, body: ResetPasswordRequest, user=Depends(get_admin_user)):
    db = get_db()
    if not body.password:
        raise HTTPException(status_code=400, detail="Senha obrigatória")
    db.users.update_one(
        {"_id": uid},
        {"$set": {"password_hash": generate_password_hash(body.password)}},
    )
    return {"ok": True}
