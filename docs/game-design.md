---
name: Game Design - The Curator
description: Game design rules and core loop specification for The Curator
applyTo: "**"
---

## GAME DESIGN: THE CURATOR (RULES)

This document covers gameplay rules; implementation constraints (Phaser/DOM split, state/events, scene boundaries) live in `docs/architecture.md`.

## High Concept
You are an aspiring car collector starting with a single garage slot. Your goal is to curate the world’s most prestigious car museum.

This game is not about driving physics; it is about **Access, Valuation, and Timing**.

You are not alone: intelligent **NPC Rivals** actively hunt the same cars. You must outbid, outsmart, and outmaneuver them to secure the rarest vehicles in history.

## Core Loop
1. **Morning Phase:** Start in Garage. Check news/intel.
2. **Map Phase (The Day Loop):** Travel to nodes. Costs 1 Action Point (AP).
3. **Encounter Phase:**
   - If rival present -> Auction (turn-based battle, costs 2 AP).
   - If solo -> Negotiation (menu choices using Player Stats, costs 1 AP).
   - **Outcome:** Return to Map (continue day) or Return to Garage (if
     inventory full/day ends).
4. **Garage Phase:** Restore cars (3-5 AP), sell inventory, or end day.

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

## Persistence & Progression

### Save/Load System
- **Persistence:** Game state is automatically saved to localStorage on every state mutation.
- **Manual Save/Load:** Players can manually save/load game state via buttons in the Garage scene.
- **Saved Data:** Player money, prestige, inventory, garage slots, current day/time, and museum display status.

### Garage Expansion
- **Starting Capacity:** 1 garage slot.
- **Upgrade Mechanics:** Prestige-based upgrades unlock additional slots (up to 5 total).
- **Upgrade Costs:** Slot 2: 100 prestige, Slot 3: 200 prestige, Slot 4: 400 prestige, Slot 5: 800 prestige.
- **Garage Full:** Players cannot acquire new cars when garage is full; must sell or scrap existing cars first.

### Museum Display Mechanic
- **Eligibility:** Cars with condition >= 80% can be displayed in the museum.
- **Passive Prestige:** Displayed cars generate prestige based on quality tiers:
  - Good (80-89%): +1 prestige/day
  - Excellent (90-99%): +2 prestige/day
  - Perfect (100%): +3 prestige/day
- **Management:** Players can toggle cars between garage storage and museum display.
- **Capacity:** Museum display slots are unlimited (no hard cap).

### Car Collections System
- **Collection Sets:** Players can complete themed collections for one-time prestige bonuses:
  - **JDM Legends** (5 JDM cars): +50 prestige
  - **Muscle Masters** (5 Muscle cars): +50 prestige
  - **European Elite** (5 European cars): +50 prestige
  - **Exotic Collection** (4 Exotic cars): +75 prestige
  - **Classics Curator** (6 Classic cars): +60 prestige
- **Auto-Detection:** Collections automatically check for completion when cars are added to inventory.
- **Museum Integration:** Collection progress displayed in museum view.
- **Total Reward Potential:** +285 prestige from all collections.

## Data Structures

### Player (The RPG Layer)
- `money`: number (Start: $8,000)
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
- **Action Points (AP):** Every meaningful action consumes Action Points.
- **Day Cycle:**
  - Each day starts with **18 Action Points** (rebalanced from 15 for better pacing)
  - Day ends when AP reaches 0 or player returns to garage
- **Constraints:**
  - Every action costs AP (1-5 AP depending on complexity).
  - If `currentAP < actionCost`: the action is **blocked** and the player must
    end the day.
- **Next Day:** When the player chooses "End Day" (or is forced to), `day`
  increments, `currentAP` resets to **10**, daily expenses are deducted, and
  the map resets.
- **Daily Costs:**
  - **Daily Rent:** Scales with garage capacity (balanced to avoid mid-game bankruptcies):
    - 1 slot: $100/day
    - 2 slots: $150/day
    - 3 slots: $250/day
    - 4 slots: $400/day
    - 5 slots: $600/day
  - No debt: `money` never goes below $0.
  - If you can’t afford rent, you must raise cash before ending the day:
    - Sell a car (if you have one), or
    - Take a bank loan (if one is available).
  - If you still can’t pay rent, you are **bankrupt** and it is **Game Over**.
  - Bank loan: a one-time emergency loan that adds cash immediately.
- **Market Trends:** Periodic modifiers can shift prices by category (e.g., seasonal demand affecting convertibles).

**Implementation Note:** Market fluctuations are active with seasonal trends and random events:
- **Seasons:** Winter reduces convertible/sports prices, summer boosts sports/muscle prices, etc.
- **Events:** Random "boom/bust" periods (10% chance daily) and "niche boom" events (15% chance)
- **Display:** Current market conditions shown in HUD across all scenes

### Special Events System
Special Events add dynamic variety to the exploration phase, appearing as temporary map nodes that offer unique opportunities.

