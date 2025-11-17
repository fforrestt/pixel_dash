import { GameState, Player, PlayerInput, Level } from './types.js';
import { LevelGenerator } from './levelGenerator.js';

const TICK_RATE = 20; // 20 ticks per second
const TICK_DURATION = 1000 / TICK_RATE;

// Physics constants
const GRAVITY = 0.5;
const JUMP_STRENGTH = -8;
const DASH_STRENGTH = 12;
const MOVE_SPEED = 3;
const FRICTION = 0.8;
const AIR_FRICTION = 0.95;
const PLAYER_SIZE = 16;
const TILE_SIZE = 16;

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
    // Apply gravity
    if (!player.grounded) {
      player.vy += GRAVITY;
    }

    // Apply friction
    if (player.grounded) {
      player.vx *= FRICTION;
    } else {
      player.vx *= AIR_FRICTION;
    }

    // Update position
    player.x += player.vx;
    player.y += player.vy;

    // Update distance for ranking
    player.distance = player.x;

    // Clamp velocity
    player.vx = Math.max(-10, Math.min(10, player.vx));
    player.vy = Math.max(-15, Math.min(15, player.vy));
  }

  processInput(playerId: string, input: PlayerInput): void {
    const player = this.gameState.players.get(playerId);
    if (!player || this.gameState.status !== 'racing' || player.finished) {
      return;
    }

    // Validate input rate (prevent spam)
    const now = Date.now();
    if (input.timestamp < now - 200) {
      return; // Ignore old inputs
    }

    // Horizontal movement
    if (input.left && !input.right) {
      player.vx = -MOVE_SPEED;
    } else if (input.right && !input.left) {
      player.vx = MOVE_SPEED;
    }

    // Jump logic
    if (input.jump) {
      if (player.grounded && !player.hasDashed) {
        // First jump (ground jump)
        player.vy = JUMP_STRENGTH;
        player.grounded = false;
        player.canDash = true;
        player.hasDashed = false;
      } else if (!player.grounded && player.canDash && !player.hasDashed) {
        // Dash (mid-air)
        const dashDirection = player.vx > 0 ? 1 : player.vx < 0 ? -1 : 1;
        player.vx += dashDirection * DASH_STRENGTH;
        player.vy *= 0.3; // Slight vertical component
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

    // Check ground collision
    let onGround = false;
    for (let x = playerLeft; x <= playerRight; x++) {
      const tileBelow = LevelGenerator.getTileAt(level, x, playerBottom + 1);
      if (tileBelow && LevelGenerator.isSolid(level, x, playerBottom + 1)) {
        // Landing on top of a platform
        if (player.vy > 0) {
          player.y = (playerBottom) * TILE_SIZE;
          player.vy = 0;
          player.grounded = true;
          player.canDash = true;
          player.hasDashed = false;
          onGround = true;
          break;
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

    // Check side collisions
    if (player.vx > 0) {
      // Moving right
      for (let y = playerTop; y <= playerBottom; y++) {
        if (LevelGenerator.isSolid(level, playerRight + 1, y)) {
          player.x = (playerRight) * TILE_SIZE;
          player.vx = 0;
          break;
        }
      }
    } else if (player.vx < 0) {
      // Moving left
      for (let y = playerTop; y <= playerBottom; y++) {
        if (LevelGenerator.isSolid(level, playerLeft - 1, y)) {
          player.x = (playerLeft) * TILE_SIZE;
          player.vx = 0;
          break;
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
    if (!onGround && player.grounded) {
      // Small grace period before considering airborne
      if (player.vy > 0.5) {
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

