from fastapi import Header, HTTPException, Depends
from typing import Optional, Annotated

from app.core.database import get_db, doc_to_dict


def _get_token(authorization: Annotated[Optional[str], Header()] = None) -> Optional[str]:
    if authorization and authorization.startswith("Bearer "):
        return authorization[7:]
    return None


def get_optional_user(token: Optional[str] = Depends(_get_token)):
    if not token:
        return None
    db = get_db()
    tok = db.tokens.find_one({"_id": token})
    if not tok:
        return None
    return doc_to_dict(db.users.find_one({"_id": tok["user_id"]}))


def get_auth_user(user=Depends(get_optional_user)):
    if not user:
        raise HTTPException(status_code=401, detail="Não autenticado")
    return user


def get_admin_user(user=Depends(get_auth_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Acesso negado")
    return user
