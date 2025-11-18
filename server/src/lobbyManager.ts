import { Lobby, Player, GameState, Level, RaceResult } from './types.js';
import { LevelGenerator } from './levelGenerator.js';
import { GameLoop } from './gameLoop.js';
import { MapStorage } from './mapStorage.js';
import { Leaderboard } from './leaderboard.js';
import { CosmeticsStore } from './cosmetics.js';
import { v4 as uuidv4 } from 'uuid';

export class LobbyManager {
  private lobbies: Map<string, Lobby> = new Map();
  private mapStorage: MapStorage;
  private leaderboard: Leaderboard;
  private cosmetics: CosmeticsStore;
  private gameLoops: Map<string, GameLoop> = new Map();

  constructor(mapStorage: MapStorage, leaderboard: Leaderboard, cosmetics: CosmeticsStore) {
    this.mapStorage = mapStorage;
    this.leaderboard = leaderboard;
    this.cosmetics = cosmetics;
  }

  createLobby(isPublic: boolean, name?: string): Lobby {
    const id = uuidv4();
    const code = isPublic ? undefined : this.generateCode();

    const lobby: Lobby = {
      id,
      name: name || (isPublic ? `Public Lobby ${id.slice(0, 6)}` : `Private Lobby`),
      isPublic,
      code,
      players: new Map(),
      maxPlayers: isPublic ? 32 : 16,
      gameState: null,
      votes: {
        mode: new Map(),
        map: new Map()
      }
    };

    this.lobbies.set(id, lobby);
    return lobby;
  }

  getLobby(id: string): Lobby | undefined {
    return this.lobbies.get(id);
  }

  getLobbyByCode(code: string): Lobby | undefined {
    for (const lobby of this.lobbies.values()) {
      if (lobby.code === code) {
        return lobby;
      }
    }
    return undefined;
  }

  getPublicLobbies(): Lobby[] {
    return Array.from(this.lobbies.values()).filter(l => l.isPublic && l.players.size < l.maxPlayers);
  }

  joinLobby(lobbyId: string, playerId: string, playerName: string, playerColor: string): { success: boolean; error?: string } {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) {
      return { success: false, error: 'Lobby not found' };
    }

    if (lobby.players.size >= lobby.maxPlayers) {
      return { success: false, error: 'Lobby is full' };
    }

    if (lobby.players.has(playerId)) {
      return { success: false, error: 'Already in lobby' };
    }

    const player: Player = {
      id: playerId,
      name: playerName,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      grounded: false,
      canDash: true,
      hasDashed: false,
      color: playerColor,
      lapCount: 0,
      lastCheckpoint: -1,
      finished: false,
      distance: 0,
      rotation: 0
    };

