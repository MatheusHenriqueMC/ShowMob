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
  const playEmitTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const urlInputRef = useRef<HTMLInputElement>(null);
  const videoStateRef = useRef<typeof videoState>(videoState);
  const onStateChangeRef = useRef<(e: { data: number }) => void>(() => {});

  useEffect(() => { videoStateRef.current = videoState; }, [videoState]);

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
    }, 2000);
  }, [clearSync, isLeader, onVideoControl]);

  const onStateChange = useCallback((event: { data: number }) => {
    if (!isLeader || suppressRef.current) return;
    if (event.data === 1) {
      startSync();
      // Delay reading getCurrentTime() — on pause→play transitions (especially after
      // long pauses during timer), YouTube's player returns 0 during the buffering
      // instant before the internal clock resumes from the correct position.
      if (playEmitTimeoutRef.current) clearTimeout(playEmitTimeoutRef.current);
      playEmitTimeoutRef.current = setTimeout(() => {
        playEmitTimeoutRef.current = null;
        if (playerRef.current) onVideoControl("play", playerRef.current.getCurrentTime());
      }, 150);
    } else if (event.data === 2 || event.data === 0) {
      if (playEmitTimeoutRef.current) { clearTimeout(playEmitTimeoutRef.current); playEmitTimeoutRef.current = null; }
      const pos = playerRef.current?.getCurrentTime() ?? 0;
      onVideoControl("pause", pos);
      clearSync();
    }
  }, [isLeader, onVideoControl, startSync, clearSync]);

  useEffect(() => { onStateChangeRef.current = onStateChange; }, [onStateChange]);

  const mountPlayer = useCallback((vid: string) => {
    if (!containerRef.current || !window.YT?.Player) return;
    if (vid === currentVideoIdRef.current && containerRef.current.childElementCount > 0) { console.log("[VS] mountPlayer guard passed, skipping"); return; }
    console.log("[VS] mountPlayer CREATING player", { vid, prevVid: currentVideoIdRef.current, childCount: containerRef.current?.childElementCount, vs: videoStateRef.current });
    if (playerRef.current) { try { playerRef.current.destroy(); } catch { /* ignore */ } playerRef.current = null; }
    currentVideoIdRef.current = vid;
    containerRef.current.innerHTML = "";
    const div = document.createElement("div");
    div.id = `ytEl-${roundId}`;
    containerRef.current.appendChild(div);
    // Read videoState from ref so mountPlayer isn't recreated on every sync event
    const vs = videoStateRef.current;
    let startSec = 0;
    if (vs) {
      startSec = vs.playing
        ? vs.position + (Date.now() - vs.position_at_ms) / 1000
        : vs.position;
      startSec = Math.max(0, Math.floor(startSec));
    }
    playerRef.current = new window.YT.Player(div, {
      height: "100%",
      width: "100%",
      videoId: vid,
      playerVars: { controls: isLeader ? 1 : 0, playsinline: 1, rel: 0, modestbranding: 1, disablekb: isLeader ? 0 : 1, fs: 1, iv_load_policy: 3, start: startSec },
      events: {
        onReady: (e) => { if (vs?.playing) e.target.playVideo(); },
        // Wrap via ref so the player always calls the latest onStateChange without
        // needing to recreate the player when onStateChange's deps change.
        onStateChange: (e) => onStateChangeRef.current(e),
      },
    });
  }, [roundId, isLeader]);

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
    if (isLeader || !playerRef.current) { console.log("[VS] applyRemoteControl skipped", { isLeader, hasPlayer: !!playerRef.current }); return; }
    const drift = (Date.now() - serverTs) / 1000;
    console.log("[VS] applyRemoteControl", { action, position, drift, current: playerRef.current.getCurrentTime() });

    if (action === "pause") {
      suppressRef.current = true;
      playerRef.current.seekTo(position, true);
      playerRef.current.pauseVideo();
      setTimeout(() => { suppressRef.current = false; }, 600);
      return;
    }

    if (action === "sync") {
      // Only correct if the follower has drifted more than 1.5s to avoid jarring micro-seeks
      const current = playerRef.current.getCurrentTime();
      const adj = Math.max(0, position + drift);
      console.log("[VS] sync check", { current, adj, diff: Math.abs(current - adj) });
      if (Math.abs(current - adj) < 1.5) return;
      suppressRef.current = true;
      playerRef.current.seekTo(adj, true);
      playerRef.current.playVideo();
      setTimeout(() => { suppressRef.current = false; }, 600);
      return;
    }

    // play event: add 0.5s to compensate for YouTube's seek+buffer startup latency
    const adj = Math.max(0, position + drift + 0.5);
    suppressRef.current = true;
    playerRef.current.seekTo(adj, true);
    playerRef.current.playVideo();
    setTimeout(() => { suppressRef.current = false; }, 600);
  }, [isLeader]);

  // Expose applyRemoteControl via ref on window (VideoSection is used by GamePage)
  useEffect(() => {
    (window as unknown as Record<string, unknown>)[`applyVideoControl_${roundId}`] = applyRemoteControl;
    return () => { delete (window as unknown as Record<string, unknown>)[`applyVideoControl_${roundId}`]; };
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
