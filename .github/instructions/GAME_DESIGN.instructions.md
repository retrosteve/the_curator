---
name: Game Design - The Curator
description: Game design rules and core loop specification for The Curator
applyTo: "**"
---

# GAME DESIGN: THE CURATOR (RULES)

## Core Loop
1. **Map Phase:** Player clicks nodes (Scrapyard, Dealership). Costs time.
2. **Encounter Phase:**
   - If rival present -> Auction (turn-based battle).
   - If solo -> Negotiation (menu choices).
3. **Garage Phase:** Player spends money + time to restore cars (increases value).
4. **Sales:** Player sells flipped cars for profit.

## Data Structures

### Car
- `id`: string
- `name`: string
- `baseValue`: number
- `condition`: 0-100 (affects value)
- `tags`: string[] (e.g., "Muscle", "JDM")
- `history`: string[] (e.g., "Flooded", "Rust")

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
  - Power Bid (+$500, +Stress)
  - Stall (-Patience)
- **Rival AI:**
  - If `CurrentBid > Budget`: quit.
  - If `Patience <= 0`: quit.
  - Else: bid.

## Current MVP Goal
1. A working Garage Scene (HTML UI)
2. A working Map Scene (Clickable Nodes)
3. A car data structure that persists between scenes
