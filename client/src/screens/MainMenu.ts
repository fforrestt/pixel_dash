import { NetworkClient } from '../network.js';
import { CustomMap, CosmeticsData, LeaderboardEntry } from '../types.js';

export class MainMenu {
  private container: HTMLElement;
  private network: NetworkClient;
  private cosmetics: CosmeticsData | null = null;

  constructor(container: HTMLElement, network: NetworkClient) {
    this.container = container;
    this.network = network;

    // Listen for cosmetics updates
    this.network.on('cosmetics', (data: CosmeticsData) => {
      this.cosmetics = data;
    });

    this.network.getCosmetics();
    this.render();
  }

  private render(): void {
    this.container.innerHTML = `
      <div class="menu-container">
        <h1 class="menu-title">PIXEL DASH RACERS</h1>
        
        <button class="menu-button" id="btn-quick-play">Quick Play</button>
        <button class="menu-button" id="btn-public-lobbies">Public Lobby Browser</button>
        <button class="menu-button" id="btn-create-private">Create Private Lobby</button>
        <button class="menu-button" id="btn-join-private">Join Private Lobby</button>
        <button class="menu-button" id="btn-map-browser">Custom Map Browser</button>
        <button class="menu-button" id="btn-leaderboard">Leaderboards</button>
        <button class="menu-button" id="btn-cosmetics">Cosmetics</button>
        <button class="menu-button" id="btn-map-editor">Map Editor</button>
        
        <div style="margin-top: 20px; text-align: center;">
          <input type="text" id="player-name" placeholder="Player Name" 
                 value="${this.network.getPlayerName()}" 
                 style="width: 200px; margin-right: 10px;">
          <button id="btn-save-name">Save Name</button>
        </div>
      </div>
    `;

    // Attach event listeners
    document.getElementById('btn-quick-play')?.addEventListener('click', () => {
      this.network.joinPublicLobby();
    });

    document.getElementById('btn-public-lobbies')?.addEventListener('click', () => {
      this.onPublicLobbies();
    });

    document.getElementById('btn-create-private')?.addEventListener('click', () => {
      this.network.createPrivateLobby();
    });

    document.getElementById('btn-join-private')?.addEventListener('click', () => {
      this.onJoinPrivate();
    });

    document.getElementById('btn-map-browser')?.addEventListener('click', () => {
      this.onMapBrowser();
    });

    document.getElementById('btn-leaderboard')?.addEventListener('click', () => {
      this.onLeaderboard();
    });

    document.getElementById('btn-cosmetics')?.addEventListener('click', () => {
      this.onCosmetics();
    });

    document.getElementById('btn-map-editor')?.addEventListener('click', () => {
      this.onMapEditor();
    });

    document.getElementById('btn-save-name')?.addEventListener('click', () => {
      const input = document.getElementById('player-name') as HTMLInputElement;
      if (input?.value) {
        this.network.setPlayerName(input.value);
        alert('Name saved!');
      }
    });
  }

  private onPublicLobbies(): void {
    // This will be handled by the main app to switch screens
    this.container.dispatchEvent(new CustomEvent('screen-change', { detail: 'public-lobbies' }));
  }

  private onJoinPrivate(): void {
    const code = prompt('Enter lobby code:');
    if (code) {
      this.network.joinPrivateLobby(code.toUpperCase());
    }
  }

  private onMapBrowser(): void {
    this.container.dispatchEvent(new CustomEvent('screen-change', { detail: 'map-browser' }));
  }

  private onLeaderboard(): void {
    this.container.dispatchEvent(new CustomEvent('screen-change', { detail: 'leaderboard' }));
  }

  private onCosmetics(): void {
    this.container.dispatchEvent(new CustomEvent('screen-change', { detail: 'cosmetics' }));
  }

  private onMapEditor(): void {
    this.container.dispatchEvent(new CustomEvent('screen-change', { detail: 'map-editor' }));
  }
}

