## The Curator — AI Agent Instructions

These instructions make AI agents immediately productive in this Phaser + DOM hybrid project. Keep changes minimal, follow existing patterns, and reference the files noted here.

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
