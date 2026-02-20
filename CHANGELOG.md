# Changelog

## 1.8.0 - 2026-02-20

### Added
- Injury automation on weapon damage application: when Toughness is reduced to 0, the system auto-posts a CRITICAL WOUND card with a Roll Injury button.
- Injury roll flow from chat cards (`1d6 + damage taken`) with immediate Injury Table resolution (Stunned, Bleeding, Incapacitated/Lethal).
- Magic mishap automation for Magic/Spell rolls: automatic mishap trigger detection on natural `1`s plus a prominent warning block and Mishap roll button.
- Mishap table chat resolution (`1d6`) with structured mishap outcomes for fast adjudication during play.
- Resting controls on actor sheets: `Take a Breather` (restore Adrenaline) and `Standard Rest` (restore Adrenaline and Toughness, plus rest notification in chat).
- Core Laundry condition set override at init via `CONFIG.statusEffects` (Blinded, Prone, Stunned, Weakened) using Foundry core SVG icons.
- Local package update quality-of-life in build tooling: zip builder now also produces `laundry-rpg.zip` for local update workflows.

## 1.6.0 - 2026-02-20

### Added
- Advanced combat automation with attack DN auto-calculation using The Ladder against targeted tokens.
- Themed pre-roll attack dialog with Focus and Adrenaline spend toggles.
- Rich dice chat cards with success counting, critical/complication highlighting, and automated damage apply actions.
- Combat Tracker spotlight visuals for the active combatant and actor sheet End Turn action.
- Universal dossier-style dialog theming (`.laundry-dialog`) for system dialogs and prompts.
- GM Threat Tracker app with global Threat Level controls, team Luck award action, and Business As Usual request action.
- KPI tab on character sheets with add/edit/delete/status tracking for performance objectives.
- Character Builder skill advancement docket with per-skill Training/Focus allocation and live XP accounting.

### Changed
- Character Builder now sanitizes assignment descriptions and uses case-insensitive partial compendium matching for skills/equipment.
- Assignment application now updates existing skill items safely and applies selected Training/Focus levels.
- Assignment parsing now supports `skillXP` budgets with sensible fallback defaults.
- Form 2B character initialization UI upgraded for improved usability and visual consistency.

### Fixed
- Prevented over-allocation of character creation skill XP with validation and automatic input clamping.
- Ensured assignment initialization messaging and warnings are fully localized.
