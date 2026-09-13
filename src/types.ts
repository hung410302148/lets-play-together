export type Mode = "lobby" | "box" | "likely" | "photo";
export type Question = {
  id: string;
  text: string;
  mode: Mode;
  status: string;
  author: string;
  target: string;
  source: string;
  passed?: boolean;
};
export type Mission = {
  id: string;
  text: string;
  owner: string | null;
  deadline: number;
  revealed: boolean;
  settled: boolean;
};
export type Photo = {
  id: string;
  mission: string;
  owner: string;
  path: string;
  caption: string;
  status: string;
};
export type Result = {
  counts: Record<string, number>;
  winners: string[];
  unique: string[];
  total: number;
  names: Record<string, string>;
};
export type Room = {
  host: string;
  expiresAt: number;
  mode: Mode;
  members: Record<string, { name: string; seen: number }>;
  current: Record<string, string | null>;
  questions: Question[];
  missions: Mission[];
  photos: Photo[];
  photoProgress: { mission: string; owner: string; submitted: boolean }[];
  comments: {
    id: string;
    target: string;
    uid: string;
    name: string;
    text: string;
    at: number;
  }[];
  reactions: Record<string, Record<string, string>>;
  notifications: { id: string; text: string; at: number }[];
  anonymous: boolean;
  round: null | {
    id: string;
    question: string;
    locked: boolean;
    eligible: string[];
    received: number;
    myVote: string | null;
    result: Result | null;
    votes: Record<string, string> | null;
  };
  photoResults: Record<string, Result>;
  myPhotoVotes: Record<string, string>;
};
