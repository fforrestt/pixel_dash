import { PlayerInput } from './types.js';

export class InputManager {
  private keys: Set<string> = new Set();
  private lastInput: PlayerInput = { left: false, right: false, jump: false, dash: false, timestamp: 0 };
  private jumpPressed = false;
  private jumpReleased = true;
  private dashPressed = false;
  private dashReleased = true;

  constructor() {
    window.addEventListener('keydown', (e) => this.handleKeyDown(e));
    window.addEventListener('keyup', (e) => this.handleKeyUp(e));
  }

  private handleKeyDown(e: KeyboardEvent): void {
    this.keys.add(e.key.toLowerCase());
    this.keys.add(e.code.toLowerCase());

    // Handle jump with edge detection
    if ((e.key === ' ' || e.key === 'w' || e.key === 'ArrowUp') && this.jumpReleased) {
      this.jumpPressed = true;
      this.jumpReleased = false;
    }

    // Handle dash with edge detection (F key)
    if ((e.key === 'f' || e.key === 'F') && this.dashReleased) {
      this.dashPressed = true;
      this.dashReleased = false;
    }
  }

  private handleKeyUp(e: KeyboardEvent): void {
    this.keys.delete(e.key.toLowerCase());
    this.keys.delete(e.code.toLowerCase());

    if (e.key === ' ' || e.key === 'w' || e.key === 'ArrowUp') {
      this.jumpReleased = true;
    }

    if (e.key === 'f' || e.key === 'F') {
      this.dashReleased = true;
    }
  }

  getInput(): PlayerInput {
    const left = this.keys.has('a') || this.keys.has('arrowleft');
    const right = this.keys.has('d') || this.keys.has('arrowright');
    const jump = this.jumpPressed;
    const dash = this.dashPressed;
    
    // Reset jump after reading
    if (this.jumpPressed) {
      this.jumpPressed = false;
    }

    // Reset dash after reading
    if (this.dashPressed) {
      this.dashPressed = false;
    }

    const input: PlayerInput = {
      left,
      right,
      jump,
      dash,
      timestamp: Date.now()
    };

    this.lastInput = input;
    return input;
  }

  isKeyPressed(key: string): boolean {
    return this.keys.has(key.toLowerCase());
  }

  cleanup(): void {
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
  }
}