- **Event Generation:** 15% chance per day for 1-2 special events to spawn on the map.
- **Event Types:**
  - **Estate Sale:** High-value cars at discounted prices (0.8x asking price multiplier).
  - **Barn Find:** Rare cars with guaranteed tags, but may have hidden damage.
  - **Private Collection:** Prestige cars with money bonuses upon purchase.
  - **Clearance Event:** Multiple cheap cars available at once.
- **Event Duration:** Events last 1-2 days before disappearing.
- **Rewards:** Events can provide bonuses like money rewards, prestige boosts, or guaranteed car tags.
- **Time Cost:** Visiting special events costs inspection time (30 minutes) instead of travel time.
- **No Rivals:** Special events are always solo encounters (no auctions).

**Implementation Note:** Special events are generated daily in GameManager.endDay(), stored in SpecialEventsSystem, and displayed as dynamic nodes in MapScene.

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

**Implementation Note:** Tier progression is active - rivals are selected based on player prestige:
- 0-49 prestige: Tier 3 only (Scrappers)
- 50-149 prestige: Tier 2-3 (75% Enthusiasts, 25% Scrappers)  
- 150+ prestige: All tiers (60% Tycoons, 20% Enthusiasts, 20% Scrappers)

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
  - Stall (Tongue 2+, limited uses per auction = Tongue level; reduces Rival Patience)
  - **Kick Tires** (reduces Rival Budget; requires 'Eye' skill)
- **Rival AI:**
  - If `currentBid > budget`: quit.
  - If `patience <= 0`: quit.
  - Else: bid.

### Auction Notes (Implementation-Friendly)
- The player cannot bid above their available `money`.
- Treat the Auction "stress" concept as operating on `patience` (i.e., actions that add stress reduce `patience`) so the Rival data model stays minimal.

### Encounter Rule
- If a Rival is present at a location, the encounter is an Auction (regardless of which node you visited).

## Restoration Logic (Specialists)
- **Cheap Charlie:** Low Cost / High Speed / Risk of Value Drop.
- **The Artisan:** High Cost / Low Speed / Value Multiplier.

### Restoration UI
- **Card-Based Selection:** Players choose specialists via an interactive card layout showing:
  - Specialist name and description
  - Cost (money) and AP cost
  - Expected condition gain
  - **Profit Preview:** Estimated profit/loss and ROI percentage calculated before committing
  - Risk warnings (if applicable, e.g., Cheap Charlie's potential value loss)
- **Informed Decision-Making:** The profit preview simulates the restoration outcome and compares future sale value against current value minus restoration costs, helping players choose the most profitable specialist.

### Restoration Abstraction
- Do **not** implement individual parts (Tires/Engine/Paint) as separate
  systems.
- Restoration actions are abstracted to:
  - **Minor Service:** `+10` condition
  - **Major Overhaul:** `+30` condition

#### Restoration AP Costs
- **Minor Service:** 2 AP (reduced from 3 for better pacing)
- **Major Overhaul:** 4 AP (reduced from 5 for better pacing)

### Garage Rules
- **Garage capacity:** Starts at 1 slot (upgradeable).
- If the player attempts to buy a car while the Garage is full: show error
  **"Garage Full - Sell or Scrap current car first."**
- **Softlock prevention:** Add a **"Sell As-Is"** option in the Garage.
  - Sell value: `sellAsIsValue = carValue × 0.7`.

## Action Point Costs
- **Travel:** 1 AP
- **Inspect:** 1 AP
- **Auction:** 2 AP
- **Restore (Minor Service):** 2 AP (reduced from 3)
- **Restore (Major Overhaul):** 4 AP (reduced from 5)

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
- Dialogue: Uncle Ray welcomes you and instructs you to go to the Map and visit Joe's Scrapyard.
- Action: Go to Scrapyard. Enter inspection screen for "Rusty Sedan."
- Mechanic: **The Eye** skill works passively - your level determines what details you see. At level 1, you only see basic info (condition: 30%). At level 2+, you'd see damage history (rust, bald tires).
- Action: Accept the asking price (~$350-$400 based on car's poor condition). Purchase completes; you gain Eye XP automatically for inspecting.

### Minute 2–4: Restoration
- Action: Return to Garage. Uncle Ray guides you to view your Inventory.
- Action: Select the Rusty Sedan and choose restoration service.
- Choice: Assign the car to **"Cheap Charlie's Quick Fix"** (Low Cost, Fast,
  Risky).
- Action: Perform a **Minor Service** (3 AP). Car condition improves
  significantly. Value increases.
- Tutorial override: this first restoration always succeeds (ignore Cheap
  Charlie's risk).

### Minute 4–6: The Flip
- Action: After restoration completes, an NPC buyer automatically appears with an offer.
- Result: You sell the car for profit. Bank account grows; the profit loop is understood.
- Tutorial advances: Uncle Ray encourages you to return to the map for the next challenge.

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