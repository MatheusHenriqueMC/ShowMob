# 🎮 MOBSHOW - Sistema de Pontuação

Sistema de pontuação por rodadas com banco de dados SQL, totalmente dockerizado.

## Como rodar

```bash
cd mobshow
docker compose up -d --build
```

Acesse: **http://localhost:3000**

## Funcionalidades

### ⚡ Placar
- Crie rodadas ilimitadas
- Clique no card do participante para somar **+1 ponto** (infinito)
- Clique no **−** para tirar 1 ponto
- Navegue entre rodadas pelo seletor
- Veja a pontuação total com barras de progresso

### 👥 Participantes
- Adicione novos participantes a qualquer momento
- Escolha uma cor personalizada para cada um
- Remova participantes quando quiser

### 📜 Histórico
- Veja todas as rodadas registradas com data/hora
- Resumo da pontuação total no topo
- Delete rodadas individuais
- Limpe tudo de uma vez

## Arquitetura

```
mobshow/
├── docker-compose.yml
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   └── app.py            ← Flask + SQLite
└── frontend/
    ├── Dockerfile
    ├── nginx.conf         ← Proxy reverso
    └── index.html         ← Interface completa
```

### Stack
- **Backend**: Python Flask + SQLite (persistido em Docker volume)
- **Frontend**: HTML/CSS/JS vanilla (servido via Nginx)
- **Proxy**: Nginx faz proxy reverso do `/api/` para o Flask
- **DB**: SQLite com WAL mode, foreign keys, armazenado em volume Docker

### Banco de Dados (SQLite)

```sql
participants (id, name, color, created_at, active)
rounds      (id, number, created_at)
scores      (id, round_id, participant_id, points)
```

## Parar

```bash
docker compose down        # para containers
docker compose down -v     # para e apaga o banco
```
