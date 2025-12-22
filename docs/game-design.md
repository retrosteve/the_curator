---
name: Game Design - The Curator
description: Game design rules and core loop specification for The Curator
applyTo: "**"
---

## GAME DESIGN: THE CURATOR (RULES)

This document covers gameplay rules; implementation constraints (Phaser/DOM split, state/events, scene boundaries) live in `docs/architecture.md`.

## High Concept
You are an aspiring car collector starting with a single garage slot. Your goal is to curate the world’s most prestigious private car collection.

This game is not about driving physics; it is about **Access, Valuation, and Timing**.

You are not alone: intelligent **NPC Rivals** actively hunt the same cars. You must outbid, outsmart, and outmaneuver them to secure the rarest vehicles in history.

## Core Loop
1. **Morning Phase:** Start in Garage. Check news/intel.
2. **Map Phase (The Day Loop):** Choose a node to visit. There is no separate travel AP cost; the AP cost is charged by the encounter type when you commit to the visit.
  - **Daily Offers:** Each non-special location has a single car offer per day (locked in for the day). Once you resolve the encounter (buy/win/leave/lose), that location is exhausted until tomorrow.
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
    - **Hold:** Add to Collection for Prestige (unlocks better access over time).

## Persistence & Progression

### Save/Load System
- **Persistence:** Game state is automatically saved to localStorage at the end of each day (end-of-day checkpoint).
- **Manual Save/Load:** Players can manually save/load game state via buttons in the Garage scene.
- **Saved Data:** Player money, prestige, inventory, garage slots, current day/time, and collection status.

### Garage Expansion
- **Starting Capacity:** 1 garage slot.
- **Upgrade Mechanics:** Prestige-based upgrades unlock additional slots (up to 10 total).
- **Upgrade Costs:**
  - Slot 2: 100 prestige
  - Slot 3: 200 prestige
  - Slot 4: 400 prestige
  - Slot 5: 800 prestige
  - Slot 6: 1000 prestige
  - Slot 7: 1200 prestige
  - Slot 8: 1400 prestige
  - Slot 9: 1600 prestige
  - Slot 10: 1800 prestige
- **Garage Full:** Players cannot acquire new cars when garage is full; must sell or scrap existing cars first.

### Private Collection Mechanic
- **Eligibility:** Cars with condition >= 80% can be added to your collection.
- **Passive Prestige:** Cars in your collection generate prestige based on quality tiers:
  - Good (80-89%): +1 prestige/day
  - Excellent (90-99%): +2 prestige/day
  - Perfect (100%): +3 prestige/day
- **Management:** Players can toggle cars between garage storage and their collection.
- **Garage vs Collection Slots:** Cars in the collection do **not** consume garage slots.
- **Capacity:** Collection capacity scales with garage capacity (collection slots = garage slots).
  - If the collection is full, you must remove a car from the collection before adding another.
  - If the garage is full, you must add a garage car to the collection (or sell one) before removing a car from the collection.

### Car Sets System
- **Sets:** Players can complete themed sets for one-time prestige bonuses:
  - **JDM Legends** (5 JDM cars): +50 prestige
  - **Muscle Masters** (5 Muscle cars): +50 prestige
  - **European Elite** (5 European cars): +50 prestige
  - **Exotic Collection** (4 Exotic cars): +75 prestige
  - **Classics Curator** (6 Classic cars): +60 prestige
- **Auto-Detection:** Sets automatically check for completion when cars are added to inventory.
- **Collection View Integration:** Set progress displayed in the collection view.
- **Total Reward Potential:** +285 prestige from all sets.

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
  increments, `currentAP` resets to **18**, daily expenses are deducted, and
  the map resets.
- **Daily Costs:**
  - **Daily Rent:** Scales with garage capacity (balanced to avoid mid-game bankruptcies):
    - 1 slot: $100/day
    - 2 slots: $150/day
    - 3 slots: $250/day
    - 4 slots: $400/day
    - 5 slots: $600/day
    - 6 slots: $850/day
    - 7 slots: $1150/day
    - 8 slots: $1500/day
    - 9 slots: $1900/day
    - 10 slots: $2400/day
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

- **Event Generation:** Checked at day end. If no event has spawned in the last 2+ days, there is a 30% chance to spawn 1 new special event.
- **Event Types:**
  - **Police Impound Auction** (`policeAuction`): discounted cars with risk tags; prestige bonus.
  - **Abandoned Barn Discovery** (`barnFind`): premium value multiplier with guaranteed tags; prestige bonus.
  - **VIP Collector Showcase** (`vipEvent`): very high value multiplier with large prestige bonus; short duration.
  - **Dealer Liquidation Sale** (`dealerClearance`): discounted cars plus a small money bonus; longer duration.
- **Event Duration:** Events expire after a small number of days (varies by type; currently 1-4 days).
- **Rewards:** Events can modify the generated car (e.g., guaranteed tags and value multipliers) and may grant money/prestige bonuses on purchase.
- **Time Cost:** Visiting special events costs a fixed Action Point cost (varies by event) and does not additionally charge the normal inspection cost.
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
- **Travel:** No separate cost (included in encounter AP)
- **Inspect:** 1 AP
- **Auction:** 2 AP
- **Restore (Minor Service):** 2 AP (reduced from 3)
- **Restore (Major Overhaul):** 4 AP (reduced from 5)

## Car Progression Tiers (Design)
- **Tier 1: Daily Drivers** (grind cash via flips)
- **Tier 2: Cult Classics** (trade leverage; mid-tier rival battles)
- **Tier 3: Icons** (prestige collection anchors)
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
- Action: Perform a **Minor Service** (2 AP). Car condition improves
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

Note: During the tutorial, the Auction House/Estate Sale location is accessible even if the normal Prestige unlock requirement has not been met.

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