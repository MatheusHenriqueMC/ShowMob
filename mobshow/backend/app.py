from flask import Flask, jsonify, request
from flask_cors import CORS
from flask_socketio import SocketIO, join_room as sio_join, leave_room as sio_leave
from werkzeug.security import generate_password_hash, check_password_hash
from pymongo import MongoClient, ASCENDING, ReturnDocument
from pymongo.errors import DuplicateKeyError
import os, secrets, string, time
from datetime import datetime

app = Flask(__name__)
app.config['SECRET_KEY'] = os.environ.get("SECRET_KEY", secrets.token_hex(32))
CORS(app, resources={r"/*": {"origins": "*"}})
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='threading')

MONGO_URI = os.environ.get("MONGO_URI", "mongodb://localhost:27017")
MONGO_DB_NAME = os.environ.get("MONGO_DB", "mobshow")
COLORS = ['#00BFFF','#FF4500','#FFD700','#7CFC00','#FF69B4','#DA70D6','#00FFD0','#FF8C00',
          '#FF1493','#1E90FF','#ADFF2F','#FF6347']

_client = MongoClient(MONGO_URI)
db = _client[MONGO_DB_NAME]


def now():
    return datetime.now().strftime('%Y-%m-%d %H:%M:%S')


def get_next_id(name):
    doc = db.counters.find_one_and_update(
        {'_id': name},
        {'$inc': {'seq': 1}},
        upsert=True,
        return_document=ReturnDocument.AFTER
    )
    return doc['seq']


def init_db():
    db.users.create_index([('username', ASCENDING)], unique=True,
                          collation={'locale': 'en', 'strength': 2})
    db.rooms.create_index([('code', ASCENDING)], unique=True)
    db.room_members.create_index([('room_id', ASCENDING), ('user_id', ASCENDING)], unique=True)
    db.scores.create_index([('round_id', ASCENDING), ('user_id', ASCENDING)], unique=True)
    db.answers.create_index([('session_id', ASCENDING), ('user_id', ASCENDING)], unique=True)

    # Clean up any in-progress timer sessions from a previous server run
    db.timer_sessions.update_many({'ended': False}, {'$set': {'ended': True}})
    db.rooms.update_many({'active_timer': {'$exists': True}}, {'$unset': {'active_timer': ''}})

    # Sync counters to current max IDs so restarts don't reset sequences
    for cname in ('users', 'rooms', 'rounds', 'scores'):
        top = db[cname].find_one({}, sort=[('_id', -1)])
        max_id = top['_id'] if top else 0
        db.counters.update_one({'_id': cname}, {'$max': {'seq': max_id}}, upsert=True)

    if not db.users.find_one({'role': 'admin'}):
        admin_id = get_next_id('users')
        db.users.insert_one({
            '_id': admin_id,
            'username': 'admin',
            'password_hash': generate_password_hash('admin123'),
            'role': 'admin',
            'display_name': 'Admin',
            'avatar': None,
            'color': '#FF4500',
            'created_at': now()
        })


init_db()


def gen_code():
    chars = string.ascii_uppercase + string.digits
    return ''.join(secrets.choice(chars) for _ in range(6))


def get_token_str():
    auth = request.headers.get('Authorization', '')
    return auth[7:] if auth.startswith('Bearer ') else None


def doc_to_dict(doc):
    if doc is None:
        return None
    d = dict(doc)
    if '_id' in d:
        d['id'] = d.pop('_id')
    return d


def get_current_user():
    token = get_token_str()
    if not token:
        return None
    tok = db.tokens.find_one({'_id': token})
    if not tok:
        return None
    return doc_to_dict(db.users.find_one({'_id': tok['user_id']}))


def user_pub(u):
    return {
        "id": u['id'],
        "username": u['username'],
        "role": u['role'],
        "display_name": u['display_name'] or u['username'],
        "avatar": u['avatar'],
        "color": u['color'],
    }


def get_room_members(room_id):
    user_ids = [m['user_id'] for m in db.room_members.find({'room_id': room_id})]
    result = []
    for u in db.users.find({'_id': {'$in': user_ids}}):
        result.append({
            "id": u['_id'],
            "display_name": u.get('display_name') or u['username'],
            "avatar": u.get('avatar'),
            "color": u['color']
        })
    return result


