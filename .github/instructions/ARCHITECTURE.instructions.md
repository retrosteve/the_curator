---
name: Architecture - The Curator
description: Strict architecture constraints for The Curator (Phaser + DOM hybrid)
applyTo: "**"
---

# ARCHITECTURE: THE CURATOR (STRICT)

## Rendering & UI (Non-Negotiable)
- **Engine:** Use Phaser 3 for the game loop and rendering (maps, sprites).
- **UI Layer:** Do NOT use Phaser Text objects for complex UI. Use an HTML/CSS DOM overlay for menus, buttons, and dialogs.

## State & Ownership
- **Single source of truth:** Use a central `GameManager` (Singleton) for player state (money, inventory) and world state (day, time).
- Prefer decoupled communication via `EventBus` rather than tight coupling between scenes/systems.

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
