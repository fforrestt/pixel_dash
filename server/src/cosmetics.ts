import Database from 'better-sqlite3';
import { CosmeticsData } from './types.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Available colors for purchase
export const AVAILABLE_COLORS = [
  '#FF0000', // Red
  '#00FF00', // Green
  '#0000FF', // Blue
  '#FFFF00', // Yellow
  '#FF00FF', // Magenta
  '#00FFFF', // Cyan
  '#FFA500', // Orange
  '#800080', // Purple
  '#FFC0CB', // Pink
  '#A52A2A', // Brown
  '#808080', // Gray
  '#000000', // Black
  '#FFFFFF', // White
  '#FFD700', // Gold
  '#C0C0C0', // Silver
  '#FF1493', // Deep Pink
];

const DEFAULT_COLOR = '#FF0000';

export class CosmeticsStore {
  private db: Database.Database;

  constructor() {
    const dbPath = path.join(__dirname, '../data/cosmetics.db');
    this.db = new Database(dbPath);
    this.initDatabase();
  }

  private initDatabase(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS cosmetics (
        playerId TEXT PRIMARY KEY,
        coins INTEGER DEFAULT 0,
        ownedColors TEXT NOT NULL,
        activeColor TEXT NOT NULL
      );
    `);
  }

  getPlayerCosmetics(playerId: string): CosmeticsData {
    const stmt = this.db.prepare('SELECT * FROM cosmetics WHERE playerId = ?');
    const row = stmt.get(playerId) as any;

    if (row) {
      return {
        playerId: row.playerId,
        coins: row.coins,
        ownedColors: JSON.parse(row.ownedColors),
        activeColor: row.activeColor
      };
    }

    // Create default entry
    const defaultColors = [DEFAULT_COLOR];
    this.db.prepare(`
      INSERT INTO cosmetics (playerId, coins, ownedColors, activeColor)
      VALUES (?, 0, ?, ?)
    `).run(playerId, JSON.stringify(defaultColors), DEFAULT_COLOR);

    return {
      playerId,
      coins: 0,
      ownedColors: defaultColors,
      activeColor: DEFAULT_COLOR
    };
  }

  addCoins(playerId: string, amount: number): void {
    const existing = this.getPlayerCosmetics(playerId);
    const newCoins = existing.coins + amount;

    this.db.prepare('UPDATE cosmetics SET coins = ? WHERE playerId = ?').run(newCoins, playerId);
  }

  purchaseColor(playerId: string, color: string): { success: boolean; error?: string } {
    if (!AVAILABLE_COLORS.includes(color)) {
      return { success: false, error: 'Invalid color' };
    }

    const cosmetics = this.getPlayerCosmetics(playerId);

    if (cosmetics.ownedColors.includes(color)) {
      return { success: false, error: 'Color already owned' };
    }

    const cost = 100; // Fixed cost per color
    if (cosmetics.coins < cost) {
      return { success: false, error: 'Not enough coins' };
    }

    const newOwnedColors = [...cosmetics.ownedColors, color];
    const newCoins = cosmetics.coins - cost;

    this.db.prepare(`
      UPDATE cosmetics 
      SET coins = ?, ownedColors = ?
      WHERE playerId = ?
    `).run(newCoins, JSON.stringify(newOwnedColors), playerId);

    return { success: true };
  }

  setActiveColor(playerId: string, color: string): { success: boolean; error?: string } {
    const cosmetics = this.getPlayerCosmetics(playerId);

    if (!cosmetics.ownedColors.includes(color)) {
      return { success: false, error: 'Color not owned' };
    }

    this.db.prepare('UPDATE cosmetics SET activeColor = ? WHERE playerId = ?').run(color, playerId);
    return { success: true };
  }

  close(): void {
    this.db.close();
  }
}

