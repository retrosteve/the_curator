## The Curator — AI Agent Instructions

These instructions make AI agents immediately productive in this Phaser + DOM hybrid project. Keep changes minimal, follow existing patterns, and reference the files noted here.

## Project Overview & Patterns
- **Hybrid Architecture:** We use Phaser 3 for the game loop/rendering and HTML/CSS (via `UIManager`) for all UI. Phaser Text objects are allowed for in-world spatial labels (like map markers), but all menus, buttons, and dialogs must use DOM.
- **State Management:** `GameManager` is the singleton source of truth. Do not mutate state directly; use its methods.
- **Communication:** Use `eventBus` for decoupling Scenes and Systems.
- **Language:** TypeScript 5.x targeting ES2022. Strict typing is enforced.

## Key Directories
- `src/scenes/`: Phaser scenes (Garage, Map, Auction, etc.).
- `src/systems/`: Game logic (Economy, Time, Rivals).
- `src/ui/`: DOM-based UI management (`UIManager`).
- `src/core/`: Core singletons (`GameManager`, `EventBus`).
- `src/data/`: Static data definitions (Cars, Rivals).
- `docs/`: Design and Architecture documentation.

## Question the Design (Encouraged!)
When working on implementation, you are encouraged to critically evaluate the design documents (`docs/game-design.md` and `docs/architecture.md`):

- **Ambiguities:** If a design rule is unclear, vague, or has missing details, point it out and propose clarification.
- **Inconsistencies:** If you find contradictions between design docs or between docs and code, flag them.
- **Better Alternatives:** If you see a better way to implement something (better UX, simpler architecture, improved balance), suggest it with reasoning.
- **Balance Issues:** If game design values seem problematic (too easy, too hard, exploitable), question them.
- **Missing Edge Cases:** If the design doesn't cover an important scenario, raise it.

**Format:** When questioning design, clearly state:
1. What the design says (or doesn't say)
2. Why it's problematic or unclear
3. Your proposed solution or question

Design docs are living documents. Your feedback improves the game.

## Code Review Guidelines (CRITICAL)
When conducting code reviews, you MUST verify issues before reporting them:

**DO:**
- **Trace execution paths** - Follow the actual code flow before claiming something is broken
- **Check for existing protections** - Look for guards, validation, and error handling already in place
- **Understand patterns** - Recognize intentional design patterns (singleton, observer, factory) before calling them problems
- **Verify with examples** - Trace through specific scenarios to confirm bugs actually occur
- **Distinguish bugs from style** - Only flag actual defects, not just alternative approaches
- **Test your claims** - If you claim something can fail, trace through the scenario that would cause it

**DON'T:**
- **Assume bugs without verification** - Don't flag potential issues without confirming they're real
- **Confuse design choices with defects** - Singletons, God objects, and monolithic files may be intentional
- **Flag micro-optimizations** - Don't mention minor performance tweaks unless they're actually impacting the game
- **Report theoretical edge cases** - Only flag edge cases that can realistically occur
- **Question working code** - If event cleanup works, cache invalidation works, or state management works, don't claim it's broken

**Verification Checklist Before Flagging an Issue:**
1. Can I trace the exact code path that causes this bug?
2. Have I checked if there's already protection/validation for this case?
3. Is this a real defect or just a different design approach?
4. Would fixing this actually improve the code or just change the style?
5. Is this theoretical or does it affect actual gameplay?

**When in doubt, DON'T report it.** False positives waste time and create doubt about working code.

## Docs Drift Checklist
When you change behavior (rules, costs, flows) update the docs in the same PR.

- If you change game rules, timing, encounters, economy, or progression:
	- Update `docs/game-design.md` to match.
- If the change affects how the game plays or how to run it:
	- Update `README.md` (it is the human-facing overview).
- If the change affects structure, scene flow, or UI layering:
	- Update `docs/architecture.md`.
- Quick self-check before finishing:
	- Search for stale numbers/strings (e.g., time costs, rent, skill gates) and fix mismatches.
