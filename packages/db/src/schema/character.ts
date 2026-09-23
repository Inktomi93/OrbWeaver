// schema/character — the FLAT live card + an opaque history log (producer: domain/character). Ledger D28:
// `character_versions` is GONE — there is NO version table, NO `currentVersionId`/circular FK, NO `version`
// counter, NO `raw`/`proposedTags`. The card IS the live `characters` row (identity + ALL card content in
// one place, edited in place); history is a standalone `character_snapshots` log that NOTHING FKs (browse +
// restore-in-place only, the git working-tree + commit-log split). `ownerId` is KEPT (D23 — characters are
// single-owned / `fetchOwned`).
//
// Card content rides FLAT on the row (D28): the typed promotions `depthPrompt` (the shared `{depth, role?}`
// directive + note), `extensions` (residual `data.extensions.*` vendor keys), `residualData` (PD-127 —
// residual TOP-LEVEL `data.*` keys, `extensions`'s sibling), and `refinery` (derived pipeline signals) are
// JSON columns read through the `@orb/db/kit` parse-seam. `greetings` is an ALWAYS-A-LIST column (default
// `[]`, never null — the parseStringArray asymmetry). `importHash` (sha-256 of the whole imported file,
// re-import dedup) is DISTINCT from `contentHash` (the semantic-fields hash); both live on the flat row.
//
// A card's REGEX SCRIPTS are NOT a column (D121-E): they are library rows attached through the
// `character_regex_scripts` junction (`schema/regex.ts`). The card WIRE still carries them — the import
// lifts them into rows, the export re-embeds them byte-shape-identically.