def get_rounds_data(room_id):
    rounds = list(db.rounds.find({'room_id': room_id}).sort('number', -1))
    result = []
    for r in rounds:
        scores = list(db.scores.find({'round_id': r['_id']}))
        users = {u['_id']: u for u in db.users.find({'_id': {'$in': [s['user_id'] for s in scores]}})}
        result.append({
            "id": r['_id'],
            "number": r['number'],
            "title": r.get('title'),
            "created_at": r['created_at'],
            "scores": {
                str(s['user_id']): {
                    "points": s['points'],
                    "name": users.get(s['user_id'], {}).get('display_name') or users.get(s['user_id'], {}).get('username', ''),
                    "avatar": users.get(s['user_id'], {}).get('avatar'),
                    "color": users.get(s['user_id'], {}).get('color'),
                }
                for s in scores
            }
        })
    return result


def get_totals_data(room_id):
    user_ids = [m['user_id'] for m in db.room_members.find({'room_id': room_id})]
    users = {u['_id']: u for u in db.users.find({'_id': {'$in': user_ids}})}
    round_ids = [r['_id'] for r in db.rounds.find({'room_id': room_id}, {'_id': 1})]
    totals = {
        doc['_id']: doc['total']
        for doc in db.scores.aggregate([
            {'$match': {'round_id': {'$in': round_ids}, 'user_id': {'$in': user_ids}}},
            {'$group': {'_id': '$user_id', 'total': {'$sum': '$points'}}}
        ])
    }
    result = [
        {
            "id": uid,
            "name": users[uid].get('display_name') or users[uid]['username'],
            "avatar": users[uid].get('avatar'),
            "color": users[uid]['color'],
            "total": totals.get(uid, 0)
        }
        for uid in user_ids if uid in users
    ]
    result.sort(key=lambda x: x['total'], reverse=True)
    return result


def push_state(code, room_id):
    rounds = get_rounds_data(room_id)
    totals = get_totals_data(room_id)
    socketio.emit('state_update', {'rounds': rounds, 'totals': totals}, room=code.upper())


# ── Auth ──

@app.route('/api/auth/login', methods=['POST'])
def login():
    data = request.json or {}
    username = (data.get('username') or '').strip()
    password = data.get('password') or ''
    user_doc = db.users.find_one(
        {'username': username},
        collation={'locale': 'en', 'strength': 2}
    )
    if not user_doc or not check_password_hash(user_doc['password_hash'], password):
        return jsonify({"error": "Usuário ou senha inválidos"}), 401
    token = secrets.token_hex(32)
    db.tokens.insert_one({'_id': token, 'user_id': user_doc['_id']})
    return jsonify({"token": token, "user": user_pub(doc_to_dict(user_doc))})


@app.route('/api/auth/logout', methods=['POST'])
def logout():
    token = get_token_str()
    if token:
        db.tokens.delete_one({'_id': token})
    return jsonify({"ok": True})


@app.route('/api/auth/me', methods=['GET'])
def me():
    user = get_current_user()
    if not user:
        return jsonify({"error": "Não autenticado"}), 401
    return jsonify(user_pub(user))


@app.route('/api/auth/profile', methods=['PATCH'])
def update_profile():
    user = get_current_user()
    if not user:
        return jsonify({"error": "Não autenticado"}), 401
    data = request.json or {}
    display_name = (data.get('display_name') or '').strip() or user['display_name'] or user['username']
    avatar = data.get('avatar', user['avatar'])
    color = data.get('color', user['color'])
    db.users.update_one({'_id': user['id']}, {'$set': {'display_name': display_name, 'avatar': avatar, 'color': color}})
    return jsonify({"ok": True, "display_name": display_name, "avatar": avatar, "color": color})


# ── Admin: Users ──

@app.route('/api/users', methods=['GET'])
def list_users():
    user = get_current_user()
    if not user or user['role'] != 'admin':
        return jsonify({"error": "Acesso negado"}), 403
    result = [doc_to_dict(u) for u in db.users.find({}, {'password_hash': 0}).sort('_id', ASCENDING)]
    return jsonify(result)