    lobby.players.set(playerId, player);
    return { success: true };
  }

  leaveLobby(lobbyId: string, playerId: string): void {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) return;

    lobby.players.delete(playerId);
    lobby.votes.mode.delete(playerId);
    lobby.votes.map.delete(playerId);

    // Clean up empty lobbies
    if (lobby.players.size === 0) {
      this.lobbies.delete(lobbyId);
      this.gameLoops.delete(lobbyId);
    }
  }

  voteMode(lobbyId: string, playerId: string, mode: 'sprint' | 'lap'): void {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby || !lobby.players.has(playerId)) return;

    lobby.votes.mode.set(playerId, mode);
  }

  voteMap(lobbyId: string, playerId: string, mapId: string): void {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby || !lobby.players.has(playerId)) return;

    lobby.votes.map.set(playerId, mapId);
  }

  startVoting(lobbyId: string): void {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) return;

    lobby.votingEndTime = Date.now() + 10000; // 10 seconds to vote
    lobby.votes.mode.clear();
    lobby.votes.map.clear();
  }

  getVoteResults(lobbyId: string): { mode: 'sprint' | 'lap'; mapId: string } | null {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) return null;

    // Count mode votes
    const modeVotes: Map<'sprint' | 'lap', number> = new Map();
    modeVotes.set('sprint', 0);
    modeVotes.set('lap', 0);

    for (const mode of lobby.votes.mode.values()) {
      modeVotes.set(mode, (modeVotes.get(mode) || 0) + 1);
    }

    const selectedMode = modeVotes.get('sprint')! >= modeVotes.get('lap')! ? 'sprint' : 'lap';

    // Count map votes
    const mapVotes: Map<string, number> = new Map();
    for (const mapId of lobby.votes.map.values()) {
      mapVotes.set(mapId, (mapVotes.get(mapId) || 0) + 1);
    }

    let selectedMapId = 'random';
    let maxVotes = 0;
    for (const [mapId, votes] of mapVotes.entries()) {
      if (votes > maxVotes) {
        maxVotes = votes;
        selectedMapId = mapId;
      }
    }

    return { mode: selectedMode, mapId: selectedMapId };
  }

  startRace(lobbyId: string): { success: boolean; error?: string } {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) {
      return { success: false, error: 'Lobby not found' };
    }

    if (lobby.players.size < 2) {
      return { success: false, error: 'Need at least 2 players' };
    }

    // Get vote results
    const voteResults = this.getVoteResults(lobbyId);
    const mode = voteResults?.mode || 'sprint';
    let level: Level;

    // Load or generate level
    if (voteResults?.mapId && voteResults.mapId !== 'random') {
      const customMap = this.mapStorage.getMap(voteResults.mapId);
      if (customMap && customMap.type === mode) {
        level = customMap.level;
        this.mapStorage.incrementPlayCount(voteResults.mapId);
      } else {
        // Fallback to generated
        const generator = new LevelGenerator();
        level = mode === 'sprint' ? generator.generateSprintLevel() : generator.generateLapLevel();
      }
    } else {
      // Generate random level
      const generator = new LevelGenerator();
      level = mode === 'sprint' ? generator.generateSprintLevel() : generator.generateLapLevel();
    }

    // Find start position
    let startX = 0;
    let startY = 0;
    for (const tile of level.tiles) {
      if (tile.type === 'start') {
        startX = tile.x * 16;
        startY = tile.y * 16;
        break;
      }
    }

    // Initialize players at start
    for (const player of lobby.players.values()) {
      player.x = startX;
      player.y = startY;
      player.vx = 0;
      player.vy = 0;
      player.grounded = false;
      player.canDash = true;
      player.hasDashed = false;
      player.lapCount = 0;
      player.lastCheckpoint = -1;
      player.finished = false;
      player.distance = 0;
    }

    // Create game state
    const gameState: GameState = {
      players: new Map(lobby.players),
      level,
      mode,
      startTime: Date.now() + 3000, // 3 second countdown
      status: 'countdown',
      countdown: 3
    };

    lobby.gameState = gameState;

    // Create game loop
    const gameLoop = new GameLoop(gameState);
    this.gameLoops.set(lobbyId, gameLoop);

    // Start countdown
    setTimeout(() => {
      if (lobby.gameState) {
        lobby.gameState.status = 'racing';
        lobby.gameState.startTime = Date.now();
        lobby.gameState.countdown = undefined;
      }
    }, 3000);

    return { success: true };
  }

  updateGame(lobbyId: string, deltaTime: number): void {
    const gameLoop = this.gameLoops.get(lobbyId);
    if (gameLoop) {
      gameLoop.update(deltaTime);
    }
  }

  getRaceResults(lobbyId: string): RaceResult[] | null {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby || !lobby.gameState || lobby.gameState.status !== 'finished') {
      return null;
    }

    const players = Array.from(lobby.gameState.players.values());

    // Sort by finish status, then time, then distance
    players.sort((a, b) => {
      if (a.finished && !b.finished) return -1;
      if (!a.finished && b.finished) return 1;
      if (a.finished && b.finished) {
        return (a.finishTime || 0) - (b.finishTime || 0);
      }
      return b.distance - a.distance;
    });

    const results: RaceResult[] = [];
    for (let i = 0; i < players.length; i++) {
      const player = players[i];
      const placement = i + 1;

      // Calculate coins (base + bonus for top 3)
      let coinsEarned = 50; // Base reward
      if (placement === 1) coinsEarned += 100;
      else if (placement === 2) coinsEarned += 50;
      else if (placement === 3) coinsEarned += 25;

      // Award coins
      this.cosmetics.addCoins(player.id, coinsEarned);

      // Update leaderboard if public lobby and winner
      if (lobby.isPublic && placement === 1 && player.finished && lobby.gameState.players.size >= 4) {
        this.leaderboard.recordWin(
          player.id,
          player.name,
          lobby.gameState.mode,
          player.finishTime
        );
      }

      results.push({
        playerId: player.id,
        playerName: player.name,
        placement,
        time: player.finishTime,
        lapsCompleted: lobby.gameState.mode === 'lap' ? player.lapCount : undefined,
        coinsEarned
      });
    }

    return results;
  }

  private generateCode(): string {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  }

  getAllLobbies(): Lobby[] {
    return Array.from(this.lobbies.values());
  }

  cleanup(): void {
    // Clean up empty lobbies
    for (const [id, lobby] of this.lobbies.entries()) {
      if (lobby.players.size === 0) {
        this.lobbies.delete(id);
        this.gameLoops.delete(id);
      }
    }
  }
}

