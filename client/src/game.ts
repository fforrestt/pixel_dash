import { GameState, Player, PlayerInput } from './types.js';
import { Renderer } from './renderer.ts';
import { InputManager } from './input.ts';
import { NetworkClient } from './network.ts';

export class Game {
  private renderer: Renderer;
  private inputManager: InputManager;
  private network: NetworkClient;
  private gameState: GameState | null = null;
  private localPlayerId: string;
  private animationFrame: number = 0;
  private lastInputTime = 0;
  private inputInterval = 50; // Send input every 50ms

  constructor(canvas: HTMLCanvasElement, network: NetworkClient) {
    this.renderer = new Renderer(canvas);
    this.inputManager = new InputManager();
    this.network = network;
    this.localPlayerId = network.getPlayerId();

    // Resize canvas
    this.resize();
    window.addEventListener('resize', () => this.resize());

    // Listen for game state updates
    this.network.on('game_state', (data: GameState) => {
      this.gameState = data;
    });

    this.network.on('race_start', (data: { gameState: GameState }) => {
      this.gameState = data.gameState;
    });

    // Start game loop
    this.gameLoop();
  }

  private resize(): void {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.renderer.resize(width, height);
  }

  private gameLoop(): void {
    // Send input
    const now = Date.now();
    if (now - this.lastInputTime > this.inputInterval && this.gameState?.status === 'racing') {
      const input = this.inputManager.getInput();
      this.network.sendInput(input);
      this.lastInputTime = now;
    }

    // Render
    if (this.gameState) {
      this.renderer.renderGame(this.gameState, this.localPlayerId);
    }

    this.animationFrame = requestAnimationFrame(() => this.gameLoop());
  }

  setGameState(gameState: GameState | null): void {
    this.gameState = gameState;
  }

  cleanup(): void {
    cancelAnimationFrame(this.animationFrame);
    this.inputManager.cleanup();
  }
}

