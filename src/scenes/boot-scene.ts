import Phaser from 'phaser';
import { GameManager } from '@/core/game-manager';
import { debugLog } from '@/utils/log';

/**
 * Boot Scene - Initial loading and setup.
 * First scene to run; initializes GameManager and transitions to GarageScene.
 * Future: Load assets (images, fonts) here.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload(): void {
    // For now, no assets to load (using primitives)
    // Future: Load images, fonts, etc.
  }

  create(): void {
    debugLog('Boot Scene: Initializing game...');
    
    // Initialize GameManager
    const gameManager = GameManager.getInstance();
    gameManager.setLocation('boot');
    debugLog('GameManager initialized:', gameManager);

    // Transition to Main Menu scene
    this.scene.start('MainMenuScene');
  }
}
