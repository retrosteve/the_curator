## The Curator

A 2D Strategy/Management game about running a car museum. Buy, restore, and flip classic cars to fund your dream museum.

## Tech Stack

- **TypeScript** - Type-safe development
- **Phaser 3** - Game engine for rendering and game loop
- **Vite** - Fast build tool and dev server
- **HTML/CSS** - UI overlay system

## Project Structure

```
/src
  /assets        - Images (currently empty, using primitives)
  /core          - Core systems (GameManager, EventBus)
  /data          - Static data (CarDatabase, RivalDatabase)
  /scenes        - Phaser scenes (Boot, Garage, Map, Auction)
  /systems       - Game logic (Economy, RivalAI, TimeSystem)
  /ui            - HTML/CSS UI management
  main.ts        - Entry point
```

## Game Features

### ✅ Garage Scene
- View your car inventory (shows current/max garage slots)
- View your car museum (display high-value restored cars)
- Restore cars (costs money + time)
- Sell cars for profit
- Upgrade garage capacity (costs prestige)
- Save/Load game progress
- End day mechanic

### ✅ Map Scene
- Three explorable locations:
  - **Joe's Scrapyard** (Travel: 1 hour) - Find project cars
  - **Classic Car Dealership** (Travel: 1 hour) - Browse inventory
  - **Weekend Auction House** (Travel: 1 hour)
- **Special Events:** Dynamic temporary locations (15% daily chance) with unique opportunities:
  - Estate Sales (discounted high-value cars)
  - Barn Finds (rare cars with guaranteed tags)
  - Private Collections (prestige cars with bonuses)
  - Clearance Events (multiple cheap cars)
- Time costs follow the rules:
  - **Travel:** 1 hour
  - **Inspect (solo negotiation):** 30 mins
  - **Special Events:** 30 mins (no travel time)
  - **Auction:** 2 hours
- Random encounters:
  - If a rival is present, the encounter becomes an **Auction** (from any location).
  - If no rival is present, the encounter is a **Negotiation**.
  - Special events are always solo encounters (no auctions).

### ✅ Auction Scene
Turn-based bidding battles against AI rivals:
- **Rival Tiers:** Progressive difficulty (Scrappers → Enthusiasts → Tycoons) based on prestige
- **Tactics:** Bid, Power Bid (reduces patience), Stall (requires Tongue skill), Kick Tires (requires Eye skill)
- **Rival AI:** Patience and budget determine when rivals quit
- **Tier Display:** Shows opponent tier in auction UI
- **Market Fluctuations:** Dynamic pricing based on seasons and random events
- **Rival Tiers:** Progressive difficulty (Scrappers → Enthusiasts → Tycoons) based on prestige
- **Tactics:** Bid, Power Bid (reduces patience), Stall (requires Tongue skill), Kick Tires (requires Eye skill)
- **Rival AI:** Patience and budget determine when rivals quit
- **Tier Display:** Shows opponent tier in auction UI
- **Bid** (+$100) - Standard bid
- **Power Bid** (+$500, -20 Rival Patience) - Aggressive bid
- **Kick Tires** (-$500 Rival Budget, requires Eye skill) - Undercut their spending power
- **Stall** (Tongue 2+, limited uses per auction = Tongue level, -20 Rival Patience) - Psychological warfare
- **Quit** - Walk away

Rivals have unique:
- Budgets
- Patience levels
- Strategies (Aggressive, Passive, Collector)
- Car preferences (wishlist tags)

### ✅ Core Systems
- **Economy** - Value calculations, restoration costs
- **Time Management** - Day/night cycle, action costs
- **Player State** - Money, inventory, prestige, skills (Eye/Tongue/Network)
- **Save/Load** - Persistent game progress via localStorage
- **Event System** - Decoupled communication

## Installation

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## Documentation

- **This README** is the canonical, human-facing overview (how to run, core loop, mechanics).
- For strict architecture constraints (used by tooling/agents), see [.github/instructions/ARCHITECTURE.instructions.md](.github/instructions/ARCHITECTURE.instructions.md).
- For game design rules (core loop, data shapes, auction logic), see [.github/instructions/game-design.instructions.md](.github/instructions/game-design.instructions.md).
- For contributor/agent workflow conventions, see [.github/copilot-instructions.md](.github/copilot-instructions.md).

