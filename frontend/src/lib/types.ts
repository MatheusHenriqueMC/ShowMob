export interface User {
  id: number;
  username: string;
  role: string;
  display_name: string;
  avatar: string | null;
  color: string;
}

export interface Member {
  id: number;
  display_name: string;
  avatar: string | null;
  color: string;
}

export interface Room {
  id: number;
  code: string;
  name: string;
  host_id: number;
  members: Member[];
}

export interface ScoreEntry {
  points: number;
  name: string;
  avatar?: string | null;
  color: string;
}

export interface VideoStateEntry {
  playing: boolean;
  position: number;
  position_at_ms: number;
}

export interface Round {
  id: number;
  number: number;
  title: string | null;
  created_at: string;
  video_id: string | null;
  video_state: VideoStateEntry | null;
  scores: Record<string, ScoreEntry>;
}

export interface Total {
  id: number;
  name: string;
  avatar: string | null;
  color: string;
  total: number;
}

export interface TimerState {
  session_id: string;
  duration: number;
  round_id: number;
  end_at_ms: number;
}

export interface AdminUser {
  id: number;
  username: string;
  display_name: string | null;
  role: string;
  color: string;
  avatar: string | null;
}
