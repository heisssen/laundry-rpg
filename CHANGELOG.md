# Changelog

## 1.12.0 - 2026-02-20

### Added
- RollTable-backed automation scaffolding for Injury and Mishap resolution with world settings and GM-editable default tables.
- Opposed test resolver in chat cards (`Resolve Opposed`) that links two opposed rolls and writes Win/Lose/Tie outcomes to both messages.
- Weapon ammo support (`ammo`, `ammoMax`) with fire-mode automation (single/burst/auto/suppressive), ammo costs, and reload-aware flow.
- CI/CD release workflow at `.github/workflows/release.yml` for tag-based packaging and GitHub Releases publishing.

### Changed
- Damage application now supports multi-target snapshots for area attacks and applies trait-driven effects across targets.
- Condition application in dice automation now routes through the system condition API (`game.laundry.applyCondition`) for consistent v12/v13 effect handling.
- Combat/rest UX and sheet wiring were aligned with the new automation layer (status toggles, Breather/Standard Rest actions, combat panel integration).

## 1.11.3 - 2026-02-20

### Changed
- Dice pool formulas for Skill, Weapon, and Spell rolls now use `Attribute + Training` only; `Focus` is no longer auto-converted into extra dice.
- Attack pre-roll dialog no longer offers `Spend Focus (+1d6)`; only Adrenaline pre-spend remains there.
- Character Builder Training tab no longer requires Optional Skills checkbox selection; skill allocation now directly includes the assignment skill list.

## 1.11.2 - 2026-02-20

### Changed
- Published another release cut to refresh manifests and distribution archives at `v1.11.2`.

## 1.11.1 - 2026-02-20

### Changed
- Published a new release cut to refresh distribution archives and manifest metadata at `v1.11.1`.

## 1.11.0 - 2026-02-20

### Added
- Form 2B tabbed workflow (`Requisition`, `Training`, `Dossier`) with progressive disclosure: training and dossier remain locked until an assignment is selected.
- Real-time talent prerequisite recalculation during character generation based on an in-form mock actor snapshot of current attributes, skill allocations, and selected talents.

### Changed
- Form 2B visual system redesigned to bureaucratic-minimalist dossier styling: rigid document grid, monochrome stamp buttons, custom checkbox glyphs, and fill-in-the-blanks input treatment.
- Assignment preview attributes now render as high-contrast document cards for immediate readability.
- Removed redundant assignment hints in Training sections while preserving selection counters and validation flow.

## 1.10.0 - 2026-02-20

### Added
- Full turn-economy automation for combat turns (Action/Move counters per active combatant), including actor sheet controls to spend Action/Move and spend Adrenaline for +1 Action.
- Stunned automation for turn economy: stunned combatants automatically lose their next Action at turn start.
- Adrenaline roll reaction from dice cards: spend 1 Adrenaline to add an extra `1d6` after seeing the roll result.
- Damage reaction automation: targets can spend 1 Adrenaline during damage application to halve incoming post-armour damage.
- Weapon trait automation on damage application:
  - `Piercing`: ignores 1 Armour per natural six rolled on the attack.
  - `Crushing`: automatically applies `Stunned` on successful damaging hits.

### Changed
- Initiative now follows book formula directly: `Mind + Awareness Training + Reflexes Training`.
- Combat dice status automation aligned to the rules:
  - `Prone`: melee attacks against prone targets gain `+1d6`; ranged attacks against prone targets suffer `-1d6`.
  - `Blinded`: vision-based checks suffer `-1d6`, and blinded targets apply a `-1 Defence` step in Ladder attack DN resolution.
- Skill/spell/weapon dice pools now include Focus in base pool calculation (`Attribute + Training + Focus`).
- Attack cards now block damage application when the attack did not achieve the required successes.
- Injury severity trigger now keys off overflow through Toughness (`1d6 + overflow damage`) and keeps the requested table bands (Stunned/Bleeding/Incapacitated-Lethal).
- Manifest versions bumped to `1.10.0`.

## 1.9.0 - 2026-02-20

### Added
- Soulbound-style `Combat` tab on actor sheets with snapshot stats, condition toggles, equipped loadout, quick actions, and core combat skill shortcuts.
- Condition-aware roll automation: Blinded, Prone, Stunned, and Weakened now apply automatic pool/DN modifiers directly in dice resolution and are shown on chat cards.
- Smart difficulty defaults for C7d6 Tests:
  - Skill Tests use preset selectors (`Standard`, `Hard`, `Daunting`, `Opposed`) instead of manual DN/Complexity entry.
  - Opposed tests now render as success-count comparison rolls for GM adjudication.
  - Weapon attacks stay automated from The Ladder with fixed Complexity `1`.
  - Spell rolls now always use the spell item's DN/Complexity directly (no roll config prompt).
- Full generated icon set for skills, talents, spells, weapons, armour, and assignments in an in-world Laundry dossier style, with system-local paths.

### Changed
- Release manifests bumped to `1.9.0`.
- Release zip build now includes generated icon assets for distribution installs.

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