@app.route('/api/users', methods=['POST'])
def create_user():
    user = get_current_user()
    if not user or user['role'] != 'admin':
        return jsonify({"error": "Acesso negado"}), 403
    data = request.json or {}
    username = (data.get('username') or '').strip()
    password = data.get('password') or ''
    role = data.get('role', 'user')
    if not username or not password:
        return jsonify({"error": "Usuário e senha obrigatórios"}), 400
    if role not in ('user', 'admin'):
        role = 'user'
    count = db.users.count_documents({})
    color = COLORS[count % len(COLORS)]
    new_id = get_next_id('users')
    try:
        db.users.insert_one({
            '_id': new_id,
            'username': username,
            'password_hash': generate_password_hash(password),
            'role': role,
            'display_name': username,
            'avatar': None,
            'color': color,
            'created_at': now()
        })
    except DuplicateKeyError:
        return jsonify({"error": "Usuário já existe"}), 409
    return jsonify({"id": new_id, "username": username, "role": role, "color": color}), 201


@app.route('/api/users/<int:uid>', methods=['DELETE'])
def delete_user(uid):
    user = get_current_user()
    if not user or user['role'] != 'admin':
        return jsonify({"error": "Acesso negado"}), 403
    if uid == user['id']:
        return jsonify({"error": "Não pode deletar a si mesmo"}), 400
    db.tokens.delete_many({'user_id': uid})
    db.room_members.delete_many({'user_id': uid})
    db.scores.delete_many({'user_id': uid})
    db.users.delete_one({'_id': uid})
    return jsonify({"ok": True})


@app.route('/api/users/<int:uid>/password', methods=['PATCH'])
def reset_password(uid):
    user = get_current_user()
    if not user or user['role'] != 'admin':
        return jsonify({"error": "Acesso negado"}), 403
    data = request.json or {}
    password = data.get('password') or ''
    if not password:
        return jsonify({"error": "Senha obrigatória"}), 400
    db.users.update_one({'_id': uid}, {'$set': {'password_hash': generate_password_hash(password)}})
    return jsonify({"ok": True})


# ── Rooms ──

@app.route('/api/rooms', methods=['POST'])
def create_room():
    user = get_current_user()
    if not user:
        return jsonify({"error": "Não autenticado"}), 401
    data = request.json or {}
    name = (data.get('name') or '').strip() or 'Sala sem nome'
    for _ in range(10):
        code = gen_code()
        if not db.rooms.find_one({'code': code}):
            break
    room_id = get_next_id('rooms')
    db.rooms.insert_one({'_id': room_id, 'code': code, 'name': name, 'host_id': user['id'], 'created_at': now()})
    db.room_members.update_one(
        {'room_id': room_id, 'user_id': user['id']},
        {'$setOnInsert': {'room_id': room_id, 'user_id': user['id']}},
        upsert=True
    )
    return jsonify({"id": room_id, "code": code, "name": name, "host_id": user['id']}), 201


@app.route('/api/rooms/join', methods=['POST'])
def join_room_api():
    user = get_current_user()
    if not user:
        return jsonify({"error": "Não autenticado"}), 401
    data = request.json or {}
    code = (data.get('code') or '').strip().upper()
    room = db.rooms.find_one({'code': code})
    if not room:
        return jsonify({"error": "Sala não encontrada"}), 404
    room_id = room['_id']
    db.room_members.update_one(
        {'room_id': room_id, 'user_id': user['id']},
        {'$setOnInsert': {'room_id': room_id, 'user_id': user['id']}},
        upsert=True
    )
    members = get_room_members(room_id)
    socketio.emit('members_updated', {'members': members}, room=code)
    return jsonify({"id": room_id, "code": room['code'], "name": room['name'], "host_id": room['host_id']})


@app.route('/api/rooms/<string:code>', methods=['GET'])
def get_room(code):
    user = get_current_user()
    if not user:
        return jsonify({"error": "Não autenticado"}), 401
    room = db.rooms.find_one({'code': code.upper()})
    if not room:
        return jsonify({"error": "Sala não encontrada"}), 404
    members = get_room_members(room['_id'])
    return jsonify({"id": room['_id'], "code": room['code'], "name": room['name'],
                    "host_id": room['host_id'], "members": members})


# ── Rounds ──

@app.route('/api/rooms/<string:code>/rounds', methods=['GET'])
def get_rounds(code):
    user = get_current_user()
    if not user:
        return jsonify({"error": "Não autenticado"}), 401
    room = db.rooms.find_one({'code': code.upper()})
    if not room:
        return jsonify({"error": "Sala não encontrada"}), 404
    return jsonify(get_rounds_data(room['_id']))


