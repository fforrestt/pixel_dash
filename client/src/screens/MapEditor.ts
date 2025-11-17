import { NetworkClient } from '../network.js';
import { Level, Tile, TileType } from '../types.js';
import { Renderer } from '../renderer.js';

export class MapEditorScreen {
  private container: HTMLElement;
  private network: NetworkClient;
  private canvas: HTMLCanvasElement | null = null;
  private renderer: Renderer | null = null;
  private level: Level;
  private selectedTileType: TileType = 'solid';
  private isDrawing = false;
  private mouseX = 0;
  private mouseY = 0;

  constructor(container: HTMLElement, network: NetworkClient) {
    this.container = container;
    this.network = network;

    // Initialize empty level
    this.level = {
      id: 'editor',
      width: 100,
      height: 20,
      tiles: [],
      type: 'sprint'
    };

    // Initialize tiles
    for (let x = 0; x < this.level.width; x++) {
      for (let y = 0; y < this.level.height; y++) {
        this.level.tiles.push({ x, y, type: 'empty' });
      }
    }
  }

  render(): void {
    this.container.innerHTML = `
      <div style="display: flex; height: 100%;">
        <div style="width: 200px; padding: 20px; background: #2a2a2a; overflow-y: auto;">
          <h2>Map Editor</h2>
          
          <div style="margin: 20px 0;">
            <label>Map Name:</label>
            <input type="text" id="map-name" value="My Map" style="width: 100%; margin-top: 5px;">
          </div>

          <div style="margin: 20px 0;">
            <label>Map Type:</label>
            <select id="map-type" style="width: 100%; margin-top: 5px;">
              <option value="sprint">Sprint</option>
              <option value="lap">Lap</option>
            </select>
          </div>

          <div style="margin: 20px 0;">
            <h3>Tile Palette</h3>
            <button data-tile="empty" style="width: 100%; margin: 5px 0;">Empty</button>
            <button data-tile="solid" style="width: 100%; margin: 5px 0; background: #666;">Solid</button>
            <button data-tile="hazard" style="width: 100%; margin: 5px 0; background: #ff0000;">Hazard</button>
            <button data-tile="start" style="width: 100%; margin: 5px 0; background: #00ff00;">Start</button>
            <button data-tile="finish" style="width: 100%; margin: 5px 0; background: #0000ff;">Finish</button>
            <button data-tile="checkpoint" style="width: 100%; margin: 5px 0; background: #ffff00;">Checkpoint</button>
          </div>

          <div style="margin: 20px 0;">
            <button id="btn-clear" style="width: 100%; margin: 5px 0;">Clear All</button>
            <button id="btn-save" style="width: 100%; margin: 5px 0; background: #0a0;">Save Map</button>
          </div>

          <button class="menu-button" id="btn-back" style="width: 100%; margin-top: 20px;">Back to Menu</button>
        </div>

        <div style="flex: 1; position: relative;">
          <canvas id="editor-canvas" style="display: block; width: 100%; height: 100%;"></canvas>
        </div>
      </div>
    `;

    this.canvas = document.getElementById('editor-canvas') as HTMLCanvasElement;
    if (this.canvas) {
      this.renderer = new Renderer(this.canvas);
      this.renderer.resize(this.level.width * 16, this.level.height * 16);
      this.setupEventListeners();
      this.update();
    }

    // Tile selection
    document.querySelectorAll('[data-tile]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.selectedTileType = (btn as HTMLElement).dataset.tile as TileType;
        document.querySelectorAll('[data-tile]').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
      });
    });

    document.getElementById('btn-clear')?.addEventListener('click', () => {
      if (confirm('Clear all tiles?')) {
        this.level.tiles.forEach(t => t.type = 'empty');
        this.update();
      }
    });

    document.getElementById('btn-save')?.addEventListener('click', () => {
      this.saveMap();
    });

    document.getElementById('btn-back')?.addEventListener('click', () => {
      this.container.dispatchEvent(new CustomEvent('screen-change', { detail: 'main-menu' }));
    });

    document.getElementById('map-type')?.addEventListener('change', (e) => {
      this.level.type = (e.target as HTMLSelectElement).value as 'sprint' | 'lap';
    });
  }

  private setupEventListeners(): void {
    if (!this.canvas) return;

    this.canvas.addEventListener('mousedown', (e) => {
      this.isDrawing = true;
      this.placeTile(e);
    });

    this.canvas.addEventListener('mousemove', (e) => {
      const rect = this.canvas!.getBoundingClientRect();
      this.mouseX = e.clientX - rect.left;
      this.mouseY = e.clientY - rect.top;
      
      if (this.isDrawing) {
        this.placeTile(e);
      } else {
        this.update();
      }
    });

    this.canvas.addEventListener('mouseup', () => {
      this.isDrawing = false;
    });

    this.canvas.addEventListener('mouseleave', () => {
      this.isDrawing = false;
    });
  }

  private placeTile(e: MouseEvent): void {
    if (!this.canvas) return;

    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const gridX = Math.floor(x / 16);
    const gridY = Math.floor(y / 16);

    if (gridX >= 0 && gridX < this.level.width && gridY >= 0 && gridY < this.level.height) {
      const tile = this.level.tiles[gridX * this.level.height + gridY];
      
      // If placing start/finish/checkpoint, clear others of same type
      if (this.selectedTileType === 'start' || this.selectedTileType === 'finish') {
        this.level.tiles.forEach(t => {
          if (t.type === this.selectedTileType) {
            t.type = 'empty';
          }
        });
      }

      tile.type = this.selectedTileType;
      this.update();
    }
  }

  private update(): void {
    if (!this.renderer || !this.canvas) return;
    this.renderer.renderMapEditor(this.level, this.selectedTileType, this.mouseX, this.mouseY);
  }

  private saveMap(): void {
    const nameInput = document.getElementById('map-name') as HTMLInputElement;
    const name = nameInput?.value || 'Untitled Map';

    // Validate map
    const hasStart = this.level.tiles.some(t => t.type === 'start');
    const hasFinish = this.level.tiles.some(t => t.type === 'finish');

    if (!hasStart || !hasFinish) {
      alert('Map must have at least one start and one finish tile!');
      return;
    }

    this.network.saveMap(name, this.level);
    alert('Map saved!');
  }
}

