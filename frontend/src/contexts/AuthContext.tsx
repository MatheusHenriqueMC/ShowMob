"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import type { User } from "@/lib/types";

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (token: string, user: User) => void;
  logout: () => Promise<void>;
  updateUser: (updates: Partial<User>) => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const savedToken = localStorage.getItem("ms_token");
    if (!savedToken) {
      setLoading(false);
      return;
    }
    setToken(savedToken);
    api<User | { error: string }>("/auth/me").then((res) => {
      if ("error" in res) {
        localStorage.removeItem("ms_token");
        localStorage.removeItem("ms_room");
        setToken(null);
      } else {
        setUser(res as User);
      }
      setLoading(false);
    });
  }, []);

  const login = useCallback((tok: string, u: User) => {
    localStorage.setItem("ms_token", tok);
    setToken(tok);
    setUser(u);
  }, []);

  const logout = useCallback(async () => {
    await api("/auth/logout", "POST");
    localStorage.removeItem("ms_token");
    localStorage.removeItem("ms_room");
    setToken(null);
    setUser(null);
    router.push("/login");
  }, [router]);

  const updateUser = useCallback((updates: Partial<User>) => {
    setUser((prev) => (prev ? { ...prev, ...updates } : null));
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
