import { NetworkClient } from '../network.js';
import { CosmeticsData } from '../types.js';

// Available colors (matching server)
const COLORS = [
  '#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF',
  '#FFA500', '#800080', '#FFC0CB', '#A52A2A', '#808080', '#000000',
  '#FFFFFF', '#FFD700', '#C0C0C0', '#FF1493'
];

export class CosmeticsScreen {
  private container: HTMLElement;
  private network: NetworkClient;
  private cosmetics: CosmeticsData | null = null;
  private isActive: boolean = false; // Track if this screen is currently active

  constructor(container: HTMLElement, network: NetworkClient) {
    this.container = container;
    this.network = network;

    this.network.on('cosmetics', (data: CosmeticsData) => {
      this.cosmetics = data;
      // Only re-render if this screen is currently active
      if (this.isActive) {
        this.renderContent();
      }
    });
  }

  render(): void {
    // Mark screen as active
    this.isActive = true;
    
    // Request cosmetics data when screen is shown
    this.network.getCosmetics();
    
    // If we already have cosmetics data, render immediately
    if (this.cosmetics) {
      this.renderContent();
    } else {
      // Otherwise show loading state
      this.container.innerHTML = '<p>Loading...</p>';
    }
  }

  cleanup(): void {
    // Mark screen as inactive when cleaned up
    this.isActive = false;
  }

  private renderContent(): void {
    if (!this.cosmetics) {
      this.container.innerHTML = '<p>Loading...</p>';
      return;
    }

    this.container.innerHTML = `
      <div class="menu-container">
        <h1>Cosmetics Shop</h1>
        
        <div style="margin: 20px 0; font-size: 24px;">
          <strong>Coins: ${this.cosmetics.coins}</strong>
        </div>

        <h2>Available Colors</h2>
        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 20px 0;">
          ${COLORS.map(color => {
            const owned = this.cosmetics!.ownedColors.includes(color);
            const active = this.cosmetics!.activeColor === color;
            const cost = 100;

            return `
              <div style="padding: 15px; border: 3px solid ${active ? '#0f0' : owned ? '#666' : '#333'}; 
                          background: #2a2a2a; text-align: center;">
                <div style="width: 50px; height: 50px; background: ${color}; 
                            margin: 0 auto 10px; border: 2px solid #fff;"></div>
                ${active ? '<strong>ACTIVE</strong>' : ''}
                ${owned && !active ? `
                  <button data-color="${color}" data-action="select" style="width: 100%; margin-top: 5px;">Select</button>
                ` : ''}
                ${!owned ? `
                  <div>Cost: ${cost} coins</div>
                  <button data-color="${color}" data-action="buy" 
                          ${this.cosmetics!.coins < cost ? 'disabled' : ''} 
                          style="width: 100%; margin-top: 5px;">Buy</button>
                ` : ''}
              </div>
            `;
          }).join('')}
        </div>

        <button class="menu-button" id="btn-back">Back to Menu</button>
      </div>
    `;

    document.getElementById('btn-back')?.addEventListener('click', () => {
      this.container.dispatchEvent(new CustomEvent('screen-change', { detail: 'main-menu' }));
    });

    // Color buttons
    document.querySelectorAll('[data-color]').forEach(btn => {
      btn.addEventListener('click', () => {
        const color = (btn as HTMLElement).dataset.color!;
        const action = (btn as HTMLElement).dataset.action!;

        if (action === 'buy') {
          this.network.purchaseColor(color);
        } else if (action === 'select') {
          this.network.setColor(color);
        }
      });
    });
  }
}

