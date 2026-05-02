"use client";

import { useEffect, useRef, useState } from "react";
import type { TimerState } from "@/lib/types";

interface Props {
  timer: TimerState;
  myAnswer: string;
  saveStatus: "idle" | "saving" | "saved";
  onAnswerChange: (v: string) => void;
  onSubmit: () => void;
}

export function TimerWidget({ timer, myAnswer, saveStatus, onAnswerChange, onSubmit }: Props) {
  const [display, setDisplay] = useState({ remaining: 0, pct: 100 });
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    function tick() {
      const remaining = Math.max(0, Math.ceil((timer.end_at_ms - Date.now()) / 1000));
      const pct = Math.max(0, ((timer.end_at_ms - Date.now()) / (timer.duration * 1000)) * 100);
      setDisplay({ remaining, pct });
    }
    tick();
    intervalRef.current = setInterval(tick, 100);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [timer]);

  return (
    <div className="timer-active timer-section">
      <div className={`timer-countdown${display.remaining <= 5 ? " timer-urgent" : ""}`}>
        {display.remaining}s
      </div>
      <div className="timer-bar-track">
        <div className="timer-bar-fill" style={{ width: `${display.pct}%` }} />
      </div>
      <div style={{ position: "relative" }}>
        <input
          id="timerAnswerInput"
          className="text-input timer-answer-input"
          type="text"
          maxLength={200}
          placeholder="Sua resposta... (Enter para confirmar)"
          value={myAnswer}
          onChange={(e) => onAnswerChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onSubmit(); } }}
          autoComplete="off"
          spellCheck={false}
          style={{ paddingRight: 40 }}
        />
        <span style={{
          position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)",
          fontSize: 18, lineHeight: 1,
          color: saveStatus === "saved" ? "#00cc66" : saveStatus === "saving" ? "#ff8c00" : "rgba(255,255,255,0.2)",
          transition: "color 0.3s",
        }}>
          {saveStatus === "saved" ? "✓" : saveStatus === "saving" ? "…" : "○"}
        </span>
      </div>
      <div style={{ fontSize: 11, color: saveStatus === "saved" ? "#00cc66" : "rgba(255,255,255,0.3)", textAlign: "center", marginTop: 4, letterSpacing: 1 }}>
        {saveStatus === "saved" ? "RESPOSTA ENVIADA" : saveStatus === "saving" ? "ENVIANDO..." : "PRESSIONE ENTER PARA CONFIRMAR"}
      </div>
    </div>
  );
}
