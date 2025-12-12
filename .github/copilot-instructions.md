# The Curator — AI Agent Instructions

These instructions make AI agents immediately productive in this Phaser + DOM hybrid project. Keep changes minimal, follow existing patterns, and reference the files noted here.

## Architecture
- **Rendering split:** Phaser 3 renders game world; HTML/CSS DOM overlay renders all UI. Do not use Phaser Text for UI.
- **Singletons:** `GameManager` and `EventBus` live under `src/core/`. Access via `GameManager.getInstance()`; publish/subscribe via `EventBus`.
- **Scenes:** Under `src/scenes/`. Flow: `BootScene` → `GarageScene` ⇄ `MapScene` → `AuctionScene` → back to `MapScene`. Transitions use `this.scene.start('SceneName', data)`.
- **Systems:** Stateless business logic in `src/systems/` (`Economy`, `RivalAI`, `TimeSystem`). Data in `src/data/` (`CarDatabase`, `RivalDatabase`).

## State & Events
- **Single source of truth:** `GameManager` maintains player (`money`, `inventory[]`, `reputation`) and world (`day`, `timeOfDay`, `currentLocation`). Mutate via methods only.
- **Allowed mutations:**
	- Money: `addMoney(amount)`, `spendMoney(amount)`
	- Inventory: `addCar(car)`, `removeCar(carId)`
	- Time: `TimeSystem.advanceTime(hours)`
- **Event channels:** `'money-changed'` number, `'inventory-changed'` `Car[]`, `'time-changed'` number, `'day-changed'` number, `'location-changed'` string.

## UI Pattern (DOM overlay)
- Construct UI via `UIManager` in `Scene.create()`; clear on entry.
- Typical flow:
	- `this.uiManager = new UIManager();`
	- `this.uiManager.clear()` then build panels/buttons
	- Append with `this.uiManager.append(element)`
- Overlay is rooted at `#ui-overlay`; Phaser canvas at `#phaser-game`. Overlay uses `pointer-events: none`, set children to `auto` for interactivity.

## Data & Calculations
- Cars and rivals are static arrays with helpers in `src/data/`.
- Selection: use `getRandomCar()` and `getRandomRival()`.
- Valuation: car value = `baseValue × (condition/100)`.
- Restoration cost: `conditionGain × baseValue × 0.01`.

## Graphics
- Use Phaser primitives (`this.add.graphics()`, `this.add.circle()`) for placeholder visuals. Avoid external image loading.

## Developer Workflow
- Run dev server: `npm run dev` (Vite on :3000).
- Scene lifecycle: implement `init(data?)` for inputs, always implement `create()`; access `this.add`, `this.scene`, `this.cameras` only after Phaser initializes.
- Path alias: use `@/` for `src/` (see `tsconfig.json`, `vite.config.ts`). TypeScript strict; avoid `any`.

## Common Gotchas
- Don’t mutate `GameManager.player` or `.world` directly; use methods above.
- Don’t forget `this.uiManager.clear()` when rebuilding UI on scene transitions.
- Check time availability before transitions that advance gameplay.
- Avoid Phaser Text/UI for menus; use DOM via `UIManager`.

## Cross-Scene Data Flow Example
- From `MapScene` to `AuctionScene`:
	- `this.scene.start('AuctionScene', { car, rival, interest })`
	- `AuctionScene.init(data: { car: Car; rival: Rival; interest: number })`

## File Map
- `src/core/EventBus.ts`, `src/core/GameManager.ts` — Singletons and state.
- `src/systems/*` — Logic: economy, rival AI, time.
- `src/data/*` — Static content and helpers.
- `src/scenes/*` — Phaser scenes + UI orchestration.
- `src/ui/UIManager.ts` — DOM UI factory.
