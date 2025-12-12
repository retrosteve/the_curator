---
name: Game Design - The Curator
description: Game design rules and core loop specification for The Curator
applyTo: "**"
---

## GAME DESIGN: THE CURATOR (RULES)

This document covers gameplay rules; implementation constraints (Phaser/DOM split, state/events, scene boundaries) live in `.github/instructions/architecture.instructions.md`.

## High Concept
You are an aspiring car collector starting with a single garage slot. Your goal is to curate the world’s most prestigious car museum.

This game is not about driving physics; it is about **Access, Valuation, and Timing**.

You are not alone: intelligent **NPC Rivals** actively hunt the same cars. You must outbid, outsmart, and outmaneuver them to secure the rarest vehicles in history.

## Core Loop
1. **Morning Phase:** Start in Garage. Check news/intel.
2. **Map Phase (The Day Loop):** Travel to nodes. Costs time (1 Hour).
3. **Encounter Phase:**
   - If rival present -> Auction (turn-based battle).
   - If solo -> Negotiation (menu choices using Player Stats).
   - **Outcome:** Return to Map (continue day) or Return to Garage (if inventory full/day ends).
4. **Garage Phase:** Restore cars, sell inventory, or end day.

### Expanded Loop (Target)
The game is played across **Days** and **Weeks**. The player manages **Cash**, **Time**, and **Prestige**.

- **Phase 1: The Morning Paper (Intel)**
  - **The Map:** The city is a board with Nodes (Dealerships, Scrapyards, Docks, Barns).
  - **The Decision:** Icons appear on nodes indicating leads. You have limited time per day.
  - **The Conflict:** Rivals move on the map. If a Rival reaches a node before you, the car might be gone or the price can spike.
- **Phase 2: The Acquisition (Action)**
  - **Encounter:** When you arrive at a car, the view switches to a 2D static scene.
  - **Negotiation (PvE):** If alone, you use RPG skills to haggle with the seller and/or inspect for hidden damage.
  - **Auction (PvP):** If a Rival is present, you enter a turn-based Bidding War. You manage your budget against the Rival’s **Patience** and **Budget**.
- **Phase 3: The Garage (Management)**
  - **Restoration:** Spend Time + Money on restoration services. This increases the car’s condition.
  - **The Choice:**
    - **Flip:** Sell immediately for Cash (operating capital).
    - **Hold:** Keep in the Museum for Prestige (unlocks better access over time).

## Data Structures

### Player (The RPG Layer)
- `money`: number (Start: $5,000)
- `prestige`: number (Start: 0)
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
- `id`: string
- `name`: string
- `tier`: 1 | 2 | 3 (1 = Tycoon, 2 = Enthusiast, 3 = Scrapper)
- `budget`: number
- `patience`: number (0-100)
- `wishlist`: string[] (tags they target)
- `strategy`: "Aggressive" | "Passive" | "Collector"

## Game Systems

### Economy & Time
- **Currencies:** Cash ($) and Prestige (Reputation).
- **Concept (The Action Budget):** Time is the player’s primary resource.
- **Time Units:** Every meaningful action advances the clock.
- **Day Cycle:**
  - Day Starts: **08:00**
  - Day Ends: **20:00**
  - Total Budget: **12 Hours** per day
- **Constraints:**
  - Every action adds to `currentHour`.
  - If `currentHour + actionCost > 20:00`: the action is **blocked** and the player is forced to end the day.
- **Next Day:** When the player chooses "End Day" (or is forced to), `day` increments, `currentHour` resets to **08:00**, daily expenses are deducted, and the map resets.
- **Daily Costs:**
  - **Daily Rent:** $100 (paid during the Next Day transition).
  - If `money < 0` after rent: the game continues.
  - **Debt cap:** allow debt down to **-$500**.
- **Market Trends (Future):** Periodic modifiers can shift prices by category (e.g., seasonal demand affecting convertibles).

### Rival System (AI)
Rivals are described by two orthogonal ideas:

- **Tier** (Scrapper/Enthusiast/Tycoon): progression + typical budget scale and target rarity.
- `strategy` (**Aggressive** | **Passive** | **Collector**): tactical bidding behavior and decision-making.

Numeric tiers are intentionally inverted: **Tier 3** is early-game/easiest (Scrappers) and **Tier 1** is late-game/hardest (Tycoons).

NPCs can be organized into tiers with distinct archetypes:

- **Tier 3 (Early Game): The Scrappers**
  - Behavior: Buy cheap, common cars; easy to outbid.
- **Tier 2 (Mid Game): The Enthusiasts**
  - Behavior: Niche collectors (e.g., “only buys Muscle”); may overpay within their niche.
- **Tier 1 (End Game): The Tycoons**
  - Behavior: Massive budgets; may control “Unicorns.” The player’s path is strategy (timing, trades, forcing exits), not pure bidding.

`strategy` examples (can apply at any tier):

- **Aggressive:** Raises often; spends patience to pressure opponents.
- **Passive:** Holds budget; bids only when value is clearly favorable.
- **Collector:** Overpays within `wishlist` tags; deprioritizes cars outside the collection.

### Player Stats (RPG Elements)
As the player levels up, they improve three core tools:

1. **The Eye (Appraisal)**
   - Lvl 1: Sees price and model.
   - Lvl 5: Sees hidden damage and a more accurate market value.
2. **The Tongue (Negotiation)**
   - Lvl 1: Basic bid/pass and simple negotiation.
   - Lvl 5: Unlocks stronger options (e.g., aggressive raise / bluff / charm) to manipulate Rival patience.