## How to Play

1. **Start in Garage** - Your home base
2. **Visit Map** - Explore locations to find cars
3. **Encounters**:
   - Solo negotiations - Simple buy/pass decisions
   - Auctions - Strategic bidding against rivals
4. **Restore Cars** - Improve condition to increase value
5. **Build Museum** - Restore cars to excellent condition for prestige bonuses
6. **Sell for Profit** - Fund your operations and upgrades
7. **End Day** - Rest and start fresh (collect museum prestige)

## Game Mechanics

### Daily Rent and Bankruptcy
- A daily rent of **$100** is due when you **End Day**.
- If you can't pay rent, you must raise cash before ending the day:
  - Sell a car (if you have one), or
  - Take a bank loan (if one is available).
- If you still can't pay, you're bankrupt and it's **Game Over**.

### Car System
- Each car has:
  - **Name** - e.g., "1969 Dodge Charger"
  - **Condition** (0-100) - Affects value
  - **Base Value** - Starting worth
  - **Tags** - Muscle, JDM, Classic, etc.
  - **History** - Barn Find, Rust, Modified, etc.

### Garage Capacity
- Start with **1 garage slot**
- **Upgrade Cost:** Prestige points (100 for 1→2, 200 for 2→3, 400 for 3→4, 800 for 4→5)
- **Maximum:** 5 slots
- Cannot buy cars when garage is full
- Shows current usage in HUD: "🏠 Garage: 2/3"

### Museum Mechanic
- **Museum Cars:** Cars with condition ≥80%
- **Daily Prestige Bonus:** +1 prestige per museum car when you end the day
- **Purpose:** Encourages long-term car restoration and collection building
- **Display:** View museum in garage to see your collection

### Save/Load System
- **Auto-Save:** Game state automatically saves to browser localStorage on every change
- **Manual Save/Load:** Buttons in garage scene for explicit save/load operations
- **Saved Data:** Money, prestige, inventory, garage slots, day/time, museum display status

### Restoration
- Two restoration services are available (time is a major cost):
  - **Cheap Charlie (Minor Service):** +10 condition, 4 hours, low cost, small risk
  - **The Artisan (Major Overhaul):** +30 condition, 8 hours, high cost
- Max condition: 100

### Rival AI Strategies
- **Aggressive** - High bids, low patience
- **Passive** - Small bids, high patience
- **Collector** - Targets specific tags

## Development Notes

### Architecture

For strict architecture constraints, see
[.github/instructions/ARCHITECTURE.instructions.md](.github/instructions/ARCHITECTURE.instructions.md).

### Adding New Features

**New Car:**
```typescript
// In CarDatabase.ts
{
  id: 'car_009',
  name: '2000 Honda S2000',
  baseValue: 28000,
  condition: 65,
  tags: ['JDM', 'Convertible', 'Sports'],
  history: ['Low Miles', 'AP1'],
}
```

**New Rival:**
```typescript
// In RivalDatabase.ts
{
  id: 'rival_007',
  name: 'Your Name',
  budget: 50000,
  patience: 60,
  wishlist: ['JDM', 'Sports'],
  strategy: 'Collector',
  avatar: '#00FF00',
}
```

**New Map Location:**
```typescript
// In MapScene.ts createMapNodes()
{
  id: 'barn_1',
  name: 'Abandoned Barn',
  x: width * 0.8,
  y: height * 0.5,
  type: 'scrapyard',
  color: 0x654321,
}
```

## Future Enhancements

### Content & Visuals
- [ ] Real car images and sprites (Pixel art or stylized)
- [ ] Sound effects and music (Auction ticking, garage ambience)
- [ ] Car history stories and lore (Generated descriptions for "Hidden Gems")

### Gameplay Mechanics
- [ ] **The Forger Specialist:** A 3rd restoration option to hide accident history (High Risk / High Reward).
- [ ] **Direct Trading:** Mechanics to swap cars with Rivals based on their Wishlists (e.g., 2-for-1 deals).
- [ ] **Special Events:** Random map nodes like "Police Auctions" or "Barn Find Rumors."
- [ ] **Prestige System Effects:** Unlocking VIP Auctions and "Black Book" intel based on reputation.

### Systems
- [ ] Enhanced UI: Better car inspection screens and auction animations.

## License

MIT - Build something cool!
