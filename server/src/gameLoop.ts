/**
 * GameLoop.ts - Core Game Simulation Engine
 * 
 * This module contains the authoritative server-side game loop that simulates
 * all player physics, movement, collisions, and race logic. The game loop
 * runs at a fixed tick rate and processes player inputs to maintain a
 * synchronized game state across all clients.
 * 
 * Key Responsibilities:
 * - Physics simulation (gravity, velocity, acceleration, friction)
 * - Collision detection and response (ground, walls, hazards)
 * - Player movement processing (ground movement, jumping, dashing)
 * - Race state management (checkpoints, finish detection, race end conditions)
 * - Player respawn logic
 */

import { GameState, Player, PlayerInput, Level } from './types.js';
import { LevelGenerator } from './levelGenerator.js';

// ============================================================================
// TIMING CONSTANTS
// ============================================================================

/**
 * TICK_RATE - Fixed update rate for the game loop
 * The game simulation runs at 20 ticks per second (50ms per tick).
 * This ensures consistent physics regardless of client frame rate.
 */
const TICK_RATE = 20; // 20 ticks per second
const TICK_DURATION = 1000 / TICK_RATE; // Milliseconds between ticks (50ms)

// ============================================================================
// PHYSICS CONSTANTS
// ============================================================================

/**
 * GRAVITY - Vertical acceleration applied to players when airborne
 * Applied every tick to increase downward velocity (positive Y is downward).
 */
const GRAVITY = 0.5;

/**
 * JUMP_STRENGTH - Initial upward velocity when player jumps
 * Negative value because Y increases downward (negative = upward).
 * Applied once when jump input is detected while grounded.
 */
const JUMP_STRENGTH = -10; // negative for upward jump

/**
 * DASH_STRENGTH - Horizontal velocity boost when dashing in mid-air
 * Added to current horizontal velocity when dash is triggered.
 * Dash is a one-time mid-air ability available after jumping.
 */
const DASH_DISTANCE = 10; // 10 tiles (will be multiplied by TILE_SIZE = 16 to get 160 pixels)
const DASH_SPEED = 90; // Very fast horizontal velocity for dash animation (pixels per tick)
const DASH_COOLDOWN_TICKS = 30; // Cooldown after dash completes
const SECOND_JUMP_STRENGTH = -6; // Slightly weaker than first jump

/**
 * GROUND_MOVE_SPEED - Maximum horizontal speed cap for ground movement
 * Used to calculate MAX_HORIZONTAL_SPEED for velocity clamping.
 * Note: Actual ground movement uses acceleration (GROUND_ACCEL) to reach this speed.
 */
const GROUND_MOVE_SPEED = 50; // pixels per tick on ground - direct velocity assignment (no acceleration) - increased for faster movement

/**
 * GROUND_ACCEL - Horizontal acceleration when moving on ground
 * Applied per tick when player provides left/right input while grounded.
 * Allows smooth acceleration/deceleration for responsive ground movement.
 * Lower value = smoother, more controlled acceleration.
 */
const GROUND_ACCEL = 0.4; // Reduced for smoother acceleration

/**
 * AIR_ACCEL - Horizontal acceleration when moving in air
 * Lower than ground acceleration to provide less air control.
 * Allows slight directional adjustment while preserving jump momentum.
 */
const AIR_ACCEL = 0.4;

/**
 * GROUND_FRICTION - Velocity multiplier applied when on ground
 * Applied every tick to gradually slow down horizontal movement.
 * Creates a "glide" effect when landing with horizontal momentum.
 * Value of 0.92 means velocity is reduced by 8% per tick.
 */
const GROUND_FRICTION = 0.92;

/**
 * ROTATION_SPEED - Degrees per tick that player rotates when airborne
 * Creates a visual spinning effect based on horizontal movement direction.
 * Rotation resets to 0 immediately when player lands on ground.
 */
const ROTATION_SPEED = 5;

/**
 * PLAYER_SIZE - Width and height of player hitbox in pixels
 * Players are represented as 16x16 pixel squares for collision detection.
 */
const PLAYER_SIZE = 16;

/**
 * TILE_SIZE - Width and height of level tiles in pixels
 * Level is tile-based, with each tile being 16x16 pixels.
 */
const TILE_SIZE = 16;

/**
 * MAX_HORIZONTAL_SPEED - Maximum allowed horizontal velocity (for dash and air movement)
 * Calculated as the maximum of ground move speed and dash strength.
 * Used to clamp player velocity for dash and air movement only.
 * Note: Ground movement is separately capped to GROUND_MOVE_SPEED in processInput().
 */
const MAX_HORIZONTAL_SPEED = GROUND_MOVE_SPEED * 2; // Cap for air movement (dash is instant movement, not velocity)

/**
 * GameLoop - Authoritative Server-Side Game Simulation
 * 
 * This class manages the core game simulation loop that runs on the server.
 * It processes player inputs, updates physics, handles collisions, and
 * manages race state. All game logic is authoritative on the server to
 * prevent cheating and ensure consistent gameplay across all clients.
 */
export class GameLoop {
  /** Current game state containing all players, level, and race information */
  private gameState: GameState;
  
  /** Timestamp of the last game tick to enforce fixed tick rate */
  private lastTick: number = 0;
  
  /** Logging buffer for debugging movement issues */
  private logBuffer: string[] = [];
  private logBufferSize = 100; // Keep last 100 log entries

  /**
   * Creates a new GameLoop instance with the provided game state.
   * 
   * @param gameState - The initial game state containing players, level, and race configuration
   */
  constructor(gameState: GameState) {
    this.gameState = gameState;
  }

  /**
   * Main game loop update method - called every frame by the server
   * 
   * This method enforces a fixed tick rate (20 TPS) and processes all game
   * logic for each active player. The update sequence is:
   * 1. Physics update (gravity, velocity, position)
   * 2. Collision detection and response
   * 3. Checkpoint validation (lap mode only)
   * 4. Finish line detection
   * 5. Race end condition checking
   * 
   * @param deltaTime - Time elapsed since last frame (unused, we use fixed ticks)
   */
  update(deltaTime: number): void {
    // Only process game logic when race is actively running
    if (this.gameState.status !== 'racing') {
      return;
    }

    // Enforce fixed tick rate - only process if enough time has passed
    const now = Date.now();
    if (now - this.lastTick < TICK_DURATION) {
      return; // Skip this frame if not enough time has passed
    }
    this.lastTick = now; // Update last tick timestamp

    // Process each active player in the game
    for (const player of this.gameState.players.values()) {
      // Skip players who have already finished the race
      if (player.finished) continue;

      // Update player physics (gravity, velocity, position, rotation)
      this.updatePlayer(player, deltaTime);
      
      // Check and resolve collisions with level geometry (ground, walls, hazards)
      this.checkCollisions(player);
      
      // Validate checkpoint progression (only in lap mode)
      this.checkCheckpoints(player);
      
      // Check if player has reached finish line
      this.checkFinish(player);
    }

    // Check if race should end (time limit or all players finished)
    this.checkRaceEnd();
  }

