---
kind: spec
status: draft
updated: 2026-07-03
---

# Themes & Appearance — the D44 §12.1 persistence design (`themes` entity + the two `UserSettings` namespaces)

> **Status: COMMITTED (D44, 2026-06-28) — prescriptive build design, UNBUILT (verified 2026-07-03: no `themes` table in `@orb/db/schema/settings.ts`, no `@orb/contracts/theme` module yet; the client `<ThemeScope>` + `code-editor` halves ARE built in `@orb/ui`).** `Core-Laws-and-Precedents.md`
> D44 is the decision record; `core/UI-Theming-and-Content.md` §12 (especially §12.1) is the
> authority — both win on any conflict with this doc. This doc specs the server/contracts/db build
> for the two commitments §12.1 makes but does not home: (1) the **first-class single-owned
> `themes` entity** (a user theme library — create/name/edit/delete/duplicate; `ownerId` +
> `fetchOwned`; seed palettes non-deletable, duplicate-to-customize), and (2) the **`theme` +
> `appearance` `UserSettings` namespaces**. The client pieces (`<ThemeScope>`, the §13.4
> entity-editor theme editor, the appearance panel) are specced in `UI-Theming-and-Content.md` +
> `UI-Primitives-and-Reuse.md` and are NOT re-specced here.

---

## 1. THE HOME DECISION — settings-adjacent (inside `domain/settings`), not its own leaf

§12.1 left this open ("settings-domain-adjacent, or its own leaf").

**DECISION: the `themes` entity lives INSIDE `domain/settings`** — the table rides
`@orb/db/schema/settings.ts` (producer-owned), the verbs are `domain/settings/verbs/*-theme*.ts`
files surfaced on the `SettingsService`, persistence is `domain/settings/persistence/theme-queries.ts`,
and the seed is `domain/settings/seed-themes.ts` (the preset `seed.ts` domain-root precedent).

**WHY:** the entity is six thin CRUD verbs over one table with **zero cross-feature surface** — no
other domain injects a themes op (chat assembly never reads themes; per-CHARACTER themes ride the
character row, D44 §12.5, not this table), and the client reads it at the **same bootstrap moment**
as `UserSettings` (one settings fetch resolves `theme.selectedThemeId` + the library list that id
points into). Its ownership posture, write discipline, and consumer are all settings-shaped;
`domain/settings` already owns the per-user config tier this entity is the entity-half of.

**REJECTED — its own 8-slot leaf (`domain/themes`):** a full front-door/service/context/contract/
verbs/persistence/substrate template for six verbs with no injected deps beyond `db` and no
cross-feature consumers buys a boundary nothing crosses. The 8-slot template earns its weight when
a domain has composition (injected ops, subsystems, a contract other tiers program against);
here it would be ceremony — an empty `context.ts`, a one-interface `contract/`, and a second front
door the composition root must wire for verbs only the settings tRPC router calls. If themes ever
grows a real cross-feature surface (e.g. a theme-marketplace/import pipeline), promotion to a leaf
is a mechanical extraction — the verbs/persistence files are already self-contained.

_Enforcement: resolve-time — no `domain/themes` package path exists; the verbs are reachable only
through the `settings` front door._

---

## 2. The table — DDL + the seed-protection decision

### 2.1 Seed rows are OWNERLESS SYSTEM ROWS, not a flagged column

**DECISION: seed palettes (Hearth · Mocha; Light when it lands — §12.1) are rows with
`owner_id IS NULL`,** exactly the `presets` two-row-kind precedent (`db/schema/preset.ts` — the
`SYSTEM_DEFAULT_PRESET_ID` pattern: nullable owner, fixed sentinel TypeIDs as domain constants in
`domain/settings/constants.ts`, NOT contracts — no client needs the raw ids).

**WHY (under D21):** D21's two ownership categories are single-owned (`ownerId`/`fetchOwned`) and
membership-scoped — "nothing is global" is a **no-leaks** law about user content, and seed palettes
carry zero user content (they are app-shipped design tokens, the same trust class as the ownerless
system-default preset row that already exists under D21). The ownerless shape makes
**non-deletability physics, not prose**: every mutating verb goes through `fetchOwned(db, themes,
id, ownerId)`, and a NULL-owner row can never match a caller's owner predicate — seeds are
un-deletable and un-editable **by construction**, with no guard for an amnesiac agent to forget.