@app.route('/api/rooms/<string:code>/rounds', methods=['POST'])
def create_round(code):
    user = get_current_user()
    if not user:
        return jsonify({"error": "Não autenticado"}), 401
    room = db.rooms.find_one({'code': code.upper()})
    if not room:
        return jsonify({"error": "Sala não encontrada"}), 404
    room_id = room['_id']
    last_round = db.rounds.find_one({'room_id': room_id}, sort=[('number', -1)])
    last_number = last_round['number'] if last_round else 0
    rid = get_next_id('rounds')
    db.rounds.insert_one({'_id': rid, 'room_id': room_id, 'number': last_number + 1,
                          'title': None, 'created_at': now()})
    for m in db.room_members.find({'room_id': room_id}):
        db.scores.update_one(
            {'round_id': rid, 'user_id': m['user_id']},
            {'$setOnInsert': {'round_id': rid, 'user_id': m['user_id'], 'points': 0}},
            upsert=True
        )
    push_state(code, room_id)
    return jsonify({"id": rid, "number": last_number + 1}), 201


@app.route('/api/rooms/<string:code>/rounds/<int:rid>', methods=['PATCH'])
def update_round(code, rid):
    user = get_current_user()
    if not user:
        return jsonify({"error": "Não autenticado"}), 401
    data = request.json or {}
    title = data.get('title', '')
    room = db.rooms.find_one({'code': code.upper()})
    db.rounds.update_one({'_id': rid}, {'$set': {'title': title or None}})
    push_state(code, room['_id'])
    return jsonify({"ok": True})


@app.route('/api/rooms/<string:code>/rounds/<int:rid>', methods=['DELETE'])
def delete_round(code, rid):
    user = get_current_user()
    if not user:
        return jsonify({"error": "Não autenticado"}), 401
    room = db.rooms.find_one({'code': code.upper()})
    db.scores.delete_many({'round_id': rid})
    db.rounds.delete_one({'_id': rid})
    push_state(code, room['_id'])
    return jsonify({"ok": True})


# ── Scores ──

@app.route('/api/rooms/<string:code>/scores/<int:rid>/<int:uid>/increment', methods=['POST'])
def increment_score(code, rid, uid):
    user = get_current_user()
    if not user:
        return jsonify({"error": "Não autenticado"}), 401
    room = db.rooms.find_one({'code': code.upper()})
    if not room:
        return jsonify({"error": "Sala não encontrada"}), 404
    if user['id'] != room['host_id']:
        return jsonify({"error": "Apenas o líder pode pontuar"}), 403
    db.scores.update_one({'round_id': rid, 'user_id': uid}, {'$inc': {'points': 1}})
    score = db.scores.find_one({'round_id': rid, 'user_id': uid})
    pts = score['points'] if score else 0
    push_state(code, room['_id'])
    return jsonify({"points": pts})


@app.route('/api/rooms/<string:code>/scores/<int:rid>/<int:uid>/decrement', methods=['POST'])
def decrement_score(code, rid, uid):
    user = get_current_user()
    if not user:
        return jsonify({"error": "Não autenticado"}), 401
    room = db.rooms.find_one({'code': code.upper()})
    if not room:
        return jsonify({"error": "Sala não encontrada"}), 404
    if user['id'] != room['host_id']:
        return jsonify({"error": "Apenas o líder pode pontuar"}), 403
    db.scores.update_one(
        {'round_id': rid, 'user_id': uid, 'points': {'$gt': 0}},
        {'$inc': {'points': -1}}
    )
    score = db.scores.find_one({'round_id': rid, 'user_id': uid})
    pts = score['points'] if score else 0
    push_state(code, room['_id'])
    return jsonify({"points": pts})


# ── Totals ──

@app.route('/api/rooms/<string:code>/totals', methods=['GET'])
def get_totals(code):
    user = get_current_user()
    if not user:
        return jsonify({"error": "Não autenticado"}), 401
    room = db.rooms.find_one({'code': code.upper()})
    if not room:
        return jsonify({"error": "Sala não encontrada"}), 404
    return jsonify(get_totals_data(room['_id']))


# ── Timer ──

