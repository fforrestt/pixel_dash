// Shared types matching server

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
  checkpoints?: number[];
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
  hasFirstJumped: boolean; // Track if first jump has been used
  hasSecondJump: boolean; // Track if second jump is available
  dashCooldown: number; // Cooldown timer for dash (in ticks)
  isDashing: boolean; // Track if player is currently dashing
  dashRemaining: number; // Remaining distance to dash (in pixels)
  dashStartTime?: number; // Timestamp when dash started (for client-side interpolation)
  dashStartX?: number; // Starting X position for dash interpolation
  dashTargetX?: number; // Target X position for dash interpolation
  color: string;
  lapCount: number;
  lastCheckpoint: number;
  finished: boolean;
  finishTime?: number;
  distance: number;
  rotation: number;
}

export interface GameState {
  players: Player[];
  level: Level;
  mode: 'sprint' | 'lap';
  startTime: number;
  endTime?: number;
  status: 'waiting' | 'countdown' | 'racing' | 'finished';
  countdown?: number;
  elapsed?: number;
}

export interface Lobby {
  id: string;
  name: string;
  isPublic: boolean;
  code?: string;
  players: Player[];
  maxPlayers: number;
  gameState: GameState | null;
  votes: {
    mode: [string, 'sprint' | 'lap'][];
    map: [string, string][];
  };
  votingEndTime?: number;
}

export interface PlayerInput {
  left: boolean;
  right: boolean;
  jump: boolean;
  dash: boolean; // F key for dash
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

