import Database from 'better-sqlite3';
import { CustomMap, Level } from './types.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export class MapStorage {
  private db: Database.Database;

  constructor() {
    const dbPath = path.join(__dirname, '../data/maps.db');
    this.db = new Database(dbPath);
    this.initDatabase();
  }

  private initDatabase(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS maps (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        author TEXT NOT NULL,
        authorId TEXT NOT NULL,
        type TEXT NOT NULL,
        levelData TEXT NOT NULL,
        createdAt INTEGER NOT NULL,
        timesPlayed INTEGER DEFAULT 0,
        rating INTEGER DEFAULT 0
      );

      CREATE INDEX IF NOT EXISTS idx_maps_type ON maps(type);
      CREATE INDEX IF NOT EXISTS idx_maps_times_played ON maps(timesPlayed DESC);
    `);
  }

  saveMap(map: CustomMap): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO maps (id, name, author, authorId, type, levelData, createdAt, timesPlayed, rating)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      map.id,
      map.name,
      map.author,
      map.authorId,
      map.type,
      JSON.stringify(map.level),
      map.createdAt,
      map.timesPlayed,
      map.rating
    );
  }

  getMap(id: string): CustomMap | null {
    const stmt = this.db.prepare('SELECT * FROM maps WHERE id = ?');
    const row = stmt.get(id) as any;

    if (!row) return null;

    return {
      id: row.id,
      name: row.name,
      author: row.author,
      authorId: row.authorId,
      type: row.type as 'sprint' | 'lap',
      level: JSON.parse(row.levelData) as Level,
      createdAt: row.createdAt,
      timesPlayed: row.timesPlayed,
      rating: row.rating
    };
  }

  getAllMaps(limit: number = 100): CustomMap[] {
    const stmt = this.db.prepare('SELECT * FROM maps ORDER BY timesPlayed DESC, rating DESC LIMIT ?');
    const rows = stmt.all(limit) as any[];

    return rows.map(row => ({
      id: row.id,
      name: row.name,
      author: row.author,
      authorId: row.authorId,
      type: row.type as 'sprint' | 'lap',
      level: JSON.parse(row.levelData) as Level,
      createdAt: row.createdAt,
      timesPlayed: row.timesPlayed,
      rating: row.rating
    }));
  }

  getMapsByType(type: 'sprint' | 'lap', limit: number = 50): CustomMap[] {
    const stmt = this.db.prepare('SELECT * FROM maps WHERE type = ? ORDER BY timesPlayed DESC, rating DESC LIMIT ?');
    const rows = stmt.all(type, limit) as any[];

    return rows.map(row => ({
      id: row.id,
      name: row.name,
      author: row.author,
      authorId: row.authorId,
      type: row.type as 'sprint' | 'lap',
      level: JSON.parse(row.levelData) as Level,
      createdAt: row.createdAt,
      timesPlayed: row.timesPlayed,
      rating: row.rating
    }));
  }

  incrementPlayCount(id: string): void {
    const stmt = this.db.prepare('UPDATE maps SET timesPlayed = timesPlayed + 1 WHERE id = ?');
    stmt.run(id);
  }

  updateRating(id: string, delta: number): void {
    const stmt = this.db.prepare('UPDATE maps SET rating = rating + ? WHERE id = ?');
    stmt.run(delta, id);
  }

  validateMap(level: Level): { valid: boolean; error?: string } {
    // Check for start
    const hasStart = level.tiles.some(t => t.type === 'start');
    if (!hasStart) {
      return { valid: false, error: 'Level must have a start tile' };
    }

    // Check for finish
    const hasFinish = level.tiles.some(t => t.type === 'finish');
    if (!hasFinish) {
      return { valid: false, error: 'Level must have a finish tile' };
    }

    // For lap mode, check for checkpoints
    if (level.type === 'lap' && (!level.checkpoints || level.checkpoints.length === 0)) {
      return { valid: false, error: 'Lap levels must have at least one checkpoint' };
    }

    // Basic size validation
    if (level.width < 20 || level.height < 10) {
      return { valid: false, error: 'Level too small' };
    }

    if (level.width > 200 || level.height > 30) {
      return { valid: false, error: 'Level too large' };
    }

    return { valid: true };
  }

  close(): void {
    this.db.close();
  }
}