  /**
   * Updates player physics: gravity, rotation, friction, position, and velocity clamping
   * 
   * This method applies physics forces to the player each tick:
   * - Gravity when airborne (increases downward velocity)
   * - Rotation animation when in air (visual effect)
   * - Ground friction when on ground (gradual slowdown)
   * - Position update based on current velocity
   * - Velocity clamping to prevent excessive speeds
   * 
   * @param player - The player object to update
   * @param deltaTime - Time elapsed (unused, physics are tick-based)
   */
  private updatePlayer(player: Player, deltaTime: number): void {
    const oldVx = player.vx;
    const oldVy = player.vy;
    const wasGrounded = player.grounded;
    
    // Update dash cooldown (decrease by 1 tick per update)
    if (player.dashCooldown > 0) {
      player.dashCooldown--;
    }
    
    // Update dash animation
    if (player.isDashing) {
      // If velocity is 0 (hit a wall), cancel dash immediately to prevent getting stuck
      if (Math.abs(player.vx) < 0.01) {
        player.isDashing = false;
        player.dashRemaining = 0;
        player.dashCooldown = DASH_COOLDOWN_TICKS;
        this.log(`[${player.id}] DASH CANCELLED (ZERO VELOCITY): Cooldown=${player.dashCooldown}`);
      } else {
        // Reduce remaining dash distance based on movement this tick
        const movementThisTick = Math.abs(player.vx);
        player.dashRemaining -= movementThisTick;
        
        // If dash is complete, stop dashing and set cooldown
        if (player.dashRemaining <= 0) {
          player.isDashing = false;
          player.dashRemaining = 0;
          player.dashCooldown = DASH_COOLDOWN_TICKS;
          // Reset velocity to allow immediate direction change on next tick
          // Movement input will set the correct velocity based on player input
          player.vx = 0;
          this.log(`[${player.id}] DASH COMPLETE: Cooldown=${player.dashCooldown}, vx reset to 0`);
        }
      }
    }
    
    // ========================================================================
    // AIRBORNE PHYSICS
    // ========================================================================
    if (!player.grounded) {
      // Apply gravity - increases downward velocity each tick
      // Gravity is cumulative, so players fall faster over time
      player.vy += GRAVITY;
  
      // Update rotation for visual spinning effect
      // Rotates based on horizontal movement direction (clockwise if moving right)
      player.rotation += ROTATION_SPEED * (player.vx > 0 ? 1 : -1);
      // Keep rotation in 0-360 degree range for rendering
      player.rotation = player.rotation % 360;
    } 
    // ========================================================================
    // GROUNDED PHYSICS
    // ========================================================================
    else {
      // Reset rotation immediately when landing (no smooth transition)
      // Prevents spinning animation from continuing on platforms
      player.rotation = 0;
  
      // NOTE: Friction is NOT applied here anymore
      // Friction is only applied in processInput() when there's no movement input
      // This prevents friction from constantly reducing velocity while player is moving
      
      // Stop completely if velocity becomes very small (prevents micro-movements)
      // Threshold of 0.05 pixels prevents jittery movement at low speeds
      if (Math.abs(player.vx) < 0.05) {
        player.vx = 0;
      }
    }
  
    // ========================================================================
    // POSITION UPDATE
    // ========================================================================
    // Update player position based on current velocity
    // Velocity is in pixels per tick, so we add it directly to position
    const oldX = player.x;
    const oldY = player.y;
    player.x += player.vx;
    player.y += player.vy;
  
    // Update distance traveled for ranking purposes
    // In side-scrolling game, X position represents distance from start
    player.distance = player.x;
  
    // ========================================================================
    // VELOCITY CLAMPING
    // ========================================================================
    // Prevent players from exceeding maximum speeds (prevents exploits/glitches)
    // Note: Ground movement is already capped to GROUND_MOVE_SPEED in processInput()
    // This clamp applies to air movement and dash (which can exceed ground speed)
    // Horizontal speed clamped to MAX_HORIZONTAL_SPEED (for dash/air only)
    if (!player.grounded) {
      // Only clamp air movement - ground movement is handled in processInput()
      const beforeClamp = player.vx;
      player.vx = Math.max(-MAX_HORIZONTAL_SPEED, Math.min(MAX_HORIZONTAL_SPEED, player.vx));
      if (beforeClamp !== player.vx) {
        this.log(`[${player.id}] AIR VELOCITY CLAMPED: ${beforeClamp.toFixed(2)} -> ${player.vx.toFixed(2)}`);
      }
    }
    // Vertical speed clamped to prevent excessive fall/jump speeds
    player.vy = Math.max(-15, Math.min(15, player.vy));
    
    // Log significant state changes
    if (wasGrounded !== player.grounded) {
      this.log(`[${player.id}] GROUNDED STATE: ${wasGrounded} -> ${player.grounded} | pos: (${player.x.toFixed(1)}, ${player.y.toFixed(1)}) | vel: (${player.vx.toFixed(2)}, ${player.vy.toFixed(2)})`);
    }
    if (Math.abs(oldVx - player.vx) > 0.1 || Math.abs(oldVy - player.vy) > 0.1) {
      this.log(`[${player.id}] VELOCITY CHANGE: vx ${oldVx.toFixed(2)} -> ${player.vx.toFixed(2)}, vy ${oldVy.toFixed(2)} -> ${player.vy.toFixed(2)} | grounded: ${player.grounded}`);
    }
  }

  /**
   * Processes player input and applies movement/jump/dash actions
   * 
   * This is the authoritative input handler that validates and applies
   * player actions. All movement is server-authoritative to prevent cheating.
   * 
   * Input processing order:
   * 1. Validate player exists and race is active
   * 2. Validate input timestamp (prevent replay attacks)
   * 3. Process horizontal movement (acceleration-based)
   * 4. Process jump/dash actions
   * 
   * @param playerId - Unique identifier of the player sending input
   * @param input - Player input object containing movement and jump states
   */
  processInput(playerId: string, input: PlayerInput): void {
    // Get player from game state
    const player = this.gameState.players.get(playerId);
    
    // Validate: player exists, race is active, player hasn't finished
    if (!player || this.gameState.status !== 'racing' || player.finished) return;
  
    // ========================================================================
    // INPUT VALIDATION (Anti-cheat: prevent replay attacks)
    // ========================================================================
    // Reject inputs that are too old (more than 200ms old)
    // Prevents players from replaying old inputs to gain advantages
    const now = Date.now();
    if (input.timestamp < now - 200) return;
  
    // Process jump input even when dashing (jump should always work)
    // ========================================================================
    // TWO-JUMP SYSTEM
    // ========================================================================
    if (input.jump) {
      // First jump: triggered when player is on ground
      if (player.grounded) {
        // CRITICAL: Preserve exact horizontal velocity from ground
        // Store current velocity before applying jump
        const preservedVx = player.vx;
        
        // Apply upward velocity (negative Y = upward)
        player.vy = JUMP_STRENGTH;
        
        // Restore exact horizontal velocity (maintains ground speed in air)
        player.vx = preservedVx;
        
        // Mark player as airborne
        player.grounded = false;
        
        // Track jump states
        player.hasFirstJumped = true;
        player.hasSecondJump = true; // Enable second jump
      } 
      // Air jump - available if:
      // 1. Player has used first jump and has second jump available, OR
      // 2. Player fell off platform without jumping (hasFirstJumped is false)
      else if (!player.grounded) {
        if (player.hasFirstJumped && player.hasSecondJump) {
          // Second jump - carries momentum based on progress through first jump
          const preservedVx = player.vx; // Preserve horizontal momentum
          
          // If player is still going up (vy < 0), add upward velocity for higher jump
          // If player is falling (vy > 0), carry downward momentum (add to existing vy)
          if (player.vy < 0) {
            // Still ascending - add upward boost
            player.vy = SECOND_JUMP_STRENGTH;
          } else {
            // Falling - carry momentum (add to existing downward velocity)
            player.vy += SECOND_JUMP_STRENGTH;
          }
          
          // Restore exact horizontal velocity
          player.vx = preservedVx;
          
          // Second jump used
          player.hasSecondJump = false;
        } else if (!player.hasFirstJumped) {
          // Player fell off platform without jumping - allow first jump in air
          const preservedVx = player.vx; // Preserve horizontal momentum
          player.vy = JUMP_STRENGTH;
          player.vx = preservedVx;
          player.hasFirstJumped = true;
          player.hasSecondJump = true; // Enable second jump after this one
        }
      }
    }

    // ========================================================================
    // HORIZONTAL MOVEMENT PROCESSING
    // ========================================================================
    // Skip normal movement if dashing (dash handles its own movement)
    if (player.isDashing) {
      return; // Dash is handling movement, don't apply normal movement
    }
    
    // Movement uses acceleration-based system for smooth, responsive controls
    const beforeInputVx = player.vx;
    if (player.grounded) {
      // Ground movement: direct velocity assignment (no acceleration) - matches user requirement
      if (input.left && !input.right) {
        // Set velocity directly to GROUND_MOVE_SPEED (no acceleration)
        player.vx = -GROUND_MOVE_SPEED;
        this.log(`[${playerId}] GROUND LEFT: ${beforeInputVx.toFixed(2)} -> ${player.vx.toFixed(2)} | GROUND_MOVE_SPEED=${GROUND_MOVE_SPEED}`);
      } else if (input.right && !input.left) {
        // Set velocity directly to GROUND_MOVE_SPEED (no acceleration)
        player.vx = GROUND_MOVE_SPEED;
        this.log(`[${playerId}] GROUND RIGHT: ${beforeInputVx.toFixed(2)} -> ${player.vx.toFixed(2)} | GROUND_MOVE_SPEED=${GROUND_MOVE_SPEED}`);
      } else {
        // No input: apply friction to slow down movement
        // Only apply friction when player is not providing input
        // This prevents friction from interfering with active movement
        const beforeFriction = player.vx;
        player.vx *= GROUND_FRICTION;
        // Stop completely if velocity becomes very small
        if (Math.abs(player.vx) < 0.05) {
          player.vx = 0;
        }
        if (Math.abs(beforeFriction) > 0.01) {
          this.log(`[${playerId}] GROUND FRICTION: ${beforeFriction.toFixed(2)} -> ${player.vx.toFixed(2)} (friction: ${GROUND_FRICTION})`);
        }
      }
    } else {
      // Air movement: allow full air control - player can change direction freely
      // Air control speed is slightly slower than ground speed for better feel
      const AIR_CONTROL_SPEED = GROUND_MOVE_SPEED * 0.8; // 80% of ground speed for air control
      
      if (input.left && !input.right) {
        player.vx = -AIR_CONTROL_SPEED;
      } else if (input.right && !input.left) {
        player.vx = AIR_CONTROL_SPEED;
      }
      // Note: If no input in air, velocity is preserved (no friction)
      // This allows players to maintain momentum if they want, or change direction with input
    }
  
    // ========================================================================
    // DASH SYSTEM (F key) - Velocity-based animation
    // ========================================================================
    if (input.dash && player.dashCooldown <= 0 && !player.isDashing) {
      // Determine dash direction (prefer current movement direction, fallback to input)
      let dashDirection = 0;
      if (Math.abs(player.vx) > 0.1) {
        dashDirection = player.vx > 0 ? 1 : -1;
      } else {
        dashDirection = input.right ? 1 : input.left ? -1 : 1; // Default right if no input
      }
      
      // Calculate dash distance (5 tiles)
      const dashDistance = DASH_DISTANCE * 16; // TILE_SIZE is 16
      const dashTargetX = player.x + (dashDirection * dashDistance);
      
      // Check if dash path would intersect a 2+ level wall
      const playerLeft = Math.floor(player.x / TILE_SIZE);
      const playerRight = Math.floor((player.x + PLAYER_SIZE) / TILE_SIZE);
      const playerTop = Math.floor(player.y / TILE_SIZE);
      const playerBottom = Math.floor((player.y + PLAYER_SIZE) / TILE_SIZE);
      
      // Check all tiles along the dash path for 2+ level walls
      const startX = dashDirection > 0 ? playerRight + 1 : playerLeft - 1;
      const endX = dashDirection > 0 ? Math.floor((dashTargetX + PLAYER_SIZE) / TILE_SIZE) : Math.floor(dashTargetX / TILE_SIZE);
      
      let blockingWallX = -1;
      for (let checkX = startX; dashDirection > 0 ? checkX <= endX : checkX >= endX; checkX += dashDirection) {
        if (checkX >= 0 && checkX < level.width) {
          // Check if there's a 2+ level wall at this X position
          if (playerBottom - 1 >= 0 && playerBottom - 2 >= 0) {
            if (LevelGenerator.isSolid(level, checkX, playerBottom - 1) &&
                LevelGenerator.isSolid(level, checkX, playerBottom - 2)) {
              // Found a 2+ level wall - block dash at this position
              blockingWallX = checkX;
              break;
            }
          }
        }
      }
      
      // If a wall was found, adjust dash distance to stop just before the wall
      let adjustedDashDistance = dashDistance;
      if (blockingWallX !== -1) {
        if (dashDirection > 0) {
          // Moving right - stop at left edge of wall
          const wallLeftX = blockingWallX * TILE_SIZE;
          adjustedDashDistance = Math.max(0, wallLeftX - player.x - PLAYER_SIZE);
        } else {
          // Moving left - stop at right edge of wall
          const wallRightX = (blockingWallX + 1) * TILE_SIZE;
          adjustedDashDistance = Math.max(0, player.x - wallRightX);
        }
        this.log(`[${playerId}] DASH BLOCKED BY 2+ LEVEL WALL: Adjusted distance from ${dashDistance} to ${adjustedDashDistance}`);
      }
      
      // Start dash animation - set velocity and track remaining distance
      player.isDashing = true;
      player.dashRemaining = adjustedDashDistance;
      player.vx = dashDirection * DASH_SPEED;
      
      this.log(`[${playerId}] DASH START: Direction=${dashDirection}, Distance=${adjustedDashDistance}, Speed=${DASH_SPEED}`);
    }
  }
  

