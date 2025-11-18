import { GameState, Player, PlayerInput, Level } from './types.js';
import { LevelGenerator } from './levelGenerator.js';

const TICK_RATE = 20; // 20 ticks per second
const TICK_DURATION = 1000 / TICK_RATE;

// Physics constants
const GRAVITY = 0.5;
const JUMP_STRENGTH = -10;          // negative for upward jump
const DASH_STRENGTH = 7;            // stronger dash
const GROUND_MOVE_SPEED = 4;        // pixels per tick on ground
const GROUND_ACCEL = 1.0;
const AIR_ACCEL = 0.4;
const GROUND_FRICTION = 0.92;
const ROTATION_SPEED = 5;
const PLAYER_SIZE = 16;
const TILE_SIZE = 16;

const MAX_HORIZONTAL_SPEED = Math.max(GROUND_MOVE_SPEED, DASH_STRENGTH);

export class GameLoop {
  private gameState: GameState;
  private lastTick: number = 0;

  constructor(gameState: GameState) {
    this.gameState = gameState;
  }

  update(deltaTime: number): void {
    if (this.gameState.status !== 'racing') {
      return;
    }

    const now = Date.now();
    if (now - this.lastTick < TICK_DURATION) {
      return;
    }
    this.lastTick = now;

    // Update each player
    for (const player of this.gameState.players.values()) {
      if (player.finished) continue;

      this.updatePlayer(player, deltaTime);
      this.checkCollisions(player);
      this.checkCheckpoints(player);
      this.checkFinish(player);
    }

    // Check if race should end
    this.checkRaceEnd();
  }

  private updatePlayer(player: Player, deltaTime: number): void {
    if (!player.grounded) {
      player.vy += GRAVITY;
  
      player.rotation += ROTATION_SPEED * (player.vx > 0 ? 1 : -1);
      player.rotation = player.rotation % 360;
    } else {
      player.rotation = 0;
  
      // Apply ground friction
      player.vx *= GROUND_FRICTION;
      if (Math.abs(player.vx) < 0.05) {
        player.vx = 0;
      }
    }
  
    // Update position
    player.x += player.vx;
    player.y += player.vy;
  
    player.distance = player.x;
  
    // Clamp velocity using our constants
    player.vx = Math.max(-MAX_HORIZONTAL_SPEED, Math.min(MAX_HORIZONTAL_SPEED, player.vx));
    player.vy = Math.max(-15, Math.min(15, player.vy));
  }

  processInput(playerId: string, input: PlayerInput): void {
    const player = this.gameState.players.get(playerId);
    if (!player || this.gameState.status !== 'racing' || player.finished) return;
  
    const now = Date.now();
    if (input.timestamp < now - 200) return;
  
    // Horizontal movement: acceleration-based
    if (player.grounded) {
      if (input.left && !input.right) {
        player.vx -= GROUND_ACCEL;
      } else if (input.right && !input.left) {
        player.vx += GROUND_ACCEL;
      }
    } else {
      if (input.left && !input.right) {
        player.vx -= AIR_ACCEL;
      } else if (input.right && !input.left) {
        player.vx += AIR_ACCEL;
      }
    }
  
    // Jump / dash
    if (input.jump) {
      if (player.grounded) {
        player.vy = JUMP_STRENGTH;
        player.grounded = false;
        player.canDash = true;
        player.hasDashed = false;
      } else if (player.canDash && !player.hasDashed) {
        const dashDirection =
          player.vx > 0 ? 1 :
          player.vx < 0 ? -1 :
          (input.right ? 1 : input.left ? -1 : 1);
  
        player.vx += dashDirection * DASH_STRENGTH;
        player.hasDashed = true;
        player.canDash = false;
      }
    }
  }
  

