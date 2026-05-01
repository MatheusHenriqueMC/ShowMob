from pydantic import BaseModel


class CreateUserRequest(BaseModel):
    username: str
    password: str
    role: str = "user"


class ResetPasswordRequest(BaseModel):
    password: str
