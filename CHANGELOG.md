# Changelog

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