  /**
   * Comprehensive collision detection and response system
   * 
   * This method performs AABB (Axis-Aligned Bounding Box) collision detection
   * between the player and all level geometry. It handles:
   * - Ground/platform collisions (landing detection)
   * - Ceiling collisions (hitting roof)
   * - Side/wall collisions (left and right walls)
   * - Special case: wrap-around for testground closed loop
   * - Hazard tile collisions (instant respawn)
   * - Grounded state management
   * 
   * Collision detection uses tile-based checks, converting player pixel
   * coordinates to tile coordinates for efficient collision queries.
   * 
   * @param player - The player to check collisions for
   */
  private checkCollisions(player: Player): void {
    const level = this.gameState.level;
    
    // ========================================================================
    // CONVERT PLAYER POSITION TO TILE COORDINATES
    // ========================================================================
    // Calculate which tiles the player's bounding box occupies
    // Player is 16x16 pixels, so we check all tiles the player overlaps
    const playerLeft = Math.floor(player.x / TILE_SIZE);
    const playerRight = Math.floor((player.x + PLAYER_SIZE) / TILE_SIZE);
    const playerTop = Math.floor(player.y / TILE_SIZE);
    const playerBottom = Math.floor((player.y + PLAYER_SIZE) / TILE_SIZE);

    // ========================================================================
    // GROUND/PLATFORM COLLISION DETECTION
    // ========================================================================
    // Check tiles directly below player for solid ground/platforms
    // IMPORTANT: Check center of player first for reliable edge detection
    // This prevents edge friction issues where player is partially over empty space
    let onGround = false;
    const wasGrounded = player.grounded;
    const tileInfo: string[] = [];
    const playerCenterX = Math.floor((player.x + PLAYER_SIZE / 2) / TILE_SIZE);
    
    // First, check center of player (most reliable, especially at platform edges)
    const centerTileOn = LevelGenerator.getTileAt(level, playerCenterX, playerBottom);
    if (centerTileOn && LevelGenerator.isSolid(level, playerCenterX, playerBottom)) {
      const tileTopY = playerBottom * TILE_SIZE;
      const playerBottomY = player.y + PLAYER_SIZE;
      const distance = playerBottomY - tileTopY;
      
      tileInfo.push(`CENTER_ON[${playerCenterX},${playerBottom}]=${centerTileOn.type} dist=${distance.toFixed(1)}`);
      
      // If player's bottom is at or very close to the top of the tile, they're standing on it
      if (playerBottomY >= tileTopY - 2 && playerBottomY <= tileTopY + 4) {
        // Only log landing if transitioning from air to ground
        if (!wasGrounded) {
          this.log(`[${player.id}] LANDED ON TILE (CENTER): type=${centerTileOn.type} at (${playerCenterX},${playerBottom}) | pos: (${player.x.toFixed(1)}, ${player.y.toFixed(1)})`);
        }
        
        // Only snap position if significantly off (prevents constant micro-adjustments)
        const expectedY = tileTopY - PLAYER_SIZE;
        if (Math.abs(player.y - expectedY) > 0.1) {
          player.y = expectedY;
        }
        
        // Stop vertical velocity (landing)
        player.vy = 0;
        
        // Mark as grounded (enables ground movement and jump)
        player.grounded = true;
        
        // Reset rotation immediately on landing (prevents spinning on platforms)
        player.rotation = 0;
        
        // Reset jump states when landing
        player.hasFirstJumped = false;
        player.hasSecondJump = false;
        
        onGround = true;
      }
    }
    
    // If center check didn't find ground, check center tile below player
    // IMPORTANT: Only check if playerBottom + 1 is within level bounds to prevent invisible floors
    if (!onGround && playerBottom + 1 < level.height) {
      const centerTileBelow = LevelGenerator.getTileAt(level, playerCenterX, playerBottom + 1);
      if (centerTileBelow && LevelGenerator.isSolid(level, playerCenterX, playerBottom + 1)) {
        const targetY = (playerBottom + 1) * TILE_SIZE - PLAYER_SIZE;
        const distance = Math.abs(player.y - targetY);
        
        tileInfo.push(`CENTER_BELOW[${playerCenterX},${playerBottom + 1}]=${centerTileBelow.type} dist=${distance.toFixed(1)}`);
        
        // Only trigger landing if player is moving downward or nearly stationary
        if (player.vy >= -0.5) {
          // Only snap if player is reasonably close (within 4 pixels)
          if (distance <= 4) {
            // Only log landing if transitioning from air to ground
            if (!wasGrounded) {
              this.log(`[${player.id}] LANDED BELOW TILE (CENTER): type=${centerTileBelow.type} at (${playerCenterX},${playerBottom + 1}) | pos: (${player.x.toFixed(1)}, ${player.y.toFixed(1)})`);
            }
            
            // Only snap position if significantly off (prevents constant micro-adjustments)
            if (Math.abs(player.y - targetY) > 0.1) {
              player.y = targetY;
            }
            
            // Stop vertical velocity (landing)
            player.vy = 0;
            
            // Mark as grounded (enables ground movement and jump)
            player.grounded = true;
            
            // Reset rotation immediately on landing (prevents spinning on platforms)
            player.rotation = 0;
            
            // Re-enable dash ability for next jump
            player.canDash = true;
            
            // Reset dash state (hasn't dashed yet)
            player.hasDashed = false;
            
            onGround = true;
          }
        }
      }
    }
    
    // Fallback: If center checks didn't find ground, check all tiles (for very small platforms or edge cases)
    if (!onGround) {
      for (let x = playerLeft; x <= playerRight; x++) {
        // First check: Is player standing ON a solid tile? (for start/finish tiles on top of ground)
        const tileOn = LevelGenerator.getTileAt(level, x, playerBottom);
        if (tileOn && LevelGenerator.isSolid(level, x, playerBottom)) {
          const tileTopY = playerBottom * TILE_SIZE;
          const playerBottomY = player.y + PLAYER_SIZE;
          const distance = playerBottomY - tileTopY;
          
          tileInfo.push(`ON[${x},${playerBottom}]=${tileOn.type} dist=${distance.toFixed(1)}`);
          
          // If player's bottom is at or very close to the top of the tile, they're standing on it
          if (playerBottomY >= tileTopY - 2 && playerBottomY <= tileTopY + 4) {
            // Only log landing if transitioning from air to ground
            if (!wasGrounded) {
              this.log(`[${player.id}] LANDED ON TILE: type=${tileOn.type} at (${x},${playerBottom}) | pos: (${player.x.toFixed(1)}, ${player.y.toFixed(1)})`);
            }
            
            // Only snap position if significantly off (prevents constant micro-adjustments)
            const expectedY = tileTopY - PLAYER_SIZE;
            if (Math.abs(player.y - expectedY) > 0.1) {
              player.y = expectedY;
            }
            
            // Stop vertical velocity (landing)
            player.vy = 0;
            
            // Mark as grounded (enables ground movement and jump)
            player.grounded = true;
            
            // Reset rotation immediately on landing (prevents spinning on platforms)
            player.rotation = 0;
            
            // Re-enable dash ability for next jump
            player.canDash = true;
            
            // Reset dash state (hasn't dashed yet)
            player.hasDashed = false;
            
            onGround = true;
            break; // Found ground, no need to check other tiles
          }
        }
        
        // Second check: Is there a solid tile directly below player? (must be within bounds)
        if (playerBottom + 1 >= 0 && playerBottom + 1 < level.height) {
          const tileBelow = LevelGenerator.getTileAt(level, x, playerBottom + 1);
          if (tileBelow && LevelGenerator.isSolid(level, x, playerBottom + 1)) {
            const targetY = (playerBottom + 1) * TILE_SIZE - PLAYER_SIZE;
            const distance = Math.abs(player.y - targetY);
            
            tileInfo.push(`BELOW[${x},${playerBottom + 1}]=${tileBelow.type} dist=${distance.toFixed(1)}`);
            
            // Only trigger landing if player is moving downward or nearly stationary
            if (player.vy >= -0.5) {
              // Only snap if player is reasonably close (within 4 pixels)
              if (distance <= 4) {
                // Only log landing if transitioning from air to ground
                if (!wasGrounded) {
                  this.log(`[${player.id}] LANDED BELOW TILE: type=${tileBelow.type} at (${x},${playerBottom + 1}) | pos: (${player.x.toFixed(1)}, ${player.y.toFixed(1)})`);
                }
                
                // Only snap position if significantly off (prevents constant micro-adjustments)
                if (Math.abs(player.y - targetY) > 0.1) {
                  player.y = targetY;
                }
                
                // Stop vertical velocity (landing)
                player.vy = 0;
                
                // Mark as grounded (enables ground movement and jump)
                player.grounded = true;
                
                // Reset rotation immediately on landing (prevents spinning on platforms)
                player.rotation = 0;
                
                // Re-enable dash ability for next jump
                player.canDash = true;
                
                // Reset dash state (hasn't dashed yet)
                player.hasDashed = false;
                
                onGround = true;
                break; // Found ground, no need to check other tiles
              }
            }
          }
        }
      }
    }
    
    // Log collision info only on state changes
    if (wasGrounded !== player.grounded) {
      this.log(`[${player.id}] COLLISION CHECK: grounded=${wasGrounded} -> ${player.grounded} | tiles: ${tileInfo.join(', ')} | pos: (${player.x.toFixed(1)}, ${player.y.toFixed(1)})`);
    }

    // ========================================================================
    // CEILING COLLISION DETECTION
    // ========================================================================
    // Check tiles directly above player for solid ceilings
    for (let x = playerLeft; x <= playerRight; x++) {
      // Check tile one row above player's top edge
      if (LevelGenerator.isSolid(level, x, playerTop - 1)) {
        // Snap player to bottom of ceiling tile
        player.y = (playerTop) * TILE_SIZE;
        
        // Stop upward velocity (hit ceiling)
        player.vy = 0;
        break;
      }
    }

    // ========================================================================
    // VERTICAL WALL COLLISION DETECTION (when moving upward)
    // ========================================================================
    // Check for walls 2+ levels high when player is moving upward
    // This prevents passing through walls when jumping up
    if (player.vy < 0 && !player.isDashing) {
      // Check all tiles that the player horizontally overlaps with
      for (let checkX = playerLeft; checkX <= playerRight; checkX++) {
        if (checkX >= 0 && checkX < level.width) {
          // Check if there's a wall at this X position that's 2+ tiles high
          // A wall is 2+ tiles high if there are solid tiles at playerTop-1 and playerTop-2
          if (LevelGenerator.isSolid(level, checkX, playerTop - 1) && LevelGenerator.isSolid(level, checkX, playerTop - 2)) {
            // This is a wall 2+ tiles high
            // Check if player is horizontally overlapping with this wall
            const tileLeftX = checkX * TILE_SIZE;
            const tileRightX = (checkX + 1) * TILE_SIZE;
            const playerLeftX = player.x;
            const playerRightX = player.x + PLAYER_SIZE;
            const horizontalOverlap = playerRightX > tileLeftX && playerLeftX < tileRightX;
            
            if (horizontalOverlap) {
              // Player is moving up into a wall - stop vertical movement
              const wallBottomY = (playerTop - 1) * TILE_SIZE;
              player.y = wallBottomY;
              player.vy = 0;
              this.log(`[${player.id}] VERTICAL WALL COLLISION (UPWARD): Blocked by wall at tile (${checkX}, ${playerTop - 1}) | pos: (${player.x.toFixed(1)}, ${player.y.toFixed(1)})`);
              break;
            }
          }
        }
      }
      
      // Also check tiles immediately to the left and right of player
      const sideTilesX = [playerLeft - 1, playerRight + 1];
      for (const checkX of sideTilesX) {
        if (checkX >= 0 && checkX < level.width) {
          if (LevelGenerator.isSolid(level, checkX, playerTop - 1) && LevelGenerator.isSolid(level, checkX, playerTop - 2)) {
            // This is a wall 2+ tiles high
            const tileLeftX = checkX * TILE_SIZE;
            const tileRightX = (checkX + 1) * TILE_SIZE;
            const playerLeftX = player.x;
            const playerRightX = player.x + PLAYER_SIZE;
            const horizontalOverlap = playerRightX > tileLeftX && playerLeftX < tileRightX;
            
            if (horizontalOverlap) {
              const wallBottomY = (playerTop - 1) * TILE_SIZE;
              player.y = wallBottomY;
              player.vy = 0;
              this.log(`[${player.id}] VERTICAL WALL COLLISION (UPWARD SIDE): Blocked by wall at tile (${checkX}, ${playerTop - 1}) | pos: (${player.x.toFixed(1)}, ${player.y.toFixed(1)})`);
              break;
            }
          }
        }
      }
    }

    // ========================================================================
    // SIDE/WALL COLLISION DETECTION
    // ========================================================================
    // Check for collisions with left and right walls
    // Special case: testground level has wrap-around (closed loop)
    // 
    // PHILOSOPHY:
    // - 1 tile elevation change: Auto-step up (smooth traversal, no input needed)
    // - 2+ tile elevation change: Requires jump, stops player on collision (wall)
    
    // FIRST: Check if player is currently INSIDE any 2+ level wall and clamp them out immediately
    // This catches cases where fast movement passed through the wall
    // Check all tiles the player is currently overlapping with
    for (let checkX = playerLeft; checkX <= playerRight; checkX++) {
      if (checkX >= 0 && checkX < level.width) {
        // Check if there's a 2+ level wall at this X position
        if (playerBottom - 1 >= 0 && playerBottom - 2 >= 0) {
          if (LevelGenerator.isSolid(level, checkX, playerBottom - 1) &&
              LevelGenerator.isSolid(level, checkX, playerBottom - 2)) {
            // This is a 2+ level wall - check if player is inside it
            const tileLeftX = checkX * TILE_SIZE;
            const tileRightX = (checkX + 1) * TILE_SIZE;
            const playerLeftX = player.x;
            const playerRightX = player.x + PLAYER_SIZE;
            const playerTopY = player.y;
            const playerBottomY = player.y + PLAYER_SIZE;
            
            // Check if player is horizontally overlapping with this wall
            const horizontalOverlap = playerRightX > tileLeftX && playerLeftX < tileRightX;
            // Check if player is vertically overlapping with the wall (between top and bottom of wall)
            const wallTopY = (playerBottom - 2) * TILE_SIZE;
            const wallBottomY = (playerBottom) * TILE_SIZE;
            const verticalOverlap = playerTopY < wallBottomY && playerBottomY > wallTopY;
            
            if (horizontalOverlap && verticalOverlap) {
              // Player is inside a 2+ level wall - clamp them out immediately
              // Determine which side to clamp to based on movement direction
              if (player.vx > 0) {
                // Moving right - clamp to left side of wall
                player.x = tileLeftX - PLAYER_SIZE;
                player.vx = 0;
                // Cancel dash if active
                if (player.isDashing) {
                  player.isDashing = false;
                  player.dashRemaining = 0;
                  player.dashCooldown = DASH_COOLDOWN_TICKS;
                }
                return; // Exit early, collision resolved
              } else if (player.vx < 0) {
                // Moving left - clamp to right side of wall
                player.x = tileRightX;
                player.vx = 0;
                // Cancel dash if active
                if (player.isDashing) {
                  player.isDashing = false;
                  player.dashRemaining = 0;
                  player.dashCooldown = DASH_COOLDOWN_TICKS;
                }
                return; // Exit early, collision resolved
              } else {
                // Not moving - clamp to whichever side is closer
                const distToLeft = Math.abs(playerRightX - tileLeftX);
                const distToRight = Math.abs(tileRightX - playerLeftX);
                if (distToLeft < distToRight) {
                  player.x = tileLeftX - PLAYER_SIZE;
                } else {
                  player.x = tileRightX;
                }
                player.vx = 0;
                // Cancel dash if active
                if (player.isDashing) {
                  player.isDashing = false;
                  player.dashRemaining = 0;
                  player.dashCooldown = DASH_COOLDOWN_TICKS;
                }
                return; // Exit early, collision resolved
              }
            }
          }
        }
      }
    }
    
    if (Math.abs(player.vx) > 0.1) {
      if (player.vx > 0.1) {
        // Player is moving right - check right wall
        if (level.id === 'testground' && playerRight + 1 >= level.width) {
          // Special case: testground wrap-around
          player.x = 2 * TILE_SIZE;
        } else {
          // Check the next tile to the right (playerRight + 1)
          const nextTileX = playerRight + 1;
          if (nextTileX >= 0 && nextTileX < level.width) {
            // Check for solid tiles that would block the player's movement
            // We need to check tiles at the player's vertical level (or above)
            const tileLeftX = nextTileX * TILE_SIZE;
            const tileRightX = (nextTileX + 1) * TILE_SIZE;
            const playerRightX = player.x + PLAYER_SIZE;
            const playerTopY = player.y;
            const playerBottomY = player.y + PLAYER_SIZE;
            const currentFloorY = playerBottom; // Current floor tile Y coordinate
            
            // Check tiles from player's top to bottom (these would block movement)
            let blockingTileY = -1;
            let isMultiLevelWall = false; // Declare early for early wall detection
            // First, check for 2+ level walls above player (these should always block)
            // Check if there are tiles at both playerBottom-1 and playerBottom-2 in next column
            if (playerBottom - 1 >= 0 && playerBottom - 2 >= 0) {
              if (LevelGenerator.isSolid(level, nextTileX, playerBottom - 1) &&
                  LevelGenerator.isSolid(level, nextTileX, playerBottom - 2)) {
                // This is a 2+ level wall - use sweep collision detection
                const tileLeftX = nextTileX * TILE_SIZE;
                // Check if player's movement path (from previous position to current position) intersects the wall
                const previousX = player.x - player.vx * (TICK_DURATION / 16); // Estimate previous position
                const previousRightX = previousX + PLAYER_SIZE;
                // Check if movement path crosses the wall boundary
                const pathCrossesWall = previousRightX < tileLeftX && playerRightX >= tileLeftX;
                // Also check if player is currently overlapping or very close
                const isCurrentlyOverlapping = playerRightX >= tileLeftX - 2 && player.x < tileLeftX + TILE_SIZE;
                
                if (pathCrossesWall || isCurrentlyOverlapping) {
                  // Find top of wall
                  let wallTopY = playerBottom - 1;
                  for (let checkY = playerBottom - 1; checkY >= 0; checkY--) {
                    if (LevelGenerator.isSolid(level, nextTileX, checkY)) {
                      wallTopY = checkY;
                    } else {
                      break;
                    }
                  }
                  blockingTileY = wallTopY;
                  isMultiLevelWall = true;
                  // If path crosses wall, clamp position to wall boundary
                  if (pathCrossesWall && playerRightX > tileLeftX) {
                    player.x = tileLeftX - PLAYER_SIZE;
                    player.vx = 0;
                  }
                }
              }
            }
            
            // If no 2+ level wall found, check tiles from player's top to bottom (these would block movement)
            if (blockingTileY === -1) {
              for (let y = playerTop; y <= playerBottom; y++) {
                if (y >= 0 && y < level.height) {
                  if (LevelGenerator.isSolid(level, nextTileX, y)) {
                    const tileTopY = y * TILE_SIZE;
                    const tileBottomY = (y + 1) * TILE_SIZE;
                    
                    // Check if this tile would actually block the player
                    const horizontalOverlap = playerRightX > tileLeftX && player.x < tileRightX;
                    const verticalOverlap = playerTopY < tileBottomY && playerBottomY > tileTopY;
                    
                    if (horizontalOverlap && verticalOverlap) {
                      blockingTileY = y;
                      break; // Found a blocking tile, stop searching
                    }
                  }
                }
              }
            }
            
            // Also check for tiles just above player's feet (for step-up detection)
            // Note: Y increases downward, so "above" means lower Y values
            // IMPORTANT: Only step up if there's exactly 1 level difference (not 2+)
              // isMultiLevelWall is now declared earlier in the collision detection
            if (blockingTileY === -1 && playerBottom - 1 >= 0) {
              const hasTileAbove = LevelGenerator.isSolid(level, nextTileX, playerBottom - 1);
              const hasTileTwoLevelsAbove = playerBottom - 2 >= 0 ? LevelGenerator.isSolid(level, nextTileX, playerBottom - 2) : false;
              
              if (hasTileAbove) {
                // Check if there's also a tile two levels above - if so, it's a 2+ level wall
                if (hasTileTwoLevelsAbove) {
                  // This is a 2+ level wall - should block, not step up
                  // Find the top of the wall (lowest Y value) to calculate proper elevation change
                  let wallTopY = playerBottom - 1;
                  for (let checkY = playerBottom - 1; checkY >= 0; checkY--) {
                    if (LevelGenerator.isSolid(level, nextTileX, checkY)) {
                      wallTopY = checkY;
                    } else {
                      break;
                    }
                  }
                  blockingTileY = wallTopY; // Use top of wall as blocking tile for proper elevation calculation
                  isMultiLevelWall = true; // Mark as multi-level wall
                } else {
                  // This is a platform 1 level above the player - check for step-up
                  const tileTopY = (playerBottom - 1) * TILE_SIZE;
                  // Check if player is approaching or overlapping the platform
                  // Player's right edge should be at or past the tile's left edge (or very close)
                  const horizontalApproach = playerRightX >= tileLeftX - 2 && player.x < tileRightX;
                  // Allow step-up if player is at or slightly above the platform level (within 1 tile height)
                  // This handles the case where player is on ground and platform is 1 level above
                  const verticalDistance = tileTopY - playerBottomY;
                  if (horizontalApproach && verticalDistance >= -TILE_SIZE && verticalDistance <= TILE_SIZE) {
                    // This is a step-up scenario
                    blockingTileY = playerBottom - 1;
                  }
                }
              }
            }
            
            if (blockingTileY !== -1) {
              const tileTopY = blockingTileY * TILE_SIZE;
              const tileBottomY = (blockingTileY + 1) * TILE_SIZE;
              const elevationChange = currentFloorY - blockingTileY;
              
              // Check if player is actually overlapping with this tile
              const horizontalOverlap = playerRightX > tileLeftX && player.x < tileRightX;
              const verticalOverlap = playerTopY < tileBottomY && playerBottomY > tileTopY;
              
              // For step-up (elevationChange === 1), check if player is approaching or overlapping
              // For walls (elevationChange >= 2), check if approaching (not just overlapping) to prevent pass-through
              const isStepUp = elevationChange === 1;
              const isApproaching = playerRightX >= tileLeftX - 2 && player.x < tileRightX;
              const shouldStepUp = isStepUp && isApproaching;
              // For walls, check if player is approaching horizontally OR overlapping vertically
              // This prevents pass-through when jumping up into walls
              // Also check if blockingTileY is above player (elevationChange >= 1) to catch 2+ level walls
              // Check player's current position AND projected next position to catch fast movement
              // For fast movement, check if player's movement path would intersect the wall
              const playerNextX = player.x + player.vx * (TICK_DURATION / 16); // Project next position
              const playerNextRightX = playerNextX + PLAYER_SIZE;
              // Check if player is currently approaching OR will be approaching in next frame
              // Also check if player's movement path intersects the wall (for fast movement)
              const isCurrentlyApproaching = playerRightX >= tileLeftX - 2 && player.x < tileRightX;
              const willBeApproaching = playerNextRightX >= tileLeftX && playerNextX < tileRightX;
              const movementPathIntersects = player.vx > 0 && player.x < tileRightX && playerNextX >= tileLeftX;
              const isApproachingWall = isCurrentlyApproaching || willBeApproaching || movementPathIntersects;
              const isWallAbovePlayer = blockingTileY < currentFloorY; // Wall is above player's current level
              const shouldBlock = isMultiLevelWall || elevationChange >= 2 || (elevationChange >= 1 && isWallAbovePlayer);
              // For multi-level walls, block immediately when approaching (don't wait for overlap)
              // Also check if player has already passed through the wall (sweep collision)
              // For other walls, require overlap or approach
              const hasPassedThroughWall = isMultiLevelWall && playerRightX > tileLeftX && player.x < tileLeftX;
              const shouldBlockWithOverlap = isMultiLevelWall ? (isApproachingWall || horizontalOverlap || hasPassedThroughWall) :
                                            shouldBlock && (isApproachingWall || (horizontalOverlap && verticalOverlap));
              
              if (shouldStepUp || shouldBlockWithOverlap || (horizontalOverlap && verticalOverlap && elevationChange === 0)) {
                // If player has passed through a multi-level wall, clamp them back immediately
                if (hasPassedThroughWall) {
                  player.x = tileLeftX - PLAYER_SIZE;
                  player.vx = 0;
                  return; // Exit early, collision resolved
                }
                
                if (elevationChange === 1 && !isMultiLevelWall) {
                  // 1 tile step up: Auto-step up (smooth traversal)
                  const platformTopY = blockingTileY;
                  player.y = platformTopY * TILE_SIZE - PLAYER_SIZE;
                  player.vy = 0;
                  player.grounded = true;
                  player.hasFirstJumped = false;
                  player.hasSecondJump = false;
                  player.rotation = 0;
                  // Don't stop horizontal movement - allow smooth traversal
                  this.log(`[${player.id}] AUTO STEP UP RIGHT: Stepped to tile (${nextTileX}, ${platformTopY}) | pos: (${player.x.toFixed(1)}, ${player.y.toFixed(1)})`);
                } else if (isMultiLevelWall || elevationChange >= 2 || (elevationChange >= 1 && blockingTileY < currentFloorY)) {
                  // 2+ tile wall: Stop player (requires jump to traverse)
                  // Block both horizontal and vertical movement through the wall
                  // Check elevationChange >= 2 OR if wall is above player (blockingTileY < currentFloorY)
                  if (player.grounded || player.isDashing) {
                    // On ground or dashing: stop horizontal movement
                    player.x = tileLeftX - PLAYER_SIZE;
                    player.vx = 0;
                    
                    if (player.isDashing) {
                      player.isDashing = false;
                      player.dashRemaining = 0;
                      player.dashCooldown = DASH_COOLDOWN_TICKS;
                      this.log(`[${player.id}] DASH CANCELLED (WALL HIT): Stopped at tile (${nextTileX}, ${blockingTileY}) | pos: (${player.x.toFixed(1)}, ${player.y.toFixed(1)})`);
                    } else {
                      this.log(`[${player.id}] WALL COLLISION RIGHT: Stopped at tile (${nextTileX}, ${blockingTileY}) | elevation change: ${elevationChange} | pos: (${player.x.toFixed(1)}, ${player.y.toFixed(1)})`);
                    }
                    return; // Exit early, collision resolved
                  } else {
                    // In the air: block movement and snap to appropriate position
                    // If player is moving up into the wall, stop vertical movement
                    if (player.vy < 0 && playerTopY < tileBottomY) {
                      // Player is jumping up into wall - stop at wall
                      player.x = tileLeftX - PLAYER_SIZE;
                      player.vx = 0;
                      player.vy = 0;
                      this.log(`[${player.id}] AIR WALL COLLISION RIGHT (UPWARD): Blocked at tile (${nextTileX}, ${blockingTileY}) | pos: (${player.x.toFixed(1)}, ${player.y.toFixed(1)})`);
                      return;
                    }
                    
                    // Otherwise, snap to top of platform
                    let platformTopY = blockingTileY;
                    for (let checkY = blockingTileY; checkY >= 0; checkY--) {
                      if (LevelGenerator.isSolid(level, nextTileX, checkY)) {
                        platformTopY = checkY;
                      } else {
                        break;
                      }
                    }
                    
                    player.y = platformTopY * TILE_SIZE - PLAYER_SIZE;
                    player.vy = 0;
                    player.grounded = true;
                    player.hasFirstJumped = false;
                    player.hasSecondJump = false;
                    player.rotation = 0;
                    player.x = tileLeftX - PLAYER_SIZE;
                    player.vx = 0;
                    
                    this.log(`[${player.id}] AIR COLLISION RIGHT: Snapped to platform top at tile (${nextTileX}, ${platformTopY}) | pos: (${player.x.toFixed(1)}, ${player.y.toFixed(1)})`);
                    return; // Exit early, collision resolved
                  }
                } else {
                  // Same level (elevationChange === 0) or going down: This is a wall blocking movement
                  if (player.grounded || player.isDashing) {
                    // Stop horizontal movement - it's a wall
                    player.x = tileLeftX - PLAYER_SIZE;
                    player.vx = 0;
                    
                    if (player.isDashing) {
                      player.isDashing = false;
                      player.dashRemaining = 0;
                      player.dashCooldown = DASH_COOLDOWN_TICKS;
                      this.log(`[${player.id}] DASH CANCELLED (SIDE WALL): Stopped at tile (${nextTileX}, ${blockingTileY}) | elevation: ${elevationChange} | pos: (${player.x.toFixed(1)}, ${player.y.toFixed(1)})`);
                    } else {
                      this.log(`[${player.id}] SIDE WALL COLLISION RIGHT: Stopped at tile (${nextTileX}, ${blockingTileY}) | elevation: ${elevationChange} | pos: (${player.x.toFixed(1)}, ${player.y.toFixed(1)})`);
                    }
                    return; // Exit early, collision resolved
                  } else {
                    // In the air: snap to top of platform
                    let platformTopY = blockingTileY;
                    for (let checkY = blockingTileY; checkY >= 0; checkY--) {
                      if (LevelGenerator.isSolid(level, nextTileX, checkY)) {
                        platformTopY = checkY;
                      } else {
                        break;
                      }
                    }
                    
                    player.y = platformTopY * TILE_SIZE - PLAYER_SIZE;
                    player.vy = 0;
                    player.grounded = true;
                    player.hasFirstJumped = false;
                    player.hasSecondJump = false;
                    player.rotation = 0;
                    player.x = tileLeftX - PLAYER_SIZE;
                    player.vx = 0;
                    
                    this.log(`[${player.id}] AIR SIDE COLLISION RIGHT: Snapped to platform top at tile (${nextTileX}, ${platformTopY}) | pos: (${player.x.toFixed(1)}, ${player.y.toFixed(1)})`);
                    return; // Exit early, collision resolved
                  }
                }
              }
            }
          }
        }
      } else if (player.vx < -0.1) {
        // Player is moving left - check left wall
        if (level.id === 'testground' && playerLeft - 1 < 0) {
          // Special case: testground wrap-around
          player.x = (level.width - 3) * TILE_SIZE;
        } else {
          // Check the next tile to the left (playerLeft - 1)
          const nextTileX = playerLeft - 1;
          if (nextTileX >= 0 && nextTileX < level.width) {
            // Check for solid tiles that would block the player's movement
            // We need to check tiles at the player's vertical level (or above)
            const tileLeftX = nextTileX * TILE_SIZE;
            const tileRightX = (nextTileX + 1) * TILE_SIZE;
            const playerLeftX = player.x;
            const playerTopY = player.y;
            const playerBottomY = player.y + PLAYER_SIZE;
            const currentFloorY = playerBottom; // Current floor tile Y coordinate
            
            // Check tiles from player's top to bottom (these would block movement)
            let blockingTileY = -1;
            let isMultiLevelWallLeft = false; // Declare early for early wall detection
            // First, check for 2+ level walls above player (these should always block)
            // Check if there are tiles at both playerBottom-1 and playerBottom-2 in next column
            if (playerBottom - 1 >= 0 && playerBottom - 2 >= 0) {
              if (LevelGenerator.isSolid(level, nextTileX, playerBottom - 1) &&
                  LevelGenerator.isSolid(level, nextTileX, playerBottom - 2)) {
                // This is a 2+ level wall - use sweep collision detection
                const tileRightX = (nextTileX + 1) * TILE_SIZE;
                // Check if player's movement path (from previous position to current position) intersects the wall
                const previousX = player.x - player.vx * (TICK_DURATION / 16); // Estimate previous position
                const previousLeftX = previousX;
                // Check if movement path crosses the wall boundary
                const pathCrossesWall = previousLeftX > tileRightX && playerLeftX <= tileRightX;
                // Also check if player is currently overlapping or very close
                const isCurrentlyOverlapping = playerLeftX <= tileRightX + 2 && (player.x + PLAYER_SIZE) > nextTileX * TILE_SIZE;
                
                if (pathCrossesWall || isCurrentlyOverlapping) {
                  // Find top of wall
                  let wallTopY = playerBottom - 1;
                  for (let checkY = playerBottom - 1; checkY >= 0; checkY--) {
                    if (LevelGenerator.isSolid(level, nextTileX, checkY)) {
                      wallTopY = checkY;
                    } else {
                      break;
                    }
                  }
                  blockingTileY = wallTopY;
                  isMultiLevelWallLeft = true;
                  // If path crosses wall, clamp position to wall boundary
                  if (pathCrossesWall && playerLeftX < tileRightX) {
                    player.x = tileRightX;
                    player.vx = 0;
                  }
                }
              }
            }
            
            // If no 2+ level wall found, check tiles from player's top to bottom (these would block movement)
            if (blockingTileY === -1) {
              for (let y = playerTop; y <= playerBottom; y++) {
                if (y >= 0 && y < level.height) {
                  if (LevelGenerator.isSolid(level, nextTileX, y)) {
                    const tileTopY = y * TILE_SIZE;
                    const tileBottomY = (y + 1) * TILE_SIZE;
                    
                    // Check if this tile would actually block the player
                    const horizontalOverlap = playerLeftX < tileRightX && (player.x + PLAYER_SIZE) > tileLeftX;
                    const verticalOverlap = playerTopY < tileBottomY && playerBottomY > tileTopY;
                    
                    if (horizontalOverlap && verticalOverlap) {
                      blockingTileY = y;
                      break; // Found a blocking tile, stop searching
                    }
                  }
                }
              }
            }
            
            // Also check for tiles just above player's feet (for step-up detection)
            // Note: Y increases downward, so "above" means lower Y values
            // IMPORTANT: Only step up if there's exactly 1 level difference (not 2+)
            if (blockingTileY === -1 && playerBottom - 1 >= 0) {
              const hasTileAbove = LevelGenerator.isSolid(level, nextTileX, playerBottom - 1);
              const hasTileTwoLevelsAbove = playerBottom - 2 >= 0 ? LevelGenerator.isSolid(level, nextTileX, playerBottom - 2) : false;
              
              if (hasTileAbove) {
                // Check if there's also a tile two levels above - if so, it's a 2+ level wall
                if (hasTileTwoLevelsAbove) {
                  // This is a 2+ level wall - should block, not step up
                  // Find the top of the wall (lowest Y value) to calculate proper elevation change
                  let wallTopY = playerBottom - 1;
                  for (let checkY = playerBottom - 1; checkY >= 0; checkY--) {
                    if (LevelGenerator.isSolid(level, nextTileX, checkY)) {
                      wallTopY = checkY;
                    } else {
                      break;
                    }
                  }
                  blockingTileY = wallTopY; // Use top of wall as blocking tile for proper elevation calculation
                } else {
                  // This is a platform 1 level above the player - check for step-up
                  const tileTopY = (playerBottom - 1) * TILE_SIZE;
                  // Check if player is approaching or overlapping the platform
                  // Player's left edge should be at or past the tile's right edge (or very close)
                  const horizontalApproach = playerLeftX <= tileRightX + 2 && (player.x + PLAYER_SIZE) > tileLeftX;
                  // Allow step-up if player is at or slightly above the platform level (within 1 tile height)
                  // This handles the case where player is on ground and platform is 1 level above
                  const verticalDistance = tileTopY - playerBottomY;
                  if (horizontalApproach && verticalDistance >= -TILE_SIZE && verticalDistance <= TILE_SIZE) {
                    // This is a step-up scenario
                    blockingTileY = playerBottom - 1;
                  }
                }
              }
            }
            
            if (blockingTileY !== -1) {
              const tileTopY = blockingTileY * TILE_SIZE;
              const tileBottomY = (blockingTileY + 1) * TILE_SIZE;
              const elevationChange = currentFloorY - blockingTileY;
              
              // Check if player is actually overlapping with this tile
              const horizontalOverlap = playerLeftX < tileRightX && (player.x + PLAYER_SIZE) > tileLeftX;
              const verticalOverlap = playerTopY < tileBottomY && playerBottomY > tileTopY;
              
              // For step-up (elevationChange === 1), check if player is approaching or overlapping
              // For walls (elevationChange >= 2), check if approaching (not just overlapping) to prevent pass-through
              const isStepUp = elevationChange === 1 && !isMultiLevelWallLeft; // Don't step up if it's a multi-level wall
              const isApproaching = playerLeftX <= tileRightX + 2 && (player.x + PLAYER_SIZE) > tileLeftX;
              const shouldStepUp = isStepUp && isApproaching;
              // For walls, check if player is approaching horizontally OR overlapping vertically
              // This prevents pass-through when jumping up into walls
              // Also check if blockingTileY is above player (elevationChange >= 1) to catch 2+ level walls
              // Check player's current position AND projected next position to catch fast movement
              // For fast movement, check if player's movement path would intersect the wall
              const playerNextX = player.x + player.vx * (TICK_DURATION / 16); // Project next position
              const playerNextLeftX = playerNextX;
              // Check if player is currently approaching OR will be approaching in next frame
              // Also check if player's movement path intersects the wall (for fast movement)
              const isCurrentlyApproaching = playerLeftX <= tileRightX + 2 && (player.x + PLAYER_SIZE) > tileLeftX;
              const willBeApproaching = playerNextLeftX <= tileRightX && playerNextX + PLAYER_SIZE > tileLeftX;
              const movementPathIntersects = player.vx < 0 && (player.x + PLAYER_SIZE) > tileLeftX && playerNextX <= tileRightX;
              const isApproachingWall = isCurrentlyApproaching || willBeApproaching || movementPathIntersects;
              const isWallAbovePlayer = blockingTileY < currentFloorY; // Wall is above player's current level
              const shouldBlock = isMultiLevelWallLeft || elevationChange >= 2 || (elevationChange >= 1 && isWallAbovePlayer);
              // For multi-level walls, block immediately when approaching (don't wait for overlap)
              // Also check if player has already passed through the wall (sweep collision)
              // For other walls, require overlap or approach
              const hasPassedThroughWall = isMultiLevelWallLeft && playerLeftX < tileRightX && (player.x + PLAYER_SIZE) > tileRightX;
              const shouldBlockWithOverlap = isMultiLevelWallLeft ? (isApproachingWall || horizontalOverlap || hasPassedThroughWall) :
                                            shouldBlock && (isApproachingWall || (horizontalOverlap && verticalOverlap));
              
              if (shouldStepUp || shouldBlockWithOverlap || (horizontalOverlap && verticalOverlap && elevationChange === 0)) {
                // If player has passed through a multi-level wall, clamp them back immediately
                if (hasPassedThroughWall) {
                  player.x = tileRightX;
                  player.vx = 0;
                  return; // Exit early, collision resolved
                }
                
                if (elevationChange === 1 && !isMultiLevelWallLeft) {
                  // 1 tile step up: Auto-step up (smooth traversal)
                  const platformTopY = blockingTileY;
                  player.y = platformTopY * TILE_SIZE - PLAYER_SIZE;
                  player.vy = 0;
                  player.grounded = true;
                  player.hasFirstJumped = false;
                  player.hasSecondJump = false;
                  player.rotation = 0;
                  // Don't stop horizontal movement - allow smooth traversal
                  this.log(`[${player.id}] AUTO STEP UP LEFT: Stepped to tile (${nextTileX}, ${platformTopY}) | pos: (${player.x.toFixed(1)}, ${player.y.toFixed(1)})`);
                } else if (isMultiLevelWallLeft || elevationChange >= 2 || (elevationChange >= 1 && blockingTileY < currentFloorY)) {
                  // 2+ tile wall: Stop player (requires jump to traverse)
                  // Block both horizontal and vertical movement through the wall
                  // Check elevationChange >= 2 OR if wall is above player (blockingTileY < currentFloorY)
                  if (player.grounded || player.isDashing) {
                    // On ground or dashing: stop horizontal movement
                    player.x = tileRightX;
                    player.vx = 0;
                    
                    if (player.isDashing) {
                      player.isDashing = false;
                      player.dashRemaining = 0;
                      player.dashCooldown = DASH_COOLDOWN_TICKS;
                      this.log(`[${player.id}] DASH CANCELLED (WALL HIT): Stopped at tile (${nextTileX}, ${blockingTileY}) | pos: (${player.x.toFixed(1)}, ${player.y.toFixed(1)})`);
                    } else {
                      this.log(`[${player.id}] WALL COLLISION LEFT: Stopped at tile (${nextTileX}, ${blockingTileY}) | elevation change: ${elevationChange} | pos: (${player.x.toFixed(1)}, ${player.y.toFixed(1)})`);
                    }
                    return; // Exit early, collision resolved
                  } else {
                    // In the air: block movement and snap to appropriate position
                    // If player is moving up into the wall, stop vertical movement
                    if (player.vy < 0 && playerTopY < tileBottomY) {
                      // Player is jumping up into wall - stop at wall
                      player.x = tileRightX;
                      player.vx = 0;
                      player.vy = 0;
                      this.log(`[${player.id}] AIR WALL COLLISION LEFT (UPWARD): Blocked at tile (${nextTileX}, ${blockingTileY}) | pos: (${player.x.toFixed(1)}, ${player.y.toFixed(1)})`);
                      return;
                    }
                    
                    // Otherwise, snap to top of platform
                    let platformTopY = blockingTileY;
                    for (let checkY = blockingTileY; checkY >= 0; checkY--) {
                      if (LevelGenerator.isSolid(level, nextTileX, checkY)) {
                        platformTopY = checkY;
                      } else {
                        break;
                      }
                    }
                    
                    player.y = platformTopY * TILE_SIZE - PLAYER_SIZE;
                    player.vy = 0;
                    player.grounded = true;
                    player.hasFirstJumped = false;
                    player.hasSecondJump = false;
                    player.rotation = 0;
                    player.x = tileRightX;
                    player.vx = 0;
                    
                    this.log(`[${player.id}] AIR COLLISION LEFT: Snapped to platform top at tile (${nextTileX}, ${platformTopY}) | pos: (${player.x.toFixed(1)}, ${player.y.toFixed(1)})`);
                    return; // Exit early, collision resolved
                  }
                } else {
                  // Same level (elevationChange === 0) or going down: This is a wall blocking movement
                  if (player.grounded || player.isDashing) {
                    // Stop horizontal movement - it's a wall
                    player.x = tileRightX;
                    player.vx = 0;
                    
                    if (player.isDashing) {
                      player.isDashing = false;
                      player.dashRemaining = 0;
                      player.dashCooldown = DASH_COOLDOWN_TICKS;
                      this.log(`[${player.id}] DASH CANCELLED (SIDE WALL): Stopped at tile (${nextTileX}, ${blockingTileY}) | elevation: ${elevationChange} | pos: (${player.x.toFixed(1)}, ${player.y.toFixed(1)})`);
                    } else {
                      this.log(`[${player.id}] SIDE WALL COLLISION LEFT: Stopped at tile (${nextTileX}, ${blockingTileY}) | elevation: ${elevationChange} | pos: (${player.x.toFixed(1)}, ${player.y.toFixed(1)})`);
                    }
                    return; // Exit early, collision resolved
                  } else {
                    // In the air: snap to top of platform
                    let platformTopY = blockingTileY;
                    for (let checkY = blockingTileY; checkY >= 0; checkY--) {
                      if (LevelGenerator.isSolid(level, nextTileX, checkY)) {
                        platformTopY = checkY;
                      } else {
                        break;
                      }
                    }
                    
                    player.y = platformTopY * TILE_SIZE - PLAYER_SIZE;
                    player.vy = 0;
                    player.grounded = true;
                    player.hasFirstJumped = false;
                    player.hasSecondJump = false;
                    player.rotation = 0;
                    player.x = tileRightX;
                    player.vx = 0;
                    
                    this.log(`[${player.id}] AIR SIDE COLLISION LEFT: Snapped to platform top at tile (${nextTileX}, ${platformTopY}) | pos: (${player.x.toFixed(1)}, ${player.y.toFixed(1)})`);
                    return; // Exit early, collision resolved
                  }
                }
              }
            }
          }
        }
      }
    }

    // ========================================================================
    // HAZARD COLLISION DETECTION
    // ========================================================================
    // Check all tiles player occupies for hazard tiles (instant death)
    for (let x = playerLeft; x <= playerRight; x++) {
      for (let y = playerTop; y <= playerBottom; y++) {
        if (LevelGenerator.isHazard(level, x, y)) {
          // Player touched hazard - respawn at start position
          this.respawnPlayer(player);
          return; // Exit early, no need to check other collisions
        }
      }
    }

    // ========================================================================
    // GROUNDED STATE VALIDATION
    // ========================================================================
    // If player is marked as grounded but no ground was found, unground them immediately
    // This ensures players fall off platforms when walking sideways
    if (player.grounded && !onGround) {
      // Player is marked as grounded but no ground was detected - unground immediately
      player.grounded = false;
      this.log(`[${player.id}] UNGROUNDED: No ground detected | pos: (${player.x.toFixed(1)}, ${player.y.toFixed(1)}) | vy=${player.vy.toFixed(2)}`);
    }
  }