**REJECTED — `isSeed` flag + verb guard:** a boolean column plus an `if (row.isSeed) throw` in
`update`/`remove` is a prose-tier invariant (every future mutating verb must remember the check —
exactly the shortcut-erosion AGENTS-1 exists to prevent), and it doubles ownership state (a row
that is both `ownerId`-owned and seed-flagged is a contradiction the schema would permit).
`isSeed` still appears on the **view** — derived as `ownerId === null` at projection, never stored
(derive, don't double).

### 2.2 DDL (`@orb/db/schema/settings.ts` gains the table; `@orb/kit/ids` gains the id)

```typescript
// @orb/kit/ids — prefix registry entry + the branded id (Library entities group)
//   theme: "theme"
export type ThemeId = TypeIdOf<"theme">;
```

```typescript
// @orb/db/schema/settings.ts — producer-owned: domain/settings is the only writer.
import type { ThemeOverride } from "@orb/contracts/theme";
import type { ThemeId, UserId } from "@orb/kit/ids";
import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { users } from "./users";

export const themes = sqliteTable(
  "themes",
  {
    id: text("id").$type<ThemeId>().primaryKey(),
    // NULLABLE: owner_id IS NULL = a seed palette row (the presets two-row-kind pattern).
    // CASCADE for owned rows — a deleted user's themes are worthless without the owner; matches
    // the D21 single-owned family (persona/character/assets/world-info all cascade). presets'
    // RESTRICT is preset-specific (documented there), not the house norm.
    ownerId: text("owner_id")
      .$type<UserId>()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    // The D44 Tier-A token-override value-set. Parsed LENIENTLY at the read seam via
    // themeOverrideSchema (@orb/contracts/theme) — a corrupt blob degrades to defaults there,
    // never here. See §3.1 for why there is NO schema_version column.
    override: text("override", { mode: "json" }).$type<ThemeOverride>().notNull(),
    // Optional self-authored custom CSS (§12.1 Tier-B / global-owner tier — validated at the
    // write boundary, warn-on-@import posture). NULL on seeds.
    css: text("css"),
    createdAt: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
    updatedAt: integer("updated_at").notNull().default(sql`(unixepoch() * 1000)`),
  },
  (table) => [
    index("themes_owner_idx").on(table.ownerId),
    // Per-user name uniqueness: a duplicate name makes the theme picker ambiguous. SQLite treats
    // NULLs as distinct, so this does NOT constrain seed names — acceptable: seed rows are
    // code-authored (the seeder is the guard for the seed namespace).
    uniqueIndex("themes_owner_name_uq").on(table.ownerId, table.name),
  ],
);
```

**`unique(ownerId, name)` — YES.** WHY: the picker and `duplicate` need names to be addressable
per-library; the violation surfaces as a typed `DomainOperationError(duplicate_name)` at the write
verb. REJECTED — no constraint + client-side dedupe: prose-tier, and two tabs racing `create`
would silently mint twins.

---

## 3. Contracts

### 3.1 `ThemeOverride` — CITED, not redeclared

`ThemeOverride` is a **D44 contracts shape** — the curated, Zod-validated token-override subset
(accent · `userBubble{bg,fg}` · `aiBubble{bg,fg}` · optional `systemBubble` · `name` ·
`dialogueColor` · `narrationColor` · `bodyColor` · font-allowlist · `radius` · background ·
`chatStyle: bubble|flat` + density/avatar-size — the list and its parse+clamp boundary rules are
**owned by `UI-Theming-and-Content.md` §12.1** and the D44 ledger entry; this doc does not
redeclare them). Its code home per D44 §12.5 is `@orb/contracts`.

**DECISION — the concrete module is a new small `@orb/contracts/theme`** (holding
`themeOverrideSchema`/`ThemeOverride` + the `Theme` entity schema + the create/update input
schemas the client forms validate — the `createCharacterSchema` precedent). WHY: `ThemeOverride`
has THREE unrelated consumers — this settings-homed entity, the per-character theme column on the
character row (D44 §12.5), and the client `<ThemeScope>` — so parking it in `@orb/contracts/settings`
would make `db/schema/character.ts` read as depending on settings vocabulary. REJECTED —
`@orb/contracts/settings`: the entity is settings-homed but the SHAPE is not a config-tier shape;
misfiling by first-consumer is exactly the `chat_digests`-in-`schema/search.ts` naming lie the
Pain Ledger indicts.

**NO `schema_version` column / no `defineVersionedConfig` wrapper for the override blob.** WHY:
`ThemeOverride` is a flat token map parsed leniently per-field (`.catch` → default) — unknown keys
strip, bad values degrade, no cross-field shape to lift; the versioned-blob apparatus is reserved
for the three config tiers (settings.md invariant 4). **LEAN** (default: stay lenient-unversioned;
resolution criterion: the first genuinely shape-breaking `ThemeOverride` change — a renamed token
key that must migrate stored values — promotes the column + a `defineVersionedConfig` call-site).

### 3.2 The `Theme` entity schema (`@orb/contracts/theme`)

```typescript
import { z } from "zod";
import { themeOverrideSchema } from "./override"; // the D44 §12.1 shape — one home

/** Length caps are named constants (no magic numbers); exact values settle at the slice. */
export const THEME_NAME_MAX = 80;
export const THEME_CSS_MAX = 65_536; // custom CSS is a text field, not a blob store

export const themeSchema = z.object({
  id: z.string(), // ThemeId on the wire; branded at the db/domain seam
  name: z.string().trim().min(1).max(THEME_NAME_MAX),
  override: themeOverrideSchema,
  css: z.string().max(THEME_CSS_MAX).nullable(),
  /** DERIVED at projection from `ownerId IS NULL` — never a stored column (§2.1). */
  isSeed: z.boolean(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});
export type Theme = z.infer<typeof themeSchema>;

export const createThemeInputSchema = z.object({
  name: z.string().trim().min(1).max(THEME_NAME_MAX),
  override: themeOverrideSchema,
  css: z.string().max(THEME_CSS_MAX).nullable().optional(),
});
export const updateThemeInputSchema = createThemeInputSchema.partial();
export type CreateThemeInput = z.infer<typeof createThemeInputSchema>;
export type UpdateThemeInput = z.infer<typeof updateThemeInputSchema>;
```

`ThemeView` (the read-model the verbs return) lives in `domain/settings/contract/views.ts` next to
`UserSettingsView` and is re-exported type-only from the settings front door — the exact
`UserSettingsView` pattern.

### 3.3 The `theme` UserSettings namespace

```typescript
/** Which theme is active for this user. Additive namespace — .prefault({}), NO version bump
 *  (the §12.1 "zero migration" commitment; settings.md esoteric #7 growth path). */
const themeSettingsSchema = z
  .object({
    // biome-ignore lint/plugin/no-raw-id: lenient UserSettings tier — a stale/deleted theme id
    // degrades to the Hearth default at resolution (the profile.avatarAssetId precedent), so it
    // stays a plain nullable string; null = "the default palette" (no sentinel id in contracts).
    selectedThemeId: z.string().nullable().catch(null).default(null),
  })
  .prefault({});
```

**DECISIONS folded in:** (1) `null` = the Hearth default — WHY: encoding "default" as the Hearth
seed's sentinel id would leak a domain constant into contracts and every client bundle; REJECTED —
non-null default id: couples the blob default to a boot-seeded row existing. (2) **No inline
`ThemeOverride` in the blob.** §12.1's early phrasing ("`theme` (selected palette id + the user's
ThemeOverride)") predates its own later entity commitment in the same section; with the `themes`
entity, the user's override values live on the **selected owned theme ROW** — an inline blob copy
would be a second home that diverges from the row (one-home law). Self-authoring = duplicate a
seed → edit the owned copy → select it. (Flagged for review — see the final report — since it
reads one clause of §12.1 as superseded by the entity commitment two sentences later.)
(3) **No FK/cleanup dance on theme deletion** — the blob can't FK; a stale `selectedThemeId`
degrades to default at resolution (lenient tier). REJECTED — a delete-time settings sweep:
cross-tier write coupling to dodge a harmless dangling string.

