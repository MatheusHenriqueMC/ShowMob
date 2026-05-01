from pydantic import BaseModel
from typing import Optional


class UpdateRoundRequest(BaseModel):
    title: Optional[str] = None