  /**
   * Validates checkpoint progression in lap mode races
   * 
   * In lap mode, players must pass through checkpoints in order to complete laps.
   * This method checks if the player has reached the next required checkpoint
   * and updates their progress. When all checkpoints are passed in order,
   * the lap count is incremented.
   * 
   * Checkpoint system:
   * - Checkpoints must be passed in sequential order
   * - After passing the last checkpoint, the first checkpoint becomes next
   * - Completing all checkpoints in order increments lap count
   * - Uses simple distance-based detection (within 2 tiles)
   * 
   * @param player - The player to check checkpoint progress for
   */
  private checkCheckpoints(player: Player): void {
    // Only check checkpoints in lap mode (sprint mode doesn't use checkpoints)
    if (this.gameState.mode !== 'lap') return;

    const level = this.gameState.level;
    
    // Calculate player center position in tile coordinates
    // Used for distance-based checkpoint detection
    const playerCenterX = Math.floor((player.x + PLAYER_SIZE / 2) / TILE_SIZE);
    const playerCenterY = Math.floor((player.y + PLAYER_SIZE / 2) / TILE_SIZE);

    // Exit if level has no checkpoints defined
    if (!level.checkpoints) return;

    // Calculate which checkpoint the player should reach next
    // Uses modulo to wrap around: after last checkpoint, next is first checkpoint
    const nextCheckpointIdx = (player.lastCheckpoint + 1) % level.checkpoints.length;
    
    // Get the tile index of the next checkpoint
    const checkpointIdx = level.checkpoints[nextCheckpointIdx];
    
    // Get the actual tile object for the checkpoint
    const checkpointTile = level.tiles[checkpointIdx];
    
    if (checkpointTile) {
      // Get checkpoint position in tile coordinates
      const cpX = checkpointTile.x;
      const cpY = checkpointTile.y;

      // Simple distance-based detection: player is within 2 tiles of checkpoint
      // This allows for some tolerance in checkpoint passing
      if (Math.abs(playerCenterX - cpX) < 2 && Math.abs(playerCenterY - cpY) < 2) {
        // Player reached the checkpoint - update progress
        player.lastCheckpoint = nextCheckpointIdx;

        // Check if player completed a full lap
        // This happens when:
        // - lastCheckpoint is 0 (just passed first checkpoint)
        // - nextCheckpointIdx is 0 (next checkpoint is first checkpoint)
        // This means player passed the last checkpoint and looped back to first
        if (player.lastCheckpoint === 0 && nextCheckpointIdx === 0) {
          // Increment lap count (completed all checkpoints in order)
          player.lapCount++;
        }
      }
    }
  }

