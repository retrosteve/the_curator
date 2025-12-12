---
name: Game Design - The Curator
description: Game design rules and core loop specification for The Curator
applyTo: "**"
---

# GAME DESIGN: THE CURATOR (RULES)

This document covers gameplay rules; implementation constraints (Phaser/DOM split, state/events, scene boundaries) live in `.github/instructions/architecture.instructions.md`.

## Core Loop
1. **Map Phase:** Player clicks nodes (Scrapyard, Dealership). Costs time (1 Hour).
2. **Encounter Phase:**
   - If rival present -> Auction (turn-based battle).
   - If solo -> Negotiation (menu choices using Player Stats).
3. **Garage Phase:** Player assigns cars to Specialists for restoration.
4. **Sales:** Player sells flipped cars for profit or keeps for Museum Prestige.

## Data Structures

### Player (The RPG Layer)
- `money`: number
- `prestige`: number
- `skills`:
  - `eye`: Level 1-5 (Reveals hidden damage)
  - `tongue`: Level 1-5 (Unlocks better bids)
  - `network`: Level 1-5 (Reveals map nodes)

### Car
- `id`: string
- `name`: string
- `baseValue`: number
- `condition`: 0-100 (affects value)
- `tags`: string[] (e.g., "Muscle", "JDM")
- `history`: string[] (e.g., "Flooded", "Rust", "Mint")

### Rival
- `name`: string
- `budget`: number
- `patience`: number (0-100)
- `wishlist`: string[] (tags they target)
- `strategy`: "Aggressive" | "Passive" | "Collector"

## Auction Battle (Logic)
- Turn-based.
- **Player actions:**
  - Bid (+$100)
  - Power Bid (+$500, reduces Rival Patience)
  - Stall (reduces Rival Patience)
  - **Kick Tires** (reduces Rival Budget; requires 'Eye' skill)
- **Rival AI:**
  - If `currentBid > budget`: quit.
  - If `Patience <= 0`: quit.
  - Else: bid.

### Auction Notes (Implementation-Friendly)
- The player cannot bid above their available `money`.
- Treat the Auction "stress" concept as operating on `patience` (i.e., actions that add stress reduce `patience`) so the Rival data model stays minimal.

## Restoration Logic (Specialists)
- **Cheap Charlie:** Low Cost / High Speed / Risk of Value Drop.
- **The Artisan:** High Cost / Low Speed / Value Multiplier.

## Time Costs (The Economy)
- **Travel:** 1 Hour
- **Inspect:** 30 Mins
- **Auction:** 2 Hours

## Valuation & Costs (Implementation-Friendly)
- Car value = `baseValue × (condition/100)`.
- Restoration cost = `conditionGain × baseValue × 0.01`.

## Current Goal
1. A working Garage Scene (HTML UI) showing Money and Inventory.
2. A working Map Scene (Clickable Nodes that advance the Clock).
3. A car data structure that persists between scenes.