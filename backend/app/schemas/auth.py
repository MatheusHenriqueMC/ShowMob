from pydantic import BaseModel
from typing import Optional


class LoginRequest(BaseModel):
    username: str
    password: str


class UpdateProfileRequest(BaseModel):
    display_name: Optional[str] = None
    avatar: Optional[str] = None
    color: Optional[str] = None
