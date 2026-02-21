# Changelog

## 1.19.0 - 2026-02-21

### Added
- Team Luck GM QoL controls in Operations Threat Tracker: quick `Sync Max`, `Reset to Max`, and `Reset to 0` actions with live pool display and auto-sync visibility.
- Fear source tracking for `Frightened` and `Terrified` conditions (`fearSourceActorId`, `fearSourceTokenId`, `fearSourceName`) to support movement restrictions tied to the source of fear.
- Movement-gating automation for fear conditions during combat: when the fear source is in line of sight, moving closer now prompts and requires Spirit (Resolve) checks (DN 5:1 for Frightened, DN 6:1 for Terrified), matching PDF condition rules.
- Multi-status application from injury/mishap outcomes so compound effects (for example `Blinded` + `Deafened`) are both applied from one result card.

### Changed
- Weapon damage automation aligned further to Operative's Handbook combat traits: `Ineffective` now forces Minor Injury severity, `Brutal` escalates only Minor to Serious, `Stunning` triggers from any natural 6 on the hit pool, and `Spread` adds Reflexes evasion for tougher nearby targets.
- Prone targeting automation now scales ranged penalties by distance outside Close Range (1/2/3 steps by zone), while preserving close-range advantage handling.
- Team Luck maximum sync now allows a true zero-player state (no forced minimum of 1).

## 1.18.3 - 2026-02-21

### Changed
- Requisition/Support result cards now render rolled dice as highlighted skill-style die boxes (success/failure coloring, critical and complication markers) instead of plain comma-separated text.
- Added an embedded outcome strip for support checks (`Successes: X/Y` with paperwork bonus breakdown) so the roll verdict is readable at a glance.
- Endeavour cards now auto-convert `Dice: ...` lines into the same boxed dice presentation used by skill checks, keeping downtime chat output visually consistent.
- Added chat-specific spacing tweaks for embedded dice blocks so boxed dice remain clear inside the unified dossier chat-card layout.

## 1.18.2 - 2026-02-20

### Changed
- Re-styled Requisition/Support, Endeavour, Mission, and Threat chat cards to match the same flat dossier look-and-feel used by skill-check roll cards (`laundry-dice-roll`): paper background, crisp borders, compact typography, and cleaner row spacing.
- Removed `.laundry-rpg` scoping from shared chat-card selectors so the unified styling now always applies inside chat messages (not only inside app containers).
- Unified Requisition & Support / Endeavours / Mission Generator app controls (buttons, labels, inputs, previews, requisition rows) under the same skill-check visual language for one consistent UI style.
- Kept status readability while simplifying card accents: approved/denied/mission/threat states now use restrained border + stamp color treatment instead of heavier gradient/left-bar variants.

## 1.18.1 - 2026-02-21

### Changed
- Unified chat-card visual language across Requisition, Support, Endeavours, Mission Briefing, and Threat automation messages to match the polished dossier style used in core skill-check roll cards.
- Requisition/support result cards now use structured rows, standardized stamps/meta lines, and consistent list/section formatting for better readability in chat.
- Endeavour, mission, and threat chat outputs now share the same typography, spacing, and status-stamp treatment for one coherent system-wide presentation.
- Added responsive behavior for compact chat-card row layout on narrow widths so the same style remains legible on smaller viewports.

## 1.18.0 - 2026-02-21

### Added
- Requisition processing now supports expanded compendium matching order (`gear`, `weapons`, `armour`, then `all-items`) for automated fulfillment with better fallback behavior.
- Requisition preview now includes support-roll success forecasting (approval chance, expected successes, per-die odds, paperwork bonus impact).
- Critical injury panel in `Requisition & Support` now separates physical vs psychological injuries and adds one-click healing actions (`Heal 1 Physical`, `Heal 1 Psychological`, `Heal Oldest`).
- New extraction staging pipeline (`sources/extraction/raw -> normalized -> reviewed`) with `scripts/stage_extracted_sources.py` to clean and promote extracted book data.
- Added shared automation math helpers in `module/utils/automation-math.mjs` and dedicated tests for requisition math, quantity grant math, injury cap handling, and rebuild determinism.

### Changed
- Critical injury effect application now deduplicates near-identical outcome effects via deterministic fingerprinting to prevent accidental double-application from chat controls.
- Injury-track increment/decrement paths now use shared capped update logic for consistent behavior across injury and healing flows.
- Compendium rebuild pipeline now reads staged reviewed sources first, enriches items/actors with categories, tags, search terms, source-page metadata, and improved enemy/gear icon mapping.
- QA validation now enforces `sourcePage` and tags for extracted `gear` and `enemies` sources.

## 1.16.0 - 2026-02-20

### Added
- Supervisor's Guide mission tooling: new Mission Generator app with extracted tables (pages 46-48), operation codename synthesis, and classified mission briefing chat output.
- Threat-to-NPC integration: GM Tracker now includes `Apply Threat Buffs`, applying Threat-fueled Active Effects to hostile NPCs and per-turn Threat regeneration/adrenaline ticks during combat.
- New departmental `Call for Support` workflow from actor sheets with department-specific DN/Complexity checks and structured support result cards.
- New `EndeavoursApp` downtime workflow (pages 57-64) with `Take Downtime` access on character sheets.

