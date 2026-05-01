"use client";

import { useState, useRef } from "react";
import { api } from "@/lib/api";
import type { User } from "@/lib/types";

const COLORS = [
  "#00BFFF", "#FF4500", "#FFD700", "#7CFC00", "#FF69B4", "#DA70D6",
  "#00FFD0", "#FF8C00", "#FF1493", "#1E90FF", "#ADFF2F", "#FF6347",
];

interface Props {
  user: User;
  onClose: () => void;
  onSaved: (updates: Partial<User>) => void;
}

function resizeImage(file: File, maxSize = 200): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = maxSize;
        canvas.height = maxSize;
        const ctx = canvas.getContext("2d")!;
        const size = Math.min(img.width, img.height);
        const sx = (img.width - size) / 2;
        const sy = (img.height - size) / 2;
        ctx.drawImage(img, sx, sy, size, size, 0, 0, maxSize, maxSize);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.src = e.target!.result as string;
    };
    reader.readAsDataURL(file);
  });
}

export function ProfileModal({ user, onClose, onSaved }: Props) {
  const [editName, setEditName] = useState(user.display_name || "");
  const [editAvatar, setEditAvatar] = useState<string | null>(null);
  const [editColor, setEditColor] = useState(user.color || "#00BFFF");
  const [customColor, setCustomColor] = useState(user.color || "#00BFFF");
  const fileRef = useRef<HTMLInputElement>(null);

  const currentAvatar = editAvatar !== null ? editAvatar : user.avatar;
  const initials = (editName || user.display_name || "?").substring(0, 2).toUpperCase();

  async function handleFile(file: File) {
    if (file.type === "image/gif") {
      const reader = new FileReader();
      reader.onload = (e) => setEditAvatar(e.target!.result as string);
      reader.readAsDataURL(file);
    } else {
      const resized = await resizeImage(file, 200);
      setEditAvatar(resized);
    }
  }

  async function handleSave() {
    const display_name = editName.trim() || user.username;
    const avatar = editAvatar !== null ? editAvatar : user.avatar;
    const res = await api<{ ok?: boolean; display_name?: string; avatar?: string | null; color?: string; error?: string }>(
      "/auth/profile",
      "PATCH",
      { display_name, avatar, color: editColor }
    );
    if (res.error) { alert(res.error); return; }
    onSaved({ display_name: res.display_name, avatar: res.avatar ?? undefined, color: res.color });
    onClose();
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box">
        <div className="modal-header">
          <span className="modal-title">MEU PERFIL</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div>
            <span className="field-label">FOTO DE PERFIL (suporta GIF)</span>
            <div className="avatar-upload-row">
              <div
                className="avatar-big"
                style={{ borderColor: editColor, background: currentAvatar ? undefined : editColor + "22", color: editColor }}
                onClick={() => fileRef.current?.click()}
              >
                {currentAvatar ? (
                  <img src={currentAvatar} alt="avatar" />
                ) : (
                  initials
                )}
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*,image/gif"
                  style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer", width: "100%", height: "100%" }}
                  onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
                />
              </div>
              <div>
                <div className="avatar-upload-hint">Toque na foto para trocar<br />Aceita JPG, PNG, GIF</div>
                {currentAvatar && (
                  <button
                    className="btn btn-danger"
                    style={{ marginTop: 8, padding: "6px 12px", fontSize: 12 }}
                    onClick={() => setEditAvatar("")}
                  >
                    Remover foto
                  </button>
                )}
              </div>
            </div>
          </div>

          <div>
            <span className="field-label">NOME DE EXIBIÇÃO</span>
            <input
              className="text-input"
              value={editName}
              placeholder="Seu nome..."
              onChange={(e) => setEditName(e.target.value)}
            />
          </div>

          <div>
            <span className="field-label">COR</span>
            <div className="color-row">
              {COLORS.map((c) => (
                <div
                  key={c}
                  className={`color-swatch${c === editColor ? " selected" : ""}`}
                  style={{ background: c }}
                  onClick={() => { setEditColor(c); setCustomColor(c); }}
                />
              ))}
              <div style={{ position: "relative", width: 28, height: 28 }}>
                <div
                  className="color-swatch"
                  style={{ background: "conic-gradient(red,yellow,lime,cyan,blue,magenta,red)" }}
                />
                <input
                  type="color"
                  value={customColor}
                  style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer", width: "100%", height: "100%", border: "none" }}
                  onInput={(e) => { const v = (e.target as HTMLInputElement).value; setCustomColor(v); setEditColor(v); }}
                />
              </div>
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleSave}>SALVAR</button>
          <button className="btn btn-ghost" onClick={onClose}>CANCELAR</button>
        </div>
      </div>
    </div>
  );
}
