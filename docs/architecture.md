---
name: Architecture - The Curator
description: Strict architecture constraints for The Curator (Phaser + DOM hybrid)
applyTo: "**"
---

## ARCHITECTURE: THE CURATOR (STRICT)

This document covers implementation constraints; gameplay rules and tuning live in `docs/game-design.md`.

## Rendering & UI (Non-Negotiable)
- **Engine:** Use Phaser 3 for the game loop and rendering (maps, sprites).
- **UI Layer:** Use HTML/CSS DOM overlay for all menus, buttons, dialogs, and HUD. Phaser Text objects are acceptable for in-world spatial labels (e.g., map node names, distance markers) where positioning relative to game objects is required.
- **Tutorial System:** Tutorial dialogues use a dedicated UI system (`UIManager.showTutorialDialogue()`) that is visually distinct and positioned separately from game modals to prevent conflicts. Tutorial dialogues have gold/amber styling and appear at the bottom of the screen.

## DOM Overlay (Implementation Notes)
- Construct UI via `UIManager.getInstance()` (singleton) inside each Scene `create()`; clear UI on entry.
- The overlay root is `#ui-overlay` and the Phaser canvas container is `#phaser-game`.
- Keep the overlay container `pointer-events: none`; set interactive children to `pointer-events: auto`.
- Tutorial dialogues are rendered via `UIManager.showTutorialDialogue()` and styled with `.tutorial-dialogue` CSS class.
- **Custom Modals:** Complex UIs (e.g., restoration specialist selection) use dedicated modal methods (e.g., `UIManager.showRestorationModal()`) with custom layouts instead of generic button-based modals for better UX.

## Scenes & Transitions
- Scenes live under `src/scenes/`.
- Expected flow: `BootScene` → `GarageScene` (Hub) ⇄ `MapScene` (Day Loop).
- Encounter flow: `MapScene` → `AuctionScene` (PvP) OR `NegotiationScene` (PvE) → back to `MapScene`.
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
  /core          (game-manager.ts, event-bus.ts)
  /data          (Static data: car-database.ts, rival-database.ts)
  /scenes        (Phaser Scenes: boot-scene.ts, garage-scene.ts, map-scene.ts, auction-scene.ts, negotiation-scene.ts)
  /systems       (Logic: economy.ts, rival-ai.ts, time-system.ts)
  /ui            (HTML/CSS generation scripts)
  main.ts        (Entry Point)
