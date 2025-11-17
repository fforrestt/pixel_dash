import { Level, Tile, TileType } from './types.js';

const TILE_SIZE = 16;
const LEVEL_HEIGHT = 20;
const MIN_LEVEL_WIDTH = 80;
const MAX_LEVEL_WIDTH = 120;

export class LevelGenerator {
  private seed: number;

  constructor(seed?: number) {
    this.seed = seed ?? Math.floor(Math.random() * 1000000);
  }

  private random(): number {
    this.seed = (this.seed * 9301 + 49297) % 233280;
    return this.seed / 233280;
  }

  generateSprintLevel(): Level {
    const width = Math.floor(MIN_LEVEL_WIDTH + (MAX_LEVEL_WIDTH - MIN_LEVEL_WIDTH) * this.random());
    const tiles: Tile[] = [];

    // Initialize all tiles as empty
    for (let x = 0; x < width; x++) {
      for (let y = 0; y < LEVEL_HEIGHT; y++) {
        tiles.push({ x, y, type: 'empty' });
      }
    }

    // Ground level (bottom 2 rows)
    const groundY = LEVEL_HEIGHT - 2;
    for (let x = 0; x < width; x++) {
      tiles[x * LEVEL_HEIGHT + groundY].type = 'solid';
      tiles[x * LEVEL_HEIGHT + groundY + 1].type = 'solid';
    }

    // Start area (left side, 5 tiles wide)
    const startX = 2;
    for (let x = startX; x < startX + 5; x++) {
      for (let y = groundY - 1; y < LEVEL_HEIGHT; y++) {
        const idx = x * LEVEL_HEIGHT + y;
        if (idx >= 0 && idx < tiles.length) {
          tiles[idx].type = 'solid';
        }
      }
    }
    tiles[startX * LEVEL_HEIGHT + groundY - 2].type = 'start';

    // Finish area (right side, 5 tiles wide)
    const finishX = width - 7;
    for (let x = finishX; x < finishX + 5; x++) {
      for (let y = groundY - 1; y < LEVEL_HEIGHT; y++) {
        const idx = x * LEVEL_HEIGHT + y;
        if (idx >= 0 && idx < tiles.length) {
          tiles[idx].type = 'solid';
        }
      }
    }
    tiles[finishX * LEVEL_HEIGHT + groundY - 2].type = 'finish';

    // Generate platforms and obstacles
    let currentPlatformX = 10;
    let currentPlatformY = groundY - 3;

    while (currentPlatformX < width - 10) {
      // Platform width (3-6 tiles)
      const platformWidth = Math.floor(3 + this.random() * 4);
      const platformHeight = Math.floor(1 + this.random() * 2);

      // Platform Y position (vary between groundY - 6 and groundY - 2)
      currentPlatformY = Math.floor(groundY - 6 + this.random() * 4);
      currentPlatformY = Math.max(2, Math.min(LEVEL_HEIGHT - 3, currentPlatformY));

      // Create platform
      for (let px = 0; px < platformWidth; px++) {
        const x = currentPlatformX + px;
        if (x >= width - 5) break;

        for (let py = 0; py < platformHeight; py++) {
          const y = currentPlatformY + py;
          if (y >= 0 && y < LEVEL_HEIGHT) {
            const idx = x * LEVEL_HEIGHT + y;
            if (idx >= 0 && idx < tiles.length && tiles[idx].type === 'empty') {
              tiles[idx].type = 'solid';
            }
          }
        }
      }

      // Gap between platforms (2-5 tiles)
      const gap = Math.floor(2 + this.random() * 4);
      currentPlatformX += platformWidth + gap;
    }

    // Ensure there's always a path (add connecting platforms if needed)
    this.ensurePath(tiles, width, startX, finishX, groundY);

    return {
      id: `sprint_${this.seed}`,
      width,
      height: LEVEL_HEIGHT,
      tiles,
      type: 'sprint'
    };
  }

