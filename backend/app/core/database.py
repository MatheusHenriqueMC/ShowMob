import secrets
import string
from datetime import datetime
from typing import Optional

from pymongo import MongoClient, ASCENDING, ReturnDocument
from pymongo.database import Database
from werkzeug.security import generate_password_hash

from app.core.config import settings

COLORS = [
    "#00BFFF", "#FF4500", "#FFD700", "#7CFC00", "#FF69B4", "#DA70D6",
    "#00FFD0", "#FF8C00", "#FF1493", "#1E90FF", "#ADFF2F", "#FF6347",
]

_client: Optional[MongoClient] = None
_db: Optional[Database] = None


def init_db_connection() -> None:
    global _client, _db
    _client = MongoClient(settings.MONGO_URI)
    _db = _client[settings.MONGO_DB]


def close_db_connection() -> None:
    global _client
    if _client:
        _client.close()


def get_db() -> Database:
    return _db  # type: ignore[return-value]


def now() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def gen_code() -> str:
    chars = string.ascii_uppercase + string.digits
    return "".join(secrets.choice(chars) for _ in range(6))


def doc_to_dict(doc) -> Optional[dict]:
    if doc is None:
        return None
    d = dict(doc)
    if "_id" in d:
        d["id"] = d.pop("_id")
    return d


def get_next_id(name: str) -> int:
    db = get_db()
    doc = db.counters.find_one_and_update(
        {"_id": name},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )
    return doc["seq"]


def get_room_members(room_id: int) -> list[dict]:
    db = get_db()
    user_ids = [m["user_id"] for m in db.room_members.find({"room_id": room_id})]
    result = []
    for u in db.users.find({"_id": {"$in": user_ids}}):
        result.append({
            "id": u["_id"],
            "display_name": u.get("display_name") or u["username"],
            "avatar": u.get("avatar"),
            "color": u["color"],
        })
    return result


def get_rounds_data(room_id: int) -> list[dict]:
    db = get_db()
    rounds = list(db.rounds.find({"room_id": room_id}).sort("number", -1))
    if not rounds:
        return []
    round_ids = [r["_id"] for r in rounds]
    all_scores = list(db.scores.find({"round_id": {"$in": round_ids}}))
    user_ids = list({s["user_id"] for s in all_scores})
    users = {u["_id"]: u for u in db.users.find({"_id": {"$in": user_ids}})}
    scores_by_round: dict = {}
    for s in all_scores:
        u = users.get(s["user_id"], {})
        scores_by_round.setdefault(s["round_id"], {})[str(s["user_id"])] = {
            "points": s["points"],
            "name": u.get("display_name") or u.get("username", ""),
            "color": u.get("color"),
        }
    return [
        {
            "id": r["_id"],
            "number": r["number"],
            "title": r.get("title"),
            "created_at": r["created_at"],
            "video_id": r.get("video_id") or None,
            "video_state": r.get("video_state") or None,
            "scores": scores_by_round.get(r["_id"], {}),
        }
        for r in rounds
    ]


def get_totals_data(room_id: int) -> list[dict]:
    db = get_db()
    user_ids = [m["user_id"] for m in db.room_members.find({"room_id": room_id})]
    users = {u["_id"]: u for u in db.users.find({"_id": {"$in": user_ids}})}
    round_ids = [r["_id"] for r in db.rounds.find({"room_id": room_id}, {"_id": 1})]
    totals = {
        doc["_id"]: doc["total"]
        for doc in db.scores.aggregate([
            {"$match": {"round_id": {"$in": round_ids}, "user_id": {"$in": user_ids}}},
            {"$group": {"_id": "$user_id", "total": {"$sum": "$points"}}},
        ])
    }
    result = [
        {
            "id": uid,
            "name": users[uid].get("display_name") or users[uid]["username"],
            "avatar": users[uid].get("avatar"),
            "color": users[uid]["color"],
            "total": totals.get(uid, 0),
        }
        for uid in user_ids if uid in users
    ]
    result.sort(key=lambda x: x["total"], reverse=True)
    return result


def init_db() -> None:
    db = get_db()
    db.users.create_index(
        [("username", ASCENDING)], unique=True, collation={"locale": "en", "strength": 2}
    )
    db.rooms.create_index([("code", ASCENDING)], unique=True)
    db.room_members.create_index(
        [("room_id", ASCENDING), ("user_id", ASCENDING)], unique=True
    )
    db.room_members.create_index([("room_id", ASCENDING)])
    db.rounds.create_index([("room_id", ASCENDING)])
    db.scores.create_index(
        [("round_id", ASCENDING), ("user_id", ASCENDING)], unique=True
    )
    db.answers.create_index(
        [("session_id", ASCENDING), ("user_id", ASCENDING)], unique=True
    )

    db.timer_sessions.update_many({"ended": False}, {"$set": {"ended": True}})
    db.rooms.update_many({"active_timer": {"$exists": True}}, {"$unset": {"active_timer": ""}})

    for cname in ("users", "rooms", "rounds", "scores"):
        top = db[cname].find_one({}, sort=[("_id", -1)])
        max_id = top["_id"] if top else 0
        db.counters.update_one({"_id": cname}, {"$max": {"seq": max_id}}, upsert=True)

    if not db.users.find_one({"role": "admin"}):
        admin_id = get_next_id("users")
        db.users.insert_one({
            "_id": admin_id,
            "username": "admin",
            "password_hash": generate_password_hash("admin123"),
            "role": "admin",
            "display_name": "Admin",
            "avatar": None,
            "color": "#FF4500",
            "created_at": now(),
        })
