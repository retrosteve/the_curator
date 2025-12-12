---
name: Architecture - The Curator
description: Strict architecture constraints for The Curator (Phaser + DOM hybrid)
applyTo: "**"
---

# ARCHITECTURE: THE CURATOR (STRICT)

This document covers implementation constraints; gameplay rules and tuning live in `.github/instructions/game-design.instructions.md`.

## Rendering & UI (Non-Negotiable)
- **Engine:** Use Phaser 3 for the game loop and rendering (maps, sprites).
- **UI Layer:** Do NOT use Phaser Text objects for complex UI. Use an HTML/CSS DOM overlay for menus, buttons, and dialogs.

## DOM Overlay (Implementation Notes)
- Construct UI via `UIManager` inside each Scene `create()`; clear UI on entry.
- The overlay root is `#ui-overlay` and the Phaser canvas container is `#phaser-game`.
- Keep the overlay container `pointer-events: none`; set interactive children to `pointer-events: auto`.

## Scenes & Transitions
- Scenes live under `src/scenes/`.
- Expected flow: `BootScene` → `GarageScene` ⇄ `MapScene` → `AuctionScene` → back to `MapScene`.
- Use Phaser scene transitions: `this.scene.start('SceneName', data)`.

## State & Ownership
- **Single source of truth:** Use a central `GameManager` (Singleton) for player state (money, inventory) and world state (day, time).
- Prefer decoupled communication via `EventBus` rather than tight coupling between scenes/systems.

## State Mutations & Events (Contract)
- Do not mutate `GameManager.player` or `GameManager.world` directly; mutate via methods only.
- Allowed mutations:
  - Money: `addMoney(amount)`, `spendMoney(amount)`
  - Prestige: `addPrestige(amount)`
  - Inventory: `addCar(car)`, `removeCar(carId)`
  - Time: `TimeSystem.advanceTime(hours)`
- Event channels:
  - `'money-changed'` number
  - `'prestige-changed'` number
  - `'inventory-changed'` `Car[]`
  - `'time-changed'` number
  - `'day-changed'` number
  - `'location-changed'` string

## Common Gotchas
- Always call `this.uiManager.clear()` when rebuilding UI on scene transitions.

## Assets
- Use simple colored primitives (rectangles/circles) as placeholders.
- Do not load image/audio files that do not exist yet.

## Repo Structure (Reference)
/src
  /assets        (Images - currently empty)
  /core          (GameManager.ts, EventBus.ts)
  /data          (Static data: CarDatabase.ts, RivalDatabase.ts)
  /scenes        (Phaser Scenes: Boot, Garage, Map, Auction)
  /systems       (Logic: Economy.ts, RivalAI.ts, TimeSystem.ts)
  /ui            (HTML/CSS generation scripts)
  main.ts        (Entry Point)
