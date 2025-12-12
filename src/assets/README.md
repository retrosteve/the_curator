## Assets Directory

This directory is reserved for game assets (images, sprites, sounds).

Currently, the game uses **primitive shapes** (colored rectangles and circles) as placeholders.

## Future Assets

### Images Needed:
- Car sprites (top-down view)
- Location backgrounds
- UI elements
- Character portraits for rivals

### Sounds:
- Background music
- UI click sounds
- Auction atmosphere
- Car engine sounds

## Usage

When assets are added, load them in `BootScene.ts`:

```typescript
preload(): void {
  this.load.image('car-sprite', 'assets/cars/muscle-car.png');
  this.load.audio('bgm', 'assets/sounds/background-music.mp3');
}
```

Then use them in scenes:

```typescript
this.add.image(x, y, 'car-sprite');
this.sound.play('bgm');
```
