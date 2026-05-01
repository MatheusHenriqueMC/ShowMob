from pydantic import BaseModel
from typing import Optional


class StartTimerRequest(BaseModel):
    round_id: Optional[int] = None
    duration: int = 30


class SaveAnswerRequest(BaseModel):
    session_id: str
    text: str = ""
