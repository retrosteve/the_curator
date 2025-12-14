import Phaser from 'phaser';
import { BootScene } from './scenes/boot-scene';
import { MainMenuScene } from './scenes/main-menu-scene';
import { GarageScene } from './scenes/garage-scene';
import { MapScene } from './scenes/map-scene';
import { AuctionScene } from './scenes/auction-scene';
import { NegotiationScene } from './scenes/negotiation-scene';

/**
 * Main entry point for The Curator.
 * Initializes Phaser game instance with all scenes.
 * Scene flow: Boot → MainMenu → Garage (hub) ⇄ Map → Auction/Negotiation → Map
 * UI is rendered via DOM overlay (#ui-overlay), not Phaser Text objects.
 */

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: 1280,
  height: 720,
  parent: 'phaser-game',
  backgroundColor: '#1a1a1a',
  scene: [BootScene, MainMenuScene, GarageScene, MapScene, AuctionScene, NegotiationScene],
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