### 3.4 The `appearance` UserSettings namespace — the §12.1 knob list, verbatim, as zod

Display-only (never touches stored content — the content-processing knobs are PRESET territory,
D53, per §12.1 "OUT"). Each knob lands as a root `data-*` attr / CSS var read by the shell + the
message render.

```typescript
/** Named constants — exact numeric defaults/bounds are build-time LEANs (see below). */
export const CHAT_WIDTH_PCT_MIN = 30;
export const CHAT_WIDTH_PCT_MAX = 100; // the §11.1 clamp caps at 100dvw
export const CHAT_WIDTH_PCT_DEFAULT = 60;
export const FONT_SCALE_MIN = 0.8;
export const FONT_SCALE_MAX = 1.5;

const appearanceSchema = z
  .object({
    // Sizing (§12.1) — chatWidthPct feeds the §11.1 `clamp(680px, Xdvw, 100dvw)` root var (the
    // CSS floor makes the schema min cosmetic); fontScale is the global text-size multiplier.
    chatWidthPct: z.number().int().min(CHAT_WIDTH_PCT_MIN).max(CHAT_WIDTH_PCT_MAX)
      .catch(CHAT_WIDTH_PCT_DEFAULT).default(CHAT_WIDTH_PCT_DEFAULT),
    fontScale: z.number().min(FONT_SCALE_MIN).max(FONT_SCALE_MAX).catch(1).default(1),
    avatarSize: z.enum(["sm", "md", "lg"]).catch("md").default("md"),
    avatarShape: z.enum(["round", "square"]).catch("round").default("round"),
    density: z.enum(["comfortable", "compact"]).catch("comfortable").default("comfortable"), // §4 data-density axis
    // Message style (§12.1 — ST chatDisplay's 3 modes)
    chatStyle: z.enum(["bubble", "flat", "document"]).catch("bubble").default("bubble"),
    // Per-message metadata visibility (§12.1 — "THE gap ST has and we lacked"; each → a data-*)
    showTimestamps: z.boolean().catch(true).default(true),
    showGenerationTimer: z.boolean().catch(false).default(false),
    showTokenCount: z.boolean().catch(false).default(false),
    showMessageId: z.boolean().catch(false).default(false),
    showModelIcon: z.boolean().catch(false).default(false),
    showInChatAvatars: z.boolean().catch(true).default(true),
    messageActions: z.enum(["expanded", "hover"]).catch("hover").default("hover"),
    // Effects (§12.1 — blur/shadow default OFF per the no-glass seed; manual reduced-motion
    // beyond the OS pref, §4a)
    blurEffects: z.boolean().catch(false).default(false),
    shadowEffects: z.boolean().catch(false).default(false),
    reducedMotion: z.boolean().catch(false).default(false),
  })
  .prefault({});
```

