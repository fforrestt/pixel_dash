import { NetworkClient } from '../network.js';
import { LeaderboardEntry } from '../types.js';

export class LeaderboardScreen {
  private container: HTMLElement;
  private network: NetworkClient;
  private topPlayers: LeaderboardEntry[] = [];
  private playerStats: LeaderboardEntry[] = [];
  private currentMode: 'sprint' | 'lap' = 'sprint';

  constructor(container: HTMLElement, network: NetworkClient) {
    this.container = container;
    this.network = network;

    this.network.on('leaderboard', (data: any) => {
      this.topPlayers = data.topPlayers || [];
      this.playerStats = data.playerStats || [];
      this.render();
    });

    this.loadLeaderboard();
  }

  private loadLeaderboard(): void {
    this.network.getLeaderboard(this.currentMode);
  }

  private render(): void {
    this.container.innerHTML = `
      <div class="menu-container">
        <h1>Leaderboards</h1>
        
        <div style="margin: 20px 0;">
          <button id="mode-sprint" ${this.currentMode === 'sprint' ? 'style="background: #0a0;"' : ''}>Sprint</button>
          <button id="mode-lap" ${this.currentMode === 'lap' ? 'style="background: #0a0;"' : ''}>Lap</button>
        </div>

        <h2>Top Players</h2>
        <div class="lobby-list">
          ${this.topPlayers.length === 0 ? '<p>No records yet</p>' : ''}
          ${this.topPlayers.map((entry, index) => `
            <div style="padding: 10px; margin: 5px 0; background: ${index < 3 ? '#2a4a2a' : '#2a2a2a'};">
              <strong>#${index + 1}</strong> ${entry.playerName} - 
              Wins: ${entry.wins} 
              ${entry.bestTime ? ` - Best: ${(entry.bestTime / 1000).toFixed(2)}s` : ''}
            </div>
          `).join('')}
        </div>

        <h2>Your Stats</h2>
        <div class="lobby-list">
          ${this.playerStats.length === 0 ? '<p>No stats yet</p>' : ''}
          ${this.playerStats.filter(s => s.mode === this.currentMode).map(entry => `
            <div style="padding: 10px; margin: 5px 0; background: #2a2a2a;">
              Wins: ${entry.wins}
              ${entry.bestTime ? ` - Best: ${(entry.bestTime / 1000).toFixed(2)}s` : ''}
            </div>
          `).join('')}
        </div>

        <button class="menu-button" id="btn-back">Back to Menu</button>
      </div>
    `;

    document.getElementById('mode-sprint')?.addEventListener('click', () => {
      this.currentMode = 'sprint';
      this.loadLeaderboard();
    });

    document.getElementById('mode-lap')?.addEventListener('click', () => {
      this.currentMode = 'lap';
      this.loadLeaderboard();
    });

    document.getElementById('btn-back')?.addEventListener('click', () => {
      this.container.dispatchEvent(new CustomEvent('screen-change', { detail: 'main-menu' }));
    });
  }
}

