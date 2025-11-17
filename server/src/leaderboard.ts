import Database from 'better-sqlite3';
import { LeaderboardEntry } from './types.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export class Leaderboard {
  private db: Database.Database;

  constructor() {
    const dbPath = path.join(__dirname, '../data/leaderboard.db');
    this.db = new Database(dbPath);
    this.initDatabase();
  }

  private initDatabase(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS leaderboard (
        playerId TEXT NOT NULL,
        playerName TEXT NOT NULL,
        mode TEXT NOT NULL,
        wins INTEGER DEFAULT 0,
        bestTime INTEGER,
        lastUpdated INTEGER NOT NULL,
        PRIMARY KEY (playerId, mode)
      );

      CREATE INDEX IF NOT EXISTS idx_leaderboard_mode ON leaderboard(mode);
      CREATE INDEX IF NOT EXISTS idx_leaderboard_wins ON leaderboard(wins DESC);
      CREATE INDEX IF NOT EXISTS idx_leaderboard_time ON leaderboard(bestTime ASC);
    `);
  }

  recordWin(playerId: string, playerName: string, mode: 'sprint' | 'lap', time?: number): void {
    const existing = this.db.prepare('SELECT * FROM leaderboard WHERE playerId = ? AND mode = ?').get(playerId, mode) as any;

    if (existing) {
      const newWins = existing.wins + 1;
      const newBestTime = time && (!existing.bestTime || time < existing.bestTime) ? time : existing.bestTime;

      this.db.prepare(`
        UPDATE leaderboard 
        SET wins = ?, bestTime = ?, lastUpdated = ?, playerName = ?
        WHERE playerId = ? AND mode = ?
      `).run(newWins, newBestTime, Date.now(), playerName, playerId, mode);
    } else {
      this.db.prepare(`
        INSERT INTO leaderboard (playerId, playerName, mode, wins, bestTime, lastUpdated)
        VALUES (?, ?, ?, 1, ?, ?)
      `).run(playerId, playerName, mode, time || null, Date.now());
    }
  }

  getTopPlayers(mode: 'sprint' | 'lap', limit: number = 10): LeaderboardEntry[] {
    const stmt = this.db.prepare(`
      SELECT * FROM leaderboard 
      WHERE mode = ? 
      ORDER BY wins DESC, bestTime ASC 
      LIMIT ?
    `);
    const rows = stmt.all(mode, limit) as any[];

    return rows.map(row => ({
      playerId: row.playerId,
      playerName: row.playerName,
      wins: row.wins,
      bestTime: row.bestTime || undefined,
      mode: row.mode as 'sprint' | 'lap'
    }));
  }

  getPlayerStats(playerId: string): LeaderboardEntry[] {
    const stmt = this.db.prepare('SELECT * FROM leaderboard WHERE playerId = ?');
    const rows = stmt.all(playerId) as any[];

    return rows.map(row => ({
      playerId: row.playerId,
      playerName: row.playerName,
      wins: row.wins,
      bestTime: row.bestTime || undefined,
      mode: row.mode as 'sprint' | 'lap'
    }));
  }

  close(): void {
    this.db.close();
  }
}