3. **The Network (Intel)**
   - Lvl 1: Mostly public opportunities.
   - Lvl 5: Earlier visibility into rare/private leads (e.g., barn finds, private sales).

## Auction Battle (Logic)
- Turn-based.
- **Player actions:**
  - Bid (+$100)
  - Power Bid (+$500, reduces Rival Patience)
  - Stall (reduces Rival Patience)
  - **Kick Tires** (reduces Rival Budget; requires 'Eye' skill)
- **Rival AI:**
  - If `currentBid > budget`: quit.
  - If `patience <= 0`: quit.
  - Else: bid.

### Auction Notes (Implementation-Friendly)
- The player cannot bid above their available `money`.
- Treat the Auction "stress" concept as operating on `patience` (i.e., actions that add stress reduce `patience`) so the Rival data model stays minimal.

## Restoration Logic (Specialists)
- **Cheap Charlie:** Low Cost / High Speed / Risk of Value Drop.
- **The Artisan:** High Cost / Low Speed / Value Multiplier.

### Restoration Abstraction
- Do **not** implement individual parts (Tires/Engine/Paint) as separate systems.
- Restoration actions are abstracted to:
  - **Minor Service:** `+10` condition
  - **Major Overhaul:** `+30` condition

#### Restoration Time Costs
- **Minor Service:** 4 Hours
- **Major Overhaul:** 8 Hours

### Garage Rules
- **Garage capacity:** Starts at 1 slot (upgradeable).
- If the player attempts to buy a car while the Garage is full: show error **"Garage Full - Sell or Scrap current car first."**
- **Softlock prevention:** Add a **"Sell As-Is"** option in the Garage.
  - Sell value: `sellAsIsValue = carValue × 0.7`.

## Time Costs (The Economy)
- **Travel:** 1 Hour
- **Inspect:** 30 Mins
- **Auction:** 2 Hours
- **Restore (Minor Service):** 4 Hours
- **Restore (Major Overhaul):** 8 Hours

## Car Progression Tiers (Design)
- **Tier 1: Daily Drivers** (grind cash via flips)
- **Tier 2: Cult Classics** (trade leverage; mid-tier rival battles)
- **Tier 3: Icons** (prestige museum anchors)
- **Tier 4: Unicorns** (win-condition vehicles)

## Valuation & Costs (Implementation-Friendly)
- **Valuation Math:** `carValue = (baseValue × (condition/100)) × historyMultiplier`.
- **History multipliers:**
  - `Flooded` = `0.5`
  - `Rust` = `0.7`
  - `Mint` = `1.25`
- **Default history multiplier:** `1.0` ("Standard") if `car.history` is empty or contains no recognized tags.
- **History resolution rule (when multiple tags exist):** `historyMultiplier` is the **minimum** multiplier from all recognized entries in `car.history` ("worst tag wins").
- **Profit Math (Restoration Cost):** `restorationCost = conditionGain × baseValue × 0.005`.

## Tutorial Script (First ~10 Minutes)

### Minute 0–2: The Setup
- Scene: Dirty Garage. Mentor: “Uncle Ray.”
- Action: Go to Scrapyard. Inspect “Rusty Sedan.”
- Mechanic: Use **The Eye** to spot bald tires. Buy the car for $1,500.

### Minute 2–4: Restoration
- Action: In Garage, open the Restoration Menu.
- Choice: Assign the car to **"Cheap Charlie"** (Low Cost, Fast).
- Mechanic: Perform a **Minor Service** (4 Hours). Car condition improves. Value increases.
- Tutorial override: this first restoration always succeeds (ignore Cheap Charlie’s risk).

### Minute 4–6: The Flip
- Action: List car on market. NPC buys it.
- Result: Bank account grows; the profit loop is understood.

### Minute 6–8: The Defeat
- Action: Travel to an Estate Sale for a Muscle Car.
- Encounter: Meet Rival “Sterling Vance.”
- Conflict: Vance outbids you.
- Lesson: You can’t win on money alone; you need timing and strategy.

### Minute 8–10: The Redemption
- Action: Spot a second, ignored car at the same sale (a “Boxy Wagon”).
- Conflict: Battle a low-level Scrapper NPC.
- Mechanic: Use **The Tongue** (aggressive bid) to force the NPC to quit.
- Result: You win the car; tutorial ends.

## Development Checklist

### Assets Needed (Art)
- [ ] Backgrounds: Garage, City Map, Scrapyard, Suburbs
- [ ] Car Sprites: Sedan (Rusty/Clean), Wagon (Clean), Muscle Car (Silhouette)
- [ ] UI: Cash Counter, Clock, Action Bar (Bid, Inspect)
- [ ] Portraits: Uncle Ray, Sterling Vance (Rival), Scrapyard Joe (Rival)

### Data Structures (Code)
- [ ] Car model (example shape):
  ```ts
  type Car = {
    id: string;
    name: string;
    baseValue: number;
    condition: number; // 0-100
    tags: string[];
    history: string[];
  };
  ```
- [ ] Rival bidding rule of thumb:
  ```ts
  if (currentBid > rival.budget) return "quit";
  if (rival.patience <= 0) return "quit";
  return "bid";
  ```

### Game States
- [ ] Map State: moving cursor, clicking nodes
- [ ] Encounter State: static screen, dialogue box, buttons
- [ ] Garage State: menu for repairs and selling