"use client";

import { useEffect, useRef, useState } from "react";
import type { TimerState } from "@/lib/types";

interface Props {
  timer: TimerState;
  myAnswer: string;
  onAnswerChange: (v: string) => void;
  onSubmit?: () => void;
}

export function TimerWidget({ timer, myAnswer, onAnswerChange, onSubmit }: Props) {
  const [display, setDisplay] = useState({ remaining: 0, pct: 100 });
  const [sent, setSent] = useState(false);
  const sentTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      onSubmit?.();
      setSent(true);
      if (sentTimerRef.current) clearTimeout(sentTimerRef.current);
      sentTimerRef.current = setTimeout(() => setSent(false), 2500);
    }
  }

  return (
    <div className="timer-active timer-section">
      <div className={`timer-countdown${display.remaining <= 5 ? " timer-urgent" : ""}`}>
        {display.remaining}s
      </div>
      <div className="timer-bar-track">
        <div className="timer-bar-fill" style={{ width: `${display.pct}%` }} />
      </div>
      <div className="timer-input-row">
        <input
          id="timerAnswerInput"
          className="text-input timer-answer-input"
          type="text"
          maxLength={200}
          placeholder="Sua resposta..."
          value={myAnswer}
          onChange={(e) => onAnswerChange(e.target.value)}
          onKeyDown={handleKeyDown}
          autoComplete="off"
          spellCheck={false}
        />
        {sent && <span className="timer-sent-badge">✓ Enviado!</span>}
      </div>
    </div>
  );
}
