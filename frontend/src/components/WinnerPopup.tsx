"use client";

import { useEffect, useRef } from "react";
import type { Round } from "@/lib/types";

interface Props {
  round: Round;
  onClose: () => void;
}

function playApplause() {
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const now = ctx.currentTime;
    function clap(time: number, freq: number, gain: number) {
      const len = Math.floor(ctx.sampleRate * 0.11);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.2);
      const src = ctx.createBufferSource(); src.buffer = buf;
      const f = ctx.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = freq; f.Q.value = 1.2;
      const f2 = ctx.createBiquadFilter(); f2.type = "highpass"; f2.frequency.value = 600;
      const g = ctx.createGain(); g.gain.setValueAtTime(gain, time); g.gain.exponentialRampToValueAtTime(0.001, time + 0.18);
      src.connect(f); f.connect(f2); f2.connect(g); g.connect(ctx.destination);
      src.start(time); src.stop(time + 0.22);
    }
    [0, 0.08, 0.16, 0.26, 0.36, 0.48, 0.62, 0.78, 0.96, 1.16, 1.38, 1.62].forEach((t) => {
      clap(now + t, 1000 + Math.random() * 400, 0.5 + Math.random() * 0.4);
      clap(now + t + Math.random() * 0.03, 1300 + Math.random() * 300, 0.3 + Math.random() * 0.3);
      clap(now + t + Math.random() * 0.05, 800 + Math.random() * 300, 0.2 + Math.random() * 0.25);
    });
    setTimeout(() => ctx.close(), 2500);
  } catch { /* ignore */ }
}

export function WinnerPopup({ round, onClose }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<number | null>(null);

  const scores = Object.entries(round.scores || {});
  const ranking = scores
    .map(([uid, s]) => ({ uid, ...s }))
    .sort((a, b) => b.points - a.points);
  const winner = ranking[0];
  const maxPts = Math.max(winner?.points ?? 1, 1);

  useEffect(() => {
    playApplause();
    launchConfetti();
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, []);

  function launchConfetti() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const colors = ["#FF4500","#FF8C00","#FFD700","#00BFFF","#FF69B4","#7CFC00","#DA70D6","#FF1493","#00FFD0"];
    type Particle = { x:number;y:number;w:number;h:number;color:string;vx:number;vy:number;rot:number;rotV:number;op:number;circle:boolean };
    const particles: Particle[] = [];
    function spawn(n: number) {
      for (let i = 0; i < n; i++) {
        const circle = Math.random() > 0.5;
        particles.push({ x:Math.random()*canvas!.width, y:-10-Math.random()*120, w:Math.random()*11+5, h:circle?Math.random()*11+5:Math.random()*6+3, color:colors[Math.floor(Math.random()*colors.length)], vx:(Math.random()-0.5)*5, vy:Math.random()*4+1.5, rot:Math.random()*360, rotV:(Math.random()-0.5)*9, op:1, circle });
      }
    }
    spawn(220); setTimeout(()=>spawn(80),400); setTimeout(()=>spawn(60),900);
    function animate() {
      ctx.clearRect(0,0,canvas!.width,canvas!.height);
      for (let i = particles.length-1; i >= 0; i--) {
        const p = particles[i];
        p.x+=p.vx; p.y+=p.vy; p.rot+=p.rotV; p.vy+=0.07; p.vx*=0.992;
        if (p.y > canvas!.height*0.75) p.op -= 0.018;
        if (p.op<=0||p.y>canvas!.height+20) { particles.splice(i,1); continue; }
        ctx.save(); ctx.globalAlpha=p.op; ctx.translate(p.x,p.y); ctx.rotate(p.rot*Math.PI/180); ctx.fillStyle=p.color;
        if (p.circle) { ctx.beginPath(); ctx.arc(0,0,p.w/2,0,Math.PI*2); ctx.fill(); } else { ctx.fillRect(-p.w/2,-p.h/2,p.w,p.h); }
        ctx.restore();
      }
      if (particles.length > 0) frameRef.current = requestAnimationFrame(animate);
      else { frameRef.current = null; ctx.clearRect(0,0,canvas!.width,canvas!.height); }
    }
    frameRef.current = requestAnimationFrame(animate);
  }

  const posLabels = ["1º","2º","3º"];
  const posClasses = ["p1","p2","p3"];
  const rankClasses = ["rank-1","rank-2","rank-3"];

  return (
    <>
      <canvas ref={canvasRef} style={{ position:"fixed", inset:0, zIndex:501, pointerEvents:"none", width:"100%", height:"100%" }} />
      <div className="winner-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
        <div className="popup-box">
          <div className="popup-glow" />
          <div className="popup-header">
            <div className="winner-crown">👑</div>
            <div className="winner-label">VENCEDOR DA RODADA</div>
            {winner && (
              <div className="winner-avatar-large" style={{ borderColor: winner.color, background: winner.color + "22", boxShadow: `0 0 30px ${winner.color}60`, color: winner.color }}>
                {winner.avatar ? <img src={winner.avatar} alt={winner.name} style={{ width:"100%",height:"100%",objectFit:"cover" }} /> : (winner.name||"?").substring(0,2).toUpperCase()}
              </div>
            )}
            <div className="winner-name" style={{ color: winner?.color }}>{winner?.name}</div>
            <div className="winner-round-score">
              pontos nesta rodada:{" "}
              <span style={{ fontFamily:"var(--font-orbitron)",fontSize:22,fontWeight:900,color:winner?.color }}>{winner?.points}</span>
            </div>
          </div>

          <div className="popup-ranking">
            <div className="ranking-title">RANKING DA RODADA</div>
            {ranking.map((p, i) => (
              <div
                key={p.uid}
                className={`ranking-item ${i < 3 ? rankClasses[i] : ""}`}
                style={{ animationDelay: `${i * 0.12 + 0.6}s` }}
              >
                <div className={`rank-pos ${i < 3 ? posClasses[i] : "other"}`} style={{ color: i === 0 ? "var(--gold)" : i === 1 ? "#C0C0C0" : i === 2 ? "#CD7F32" : "var(--text2)" }}>
                  {i < 3 ? posLabels[i] : `${i+1}º`}
                </div>
                <div className="rank-avatar" style={{ borderColor: p.color, background: p.color + "22", color: p.color }}>
                  {p.avatar ? <img src={p.avatar} alt={p.name} /> : (p.name||"?").substring(0,2).toUpperCase()}
                </div>
                <div className="rank-info">
                  <div className="rank-name" style={{ color: p.color }}>{p.name}</div>
                  <div className="rank-bar-track">
                    <div className="rank-bar-fill" style={{ width:`${(p.points/maxPts)*100}%`,background:p.color,transition:`width 0.6s ease ${i*0.12+0.8}s` }} />
                  </div>
                </div>
                <div className="rank-score" style={{ color: p.color }}>{p.points}</div>
              </div>
            ))}
          </div>

          <button className="btn-close-popup" onClick={onClose}>FECHAR</button>
        </div>
      </div>
    </>
  );
}