### Changed
- Requisition support now consumes `flags.laundry-rpg.endeavours.paperwork_bonus` as +1 automatic success on the next support roll.
- Mission start automation now processes downtime flags: `Family Vacation` adrenaline bonus and `Moonlighting` exhaustion (`Weakened`) are applied automatically on combat start.
- Downtime automation now persists structured endeavour state via `flags.laundry-rpg.endeavours.*` and emits bureaucratic in-chat summaries for each resolved activity.

## 1.15.1 - 2026-02-20

### Added
- Embedded the full `tables.json` critical data set directly into runtime dice automation (`Physical Injuries`, `Psychological Injuries`, `Magical Mishaps`) so all critical outcomes resolve from the same source data even when `tables.json` is not shipped.
- Added `Deafened` as a first-class Laundry condition/status to support psychological injury outcomes like `Reality Denial`.

### Changed
- Injury and Mishap roll resolution now prioritizes the embedded critical table data path, with automation RollTable lookup only as fallback.
- Mishap outcome rolls now auto-select `2d6` when table ranges exceed `1d6`, matching the imported `Magical Mishaps` table bands.
- Difficulty modifier parsing now correctly handles paired descriptors like `Spirit (Zeal) and Mind (Magic)` when generating `ActiveEffect.changes` flag keys.

## 1.15.0 - 2026-02-20

### Added
- Injury and Mishap result chat cards now include an `Apply Effect` action that creates a dedicated `ActiveEffect` on the target actor.
- Outcome effects now store roll penalties as `ActiveEffect.changes` entries under `flags.laundry-rpg.modifiers.difficulty.*` (including scoped keys such as `body.dexterity` and broader keys such as `body.all`).
- Smart Roll configuration now surfaces injury-derived complexity penalties in-dialog as `⚠️ +X Complexity (Injury Penalty)`.

### Changed
- Injury/Mishap automation now derives effect metadata (name/category/icon/status) from table outcomes and applies status toggles through `actor.toggleStatusEffect(...)` with system-condition fallback.
- Roll evaluation now inspects active effects before execution and applies matched difficulty modifiers directly to final test Complexity.
- Expanded Laundry condition registry with `Incapacitated` and `Unconscious` status effects for direct automation mapping from outcome cards.

## 1.14.2 - 2026-02-20

### Fixed
- `Configure Test` dialog no longer clips the lower action bar; `Roll` remains visible and usable on constrained window heights.
- Quick token-HUD selectors now use an explicit `Roll` action label instead of generic confirmation text.

### Changed
- Unified dialog confirm prompts under Laundry dossier styling for visual consistency across combat, setup, and character workflows.
- Improved test/picker dialog UX with clearer form grouping, lightweight context summaries, and dossier metadata previews while preserving the bureaucratic Laundry visual language.

## 1.14.1 - 2026-02-20

### Changed
- Separated actor sheets by type: full sheet is now used for `character`, while `npc` uses a dedicated minimal operational sheet.
- Added dedicated `npc-sheet.html` registration and template preload for Foundry v12/v13.

## 1.14.0 - 2026-02-20

### Added
- NPC Ops workflow on NPC sheets: preset apply, NPC class/mode controls, mob size, fast-damage toggles, defeated-state controls, and editable one-line NPC action cards.
- Automatic NPC death display in chat (`☠ DEATH CONFIRMED`) during fast/minion kill resolution and lethal NPC injury outcomes.
- GM Tracker NPC Rapid Spawn panel with preset + count + name controls for immediate encounter setup.

### Changed
- Damage automation now supports NPC-lite combat flow directly in Apply Damage: minion/fast-mode defeat handling, mob casualty reduction, defeated state sync, and reduced condition clutter for defeated NPCs.
- GM Tracker combat rows now include tactical hint badges (Critical, No Action, No Move, Defeated, Can Cast, Ranged).
- Added new NPC and GM tracker styling blocks for clean desktop/mobile operation in Foundry v12/v13.

## 1.13.0 - 2026-02-20

### Added
- Token HUD combat controls for quick field actions: Quick Attack, Quick Cast, Use Action/Move, Spend Adrenaline (+1 Action), Stand from Prone, and GM Tracker shortcut.
- GM Tracker upgraded with Combat Dashboard 2.0: live combatant board (Initiative, Toughness, Adrenaline, statuses, turn-economy state) and inline quick controls.
- New Automation Tables settings app (System Settings menu) for linking/opening/resetting Injury and Mishap RollTables.
- Area attack template workflow: optional measured-template placement from the attack dialog, with Apply Damage resolving targets from the template footprint.
- Expanded condition set with `Bleeding` and `Frightened`, including active roll modifiers and combat-time automation.
- CI pipeline (`.github/workflows/ci.yml`) with Node tests, syntax checks, compendium QA, pack rebuild, and artifact drift checks.
- Compendium QA script (`scripts/qa_compendiums.mjs`) and Macro source pack (`macros.json` -> `packs/macros.db`) with ready-to-use Laundry play macros.

### Changed
- Release workflow now runs tests, compendium QA, and pack consistency gates before publishing release assets.
- Weapon data model and pack rebuilds now include ammo/area defaults required by the new automation layer (`ammo`, `ammoMax`, `areaDistance`).
- Actor sheet condition controls now read condition IDs dynamically from system condition registry.

## 1.12.1 - 2026-02-20

### Fixed
- Attack dialog `Roll Attack` submit binding now works when the template root node is the `<form>` itself, preventing form refresh and ensuring the roll executes correctly from the Combat flow.

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
