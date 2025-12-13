import Phaser from 'phaser';
import { GameManager } from '@/core/game-manager';

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
    console.log('Boot Scene: Initializing game...');
    
    // Initialize GameManager
    const gameManager = GameManager.getInstance();
    gameManager.setLocation('boot');
    console.log('GameManager initialized:', gameManager);

    // Transition to Garage scene
    this.scene.start('GarageScene');
  }
}