import type { CardDepthPrompt, CharacterCard, Greeting, RefinerySignals } from "@orb/contracts/character";
import type { ThemeBackground, ThemeOverride } from "@orb/contracts/theme";
import type { AssetId, CharacterHandle, CharacterId, CharacterSnapshotId, PersonaId, UserId } from "@orb/kit/ids";
import { sql } from "drizzle-orm";
import {
  index,
  integer,
  // biome-ignore lint/suspicious/noDeprecatedImports: drizzle @deprecates the positional primaryKey(col) overload; we use the supported primaryKey({ columns }) object form below.
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { assets } from "./assets.ts";
import { personas } from "./persona.ts";
import { users } from "./users.ts";

export const characters = sqliteTable(
  "characters",
  {
    // ── Identity (D28 flat row) ──────────────────────────────────────────────
    // TypeID PK (`character_…`); brand is type-only, SQL is plain TEXT. App-minted; no DB default.
    id: text("id").$type<CharacterId>().primaryKey(),
    // The character handle is a free-form label (incl. the synthetic `__group__<chatId>` namespace),
    // NOT a branded entity id — its brand is the `CharacterHandle` identity-VALUE brand (the
    // `users.handle`/`Handle` class), so a user-facing username can never land in a card-slug position.
    handle: text("handle").$type<CharacterHandle>().notNull(),
    // KEEP `ownerId` (D23). User hard-delete cascades the owner's characters.
    ownerId: text("owner_id")
      .$type<UserId>()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    starred: integer("starred", { mode: "boolean" }).notNull().default(false),
    archived: integer("archived", { mode: "boolean" }).notNull().default(false),
    // The `synthetic=true` hidden per-room group-memory identity (filtered from every user-facing query).
    synthetic: integer("synthetic", { mode: "boolean" }).notNull().default(false),
    // Tri-state: null = inherit the deployment default, true = forbid, false = allow — but the combine is
    // TIGHTEN-ONLY (`contracts/chat::resolveRenderPolicy`, owner ruling 2026-08-01): the deployment "Block
    // external media" setting is an ABSOLUTE ceiling, so a stored `false` only takes effect while the
    // deployment itself allows external media. It is a restriction knob, never an escalation.
    forbidExternalMedia: integer("forbid_external_media", { mode: "boolean" }),
    // D44 §12.0 render-trust OPT-IN (untrusted by default). Tri-state: null = inherit the deployment
    // default, true = this character's card/message HTML is TRUSTED (rich HTML + Mermaid render), false =
    // force untrusted. Same tri-state SHAPE as `forbidExternalMedia`, but it resolves `override ?? global`
    // (a card-level escalation IS the design here — the deployment value is a default, not a ceiling).
    trustHtml: integer("trust_html", { mode: "boolean" }),
    // The INTERACTIVE-CARD opt-in (#111 leg 1) — the TOP RUNG of the one ordered html-trust ladder
    // (`contracts/chat::HTML_TRUST_STEPS`: untrusted < trusted < interactive), which the resolver folds out
    // of THIS column plus `trust_html`. Stored as a second column rather than an enum so the render step
    // keeps its two-tier `override ?? deployment` semantics unchanged; the LADDER is the presentation +
    // resolver contract, and nothing but `resolveRenderPolicy` reads this pair. `true` builds this
    // character's card documents under the `interactive` frame posture (`@orb/kit/card-frame`) and IMPLIES
    // the render step below it. Nullable like its siblings, two-valued in MEANING today (no deployment tier
    // ⇒ `null` and `false` both mean "not interactive"); nullable anyway so the leg-3 security pass can add
    // an app tier — and its "inherit" — with no schema churn. What the top rung does NOT do yet is run
    // card-authored scripts: both postures serve the same policy until that pass lands.
    interactiveHtml: integer("interactive_html", { mode: "boolean" }),
    // D44 §12.1/§12.5 — the per-character theme-token OVERRIDE (nullable: null = no override, inherit the
    // global selected theme). Mirrors `trustHtml`'s tri-state-override shape, but the "value" here is a
    // JSON blob, not a boolean. Resolution (`character override > global selected theme > default`) is a
    // CLIENT-side `<ThemeScope>` NESTING concern (scoped CSS custom properties cascade) — this column
    // carries only the RAW override; chat assembly threads it through unmerged (zero
    // cross-feature `themes`-table read from chat).
    themeOverride: text("theme_override", { mode: "json" }).$type<ThemeOverride>(),
    // BG-C §12.1 twin of `theme_override` — the per-character carried BACKGROUND source (nullable JSON blob:
    // null = no card background). A true-solo room paints it at the app-root background layer, below the
    // chat-set override; GC-rooted by the `asset-refs` JSON live-source (`asset` kind only). Client-resolved.
    backgroundOverride: text("background_override", { mode: "json" }).$type<ThemeBackground>(),
    importedFrom: text("imported_from"),
    // sha-256 of the whole imported file (re-import dedup) — DISTINCT from `contentHash`. Null when authored.
    importHash: text("import_hash"),
    // The semantic-fields hash (always present — computed at create/edit).
    contentHash: text("content_hash").notNull(),
    // Advisory card-heft estimate (the ONE `estimateTokens` QuadChars algo via `substrate/card-tokens`) —
    // a DENORM of the card content, RESTAMPED on every content write (alongside `contentHash`, same sites).
    // notNull default 0. Exists as a QUERYABLE column so `largestCards`/`smallestCards` (FINAL §4.5) can be a
    // keyset ORDER BY — a post-query JS estimate can't sort server-side. Advisory only (billing truth is the
    // provider `usage` post-turn); an empty card estimates to 0.
    tokenSize: integer("token_size").notNull().default(0),
    // ── Card content (FLAT on the row — D28; mirrors @orb/contracts/character `characterCardSchema`) ──
    name: text("name").notNull(),
    description: text("description"),
    personality: text("personality"),
    scenario: text("scenario"),
    // ALWAYS a list (greetings[0] = first message, rest = alternates; `groupOnly` marks a group-chat-only
    // greeting — the folded ST `group_only_greetings`); default `[]`, never null.
    greetings: text("greetings", { mode: "json" }).$type<Greeting[]>().notNull().default(sql`'[]'`),
    exampleMessages: text("example_messages"),
    systemPrompt: text("system_prompt"),
    postHistoryInstructions: text("post_history_instructions"),
    // Character's Note @ Depth — the shared `{depth, role?}` directive + note text, or null.
    depthPrompt: text("depth_prompt", { mode: "json" }).$type<CardDepthPrompt>(),
    creatorNotes: text("creator_notes"),
    creator: text("creator"),
    // Card author's freeform version STRING (e.g. "1.2") — NEVER an int counter (D28).
    cardVersion: text("card_version"),
    // ── V3 content promotions: the four `data.*` fields formerly carried in `residual_data`, now first-class
    //    typed columns (residual is for genuinely-UNKNOWN vendor keys only). Nullable: absent on a V2 /
    //    app-authored card. ──
    // Prompt-facing display name overriding `{{char}}` (ST V3 `data.nickname`).
    nickname: text("nickname"),
    // Provenance URLs / ids the card was sourced from (ST V3 `data.source`) — a NULLABLE list (absent ⇒ null,
    // distinct from an empty `[]`), so it uses `parseStringArrayColumn`, not the always-a-list `greetings` seam.
    source: text("source", { mode: "json" }).$type<string[]>(),
    // Unix-seconds authorship timestamps (ST V3 `data.creation_date` / `data.modification_date`).
    creationDate: integer("creation_date"),
    modificationDate: integer("modification_date"),
    // Residual `data.extensions` MINUS the promoted-to-column fields — genuinely-unknown vendor extras only.
    extensions: text("extensions", { mode: "json" }).$type<Record<string, unknown>>(),
    // Residual TOP-LEVEL `data.*` keys MINUS the promoted-to-column fields (PD-127) — the sibling of
    // `extensions` above, scoped to `data.*` instead of `data.extensions.*`. Genuinely-UNKNOWN vendor keys
    // only: the known ST-V3 fields (`nickname`/`source`/`creation_date`/`modification_date`) are now typed
    // columns above. `creator_notes_multilingual` HAS no column and rides here verbatim (#266 D-1) — it also
    // feeds `creator_notes` when that is empty, but the map itself is preserved. `group_only_greetings` folds
    // into the `greetings` array as `groupOnly:true` entries (V3 promotion Phase B), so it does not ride here.
    residualData: text("residual_data", { mode: "json" }).$type<Record<string, unknown>>(),
    // Nullable avatar pointer. An asset delete nulls the pointer (SET NULL) — must NOT delete the character.
    avatarAssetId: text("avatar_asset_id")
      .$type<AssetId>()
      .references(() => assets.id, { onDelete: "set null" }),
    // CardRefinery pipeline signals (derived, not user-authored).
    refinery: text("refinery", { mode: "json" }).$type<RefinerySignals>(),
    createdAt: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
    // The EDITED stamp (the regex_scripts X-16 precedent — "any user-edited-in-place entity a list pane
    // sorts/discriminates gets `updated_at`, maintained by write verbs"). Distinct from `modificationDate`
    // (ST import provenance, a one-time authorship fact never rewritten) and from `contentHash`/`tokenSize`
    // (content-shape denorms, not a clock): this is the write CLOCK, restamped by every update verb from the
    // injected clock (never a DB trigger) so the library list can sort/show "edited Nm ago".
    updatedAt: integer("updated_at").notNull().default(sql`(unixepoch() * 1000)`),
  },
  (t) => [
    // Per-owner handle namespace (neo `characters_owner_handle_unq`) — the `__group__${chatId}` synthetic-
    // group mint/find relies on per-owner handle uniqueness.
    uniqueIndex("characters_owner_handle_unique").on(t.ownerId, t.handle),
    // Owner-scoped list hot path (`fetchOwned`).
    index("characters_owner_idx").on(t.ownerId),
    // The avatar FK's SET-NULL parent scan: deleting an asset (GC included) walks `characters` to null the
    // pointer, and SQLite auto-indexes no child FK (`fk-columns-indexed` gate).
    index("characters_avatar_asset_idx").on(t.avatarAssetId),
  ],
);

// character_snapshots — the git-commit-style history log (D28). Append-only; ONE opaque JSON blob per
// snapshot (the full card snapshot — NOT a parallel set of typed columns). Restore copies a blob → the
// live `characters` row in-place. INVARIANT: NOTHING FKs character_snapshots — it is opaque history, not a
// content home, so it can never pin, block, or alter card resolution. Do NOT add an inbound FK from any
// other table to this one.
export const characterSnapshots = sqliteTable(
  "character_snapshots",
  {
    // TypeID PK (`character_snapshot_…`); brand is type-only, SQL is plain TEXT.
    id: text("id").$type<CharacterSnapshotId>().primaryKey(),
    characterId: text("character_id")
      .$type<CharacterId>()
      .notNull()
      .references(() => characters.id, { onDelete: "cascade" }),
    // The full card snapshot as ONE opaque JSON blob.
    content: text("content", { mode: "json" }).$type<CharacterCard>().notNull(),
    label: text("label"),
    createdAt: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
  },
  (t) => [
    // The per-character history listing (`domain/character/persistence/queries.ts` listSnapshots —
    // `where(characterId) order by createdAt desc`) filters characterId; unindexed it table-scanned. Same
    // queried-characterId-FK convention as the roster/digest-speaker/gallery precedents.
    index("character_snapshots_character_idx").on(t.characterId),
  ],
);

// character_personas — the M:N character↔persona junction, identity-keyed on `characters.id` (D28 — there
// is no cv to key on; personas survive every card edit). Composite PK; both FKs CASCADE (delete either side
// → the junction row is gone). Stays in character.ts (the association owner) even though `personas` is its
// own producer-named file.
export const characterPersonas = sqliteTable(
  "character_personas",
  {
    characterId: text("character_id")
      .$type<CharacterId>()
      .notNull()
      .references(() => characters.id, { onDelete: "cascade" }),
    personaId: text("persona_id")
      .$type<PersonaId>()
      .notNull()
      .references(() => personas.id, { onDelete: "cascade" }),
    createdAt: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
  },
  (table) => [
    primaryKey({ columns: [table.characterId, table.personaId] }),
    // Reverse lookup + the personaId-side FK cascade child (the composite PK leads with characterId).
    index("character_personas_persona_idx").on(table.personaId),
  ],
);
