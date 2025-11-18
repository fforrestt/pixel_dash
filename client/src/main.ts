import { NetworkClient } from './network.js';
import { MainMenu } from './screens/MainMenu.js';
import { LobbyScreen } from './screens/Lobby.js';
import { RaceScreen } from './screens/Race.js';
import { ResultsScreen } from './screens/Results.js';
import { MapBrowserScreen } from './screens/MapBrowser.js';
import { MapEditorScreen } from './screens/MapEditor.js';
import { PublicLobbyBrowserScreen } from './screens/PublicLobbyBrowser.js';
import { CosmeticsScreen } from './screens/Cosmetics.js';
import { LeaderboardScreen } from './screens/Leaderboard.js';
import { TestgroundScreen } from './screens/Testground.js';

class App {
  private container: HTMLElement;
  private network: NetworkClient;
  private currentScreen: any = null;
  private screens: Map<string, any> = new Map();

  constructor() {
    this.container = document.getElementById('app')!;
    this.network = new NetworkClient();

    // Initialize screens
    this.screens.set('main-menu', new MainMenu(this.container, this.network));
    this.screens.set('lobby', new LobbyScreen(this.container, this.network));
    this.screens.set('race', new RaceScreen(this.container, this.network));
    this.screens.set('results', new ResultsScreen(this.container, this.network));
    this.screens.set('map-browser', new MapBrowserScreen(this.container, this.network));
    this.screens.set('map-editor', new MapEditorScreen(this.container, this.network));
    this.screens.set('public-lobbies', new PublicLobbyBrowserScreen(this.container, this.network));
    this.screens.set('cosmetics', new CosmeticsScreen(this.container, this.network));
    this.screens.set('leaderboard', new LeaderboardScreen(this.container, this.network));
    this.screens.set('testground', new TestgroundScreen(this.container));

    // Listen for screen changes
    this.container.addEventListener('screen-change', (e: any) => {
      const detail = e.detail;
      if (typeof detail === 'string') {
        this.showScreen(detail);
      } else if (detail.screen) {
        this.showScreen(detail.screen, detail);
      }
    });

    // Listen for lobby join to switch to lobby screen
    this.network.on('lobby_state', () => {
      this.showScreen('lobby');
    });

    // Connect to server
    this.network.connect().then(() => {
      this.showScreen('main-menu');
    }).catch((error) => {
      console.error('Failed to connect:', error);
      this.container.innerHTML = `
        <div class="screen">
          <h1>Connection Error</h1>
          <p>Failed to connect to game server.</p>
          <p>Make sure the server is running on port 3001.</p>
          <button onclick="location.reload()">Retry</button>
        </div>
      `;
    });
  }

  private showScreen(screenName: string, data?: any): void {
    // Cleanup current screen
    if (this.currentScreen && typeof this.currentScreen.cleanup === 'function') {
      this.currentScreen.cleanup();
    }

    const screen = this.screens.get(screenName);
    if (screen) {
      this.currentScreen = screen;
      if (screenName === 'results' && data?.results) {
        screen.setResults(data.results);
      } else {
        screen.render();
      }
    } else {
      console.error(`Screen not found: ${screenName}`);
    }
  }
}

// Initialize app when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new App();
  });
} else {
  new App();
}

