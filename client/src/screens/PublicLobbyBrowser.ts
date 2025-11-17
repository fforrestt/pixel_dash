import { NetworkClient } from '../network.js';

export class PublicLobbyBrowserScreen {
  private container: HTMLElement;
  private network: NetworkClient;
  private lobbies: any[] = [];

  constructor(container: HTMLElement, network: NetworkClient) {
    this.container = container;
    this.network = network;

    this.network.on('lobby_state', (data: any) => {
      if (data.publicLobbies) {
        this.lobbies = data.publicLobbies;
        this.render();
      }
    });

    this.loadLobbies();
  }

  private loadLobbies(): void {
    this.network.getPublicLobbies();
  }

  private render(): void {
    this.container.innerHTML = `
      <div class="menu-container">
        <h1>Public Lobby Browser</h1>
        
        <button id="btn-refresh" style="margin: 10px 0;">Refresh</button>

        <div class="lobby-list">
          ${this.lobbies.length === 0 ? '<p>No public lobbies available</p>' : ''}
          ${this.lobbies.map(lobby => `
            <div class="lobby-item">
              <h3>${lobby.name}</h3>
              <p>Players: ${lobby.playerCount}/${lobby.maxPlayers}</p>
              <p>Mode: ${lobby.gameState?.mode || 'Waiting'}</p>
              <p>Status: ${lobby.gameState?.status || 'Waiting'}</p>
              <button data-lobby-id="${lobby.id}">Join</button>
            </div>
          `).join('')}
        </div>

        <button class="menu-button" id="btn-back">Back to Menu</button>
      </div>
    `;

    document.getElementById('btn-refresh')?.addEventListener('click', () => {
      this.loadLobbies();
    });

    document.getElementById('btn-back')?.addEventListener('click', () => {
      this.container.dispatchEvent(new CustomEvent('screen-change', { detail: 'main-menu' }));
    });

    // Join lobby buttons
    this.lobbies.forEach(lobby => {
      const btn = document.querySelector(`[data-lobby-id="${lobby.id}"]`);
      btn?.addEventListener('click', () => {
        this.network.joinPublicLobby();
      });
    });
  }
}

