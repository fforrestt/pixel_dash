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
  private logBuffer: string[] = [];
  private logBufferSize = 100;

  // Physics constants (matching server)
  private readonly GRAVITY = 0.5;
  private readonly JUMP_STRENGTH = -8;
  private readonly SECOND_JUMP_STRENGTH = -8; // Slightly weaker than first jump
  private readonly DASH_DISTANCE = 320; // 10 tiles (10 * 16 = 160 pixels)
  private readonly DASH_DURATION_MS = 150; // Duration of dash animation in milliseconds (visible warp effect)
  private readonly DASH_COOLDOWN_TICKS = 30; // Cooldown after dash completes
  private readonly GROUND_MOVE_SPEED = 10; // Increased for faster movement - direct velocity assignment, no acceleration
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
    // Comprehensive test level for collision philosophy testing:
    // - 1 tile elevation changes: Auto-step up (smooth traversal)
    // - 2+ tile elevation changes: Require jump (wall collision)
    const width = 400; // Wider for more testing scenarios
    const height = 50; // Taller for more vertical space
    const tiles: any[] = [];

    // Initialize all tiles as empty
    for (let x = 0; x < width; x++) {
      for (let y = 0; y < height; y++) {
        tiles.push({ x, y, type: 'empty' });
      }
    }

    const groundY = height - 3; // Ground level row (base floor = 0)

    // ========================================================================
    // GROUND FLOOR - Continuous solid ground across entire width
    // ========================================================================
    for (let x = 0; x < width; x++) {
      tiles[x * height + groundY].type = 'solid';
      tiles[x * height + groundY + 1].type = 'solid';
      tiles[x * height + groundY + 2].type = 'solid';
    }

    // ========================================================================
    // WALLS - Closed loop boundaries
    // ========================================================================
    // Left wall
    for (let y = 0; y < height; y++) {
      tiles[0 * height + y].type = 'solid';
      tiles[1 * height + y].type = 'solid';
    }

    // Right wall
    for (let y = 0; y < height; y++) {
      tiles[(width - 1) * height + y].type = 'solid';
      tiles[(width - 2) * height + y].type = 'solid';
    }

    // ========================================================================
    // START AREA - Large platform at ground level
    // ========================================================================
    const startX = 10;
    const startPlatformWidth = 15;
    for (let x = startX; x < startX + startPlatformWidth; x++) {
      for (let y = groundY; y < height; y++) {
        tiles[x * height + y].type = 'solid';
      }
    }
    tiles[startX * height + groundY].type = 'start';

    // ========================================================================
    // SECTION 1: STAIRCASE - 1-tile steps (should auto-step up)
    // ========================================================================
    // Creates a staircase from groundY to groundY - 5 (6 steps)
    let currentX = 30;
    for (let step = 0; step < 6; step++) {
      const stepY = groundY - step;
      for (let x = currentX; x < currentX + 8; x++) {
        tiles[x * height + stepY].type = 'solid';
      }
      currentX += 8;
    }

    // ========================================================================
    // SECTION 2: 2-TILE WALLS - Should require jump
    // ========================================================================
    // Wall 1: 2-tile high wall (requires jump)
    const wall1X = 85;
    const wall1Height = 2;
    for (let y = groundY; y >= groundY - wall1Height + 1; y--) {
      for (let x = wall1X; x < wall1X + 5; x++) {
        tiles[x * height + y].type = 'solid';
      }
    }

    // Platform after wall 1 (at same height as wall top)
    for (let x = wall1X + 5; x < wall1X + 15; x++) {
      tiles[x * height + (groundY - wall1Height + 1)].type = 'solid';
    }

    // ========================================================================
    // SECTION 3: MIXED 1-TILE AND 2-TILE STEPS
    // ========================================================================
    // 1-tile step up
    for (let x = 110; x < 118; x++) {
      tiles[x * height + (groundY - 1)].type = 'solid';
    }
    // 2-tile wall (requires jump)
    const wall2X = 125;
    for (let y = groundY; y >= groundY - 1; y--) {
      for (let x = wall2X; x < wall2X + 5; x++) {
        tiles[x * height + y].type = 'solid';
      }
    }
    // Platform after wall 2
    for (let x = wall2X + 5; x < wall2X + 12; x++) {
      tiles[x * height + (groundY - 1)].type = 'solid';
    }

    // ========================================================================
    // SECTION 4: DESCENDING STAIRCASE - 1-tile steps down
    // ========================================================================
    let descX = 145;
    for (let step = 0; step < 5; step++) {
      const stepY = groundY - 3 + step; // Descending from groundY - 3 to groundY
      for (let x = descX; x < descX + 8; x++) {
        tiles[x * height + stepY].type = 'solid';
      }
      descX += 8;
    }

    // ========================================================================
    // SECTION 5: HIGH WALLS - 3+ tiles (require jump)
    // ========================================================================
    // 3-tile high wall
    const wall3X = 190;
    for (let y = groundY; y >= groundY - 2; y--) {
      for (let x = wall3X; x < wall3X + 6; x++) {
        tiles[x * height + y].type = 'solid';
      }
    }
    // Platform after 3-tile wall
    for (let x = wall3X + 6; x < wall3X + 15; x++) {
      tiles[x * height + (groundY - 2)].type = 'solid';
    }

    // 4-tile high wall
    const wall4X = 215;
    for (let y = groundY; y >= groundY - 3; y--) {
      for (let x = wall4X; x < wall4X + 6; x++) {
        tiles[x * height + y].type = 'solid';
      }
    }
    // Platform after 4-tile wall
    for (let x = wall4X + 6; x < wall4X + 15; x++) {
      tiles[x * height + (groundY - 3)].type = 'solid';
    }

    // ========================================================================
    // SECTION 6: PLATFORM CHAIN - Various heights
    // ========================================================================
    // Platform at groundY - 1 (1-tile step from ground)
    for (let x = 240; x < 250; x++) {
      tiles[x * height + (groundY - 1)].type = 'solid';
    }
    // Platform at groundY - 2 (2-tile step from previous)
    for (let x = 255; x < 265; x++) {
      tiles[x * height + (groundY - 2)].type = 'solid';
    }
    // Platform at groundY - 1 (1-tile step down from previous)
    for (let x = 270; x < 280; x++) {
      tiles[x * height + (groundY - 1)].type = 'solid';
    }
    // Platform at groundY (back to ground level)
    for (let x = 285; x < 295; x++) {
      tiles[x * height + groundY].type = 'solid';
    }

    // ========================================================================
    // SECTION 7: ALTERNATING 1-TILE AND 2-TILE STEPS
    // ========================================================================
    let altX = 300;
    let altY = groundY;
    // 1-tile step up
    for (let x = altX; x < altX + 6; x++) {
      tiles[x * height + (altY - 1)].type = 'solid';
    }
    altX += 6;
    altY = groundY - 1;
    // 2-tile wall (should stop player)
    for (let y = altY; y <= altY + 1; y++) {
      for (let x = altX; x < altX + 5; x++) {
        tiles[x * height + y].type = 'solid';
      }
    }
    altX += 5;
    // Platform after wall
    for (let x = altX; x < altX + 8; x++) {
      tiles[x * height + (altY + 1)].type = 'solid';
    }

    // ========================================================================
    // FINISH AREA - Large platform at ground level
    // ========================================================================
    const finishX = width - 20;
    const finishPlatformWidth = 15;
    for (let x = finishX; x < finishX + finishPlatformWidth; x++) {
      for (let y = groundY; y < height; y++) {
        tiles[x * height + y].type = 'solid';
      }
    }
    tiles[finishX * height + groundY].type = 'finish';

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
        // Spawn player ON TOP of the start tile (not inside it)
        startY = tile.y * this.TILE_SIZE - this.PLAYER_SIZE;
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
      grounded: true,
      canDash: true,
      hasDashed: false,
      hasFirstJumped: false,
      hasSecondJump: false,
      dashCooldown: 0,
      isDashing: false,
      dashRemaining: 0,
      dashStartTime: 0,
      dashStartX: 0,
      dashTargetX: 0,
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
    let currentInput: PlayerInput | null = null;
    if (this.inputManager) {
      currentInput = this.inputManager.getInput();
      this.processInput(currentInput);
    }

    // Update physics (pass input to know if friction should apply)
    this.updatePhysics(deltaTime, currentInput);

    // Check collisions
    this.checkCollisions();

    // Render
    this.renderer.renderGame(this.gameState, this.localPlayer.id);

    this.animationFrame = requestAnimationFrame(() => this.gameLoop());
  }

  private log(message: string): void {
    const timestamp = Date.now();
    const logEntry = `[${timestamp}] ${message}`;
    this.logBuffer.push(logEntry);
    if (this.logBuffer.length > this.logBufferSize) {
      this.logBuffer.shift();
    }
    console.log(logEntry);
  }

  private processInput(input: PlayerInput): void {
    if (!this.localPlayer) return;
    
    const beforeVx = this.localPlayer.vx;

    // Process jump input even when dashing (jump should always work)
    // ========================================================================
    // TWO-JUMP SYSTEM
    // ========================================================================
    if (input.jump) {
      if (this.localPlayer.grounded) {
        // First jump (ground jump) - preserve horizontal momentum exactly
        const preservedVx = this.localPlayer.vx; // Save current velocity
        this.localPlayer.vy = this.JUMP_STRENGTH;
        this.localPlayer.vx = preservedVx; // Restore exact velocity (maintains ground speed)
        this.localPlayer.grounded = false;
        this.localPlayer.hasFirstJumped = true;
        this.localPlayer.hasSecondJump = true; // Enable second jump
      } else if (!this.localPlayer.grounded) {
        // Air jump - available if:
        // 1. Player has used first jump and has second jump available, OR
        // 2. Player fell off platform without jumping (hasFirstJumped is false)
        if (this.localPlayer.hasFirstJumped && this.localPlayer.hasSecondJump) {
          // Second jump - carries momentum based on progress through first jump
          const preservedVx = this.localPlayer.vx; // Preserve horizontal momentum
          
          // If player is still going up (vy < 0), add upward velocity for higher jump
          // If player is falling (vy > 0), carry downward momentum (add to existing vy)
          if (this.localPlayer.vy < 0) {
            // Still ascending - add upward boost
            this.localPlayer.vy = this.SECOND_JUMP_STRENGTH;
          } else {
            // Falling - carry momentum (add to existing downward velocity)
            this.localPlayer.vy += this.SECOND_JUMP_STRENGTH;
          }
          
          this.localPlayer.vx = preservedVx; // Restore exact velocity
          this.localPlayer.hasSecondJump = false; // Second jump used
        } else if (!this.localPlayer.hasFirstJumped) {
          // Player fell off platform without jumping - allow first jump in air
          const preservedVx = this.localPlayer.vx; // Preserve horizontal momentum
          this.localPlayer.vy = this.JUMP_STRENGTH;
          this.localPlayer.vx = preservedVx;
          this.localPlayer.hasFirstJumped = true;
          this.localPlayer.hasSecondJump = true; // Enable second jump after this one
        }
      }
    }

    // Skip normal movement and dash if dashing (dash handles its own movement)
    if (this.localPlayer.isDashing) {
      return;
    }

    // Horizontal movement - ground has set speed, air preserves momentum from jump
    if (this.localPlayer.grounded) {
      // On ground: apply movement speed
      if (input.left && !input.right) {
        this.localPlayer.vx = -this.GROUND_MOVE_SPEED;
        const tileBelow = this.getTileAt(Math.floor(this.localPlayer.x / this.TILE_SIZE), Math.floor((this.localPlayer.y + this.PLAYER_SIZE) / this.TILE_SIZE));
        this.log(`GROUND LEFT: ${beforeVx.toFixed(2)} -> ${this.localPlayer.vx.toFixed(2)} | GROUND_MOVE_SPEED=${this.GROUND_MOVE_SPEED} | tile=${tileBelow?.type || 'none'} | pos=(${this.localPlayer.x.toFixed(1)}, ${this.localPlayer.y.toFixed(1)})`);
      } else if (input.right && !input.left) {
        this.localPlayer.vx = this.GROUND_MOVE_SPEED;
        const tileBelow = this.getTileAt(Math.floor(this.localPlayer.x / this.TILE_SIZE), Math.floor((this.localPlayer.y + this.PLAYER_SIZE) / this.TILE_SIZE));
        this.log(`GROUND RIGHT: ${beforeVx.toFixed(2)} -> ${this.localPlayer.vx.toFixed(2)} | GROUND_MOVE_SPEED=${this.GROUND_MOVE_SPEED} | tile=${tileBelow?.type || 'none'} | pos=(${this.localPlayer.x.toFixed(1)}, ${this.localPlayer.y.toFixed(1)})`);
      } else {
        // No input - friction will be applied in updatePhysics
        if (Math.abs(beforeVx) > 0.01) {
          this.log(`GROUND NO INPUT: vx=${beforeVx.toFixed(2)} (friction will apply)`);
        }
      }
      // Friction is applied in updatePhysics for glide effect
    } else {
      // In air: allow full air control - player can change direction freely
      // Air control speed is slightly slower than ground speed for better feel
      const AIR_CONTROL_SPEED = this.GROUND_MOVE_SPEED * 0.8; // 80% of ground speed for air control
      
      if (input.left && !input.right) {
        this.localPlayer.vx = -AIR_CONTROL_SPEED;
      } else if (input.right && !input.left) {
        this.localPlayer.vx = AIR_CONTROL_SPEED;
      }
      // Note: If no input in air, velocity is preserved (no friction)
      // This allows players to maintain momentum if they want, or change direction with input
    }

    // ========================================================================
    // DASH SYSTEM (F key) - Visible warp animation
    // ========================================================================
    if (input.dash && this.localPlayer.dashCooldown <= 0 && !this.localPlayer.isDashing) {
      // Determine dash direction (prefer current movement direction, fallback to input)
      let dashDirection = 0;
      if (Math.abs(this.localPlayer.vx) > 0.1) {
        dashDirection = this.localPlayer.vx > 0 ? 1 : -1;
      } else {
        dashDirection = input.right ? 1 : input.left ? -1 : 1; // Default right if no input
      }
      
      // Calculate dash distance and target position
      const dashDistance = this.DASH_DISTANCE;
      let dashTargetX = this.localPlayer.x + (dashDirection * dashDistance);
      
      // Check if dash path would intersect a 2+ level wall
      const playerLeft = Math.floor(this.localPlayer.x / this.TILE_SIZE);
      const playerRight = Math.floor((this.localPlayer.x + this.PLAYER_SIZE) / this.TILE_SIZE);
      const playerTop = Math.floor(this.localPlayer.y / this.TILE_SIZE);
      const playerBottom = Math.floor((this.localPlayer.y + this.PLAYER_SIZE) / this.TILE_SIZE);
      
      // Check all tiles along the dash path for 2+ level walls
      const startX = dashDirection > 0 ? playerRight + 1 : playerLeft - 1;
      const endX = dashDirection > 0 ? Math.floor((dashTargetX + this.PLAYER_SIZE) / this.TILE_SIZE) : Math.floor(dashTargetX / this.TILE_SIZE);
      
      let blockingWallX = -1;
      for (let checkX = startX; dashDirection > 0 ? checkX <= endX : checkX >= endX; checkX += dashDirection) {
        if (checkX >= 0 && checkX < this.level.width) {
          // Check if there's a 2+ level wall at this X position
          if (playerBottom - 1 >= 0 && playerBottom - 2 >= 0) {
            const tileOneLevelAbove = this.getTileAt(checkX, playerBottom - 1);
            const tileTwoLevelsAbove = this.getTileAt(checkX, playerBottom - 2);
            if (tileOneLevelAbove && (tileOneLevelAbove.type === 'solid' || tileOneLevelAbove.type === 'start' || tileOneLevelAbove.type === 'finish') &&
                tileTwoLevelsAbove && (tileTwoLevelsAbove.type === 'solid' || tileTwoLevelsAbove.type === 'start' || tileTwoLevelsAbove.type === 'finish')) {
              // Found a 2+ level wall - block dash at this position
              blockingWallX = checkX;
              break;
            }
          }
        }
      }
      
      // If a wall was found, adjust dash target to stop just before the wall
      if (blockingWallX !== -1) {
        if (dashDirection > 0) {
          // Moving right - stop at left edge of wall
          dashTargetX = blockingWallX * this.TILE_SIZE - this.PLAYER_SIZE;
        } else {
          // Moving left - stop at right edge of wall
          dashTargetX = (blockingWallX + 1) * this.TILE_SIZE;
        }
        this.log(`DASH BLOCKED BY 2+ LEVEL WALL: Adjusted target from ${(this.localPlayer.x + (dashDirection * dashDistance)).toFixed(1)} to ${dashTargetX.toFixed(1)}`);
      }
      
      // Start dash animation - warp with visible animation
      this.localPlayer.isDashing = true;
      this.localPlayer.dashStartTime = Date.now();
      this.localPlayer.dashStartX = this.localPlayer.x;
      this.localPlayer.dashTargetX = dashTargetX;
      this.localPlayer.vx = 0; // Clear velocity so movement input works immediately after dash
      
      this.log(`DASH START: Direction=${dashDirection}, Distance=${dashDistance}, From=${this.localPlayer.x.toFixed(1)} To=${dashTargetX.toFixed(1)}`);
    }
  }

  private updatePhysics(deltaTime: number, input: PlayerInput | null): void {
    if (!this.localPlayer) return;

    const wasGrounded = this.localPlayer.grounded;
    const beforeVx = this.localPlayer.vx;
    const beforeVy = this.localPlayer.vy;

    // Update dash cooldown (convert deltaTime to ticks: 20 ticks/sec = 50ms per tick)
    if (this.localPlayer.dashCooldown > 0) {
      const ticksElapsed = deltaTime / 50; // 50ms per tick at 20 ticks/sec
      this.localPlayer.dashCooldown = Math.max(0, this.localPlayer.dashCooldown - ticksElapsed);
    }

    // Update dash animation - smooth warp effect
    if (this.localPlayer.isDashing && this.localPlayer.dashStartTime !== undefined && this.localPlayer.dashStartX !== undefined && this.localPlayer.dashTargetX !== undefined) {
      const elapsed = Date.now() - this.localPlayer.dashStartTime;
      const progress = Math.min(elapsed / this.DASH_DURATION_MS, 1); // 0 to 1
      
      if (progress >= 1) {
        // Dash complete - snap to target position
        this.localPlayer.x = this.localPlayer.dashTargetX;
        this.localPlayer.isDashing = false;
        this.localPlayer.dashCooldown = this.DASH_COOLDOWN_TICKS;
        this.localPlayer.vx = 0; // Ensure velocity is 0 so movement input works immediately
        this.log(`DASH COMPLETE: Cooldown=${this.localPlayer.dashCooldown}`);
      } else {
        // Smooth interpolation for visible warp effect
        const easeProgress = progress < 0.5 
          ? 2 * progress * progress  // Ease in
          : 1 - Math.pow(-2 * progress + 2, 2) / 2; // Ease out
        const newX = this.localPlayer.dashStartX + (this.localPlayer.dashTargetX - this.localPlayer.dashStartX) * easeProgress;
        
        // Check if this position would be inside a 2+ level wall
        const playerLeft = Math.floor(newX / this.TILE_SIZE);
        const playerRight = Math.floor((newX + this.PLAYER_SIZE) / this.TILE_SIZE);
        const playerTop = Math.floor(this.localPlayer.y / this.TILE_SIZE);
        const playerBottom = Math.floor((this.localPlayer.y + this.PLAYER_SIZE) / this.TILE_SIZE);
        
        let blocked = false;
        for (let checkX = playerLeft; checkX <= playerRight; checkX++) {
          if (checkX >= 0 && checkX < this.level.width) {
            if (playerBottom - 1 >= 0 && playerBottom - 2 >= 0) {
              const tileOneLevelAbove = this.getTileAt(checkX, playerBottom - 1);
              const tileTwoLevelsAbove = this.getTileAt(checkX, playerBottom - 2);
              if (tileOneLevelAbove && (tileOneLevelAbove.type === 'solid' || tileOneLevelAbove.type === 'start' || tileOneLevelAbove.type === 'finish') &&
                  tileTwoLevelsAbove && (tileTwoLevelsAbove.type === 'solid' || tileTwoLevelsAbove.type === 'start' || tileTwoLevelsAbove.type === 'finish')) {
                // Would be inside a 2+ level wall - stop dash early
                const tileLeftX = checkX * this.TILE_SIZE;
                const tileRightX = (checkX + 1) * this.TILE_SIZE;
                const dashDirection = this.localPlayer.dashTargetX > this.localPlayer.dashStartX ? 1 : -1;
                
                if (dashDirection > 0) {
                  // Moving right - stop at left edge of wall
                  this.localPlayer.x = tileLeftX - this.PLAYER_SIZE;
                } else {
                  // Moving left - stop at right edge of wall
                  this.localPlayer.x = tileRightX;
                }
                this.localPlayer.isDashing = false;
                this.localPlayer.dashCooldown = this.DASH_COOLDOWN_TICKS;
                this.localPlayer.vx = 0;
                blocked = true;
                this.log(`DASH BLOCKED DURING ANIMATION: Stopped at ${this.localPlayer.x.toFixed(1)}`);
                break;
              }
            }
          }
        }
        
        if (!blocked) {
          this.localPlayer.x = newX;
        }
        // Keep velocity at 0 during dash so movement input can be processed
        this.localPlayer.vx = 0;
      }
    }

    // Apply gravity
    if (!this.localPlayer.grounded) {
      this.localPlayer.vy += this.GRAVITY * (deltaTime / 16); // Normalize to 60fps
      
      // Update rotation when in air (spinning effect)
      this.localPlayer.rotation += this.ROTATION_SPEED * (this.localPlayer.vx > 0 ? 1 : -1);
      this.localPlayer.rotation = this.localPlayer.rotation % 360; // Keep rotation in 0-360 range
    } else {
      // On ground: reset rotation immediately (not smoothly) to prevent spinning on platforms
      this.localPlayer.rotation = 0;
      
      // Apply ground friction ONLY when there's no horizontal input
      const hasHorizontalInput = input && (input.left || input.right);
      if (!hasHorizontalInput) {
        const beforeFriction = this.localPlayer.vx;
        this.localPlayer.vx *= this.GROUND_FRICTION;
        
        // Stop completely if speed is very low
        if (Math.abs(this.localPlayer.vx) < 0.05) {
          this.localPlayer.vx = 0;
        }
        
        if (Math.abs(beforeFriction - this.localPlayer.vx) > 0.01) {
          this.log(`GROUND FRICTION: ${beforeFriction.toFixed(2)} -> ${this.localPlayer.vx.toFixed(2)} (friction: ${this.GROUND_FRICTION})`);
        }
      }
    }

    // Update position (only if not dashing - dash handles its own position)
    if (!this.localPlayer.isDashing) {
      this.localPlayer.x += this.localPlayer.vx * (deltaTime / 16);
    }
    this.localPlayer.y += this.localPlayer.vy * (deltaTime / 16);

    // Update distance
    this.localPlayer.distance = this.localPlayer.x;

    // Clamp velocity
    this.localPlayer.vx = Math.max(-10, Math.min(10, this.localPlayer.vx));
    this.localPlayer.vy = Math.max(-15, Math.min(15, this.localPlayer.vy));
    
    // Log significant changes
    if (wasGrounded !== this.localPlayer.grounded) {
      this.log(`GROUNDED STATE: ${wasGrounded} -> ${this.localPlayer.grounded} | pos: (${this.localPlayer.x.toFixed(1)}, ${this.localPlayer.y.toFixed(1)}) | vel: (${this.localPlayer.vx.toFixed(2)}, ${this.localPlayer.vy.toFixed(2)})`);
    }
    if (Math.abs(beforeVx - this.localPlayer.vx) > 0.1 || Math.abs(beforeVy - this.localPlayer.vy) > 0.1) {
      this.log(`VELOCITY CHANGE: vx ${beforeVx.toFixed(2)} -> ${this.localPlayer.vx.toFixed(2)}, vy ${beforeVy.toFixed(2)} -> ${this.localPlayer.vy.toFixed(2)} | grounded: ${this.localPlayer.grounded}`);
    }
  }

  private checkCollisions(): void {
    if (!this.localPlayer || !this.level) return;

    const wasGrounded = this.localPlayer.grounded;
    const playerLeft = Math.floor(this.localPlayer.x / this.TILE_SIZE);
    const playerRight = Math.floor((this.localPlayer.x + this.PLAYER_SIZE) / this.TILE_SIZE);
    const playerTop = Math.floor(this.localPlayer.y / this.TILE_SIZE);
    const playerBottom = Math.floor((this.localPlayer.y + this.PLAYER_SIZE) / this.TILE_SIZE);
    const tileInfo: string[] = [];

    // Check ground collision - improved to prevent falling through
    // IMPORTANT: Check center of player first for reliable edge detection
    // This prevents edge friction issues where player is partially over empty space
    let onGround = false;
    const playerCenterX = Math.floor((this.localPlayer.x + this.PLAYER_SIZE / 2) / this.TILE_SIZE);
    
    // First, check center of player (most reliable, especially at platform edges)
    const centerTileOn = this.getTileAt(playerCenterX, playerBottom);
    if (centerTileOn && (centerTileOn.type === 'solid' || centerTileOn.type === 'start' || centerTileOn.type === 'finish')) {
      const tileTopY = playerBottom * this.TILE_SIZE;
      const playerBottomY = this.localPlayer.y + this.PLAYER_SIZE;
      const distance = playerBottomY - tileTopY;
      tileInfo.push(`CENTER_ON[${playerCenterX},${playerBottom}]=${centerTileOn.type} dist=${distance.toFixed(1)}`);
      
      if (playerBottomY >= tileTopY - 2 && playerBottomY <= tileTopY + 4) {
        // Only apply landing logic if transitioning from air to ground
        if (!wasGrounded) {
          this.log(`LANDED ON TILE (CENTER): type=${centerTileOn.type} at (${playerCenterX},${playerBottom}) | pos: (${this.localPlayer.x.toFixed(1)}, ${this.localPlayer.y.toFixed(1)})`);
        }
        // Only snap position if significantly off (prevents constant micro-adjustments)
        const expectedY = tileTopY - this.PLAYER_SIZE;
        if (Math.abs(this.localPlayer.y - expectedY) > 0.1) {
          this.localPlayer.y = expectedY;
        }
          this.localPlayer.vy = 0;
          this.localPlayer.grounded = true;
          this.localPlayer.rotation = 0;
          // Reset jump states when landing
          this.localPlayer.hasFirstJumped = false;
          this.localPlayer.hasSecondJump = false;
          onGround = true;
      }
    }
    
    // If center check didn't find ground, check center tile below player
    // IMPORTANT: Only check if playerBottom + 1 is within level bounds to prevent invisible floors
    if (!onGround && playerBottom + 1 < this.level.height) {
      const centerTileBelow = this.getTileAt(playerCenterX, playerBottom + 1);
      if (centerTileBelow && (centerTileBelow.type === 'solid' || centerTileBelow.type === 'start' || centerTileBelow.type === 'finish')) {
        const targetY = (playerBottom + 1) * this.TILE_SIZE - this.PLAYER_SIZE;
        const distance = Math.abs(this.localPlayer.y - targetY);
        tileInfo.push(`CENTER_BELOW[${playerCenterX},${playerBottom + 1}]=${centerTileBelow.type} dist=${distance.toFixed(1)}`);
        
        // Check if player is moving downward or stationary
        if (this.localPlayer.vy >= -0.5) { // Allow slight upward velocity tolerance
          // Only snap if reasonably close (within 4 pixels)
          if (distance <= 4) {
            // Only apply landing logic if transitioning from air to ground
            if (!wasGrounded) {
              this.log(`LANDED BELOW TILE (CENTER): type=${centerTileBelow.type} at (${playerCenterX},${playerBottom + 1}) | pos: (${this.localPlayer.x.toFixed(1)}, ${this.localPlayer.y.toFixed(1)})`);
            }
            // Only snap position if significantly off (prevents constant micro-adjustments)
            if (Math.abs(this.localPlayer.y - targetY) > 0.1) {
              this.localPlayer.y = targetY;
            }
            this.localPlayer.vy = 0;
            this.localPlayer.grounded = true;
            this.localPlayer.rotation = 0; // Reset rotation immediately on landing
            // Reset jump states when landing
            this.localPlayer.hasFirstJumped = false;
            this.localPlayer.hasSecondJump = false;
            onGround = true;
          }
        }
      }
    }
    
    // Also check for step-up opportunities (platforms 1 level above) when moving horizontally
    // This prevents falling through steps when going up stairs
    if (!onGround && this.localPlayer.grounded && Math.abs(this.localPlayer.vx) > 0.1 && playerBottom - 1 >= 0) {
      // Check tiles to the left and right of center for step-up opportunities
      const checkTilesX = [playerCenterX - 1, playerCenterX, playerCenterX + 1];
      for (const checkX of checkTilesX) {
        if (checkX >= 0 && checkX < this.level.width) {
          const tileAbove = this.getTileAt(checkX, playerBottom - 1);
          if (tileAbove && (tileAbove.type === 'solid' || tileAbove.type === 'start' || tileAbove.type === 'finish')) {
            const tileTopY = (playerBottom - 1) * this.TILE_SIZE;
            const playerBottomY = this.localPlayer.y + this.PLAYER_SIZE;
            const verticalDistance = tileTopY - playerBottomY;
            // Check if player is close enough to step up (within 1 tile height)
            if (verticalDistance >= -this.TILE_SIZE && verticalDistance <= this.TILE_SIZE) {
              // Check horizontal proximity - player should be close to the platform
              const tileLeftX = checkX * this.TILE_SIZE;
              const tileRightX = (checkX + 1) * this.TILE_SIZE;
              const playerLeftX = this.localPlayer.x;
              const playerRightX = this.localPlayer.x + this.PLAYER_SIZE;
              const horizontalProximity = (playerRightX >= tileLeftX - 2 && playerLeftX < tileRightX + 2);
              
              if (horizontalProximity) {
                // Step up to the platform
                this.localPlayer.y = tileTopY - this.PLAYER_SIZE;
                this.localPlayer.vy = 0;
                this.localPlayer.grounded = true;
                this.localPlayer.rotation = 0;
                this.localPlayer.hasFirstJumped = false;
                this.localPlayer.hasSecondJump = false;
                onGround = true;
                this.log(`STEP-UP FROM GROUND CHECK: Stepped to tile (${checkX}, ${playerBottom - 1}) | pos: (${this.localPlayer.x.toFixed(1)}, ${this.localPlayer.y.toFixed(1)})`);
                break;
              }
            }
          }
        }
      }
    }
    
    // Fallback: If center checks didn't find ground, check all tiles (for very small platforms or edge cases)
    // IMPORTANT: Only check tiles within level bounds to prevent invisible floors
    if (!onGround) {
      for (let x = playerLeft; x <= playerRight; x++) {
        // Ensure x is within bounds
        if (x < 0 || x >= this.level.width) continue;
        
        // Check tile player is standing ON (must be within bounds)
        if (playerBottom >= 0 && playerBottom < this.level.height) {
          const tileOn = this.getTileAt(x, playerBottom);
          if (tileOn && (tileOn.type === 'solid' || tileOn.type === 'start' || tileOn.type === 'finish')) {
            const tileTopY = playerBottom * this.TILE_SIZE;
            const playerBottomY = this.localPlayer.y + this.PLAYER_SIZE;
            const distance = playerBottomY - tileTopY;
            tileInfo.push(`ON[${x},${playerBottom}]=${tileOn.type} dist=${distance.toFixed(1)}`);
            
            if (playerBottomY >= tileTopY - 2 && playerBottomY <= tileTopY + 4) {
              // Only apply landing logic if transitioning from air to ground
              if (!wasGrounded) {
                this.log(`LANDED ON TILE: type=${tileOn.type} at (${x},${playerBottom}) | pos: (${this.localPlayer.x.toFixed(1)}, ${this.localPlayer.y.toFixed(1)})`);
              }
              // Only snap position if significantly off (prevents constant micro-adjustments)
              const expectedY = tileTopY - this.PLAYER_SIZE;
              if (Math.abs(this.localPlayer.y - expectedY) > 0.1) {
                this.localPlayer.y = expectedY;
              }
              this.localPlayer.vy = 0;
              this.localPlayer.grounded = true;
              this.localPlayer.rotation = 0;
              // Reset jump states when landing
              this.localPlayer.hasFirstJumped = false;
              this.localPlayer.hasSecondJump = false;
              onGround = true;
              break;
            }
          }
        }
        
        // Check tile below player (must be within bounds)
        if (playerBottom + 1 >= 0 && playerBottom + 1 < this.level.height) {
          const tile = this.getTileAt(x, playerBottom + 1);
          if (tile && (tile.type === 'solid' || tile.type === 'start' || tile.type === 'finish')) {
            const targetY = (playerBottom + 1) * this.TILE_SIZE - this.PLAYER_SIZE;
            const distance = Math.abs(this.localPlayer.y - targetY);
            tileInfo.push(`BELOW[${x},${playerBottom + 1}]=${tile.type} dist=${distance.toFixed(1)}`);
            
            // Check if player is moving downward or stationary
            if (this.localPlayer.vy >= -0.5) { // Allow slight upward velocity tolerance
              // Only snap if reasonably close (within 4 pixels)
              if (distance <= 4) {
                // Only apply landing logic if transitioning from air to ground
                if (!wasGrounded) {
                  this.log(`LANDED BELOW TILE: type=${tile.type} at (${x},${playerBottom + 1}) | pos: (${this.localPlayer.x.toFixed(1)}, ${this.localPlayer.y.toFixed(1)})`);
                }
                // Only snap position if significantly off (prevents constant micro-adjustments)
                if (Math.abs(this.localPlayer.y - targetY) > 0.1) {
                  this.localPlayer.y = targetY;
                }
                this.localPlayer.vy = 0;
                this.localPlayer.grounded = true;
                this.localPlayer.rotation = 0; // Reset rotation immediately on landing
                // Reset jump states when landing
                this.localPlayer.hasFirstJumped = false;
                this.localPlayer.hasSecondJump = false;
                onGround = true;
                break;
              }
            }
          }
        }
      }
    }
    
    // ========================================================================
    // GROUNDED STATE VALIDATION
    // ========================================================================
    // If player is marked as grounded but no ground was found, unground them immediately
    // This ensures players fall off platforms when walking sideways
    if (this.localPlayer.grounded && !onGround) {
      // Player is marked as grounded but no ground was detected - unground immediately
      this.localPlayer.grounded = false;
      this.log(`UNGROUNDED: No ground detected | pos: (${this.localPlayer.x.toFixed(1)}, ${this.localPlayer.y.toFixed(1)}) | vy=${this.localPlayer.vy.toFixed(2)}`);
    }
    
    // Log collision info only on state changes or when debugging
    if (wasGrounded !== this.localPlayer.grounded) {
      this.log(`COLLISION CHECK: grounded=${wasGrounded} -> ${this.localPlayer.grounded} | tiles: ${tileInfo.join(', ')} | pos: (${this.localPlayer.x.toFixed(1)}, ${this.localPlayer.y.toFixed(1)})`);
    }

    // Check ceiling (but allow dash to work even when hitching to ceiling)
    // Only apply ceiling collision if not dashing (dash can move through ceiling)
    if (!this.localPlayer.isDashing) {
      for (let x = playerLeft; x <= playerRight; x++) {
        const tile = this.getTileAt(x, playerTop - 1);
        if (tile && (tile.type === 'solid' || tile.type === 'start' || tile.type === 'finish')) {
          this.localPlayer.y = (playerTop) * this.TILE_SIZE;
          this.localPlayer.vy = 0;
          break;
        }
      }
    }
    
    // ========================================================================
    // VERTICAL WALL COLLISION DETECTION (when moving upward)
    // ========================================================================
    // Check for walls 2+ levels high when player is moving upward
    // This prevents passing through walls when jumping up
    if (this.localPlayer.vy < 0 && !this.localPlayer.isDashing) {
      // Check all tiles that the player horizontally overlaps with
      for (let checkX = playerLeft; checkX <= playerRight; checkX++) {
        if (checkX >= 0 && checkX < this.level.width) {
          // Check if there's a wall at this X position that's 2+ tiles high
          // A wall is 2+ tiles high if there are solid tiles at playerTop-1 and playerTop-2
          const tileAtPlayerLevel = this.getTileAt(checkX, playerTop - 1);
          const tileAbovePlayer = this.getTileAt(checkX, playerTop - 2);
          
          if (tileAtPlayerLevel && (tileAtPlayerLevel.type === 'solid' || tileAtPlayerLevel.type === 'start' || tileAtPlayerLevel.type === 'finish')) {
            // Found a tile at player level - check if it's a wall (2+ tiles high)
            if (tileAbovePlayer && (tileAbovePlayer.type === 'solid' || tileAbovePlayer.type === 'start' || tileAbovePlayer.type === 'finish')) {
              // This is a wall 2+ tiles high
              // Check if player is horizontally overlapping with this wall
              const tileLeftX = checkX * this.TILE_SIZE;
              const tileRightX = (checkX + 1) * this.TILE_SIZE;
              const playerLeftX = this.localPlayer.x;
              const playerRightX = this.localPlayer.x + this.PLAYER_SIZE;
              const horizontalOverlap = playerRightX > tileLeftX && playerLeftX < tileRightX;
              
              if (horizontalOverlap) {
                // Player is moving up into a wall - stop vertical movement
                const wallBottomY = (playerTop - 1) * this.TILE_SIZE;
                this.localPlayer.y = wallBottomY;
                this.localPlayer.vy = 0;
                this.log(`VERTICAL WALL COLLISION (UPWARD): Blocked by wall at tile (${checkX}, ${playerTop - 1}) | pos: (${this.localPlayer.x.toFixed(1)}, ${this.localPlayer.y.toFixed(1)})`);
                break;
              }
            }
          }
        }
      }
      
      // Also check tiles immediately to the left and right of player
      const sideTilesX = [playerLeft - 1, playerRight + 1];
      for (const checkX of sideTilesX) {
        if (checkX >= 0 && checkX < this.level.width) {
          const tileAtPlayerLevel = this.getTileAt(checkX, playerTop - 1);
          const tileAbovePlayer = this.getTileAt(checkX, playerTop - 2);
          
          if (tileAtPlayerLevel && (tileAtPlayerLevel.type === 'solid' || tileAtPlayerLevel.type === 'start' || tileAtPlayerLevel.type === 'finish')) {
            if (tileAbovePlayer && (tileAbovePlayer.type === 'solid' || tileAbovePlayer.type === 'start' || tileAbovePlayer.type === 'finish')) {
              // This is a wall 2+ tiles high
              const tileLeftX = checkX * this.TILE_SIZE;
              const tileRightX = (checkX + 1) * this.TILE_SIZE;
              const playerLeftX = this.localPlayer.x;
              const playerRightX = this.localPlayer.x + this.PLAYER_SIZE;
              const horizontalOverlap = playerRightX > tileLeftX && playerLeftX < tileRightX;
              
              if (horizontalOverlap) {
                const wallBottomY = (playerTop - 1) * this.TILE_SIZE;
                this.localPlayer.y = wallBottomY;
                this.localPlayer.vy = 0;
                this.log(`VERTICAL WALL COLLISION (UPWARD SIDE): Blocked by wall at tile (${checkX}, ${playerTop - 1}) | pos: (${this.localPlayer.x.toFixed(1)}, ${this.localPlayer.y.toFixed(1)})`);
                break;
              }
            }
          }
        }
      }
    }

    // Check side collisions - with wrap-around for closed loop
    // PHILOSOPHY:
    // - 1 tile elevation change: Auto-step up (smooth traversal, no input needed)
    // - 2+ tile elevation change: Requires jump, stops player on collision (wall)
    
    // FIRST: Check if player is currently INSIDE any 2+ level wall and clamp them out immediately
    // This catches cases where fast movement passed through the wall
    // Reuse the player bounds variables that are already calculated
    // Check all tiles the player is currently overlapping with
    for (let checkX = playerLeft; checkX <= playerRight; checkX++) {
      if (checkX >= 0 && checkX < this.level.width) {
        // Check if there's a 2+ level wall at this X position
        if (playerBottom - 1 >= 0 && playerBottom - 2 >= 0) {
          const tileOneLevelAbove = this.getTileAt(checkX, playerBottom - 1);
          const tileTwoLevelsAbove = this.getTileAt(checkX, playerBottom - 2);
          if (tileOneLevelAbove && (tileOneLevelAbove.type === 'solid' || tileOneLevelAbove.type === 'start' || tileOneLevelAbove.type === 'finish') &&
              tileTwoLevelsAbove && (tileTwoLevelsAbove.type === 'solid' || tileTwoLevelsAbove.type === 'start' || tileTwoLevelsAbove.type === 'finish')) {
            // This is a 2+ level wall - check if player is inside it
            const tileLeftX = checkX * this.TILE_SIZE;
            const tileRightX = (checkX + 1) * this.TILE_SIZE;
            const playerLeftX = this.localPlayer.x;
            const playerRightX = this.localPlayer.x + this.PLAYER_SIZE;
            const playerTopY = this.localPlayer.y;
            const playerBottomY = this.localPlayer.y + this.PLAYER_SIZE;
            
            // Check if player is horizontally overlapping with this wall
            const horizontalOverlap = playerRightX > tileLeftX && playerLeftX < tileRightX;
            // Check if player is vertically overlapping with the wall (between top and bottom of wall)
            const wallTopY = (playerBottom - 2) * this.TILE_SIZE;
            const wallBottomY = (playerBottom) * this.TILE_SIZE;
            const verticalOverlap = playerTopY < wallBottomY && playerBottomY > wallTopY;
            
            if (horizontalOverlap && verticalOverlap) {
              // Player is inside a 2+ level wall - clamp them out immediately
              // Determine which side to clamp to based on movement direction
              if (this.localPlayer.vx > 0) {
                // Moving right - clamp to left side of wall
                this.localPlayer.x = tileLeftX - this.PLAYER_SIZE;
                this.localPlayer.vx = 0;
                this.log(`INSIDE 2+ LEVEL WALL (RIGHT): Clamped player out to ${this.localPlayer.x.toFixed(1)}`);
                return; // Exit early, collision resolved
              } else if (this.localPlayer.vx < 0) {
                // Moving left - clamp to right side of wall
                this.localPlayer.x = tileRightX;
                this.localPlayer.vx = 0;
                this.log(`INSIDE 2+ LEVEL WALL (LEFT): Clamped player out to ${this.localPlayer.x.toFixed(1)}`);
                return; // Exit early, collision resolved
              } else {
                // Not moving - clamp to whichever side is closer
                const distToLeft = Math.abs(playerRightX - tileLeftX);
                const distToRight = Math.abs(tileRightX - playerLeftX);
                if (distToLeft < distToRight) {
                  this.localPlayer.x = tileLeftX - this.PLAYER_SIZE;
                } else {
                  this.localPlayer.x = tileRightX;
                }
                this.localPlayer.vx = 0;
                this.log(`INSIDE 2+ LEVEL WALL (STATIONARY): Clamped player out to ${this.localPlayer.x.toFixed(1)}`);
                return; // Exit early, collision resolved
              }
            }
          }
        }
      }
    }
    
    // Always check side collisions when moving right
    if (this.localPlayer.vx > 0.1) {
      // Check right edge - player is moving right
      if (playerRight + 1 >= this.level.width) {
        // Wrap to left side
        this.localPlayer.x = 2 * this.TILE_SIZE;
      } else {
        // Check both the current tile the player is in AND the next tile
        // This ensures we catch collisions even if the player is partially in a wall
        const currentTileX = playerRight;
        const nextTileX = playerRight + 1;
        
        // First check the current tile (playerRight) - player might be overlapping with a wall in their current tile
        // But we need to check elevation change to determine if it's a step-up or a wall
        if (currentTileX >= 0 && currentTileX < this.level.width) {
          const playerRightX = this.localPlayer.x + this.PLAYER_SIZE;
          const playerLeftX = this.localPlayer.x;
          const playerTopY = this.localPlayer.y;
          const playerBottomY = this.localPlayer.y + this.PLAYER_SIZE;
          const currentFloorY = playerBottom; // Current floor tile Y coordinate
          
          for (let y = playerTop; y <= playerBottom; y++) {
            if (y >= 0 && y < this.level.height) {
              const tile = this.getTileAt(currentTileX, y);
              if (tile && (tile.type === 'solid' || tile.type === 'start' || tile.type === 'finish')) {
                const tileLeftX = currentTileX * this.TILE_SIZE;
                const tileRightX = (currentTileX + 1) * this.TILE_SIZE;
                const tileTopY = y * this.TILE_SIZE;
                const tileBottomY = (y + 1) * this.TILE_SIZE;
                
                // Check if player's right edge has passed the tile's left edge
                const horizontalOverlap = playerRightX > tileLeftX && playerLeftX < tileRightX;
                const verticalOverlap = playerTopY < tileBottomY && playerBottomY > tileTopY;
                
                if (horizontalOverlap && verticalOverlap) {
                  const elevationChange = currentFloorY - y;
                  
                  if (elevationChange >= 2) {
                    // 2+ tile wall: Stop player
                    this.localPlayer.x = tileLeftX - this.PLAYER_SIZE;
                    this.localPlayer.vx = 0;
                    this.log(`CURRENT TILE WALL COLLISION RIGHT: tile=(${currentTileX}, ${y}), elevationChange=${elevationChange}, stopped at x=${this.localPlayer.x.toFixed(1)}`);
                    return; // Exit early, collision resolved
                  } else if (elevationChange === 1) {
                    // 1 tile step: Auto-step up (handled by next tile check)
                    // Don't stop here, let the next tile check handle the step-up
                  } else {
                    // Same level or going down: Stop player (it's a wall)
                    this.localPlayer.x = tileLeftX - this.PLAYER_SIZE;
                    this.localPlayer.vx = 0;
                    this.log(`CURRENT TILE SIDE WALL COLLISION RIGHT: tile=(${currentTileX}, ${y}), elevationChange=${elevationChange}, stopped at x=${this.localPlayer.x.toFixed(1)}`);
                    return; // Exit early, collision resolved
                  }
                }
              }
            }
          }
        }
        
        // Then check the next tile
        if (nextTileX >= 0 && nextTileX < this.level.width) {
          // Check for solid tiles that would block the player's movement
          // We need to check tiles at the player's vertical level (or above)
          const tileLeftX = nextTileX * this.TILE_SIZE;
          const tileRightX = (nextTileX + 1) * this.TILE_SIZE;
          const playerRightX = this.localPlayer.x + this.PLAYER_SIZE;
          const playerLeftX = this.localPlayer.x;
          const playerTopY = this.localPlayer.y;
          const playerBottomY = this.localPlayer.y + this.PLAYER_SIZE;
          const currentFloorY = playerBottom; // Current floor tile Y coordinate
          
          // Check tiles from player's top to bottom (these would block movement)
          let blockingTileY = -1;
          let isMultiLevelWall = false; // Declare early for early wall detection
          // First, check for 2+ level walls above player (these should always block)
          // Check if there are tiles at both playerBottom-1 and playerBottom-2 in next column
          if (playerBottom - 1 >= 0 && playerBottom - 2 >= 0) {
            const tileOneLevelAbove = this.getTileAt(nextTileX, playerBottom - 1);
            const tileTwoLevelsAbove = this.getTileAt(nextTileX, playerBottom - 2);
            if (tileOneLevelAbove && (tileOneLevelAbove.type === 'solid' || tileOneLevelAbove.type === 'start' || tileOneLevelAbove.type === 'finish') &&
                tileTwoLevelsAbove && (tileTwoLevelsAbove.type === 'solid' || tileTwoLevelsAbove.type === 'start' || tileTwoLevelsAbove.type === 'finish')) {
              // This is a 2+ level wall - use sweep collision detection
              const tileLeftX = nextTileX * this.TILE_SIZE;
              // Check if player's movement path (from previous position to current position) intersects the wall
              // We need to check if the player would have passed through the wall
              const previousX = this.localPlayer.x - this.localPlayer.vx * (50 / 16); // Estimate previous position
              const previousRightX = previousX + this.PLAYER_SIZE;
              // Check if movement path crosses the wall boundary
              const pathCrossesWall = previousRightX < tileLeftX && playerRightX >= tileLeftX;
              // Also check if player is currently overlapping or very close
              const isCurrentlyOverlapping = playerRightX >= tileLeftX - 2 && this.localPlayer.x < tileLeftX + this.TILE_SIZE;
              
              if (pathCrossesWall || isCurrentlyOverlapping) {
                // Find top of wall
                let wallTopY = playerBottom - 1;
                for (let checkY = playerBottom - 1; checkY >= 0; checkY--) {
                  const checkTile = this.getTileAt(nextTileX, checkY);
                  if (checkTile && (checkTile.type === 'solid' || checkTile.type === 'start' || checkTile.type === 'finish')) {
                    wallTopY = checkY;
                  } else {
                    break;
                  }
                }
                blockingTileY = wallTopY;
                isMultiLevelWall = true;
                // If path crosses wall, clamp position to wall boundary
                if (pathCrossesWall && playerRightX > tileLeftX) {
                  this.localPlayer.x = tileLeftX - this.PLAYER_SIZE;
                  this.localPlayer.vx = 0;
                  this.log(`2+ LEVEL WALL SWEEP COLLISION RIGHT: wall top at (${nextTileX}, ${wallTopY}), clamped position to ${this.localPlayer.x.toFixed(1)}`);
                } else {
                  this.log(`2+ LEVEL WALL DETECTED RIGHT (EARLY): wall top at (${nextTileX}, ${wallTopY}), blocking immediately`);
                }
              }
            }
          }
          
          // If no 2+ level wall found, check tiles from player's top to bottom (these would block movement)
          if (blockingTileY === -1) {
            for (let y = playerTop; y <= playerBottom; y++) {
              if (y >= 0 && y < this.level.height) {
                const tile = this.getTileAt(nextTileX, y);
                if (tile && (tile.type === 'solid' || tile.type === 'start' || tile.type === 'finish')) {
                  const tileTopY = y * this.TILE_SIZE;
                  const tileBottomY = (y + 1) * this.TILE_SIZE;
                  
                  // Check if this tile would actually block the player
                  // Player's right edge must be at or past the tile's left edge
                  // AND player's left edge must be before the tile's right edge
                  const horizontalOverlap = playerRightX >= tileLeftX && playerLeftX < tileRightX;
                  const verticalOverlap = playerTopY < tileBottomY && playerBottomY > tileTopY;
                  
                  if (horizontalOverlap && verticalOverlap) {
                    blockingTileY = y;
                    this.log(`COLLISION DETECTED RIGHT: tile=(${nextTileX}, ${y}), playerRightX=${playerRightX.toFixed(1)}, tileLeftX=${tileLeftX.toFixed(1)}, hOverlap=${horizontalOverlap}, vOverlap=${verticalOverlap}`);
                    break; // Found a blocking tile, stop searching
                  }
                }
              }
            }
          }
          
          // Debug: log if we're checking but not finding collisions
          if (blockingTileY === -1) {
            // Check if there's a solid tile in the next column at player's level
            for (let y = playerTop; y <= playerBottom; y++) {
              if (y >= 0 && y < this.level.height) {
                const tile = this.getTileAt(nextTileX, y);
                if (tile && (tile.type === 'solid' || tile.type === 'start' || tile.type === 'finish')) {
                  const tileLeftX = nextTileX * this.TILE_SIZE;
                  const tileRightX = (nextTileX + 1) * this.TILE_SIZE;
                  const hOverlap = playerRightX >= tileLeftX && playerLeftX < tileRightX;
                  const vOverlap = playerTopY < (y + 1) * this.TILE_SIZE && playerBottomY > y * this.TILE_SIZE;
                  this.log(`NO COLLISION RIGHT: tile=(${nextTileX}, ${y}), playerRightX=${playerRightX.toFixed(1)}, tileLeftX=${tileLeftX.toFixed(1)}, playerX=${this.localPlayer.x.toFixed(1)}, hOverlap=${hOverlap}, vOverlap=${vOverlap}`);
                }
              }
            }
          }
          
          // Also check for tiles just above player's feet (for step-up detection)
          // This handles the case where the player is approaching a 1-tile step
          // Note: Y increases downward, so "above" means lower Y values
          // IMPORTANT: Only step up if there's exactly 1 level difference (not 2+)
          // isMultiLevelWall is now declared earlier in the collision detection
          if (blockingTileY === -1 && playerBottom - 1 >= 0) {
            const tileAbove = this.getTileAt(nextTileX, playerBottom - 1);
            const tileTwoLevelsAbove = playerBottom - 2 >= 0 ? this.getTileAt(nextTileX, playerBottom - 2) : null;
            
            // Check if there's a tile one level above
            if (tileAbove && (tileAbove.type === 'solid' || tileAbove.type === 'start' || tileAbove.type === 'finish')) {
              // Check if there's also a tile two levels above - if so, it's a 2+ level wall
              const isWall = tileTwoLevelsAbove && (tileTwoLevelsAbove.type === 'solid' || tileTwoLevelsAbove.type === 'start' || tileTwoLevelsAbove.type === 'finish');
              
              if (!isWall) {
                // This is a 1-tile step up scenario (tile one level above, but not two levels above)
                const tileTopY = (playerBottom - 1) * this.TILE_SIZE;
                // Check if player is approaching or overlapping the platform
                // Player's right edge should be at or past the tile's left edge (or very close)
                const horizontalApproach = playerRightX >= tileLeftX - 2 && playerLeftX < tileRightX;
                // Allow step-up if player is at or slightly above the platform level (within 1 tile height)
                // This handles the case where player is on ground and platform is 1 level above
                const verticalDistance = tileTopY - playerBottomY;
                if (horizontalApproach && verticalDistance >= -this.TILE_SIZE && verticalDistance <= this.TILE_SIZE) {
                  // This is a step-up scenario - elevation change is 1
                  blockingTileY = playerBottom - 1;
                  this.log(`STEP-UP DETECTED RIGHT: tile=(${nextTileX}, ${playerBottom - 1}), will auto-step | verticalDist=${verticalDistance.toFixed(1)}, playerRightX=${playerRightX.toFixed(1)}, tileLeftX=${tileLeftX.toFixed(1)}`);
                }
              } else {
                // This is a 2+ level wall - should block, not step up
                // Find the top of the wall (lowest Y value) to calculate proper elevation change
                let wallTopY = playerBottom - 1;
                for (let checkY = playerBottom - 1; checkY >= 0; checkY--) {
                  const checkTile = this.getTileAt(nextTileX, checkY);
                  if (checkTile && (checkTile.type === 'solid' || checkTile.type === 'start' || checkTile.type === 'finish')) {
                    wallTopY = checkY;
                  } else {
                    break;
                  }
                }
                blockingTileY = wallTopY; // Use top of wall as blocking tile for proper elevation calculation
                isMultiLevelWall = true; // Mark as multi-level wall
                this.log(`WALL DETECTED RIGHT (2+ levels): wall top at (${nextTileX}, ${wallTopY}), will block`);
              }
            }
          }
          
          if (blockingTileY !== -1) {
            const tileTopY = blockingTileY * this.TILE_SIZE;
            const tileBottomY = (blockingTileY + 1) * this.TILE_SIZE;
            const elevationChange = currentFloorY - blockingTileY;
            
            // Check if player is actually overlapping with this tile
            const horizontalOverlap = playerRightX >= tileLeftX && this.localPlayer.x < tileRightX;
            const verticalOverlap = playerTopY < tileBottomY && playerBottomY > tileTopY;
            
            this.log(`BLOCKING TILE FOUND RIGHT: tile=(${nextTileX}, ${blockingTileY}), elevationChange=${elevationChange}, hOverlap=${horizontalOverlap}, vOverlap=${verticalOverlap}`);
            
            // For step-up (elevationChange === 1), check if player is approaching or overlapping
            // For walls (elevationChange >= 2), check if approaching (not just overlapping) to prevent pass-through
            const isStepUp = elevationChange === 1 && !isMultiLevelWall; // Don't step up if it's a multi-level wall
            const isApproaching = playerRightX >= tileLeftX - 2 && this.localPlayer.x < tileRightX;
            const shouldStepUp = isStepUp && isApproaching;
            // For walls, check if player is approaching horizontally OR overlapping vertically
            // This prevents pass-through when jumping up into walls
            // Also check if blockingTileY is above player (elevationChange >= 1) to catch 2+ level walls
            // Check player's current position AND projected next position to catch fast movement
            // For fast movement, check if player's movement path would intersect the wall
            const playerNextX = this.localPlayer.x + this.localPlayer.vx * (50 / 16); // Project next position (assuming ~50ms frame)
            const playerNextRightX = playerNextX + this.PLAYER_SIZE;
            // Check if player is currently approaching OR will be approaching in next frame
            // Also check if player's movement path intersects the wall (for fast movement)
            const isCurrentlyApproaching = playerRightX >= tileLeftX - 2 && this.localPlayer.x < tileRightX;
            const willBeApproaching = playerNextRightX >= tileLeftX && playerNextX < tileRightX;
            const movementPathIntersects = this.localPlayer.vx > 0 && this.localPlayer.x < tileRightX && playerNextX >= tileLeftX;
            const isApproachingWall = isCurrentlyApproaching || willBeApproaching || movementPathIntersects;
            const isWallAbovePlayer = blockingTileY < currentFloorY; // Wall is above player's current level
            const shouldBlock = isMultiLevelWall || elevationChange >= 2 || (elevationChange >= 1 && isWallAbovePlayer);
            // For multi-level walls, block immediately when approaching (don't wait for overlap)
            // Also check if player has already passed through the wall (sweep collision)
            // For other walls, require overlap or approach
            const hasPassedThroughWall = isMultiLevelWall && playerRightX > tileLeftX && this.localPlayer.x < tileLeftX;
            const shouldBlockWithOverlap = isMultiLevelWall ? (isApproachingWall || horizontalOverlap || hasPassedThroughWall) :
                                          shouldBlock && (isApproachingWall || (horizontalOverlap && verticalOverlap));
            
            if (shouldStepUp || shouldBlockWithOverlap || (horizontalOverlap && verticalOverlap && elevationChange === 0)) {
              // If player has passed through a multi-level wall, clamp them back immediately
              if (hasPassedThroughWall) {
                this.localPlayer.x = tileLeftX - this.PLAYER_SIZE;
                this.localPlayer.vx = 0;
                this.log(`2+ LEVEL WALL SWEEP COLLISION RIGHT: Player passed through, clamped to ${this.localPlayer.x.toFixed(1)}`);
                return; // Exit early, collision resolved
              }
              
              if (elevationChange === 1 && !isMultiLevelWall) {
                // 1 tile step up: Auto-step up (smooth traversal)
                const platformTopY = blockingTileY;
                this.localPlayer.y = platformTopY * this.TILE_SIZE - this.PLAYER_SIZE;
                this.localPlayer.vy = 0;
                this.localPlayer.grounded = true;
                this.localPlayer.hasFirstJumped = false;
                this.localPlayer.hasSecondJump = false;
                this.localPlayer.rotation = 0;
                // Don't stop horizontal movement - allow smooth traversal
                this.log(`AUTO STEP UP RIGHT: Stepped to tile (${nextTileX}, ${platformTopY}) | pos: (${this.localPlayer.x.toFixed(1)}, ${this.localPlayer.y.toFixed(1)})`);
              } else if (isMultiLevelWall || elevationChange >= 2 || (elevationChange >= 1 && blockingTileY < currentFloorY)) {
                // 2+ tile wall: Stop player (requires jump to traverse)
                // Block both horizontal and vertical movement through the wall
                if (this.localPlayer.grounded || this.localPlayer.isDashing) {
                  // On ground or dashing: stop horizontal movement
                  this.localPlayer.x = tileLeftX - this.PLAYER_SIZE;
                  this.localPlayer.vx = 0;
                  
                  if (this.localPlayer.isDashing) {
                    this.localPlayer.isDashing = false;
                    this.localPlayer.dashRemaining = 0;
                    this.localPlayer.dashCooldown = this.DASH_COOLDOWN_TICKS;
                    this.log(`DASH CANCELLED (WALL HIT): Stopped at tile (${nextTileX}, ${blockingTileY}) | pos: (${this.localPlayer.x.toFixed(1)}, ${this.localPlayer.y.toFixed(1)})`);
                  } else {
                    this.log(`WALL COLLISION RIGHT: Stopped at tile (${nextTileX}, ${blockingTileY}) | elevation change: ${elevationChange} | pos: (${this.localPlayer.x.toFixed(1)}, ${this.localPlayer.y.toFixed(1)})`);
                  }
                  return; // Exit early, collision resolved
                } else {
                  // In the air: block movement and snap to appropriate position
                  // If player is moving up into the wall, stop vertical movement
                  if (this.localPlayer.vy < 0 && playerTopY < tileBottomY) {
                    // Player is jumping up into wall - stop at wall
                    this.localPlayer.x = tileLeftX - this.PLAYER_SIZE;
                    this.localPlayer.vx = 0;
                    this.localPlayer.vy = 0;
                    this.log(`AIR WALL COLLISION RIGHT (UPWARD): Blocked at tile (${nextTileX}, ${blockingTileY}) | pos: (${this.localPlayer.x.toFixed(1)}, ${this.localPlayer.y.toFixed(1)})`);
                    return;
                  }
                  
                  // Otherwise, snap to top of platform
                  let platformTopY = blockingTileY;
                  for (let checkY = blockingTileY; checkY >= 0; checkY--) {
                    const checkTile = this.getTileAt(nextTileX, checkY);
                    if (checkTile && (checkTile.type === 'solid' || checkTile.type === 'start' || checkTile.type === 'finish')) {
                      platformTopY = checkY;
                    } else {
                      break;
                    }
                  }
                  
                  this.localPlayer.y = platformTopY * this.TILE_SIZE - this.PLAYER_SIZE;
                  this.localPlayer.vy = 0;
                  this.localPlayer.grounded = true;
                  this.localPlayer.hasFirstJumped = false;
                  this.localPlayer.hasSecondJump = false;
                  this.localPlayer.rotation = 0;
                  this.localPlayer.x = tileLeftX - this.PLAYER_SIZE;
                  this.localPlayer.vx = 0;
                  
                  this.log(`AIR COLLISION RIGHT: Snapped to platform top at tile (${nextTileX}, ${platformTopY}) | pos: (${this.localPlayer.x.toFixed(1)}, ${this.localPlayer.y.toFixed(1)})`);
                  return; // Exit early, collision resolved
                }
              } else {
                // Same level (elevationChange === 0) or going down: This is a wall blocking movement
                if (this.localPlayer.grounded || this.localPlayer.isDashing) {
                  // Stop horizontal movement - it's a wall
                  this.localPlayer.x = tileLeftX - this.PLAYER_SIZE;
                  this.localPlayer.vx = 0;
                  
                  if (this.localPlayer.isDashing) {
                    this.localPlayer.isDashing = false;
                    this.localPlayer.dashRemaining = 0;
                    this.localPlayer.dashCooldown = this.DASH_COOLDOWN_TICKS;
                    this.log(`DASH CANCELLED (SIDE WALL): Stopped at tile (${nextTileX}, ${blockingTileY}) | elevation: ${elevationChange} | pos: (${this.localPlayer.x.toFixed(1)}, ${this.localPlayer.y.toFixed(1)})`);
                  } else {
                    this.log(`SIDE WALL COLLISION RIGHT: Stopped at tile (${nextTileX}, ${blockingTileY}) | elevation: ${elevationChange} | pos: (${this.localPlayer.x.toFixed(1)}, ${this.localPlayer.y.toFixed(1)})`);
                  }
                  return; // Exit early, collision resolved
                } else {
                  // In the air: snap to top of platform
                  let platformTopY = blockingTileY;
                  for (let checkY = blockingTileY; checkY >= 0; checkY--) {
                    const checkTile = this.getTileAt(nextTileX, checkY);
                    if (checkTile && (checkTile.type === 'solid' || checkTile.type === 'start' || checkTile.type === 'finish')) {
                      platformTopY = checkY;
                    } else {
                      break;
                    }
                  }
                  
                  this.localPlayer.y = platformTopY * this.TILE_SIZE - this.PLAYER_SIZE;
                  this.localPlayer.vy = 0;
                  this.localPlayer.grounded = true;
                  this.localPlayer.hasFirstJumped = false;
                  this.localPlayer.hasSecondJump = false;
                  this.localPlayer.rotation = 0;
                  this.localPlayer.x = tileLeftX - this.PLAYER_SIZE;
                  this.localPlayer.vx = 0;
                  
                  this.log(`AIR SIDE COLLISION RIGHT: Snapped to platform top at tile (${nextTileX}, ${platformTopY}) | pos: (${this.localPlayer.x.toFixed(1)}, ${this.localPlayer.y.toFixed(1)})`);
                  return; // Exit early, collision resolved
                }
              }
            }
          }
        }
      }
    }
    
    // Always check side collisions when moving left
    if (this.localPlayer.vx < -0.1) {
      // Check left edge - player is moving left
      if (playerLeft - 1 < 0) {
        // Wrap to right side
        this.localPlayer.x = (this.level.width - 3) * this.TILE_SIZE;
      } else {
        // Check both the current tile the player is in AND the previous tile
        // This ensures we catch collisions even if the player is partially in a wall
        const currentTileX = playerLeft;
        const nextTileX = playerLeft - 1;
        
        // First check the current tile (playerLeft) - player might be overlapping with a wall in their current tile
        // But we need to check elevation change to determine if it's a step-up or a wall
        if (currentTileX >= 0 && currentTileX < this.level.width) {
          const playerRightX = this.localPlayer.x + this.PLAYER_SIZE;
          const playerLeftX = this.localPlayer.x;
          const playerTopY = this.localPlayer.y;
          const playerBottomY = this.localPlayer.y + this.PLAYER_SIZE;
          const currentFloorY = playerBottom; // Current floor tile Y coordinate
          
          for (let y = playerTop; y <= playerBottom; y++) {
            if (y >= 0 && y < this.level.height) {
              const tile = this.getTileAt(currentTileX, y);
              if (tile && (tile.type === 'solid' || tile.type === 'start' || tile.type === 'finish')) {
                const tileLeftX = currentTileX * this.TILE_SIZE;
                const tileRightX = (currentTileX + 1) * this.TILE_SIZE;
                const tileTopY = y * this.TILE_SIZE;
                const tileBottomY = (y + 1) * this.TILE_SIZE;
                
                // Check if player's left edge has passed the tile's right edge
                const horizontalOverlap = playerLeftX < tileRightX && playerRightX > tileLeftX;
                const verticalOverlap = playerTopY < tileBottomY && playerBottomY > tileTopY;
                
                if (horizontalOverlap && verticalOverlap) {
                  const elevationChange = currentFloorY - y;
                  
                  if (elevationChange >= 2) {
                    // 2+ tile wall: Stop player
                    this.localPlayer.x = tileRightX;
                    this.localPlayer.vx = 0;
                    this.log(`CURRENT TILE WALL COLLISION LEFT: tile=(${currentTileX}, ${y}), elevationChange=${elevationChange}, stopped at x=${this.localPlayer.x.toFixed(1)}`);
                    return; // Exit early, collision resolved
                  } else if (elevationChange === 1) {
                    // 1 tile step: Auto-step up (handled by next tile check)
                    // Don't stop here, let the next tile check handle the step-up
                  } else {
                    // Same level or going down: Stop player (it's a wall)
                    this.localPlayer.x = tileRightX;
                    this.localPlayer.vx = 0;
                    this.log(`CURRENT TILE SIDE WALL COLLISION LEFT: tile=(${currentTileX}, ${y}), elevationChange=${elevationChange}, stopped at x=${this.localPlayer.x.toFixed(1)}`);
                    return; // Exit early, collision resolved
                  }
                }
              }
            }
          }
        }
        
        // Then check the previous tile
        if (nextTileX >= 0 && nextTileX < this.level.width) {
          // Check for solid tiles that would block the player's movement
          // We need to check tiles at the player's vertical level (or above)
          const tileLeftX = nextTileX * this.TILE_SIZE;
          const tileRightX = (nextTileX + 1) * this.TILE_SIZE;
          const playerLeftX = this.localPlayer.x;
          const playerRightX = this.localPlayer.x + this.PLAYER_SIZE;
          const playerTopY = this.localPlayer.y;
          const playerBottomY = this.localPlayer.y + this.PLAYER_SIZE;
          const currentFloorY = playerBottom; // Current floor tile Y coordinate
          
          // Check tiles from player's top to bottom (these would block movement)
          let blockingTileY = -1;
          let isMultiLevelWallLeft = false; // Declare early for early wall detection
          // First, check for 2+ level walls above player (these should always block)
          // Check if there are tiles at both playerBottom-1 and playerBottom-2 in next column
          if (playerBottom - 1 >= 0 && playerBottom - 2 >= 0) {
            const tileOneLevelAbove = this.getTileAt(nextTileX, playerBottom - 1);
            const tileTwoLevelsAbove = this.getTileAt(nextTileX, playerBottom - 2);
            if (tileOneLevelAbove && (tileOneLevelAbove.type === 'solid' || tileOneLevelAbove.type === 'start' || tileOneLevelAbove.type === 'finish') &&
                tileTwoLevelsAbove && (tileTwoLevelsAbove.type === 'solid' || tileTwoLevelsAbove.type === 'start' || tileTwoLevelsAbove.type === 'finish')) {
              // This is a 2+ level wall - use sweep collision detection
              const tileRightX = (nextTileX + 1) * this.TILE_SIZE;
              // Check if player's movement path (from previous position to current position) intersects the wall
              const previousX = this.localPlayer.x - this.localPlayer.vx * (50 / 16); // Estimate previous position
              const previousLeftX = previousX;
              // Check if movement path crosses the wall boundary
              const pathCrossesWall = previousLeftX > tileRightX && playerLeftX <= tileRightX;
              // Also check if player is currently overlapping or very close
              const isCurrentlyOverlapping = playerLeftX <= tileRightX + 2 && playerRightX > nextTileX * this.TILE_SIZE;
              
              if (pathCrossesWall || isCurrentlyOverlapping) {
                // Find top of wall
                let wallTopY = playerBottom - 1;
                for (let checkY = playerBottom - 1; checkY >= 0; checkY--) {
                  const checkTile = this.getTileAt(nextTileX, checkY);
                  if (checkTile && (checkTile.type === 'solid' || checkTile.type === 'start' || checkTile.type === 'finish')) {
                    wallTopY = checkY;
                  } else {
                    break;
                  }
                }
                blockingTileY = wallTopY;
                isMultiLevelWallLeft = true;
                // If path crosses wall, clamp position to wall boundary
                if (pathCrossesWall && playerLeftX < tileRightX) {
                  this.localPlayer.x = tileRightX;
                  this.localPlayer.vx = 0;
                  this.log(`2+ LEVEL WALL SWEEP COLLISION LEFT: wall top at (${nextTileX}, ${wallTopY}), clamped position to ${this.localPlayer.x.toFixed(1)}`);
                } else {
                  this.log(`2+ LEVEL WALL DETECTED LEFT (EARLY): wall top at (${nextTileX}, ${wallTopY}), blocking immediately`);
                }
              }
            }
          }
          
          // If no 2+ level wall found, check tiles from player's top to bottom (these would block movement)
          if (blockingTileY === -1) {
            for (let y = playerTop; y <= playerBottom; y++) {
              if (y >= 0 && y < this.level.height) {
                const tile = this.getTileAt(nextTileX, y);
                if (tile && (tile.type === 'solid' || tile.type === 'start' || tile.type === 'finish')) {
                  const tileTopY = y * this.TILE_SIZE;
                  const tileBottomY = (y + 1) * this.TILE_SIZE;
                  
                  // Check if this tile would actually block the player
                  // Player's left edge must be at or past the tile's right edge (moving left)
                  // AND player's right edge must be after the tile's left edge
                  const horizontalOverlap = playerLeftX <= tileRightX && playerRightX > tileLeftX;
                  const verticalOverlap = playerTopY < tileBottomY && playerBottomY > tileTopY;
                  
                  if (horizontalOverlap && verticalOverlap) {
                    blockingTileY = y;
                    this.log(`COLLISION DETECTED LEFT: tile=(${nextTileX}, ${y}), playerLeftX=${playerLeftX.toFixed(1)}, tileRightX=${tileRightX.toFixed(1)}, hOverlap=${horizontalOverlap}, vOverlap=${verticalOverlap}`);
                    break; // Found a blocking tile, stop searching
                  }
                }
              }
            }
          }
          
          // Debug: log if we're checking but not finding collisions
          if (blockingTileY === -1) {
            // Check if there's a solid tile in the next column at player's level
            for (let y = playerTop; y <= playerBottom; y++) {
              if (y >= 0 && y < this.level.height) {
                const tile = this.getTileAt(nextTileX, y);
                if (tile && (tile.type === 'solid' || tile.type === 'start' || tile.type === 'finish')) {
                  const tileLeftX = nextTileX * this.TILE_SIZE;
                  const tileRightX = (nextTileX + 1) * this.TILE_SIZE;
                  const hOverlap = playerLeftX <= tileRightX && playerRightX > tileLeftX;
                  const vOverlap = playerTopY < (y + 1) * this.TILE_SIZE && playerBottomY > y * this.TILE_SIZE;
                  this.log(`NO COLLISION LEFT: tile=(${nextTileX}, ${y}), playerLeftX=${playerLeftX.toFixed(1)}, tileRightX=${tileRightX.toFixed(1)}, playerX=${this.localPlayer.x.toFixed(1)}, hOverlap=${hOverlap}, vOverlap=${vOverlap}`);
                }
              }
            }
          }
          
          // Also check for tiles just above player's feet (for step-up detection)
          // This handles the case where the player is approaching a 1-tile step
          // Note: Y increases downward, so "above" means lower Y values
          // IMPORTANT: Only step up if there's exactly 1 level difference (not 2+)
          // isMultiLevelWallLeft is now declared earlier in the collision detection
          if (blockingTileY === -1 && playerBottom - 1 >= 0) {
            const tileAbove = this.getTileAt(nextTileX, playerBottom - 1);
            const tileTwoLevelsAbove = playerBottom - 2 >= 0 ? this.getTileAt(nextTileX, playerBottom - 2) : null;
            
            // Check if there's a tile one level above
            if (tileAbove && (tileAbove.type === 'solid' || tileAbove.type === 'start' || tileAbove.type === 'finish')) {
              // Check if there's also a tile two levels above - if so, it's a 2+ level wall
              const isWall = tileTwoLevelsAbove && (tileTwoLevelsAbove.type === 'solid' || tileTwoLevelsAbove.type === 'start' || tileTwoLevelsAbove.type === 'finish');
              
              if (!isWall) {
                // This is a 1-tile step up scenario (tile one level above, but not two levels above)
                const tileTopY = (playerBottom - 1) * this.TILE_SIZE;
                // Check if player is approaching or overlapping the platform
                // Player's left edge should be at or past the tile's right edge (or very close)
                const horizontalApproach = playerLeftX <= tileRightX + 2 && playerRightX > tileLeftX;
                // Allow step-up if player is at or slightly above the platform level (within 1 tile height)
                // This handles the case where player is on ground and platform is 1 level above
                const verticalDistance = tileTopY - playerBottomY;
                if (horizontalApproach && verticalDistance >= -this.TILE_SIZE && verticalDistance <= this.TILE_SIZE) {
                  // This is a step-up scenario - elevation change is 1
                  blockingTileY = playerBottom - 1;
                  this.log(`STEP-UP DETECTED LEFT: tile=(${nextTileX}, ${playerBottom - 1}), will auto-step | verticalDist=${verticalDistance.toFixed(1)}, playerLeftX=${playerLeftX.toFixed(1)}, tileRightX=${tileRightX.toFixed(1)}`);
                }
              } else {
                // This is a 2+ level wall - should block, not step up
                // Find the top of the wall (lowest Y value) to calculate proper elevation change
                let wallTopY = playerBottom - 1;
                for (let checkY = playerBottom - 1; checkY >= 0; checkY--) {
                  const checkTile = this.getTileAt(nextTileX, checkY);
                  if (checkTile && (checkTile.type === 'solid' || checkTile.type === 'start' || checkTile.type === 'finish')) {
                    wallTopY = checkY;
                  } else {
                    break;
                  }
                }
                blockingTileY = wallTopY; // Use top of wall as blocking tile for proper elevation calculation
                isMultiLevelWallLeft = true; // Mark as multi-level wall
                this.log(`WALL DETECTED LEFT (2+ levels): wall top at (${nextTileX}, ${wallTopY}), will block`);
              }
            }
          }
          
          if (blockingTileY !== -1) {
            const tileTopY = blockingTileY * this.TILE_SIZE;
            const tileBottomY = (blockingTileY + 1) * this.TILE_SIZE;
            const elevationChange = currentFloorY - blockingTileY;
            
            // Check if player is actually overlapping with this tile
            const horizontalOverlap = playerLeftX <= tileRightX && playerRightX > tileLeftX;
            const verticalOverlap = playerTopY < tileBottomY && playerBottomY > tileTopY;
            
            this.log(`BLOCKING TILE FOUND LEFT: tile=(${nextTileX}, ${blockingTileY}), elevationChange=${elevationChange}, hOverlap=${horizontalOverlap}, vOverlap=${verticalOverlap}`);
            
            // For step-up (elevationChange === 1), check if player is approaching or overlapping
            // For walls (elevationChange >= 2), check if approaching (not just overlapping) to prevent pass-through
            const isStepUp = elevationChange === 1 && !isMultiLevelWallLeft; // Don't step up if it's a multi-level wall
            const isApproaching = playerLeftX <= tileRightX + 2 && playerRightX > tileLeftX;
            const shouldStepUp = isStepUp && isApproaching;
            // For walls, check if player is approaching horizontally OR overlapping vertically
            // This prevents pass-through when jumping up into walls
            // Also check if blockingTileY is above player (elevationChange >= 1) to catch 2+ level walls
            // Check player's current position AND projected next position to catch fast movement
            // For fast movement, check if player's movement path would intersect the wall
            const playerNextX = this.localPlayer.x + this.localPlayer.vx * (50 / 16); // Project next position (assuming ~50ms frame)
            const playerNextLeftX = playerNextX;
            // Check if player is currently approaching OR will be approaching in next frame
            // Also check if player's movement path intersects the wall (for fast movement)
            const isCurrentlyApproaching = playerLeftX <= tileRightX + 2 && playerRightX > tileLeftX;
            const willBeApproaching = playerNextLeftX <= tileRightX && playerNextX + this.PLAYER_SIZE > tileLeftX;
            const movementPathIntersects = this.localPlayer.vx < 0 && this.localPlayer.x + this.PLAYER_SIZE > tileLeftX && playerNextX <= tileRightX;
            const isApproachingWall = isCurrentlyApproaching || willBeApproaching || movementPathIntersects;
            const isWallAbovePlayer = blockingTileY < currentFloorY; // Wall is above player's current level
            const shouldBlock = isMultiLevelWallLeft || elevationChange >= 2 || (elevationChange >= 1 && isWallAbovePlayer);
            // For multi-level walls, block immediately when approaching (don't wait for overlap)
            // Also check if player has already passed through the wall (sweep collision)
            // For other walls, require overlap or approach
            const hasPassedThroughWall = isMultiLevelWallLeft && playerLeftX < tileRightX && (this.localPlayer.x + this.PLAYER_SIZE) > tileRightX;
            const shouldBlockWithOverlap = isMultiLevelWallLeft ? (isApproachingWall || horizontalOverlap || hasPassedThroughWall) :
                                          shouldBlock && (isApproachingWall || (horizontalOverlap && verticalOverlap));
            
            if (shouldStepUp || shouldBlockWithOverlap || (horizontalOverlap && verticalOverlap && elevationChange === 0)) {
              // If player has passed through a multi-level wall, clamp them back immediately
              if (hasPassedThroughWall) {
                this.localPlayer.x = tileRightX;
                this.localPlayer.vx = 0;
                this.log(`2+ LEVEL WALL SWEEP COLLISION LEFT: Player passed through, clamped to ${this.localPlayer.x.toFixed(1)}`);
                return; // Exit early, collision resolved
              }
              
              if (elevationChange === 1 && !isMultiLevelWallLeft) {
                // 1 tile step up: Auto-step up (smooth traversal)
                const platformTopY = blockingTileY;
                this.localPlayer.y = platformTopY * this.TILE_SIZE - this.PLAYER_SIZE;
                this.localPlayer.vy = 0;
                this.localPlayer.grounded = true;
                this.localPlayer.hasFirstJumped = false;
                this.localPlayer.hasSecondJump = false;
                this.localPlayer.rotation = 0;
                // Don't stop horizontal movement - allow smooth traversal
                this.log(`AUTO STEP UP LEFT: Stepped to tile (${nextTileX}, ${platformTopY}) | pos: (${this.localPlayer.x.toFixed(1)}, ${this.localPlayer.y.toFixed(1)})`);
              } else if (isMultiLevelWallLeft || elevationChange >= 2 || (elevationChange >= 1 && blockingTileY < currentFloorY)) {
                // 2+ tile wall: Stop player (requires jump to traverse)
                // Block both horizontal and vertical movement through the wall
                if (this.localPlayer.grounded || this.localPlayer.isDashing) {
                  // On ground or dashing: stop horizontal movement
                  this.localPlayer.x = tileRightX;
                  this.localPlayer.vx = 0;
                  
                  if (this.localPlayer.isDashing) {
                    this.localPlayer.isDashing = false;
                    this.localPlayer.dashRemaining = 0;
                    this.localPlayer.dashCooldown = this.DASH_COOLDOWN_TICKS;
                    this.log(`DASH CANCELLED (WALL HIT): Stopped at tile (${nextTileX}, ${blockingTileY}) | pos: (${this.localPlayer.x.toFixed(1)}, ${this.localPlayer.y.toFixed(1)})`);
                  } else {
                    this.log(`WALL COLLISION LEFT: Stopped at tile (${nextTileX}, ${blockingTileY}) | elevation change: ${elevationChange} | pos: (${this.localPlayer.x.toFixed(1)}, ${this.localPlayer.y.toFixed(1)})`);
                  }
                  return; // Exit early, collision resolved
                } else {
                  // In the air: block movement and snap to appropriate position
                  // If player is moving up into the wall, stop vertical movement
                  if (this.localPlayer.vy < 0 && playerTopY < tileBottomY) {
                    // Player is jumping up into wall - stop at wall
                    this.localPlayer.x = tileRightX;
                    this.localPlayer.vx = 0;
                    this.localPlayer.vy = 0;
                    this.log(`AIR WALL COLLISION LEFT (UPWARD): Blocked at tile (${nextTileX}, ${blockingTileY}) | pos: (${this.localPlayer.x.toFixed(1)}, ${this.localPlayer.y.toFixed(1)})`);
                    return;
                  }
                  
                  // Otherwise, snap to top of platform
                  let platformTopY = blockingTileY;
                  for (let checkY = blockingTileY; checkY >= 0; checkY--) {
                    const checkTile = this.getTileAt(nextTileX, checkY);
                    if (checkTile && (checkTile.type === 'solid' || checkTile.type === 'start' || checkTile.type === 'finish')) {
                      platformTopY = checkY;
                    } else {
                      break;
                    }
                  }
                  
                  this.localPlayer.y = platformTopY * this.TILE_SIZE - this.PLAYER_SIZE;
                  this.localPlayer.vy = 0;
                  this.localPlayer.grounded = true;
                  this.localPlayer.hasFirstJumped = false;
                  this.localPlayer.hasSecondJump = false;
                  this.localPlayer.rotation = 0;
                  this.localPlayer.x = tileRightX;
                  this.localPlayer.vx = 0;
                  
                  this.log(`AIR COLLISION LEFT: Snapped to platform top at tile (${nextTileX}, ${platformTopY}) | pos: (${this.localPlayer.x.toFixed(1)}, ${this.localPlayer.y.toFixed(1)})`);
                  return; // Exit early, collision resolved
                }
              } else {
                // Same level (elevationChange === 0) or going down: This is a wall blocking movement
                if (this.localPlayer.grounded || this.localPlayer.isDashing) {
                  // Stop horizontal movement - it's a wall
                  this.localPlayer.x = tileRightX;
                  this.localPlayer.vx = 0;
                  
                  if (this.localPlayer.isDashing) {
                    this.localPlayer.isDashing = false;
                    this.localPlayer.dashRemaining = 0;
                    this.localPlayer.dashCooldown = this.DASH_COOLDOWN_TICKS;
                    this.log(`DASH CANCELLED (SIDE WALL): Stopped at tile (${nextTileX}, ${blockingTileY}) | elevation: ${elevationChange} | pos: (${this.localPlayer.x.toFixed(1)}, ${this.localPlayer.y.toFixed(1)})`);
                  } else {
                    this.log(`SIDE WALL COLLISION LEFT: Stopped at tile (${nextTileX}, ${blockingTileY}) | elevation: ${elevationChange} | pos: (${this.localPlayer.x.toFixed(1)}, ${this.localPlayer.y.toFixed(1)})`);
                  }
                  return; // Exit early, collision resolved
                } else {
                  // In the air: snap to top of platform
                  let platformTopY = blockingTileY;
                  for (let checkY = blockingTileY; checkY >= 0; checkY--) {
                    const checkTile = this.getTileAt(nextTileX, checkY);
                    if (checkTile && (checkTile.type === 'solid' || checkTile.type === 'start' || checkTile.type === 'finish')) {
                      platformTopY = checkY;
                    } else {
                      break;
                    }
                  }
                  
                  this.localPlayer.y = platformTopY * this.TILE_SIZE - this.PLAYER_SIZE;
                  this.localPlayer.vy = 0;
                  this.localPlayer.grounded = true;
                  this.localPlayer.hasFirstJumped = false;
                  this.localPlayer.hasSecondJump = false;
                  this.localPlayer.rotation = 0;
                  this.localPlayer.x = tileRightX;
                  this.localPlayer.vx = 0;
                  
                  this.log(`AIR SIDE COLLISION LEFT: Snapped to platform top at tile (${nextTileX}, ${platformTopY}) | pos: (${this.localPlayer.x.toFixed(1)}, ${this.localPlayer.y.toFixed(1)})`);
                  return; // Exit early, collision resolved
                }
              }
            }
          }
        }
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

