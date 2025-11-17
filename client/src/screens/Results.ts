import { NetworkClient } from '../network.js';
import { RaceResult } from '../types.js';

export class ResultsScreen {
  private container: HTMLElement;
  private network: NetworkClient;
  private results: RaceResult[] = [];

  constructor(container: HTMLElement, network: NetworkClient) {
    this.container = container;
    this.network = network;
  }

  setResults(results: RaceResult[]): void {
    this.results = results;
    this.render();
  }

  private render(): void {
    const sortedResults = [...this.results].sort((a, b) => a.placement - b.placement);

    this.container.innerHTML = `
      <div class="menu-container">
        <h1>Race Results</h1>
        
        <div style="margin: 20px 0;">
          ${sortedResults.map(r => `
            <div style="padding: 10px; margin: 5px 0; background: ${r.placement === 1 ? '#2a4a2a' : '#2a2a2a'}; border: 2px solid #666;">
              <strong>#${r.placement}</strong> ${r.playerName}
              ${r.time ? ` - ${(r.time / 1000).toFixed(2)}s` : ''}
              ${r.lapsCompleted !== undefined ? ` - ${r.lapsCompleted} laps` : ''}
              <div style="color: #0f0; margin-top: 5px;">+${r.coinsEarned} coins</div>
            </div>
          `).join('')}
        </div>

        <button class="menu-button" id="btn-ready">Ready for Next Race</button>
        <button class="menu-button" id="btn-menu">Return to Menu</button>
      </div>
    `;

    document.getElementById('btn-ready')?.addEventListener('click', () => {
      // Return to lobby
      this.container.dispatchEvent(new CustomEvent('screen-change', { detail: 'lobby' }));
    });

    document.getElementById('btn-menu')?.addEventListener('click', () => {
      this.network.leaveLobby();
      this.container.dispatchEvent(new CustomEvent('screen-change', { detail: 'main-menu' }));
    });
  }
}

