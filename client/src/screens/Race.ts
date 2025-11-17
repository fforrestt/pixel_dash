import { Game } from '../game.js';
import { NetworkClient } from '../network.js';
import { GameState, RaceResult } from '../types.js';

export class RaceScreen {
  private container: HTMLElement;
  private network: NetworkClient;
  private game: Game | null = null;
  private canvas: HTMLCanvasElement | null = null;

  constructor(container: HTMLElement, network: NetworkClient) {
    this.container = container;
    this.network = network;

    // Listen for game state updates
    this.network.on('game_state', (data: GameState) => {
      if (this.game) {
        this.game.setGameState(data);
      }
    });

    this.network.on('race_end', (data: { results: RaceResult[] }) => {
      this.container.dispatchEvent(new CustomEvent('screen-change', { 
        detail: { screen: 'results', results: data.results } 
      }));
    });
  }

  render(): void {
    this.container.innerHTML = `
      <canvas id="game-canvas" style="width: 100%; height: 100%;"></canvas>
    `;

    this.canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
    if (this.canvas) {
      this.game = new Game(this.canvas, this.network);
    }
  }

  cleanup(): void {
    if (this.game) {
      this.game.cleanup();
      this.game = null;
    }
  }
}

