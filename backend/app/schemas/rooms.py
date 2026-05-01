from pydantic import BaseModel
from typing import Optional


class CreateRoomRequest(BaseModel):
    name: Optional[str] = None


class JoinRoomRequest(BaseModel):
    code: str
