# The Curator

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
- View your car inventory
- Restore cars (costs money + time)
- Sell cars for profit
- End day mechanic

### ✅ Map Scene
- Three explorable locations:
  - **Joe's Scrapyard** (Travel: 1 hour) - Find project cars
  - **Classic Car Dealership** (Travel: 1 hour) - Browse inventory
  - **Weekend Auction House** (Travel: 1 hour) - May trigger an auction
- Time costs follow the rules:
  - **Travel:** 1 hour
  - **Inspect (solo negotiation):** 30 mins
  - **Auction:** 2 hours
- Random encounters

### ✅ Auction Scene
Turn-based bidding battles against AI rivals:
- **Bid** (+$100) - Standard bid
- **Power Bid** (+$500, -20 Rival Patience) - Aggressive bid
- **Kick Tires** (-$500 Rival Budget, requires Eye skill) - Undercut their spending power
- **Stall** (-20 Rival Patience) - Psychological warfare
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
- For game design rules (core loop, data shapes, auction logic), see [.github/instructions/GAME_DESIGN.instructions.md](.github/instructions/GAME_DESIGN.instructions.md).
- For contributor/agent workflow conventions, see [.github/copilot-instructions.md](.github/copilot-instructions.md).

## How to Play

1. **Start in Garage** - Your home base
2. **Visit Map** - Explore locations to find cars
3. **Encounters**:
   - Solo negotiations - Simple buy/pass decisions
   - Auctions - Strategic bidding against rivals
4. **Restore Cars** - Improve condition to increase value
5. **Sell for Profit** - Fund your museum
6. **End Day** - Rest and start fresh

## Game Mechanics

### Car System
- Each car has:
  - **Name** - e.g., "1969 Dodge Charger"
  - **Condition** (0-100) - Affects value
  - **Base Value** - Starting worth
  - **Tags** - Muscle, JDM, Classic, etc.
  - **History** - Barn Find, Rust, Modified, etc.

### Restoration
- Cost = `conditionGain × baseValue × 0.01`
- Time = `conditionGain × 0.5 hours`
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
  timeCost: 4,
  color: 0x654321,
}
```

## Future Enhancements

### Content & Visuals
- [ ] Real car images and sprites (Pixel art or stylized)
- [ ] Sound effects and music (Auction ticking, garage ambience)
- [ ] Car history stories and lore (Generated descriptions for "Hidden Gems")

### Gameplay Mechanics
- [ ] **Rival Progression Tiers:** Implement distinct leagues (Tier 3: Scrappers, Tier 2: Enthusiasts, Tier 1: Tycoons).
- [ ] **The Forger Specialist:** A 3rd restoration option to hide accident history (High Risk / High Reward).
- [ ] **Direct Trading:** Mechanics to swap cars with Rivals based on their Wishlists (e.g., 2-for-1 deals).
- [ ] **Museum Mechanic:** A visual gallery to display "Icon" tier cars for passive Prestige gain.
- [ ] **Market Fluctuations:** Dynamic price changes based on trends (e.g., "Winter" lowers Convertible prices).
- [ ] **Multiple Garage Slots:** Upgradeable storage to hold more inventory.

### Systems
- [ ] Save/load game state (Persistence).
- [ ] Special Events: Random map nodes like "Police Auctions" or "Barn Find Rumors."
- [ ] Prestige System Effects: Unlocking VIP Auctions and "Black Book" intel based on reputation.

## License

MIT - Build something cool!
