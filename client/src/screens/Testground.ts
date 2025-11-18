import { GameState, Player, Level, PlayerInput } from '../types.js';
import { Renderer } from '../renderer.js';
import { InputManager } from '../input.js';

// Local game loop for testground (client-side only, no server)
export class TestgroundScreen {
  private container: HTMLElement;
  private canvas: HTMLCanvasElement | null = null;
  private renderer: Renderer | null = null;
  private inputManager: InputManager | null = null;
  private gameState: GameState | null = null;
  private localPlayer: Player | null = null;
  private level: Level;
  private animationFrame: number = 0;
  private lastUpdate = 0;

  // Physics constants (matching server)
  private readonly GRAVITY = 0.5;
  private readonly JUMP_STRENGTH = -8;
  private readonly DASH_STRENGTH = 8;
  private readonly GROUND_MOVE_SPEED = 0.9;
  private readonly GROUND_FRICTION = 0.92;
  private readonly ROTATION_SPEED = 5;
  private readonly PLAYER_SIZE = 16;
  private readonly TILE_SIZE = 16;

  constructor(container: HTMLElement) {
    this.container = container;
    this.level = this.createTestLevel();
    this.setupPlayer();
  }

  private createTestLevel(): Level {
    // Larger test level matching server's test level structure - CLOSED LOOP
    const width = 200;
    const height = 30;
    const tiles: any[] = [];

    // Initialize all tiles as empty
    for (let x = 0; x < width; x++) {
      for (let y = 0; y < height; y++) {
        tiles.push({ x, y, type: 'empty' });
      }
    }

    const groundY = height - 3;

    // Ground level (bottom 3 rows across entire width for stability)
    for (let x = 0; x < width; x++) {
      tiles[x * height + groundY].type = 'solid';
      tiles[x * height + groundY + 1].type = 'solid';
      tiles[x * height + groundY + 2].type = 'solid';
    }

    // Left wall (closed loop)
    for (let y = 0; y < height; y++) {
      tiles[0 * height + y].type = 'solid';
      tiles[1 * height + y].type = 'solid';
    }

    // Right wall (closed loop)
    for (let y = 0; y < height; y++) {
      tiles[(width - 1) * height + y].type = 'solid';
      tiles[(width - 2) * height + y].type = 'solid';
    }

    // Start area
    const startX = 5;
    for (let x = startX; x < startX + 3; x++) {
      for (let y = groundY - 1; y < height; y++) {
        tiles[x * height + y].type = 'solid';
      }
    }
    tiles[startX * height + groundY - 2].type = 'start';

    // Finish area
    const finishX = width - 8;
    for (let x = finishX; x < finishX + 3; x++) {
      for (let y = groundY - 1; y < height; y++) {
        tiles[x * height + y].type = 'solid';
      }
    }
    tiles[finishX * height + groundY - 2].type = 'finish';

    // Test platforms (expanded for larger map)
    const platforms = [
      { x: 30, y: groundY - 4, w: 8 },
      { x: 55, y: groundY - 8, w: 6 },
      { x: 80, y: groundY - 12, w: 8 },
      { x: 110, y: groundY - 7, w: 7 },
      { x: 140, y: groundY - 5, w: 6 },
      { x: 165, y: groundY - 15, w: 10 }
    ];

    for (const p of platforms) {
      for (let x = p.x; x < p.x + p.w; x++) {
        tiles[x * height + p.y].type = 'solid';
      }
    }

    return {
      id: 'testground',
      width,
      height,
      tiles,
      type: 'sprint'
    };
  }

  private setupPlayer(): void {
    // Find start position
    let startX = 0;
    let startY = 0;
    for (const tile of this.level.tiles) {
      if (tile.type === 'start') {
        startX = tile.x * this.TILE_SIZE;
        startY = tile.y * this.TILE_SIZE;
        break;
      }
    }

    this.localPlayer = {
      id: 'test-player',
      name: 'Test Player',
      x: startX,
      y: startY,
      vx: 0,
      vy: 0,
      grounded: false,
      canDash: true,
      hasDashed: false,
      color: '#FF0000',
      lapCount: 0,
      lastCheckpoint: -1,
      finished: false,
      distance: 0,
      rotation: 0
    };

    this.gameState = {
      players: [this.localPlayer],
      level: this.level,
      mode: 'sprint',
      startTime: Date.now(),
      status: 'racing'
    };
  }

