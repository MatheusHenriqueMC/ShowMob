"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Avatar } from "@/components/Avatar";
import { ProfileModal } from "@/components/ProfileModal";
import { AdminModal } from "@/components/AdminModal";

interface RoomResponse {
  id: number;
  code: string;
  name: string;
  host_id: number;
  error?: string;
}

export default function LobbyPage() {
  const { user, token, loading, logout, updateUser } = useAuth();
  const router = useRouter();
  const [roomName, setRoomName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [showProfile, setShowProfile] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);

  useEffect(() => {
    if (!loading && !token) router.replace("/login");
  }, [loading, token, router]);

  async function createRoom() {
    const name = roomName.trim() || "Sala sem nome";
    const res = await api<RoomResponse>("/rooms", "POST", { name });
    if (res.error) { alert(res.error); return; }
    localStorage.setItem("ms_room", res.code);
    router.push(`/room/${res.code}`);
  }

  async function joinRoom() {
    const code = joinCode.trim().toUpperCase();
    if (!code) return;
    const res = await api<RoomResponse>("/rooms/join", "POST", { code });
    if (res.error) { alert(res.error); return; }
    localStorage.setItem("ms_room", res.code);
    router.push(`/room/${res.code}`);
  }

  if (loading || !user) return null;

  return (
    <div className="app">
      <div className="lobby-screen">
        <div className="lobby-header">
          <div className="logo">
            <span className="mob">MOB</span>
            <span className="show">SHOW</span>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {user.role === "admin" && (
              <button className="btn btn-outline" style={{ padding: "8px 14px", fontSize: 13 }} onClick={() => setShowAdmin(true)}>
                ⚙ ADMIN
              </button>
            )}
            <button className="btn btn-ghost" style={{ padding: "8px 14px", fontSize: 13 }} onClick={logout}>
              SAIR
            </button>
          </div>
        </div>

        <div className="user-card" onClick={() => setShowProfile(true)}>
          <div style={{ width: 52, height: 52, flexShrink: 0, borderRadius: "50%", overflow: "hidden", border: `2px solid ${user.color}` }}>
            <Avatar color={user.color} avatar={user.avatar} name={user.display_name || user.username} size={52} />
          </div>
          <div className="user-card-info">
            <div className="user-card-name" style={{ color: user.color }}>
              {user.display_name || user.username}
            </div>
            <div className="user-card-sub">
              @{user.username} &bull; {user.role === "admin" ? "Admin" : "Jogador"}
            </div>
            <div className="user-card-edit">Toque para editar perfil</div>
          </div>
          <div style={{ fontSize: 20, color: "var(--text2)" }}>›</div>
        </div>

        <div className="lobby-section">
          <div className="lobby-section-title">CRIAR SALA</div>
          <div className="card">
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <input
                className="text-input"
                placeholder="Nome da sala..."
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && createRoom()}
              />
              <button className="btn btn-primary" onClick={createRoom}>
                🎮 CRIAR SALA
              </button>
            </div>
          </div>
        </div>

        <div className="lobby-section">
          <div className="lobby-section-title">ENTRAR EM UMA SALA</div>
          <div className="card">
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <input
                className="text-input"
                placeholder="Código da sala (ex: AB3X7K)..."
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                maxLength={6}
                style={{ letterSpacing: 4, fontFamily: "var(--font-orbitron)", fontSize: 18 }}
                onKeyDown={(e) => e.key === "Enter" && joinRoom()}
              />
              <button className="btn btn-outline" onClick={joinRoom}>
                ENTRAR NA SALA
              </button>
            </div>
          </div>
        </div>
      </div>

      {showProfile && (
        <ProfileModal
          user={user}
          onClose={() => setShowProfile(false)}
          onSaved={(updates) => updateUser(updates)}
        />
      )}
      {showAdmin && <AdminModal onClose={() => setShowAdmin(false)} />}
    </div>
  );
}
