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
- **Car Collections:** Track and complete themed collections for prestige bonuses
- Restore cars (costs money + time)
- Sell cars for profit
- Upgrade garage capacity (costs prestige, with rent increase warning)
- **Skill Progress Bars:** Hover for detailed tooltips showing what each level unlocks
- Save/Load game progress
- End day mechanic

### ✅ Victory Progress Tracker
- Persistent HUD display showing all 4 win conditions:
  - Prestige progress (500 required)
  - Unicorn cars in museum (2 required)
  - Total museum cars (8 required)
  - Skill mastery level (4 required)
- Click tracker for detailed breakdown
- Visual checkmarks when conditions are met

### ✅ Map Scene
- Three explorable locations:
  - **Joe's Scrapyard** (Travel: 1 AP) - Find project cars
  - **Classic Car Dealership** (Travel: 1 AP) - Browse inventory
  - **Weekend Auction House** (Travel: 1 AP)
- **Special Events:** Dynamic temporary locations (15% daily chance) with
  unique opportunities:
  - Estate Sales (discounted high-value cars)
  - Barn Finds (rare cars with guaranteed tags)
  - Private Collections (prestige cars with bonuses)
  - Clearance Events (multiple cheap cars)
- Action Point costs:
  - **Travel:** 1 AP
  - **Inspect (solo negotiation):** 1 AP
  - **Auction:** 2 AP
- Random encounters:
  - If a rival is present, the encounter becomes an **Auction** (from any
    location).
  - If no rival is present, the encounter is a **Negotiation**.
  - Special events are always solo encounters (no auctions).

### ✅ Auction Scene
Turn-based bidding battles against AI rivals:
- **Rival Tiers:** Progressive difficulty (Scrappers → Enthusiasts → Tycoons) based on prestige
- **Enhanced Tactics:** 
  - **Bid** (+$100) - Standard bid
  - **Power Bid** (+$500, -20 Rival Patience) - Aggressive bid with combo streak tracking
  - **Kick Tires** (-$500 Rival Budget, requires Eye skill) - Undercut their spending power
  - **Stall** (Tongue 2+, limited uses = Tongue level, -20 Rival Patience) - Psychological warfare
  - **Quit** - Walk away
- **Combo System:** Consecutive Power Bids create combos (🔥 COMBO x3!)
- **Stress Animations:** Rival patience bar shakes when low, with status messages
- **Post-Auction Recap:** Shows victory type (Psychological/Financial/Strategic) and tactics used
- **Rival AI:** Patience and budget determine when rivals quit
- **Market Fluctuations:** Dynamic pricing based on seasons and random events

Rivals have unique:
- Budgets
- Patience levels
- Strategies (Aggressive, Passive, Collector)
- Car preferences (wishlist tags)

### ✅ Core Systems
- **Economy** - Value calculations, restoration costs, balanced rent scaling
- **Time Management** - 15 Action Points per day, action costs
- **Player State** - Money, inventory, prestige, skills (Eye/Tongue/Network)
- **Car Collections** - 5 themed sets with prestige rewards (total +285 prestige)
- **Victory Tracker** - Real-time progress toward becoming master curator
- **Save/Load** - Persistent game progress via localStorage
- **Event System** - Decoupled communication

### 🎮 Car Database
- **43 Total Cars** across 4 tiers (Daily Drivers, Cult Classics, Icons, Unicorns)
- Variety of tags: JDM, Muscle, European, Exotic, Classic, and more
- Weighted random spawns favor lower tiers for balanced progression

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
- For strict architecture constraints (used by tooling/agents), see [docs/architecture.md](docs/architecture.md).
- For game design rules (core loop, data shapes, auction logic), see [docs/game-design.md](docs/game-design.md).
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
- **Upgrade Cost (Prestige):** 100 (1→2), 200 (2→3), 400 (3→4), 800 (4→5), 1000 (5→6), 1200 (6→7), 1400 (7→8), 1600 (8→9), 1800 (9→10)
- **Maximum:** 10 slots
- Cannot buy cars when garage is full
- Shows current usage in HUD: "🏠 Garage: 2/3"

### Museum Mechanic
- **Museum Cars:** Cars with condition ≥80%
- **Daily Prestige Bonus:** +1 prestige per museum car when you end the day
- **Purpose:** Encourages long-term car restoration and collection building
- **Display:** View museum in garage to see your collection

### Save/Load System
- **Auto-Save:** Game state automatically saves to browser localStorage when you **End Day** (end-of-day checkpoint)
- **Manual Save/Load:** Buttons in garage scene for explicit save/load operations
- **Saved Data:** Money, prestige, inventory, garage slots, day/time, museum display status

### Restoration
- Two restoration services are available (AP cost is a major resource):
  - **Cheap Charlie (Minor Service):** +10 condition, 3 AP, low cost, small
    risk
  - **The Artisan (Major Overhaul):** +30 condition, 5 AP, high cost
- Max condition: 100

### Rival AI Strategies
- **Aggressive** - High bids, low patience
- **Passive** - Small bids, high patience
- **Collector** - Targets specific tags

## Development Notes

### Architecture

For strict architecture constraints, see
[docs/architecture.md](docs/architecture.md).

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