No knobs beyond the §12.1 list (`movingUI` and `waifuMode` are OUT by that section; sampling/
instruct/content-processing are preset/connection). **LEANs:** the numeric bounds/defaults and the
metadata-toggle defaults above are defaults-until-the-client-pass — resolution criterion: the
appearance-panel build (Phase 6) settles them against the seed design; the SHAPE (field names,
enums) is committed here. The avatar-size representation is a LEAN too (default: the 3-step enum,
matching the token scale; criterion: if the §13 panel needs continuous sizing, widen to a clamped
int — an additive change).

`USER_SETTINGS_SECTIONS` gains `"theme"` and `"appearance"` (both object-valued → section-patchable
via `updateUserSettingsSection`; additive, no version bump).

**Overlap rule (LEAN):** `ThemeOverride` optionally carries `chatStyle`/density (§12.1 — "a theme
is a token value-set (a color palette + optional density)") while `appearance` owns the user's
base values. Default: the selected theme's optional value WINS over `appearance` (a theme is a
deliberately bundled look; resolution stays `character > global > default`). Resolution criterion:
the client `<ThemeScope>` resolution build. Flagged in the final report.

---

## 4. Verbs — the `SettingsService` additions

```typescript
// Appended to SettingsService (domain/settings/contract/service.ts) — the themes library
listThemes(params: { userId: UserId }): Promise<ThemeView[]>                 // owned ∪ seeds
getTheme(params: { userId: UserId; id: ThemeId }): Promise<ThemeView>        // owned or seed; else DomainNotFoundError
createTheme(params: { userId: UserId }, input: CreateThemeInput): Promise<ThemeView>
duplicateTheme(params: { userId: UserId; id: ThemeId }, input?: { name?: string }): Promise<ThemeView>
updateTheme(params: { userId: UserId; id: ThemeId }, input: UpdateThemeInput): Promise<ThemeView>  // owned only
removeTheme(params: { userId: UserId; id: ThemeId }): Promise<void>          // owned only; seeds unreachable
```

- **`can()` posture: owner-only, D21 single-owned family.** Reads resolve `ownerId = caller OR
  ownerId IS NULL` (owned ∪ seeds — the one deliberate widening of `fetchOwned`, mirroring how the
  system-default preset is readable); ALL mutations go through plain `fetchOwned(caller)`, so seed
  rows and other users' rows are un-mutable by construction (§2.1). No admin surface — there is
  nothing to administer (changing seeds = shipping code). No membership scope — themes never
  render to other participants (per-character themes, the shared-render case, live on the
  character row, not here).
