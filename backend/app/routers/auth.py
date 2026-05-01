import secrets

from fastapi import APIRouter, Depends, HTTPException
from werkzeug.security import check_password_hash

from app.core.database import get_db, doc_to_dict
from app.core.dependencies import _get_token, get_auth_user
from app.schemas.auth import LoginRequest, UpdateProfileRequest

router = APIRouter()


def user_pub(u: dict) -> dict:
    return {
        "id": u["id"],
        "username": u["username"],
        "role": u["role"],
        "display_name": u["display_name"] or u["username"],
        "avatar": u["avatar"],
        "color": u["color"],
    }


@router.post("/login")
def login(body: LoginRequest):
    db = get_db()
    username = body.username.strip()
    user_doc = db.users.find_one(
        {"username": username},
        collation={"locale": "en", "strength": 2},
    )
    if not user_doc or not check_password_hash(user_doc["password_hash"], body.password):
        raise HTTPException(status_code=401, detail="Usuário ou senha inválidos")
    token = secrets.token_hex(32)
    db.tokens.insert_one({"_id": token, "user_id": user_doc["_id"]})
    return {"token": token, "user": user_pub(doc_to_dict(user_doc))}


@router.post("/logout")
def logout(token: str = Depends(_get_token)):
    if token:
        get_db().tokens.delete_one({"_id": token})
    return {"ok": True}


@router.get("/me")
def me(user=Depends(get_auth_user)):
    return user_pub(user)


@router.patch("/profile")
def update_profile(body: UpdateProfileRequest, user=Depends(get_auth_user)):
    db = get_db()
    display_name = (body.display_name or "").strip() or user["display_name"] or user["username"]
    avatar = body.avatar if body.avatar is not None else user["avatar"]
    color = body.color if body.color is not None else user["color"]
    db.users.update_one(
        {"_id": user["id"]},
        {"$set": {"display_name": display_name, "avatar": avatar, "color": color}},
    )
    return {"ok": True, "display_name": display_name, "avatar": avatar, "color": color}
