import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';
import { MapStorage } from './mapStorage.js';
import { Leaderboard } from './leaderboard.js';
import { CosmeticsStore, AVAILABLE_COLORS } from './cosmetics.js';
import { LobbyManager } from './lobbyManager.js';
import { ServerMessage, PlayerInput, CustomMap, Level } from './types.js';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { mkdirSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Ensure data directory exists
const dataDir = path.join(__dirname, '../data');
try {
  mkdirSync(dataDir, { recursive: true });
} catch (e) {
  // Directory might already exist
}

const PORT = process.env.PORT || 3001;
const httpServer = createServer();
const wss = new WebSocketServer({ server: httpServer });

// Initialize storage
const mapStorage = new MapStorage();
const leaderboard = new Leaderboard();
const cosmetics = new CosmeticsStore();
const lobbyManager = new LobbyManager(mapStorage, leaderboard, cosmetics);

// Client connections
const clients = new Map<WebSocket, { playerId: string; lobbyId?: string }>();

// Rate limiting
const rateLimits = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW = 1000; // 1 second
const RATE_LIMIT_MAX = 30; // Max messages per window

function checkRateLimit(ws: WebSocket): boolean {
  const key = ws.url || 'unknown';
  const now = Date.now();
  const limit = rateLimits.get(key);

  if (!limit || now > limit.resetTime) {
    rateLimits.set(key, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return true;
  }

  if (limit.count >= RATE_LIMIT_MAX) {
    return false;
  }

  limit.count++;
  return true;
}

function send(ws: WebSocket, message: ServerMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    try {
      ws.send(JSON.stringify(message));
    } catch (e) {
      console.error('Error sending message:', e);
    }
  }
}

function broadcastToLobby(lobbyId: string, message: ServerMessage, exclude?: WebSocket): void {
  const lobby = lobbyManager.getLobby(lobbyId);
  if (!lobby) return;

  for (const [ws, client] of clients.entries()) {
    if (client.lobbyId === lobbyId && ws !== exclude && ws.readyState === WebSocket.OPEN) {
      send(ws, message);
    }
  }
}

wss.on('connection', (ws: WebSocket, req) => {
  const playerId = uuidv4();
  clients.set(ws, { playerId });

  console.log(`Client connected: ${playerId}`);

  ws.on('message', (data: Buffer) => {
    if (!checkRateLimit(ws)) {
      send(ws, { type: 'error', data: { message: 'Rate limit exceeded' } });
      return;
    }

    try {
      const message = JSON.parse(data.toString());

      switch (message.type) {
        case 'join_public_lobby':
          handleJoinPublicLobby(ws, playerId, message.data);
          break;

        case 'create_private_lobby':
          handleCreatePrivateLobby(ws, playerId, message.data);
          break;

        case 'join_private_lobby':
          handleJoinPrivateLobby(ws, playerId, message.data);
          break;

        case 'leave_lobby':
          handleLeaveLobby(ws, playerId);
          break;

        case 'vote_mode':
          handleVoteMode(ws, playerId, message.data);
          break;

        case 'vote_map':
          handleVoteMap(ws, playerId, message.data);
          break;

        case 'start_race':
          handleStartRace(ws, playerId);
          break;

        case 'player_input':
          handlePlayerInput(ws, playerId, message.data);
          break;

        case 'get_leaderboard':
          handleGetLeaderboard(ws, playerId, message.data);
          break;

        case 'get_map_list':
          handleGetMapList(ws, playerId, message.data);
          break;

        case 'save_map':
          handleSaveMap(ws, playerId, message.data);
          break;

        case 'get_cosmetics':
          handleGetCosmetics(ws, playerId);
          break;

        case 'purchase_color':
          handlePurchaseColor(ws, playerId, message.data);
          break;

        case 'set_color':
          handleSetColor(ws, playerId, message.data);
          break;

        case 'get_public_lobbies':
          handleGetPublicLobbies(ws, playerId);
          break;

        default:
          send(ws, { type: 'error', data: { message: 'Unknown message type' } });
      }
    } catch (e) {
      console.error('Error processing message:', e);
      send(ws, { type: 'error', data: { message: 'Invalid message format' } });
    }
  });

  ws.on('close', () => {
    const client = clients.get(ws);
    if (client?.lobbyId) {
      lobbyManager.leaveLobby(client.lobbyId, playerId);
      broadcastToLobby(client.lobbyId, {
        type: 'player_left',
        data: { playerId }
      });
    }
    clients.delete(ws);
    console.log(`Client disconnected: ${playerId}`);
  });

  // Send initial cosmetics data
  const cosmeticsData = cosmetics.getPlayerCosmetics(playerId);
  send(ws, { type: 'cosmetics', data: cosmeticsData });
});

function handleJoinPublicLobby(ws: WebSocket, playerId: string, data: any): void {
  const { playerName, playerColor } = data;

  // Find or create public lobby
  let lobby = lobbyManager.getPublicLobbies().find(l => l.players.size < l.maxPlayers);
  if (!lobby) {
    lobby = lobbyManager.createLobby(true);
  }

  const result = lobbyManager.joinLobby(lobby.id, playerId, playerName || `Player${playerId.slice(0, 6)}`, playerColor || '#FF0000');
  if (result.success) {
    const client = clients.get(ws);
    if (client) {
      client.lobbyId = lobby.id;
    }

    send(ws, {
      type: 'lobby_state',
      data: {
        lobbyId: lobby.id,
        players: Array.from(lobby.players.values()),
        gameState: lobby.gameState,
        votes: {
          mode: Array.from(lobby.votes.mode.entries()),
          map: Array.from(lobby.votes.map.entries())
        }
      }
    });

    broadcastToLobby(lobby.id, {
      type: 'player_joined',
      data: { player: lobby.players.get(playerId) }
    }, ws);
  } else {
    send(ws, { type: 'error', data: { message: result.error } });
  }
}

function handleCreatePrivateLobby(ws: WebSocket, playerId: string, data: any): void {
  const { playerName, playerColor } = data;
  const lobby = lobbyManager.createLobby(false);

  const result = lobbyManager.joinLobby(lobby.id, playerId, playerName || `Player${playerId.slice(0, 6)}`, playerColor || '#FF0000');
  if (result.success) {
    const client = clients.get(ws);
    if (client) {
      client.lobbyId = lobby.id;
    }

    send(ws, {
      type: 'lobby_state',
      data: {
        lobbyId: lobby.id,
        lobbyCode: lobby.code,
        players: Array.from(lobby.players.values()),
        gameState: lobby.gameState,
        votes: {
          mode: Array.from(lobby.votes.mode.entries()),
          map: Array.from(lobby.votes.map.entries())
        }
      }
    });
  } else {
    send(ws, { type: 'error', data: { message: result.error } });
  }
}

function handleJoinPrivateLobby(ws: WebSocket, playerId: string, data: any): void {
  const { code, playerName, playerColor } = data;
  const lobby = lobbyManager.getLobbyByCode(code);

  if (!lobby) {
    send(ws, { type: 'error', data: { message: 'Invalid lobby code' } });
    return;
  }

  const result = lobbyManager.joinLobby(lobby.id, playerId, playerName || `Player${playerId.slice(0, 6)}`, playerColor || '#FF0000');
  if (result.success) {
    const client = clients.get(ws);
    if (client) {
      client.lobbyId = lobby.id;
    }

    send(ws, {
      type: 'lobby_state',
      data: {
        lobbyId: lobby.id,
        players: Array.from(lobby.players.values()),
        gameState: lobby.gameState,
        votes: {
          mode: Array.from(lobby.votes.mode.entries()),
          map: Array.from(lobby.votes.map.entries())
        }
      }
    });

    broadcastToLobby(lobby.id, {
      type: 'player_joined',
      data: { player: lobby.players.get(playerId) }
    }, ws);
  } else {
    send(ws, { type: 'error', data: { message: result.error } });
  }
}

function handleLeaveLobby(ws: WebSocket, playerId: string): void {
  const client = clients.get(ws);
  if (client?.lobbyId) {
    lobbyManager.leaveLobby(client.lobbyId, playerId);
    broadcastToLobby(client.lobbyId, {
      type: 'player_left',
      data: { playerId }
    });
    client.lobbyId = undefined;
  }
}

function handleVoteMode(ws: WebSocket, playerId: string, data: any): void {
  const { mode } = data;
  const client = clients.get(ws);
  if (client?.lobbyId) {
    lobbyManager.voteMode(client.lobbyId, playerId, mode);
    broadcastToLobby(client.lobbyId, {
      type: 'vote_update',
      data: {
        votes: {
          mode: Array.from(lobbyManager.getLobby(client.lobbyId)!.votes.mode.entries()),
          map: Array.from(lobbyManager.getLobby(client.lobbyId)!.votes.map.entries())
        }
      }
    });
  }
}

function handleVoteMap(ws: WebSocket, playerId: string, data: any): void {
  const { mapId } = data;
  const client = clients.get(ws);
  if (client?.lobbyId) {
    lobbyManager.voteMap(client.lobbyId, playerId, mapId);
    broadcastToLobby(client.lobbyId, {
      type: 'vote_update',
      data: {
        votes: {
          mode: Array.from(lobbyManager.getLobby(client.lobbyId)!.votes.mode.entries()),
          map: Array.from(lobbyManager.getLobby(client.lobbyId)!.votes.map.entries())
        }
      }
    });
  }
}

function handleStartRace(ws: WebSocket, playerId: string): void {
  const client = clients.get(ws);
  if (client?.lobbyId) {
    const result = lobbyManager.startRace(client.lobbyId);
    if (result.success) {
      const lobby = lobbyManager.getLobby(client.lobbyId);
      if (lobby) {
        broadcastToLobby(client.lobbyId, {
          type: 'race_start',
          data: {
            gameState: {
              ...lobby.gameState!,
              players: Array.from(lobby.gameState!.players.values())
            }
          }
        });
      }
    } else {
      send(ws, { type: 'error', data: { message: result.error } });
    }
  }
}

function handlePlayerInput(ws: WebSocket, playerId: string, data: any): void {
  const client = clients.get(ws);
  if (!client?.lobbyId) return;

  const input: PlayerInput = {
    left: data.left || false,
    right: data.right || false,
    jump: data.jump || false,
    timestamp: data.timestamp || Date.now()
  };

  const lobby = lobbyManager.getLobby(client.lobbyId);
  if (lobby?.gameState && lobby.gameState.status === 'racing') {
    const gameLoop = (lobbyManager as any).gameLoops.get(client.lobbyId);
    if (gameLoop) {
      gameLoop.processInput(playerId, input);
    }
  }
}

function handleGetLeaderboard(ws: WebSocket, playerId: string, data: any): void {
  const { mode } = data;
  const topPlayers = leaderboard.getTopPlayers(mode || 'sprint', 10);
  const playerStats = leaderboard.getPlayerStats(playerId);

  send(ws, {
    type: 'leaderboard',
    data: {
      topPlayers,
      playerStats
    }
  });
}

function handleGetMapList(ws: WebSocket, playerId: string, data: any): void {
  const { type } = data;
  const maps = type
    ? mapStorage.getMapsByType(type, 50)
    : mapStorage.getAllMaps(50);

  send(ws, {
    type: 'map_list',
    data: { maps }
  });
}

function handleSaveMap(ws: WebSocket, playerId: string, data: any): void {
  const { name, level } = data;

  const validation = mapStorage.validateMap(level);
  if (!validation.valid) {
    send(ws, { type: 'error', data: { message: validation.error } });
    return;
  }

  const customMap: CustomMap = {
    id: uuidv4(),
    name: name || 'Untitled Map',
    author: `Player${playerId.slice(0, 6)}`,
    authorId: playerId,
    type: level.type,
    level: level as Level,
    createdAt: Date.now(),
    timesPlayed: 0,
    rating: 0
  };

  mapStorage.saveMap(customMap);
  send(ws, {
    type: 'map_list',
    data: { maps: [customMap] }
  });
}

function handleGetCosmetics(ws: WebSocket, playerId: string): void {
  const cosmeticsData = cosmetics.getPlayerCosmetics(playerId);
  send(ws, { type: 'cosmetics', data: cosmeticsData });
}

function handlePurchaseColor(ws: WebSocket, playerId: string, data: any): void {
  const { color } = data;
  const result = cosmetics.purchaseColor(playerId, color);
  if (result.success) {
    const cosmeticsData = cosmetics.getPlayerCosmetics(playerId);
    send(ws, { type: 'cosmetics', data: cosmeticsData });
  } else {
    send(ws, { type: 'error', data: { message: result.error } });
  }
}

function handleSetColor(ws: WebSocket, playerId: string, data: any): void {
  const { color } = data;
  const result = cosmetics.setActiveColor(playerId, color);
  if (result.success) {
    const cosmeticsData = cosmetics.getPlayerCosmetics(playerId);
    send(ws, { type: 'cosmetics', data: cosmeticsData });

    // Update player color in lobby
    const client = clients.get(ws);
    if (client?.lobbyId) {
      const lobby = lobbyManager.getLobby(client.lobbyId);
      const player = lobby?.players.get(playerId);
      if (player) {
        player.color = color;
        broadcastToLobby(client.lobbyId, {
          type: 'lobby_state',
          data: {
            players: Array.from(lobby.players.values())
          }
        });
      }
    }
  } else {
    send(ws, { type: 'error', data: { message: result.error } });
  }
}

function handleGetPublicLobbies(ws: WebSocket, playerId: string): void {
  const lobbies = lobbyManager.getPublicLobbies();
  send(ws, {
    type: 'lobby_state',
    data: {
      publicLobbies: lobbies.map(l => ({
        id: l.id,
        name: l.name,
        playerCount: l.players.size,
        maxPlayers: l.maxPlayers,
        gameState: l.gameState ? {
          mode: l.gameState.mode,
          status: l.gameState.status
        } : null
      }))
    }
  });
}

// Game loop - update all active games (20 ticks per second)
setInterval(() => {
  const deltaTime = 50; // ~20 ticks per second
  const allLobbies = lobbyManager.getAllLobbies();
  
  for (const lobby of allLobbies) {
    // Update game if racing
    if (lobby.gameState?.status === 'racing') {
      lobbyManager.updateGame(lobby.id, deltaTime);
      const updatedLobby = lobbyManager.getLobby(lobby.id);
      
      if (updatedLobby?.gameState) {
        // Broadcast game state
        broadcastToLobby(lobby.id, {
          type: 'game_state',
          data: {
            ...updatedLobby.gameState,
            players: Array.from(updatedLobby.gameState.players.values()),
            elapsed: Date.now() - updatedLobby.gameState.startTime
          }
        });

        // Check for race end
        if (updatedLobby.gameState.status === 'finished') {
          const results = lobbyManager.getRaceResults(lobby.id);
          if (results) {
            broadcastToLobby(lobby.id, {
              type: 'race_end',
              data: { results }
            });

            // Start voting for next round
            setTimeout(() => {
              lobbyManager.startVoting(lobby.id);
              const lobbyAfterVote = lobbyManager.getLobby(lobby.id);
              if (lobbyAfterVote) {
                broadcastToLobby(lobby.id, {
                  type: 'vote_update',
                  data: {
                    votes: {
                      mode: Array.from(lobbyAfterVote.votes.mode.entries()),
                      map: Array.from(lobbyAfterVote.votes.map.entries())
                    },
                    votingEndTime: lobbyAfterVote.votingEndTime
                  }
                });
              }
            }, 5000);
          }
        }
      }
    }
  }

  // Cleanup empty lobbies
  lobbyManager.cleanup();
}, 50); // 20 ticks per second

// Broadcast lobby state updates periodically
setInterval(() => {
  for (const [ws, client] of clients.entries()) {
    if (client.lobbyId) {
      const lobby = lobbyManager.getLobby(client.lobbyId);
      if (lobby) {
        send(ws, {
          type: 'lobby_state',
          data: {
            players: Array.from(lobby.players.values()),
            gameState: lobby.gameState ? {
              ...lobby.gameState,
              players: Array.from(lobby.gameState.players.values()),
              elapsed: lobby.gameState.status === 'racing' ? Date.now() - lobby.gameState.startTime : undefined
            } : null,
            votes: {
              mode: Array.from(lobby.votes.mode.entries()),
              map: Array.from(lobby.votes.map.entries())
            }
          }
        });
      }
    }
  }
}, 100); // 10 times per second

httpServer.listen(PORT, () => {
  console.log(`Pixel Dash Racers server running on port ${PORT}`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('Shutting down...');
  mapStorage.close();
  leaderboard.close();
  cosmetics.close();
  wss.close();
  httpServer.close();
  process.exit(0);
});