  render(): void {
    this.container.innerHTML = `
      <div style="position: relative; width: 100%; height: 100%;">
        <canvas id="testground-canvas" style="display: block; width: 100%; height: 100%;"></canvas>
        <div style="position: absolute; top: 10px; left: 10px; background: rgba(0,0,0,0.7); padding: 10px; border: 2px solid #666;">
          <div style="color: #fff; font-family: monospace;">
            <div><strong>TESTGROUND</strong></div>
            <div style="margin-top: 10px; font-size: 12px;">
              Controls:<br>
              A/D or Arrow Keys: Move<br>
              Space/W/Up: Jump (ground) or Dash (air)
            </div>
            <button id="btn-exit-testground" style="margin-top: 10px; padding: 5px 10px;">Exit Testground</button>
          </div>
        </div>
      </div>
    `;

    this.canvas = document.getElementById('testground-canvas') as HTMLCanvasElement;
    if (this.canvas) {
      this.renderer = new Renderer(this.canvas);
      this.renderer.resize(window.innerWidth, window.innerHeight);
      this.inputManager = new InputManager();
      this.lastUpdate = Date.now();
      this.gameLoop();
    }

    document.getElementById('btn-exit-testground')?.addEventListener('click', () => {
      this.cleanup();
      this.container.dispatchEvent(new CustomEvent('screen-change', { detail: 'main-menu' }));
    });
  }

  private gameLoop(): void {
    if (!this.renderer || !this.localPlayer || !this.gameState) {
      return;
    }

    const now = Date.now();
    const deltaTime = Math.min(now - this.lastUpdate, 50); // Cap at 50ms
    this.lastUpdate = now;

    // Process input
    if (this.inputManager) {
      const input = this.inputManager.getInput();
      this.processInput(input);
    }

    // Update physics
    this.updatePhysics(deltaTime);

    // Check collisions
    this.checkCollisions();

    // Render
    this.renderer.renderGame(this.gameState, this.localPlayer.id);

    this.animationFrame = requestAnimationFrame(() => this.gameLoop());
  }

  private processInput(input: PlayerInput): void {
    if (!this.localPlayer) return;

    // Horizontal movement - ground has set speed, air preserves momentum from jump
    if (this.localPlayer.grounded) {
      // On ground: apply movement speed
      if (input.left && !input.right) {
        this.localPlayer.vx = -this.GROUND_MOVE_SPEED;
      } else if (input.right && !input.left) {
        this.localPlayer.vx = this.GROUND_MOVE_SPEED;
      }
      // Friction is applied in updatePhysics for glide effect
    } else {
      // In air: preserve exact momentum from jump, allow slight air control only if moving from standstill
      if (Math.abs(this.localPlayer.vx) < 0.1) {
        // Player jumped from standstill - allow air control
        const airControl = 0.15;
        if (input.left && !input.right) {
          this.localPlayer.vx = -airControl;
        } else if (input.right && !input.left) {
          this.localPlayer.vx = airControl;
        }
      }
      // If player has momentum, preserve it perfectly (no input changes vx)
    }

    // Jump logic
    if (input.jump) {
      if (this.localPlayer.grounded) {
        // First jump (ground jump) - preserve horizontal momentum exactly
        const preservedVx = this.localPlayer.vx; // Save current velocity
        this.localPlayer.vy = this.JUMP_STRENGTH;
        this.localPlayer.vx = preservedVx; // Restore exact velocity (maintains ground speed)
        this.localPlayer.grounded = false;
        this.localPlayer.canDash = true;
        this.localPlayer.hasDashed = false; // Reset dash on new jump
      } else if (!this.localPlayer.grounded && this.localPlayer.canDash && !this.localPlayer.hasDashed) {
        // Dash (mid-air) - SIDEWAYS ONLY, respects gravity
        const dashDirection = this.localPlayer.vx > 0 ? 1 : this.localPlayer.vx < 0 ? -1 : (input.right ? 1 : input.left ? -1 : 1);
        this.localPlayer.vx = dashDirection * this.DASH_STRENGTH; // Set horizontal speed (not add)
        // Don't modify vy - let gravity continue naturally
        this.localPlayer.hasDashed = true;
        this.localPlayer.canDash = false;
      }
    }
  }