  generateLapLevel(): Level {
    const width = Math.floor(60 + this.random() * 40); // Shorter for laps
    const tiles: Tile[] = [];

    // Initialize all tiles as empty
    for (let x = 0; x < width; x++) {
      for (let y = 0; y < LEVEL_HEIGHT; y++) {
        tiles.push({ x, y, type: 'empty' });
      }
    }

    const groundY = LEVEL_HEIGHT - 2;

    // Create a looping ground with platforms
    for (let x = 0; x < width; x++) {
      tiles[x * LEVEL_HEIGHT + groundY].type = 'solid';
      tiles[x * LEVEL_HEIGHT + groundY + 1].type = 'solid';
    }

    // Start/finish line (same location for looping)
    const startX = 5;
    for (let x = startX; x < startX + 3; x++) {
      for (let y = groundY - 1; y < LEVEL_HEIGHT; y++) {
        tiles[x * LEVEL_HEIGHT + y].type = 'solid';
      }
    }
    tiles[startX * LEVEL_HEIGHT + groundY - 2].type = 'start';
    tiles[(startX + 1) * LEVEL_HEIGHT + groundY - 2].type = 'finish';

    // Add checkpoints along the loop
    const checkpoints: number[] = [];
    const checkpointCount = 3;
    for (let i = 0; i < checkpointCount; i++) {
      const cpX = Math.floor((width / (checkpointCount + 1)) * (i + 1));
      const cpY = groundY - 2;
      const idx = cpX * LEVEL_HEIGHT + cpY;
      if (idx >= 0 && idx < tiles.length) {
        tiles[idx].type = 'checkpoint';
        checkpoints.push(idx);
      }
    }

    // Add some platforms for variety
    for (let i = 0; i < 8; i++) {
      const px = Math.floor(this.random() * (width - 10)) + 5;
      const py = Math.floor(groundY - 6 + this.random() * 3);
      const pw = Math.floor(2 + this.random() * 3);
      
      for (let x = 0; x < pw; x++) {
        if (px + x < width - 2) {
          const idx = (px + x) * LEVEL_HEIGHT + py;
          if (idx >= 0 && idx < tiles.length && tiles[idx].type === 'empty') {
            tiles[idx].type = 'solid';
          }
        }
      }
    }

    return {
      id: `lap_${this.seed}`,
      width,
      height: LEVEL_HEIGHT,
      tiles,
      type: 'lap',
      checkpoints: checkpoints
    };
  }

  private ensurePath(tiles: Tile[], width: number, startX: number, finishX: number, groundY: number): void {
    // Simple pathfinding: ensure there's a roughly connected path
    // This is a simplified version - in production you'd want more sophisticated pathfinding
    const pathPoints: number[] = [];
    pathPoints.push(startX);

    let currentX = startX + 5;
    while (currentX < finishX - 5) {
      // Find or create a platform near this X
      let foundPlatform = false;
      for (let y = groundY - 6; y <= groundY - 2; y++) {
        const idx = currentX * LEVEL_HEIGHT + y;
        if (idx < tiles.length && tiles[idx].type === 'solid') {
          foundPlatform = true;
          break;
        }
      }

      if (!foundPlatform) {
        // Create a small platform
        const py = groundY - 4;
        for (let px = -1; px <= 1; px++) {
          const x = currentX + px;
          if (x >= 0 && x < width) {
            const idx = x * LEVEL_HEIGHT + py;
            if (idx >= 0 && idx < tiles.length) {
              tiles[idx].type = 'solid';
            }
          }
        }
      }

      currentX += Math.floor(8 + this.random() * 12);
    }

    pathPoints.push(finishX);
  }

  static getTileAt(level: Level, x: number, y: number): Tile | null {
    if (x < 0 || x >= level.width || y < 0 || y >= level.height) {
      return null;
    }
    const idx = x * level.height + y;
    return level.tiles[idx] || null;
  }

  static isSolid(level: Level, x: number, y: number): boolean {
    const tile = LevelGenerator.getTileAt(level, x, y);
    return tile?.type === 'solid' || tile?.type === 'start' || tile?.type === 'finish';
  }

  static isHazard(level: Level, x: number, y: number): boolean {
    const tile = LevelGenerator.getTileAt(level, x, y);
    return tile?.type === 'hazard';
  }

  static isCheckpoint(level: Level, x: number, y: number): boolean {
    const tile = LevelGenerator.getTileAt(level, x, y);
    return tile?.type === 'checkpoint';
  }

  static isFinish(level: Level, x: number, y: number): boolean {
    const tile = LevelGenerator.getTileAt(level, x, y);
    return tile?.type === 'finish';
  }
}

