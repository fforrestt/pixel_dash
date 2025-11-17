import { ServerMessage, PlayerInput, CosmeticsData } from './types.js';

export class NetworkClient {
  private ws: WebSocket | null = null;
  private messageHandlers: Map<string, ((data: any) => void)[]> = new Map();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private playerId: string;
  private playerName: string;
  private playerColor: string;

  constructor() {
    // Get or create player ID
    let storedId = localStorage.getItem('playerId');
    if (!storedId) {
      storedId = `player_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      localStorage.setItem('playerId', storedId);
    }
    this.playerId = storedId;

    // Get or create player name
    this.playerName = localStorage.getItem('playerName') || `Player${this.playerId.slice(-6)}`;

    // Get player color
    const storedColor = localStorage.getItem('playerColor');
    this.playerColor = storedColor || '#FF0000';
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.hostname;
      const port = import.meta.env.DEV ? '3001' : window.location.port || '3001';
      const wsUrl = `${protocol}//${host}:${port}`;

      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log('Connected to server');
        this.reconnectAttempts = 0;
        resolve();
      };

      this.ws.onmessage = (event) => {
        try {
          const message: ServerMessage = JSON.parse(event.data);
          this.handleMessage(message);
        } catch (e) {
          console.error('Error parsing message:', e);
        }
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        reject(error);
      };

      this.ws.onclose = () => {
        console.log('Disconnected from server');
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++;
          setTimeout(() => {
            console.log(`Reconnecting... (attempt ${this.reconnectAttempts})`);
            this.connect().catch(console.error);
          }, 1000 * this.reconnectAttempts);
        }
      };
    });
  }

  private handleMessage(message: ServerMessage): void {
    const handlers = this.messageHandlers.get(message.type) || [];
    handlers.forEach(handler => handler(message.data));
  }

  on(type: string, handler: (data: any) => void): void {
    if (!this.messageHandlers.has(type)) {
      this.messageHandlers.set(type, []);
    }
    this.messageHandlers.get(type)!.push(handler);
  }

  off(type: string, handler: (data: any) => void): void {
    const handlers = this.messageHandlers.get(type);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  }

  send(type: string, data: any): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type, data }));
    } else {
      console.warn('WebSocket not connected, cannot send:', type);
    }
  }

  joinPublicLobby(): void {
    this.send('join_public_lobby', {
      playerName: this.playerName,
      playerColor: this.playerColor
    });
  }

  createPrivateLobby(): void {
    this.send('create_private_lobby', {
      playerName: this.playerName,
      playerColor: this.playerColor
    });
  }

  joinPrivateLobby(code: string): void {
    this.send('join_private_lobby', {
      code,
      playerName: this.playerName,
      playerColor: this.playerColor
    });
  }

  leaveLobby(): void {
    this.send('leave_lobby', {});
  }

  voteMode(mode: 'sprint' | 'lap'): void {
    this.send('vote_mode', { mode });
  }

  voteMap(mapId: string): void {
    this.send('vote_map', { mapId });
  }

  startRace(): void {
    this.send('start_race', {});
  }

  sendInput(input: PlayerInput): void {
    this.send('player_input', input);
  }

  getLeaderboard(mode: 'sprint' | 'lap'): void {
    this.send('get_leaderboard', { mode });
  }

  getMapList(type?: 'sprint' | 'lap'): void {
    this.send('get_map_list', { type });
  }

  saveMap(name: string, level: any): void {
    this.send('save_map', { name, level });
  }

  getCosmetics(): void {
    this.send('get_cosmetics', {});
  }

  purchaseColor(color: string): void {
    this.send('purchase_color', { color });
  }

  setColor(color: string): void {
    this.playerColor = color;
    localStorage.setItem('playerColor', color);
    this.send('set_color', { color });
  }

  getPublicLobbies(): void {
    this.send('get_public_lobbies', {});
  }

  setPlayerName(name: string): void {
    this.playerName = name;
    localStorage.setItem('playerName', name);
  }

  getPlayerId(): string {
    return this.playerId;
  }

  getPlayerName(): string {
    return this.playerName;
  }

  getPlayerColor(): string {
    return this.playerColor;
  }
}

