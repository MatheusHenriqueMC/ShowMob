# MOBSHOW

Sistema de pontuação por rodadas em tempo real, com suporte a múltiplas salas, timer com respostas, vídeo sincronizado (YouTube) e placar ao vivo via WebSocket.

---

## Pré-requisitos

- [Docker](https://docs.docker.com/get-docker/) e [Docker Compose](https://docs.docker.com/compose/) instalados
- Portas **8000** e **3000** livres na máquina

---

## Subir com Docker Compose

### 1. Crie os arquivos de variáveis de ambiente

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

Edite `backend/.env` se necessário (os valores padrão funcionam para desenvolvimento local):

```env
MONGO_URI=mongodb://mongodb:27017   # nome do serviço no compose
MONGO_DB=mobshow
SECRET_KEY=troque-em-producao
ALLOWED_ORIGINS=http://localhost:3000
ENV=development
```

Edite `frontend/.env`:

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

### 2. Suba os containers

```bash
docker compose up -d --build
```

Aguarde o build do Next.js finalizar (primeira vez leva ~2 min). Acompanhe com:

```bash
docker compose logs -f
```

### 3. Acesse

| Serviço  | URL                        |
|----------|----------------------------|
| Frontend | http://localhost:3000      |
| Backend  | http://localhost:8000/docs |

### 4. Login inicial

Na primeira inicialização o sistema cria automaticamente um usuário administrador:

| Campo  | Valor     |
|--------|-----------|
| Usuário | `admin`  |
| Senha   | `admin123` |

> Crie os usuários jogadores pelo painel **⚙ Admin** após o primeiro login.

---

## Parar e limpar

```bash
# Para os containers (dados do MongoDB são preservados)
docker compose down

# Para e apaga o volume do banco (reseta tudo)
docker compose down -v
```

---

## Rodar em desenvolvimento local (sem Docker)

### Backend

```bash
cd backend

python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate

pip install -r requirements.txt

# Suba um MongoDB local (ou ajuste MONGO_URI para um Atlas/remoto)
cp .env.example .env

uvicorn app.main:socket_app --host 0.0.0.0 --port 8000 --reload
```

### Frontend

```bash
cd frontend

npm install

cp .env.example .env
# Edite NEXT_PUBLIC_API_URL=http://localhost:8000

npm run dev
```

Acesse **http://localhost:3000**.

---

## Arquitetura

```
ShowMob/
├── docker-compose.yml
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI app factory + socket_app (ASGI)
│   │   ├── core/
│   │   │   ├── config.py        # Settings via pydantic-settings
│   │   │   ├── database.py      # MongoDB client + utilitários
│   │   │   ├── socket.py        # socketio.AsyncServer singleton
│   │   │   ├── dependencies.py  # Injeção de dependência (auth)
│   │   │   └── helpers.py       # push_state() — broadcast via socket
│   │   ├── routers/
│   │   │   ├── auth.py          # /api/auth/*
│   │   │   ├── users.py         # /api/users/*
│   │   │   ├── rooms.py         # /api/rooms/*
│   │   │   ├── rounds.py        # /api/rooms/{code}/rounds/*
│   │   │   ├── scores.py        # /api/rooms/{code}/scores/*
│   │   │   ├── timer.py         # /api/rooms/{code}/timer/*
│   │   │   └── events.py        # Handlers Socket.IO
│   │   └── schemas/             # Pydantic v2 request/response models
│   ├── Dockerfile
│   ├── requirements.txt
│   └── .env.example
└── frontend/
    ├── src/
    │   ├── app/                 # Next.js 14 App Router
    │   │   ├── login/page.tsx
    │   │   ├── lobby/page.tsx
    │   │   └── room/[code]/page.tsx
    │   ├── components/          # Avatar, ProfileModal, AdminModal,
    │   │                        # WinnerPopup, TimerWidget, VideoSection
    │   ├── contexts/
    │   │   └── AuthContext.tsx  # Token/user state global
    │   └── lib/
    │       ├── api.ts           # fetch wrapper → NEXT_PUBLIC_API_URL
    │       ├── socket.ts        # socket.io-client singleton
    │       └── types.ts         # TypeScript interfaces compartilhadas
    ├── Dockerfile
    ├── package.json
    └── .env.example
```

### Stack

| Camada    | Tecnologia                                      |
|-----------|-------------------------------------------------|
| Backend   | Python 3.12, FastAPI, python-socketio (ASGI)    |
| Banco     | MongoDB 7 (volume Docker persistente)           |
| Auth      | Token Bearer (gerado no login, armazenado no MongoDB) |
| Realtime  | Socket.IO (WebSocket com fallback polling)      |
| Frontend  | Next.js 14, TypeScript strict, Tailwind CSS     |

---

## Funcionalidades

- **Autenticação** — login por usuário/senha, perfil com foto (JPG/PNG/GIF) e cor personalizada
- **Salas** — crie ou entre numa sala pelo código de 6 dígitos
- **Rodadas** — crie rodadas ilimitadas, dê título, pontue cada participante (+1 / −1)
- **Placar ao vivo** — todos os clientes veem os pontos atualizados em tempo real via WebSocket
- **Timer** — inicie uma contagem regressiva (5–60 s); cada jogador digita sua resposta; as respostas aparecem nos cards ao fim do tempo
- **Vídeo sincronizado** — o líder da sala carrega um vídeo do YouTube; play/pause/seek são espelhados para todos os participantes
- **Finalizar rodada** — popup com ranking, animação de confetes e efeito sonoro de aplausos
- **Histórico** — visualize todas as rodadas com pontuações individuais
- **Admin** — gerencie usuários (criar, deletar, resetar senha) pelo painel administrativo
