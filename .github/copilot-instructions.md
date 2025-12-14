## The Curator — AI Agent Instructions

These instructions make AI agents immediately productive in this Phaser + DOM hybrid project. Keep changes minimal, follow existing patterns, and reference the files noted here.

## Primary Instruction Sources
- Architecture & UI rules: `.github/instructions/architecture.instructions.md`
- Game design & core loop: `.github/instructions/game-design.instructions.md`
- TypeScript rules: `.github/instructions/typescript-5-es2022.instructions.md`

## Developer Workflow
- Run dev server: `npm run dev` (Vite on :3000).
- Scene lifecycle: implement `init(data?)` for inputs, always implement `create()`; access `this.add`, `this.scene`, `this.cameras` only after Phaser initializes.
- Path alias: use `@/` for `src/` (see `tsconfig.json`, `vite.config.ts`). TypeScript strict; avoid `any`.

## File Map
- `src/core/event-bus.ts`, `src/core/game-manager.ts` — Singletons and state.
- `src/systems/*` — Logic: economy, rival AI, time.
- `src/data/*` — Static content and helpers.
- `src/scenes/*` — Phaser scenes + UI orchestration.
- `src/ui/ui-manager.ts` — DOM UI factory.

## Key Patterns
- UI: build via `UIManager` in `create()`, clear on scene entry.
- State: mutate `GameManager` via methods only; listen to events on `EventBus`.
- Scene transitions: use `this.scene.start('SceneName', data)`.
- Assets: use colored primitives as placeholders; avoid loading non-existent files.

## Design Documents
- Game design rules and tuning: `.github/instructions/game-design.instructions.md`
- Architecture constraints: `.github/instructions/architecture.instructions.md`

## Contribution Guidelines
- Update architecture or design docs when introducing code changes.

## Question the Design (Encouraged!)
When working on implementation, you are encouraged to critically evaluate the design documents:

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

## Docs Drift Checklist
When you change behavior (rules, costs, flows) update the docs in the same PR.

- If you change game rules, timing, encounters, economy, or progression:
	- Update `.github/instructions/game-design.instructions.md` to match.
- If the change affects how the game plays or how to run it:
	- Update `README.md` (it is the human-facing overview).
- If the change affects structure, scene flow, or UI layering:
	- Update `.github/instructions/architecture.instructions.md`.
- Quick self-check before finishing:
	- Search for stale numbers/strings (e.g., time costs, rent, skill gates) and fix mismatches.

## TypeScript Guidelines
- Type declaration files: https://www.typescriptlang.org/docs/handbook/declaration-files/do-s-and-don-ts.html
- JSDoc supported types: https://www.typescriptlang.org/docs/handbook/jsdoc-supported-types.html

## Additional Resources
- Phaser 3 Docs: https://phaser.io/phaser3
- Vite Docs: https://vitejs.dev/guide/
- TypeScript Docs: https://www.typescriptlang.org/docs/

