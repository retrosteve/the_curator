import Phaser from 'phaser';
import { GameManager } from '@/core/GameManager';

/**
 * Boot Scene - Initial loading and setup
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
    console.log('GameManager initialized:', gameManager);

    // Transition to Garage scene
    this.scene.start('GarageScene');
  }
}
