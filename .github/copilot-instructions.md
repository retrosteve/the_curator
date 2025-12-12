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
- `src/core/EventBus.ts`, `src/core/GameManager.ts` — Singletons and state.
- `src/systems/*` — Logic: economy, rival AI, time.
- `src/data/*` — Static content and helpers.
- `src/scenes/*` — Phaser scenes + UI orchestration.
- `src/ui/UIManager.ts` — DOM UI factory.
