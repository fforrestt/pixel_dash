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

  generateTestLevel(): Level {
    // Comprehensive test level for collision philosophy testing:
    // - 1 tile elevation changes: Auto-step up (smooth traversal)
    // - 2+ tile elevation changes: Require jump (wall collision)
    const width = 400; // Wider for more testing scenarios
    const height = 50; // Taller for more vertical space
    const tiles: Tile[] = [];

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
}