  /**
   * Checks if player has completed the race and reached the finish line
   * 
   * Finish conditions vary by game mode:
   * - Sprint mode: Player reaches finish tile
   * - Lap mode: Player completes required laps AND reaches finish tile
   * 
   * When finish conditions are met:
   * - Player is marked as finished
   * - Finish time is calculated and stored
   * - Player can no longer move or affect race state
   * 
   * @param player - The player to check finish status for
   */
  private checkFinish(player: Player): void {
    const level = this.gameState.level;
    
    // Calculate player center position in tile coordinates
    // Used to check if player is standing on finish tile
    const playerCenterX = Math.floor((player.x + PLAYER_SIZE / 2) / TILE_SIZE);
    const playerCenterY = Math.floor((player.y + PLAYER_SIZE / 2) / TILE_SIZE);

    if (this.gameState.mode === 'sprint') {
      // ======================================================================
      // SPRINT MODE: Finish when reaching finish line
      // ======================================================================
      // In sprint mode, player wins by reaching the finish tile
      if (LevelGenerator.isFinish(level, playerCenterX, playerCenterY)) {
        // Only process finish once (prevent duplicate finish times)
        if (!player.finished) {
          player.finished = true;
          
          // Calculate finish time: elapsed time since race start
          player.finishTime = Date.now() - this.gameState.startTime;
        }
      }
    } else if (this.gameState.mode === 'lap') {
      // ======================================================================
      // LAP MODE: Finish when completing required laps AND reaching finish
      // ======================================================================
      // In lap mode, player must complete required number of laps
      // AND be standing on the finish tile to win
      const requiredLaps = 2; // Number of laps required to finish
      
      // Check both conditions: lap count AND finish tile
      if (player.lapCount >= requiredLaps && LevelGenerator.isFinish(level, playerCenterX, playerCenterY)) {
        // Only process finish once (prevent duplicate finish times)
        if (!player.finished) {
          player.finished = true;
          
          // Calculate finish time: elapsed time since race start
          player.finishTime = Date.now() - this.gameState.startTime;
        }
      }
    }
  }

