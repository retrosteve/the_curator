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

## TypeScript Guidelines
- Type declaration files: https://www.typescriptlang.org/docs/handbook/declaration-files/do-s-and-don-ts.html
- JSDoc supported types: https://www.typescriptlang.org/docs/handbook/jsdoc-supported-types.html

## Additional Resources
- Phaser 3 Docs: https://phaser.io/phaser3
- Vite Docs: https://vitejs.dev/guide/
- TypeScript Docs: https://www.typescriptlang.org/docs/

