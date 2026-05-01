"use client";

import { useEffect, useRef, useCallback } from "react";
import type { VideoStateEntry } from "@/lib/types";

declare global {
  interface Window {
    YT: {
      Player: new (
        el: string | HTMLElement,
        opts: {
          height: string;
          width: string;
          videoId: string;
          playerVars: Record<string, unknown>;
          events: { onReady?: (e: { target: YTPlayer }) => void; onStateChange?: (e: { data: number }) => void };
        }
      ) => YTPlayer;
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

interface YTPlayer {
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  getCurrentTime(): number;
  destroy(): void;
}

interface Props {
  roundId: number;
  videoId: string | null;
  videoState: VideoStateEntry | null;
  isLeader: boolean;
  onVideoControl: (action: string, position: number) => void;
  onSetVideo: (url: string) => void;
  onRemoveVideo: () => void;
}

function loadYTScript() {
  if (document.getElementById("yt-script")) return;
  const tag = document.createElement("script");
  tag.id = "yt-script";
  tag.src = "https://www.youtube.com/iframe_api";
  document.head.appendChild(tag);
}

function extractYouTubeId(url: string): string | null {
  if (!url) return null;
  const m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  if (m) return m[1];
  if (/^[a-zA-Z0-9_-]{11}$/.test(url.trim())) return url.trim();
  return null;
}

export function VideoSection({ roundId, videoId, videoState, isLeader, onVideoControl, onSetVideo, onRemoveVideo }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const currentVideoIdRef = useRef<string | null>(null);
  const suppressRef = useRef(false);
  const syncIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const urlInputRef = useRef<HTMLInputElement>(null);

  const clearSync = useCallback(() => {
    if (syncIntervalRef.current) clearInterval(syncIntervalRef.current);
    syncIntervalRef.current = null;
  }, []);

  const startSync = useCallback(() => {
    clearSync();
    syncIntervalRef.current = setInterval(() => {
      if (isLeader && playerRef.current) {
        onVideoControl("sync", playerRef.current.getCurrentTime());
      }
    }, 4000);
  }, [clearSync, isLeader, onVideoControl]);

  const onStateChange = useCallback((event: { data: number }) => {
    if (!isLeader || suppressRef.current) return;
    const pos = playerRef.current?.getCurrentTime() ?? 0;
    if (event.data === 1) { onVideoControl("play", pos); startSync(); }
    else if (event.data === 2 || event.data === 0) { onVideoControl("pause", pos); clearSync(); }
  }, [isLeader, onVideoControl, startSync, clearSync]);

  const mountPlayer = useCallback((vid: string) => {
    if (!containerRef.current || !window.YT?.Player) return;
    if (vid === currentVideoIdRef.current && containerRef.current.childElementCount > 0) return;
    if (playerRef.current) { try { playerRef.current.destroy(); } catch { /* ignore */ } playerRef.current = null; }
    currentVideoIdRef.current = vid;
    containerRef.current.innerHTML = "";
    const div = document.createElement("div");
    div.id = `ytEl-${roundId}`;
    containerRef.current.appendChild(div);
    let startSec = 0;
    if (videoState) {
      startSec = videoState.playing
        ? videoState.position + (Date.now() - videoState.position_at_ms) / 1000
        : videoState.position;
      startSec = Math.max(0, Math.floor(startSec));
    }
    playerRef.current = new window.YT.Player(div, {
      height: "100%",
      width: "100%",
      videoId: vid,
      playerVars: { controls: isLeader ? 1 : 0, playsinline: 1, rel: 0, modestbranding: 1, disablekb: isLeader ? 0 : 1, fs: 1, iv_load_policy: 3, start: startSec },
      events: {
        onReady: (e) => { if (videoState?.playing) e.target.playVideo(); },
        onStateChange,
      },
    });
  }, [roundId, videoState, isLeader, onStateChange]);

  useEffect(() => {
    loadYTScript();
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (prev) prev();
      if (videoId) mountPlayer(videoId);
    };
    if (window.YT?.Player && videoId) mountPlayer(videoId);
    return () => { clearSync(); if (playerRef.current) { try { playerRef.current.destroy(); } catch { /* ignore */ } } };
  }, []); // mount once

  useEffect(() => {
    if (videoId && window.YT?.Player) mountPlayer(videoId);
    if (!videoId) { currentVideoIdRef.current = null; if (containerRef.current) containerRef.current.innerHTML = ""; }
  }, [videoId, mountPlayer]);

  // Apply incoming video_control events to non-leader
  const applyRemoteControl = useCallback((action: string, position: number, serverTs: number) => {
    if (isLeader || !playerRef.current) return;
    const drift = (Date.now() - serverTs) / 1000;
    const adj = Math.max(0, position + (action !== "pause" ? drift : 0));
    suppressRef.current = true;
    playerRef.current.seekTo(adj, true);
    if (action !== "pause") playerRef.current.playVideo(); else playerRef.current.pauseVideo();
    setTimeout(() => { suppressRef.current = false; }, 600);
  }, [isLeader]);

  // Expose applyRemoteControl via ref on window (VideoSection is used by GamePage)
  useEffect(() => {
    (window as Record<string, unknown>)[`applyVideoControl_${roundId}`] = applyRemoteControl;
    return () => { delete (window as Record<string, unknown>)[`applyVideoControl_${roundId}`]; };
  }, [roundId, applyRemoteControl]);

  if (!videoId && !isLeader) return null;

  return (
    <div className="video-section">
      <div className="video-section-header">
        <span className="field-label" style={{ margin: 0, fontSize: 10 }}>VÍDEO DA RODADA</span>
        {videoId && isLeader && (
          <button className="btn-icon danger" onClick={onRemoveVideo} title="Remover vídeo">✕</button>
        )}
      </div>
      {isLeader && !videoId && (
        <div className="video-url-row">
          <input
            ref={urlInputRef}
            className="text-input"
            placeholder="Link do YouTube..."
            style={{ fontSize: 13, padding: "9px 12px" }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const vid = extractYouTubeId(urlInputRef.current?.value.trim() ?? "");
                if (!vid) { alert("URL do YouTube inválida"); return; }
                onSetVideo(vid);
                if (urlInputRef.current) urlInputRef.current.value = "";
              }
            }}
          />
          <button
            className="btn btn-ghost"
            style={{ padding: "9px 14px", fontSize: 13, whiteSpace: "nowrap" }}
            onClick={() => {
              const vid = extractYouTubeId(urlInputRef.current?.value.trim() ?? "");
              if (!vid) { alert("URL do YouTube inválida"); return; }
              onSetVideo(vid);
              if (urlInputRef.current) urlInputRef.current.value = "";
            }}
          >
            CARREGAR
          </button>
        </div>
      )}
      {videoId && (
        <div className="video-wrapper">
          <div ref={containerRef} />
          {!isLeader && <div className="video-overlay" />}
        </div>
      )}
    </div>
  );
}
