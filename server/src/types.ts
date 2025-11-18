// Shared types for server and client

export type TileType = 'empty' | 'solid' | 'hazard' | 'start' | 'finish' | 'checkpoint';

export interface Tile {
  x: number;
  y: number;
  type: TileType;
}

export interface Level {
  id: string;
  width: number;
  height: number;
  tiles: Tile[];
  type: 'sprint' | 'lap';
  checkpoints?: number[]; // Array of checkpoint tile indices for lap mode
}

export interface Player {
  id: string;
  name: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  grounded: boolean;
  canDash: boolean;
  hasDashed: boolean;
  color: string;
  lapCount: number;
  lastCheckpoint: number;
  finished: boolean;
  finishTime?: number;
  distance: number; // Distance traveled for ranking
  rotation: number; // Rotation angle in degrees for visual effect
}

export interface GameState {
  players: Map<string, Player>;
  level: Level;
  mode: 'sprint' | 'lap';
  startTime: number;
  endTime?: number;
  status: 'waiting' | 'countdown' | 'racing' | 'finished';
  countdown?: number;
}

export interface Lobby {
  id: string;
  name: string;
  isPublic: boolean;
  code?: string;
  players: Map<string, Player>;
  maxPlayers: number;
  gameState: GameState | null;
  votes: {
    mode: Map<string, 'sprint' | 'lap'>;
    map: Map<string, string>; // mapId or 'random'
  };
  votingEndTime?: number;
}

export interface PlayerInput {
  left: boolean;
  right: boolean;
  jump: boolean;
  timestamp: number;
}

export interface ServerMessage {
  type: 'lobby_state' | 'game_state' | 'player_joined' | 'player_left' | 'race_start' | 'race_end' | 'vote_update' | 'error' | 'leaderboard' | 'map_list' | 'cosmetics';
  data: any;
}

export interface RaceResult {
  playerId: string;
  playerName: string;
  placement: number;
  time?: number;
  lapsCompleted?: number;
  coinsEarned: number;
}

export interface LeaderboardEntry {
  playerId: string;
  playerName: string;
  wins: number;
  bestTime?: number;
  mode: 'sprint' | 'lap';
}

export interface CustomMap {
  id: string;
  name: string;
  author: string;
  authorId: string;
  type: 'sprint' | 'lap';
  level: Level;
  createdAt: number;
  timesPlayed: number;
  rating: number;
}

export interface CosmeticsData {
  playerId: string;
  coins: number;
  ownedColors: string[];
  activeColor: string;
}

