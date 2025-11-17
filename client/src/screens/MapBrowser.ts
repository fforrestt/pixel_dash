import { NetworkClient } from '../network.js';
import { CustomMap } from '../types.js';

export class MapBrowserScreen {
  private container: HTMLElement;
  private network: NetworkClient;
  private maps: CustomMap[] = [];
  private filterType: 'sprint' | 'lap' | null = null;

  constructor(container: HTMLElement, network: NetworkClient) {
    this.container = container;
    this.network = network;

    this.network.on('map_list', (data: { maps: CustomMap[] }) => {
      this.maps = data.maps;
      this.render();
    });

    this.loadMaps();
  }

  private loadMaps(): void {
    if (this.filterType) {
      this.network.getMapList(this.filterType);
    } else {
      this.network.getMapList();
    }
  }

  private render(): void {
    this.container.innerHTML = `
      <div class="menu-container">
        <h1>Custom Map Browser</h1>
        
        <div style="margin: 20px 0;">
          <button id="filter-all">All</button>
          <button id="filter-sprint">Sprint</button>
          <button id="filter-lap">Lap</button>
        </div>

        <div class="lobby-list">
          ${this.maps.length === 0 ? '<p>No maps available</p>' : ''}
          ${this.maps.map(map => `
            <div class="map-item">
              <h3>${map.name}</h3>
              <p>Author: ${map.author} | Type: ${map.type} | Played: ${map.timesPlayed}x</p>
              <button data-map-id="${map.id}">Select for Private Lobby</button>
            </div>
          `).join('')}
        </div>

        <button class="menu-button" id="btn-back">Back to Menu</button>
      </div>
    `;

    document.getElementById('filter-all')?.addEventListener('click', () => {
      this.filterType = null;
      this.loadMaps();
    });

    document.getElementById('filter-sprint')?.addEventListener('click', () => {
      this.filterType = 'sprint';
      this.loadMaps();
    });

    document.getElementById('filter-lap')?.addEventListener('click', () => {
      this.filterType = 'lap';
      this.loadMaps();
    });

    document.getElementById('btn-back')?.addEventListener('click', () => {
      this.container.dispatchEvent(new CustomEvent('screen-change', { detail: 'main-menu' }));
    });

    // Map selection buttons
    this.maps.forEach(map => {
      const btn = document.querySelector(`[data-map-id="${map.id}"]`);
      btn?.addEventListener('click', () => {
        // Store selected map and create private lobby
        localStorage.setItem('selectedMapId', map.id);
        this.network.createPrivateLobby();
      });
    });
  }
}