  /**
   * Checks if the race should end and updates race status accordingly
   * 
   * Race end conditions:
   * 1. Time limit exceeded (90 seconds) - race ends immediately
   * 2. All players finished (sprint mode only) - race ends when everyone completes
   * 
   * When race ends:
   * - Game state status is set to 'finished'
   * - End time is recorded
   * - No further game updates are processed
   * - Results can be calculated and displayed
   */
  private checkRaceEnd(): void {
    const now = Date.now();
    const raceDuration = 90000; // 90 seconds maximum race duration

    // ========================================================================
    // TIME LIMIT CHECK
    // ========================================================================
    // Race ends immediately if time limit is exceeded
    // This prevents races from running indefinitely
    if (now - this.gameState.startTime > raceDuration) {
      this.gameState.status = 'finished';
      this.gameState.endTime = now;
      return; // Exit early, race is over
    }

    // ========================================================================
    // ALL PLAYERS FINISHED CHECK (Sprint Mode Only)
    // ========================================================================
    // In sprint mode, race can end early if all players finish
    // In lap mode, race continues until time limit (players may not all finish)
    if (this.gameState.mode === 'sprint') {
      // Check if every player has finished the race
      let allFinished = true;
      for (const player of this.gameState.players.values()) {
        if (!player.finished) {
          // Found a player who hasn't finished - race continues
          allFinished = false;
          break;
        }
      }
      
      // If all players finished, end the race immediately
      if (allFinished) {
        this.gameState.status = 'finished';
        this.gameState.endTime = now;
      }
    }
  }

