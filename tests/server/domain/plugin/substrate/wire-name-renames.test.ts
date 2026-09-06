// domain/plugin/substrate/wire-name-renames — WHICH persisted `plugin_…` namespaces the #1391 migration may
// rewrite. Pure, so a unit lane.
//
// THE PROPERTY THIS FILE EXISTS FOR is not "the happy rename works" (one line) — it is that the function
// REFUSES every configuration where a stored name is genuinely ambiguous. The old flattening was not
// injective, so a stored `plugin_foo_bar_baz` does not say which plugin minted it; a migration that guessed
// would move one plugin's persisted tool cards onto another plugin's namespace, which is strictly worse than
// the stale name it replaced. Each refusal case below is a shape that would have been silently mis-migrated.

import { pluginToolWireNameRenames, pluginToolWireNameRenamesRefused } from "@orb/server/domain/plugin";
import { expect, test } from "../../../../support/fixtures.ts";

test("a hyphenated slug alone on the box is renamed, prefix to prefix", () => {
  expect(pluginToolWireNameRenames(["oracle-deck"])).toEqual([{ from: "plugin_oracle_deck_", to: "plugin_oracle__deck_" }]);
  expect(pluginToolWireNameRenamesRefused(["oracle-deck"])).toEqual([]);
});

test("a slug with NO hyphen is never a rename — its two flattenings are the same string", () => {
  expect(pluginToolWireNameRenames(["mood", "oracle"])).toEqual([]);
  expect(pluginToolWireNameRenamesRefused(["mood", "oracle"])).toEqual([]);
});

test("REFUSAL 1 — a shorter slug owns a prefix of the longer one's legacy namespace", () => {
  // `plugin_oracle_deck_draw` is either `oracle-deck`'s `draw` or `oracle`'s `deck_draw`, and nothing in the
  // stored bytes distinguishes them. This is the exact pair #1391 was filed about.
  expect(pluginToolWireNameRenames(["oracle-deck", "oracle"])).toEqual([]);
  expect(pluginToolWireNameRenamesRefused(["oracle-deck", "oracle"])).toEqual(["oracle-deck"]);
});

test("REFUSAL 2 — a doubled-hyphen sibling occupies the DESTINATION namespace, which is the IDEMPOTENCY guard", () => {
  // `foo-bar` would be rewritten INTO `plugin_foo__bar_`, which is exactly `foo--bar`'s LEGACY namespace: run
  // the migration twice and the second pass would rewrite the first pass's output again. This is the case a
  // "just order the renames by hyphen count" migration gets wrong — ordering makes ONE run correct and leaves
  // the second run destructive.
  //
  // THE REFUSAL IS ASYMMETRIC, and that asymmetry is the point rather than an accident of the predicate:
  // only `foo-bar` is unsafe. `foo--bar`'s own legacy namespace `plugin_foo__bar_` cannot be confused with
  // anything — `foo-bar`'s stored names all live under `plugin_foo_bar_`, which is not a prefix of it — and
  // once `foo-bar` is refused, nothing will ever be rewritten INTO `plugin_foo__bar_` either. So `foo--bar`
  // migrates, `foo-bar` keeps its legacy spelling, and a second run still matches nothing. Refusing BOTH
  // would be safe too, but it would strand a plugin whose namespace was never actually ambiguous.
  expect(pluginToolWireNameRenames(["foo-bar", "foo--bar"])).toEqual([{ from: "plugin_foo__bar_", to: "plugin_foo____bar_" }]);
  expect(pluginToolWireNameRenamesRefused(["foo-bar", "foo--bar"])).toEqual(["foo-bar"]);

  // THE IDEMPOTENCY CLAIM ITSELF, asserted rather than argued: feed the post-migration world back in and the
  // answer is stable — `foo--bar` is now spelled `foo--bar` still (a slug never changes; only stored NAMES
  // do), so re-deriving from the same installed set yields the same rename, and its `from` prefix no longer
  // matches any row the first pass rewrote. The migration's own second-pass no-op is pinned at the
  // persistence mirrors; this is the derivation half.
  expect(pluginToolWireNameRenames(["foo-bar", "foo--bar"])).toEqual(pluginToolWireNameRenames(["foo--bar", "foo-bar"]));
});

test("REFUSAL 3 — two hyphenated slugs whose legacy namespaces coincide (the pre-#1391 collision itself)", () => {
  // `a-b` and `a-b-c` are distinct plugins, but a stored `plugin_a_b_c_d` is `a-b`'s `c_d` or `a-b-c`'s `d`.
  expect(pluginToolWireNameRenames(["a-b", "a-b-c"])).toEqual([]);
});

test("an UNAMBIGUOUS neighbour does not poison a rename — refusal is per-slug, never per-box", () => {
  // The three showcase slugs as they actually ship: all hyphenated, none a namespace prefix of another.
  expect(pluginToolWireNameRenames(["oracle-deck", "card-atlas", "scene-chips", "mood"])).toEqual([
    { from: "plugin_oracle_deck_", to: "plugin_oracle__deck_" },
    { from: "plugin_card_atlas_", to: "plugin_card__atlas_" },
    { from: "plugin_scene_chips_", to: "plugin_scene__chips_" },
  ]);
  expect(pluginToolWireNameRenamesRefused(["oracle-deck", "card-atlas", "scene-chips", "mood"])).toEqual([]);
});

test("the same slug installed by SEVERAL owners is one rename, not one per install", () => {
  // The census is a per-row read across owners; two users holding the seeded showcase plugin is the normal
  // case, and a duplicated rename would run the whole rewrite loop twice for no reason.
  expect(pluginToolWireNameRenames(["oracle-deck", "oracle-deck", "oracle-deck"])).toEqual([{ from: "plugin_oracle_deck_", to: "plugin_oracle__deck_" }]);
});

test("no installed plugins at all is an empty rename set, not a crash", () => {
  expect(pluginToolWireNameRenames([])).toEqual([]);
  expect(pluginToolWireNameRenamesRefused([])).toEqual([]);
});
