import { NetworkClient } from '../network.js';
import { Lobby, GameState } from '../types.js';

export class LobbyScreen {
  private container: HTMLElement;
  private network: NetworkClient;
  private lobby: Lobby | null = null;

  constructor(container: HTMLElement, network: NetworkClient) {
    this.container = container;
    this.network = network;

    // Listen for lobby updates
    this.network.on('lobby_state', (data: any) => {
      this.lobby = {
        id: data.lobbyId,
        name: data.name || 'Lobby',
        isPublic: true,
        code: data.lobbyCode,
        players: data.players || [],
        maxPlayers: 32,
        gameState: data.gameState,
        votes: data.votes || { mode: [], map: [] }
      };
      this.render();
    });

    this.network.on('player_joined', (data: any) => {
      if (this.lobby) {
        this.lobby.players.push(data.player);
        this.render();
      }
    });

    this.network.on('player_left', (data: any) => {
      if (this.lobby) {
        this.lobby.players = this.lobby.players.filter(p => p.id !== data.playerId);
        this.render();
      }
    });

    this.network.on('vote_update', (data: any) => {
      if (this.lobby) {
        this.lobby.votes = data.votes;
        this.render();
      }
    });

    this.network.on('race_start', (data: any) => {
      this.container.dispatchEvent(new CustomEvent('screen-change', { detail: 'race' }));
    });
  }

  render(): void {
    if (!this.lobby) {
      this.container.innerHTML = '<p>Loading lobby...</p>';
      return;
    }

    const modeVotes = new Map<string, number>();
    modeVotes.set('sprint', 0);
    modeVotes.set('lap', 0);
    for (const [_, mode] of this.lobby.votes.mode) {
      modeVotes.set(mode, (modeVotes.get(mode) || 0) + 1);
    }

    const mapVotes = new Map<string, number>();
    for (const [_, mapId] of this.lobby.votes.map) {
      mapVotes.set(mapId, (mapVotes.get(mapId) || 0) + 1);
    }

    this.container.innerHTML = `
      <div class="menu-container">
        <h2>${this.lobby.name}</h2>
        ${this.lobby.code ? `<p>Lobby Code: <strong>${this.lobby.code}</strong></p>` : ''}
        
        <h3>Players (${this.lobby.players.length}/${this.lobby.maxPlayers})</h3>
        <div class="lobby-list">
          ${this.lobby.players.map(p => `<div>${p.name} <span style="color: ${p.color}">■</span></div>`).join('')}
        </div>

        <h3>Vote for Next Round</h3>
        <div>
          <h4>Mode:</h4>
          <button id="vote-sprint">Sprint (${modeVotes.get('sprint') || 0})</button>
          <button id="vote-lap">Lap (${modeVotes.get('lap') || 0})</button>
        </div>

        <div style="margin-top: 20px;">
          <h4>Map:</h4>
          <button id="vote-random">Random (${mapVotes.get('random') || 0})</button>
        </div>

        <div style="margin-top: 30px;">
          <button class="menu-button" id="btn-start-race">Start Race</button>
          <button class="menu-button" id="btn-leave">Leave Lobby</button>
        </div>
      </div>
    `;

    // Attach event listeners
    document.getElementById('vote-sprint')?.addEventListener('click', () => {
      this.network.voteMode('sprint');
    });

    document.getElementById('vote-lap')?.addEventListener('click', () => {
      this.network.voteMode('lap');
    });

    document.getElementById('vote-random')?.addEventListener('click', () => {
      this.network.voteMap('random');
    });

    document.getElementById('btn-start-race')?.addEventListener('click', () => {
      this.network.startRace();
    });

    document.getElementById('btn-leave')?.addEventListener('click', () => {
      this.network.leaveLobby();
      this.container.dispatchEvent(new CustomEvent('screen-change', { detail: 'main-menu' }));
    });
  }
}