  private checkCollisions(player: Player): void {
    const level = this.gameState.level;
    const playerLeft = Math.floor(player.x / TILE_SIZE);
    const playerRight = Math.floor((player.x + PLAYER_SIZE) / TILE_SIZE);
    const playerTop = Math.floor(player.y / TILE_SIZE);
    const playerBottom = Math.floor((player.y + PLAYER_SIZE) / TILE_SIZE);

    // Check ground collision - improved to prevent falling through
    let onGround = false;
    for (let x = playerLeft; x <= playerRight; x++) {
      if (LevelGenerator.isSolid(level, x, playerBottom + 1)) {
        // Check if player is moving downward or stationary
        if (player.vy >= -0.5) { // Allow slight upward velocity tolerance
          // Snap to top of tile
          const targetY = (playerBottom + 1) * TILE_SIZE - PLAYER_SIZE;
          
          // Only snap if reasonably close (within 4 pixels)
          if (Math.abs(player.y - targetY) <= 4) {
            player.y = targetY;
            player.vy = 0;
            player.grounded = true;
            player.rotation = 0; // Reset rotation immediately on landing
            player.canDash = true;
            player.hasDashed = false;
            onGround = true;
            break;
          }
        }
      }
    }

    // Check ceiling collision
    for (let x = playerLeft; x <= playerRight; x++) {
      if (LevelGenerator.isSolid(level, x, playerTop - 1)) {
        player.y = (playerTop) * TILE_SIZE;
        player.vy = 0;
        break;
      }
    }

    // Check side collisions - with wrap-around for testground closed loop
    if (player.vx > 0) {
      // Moving right
      if (level.id === 'testground' && playerRight + 1 >= level.width) {
        // Wrap to left side for testground
        player.x = 2 * TILE_SIZE;
      } else {
        for (let y = playerTop; y <= playerBottom; y++) {
          if (LevelGenerator.isSolid(level, playerRight + 1, y)) {
            player.x = (playerRight) * TILE_SIZE;
            player.vx = 0;
            break;
          }
        }
      }
    } else if (player.vx < 0) {
      // Moving left
      if (level.id === 'testground' && playerLeft - 1 < 0) {
        // Wrap to right side for testground
        player.x = (level.width - 3) * TILE_SIZE;
      } else {
        for (let y = playerTop; y <= playerBottom; y++) {
          if (LevelGenerator.isSolid(level, playerLeft - 1, y)) {
            player.x = (playerLeft) * TILE_SIZE;
            player.vx = 0;
            break;
          }
        }
      }
    }

    // Check hazards
    for (let x = playerLeft; x <= playerRight; x++) {
      for (let y = playerTop; y <= playerBottom; y++) {
        if (LevelGenerator.isHazard(level, x, y)) {
          // Respawn at start
          this.respawnPlayer(player);
          return;
        }
      }
    }

    // Update grounded status if not on ground
    if (!onGround) {
      // Only unset grounded if clearly falling (not just a small gap)
      if (player.vy > 1.0 || player.y > (playerBottom + 2) * TILE_SIZE) {
        player.grounded = false;
      }
    }
  }

  private checkCheckpoints(player: Player): void {
    if (this.gameState.mode !== 'lap') return;

    const level = this.gameState.level;
    const playerCenterX = Math.floor((player.x + PLAYER_SIZE / 2) / TILE_SIZE);
    const playerCenterY = Math.floor((player.y + PLAYER_SIZE / 2) / TILE_SIZE);

    if (!level.checkpoints) return;

    // Check if player passed the next checkpoint
    const nextCheckpointIdx = (player.lastCheckpoint + 1) % level.checkpoints.length;
    const checkpointIdx = level.checkpoints[nextCheckpointIdx];
    const checkpointTile = level.tiles[checkpointIdx];
    
    if (checkpointTile) {
      const cpX = checkpointTile.x;
      const cpY = checkpointTile.y;

      // Simple distance check
      if (Math.abs(playerCenterX - cpX) < 2 && Math.abs(playerCenterY - cpY) < 2) {
        player.lastCheckpoint = nextCheckpointIdx;

        // If we completed all checkpoints, increment lap
        if (player.lastCheckpoint === 0 && nextCheckpointIdx === 0) {
          player.lapCount++;
        }
      }
    }
  }

  private checkFinish(player: Player): void {
    const level = this.gameState.level;
    const playerCenterX = Math.floor((player.x + PLAYER_SIZE / 2) / TILE_SIZE);
    const playerCenterY = Math.floor((player.y + PLAYER_SIZE / 2) / TILE_SIZE);

    if (this.gameState.mode === 'sprint') {
      // Check if reached finish line
      if (LevelGenerator.isFinish(level, playerCenterX, playerCenterY)) {
        if (!player.finished) {
          player.finished = true;
          player.finishTime = Date.now() - this.gameState.startTime;
        }
      }
    } else if (this.gameState.mode === 'lap') {
      // Check if completed required laps
      const requiredLaps = 2;
      if (player.lapCount >= requiredLaps && LevelGenerator.isFinish(level, playerCenterX, playerCenterY)) {
        if (!player.finished) {
          player.finished = true;
          player.finishTime = Date.now() - this.gameState.startTime;
        }
      }
    }
  }

  private checkRaceEnd(): void {
    const now = Date.now();
    const raceDuration = 90000; // 90 seconds max

    if (now - this.gameState.startTime > raceDuration) {
      this.gameState.status = 'finished';
      this.gameState.endTime = now;
      return;
    }

    // Check if all players finished (sprint mode)
    if (this.gameState.mode === 'sprint') {
      let allFinished = true;
      for (const player of this.gameState.players.values()) {
        if (!player.finished) {
          allFinished = false;
          break;
        }
      }
      if (allFinished) {
        this.gameState.status = 'finished';
        this.gameState.endTime = now;
      }
    }
  }

  private respawnPlayer(player: Player): void {
    // Find start position
    const level = this.gameState.level;
    for (const tile of level.tiles) {
      if (tile.type === 'start') {
        player.x = tile.x * TILE_SIZE;
        player.y = tile.y * TILE_SIZE;
        player.vx = 0;
        player.vy = 0;
        player.grounded = false;
        player.canDash = true;
        player.hasDashed = false;
        player.lastCheckpoint = -1;
        break;
      }
    }
  }

  getState(): GameState {
    return this.gameState;
  }
}

