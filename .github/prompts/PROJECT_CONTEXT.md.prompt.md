---
agent: agent
---
# PROJECT: THE CURATOR
**Stack:** TypeScript, Phaser 3, Vite
**Style:** 2D Strategy / Management (No Physics, UI-Heavy)

## 1. ARCHITECTURE GUIDELINES (STRICT)
- **Engine:** Use Phaser 3 for the Game Loop and Rendering (Maps, Sprites).
- **UI Layer:** Do NOT use Phaser Text objects for complex UI. Use a separate HTML/CSS DOM Overlay for menus, buttons, and dialogue boxes.
- **State Management:** Use a central `GameManager` (Singleton) to hold Player State (Money, Inventory) and World State (Day, Time).
- **Assets:** Use simple colored Rectangles (Primitives) as placeholders for now. Do not try to load .png files that do not exist yet.

## 2. FOLDER STRUCTURE
/src
  /assets        (Images - currently empty)
  /core          (GameManager.ts, EventBus.ts)
  /data          (Static JSON: CarDatabase.ts, RivalDatabase.ts)
  /scenes        (Phaser Scenes: Boot, Garage, Map, Auction)
  /systems       (Logic: Economy.ts, RivalAI.ts, TimeSystem.ts)
  /ui            (HTML/CSS generation scripts)
  main.ts        (Entry Point)

## 3. GAME RULES (THE LOGIC)

### A. The Core Loop
1. **Map Phase:** Player clicks Nodes (Scrapyard, Dealership). Costs Time.
2. **Encounter Phase:**
   - If Rival present -> Auction (Turn-Based Battle).
   - If Solo -> Negotiation (Menu Choices).
3. **Garage Phase:** Player spends Money + Time to "Restore" cars (increases value).
4. **Sales:** Player sells "flipped" cars for profit to fund the museum.

### B. Data Structures
**Car Object:**
- `id`: string
- `name`: string
- `baseValue`: number
- `condition`: 0-100 (affects value)
- `tags`: string[] (e.g., "Muscle", "JDM")
- `history`: string[] (e.g., "Flooded", "Rust")

**Rival Object:**
- `name`: string
- `budget`: number
- `patience`: number (0-100)
- `wishlist`: string[] (Tags they target)
- `strategy`: "Aggressive" | "Passive" | "Collector"

### C. The Auction Battle (Logic)
- Turn-based.
- **Player Actions:** Bid (+$100), Power Bid (+$500, +Stress), Stall (-Patience).
- **Rival AI:**
  - If (CurrentBid > Budget): Quit.
  - If (Patience <= 0): Quit.
  - Else: Bid.

## 4. CURRENT GOAL
Build the "MVP" (Minimum Viable Product) consisting of:
1. A working Garage Scene (HTML UI).
2. A working Map Scene (Clickable Nodes).
3. A Car Data structure that persists between scenes.