- **`duplicateTheme` IS the §12.1 "duplicate-to-customize" verb:** source = any readable row (own
  or seed) → a NEW owned row (`ownerId = caller`, fresh `ThemeId`, `override`/`css` deep-copied,
  name = `input.name ?? "<source> copy"`, de-duped against `unique(ownerId,name)` by numeric
  suffix). Seeds are never edited in place — customization is always copy-then-edit. REJECTED — an
  "edit a seed forks it silently" copy-on-write dance: that is the neo `cow.ts` pattern D28 killed;
  an explicit duplicate verb keeps the library legible.
- **`createTheme` from scratch** exists alongside duplicate (the §13.4 editor's "new blank theme"
  path); the write verbs run `themeOverrideSchema` parse + the D44 CSS validator (§12.1
  warn-on-`@import` posture) at the boundary. The validator is a pure shared function — **LEAN:**
  home `@orb/kit` (two call sites: the client code-editor inline warnings + this server write
  seam); criterion: confirm at the client editor build.
- **No write serializer needed** (unlike the user-settings blob verbs): themes writes are
  whole-row by PK, not read-merge-write over a shared blob — last-write-wins per row is correct.

---

## 5. Seeding — how Hearth/Mocha land

**LEAN — boot idempotent upsert** (`domain/settings/seed-themes.ts` → `ensureSeedThemes(db)`,
called from `entry/boot/seed-default-themes.ts`), the exact `ensureSystemDefaultPreset` precedent
(one of four existing boot seeds: owner, credential, default characters, default preset). Seed
rows carry **fixed sentinel TypeIDs** (domain constants, the `SYSTEM_DEFAULT_PRESET_ID` pattern)
and are **overwritten on every boot** — the code IS the source of truth for seed palette values
(they derive from the §3 DTCG tokens / DESIGN.md OKLCH ramp), and since seeds are un-editable
(§2.1) an overwrite can never clobber user data; no version-gate apparatus is needed (REJECTED —
preset's `schemaVersion`-gated reseed: that gate exists to protect a user-editable system row,
a case themes does not have).

**WHY not a migration seed (the rejected alternative):** palette values will evolve with the
design ramp; a migration freezes token values in SQL and demands a new migration per tweak, and
the seed values would then live in two homes (the SQL snapshot + the token source). Resolution
criterion for revisiting the lean: if a future migration itself needs to FK seed rows
mid-migration, move (or copy) the seeding into the migration chain — the fixed sentinel ids make
that a no-op for stored `selectedThemeId` values.

---

## 6. Invariants + test plan

1. **Seeds are immutable/undeletable by construction** — `updateTheme`/`removeTheme` on a seed id
   → `DomainNotFoundError` (the `fetchOwned` miss), for owner and admin alike. _Test: direct._
2. **No cross-user access** — two-user fixture: `listThemes` never returns the other user's rows;
   `getTheme`/`updateTheme`/`removeTheme` on another user's id → not-found (404-shaped, no
   existence oracle). _Test: direct._
3. **`duplicateTheme` seed → owned copy** — new id, `ownerId = caller`, deep-copied
   `override`/`css`, `isSeed:false` on the view; name de-dupe suffix under `unique(ownerId,name)`.
   _Test: direct + the unique-violation typed error on `createTheme` with a taken name._
4. **`isSeed` is derived, never stored** — the projection maps `ownerId IS NULL`; no `is_seed`
   column exists. _Enforcement: compile-time (schema has no such column) + the view test._
5. **Lenient read seam** — a hand-corrupted `override` blob reads as defaults (per-field `.catch`),
   never throws; a stale `selectedThemeId` resolves the default palette. _Test: fixture._
6. **`ensureSeedThemes` is idempotent + non-clobbering** — double-run leaves exactly N seed rows;
   user-owned rows untouched; a mutated seed row is restored on next boot. _Test: direct._
7. **`users` cascade** — deleting a user removes their themes; seeds survive. _Test: FK fixture._
8. **Section-patch** — `updateUserSettingsSection("theme")` / `("appearance")` deep-merge +
   re-validate; the existing same-user serializer tests gain the two sections in their fixture.
   _Test: extend existing._

## 7. Size

**S** (server+contracts+db slice): one table + one id + one small contracts module + six thin
CRUD verbs + two additive blob namespaces + one boot seed; zero cross-feature injection, zero
engine work. The theme EDITOR + appearance panel are client work already counted in the §13.4 /
Phase-6 client plan — not this slice.