  /**
   * Respawns player at the start position (used when hitting hazards)
   * 
   * When a player touches a hazard tile, they are instantly respawned
   * at the level's start position. All player state is reset:
   * - Position reset to start tile
   * - Velocity reset to zero
   * - Grounded state reset
   * - Dash ability re-enabled
   * - Checkpoint progress reset (lap mode)
   * 
   * This provides a penalty for hitting hazards while allowing players
   * to continue racing.
   * 
   * @param player - The player to respawn
   */
  private respawnPlayer(player: Player): void {
    const level = this.gameState.level;
    
    // Search through all level tiles to find the start tile
    for (const tile of level.tiles) {
      if (tile.type === 'start') {
        // Spawn player ON TOP of the start tile (not inside it)
        // Reset player position to start tile (convert tile coords to pixels)
        player.x = tile.x * TILE_SIZE;
        player.y = tile.y * TILE_SIZE - PLAYER_SIZE; // Position player on top of tile
        
        // Reset all velocity (stop all movement)
        player.vx = 0;
        player.vy = 0;
        
        // Reset grounded state (player will fall if start is in air)
        player.grounded = false;
        
        // Reset jump states
        player.hasFirstJumped = false;
        player.hasSecondJump = false;
        
        // Reset dash ability and cooldown
        player.canDash = true;
        player.hasDashed = false;
        player.dashCooldown = 0;
        
        // Reset checkpoint progress (must pass checkpoints again in lap mode)
        player.lastCheckpoint = -1;
        
        break; // Found start, no need to continue searching
      }
    }
  }

  /**
   * Returns the current game state
   * 
   * This method provides read-only access to the game state for
   * broadcasting to clients. The game state contains:
   * - All player positions, velocities, and states
   * - Level geometry and configuration
   * - Race status and timing information
   * 
   * @returns The current game state object
   */
  getState(): GameState {
    return this.gameState;
  }

  /**
   * Internal logging method for debugging movement issues
   */
  private log(message: string): void {
    const timestamp = Date.now();
    const logEntry = `[${timestamp}] ${message}`;
    this.logBuffer.push(logEntry);
    if (this.logBuffer.length > this.logBufferSize) {
      this.logBuffer.shift(); // Remove oldest entry
    }
    console.log(logEntry);
  }

  /**
   * Get recent log entries for debugging
   */
  getLogs(): string[] {
    return [...this.logBuffer];
  }

  /**
   * Clear log buffer
   */
  clearLogs(): void {
    this.logBuffer = [];
  }
}

