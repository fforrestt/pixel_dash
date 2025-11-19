import { GameState, Player, Level, Tile } from './types.js';

const TILE_SIZE = 16;
const PLAYER_SIZE = 16;
const CAMERA_OFFSET_X = 200; // Camera follows player with offset

export class Renderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private cameraX = 0;
  private cameraY = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Could not get 2D context');
    }
    this.ctx = ctx;

    // Pixel-perfect rendering
    this.ctx.imageSmoothingEnabled = false;
  }

  resize(width: number, height: number): void {
    this.canvas.width = width;
    this.canvas.height = height;
    this.ctx.imageSmoothingEnabled = false;
  }

  clear(): void {
    this.ctx.fillStyle = '#2a2a2a';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

  renderGame(gameState: GameState, localPlayerId: string): void {
    this.clear();

    // Update camera to follow local player
    const localPlayer = gameState.players.find(p => p.id === localPlayerId);
    if (localPlayer) {
      this.cameraX = localPlayer.x - CAMERA_OFFSET_X;
      this.cameraY = 0; // Side-scroller, no vertical camera movement
    }

    // Render level
    this.renderLevel(gameState.level);

    // Render players
    for (const player of gameState.players) {
      this.renderPlayer(player, player.id === localPlayerId);
    }

    // Render HUD
    this.renderHUD(gameState, localPlayerId);
  }

  private renderLevel(level: Level): void {
    const tileColors: Record<string, string> = {
      'empty': 'transparent',
      'solid': '#666',
      'hazard': '#ff0000',
      'start': '#00ff00',
      'finish': '#0000ff',
      'checkpoint': '#ffff00'
    };

    // Calculate visible tile range
    const startX = Math.max(0, Math.floor(this.cameraX / TILE_SIZE) - 2);
    const endX = Math.min(level.width, Math.floor((this.cameraX + this.canvas.width) / TILE_SIZE) + 2);
    const startY = 0;
    const endY = level.height;

    for (let x = startX; x < endX; x++) {
      for (let y = startY; y < endY; y++) {
        const tile = level.tiles[x * level.height + y];
        if (tile && tile.type !== 'empty') {
          const screenX = x * TILE_SIZE - this.cameraX;
          const screenY = y * TILE_SIZE - this.cameraY;

          if (screenX > -TILE_SIZE && screenX < this.canvas.width + TILE_SIZE &&
              screenY > -TILE_SIZE && screenY < this.canvas.height + TILE_SIZE) {
            this.ctx.fillStyle = tileColors[tile.type] || '#666';
            this.ctx.fillRect(screenX, screenY, TILE_SIZE, TILE_SIZE);

            // Draw border for special tiles
            if (tile.type === 'start' || tile.type === 'finish' || tile.type === 'checkpoint') {
              this.ctx.strokeStyle = '#fff';
              this.ctx.lineWidth = 2;
              this.ctx.strokeRect(screenX, screenY, TILE_SIZE, TILE_SIZE);
            }
          }
        }
      }
    }
  }

  private renderPlayer(player: Player, isLocal: boolean): void {
    const screenX = player.x - this.cameraX;
    const screenY = player.y - this.cameraY;

    // Only render if visible
    if (screenX > -PLAYER_SIZE && screenX < this.canvas.width + PLAYER_SIZE &&
        screenY > -PLAYER_SIZE && screenY < this.canvas.height + PLAYER_SIZE) {
      
      this.ctx.save();
      
      // Apply rotation around player center (visual only, doesn't affect hitbox)
      const centerX = screenX + PLAYER_SIZE / 2;
      const centerY = screenY + PLAYER_SIZE / 2;
      this.ctx.translate(centerX, centerY);
      this.ctx.rotate((player.rotation || 0) * Math.PI / 180);
      this.ctx.translate(-centerX, -centerY);
      
      // Draw player square
      this.ctx.fillStyle = player.color;
      this.ctx.fillRect(screenX, screenY, PLAYER_SIZE, PLAYER_SIZE);

      // Draw border for local player
      if (isLocal) {
        this.ctx.strokeStyle = '#fff';
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(screenX, screenY, PLAYER_SIZE, PLAYER_SIZE);
      }
      
      this.ctx.restore();
    }
  }

  private renderHUD(gameState: GameState, localPlayerId: string): void {
    const localPlayer = gameState.players.find(p => p.id === localPlayerId);
    if (!localPlayer) return;

    // Calculate placement
    const sortedPlayers = [...gameState.players].sort((a, b) => {
      if (a.finished && !b.finished) return -1;
      if (!a.finished && b.finished) return 1;
      if (a.finished && b.finished) {
        return (a.finishTime || 0) - (b.finishTime || 0);
      }
      return b.distance - a.distance;
    });
    const placement = sortedPlayers.findIndex(p => p.id === localPlayerId) + 1;

    // Timer
    const elapsed = gameState.elapsed || (Date.now() - gameState.startTime);
    const seconds = Math.floor(elapsed / 1000);
    const minutes = Math.floor(seconds / 60);
    const displaySeconds = seconds % 60;
    const timeText = `${minutes}:${displaySeconds.toString().padStart(2, '0')}`;

    // HUD background
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    this.ctx.fillRect(10, 10, 200, 100);

    // HUD text
    this.ctx.fillStyle = '#fff';
    this.ctx.font = '16px monospace';
    this.ctx.textAlign = 'left';
    this.ctx.fillText(`Time: ${timeText}`, 20, 35);
    this.ctx.fillText(`Place: ${placement}/${gameState.players.length}`, 20, 55);

    if (gameState.mode === 'lap') {
      this.ctx.fillText(`Laps: ${localPlayer.lapCount}/2`, 20, 75);
    } else {
      const progress = (localPlayer.distance / (gameState.level.width * TILE_SIZE)) * 100;
      this.ctx.fillText(`Progress: ${Math.floor(progress)}%`, 20, 75);
    }

    if (localPlayer.finished) {
      this.ctx.fillStyle = '#0f0';
      this.ctx.font = '24px monospace';
      this.ctx.textAlign = 'center';
      this.ctx.fillText('FINISHED!', this.canvas.width / 2, 50);
    }

    // Countdown
    if (gameState.status === 'countdown' && gameState.countdown) {
      this.ctx.fillStyle = '#fff';
      this.ctx.font = '48px monospace';
      this.ctx.textAlign = 'center';
      this.ctx.fillText(gameState.countdown.toString(), this.canvas.width / 2, this.canvas.height / 2);
    }

    // Dash cooldown indicator (bottom left)
    this.renderDashCooldown(localPlayer);
  }

  private renderDashCooldown(player: Player): void {
    const indicatorSize = 40;
    const padding = 10;
    const x = padding;
    const y = this.canvas.height - indicatorSize - padding;

    // Calculate cooldown progress (1 = fully on cooldown, 0 = ready)
    const cooldownProgress = player.dashCooldown > 0 
      ? player.dashCooldown / 30 // DASH_COOLDOWN_TICKS is 30
      : 0;

    // Draw background box (dark gray)
    this.ctx.fillStyle = '#333';
    this.ctx.fillRect(x, y, indicatorSize, indicatorSize);
    this.ctx.strokeStyle = '#666';
    this.ctx.lineWidth = 2;
    this.ctx.strokeRect(x, y, indicatorSize, indicatorSize);

    // Draw blue fill that restores from left to right as cooldown decreases
    // When cooldownProgress = 1 (just used), no blue (fillWidth = 0)
    // When cooldownProgress = 0 (ready), full blue (fillWidth = indicatorSize)
    const fillWidth = indicatorSize * (1 - cooldownProgress);
    if (fillWidth > 0) {
      this.ctx.fillStyle = '#0066ff'; // Blue color
      this.ctx.fillRect(x, y, fillWidth, indicatorSize);
    }

    // Draw arrow in the middle (always visible)
    const centerX = x + indicatorSize / 2;
    const centerY = y + indicatorSize / 2;
    const arrowSize = 12;
    
    this.ctx.fillStyle = '#fff';
    this.ctx.beginPath();
    // Right-pointing arrow
    this.ctx.moveTo(centerX - arrowSize / 2, centerY - arrowSize / 2);
    this.ctx.lineTo(centerX + arrowSize / 2, centerY);
    this.ctx.lineTo(centerX - arrowSize / 2, centerY + arrowSize / 2);
    this.ctx.closePath();
    this.ctx.fill();
  }

  renderMapEditor(level: Level, selectedTileType: string, mouseX: number, mouseY: number): void {
    this.clear();

    const tileSize = 16;
    const gridX = Math.floor(mouseX / tileSize);
    const gridY = Math.floor(mouseY / tileSize);

    // Render grid
    this.ctx.strokeStyle = '#444';
    this.ctx.lineWidth = 1;
    for (let x = 0; x <= level.width; x++) {
      this.ctx.beginPath();
      this.ctx.moveTo(x * tileSize, 0);
      this.ctx.lineTo(x * tileSize, level.height * tileSize);
      this.ctx.stroke();
    }
    for (let y = 0; y <= level.height; y++) {
      this.ctx.beginPath();
      this.ctx.moveTo(0, y * tileSize);
      this.ctx.lineTo(level.width * tileSize, y * tileSize);
      this.ctx.stroke();
    }

    // Render tiles
    const tileColors: Record<string, string> = {
      'empty': 'transparent',
      'solid': '#666',
      'hazard': '#ff0000',
      'start': '#00ff00',
      'finish': '#0000ff',
      'checkpoint': '#ffff00'
    };

    for (const tile of level.tiles) {
      if (tile.type !== 'empty') {
        this.ctx.fillStyle = tileColors[tile.type] || '#666';
        this.ctx.fillRect(tile.x * tileSize, tile.y * tileSize, tileSize, tileSize);
      }
    }

    // Highlight hovered tile
    if (gridX >= 0 && gridX < level.width && gridY >= 0 && gridY < level.height) {
      this.ctx.strokeStyle = '#fff';
      this.ctx.lineWidth = 2;
      this.ctx.strokeRect(gridX * tileSize, gridY * tileSize, tileSize, tileSize);

      // Preview selected tile
      if (selectedTileType !== 'empty') {
        this.ctx.fillStyle = tileColors[selectedTileType] || '#666';
        this.ctx.globalAlpha = 0.5;
        this.ctx.fillRect(gridX * tileSize, gridY * tileSize, tileSize, tileSize);
        this.ctx.globalAlpha = 1.0;
      }
    }
  }
}

