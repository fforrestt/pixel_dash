# Pixel Dash Racers

A fast-paced 2D side-scrolling platform racing game with multiplayer support, custom map creation, and leaderboards.

## Features

- **2D Side-Scrolling Racing**: Race through procedurally generated or custom levels
- **Two-Stage Jump System**: Jump and dash through the air for advanced movement
- **Multiplayer Lobbies**: Public and private lobbies supporting up to 32 players
- **Game Modes**: 
  - **Sprint Mode**: Race from start to finish
  - **Lap Mode**: Complete multiple laps around a looping course
- **Custom Map Editor**: Create and share your own side-scrolling levels
- **Leaderboards**: Track your best times and wins (public lobbies only)
- **Cosmetics**: Unlock and purchase different colors for your character
- **Voting System**: Vote for the next game mode and map between rounds

## Installation

### Prerequisites

- Node.js 18+ and npm (or pnpm)
- A modern web browser

### Setup

1. Clone or download this repository

2. Install dependencies:
   ```bash
   npm install
   ```

   This will install dependencies for both the server and client workspaces.

## Running the Game

### Development Mode

Run both server and client concurrently:

```bash
npm run dev
```

This will:
- Start the game server on `http://localhost:3001`
- Start the Vite dev server on `http://localhost:3000`

### Manual Start

Alternatively, you can run them separately:

**Server:**
```bash
npm run dev:server
```

**Client:**
```bash
npm run dev:client
```

Then open your browser to `http://localhost:3000`

## Controls

- **A / Left Arrow**: Move left
- **D / Right Arrow**: Move right
- **Space / W / Up Arrow**: 
  - On ground: Jump (first jump)
  - In air: Dash in the direction you're moving (second jump)

### Jump & Dash Mechanics

- **First Jump**: Press jump while on the ground to perform a vertical jump
- **Dash**: While airborne after your first jump, press jump again to perform a horizontal dash in your current movement direction
- You can only dash once per airtime
- Landing on a platform resets your jump and dash abilities

## Game Architecture

### Server (`/server`)

- **Node.js + TypeScript**: Game server with WebSocket support
- **Authoritative Server**: All game logic runs server-side for security
- **SQLite Database**: Stores maps, leaderboards, and cosmetics data
- **Game Loop**: Runs at 20 ticks per second
- **Lobby Management**: Handles public/private lobbies, voting, and round flow

### Client (`/client`)

- **TypeScript + Vite**: Fast development and build tooling
- **Canvas 2D Rendering**: Pixel-perfect side-scrolling graphics
- **Client-Side Prediction**: Smooth movement with server reconciliation
- **UI Screens**: Main menu, lobby, race, results, map browser, map editor, cosmetics, leaderboards

## Project Structure

```
pixel_dash/
├── server/
│   ├── src/
│   │   ├── server.ts          # WebSocket server entry point
│   │   ├── gameLoop.ts         # Core game physics and simulation
│   │   ├── lobbyManager.ts     # Lobby and match management
│   │   ├── levelGenerator.ts   # Random level generation
│   │   ├── mapStorage.ts       # Custom map persistence
│   │   ├── leaderboard.ts      # Leaderboard system
│   │   ├── cosmetics.ts        # Cosmetics store
│   │   └── types.ts            # Shared type definitions
│   └── data/                   # SQLite databases (created automatically)
├── client/
│   ├── src/
│   │   ├── main.ts             # Application entry point
│   │   ├── network.ts          # WebSocket client
│   │   ├── game.ts             # Game loop and state management
│   │   ├── renderer.ts         # Canvas rendering
│   │   ├── input.ts            # Input handling
│   │   ├── screens/            # UI screens
│   │   └── types.ts            # Type definitions
│   └── index.html
└── package.json                # Root workspace configuration
```

## Game Flow

1. **Main Menu**: Choose to join a public lobby, create/join a private lobby, browse maps, view leaderboards, edit maps, or customize cosmetics
2. **Lobby**: Wait for players, vote for next game mode and map
3. **Countdown**: 3-second countdown before race starts
4. **Race**: Compete to finish first (sprint) or complete laps (lap mode)
5. **Results**: View placements, times, and coins earned
6. **Next Round**: Automatically return to lobby for voting and next race

## Security Features

- **Authoritative Server**: All game logic runs server-side
- **Input Validation**: Rate limiting and validation of all client inputs
- **Cheat Prevention**: Server validates all race results, lap counts, and finish times
- **Leaderboard Security**: Only public lobbies with minimum players update leaderboards
- **Network Security**: Message size limits and malformed message rejection

## Custom Maps

### Creating Maps

1. Go to "Map Editor" from the main menu
2. Select a tile type from the palette (Solid, Start, Finish, Checkpoint, Hazard)
3. Click and drag on the canvas to place tiles
4. Set map name and type (Sprint or Lap)
5. Click "Save Map" to upload to the server

### Map Requirements

- **Sprint Maps**: Must have at least one Start and one Finish tile
- **Lap Maps**: Must have Start, Finish, and at least one Checkpoint
- **Size Limits**: 20-200 width, 10-30 height

## Cosmetics

- Earn coins by completing races (50 base + bonuses for top 3)
- Purchase colors for 100 coins each
- Default red color is free
- Selected color persists across sessions

## Leaderboards

- Only public lobbies with 4+ players contribute to leaderboards
- Tracks best times and win counts per mode (Sprint/Lap)
- View top 10 global players and your personal stats

## Building for Production

```bash
npm run build
```

This builds both server and client:
- Server: TypeScript compiled to `server/dist/`
- Client: Vite build output to `client/dist/`

To run the production server:
```bash
cd server
npm start
```

## Troubleshooting

### Server won't start
- Make sure port 3001 is not in use
- Check that all dependencies are installed: `npm install`

### Client can't connect
- Verify the server is running on port 3001
- Check browser console for WebSocket connection errors
- In development, the client proxies WebSocket connections automatically

### Database errors
- The server automatically creates the `data/` directory and SQLite databases
- Ensure the server has write permissions in the `server/` directory

## License

This project is provided as-is for educational and entertainment purposes.

## Credits

Built with:
- Node.js + TypeScript
- WebSocket (ws)
- Vite
- SQLite (better-sqlite3)
- Canvas 2D API

Enjoy racing! 🏁

