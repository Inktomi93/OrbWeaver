// Boot step: the #1391 plugin tool WIRE-NAME migration (owner-ruled 2026-09-05) — the composition point for a
// rewrite whose knowledge and whose storage live in three different domains.
//
// THE ROW. `pluginToolWireName` flattened an install slug's `-` to `_`, which is not injective: `("foo-bar",
// "baz")` and `("foo","bar_baz")` both spelled `plugin_foo_bar_baz`, so two legitimately named plugins could
// not coexist — the second one's activation died on `ToolNameCollisionError`. The owner ruled for the
// injective form (`-` → `__`) plus a migration of the persisted spellings, over keeping the refusal.
//
// WHY IT IS A BOOT DATA STEP AND NOT A BASELINE LINE: no DDL. Only strings INSIDE two JSON columns moved, so
// `0000_baseline.sql` has nothing to carry and a baseline regen would rewrite zero rows (Tier-1-DB
// §"Regime 1"). It is the `migrate-handoff-offer-vocab` / `migrate-prose-slot-vocab` shape, twice.
//
// WHY THE WIRING LIVES HERE AND NOT IN EITHER DOMAIN. The persisted names sit in `message_variants.tool_calls`
// (chat's table) and `automation_rules.actions` (automation's), and a table's OWNER domain writes it. But only
// the PLUGIN domain knows what a plugin's namespace is, or which namespaces are too ambiguous to touch. A
// sideways `domain/chat` → `domain/plugin` import is illegal (constitution §2), so the composition root does
// what composition roots are for: it reads the plugin domain's answer and hands it DOWN to each owning domain
// as plain `{from, to}` data.
//
// THE THREE PERSISTED HOMES, and why the third is EXCLUDED rather than forgotten:
//   • `message_variants.tool_calls[].name` — chat's, migrated. A stale name silently unmatches every
//     `tool-card` surface the plugin ever rendered (`toolWireName`, U3), with no error anywhere.
//   • `automation_rules.actions[].name` on the `run_tool` arm — automation's, migrated. A stale name is at
//     least loud (the arm resolves against the live registry and does not fire), but the rule still dies.
//   • `rpg_turn_tool_calls` — NOT migrated, and that is a ruling, not an oversight. D112: chat "never
//     persists [terminal tool] calls as `ToolCallRecord`s", and that rpg-owned table exists precisely to hold
//     the RPG CONTRIBUTOR's OWN calls, which are first-party (`roll_dice` and its siblings) and can never
//     carry a `plugin_` name. Migrating it would be writing another domain's table to fix a spelling that
//     cannot appear in it. Ends if a plugin tool ever becomes reachable from a folded turn.
// The registered tool NAMES themselves need no migration at all: `ToolRegistry` is the in-memory process
// registry (`domain/tool-use/verbs/register-plugin-tool.ts`), re-minted at every activation.
//
// A MACRO reference is deliberately NOT here: a plugin macro's name is USER-TYPED PROSE inside a persona
// note or scenario line, which is not a row this app may rewrite. That half is served at the resolution seam
// instead (`domain/plugin/substrate/plugin-macros.ts`'s legacy alias).

import type { Db } from "@orb/db";
import { migratePluginToolWireNames as migrateAutomationArms } from "#domain/automation";
import { migratePluginToolWireNames as migrateToolCallRecords } from "#domain/chat";
import { pluginToolWireNameRenames, pluginToolWireNameRenamesRefused, readInstalledPluginSlugs } from "#domain/plugin";
import { getLog } from "#foundation/observability";

export interface MigratePluginToolWireNamesDeps {
  readonly db: Db;
}

/**
 * Re-prefix every persisted plugin tool wire name the #1391 injective mint renamed. Returns the total number
 * of names rewritten across both tables — 0 on every boot after the first, on a box with no hyphen-slugged
 * plugin installed, and on one where every hyphenated slug is ambiguous.
 *
 * THE REFUSAL IS LOGGED AT WARN, not swallowed. `pluginToolWireNameRenames` declines a slug whose legacy
 * namespace another installed slug could also be speaking through — that ambiguity IS the defect this row
 * fixes, and no reading of the stored bytes can resolve it. Those plugins keep their legacy persisted
 * spellings (their cards fall back to the generic tool block; their `run_tool` arms stop firing) and the
 * operator is told which ones, because a silent refusal here is indistinguishable from "nothing needed
 * doing" — exactly the failure mode the whole row is about.
 */
export async function migratePluginToolWireNamesOnBoot(deps: MigratePluginToolWireNamesDeps): Promise<number> {
  const slugs = await readInstalledPluginSlugs(deps.db);
  const renames = pluginToolWireNameRenames(slugs);
  const refused = pluginToolWireNameRenamesRefused(slugs);
  if (refused.length > 0) {
    getLog().warn(
      { refused },
      "boot/migrate-plugin-tool-wire-names: these hyphenated plugin slugs share a legacy wire namespace with another installed slug, so their persisted tool names are AMBIGUOUS and were left alone (#1391)",
    );
  }
  if (renames.length === 0) {
    return 0;
  }
  const rewritten = (await migrateToolCallRecords(deps.db, renames)) + (await migrateAutomationArms(deps.db, renames));
  if (rewritten > 0) {
    getLog().info({ rewritten, renames: renames.length }, "boot/migrate-plugin-tool-wire-names: re-prefixed pre-#1391 plugin tool wire names");
  }
  return rewritten;
}