def _end_timer(session_id, room_code):
    session = db.timer_sessions.find_one({'_id': session_id})
    if not session or session['ended']:
        return
    db.timer_sessions.update_one({'_id': session_id}, {'$set': {'ended': True}})
    db.rooms.update_one({'code': room_code}, {'$unset': {'active_timer': ''}})
    room = db.rooms.find_one({'code': room_code})
    if not room:
        return
    member_ids = [m['user_id'] for m in db.room_members.find({'room_id': room['_id']})]
    stored = {a['user_id']: a['text'] for a in db.answers.find({'session_id': session_id})}
    answer_list = [{'user_id': uid, 'text': stored.get(uid) or 'X - X'} for uid in member_ids]
    socketio.emit('timer_ended', {
        'session_id': session_id,
        'round_id': session['round_id'],
        'answers': answer_list
    }, room=room_code)


@app.route('/api/rooms/<string:code>/timer', methods=['GET'])
def get_timer(code):
    user = get_current_user()
    if not user:
        return jsonify({"error": "Não autenticado"}), 401
    room = db.rooms.find_one({'code': code.upper()})
    if not room or 'active_timer' not in room:
        return jsonify({"active": False})
    session = db.timer_sessions.find_one({'_id': room['active_timer']})
    if not session or session['ended']:
        return jsonify({"active": False})
    # Safety: auto-end if server thread died and timer has already expired
    if session['started_at_ms'] + session['duration'] * 1000 < int(time.time() * 1000):
        _end_timer(session['_id'], code.upper())
        return jsonify({"active": False})
    return jsonify({
        "active": True,
        "session_id": session['_id'],
        "duration": session['duration'],
        "started_at_ms": session['started_at_ms'],
        "round_id": session['round_id']
    })


@app.route('/api/rooms/<string:code>/timer/start', methods=['POST'])
def start_timer(code):
    user = get_current_user()
    if not user:
        return jsonify({"error": "Não autenticado"}), 401
    room = db.rooms.find_one({'code': code.upper()})
    if not room:
        return jsonify({"error": "Sala não encontrada"}), 404
    if user['id'] != room['host_id']:
        return jsonify({"error": "Apenas o líder pode iniciar o timer"}), 403
    data = request.json or {}
    round_id = data.get('round_id')
    duration = max(5, min(60, int(data.get('duration', 30))))
    # Cancel any existing active timer
    if room.get('active_timer'):
        db.timer_sessions.update_one({'_id': room['active_timer']}, {'$set': {'ended': True}})
    session_id = secrets.token_hex(8)
    started_at_ms = int(time.time() * 1000)
    db.timer_sessions.insert_one({
        '_id': session_id,
        'room_code': code.upper(),
        'round_id': round_id,
        'duration': duration,
        'started_at_ms': started_at_ms,
        'ended': False
    })
    db.rooms.update_one({'_id': room['_id']}, {'$set': {'active_timer': session_id}})
    socketio.emit('timer_started', {
        'session_id': session_id,
        'duration': duration,
        'started_at_ms': started_at_ms,
        'round_id': round_id
    }, room=code.upper())
    def run():
        time.sleep(duration)
        _end_timer(session_id, code.upper())
    socketio.start_background_task(run)
    return jsonify({"ok": True, "session_id": session_id, "started_at_ms": started_at_ms})


@app.route('/api/rooms/<string:code>/timer/answer', methods=['POST'])
def save_timer_answer(code):
    user = get_current_user()
    if not user:
        return jsonify({"error": "Não autenticado"}), 401
    data = request.json or {}
    session_id = data.get('session_id', '')
    text = data.get('text') or ''
    session = db.timer_sessions.find_one({'_id': session_id})
    if not session or session['ended'] or session['room_code'] != code.upper():
        return jsonify({"error": "Sessão inválida"}), 400
    db.answers.update_one(
        {'session_id': session_id, 'user_id': user['id']},
        {'$set': {'session_id': session_id, 'user_id': user['id'], 'text': text}},
        upsert=True
    )
    return jsonify({"ok": True})


# ── Socket.IO ──

@socketio.on('join_room')
def handle_join(data):
    code = (data.get('code') or '').upper()
    sio_join(code)


@socketio.on('leave_room')
def handle_leave(data):
    code = (data.get('code') or '').upper()
    sio_leave(code)


@socketio.on('typing_indicator')
def handle_typing(data):
    code = (data.get('code') or '').upper()
    socketio.emit('typing_update', {
        'user_id': data.get('user_id'),
        'is_typing': bool(data.get('is_typing', False)),
        'session_id': data.get('session_id', '')
    }, room=code)


if __name__ == "__main__":
    socketio.run(app, host="0.0.0.0", port=5000, debug=False, allow_unsafe_werkzeug=True)
