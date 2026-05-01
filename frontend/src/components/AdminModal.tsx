"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import type { AdminUser } from "@/lib/types";

interface Props {
  onClose: () => void;
}

export function AdminModal({ onClose }: Props) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [newUser, setNewUser] = useState("");
  const [newPass, setNewPass] = useState("");
  const [newRole, setNewRole] = useState("user");
  const [resetId, setResetId] = useState<number | null>(null);
  const [resetPass, setResetPass] = useState("");

  useEffect(() => {
    loadUsers();
  }, []);

  async function loadUsers() {
    const res = await api<AdminUser[] | { error: string }>("/users");
    if (Array.isArray(res)) setUsers(res);
  }

  async function createUser() {
    if (!newUser.trim() || !newPass.trim()) { alert("Preencha usuário e senha"); return; }
    const res = await api<{ error?: string }>("/users", "POST", {
      username: newUser.trim(),
      password: newPass.trim(),
      role: newRole,
    });
    if (res.error) { alert(res.error); return; }
    setNewUser("");
    setNewPass("");
    loadUsers();
  }

  async function deleteUser(uid: number) {
    if (!confirm("Deletar usuário?")) return;
    await api(`/users/${uid}`, "DELETE");
    setUsers((prev) => prev.filter((u) => u.id !== uid));
  }

  async function resetPassword(uid: number) {
    if (resetId !== uid) { setResetId(uid); setResetPass(""); return; }
    if (!resetPass.trim()) { alert("Digite a nova senha"); return; }
    const res = await api<{ error?: string }>(`/users/${uid}/password`, "PATCH", { password: resetPass.trim() });
    if (res.error) { alert(res.error); return; }
    setResetId(null);
    setResetPass("");
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box" style={{ maxWidth: 500 }}>
        <div className="modal-header">
          <span className="modal-title">GERENCIAR USUÁRIOS</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className="admin-user-list">
            {users.length === 0 ? (
              <div className="empty" style={{ padding: "20px 0" }}>Nenhum usuário</div>
            ) : (
              users.map((u) => (
                <div key={u.id}>
                  <div className="admin-user-item">
                    <div className="admin-user-name">{u.display_name || u.username}</div>
                    <div className="admin-user-role">{u.role === "admin" ? "ADMIN" : "USER"}</div>
                    <div className="admin-user-actions">
                      <button className="btn-icon" title="Resetar senha" onClick={() => resetPassword(u.id)}>🔑</button>
                      <button className="btn-icon danger" title="Deletar" onClick={() => deleteUser(u.id)}>✕</button>
                    </div>
                  </div>
                  {resetId === u.id && (
                    <div style={{ display: "flex", gap: 8, marginTop: -4, padding: "0 4px" }}>
                      <input
                        className="text-input"
                        style={{ fontSize: 13, padding: "8px 12px", flex: 1 }}
                        type="password"
                        placeholder="Nova senha..."
                        value={resetPass}
                        onChange={(e) => setResetPass(e.target.value)}
                      />
                      <button className="btn btn-primary" style={{ padding: "8px 14px", fontSize: 13 }} onClick={() => resetPassword(u.id)}>OK</button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          <div className="admin-create-form">
            <span className="field-label" style={{ marginBottom: 0 }}>CRIAR NOVO USUÁRIO</span>
            <div style={{ display: "flex", gap: 8 }}>
              <input className="text-input" placeholder="Usuário..." value={newUser} onChange={(e) => setNewUser(e.target.value)} />
              <input className="text-input" type="password" placeholder="Senha..." value={newPass} onChange={(e) => setNewPass(e.target.value)} />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <select className="role-select" value={newRole} onChange={(e) => setNewRole(e.target.value)}>
                <option value="user">Jogador</option>
                <option value="admin">Admin</option>
              </select>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={createUser}>CRIAR</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
