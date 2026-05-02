"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { api } from "@/lib/api";
import { getSocket, disconnectSocket } from "@/lib/socket";
import { useAuth } from "@/contexts/AuthContext";
import { Avatar } from "@/components/Avatar";
import { ProfileModal } from "@/components/ProfileModal";
import { AdminModal } from "@/components/AdminModal";
import { WinnerPopup } from "@/components/WinnerPopup";
import { TimerWidget } from "@/components/TimerWidget";
import { VideoSection } from "@/components/VideoSection";
import type { Room, Round, Total, TimerState, VideoStateEntry } from "@/lib/types";

// ── Helpers ──────────────────────────────────────────────────────────────────

function AvatarSmall({ color, avatar, name, size, cls }: { color: string; avatar: string | null; name: string; size: number; cls: string }) {
  const bg = color + "22";
  const initials = (name || "?").substring(0, 2).toUpperCase();
  const fontSize = Math.round(size / 3);
  const style: React.CSSProperties = { width: size, height: size, borderRadius: "50%", overflow: "hidden", border: `2px solid ${color}`, background: bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 };
  if (avatar) return <div className={cls} style={style}><img src={avatar} alt={name} style={{ width: "100%", height: "100%", objectFit: "cover" }} /></div>;
  return <div className={cls} style={{ ...style, color, fontSize, fontFamily: "var(--font-orbitron)", fontWeight: 700 }}>{initials}</div>;
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function RoomPage() {
  const params = useParams<{ code: string }>();
  const code = (params?.code ?? "").toUpperCase();
  const { user, token, loading, logout, updateUser } = useAuth();
  const router = useRouter();

  const [room, setRoom] = useState<Room | null>(null);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [totals, setTotals] = useState<Total[]>([]);
  const [currentRound, setCurrentRound] = useState<Round | null>(null);
  const [tab, setTab] = useState<"placar" | "historico">("placar");
  const [timer, setTimer] = useState<TimerState | null>(null);
  const [timerDuration, setTimerDuration] = useState(30);
  const [myAnswer, setMyAnswer] = useState("");
  const [typingUsers, setTypingUsers] = useState<Record<string, boolean>>({});
  const [roundAnswers, setRoundAnswers] = useState<Record<number, Record<string, string>>>({});
  const [videoState, setVideoState] = useState<Record<number, VideoStateEntry>>({});
  const [showProfile, setShowProfile] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [winnerRound, setWinnerRound] = useState<Round | null>(null);
  const [titleSaveTimer, setTitleSaveTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [submittedUsers, setSubmittedUsers] = useState<Record<number, boolean>>({});

  const timerRef = useRef<TimerState | null>(null);
  const myAnswerRef = useRef("");
  const typingRef = useRef(false);
  const typingStopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const answerSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const roundRef = useRef<Round | null>(null);
  const roomRef = useRef<Room | null>(null);
  const roundsRef = useRef<Round[]>([]);
  const navigatePendingRef = useRef<number | null>(null);

  // keep refs in sync
  useEffect(() => { timerRef.current = timer; }, [timer]);
  useEffect(() => { myAnswerRef.current = myAnswer; }, [myAnswer]);
  useEffect(() => { roundRef.current = currentRound; }, [currentRound]);
  useEffect(() => { roomRef.current = room; }, [room]);
  useEffect(() => { roundsRef.current = rounds; }, [rounds]);

  const isLeader = useCallback(() => room && user && user.id === room.host_id, [room, user]);

  // ── Load room data ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (loading) return;
    if (!token) { router.replace("/login"); return; }
    loadRoom();
    return () => {
      const sock = getSocket();
      sock.emit("leave_room", { code, user_id: user?.id });
      disconnectSocket();
    };
  }, [loading, token]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadRoom() {
    const roomData = await api<Room & { error?: string }>(`/rooms/${code}`);
    if (roomData.error) { router.replace("/lobby"); return; }
    const [roundsData, totalsData, timerData] = await Promise.all([
      api<Round[]>(`/rooms/${code}/rounds`),
      api<Total[]>(`/rooms/${code}/totals`),
      api<{ active: boolean; session_id?: string; duration?: number; remaining_ms?: number; round_id?: number }>(`/rooms/${code}/timer`),
    ]);
    setRoom(roomData);
    setRounds(roundsData);
    setTotals(totalsData);
    const first = roundsData[0] ?? null;
    setCurrentRound(first);
    const vs: Record<number, VideoStateEntry> = {};
    roundsData.forEach((r) => { if (r.video_state) vs[r.id] = r.video_state; });
    setVideoState(vs);
    if (timerData.active && timerData.session_id && timerData.duration && timerData.remaining_ms! > 0) {
      const end_at_ms = Date.now() + timerData.remaining_ms!;
      {
        const ts: TimerState = { session_id: timerData.session_id, duration: timerData.duration, round_id: timerData.round_id!, end_at_ms };
        setTimer(ts);
        timerRef.current = ts;
        const r = roundsData.find((x) => x.id === timerData.round_id);
        if (r) setCurrentRound(r);
      }
    }
    localStorage.setItem("ms_room", code);
    setupSocket();
  }

  // ── Socket.IO ───────────────────────────────────────────────────────────────

  function setupSocket() {
    const sock = getSocket();
    sock.on("connect", () => sock.emit("join_room", { code }));
    if (sock.connected) sock.emit("join_room", { code });

    sock.on("state_update", ({ rounds: r, totals: t }: { rounds: Round[]; totals: Total[] }) => {
      setRounds(r);
      setTotals(t);
      setCurrentRound((prev) => {
        if (navigatePendingRef.current !== null) {
          const target = r.find((x) => x.id === navigatePendingRef.current);
          if (target) { navigatePendingRef.current = null; return target; }
        }
        if (prev) return r.find((x) => x.id === prev.id) ?? r[0] ?? null;
        return r[0] ?? null;
      });
    });

    sock.on("members_updated", ({ members }: { members: Room["members"] }) => {
      setRoom((prev) => prev ? { ...prev, members } : null);
    });

    sock.on("timer_started", ({ session_id, duration, started_at_ms, round_id }: { session_id: string; duration: number; started_at_ms: number; round_id: number }) => {
      setMyAnswer("");
      myAnswerRef.current = "";
      setTypingUsers({});
      setRoundAnswers((prev) => { const n = { ...prev }; delete n[round_id]; return n; });
      const end_at_ms = Date.now() + duration * 1000;
      const ts: TimerState = { session_id, duration, round_id, end_at_ms };
      setTimer(ts);
      timerRef.current = ts;
      setRounds((prev) => {
        const r = prev.find((x) => x.id === round_id);
        if (r) setCurrentRound(r);
        return prev;
      });
    });

    sock.on("timer_ended", ({ session_id, round_id, answers }: { session_id: string; round_id: number; answers: { user_id: number; text: string }[] }) => {
      if (!timerRef.current || timerRef.current.session_id !== session_id) return;
      const map: Record<string, string> = {};
      answers.forEach((a) => { map[String(a.user_id)] = a.text; });
      setRoundAnswers((prev) => ({ ...prev, [round_id]: map }));
      setTimer(null);
      timerRef.current = null;
      setMyAnswer("");
      myAnswerRef.current = "";
      setTypingUsers({});
      setSubmittedUsers({});
      setSaveStatus("idle");
      typingRef.current = false;
      if (typingStopTimer.current) clearTimeout(typingStopTimer.current);
    });

    sock.on("video_set", ({ round_id, video_id }: { round_id: number; video_id: string }) => {
      setRounds((prev) => prev.map((r) => r.id === round_id ? { ...r, video_id: video_id || null } : r));
      setCurrentRound((prev) => prev?.id === round_id ? { ...prev, video_id: video_id || null } : prev);
      if (!video_id) setVideoState((prev) => { const n = { ...prev }; delete n[round_id]; return n; });
    });

    sock.on("score_change", ({ round_id, uid, delta }: { round_id: number; uid: string; delta: number }) => {
      adjustScore(round_id, uid, delta);
    });

    sock.on("room_closed", () => {
      router.replace("/lobby");
    });

    sock.on("round_finished", ({ round_id }: { round_id: number }) => {
      const round = roundsRef.current.find((r) => r.id === round_id) ?? null;
      if (round) setWinnerRound(round);
    });

    sock.on("navigate_to_round", ({ round_id }: { round_id: number }) => {
      setWinnerRound(null);
      const round = roundsRef.current.find((r) => r.id === round_id) ?? null;
      if (round) setCurrentRound(round);
      else navigatePendingRef.current = round_id;
    });

    sock.on("keep_round", () => {
      setWinnerRound(null);
    });

    sock.on("video_control", ({ round_id, action, position, server_ts }: { round_id: number; action: string; position: number; server_ts: number }) => {
      setVideoState((prev) => ({ ...prev, [round_id]: { playing: action !== "pause", position, position_at_ms: server_ts } }));
      const fn = (window as unknown as Record<string, unknown>)[`applyVideoControl_${round_id}`];
      if (typeof fn === "function") (fn as (a: string, p: number, t: number) => void)(action, position, server_ts);
    });

    sock.on("user_submitted", ({ user_id }: { user_id: number }) => {
      setSubmittedUsers((prev) => ({ ...prev, [user_id]: true }));
    });

    sock.on("typing_update", ({ user_id, is_typing, session_id }: { user_id: number; is_typing: boolean; session_id: string }) => {
      if (!timerRef.current || timerRef.current.session_id !== session_id) return;
      setTypingUsers((prev) => ({ ...prev, [String(user_id)]: is_typing }));
    });
  }

  // ── Actions ─────────────────────────────────────────────────────────────────

  function emitTyping(isTyping: boolean) {
    const r = roomRef.current;
    const t = timerRef.current;
    if (!r || !t || !user) return;
    getSocket().emit("typing_indicator", { code: r.code, session_id: t.session_id, user_id: user.id, is_typing: isTyping });
  }

  function handleAnswerInput(value: string) {
    setMyAnswer(value);
    myAnswerRef.current = value;
    setSaveStatus("idle");
    if (!typingRef.current) { typingRef.current = true; emitTyping(true); }
    if (typingStopTimer.current) clearTimeout(typingStopTimer.current);
    typingStopTimer.current = setTimeout(() => { typingRef.current = false; emitTyping(false); }, 2000);
    if (answerSaveTimer.current) clearTimeout(answerSaveTimer.current);
    answerSaveTimer.current = setTimeout(saveAnswer, 600);
  }

  async function saveAnswer() {
    const t = timerRef.current;
    const r = roomRef.current;
    if (!t || !r) return;
    setSaveStatus("saving");
    const res = await api<{ ok?: boolean; error?: string }>(`/rooms/${r.code}/timer/answer`, "POST", { session_id: t.session_id, text: myAnswerRef.current });
    if (!res.error) setSaveStatus("saved");
    else setSaveStatus("idle");
  }

  async function handleSubmitAnswer() {
    if (answerSaveTimer.current) { clearTimeout(answerSaveTimer.current); answerSaveTimer.current = null; }
    await saveAnswer();
    const t = timerRef.current;
    const r = roomRef.current;
    if (!t || !r || !user) return;
    getSocket().emit("answer_submitted", { code: r.code, session_id: t.session_id, user_id: user.id });
    if (typingRef.current) { typingRef.current = false; emitTyping(false); }
  }

  async function newRound(navigateAll = false) {
    const res = await api<{ id?: number; error?: string }>(`/rooms/${code}/rounds`, "POST");
    if (res.error) { alert(res.error); return; }
    if (navigateAll && res.id && user) {
      getSocket().emit("navigate_to_round", { code, round_id: res.id, user_id: user.id });
    }
  }

  function adjustScore(rid: number, uid: string, delta: number) {
    const update = (r: Round): Round => r.id !== rid ? r : {
      ...r, scores: { ...r.scores, [uid]: { ...r.scores[uid], points: Math.max(0, (r.scores[uid]?.points ?? 0) + delta) } }
    };
    setRounds((prev) => prev.map(update));
    setCurrentRound((prev) => prev ? update(prev) : prev);
  }

  async function increment(rid: number, uid: string) {
    adjustScore(rid, uid, 1);
    getSocket().emit("score_change", { code, round_id: rid, uid, delta: 1, user_id: user?.id });
    await api(`/rooms/${code}/scores/${rid}/${uid}/increment`, "POST");
  }

  async function decrement(rid: number, uid: string) {
    adjustScore(rid, uid, -1);
    getSocket().emit("score_change", { code, round_id: rid, uid, delta: -1, user_id: user?.id });
    await api(`/rooms/${code}/scores/${rid}/${uid}/decrement`, "POST");
  }

  function updateRoundTitle(rid: number, title: string) {
    setCurrentRound((prev) => prev?.id === rid ? { ...prev, title: title || null } : prev);
    setRounds((prev) => prev.map((r) => r.id === rid ? { ...r, title: title || null } : r));
    if (titleSaveTimer) clearTimeout(titleSaveTimer);
    setTitleSaveTimer(setTimeout(() => api(`/rooms/${code}/rounds/${rid}`, "PATCH", { title }), 500));
  }

  async function deleteRound(id: number) {
    if (!confirm("Deletar rodada?")) return;
    await api(`/rooms/${code}/rounds/${id}`, "DELETE");
  }

  async function clearAll() {
    if (!confirm("Limpar TODAS as rodadas?")) return;
    for (const r of rounds) await api(`/rooms/${code}/rounds/${r.id}`, "DELETE");
  }

  async function startTimer(roundId: number) {
    const duration = Math.max(5, Math.min(60, timerDuration || 30));
    setTimerDuration(duration);
    const res = await api<{ error?: string }>(`/rooms/${code}/timer/start`, "POST", { round_id: roundId, duration });
    if (res.error) alert(res.error);
  }

  function handleSetVideo(roundId: number, videoId: string) {
    getSocket().emit("video_set", { code, round_id: roundId, video_id: videoId });
  }

  function handleRemoveVideo(roundId: number) {
    if (!confirm("Remover vídeo da rodada?")) return;
    getSocket().emit("video_set", { code, round_id: roundId, video_id: "" });
  }

  function handleVideoControl(roundId: number, action: string, position: number) {
    getSocket().emit("video_control", { code, round_id: roundId, action, position });
  }

  async function leaveRoom() {
    if (!confirm("Sair da sala?")) return;
    getSocket().emit("leave_room", { code, user_id: user?.id });
    localStorage.removeItem("ms_room");
    disconnectSocket();
    router.push("/lobby");
  }

  function copyCode() {
    navigator.clipboard.writeText(code).then(() => alert(`Código ${code} copiado!`));
  }

  // ── Render helpers ───────────────────────────────────────────────────────────

  function renderTotals() {
    const max = Math.max(...totals.map((t) => t.total), 1);
    return totals.map((t) => (
      <div className="total-row" key={t.id}>
        <div className="total-info">
          <AvatarSmall color={t.color} avatar={t.avatar} name={t.name} size={28} cls="total-avatar" />
          <span className="total-name">{t.name}</span>
          <span className="total-value" style={{ color: t.color }}>{t.total}</span>
        </div>
        <div className="bar-track"><div className="bar-fill" style={{ width: `${(t.total / max) * 100}%`, background: t.color }} /></div>
      </div>
    ));
  }

  function renderRoundScores(cr: Round) {
    const entries = Object.values(cr.scores || {}).sort((a, b) => b.points - a.points);
    const max = Math.max(...entries.map((s) => s.points), 1);
    return entries.map((s, i) => (
      <div className="total-row" key={i}>
        <div className="total-info">
          <AvatarSmall color={s.color} avatar={s.avatar ?? null} name={s.name} size={28} cls="total-avatar" />
          <span className="total-name">{s.name}</span>
          <span className="total-value" style={{ color: s.color }}>{s.points}</span>
        </div>
        <div className="bar-track"><div className="bar-fill" style={{ width: `${(s.points / max) * 100}%`, background: s.color }} /></div>
      </div>
    ));
  }

  function renderPlacar() {
    const cr = currentRound;
    const leader = isLeader();
    const timerActiveForRound = !!(timer && timer.round_id === cr?.id);
    const roundAnswerMap = cr ? (roundAnswers[cr.id] ?? null) : null;

    const roundSelector = rounds.length > 0 ? (
      <select className="round-select" value={cr?.id ?? ""} onChange={(e) => setCurrentRound(rounds.find((r) => r.id === +e.target.value) ?? null)}>
        {rounds.map((r) => <option key={r.id} value={r.id}>RODADA {r.number}</option>)}
      </select>
    ) : null;

    if (!cr) return (
      <>
        <div className="current-round-header">
          <div>{roundSelector}</div>
          <button className="btn-new-round" onClick={() => newRound()}>+ NOVA RODADA</button>
        </div>
        <div className="no-round">
          <div style={{ fontSize: 48, marginBottom: 12 }}>🎮</div>
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Nenhuma rodada ativa</div>
          <div>Crie uma nova rodada para começar!</div>
        </div>
        <div className="totals-section">
          <div className="totals-title">PONTUAÇÃO TOTAL</div>
          {renderTotals()}
        </div>
      </>
    );

    const scores = cr.scores || {};

    return (
      <>
        <div className="current-round-header">
          <div>{roundSelector}</div>
        </div>

        <div className="round-title-row">
          <span className="field-label">TÍTULO DA RODADA</span>
          <input
            className="round-title-input"
            type="text"
            maxLength={60}
            placeholder="Ex: Rodada das perguntas difíceis..."
            value={cr.title ?? ""}
            onChange={(e) => updateRoundTitle(cr.id, e.target.value)}
          />
        </div>

        <VideoSection
          key={`video-${cr.id}`}
          roundId={cr.id}
          videoId={cr.video_id ?? null}
          videoState={videoState[cr.id] ?? null}
          isLeader={!!leader}
          onVideoControl={(action, pos) => handleVideoControl(cr.id, action, pos)}
          onSetVideo={(vid) => handleSetVideo(cr.id, vid)}
          onRemoveVideo={() => handleRemoveVideo(cr.id)}
        />

        {timerActiveForRound && timer ? (
          <TimerWidget timer={timer} myAnswer={myAnswer} saveStatus={saveStatus} onAnswerChange={handleAnswerInput} onSubmit={handleSubmitAnswer} />
        ) : leader ? (
          <div className="timer-config timer-section">
            <span className="field-label" style={{ margin: 0, whiteSpace: "nowrap", fontSize: 10 }}>TIMER</span>
            <input
              type="number"
              className="timer-duration-input"
              min={5}
              max={60}
              value={timerDuration}
              onChange={(e) => setTimerDuration(+e.target.value || 0)}
              onBlur={(e) => setTimerDuration(Math.max(5, Math.min(60, +e.target.value || 30)))}
            />
            <span style={{ color: "var(--text2)", fontSize: 12 }}>seg</span>
            <span style={{ flex: 1 }} />
            <button className="btn-start-timer" onClick={() => startTimer(cr.id)}>▶ INICIAR</button>
          </div>
        ) : null}

        <div className="score-grid">
          {Object.entries(scores).map(([uid, s]) => {
            const hasScore = s.points > 0;
            const isTyping = timerActiveForRound && !!typingUsers[uid];
            const answerText = roundAnswerMap ? (roundAnswerMap[uid] ?? null) : null;
            const avatar = s.avatar ?? totals.find((t) => t.id === +uid)?.avatar ?? null;
            return (
              <div
                key={uid}
                className="score-card"
                style={{
                  borderColor: s.color,
                  boxShadow: hasScore ? `0 0 25px ${s.color}40` : "0 4px 15px rgba(0,0,0,0.3)",
                  background: hasScore ? `linear-gradient(145deg,${s.color}10,${s.color}22)` : "linear-gradient(145deg,#12122a,#181835)",
                  cursor: leader ? "pointer" : "default",
                }}
                onClick={() => leader && increment(cr.id, uid)}
              >
                {leader && (
                  <button
                    className="score-card-minus"
                    onClick={(e) => { e.stopPropagation(); decrement(cr.id, uid); }}
                  >−</button>
                )}
                {submittedUsers[+uid] && (
                  <div className="card-submitted">✓</div>
                )}
                {answerText !== null ? (
                  <div className="card-indicator card-answer-display">{answerText}</div>
                ) : timerActiveForRound ? (
                  <div className="card-indicator card-typing" style={{ display: isTyping ? "flex" : "none" }}>...</div>
                ) : null}
                <div className="score-card-avatar" style={{ borderColor: s.color, background: s.color + "22", color: s.color }}>
                  {avatar ? <img src={avatar} alt={s.name} /> : (s.name || "?").substring(0, 2).toUpperCase()}
                </div>
                <div className="score-card-name" style={{ color: s.color }}>{s.name}</div>
                <div className="score-card-points" style={{ color: hasScore ? "#fff" : "rgba(255,255,255,0.2)" }}>{s.points}</div>
                {leader && <div className="score-card-hint">toque = +1</div>}
              </div>
            );
          })}
        </div>

        {leader && (
          <button className="btn-finalizar" onClick={() => getSocket().emit("finish_round", { code, round_id: cr.id, user_id: user?.id })}>
            🏆 FINALIZAR RODADA
          </button>
        )}

        <div className="totals-section">
          <div className="totals-title">PONTUAÇÃO DA RODADA {cr.number}</div>
          {renderRoundScores(cr)}
        </div>
      </>
    );
  }

  function renderHistory() {
    if (rounds.length === 0) {
      return (
        <div className="empty">
          <div style={{ fontSize: 48, marginBottom: 12 }}>📋</div>
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Nenhuma rodada registrada</div>
          <div>Vá ao placar e crie rodadas!</div>
        </div>
      );
    }

    const maxTotal = Math.max(...totals.map((t) => t.total), 1);

    return (
      <>
        <div className="history-summary">
          {totals.map((t) => (
            <div className="summary-item" key={t.id}>
              <AvatarSmall color={t.color} avatar={t.avatar} name={t.name} size={28} cls="summary-avatar" />
              <span className="summary-name">{t.name}</span>
              <span className="summary-value" style={{ color: t.color }}>{t.total}</span>
            </div>
          ))}
        </div>

        <div className="rounds-list">
          {rounds.map((r) => {
            const maxPts = Math.max(...Object.values(r.scores).map((s) => s.points), 0);
            return (
              <div className="round-card" key={r.id}>
                <div className="round-card-header">
                  <span className="round-card-number">RODADA {r.number}</span>
                  <span className="round-card-time">{r.created_at}</span>
                </div>
                {r.title && <div className="round-card-title">{r.title}</div>}
                <div className="round-card-scores">
                  {Object.entries(r.scores).map(([uid, s]) => {
                    const isWinner = maxPts > 0 && s.points === maxPts;
                    return (
                      <div key={uid} className="round-chip" style={{ borderColor: s.points > 0 ? s.color : "transparent", background: s.points > 0 ? s.color + "20" : "rgba(255,255,255,0.03)" }}>
                        {isWinner && <span className="chip-crown">👑</span>}
                        <div className="chip-avatar" style={{ borderColor: s.color, background: s.color + "22", color: s.color }}>
                          {s.avatar ? <img src={s.avatar} alt={s.name} /> : (s.name || "?").substring(0, 2).toUpperCase()}
                        </div>
                        <span className="chip-name" style={{ color: s.points > 0 ? s.color : "rgba(255,255,255,0.3)" }}>{s.name}</span>
                        <span className="chip-value" style={{ color: s.points > 0 ? "#fff" : "rgba(255,255,255,0.15)" }}>{s.points}</span>
                      </div>
                    );
                  })}
                </div>
                <button className="btn-delete-round" onClick={() => deleteRound(r.id)}>✕</button>
              </div>
            );
          })}
        </div>

        <button className="btn-clear" onClick={clearAll}>🗑️ LIMPAR TUDO</button>
      </>
    );
  }

  // ── Guard ───────────────────────────────────────────────────────────────────

  if (loading || !user) return null;

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <>
      <div className="app">
        <div className="game-header">
          <div className="game-header-top">
            <div className="room-info">
              <div className="room-name">{room?.name ?? code}</div>
              <span className="room-code-badge" onClick={copyCode} title="Clique para copiar">🔑 {code}</span>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <div className="round-count">{rounds.length} RODADA{rounds.length !== 1 ? "S" : ""}</div>
              <button className="btn btn-ghost" style={{ padding: "8px 12px", fontSize: 13 }} onClick={() => setShowProfile(true)}>👤</button>
              {user.role === "admin" && (
                <button className="btn btn-ghost" style={{ padding: "8px 12px", fontSize: 13 }} onClick={() => setShowAdmin(true)}>⚙</button>
              )}
              <button className="btn btn-ghost" style={{ padding: "8px 12px", fontSize: 13 }} onClick={leaveRoom}>✕</button>
            </div>
          </div>
          <div className="tabs">
            <button className={`tab${tab === "placar" ? " active" : ""}`} onClick={() => setTab("placar")}>⚡ PLACAR</button>
            <button className={`tab${tab === "historico" ? " active" : ""}`} onClick={() => setTab("historico")}>📜 HISTÓRICO</button>
          </div>
        </div>

        <div className="content">
          {tab === "placar" ? renderPlacar() : renderHistory()}
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
      {winnerRound && (
        <WinnerPopup
          round={winnerRound}
          totals={totals}
          onClose={() => setWinnerRound(null)}
          onNewRound={!!isLeader() ? async () => { await newRound(true); } : undefined}
          onKeepRound={!!isLeader() ? () => getSocket().emit("keep_round", { code, user_id: user?.id }) : undefined}
        />
      )}
    </>
  );
}
