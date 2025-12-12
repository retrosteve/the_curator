import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { GarageScene } from './scenes/GarageScene';
import { MapScene } from './scenes/MapScene';
import { AuctionScene } from './scenes/AuctionScene';

/**
 * Main entry point for The Curator
 */

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: 1280,
  height: 720,
  parent: 'phaser-game',
  backgroundColor: '#1a1a1a',
  scene: [BootScene, GarageScene, MapScene, AuctionScene],
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

console.log('The Curator - Game Started');
console.log('Game instance:', game);
