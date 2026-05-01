import asyncio
from contextlib import asynccontextmanager

import socketio
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.database import init_db_connection, init_db, close_db_connection
from app.core.socket import sio, set_loop
from app.routers import auth, users, rooms, rounds, scores, timer
from app.routers import events  # noqa: F401 — registers socket event handlers


@asynccontextmanager
async def lifespan(app: FastAPI):
    set_loop(asyncio.get_running_loop())
    init_db_connection()
    init_db()
    yield
    close_db_connection()


app = FastAPI(lifespan=lifespan, redirect_slashes=False)

origins = settings.allowed_origins_list
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=(origins != ["*"]),
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(users.router, prefix="/api/users", tags=["users"])
app.include_router(rooms.router, prefix="/api/rooms", tags=["rooms"])
app.include_router(rounds.router, prefix="/api/rooms", tags=["rounds"])
app.include_router(scores.router, prefix="/api/rooms", tags=["scores"])
app.include_router(timer.router, prefix="/api/rooms", tags=["timer"])

socket_app = socketio.ASGIApp(sio, other_asgi_app=app)
