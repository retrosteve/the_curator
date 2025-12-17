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

### Car Images

Store per-car images in `src/assets/cars/` and name each file by its **template car id** (from `src/data/car-database.ts`).

Example filenames:

- `car_icon_018.jpg`
- `car_cult_009.webp`

At runtime, use the helper in `src/assets/car-images.ts` to resolve a template id to a bundled URL.

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
