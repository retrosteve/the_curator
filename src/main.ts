import './styles/main.css';
import Phaser from 'phaser';
import { BootScene } from './scenes/boot-scene';
import { MainMenuScene } from './scenes/main-menu-scene';
import { GarageScene } from './scenes/garage-scene';
import { MapScene } from './scenes/map-scene';
import { AuctionScene } from './scenes/auction-scene';
import { debugLog } from '@/utils/log';

/**
 * Main entry point for The Curator.
 * Initializes Phaser game instance with all scenes.
 * Scene flow: Boot → MainMenu → Garage (hub) ⇄ Map → Auction → Map
 * UI is rendered via DOM overlay (#ui-overlay), not Phaser Text objects.
 */

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: 1280,
  height: 720,
  parent: 'phaser-game',
  backgroundColor: '#1a1a1a',
  scene: [BootScene, MainMenuScene, GarageScene, MapScene, AuctionScene],
  physics: {
    // No physics needed for this game
    default: undefined,
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
};

const game = new Phaser.Game(config);

const MIN_GAME_WIDTH = 1280;
const MIN_GAME_HEIGHT = 720;

let isMinResolutionPauseActive = false;
const scenesPausedByMinResolution = new Set<string>();

function setScenesPausedForMinResolution(shouldPause: boolean): void {
  if (shouldPause === isMinResolutionPauseActive) return;

  if (shouldPause) {
    isMinResolutionPauseActive = true;
    scenesPausedByMinResolution.clear();

    const activeScenes = game.scene.getScenes(true);
    for (const scene of activeScenes) {
      const key = scene.scene.key;
      if (!key) continue;
      if (scene.scene.isPaused()) continue;

      scenesPausedByMinResolution.add(key);
      game.scene.pause(key);
    }
  } else {
    isMinResolutionPauseActive = false;
    for (const key of scenesPausedByMinResolution) {
      game.scene.resume(key);
    }
    scenesPausedByMinResolution.clear();
  }
}

function ensureMinResolutionOverlay(): HTMLElement | null {
  const overlay = document.getElementById('ui-overlay');
  if (!overlay) return null;

  const existing = overlay.querySelector<HTMLElement>('#min-resolution-overlay');
  if (existing) return existing;

  const container = document.createElement('div');
  container.id = 'min-resolution-overlay';
  container.className = 'min-resolution-overlay';
  container.setAttribute('aria-hidden', 'true');

  const panel = document.createElement('div');
  panel.id = 'min-resolution-overlay-panel';
  panel.className = 'min-resolution-overlay__panel game-panel';
  panel.textContent = `Window too small. Minimum ${MIN_GAME_WIDTH}×${MIN_GAME_HEIGHT}.`;

  container.appendChild(panel);
  overlay.appendChild(container);

  return container;
}

function setMinResolutionOverlayMessage(currentWidth: number, currentHeight: number): void {
  const overlay = document.getElementById('ui-overlay');
  if (!overlay) return;

  const panel = overlay.querySelector<HTMLElement>('#min-resolution-overlay-panel');
  if (!panel) return;

  panel.textContent =
    `Window too small. Minimum ${MIN_GAME_WIDTH}×${MIN_GAME_HEIGHT}. ` +
    `Current: ${Math.round(currentWidth)}×${Math.round(currentHeight)}. ` +
    `Resize your browser window to continue.`;
}

function setMinResolutionOverlayVisible(
  isVisible: boolean,
  currentWidth: number,
  currentHeight: number
): void {
  const el = ensureMinResolutionOverlay();
  if (!el) return;

  setScenesPausedForMinResolution(isVisible);

  if (isVisible) {
    setMinResolutionOverlayMessage(currentWidth, currentHeight);
  }

  if (isVisible) {
    el.classList.add('min-resolution-overlay--visible');
    el.setAttribute('aria-hidden', 'false');
  } else {
    el.classList.remove('min-resolution-overlay--visible');
    el.setAttribute('aria-hidden', 'true');
  }
}

function syncOverlayGameAreaToCanvas(): void {
  const overlay = document.getElementById('ui-overlay');
  const canvas = document.querySelector<HTMLCanvasElement>('#phaser-game canvas');

  if (!overlay) return;

  const overlayRect = overlay.getBoundingClientRect();

  if (!canvas) {
    overlay.style.setProperty('--game-area-left', '0px');
    overlay.style.setProperty('--game-area-top', '0px');
    overlay.style.setProperty('--game-area-width', `${Math.round(overlayRect.width)}px`);
    overlay.style.setProperty('--game-area-height', `${Math.round(overlayRect.height)}px`);
    overlay.style.setProperty('--game-area-center-x', '50%');

    const fallbackScale = Math.min(
      overlayRect.width / MIN_GAME_WIDTH,
      overlayRect.height / MIN_GAME_HEIGHT
    );
    overlay.style.setProperty('--game-area-scale', `${fallbackScale}`);

    setMinResolutionOverlayVisible(
      overlayRect.width < MIN_GAME_WIDTH || overlayRect.height < MIN_GAME_HEIGHT,
      overlayRect.width,
      overlayRect.height
    );
    return;
  }

  const canvasRect = canvas.getBoundingClientRect();

  const left = Math.round(canvasRect.left - overlayRect.left);
  const top = Math.round(canvasRect.top - overlayRect.top);
  const width = Math.round(canvasRect.width);
  const height = Math.round(canvasRect.height);
  const centerX = Math.round(left + width / 2);

  overlay.style.setProperty('--game-area-left', `${left}px`);
  overlay.style.setProperty('--game-area-top', `${top}px`);
  overlay.style.setProperty('--game-area-width', `${width}px`);
  overlay.style.setProperty('--game-area-height', `${height}px`);
  overlay.style.setProperty('--game-area-center-x', `${centerX}px`);

  const scale = Math.min(width / MIN_GAME_WIDTH, height / MIN_GAME_HEIGHT);
  overlay.style.setProperty('--game-area-scale', `${scale}`);

  setMinResolutionOverlayVisible(width < MIN_GAME_WIDTH || height < MIN_GAME_HEIGHT, width, height);
}

// Keep DOM UI aligned with the scaled/letterboxed canvas.
game.events.once(Phaser.Core.Events.READY, () => {
  syncOverlayGameAreaToCanvas();
  game.scale.on(Phaser.Scale.Events.RESIZE, () => syncOverlayGameAreaToCanvas());
  window.addEventListener('resize', () => syncOverlayGameAreaToCanvas());
});

// Also try early (covers first paint before Phaser READY in some browsers).
requestAnimationFrame(() => syncOverlayGameAreaToCanvas());

debugLog('The Curator - Game Started');
debugLog('Game instance:', game);
