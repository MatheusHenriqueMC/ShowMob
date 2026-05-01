"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import type { User } from "@/lib/types";

interface LoginResponse {
  token: string;
  user: User;
  error?: string;
}

export default function LoginPage() {
  const { login, token, loading } = useAuth();
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && token) router.replace("/lobby");
  }, [loading, token, router]);

  async function handleLogin() {
    setError("");
    setSubmitting(true);
    const res = await api<LoginResponse>("/auth/login", "POST", { username, password });
    setSubmitting(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    login(res.token, res.user);
    router.push("/lobby");
  }

  return (
    <div className="login-screen">
      <div className="login-box">
        <div className="login-logo">
          <div className="logo">
            <span className="mob">MOB</span>
            <span className="show">SHOW</span>
          </div>
          <p>ENTRE COM SUA CONTA</p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span className="field-label">USUÁRIO</span>
            <input
              className="text-input"
              placeholder="Usuário..."
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && document.getElementById("passInput")?.focus()}
              autoComplete="username"
            />
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span className="field-label">SENHA</span>
            <input
              id="passInput"
              className="text-input"
              type="password"
              placeholder="Senha..."
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleLogin()}
              autoComplete="current-password"
            />
          </div>
          {error && <div className="error-msg">{error}</div>}
          <button className="btn btn-primary" onClick={handleLogin} disabled={submitting}>
            {submitting ? "ENTRANDO..." : "ENTRAR"}
          </button>
        </div>
      </div>
    </div>
  );
}