  private updatePhysics(deltaTime: number): void {
    if (!this.localPlayer) return;

    // Apply gravity
    if (!this.localPlayer.grounded) {
      this.localPlayer.vy += this.GRAVITY * (deltaTime / 16); // Normalize to 60fps
      
      // Update rotation when in air (spinning effect)
      this.localPlayer.rotation += this.ROTATION_SPEED * (this.localPlayer.vx > 0 ? 1 : -1);
      this.localPlayer.rotation = this.localPlayer.rotation % 360; // Keep rotation in 0-360 range
    } else {
      // On ground: reset rotation immediately (not smoothly) to prevent spinning on platforms
      this.localPlayer.rotation = 0;
      
      // Apply ground friction for glide effect
      this.localPlayer.vx *= this.GROUND_FRICTION;
      
      // Stop completely if speed is very low
      if (Math.abs(this.localPlayer.vx) < 0.05) {
        this.localPlayer.vx = 0;
      }
    }

    // Update position
    this.localPlayer.x += this.localPlayer.vx * (deltaTime / 16);
    this.localPlayer.y += this.localPlayer.vy * (deltaTime / 16);

    // Update distance
    this.localPlayer.distance = this.localPlayer.x;

    // Clamp velocity
    this.localPlayer.vx = Math.max(-10, Math.min(10, this.localPlayer.vx));
    this.localPlayer.vy = Math.max(-15, Math.min(15, this.localPlayer.vy));
  }

  private checkCollisions(): void {
    if (!this.localPlayer || !this.level) return;

    const playerLeft = Math.floor(this.localPlayer.x / this.TILE_SIZE);
    const playerRight = Math.floor((this.localPlayer.x + this.PLAYER_SIZE) / this.TILE_SIZE);
    const playerTop = Math.floor(this.localPlayer.y / this.TILE_SIZE);
    const playerBottom = Math.floor((this.localPlayer.y + this.PLAYER_SIZE) / this.TILE_SIZE);

    // Check ground collision - improved to prevent falling through
    let onGround = false;
    for (let x = playerLeft; x <= playerRight; x++) {
      const tile = this.getTileAt(x, playerBottom + 1);
      if (tile && (tile.type === 'solid' || tile.type === 'start' || tile.type === 'finish')) {
        // Check if player is moving downward or stationary
        if (this.localPlayer.vy >= -0.5) { // Allow slight upward velocity tolerance
          // Snap to top of tile
          const targetY = (playerBottom + 1) * this.TILE_SIZE - this.PLAYER_SIZE;
          
          // Only snap if reasonably close (within 4 pixels)
          if (Math.abs(this.localPlayer.y - targetY) <= 4) {
            this.localPlayer.y = targetY;
            this.localPlayer.vy = 0;
            this.localPlayer.grounded = true;
            this.localPlayer.rotation = 0; // Reset rotation immediately on landing
            this.localPlayer.canDash = true;
            this.localPlayer.hasDashed = false;
            onGround = true;
            break;
          }
        }
      }
    }

    // Check ceiling
    for (let x = playerLeft; x <= playerRight; x++) {
      const tile = this.getTileAt(x, playerTop - 1);
      if (tile && (tile.type === 'solid' || tile.type === 'start' || tile.type === 'finish')) {
        this.localPlayer.y = (playerTop) * this.TILE_SIZE;
        this.localPlayer.vy = 0;
        break;
      }
    }

    // Check side collisions - with wrap-around for closed loop
    if (this.localPlayer.vx > 0) {
      // Check right edge
      if (playerRight + 1 >= this.level.width) {
        // Wrap to left side
        this.localPlayer.x = 2 * this.TILE_SIZE;
      } else {
        for (let y = playerTop; y <= playerBottom; y++) {
          const tile = this.getTileAt(playerRight + 1, y);
          if (tile && (tile.type === 'solid' || tile.type === 'start' || tile.type === 'finish')) {
            this.localPlayer.x = (playerRight) * this.TILE_SIZE;
            this.localPlayer.vx = 0;
            break;
          }
        }
      }
    } else if (this.localPlayer.vx < 0) {
      // Check left edge
      if (playerLeft - 1 < 0) {
        // Wrap to right side
        this.localPlayer.x = (this.level.width - 3) * this.TILE_SIZE;
      } else {
        for (let y = playerTop; y <= playerBottom; y++) {
          const tile = this.getTileAt(playerLeft - 1, y);
          if (tile && (tile.type === 'solid' || tile.type === 'start' || tile.type === 'finish')) {
            this.localPlayer.x = (playerLeft) * this.TILE_SIZE;
            this.localPlayer.vx = 0;
            break;
          }
        }
      }
    }

    // Update grounded status if not on ground
    if (!onGround) {
      // Only unset grounded if clearly falling (not just a small gap)
      if (this.localPlayer.vy > 1.0 || this.localPlayer.y > (playerBottom + 2) * this.TILE_SIZE) {
        this.localPlayer.grounded = false;
      }
    }
  }

  private getTileAt(x: number, y: number): any {
    if (x < 0 || x >= this.level.width || y < 0 || y >= this.level.height) {
      return null;
    }
    const idx = x * this.level.height + y;
    return this.level.tiles[idx] || null;
  }

  cleanup(): void {
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
    }
    if (this.inputManager) {
      this.inputManager.cleanup();
    }
  }
}

