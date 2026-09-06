// domain/plugin/substrate/wire-name-renames — WHICH persisted `plugin_…` namespaces the #1391 boot migrations
// may rewrite, derived from the installed slug set. Pure: no db, no I/O, no clock.
//
// WHY IT LIVES IN THE PLUGIN DOMAIN AND NOT BESIDE EITHER MIGRATION. The persisted spellings sit in two OTHER
// domains' tables (`message_variants.tool_calls` is chat's, `automation_rules.actions` is automation's), and a
// table's OWNER domain writes it — the `migrate-prose-slot-vocab` / `backfill-plugin-provenance` rule. But
// only the plugin domain knows what a plugin's namespace IS. So the knowledge is split the one way the cake
// allows: this function answers "which prefix becomes which", the boot step reads the slugs and hands the
// answer DOWN to each owning domain as plain data, and neither chat nor automation imports a sibling domain.
//
// THE MIGRATION CANNOT DECODE, WHICH IS THE WHOLE REASON THIS FILE IS CAREFUL. The OLD spelling was not
// injective — that is the defect #1391 fixes — so a stored `plugin_foo_bar_baz` genuinely does not say whether
// it was minted by `("foo-bar","baz")` or by `("foo","bar_baz")`. There is no clever reading that recovers it.
// The only honest posture is therefore a per-namespace one: rename a slug's namespace when the installed set
// proves no other slug can be speaking through it, and REFUSE (leave the rows alone, loudly, via the boot
// step's log) when it cannot. A guessed rename would move one plugin's persisted tool cards onto another
// plugin's namespace — strictly worse than the stale name it replaced.

/** The `-` → `_` transliteration as it stood BEFORE #1391. Nothing mints this; it exists only to recognise
 *  what is already on disk. Its non-injectivity is the whole subject of this file. */
function legacyFlat(slug: string): string {
  return slug.replaceAll("-", "_");
}

/** The `-` → `__` transliteration `pluginToolWireName` mints TODAY (`contracts/plugin/registrations.ts` — the
 *  ONE mint; this is a recogniser for its output, not a second mint, which is why it is not exported). */
function liveFlat(slug: string): string {
  return slug.replaceAll("-", "__");
}

/** Can a wire name that begins with the flattened form `a` also be read as belonging to `b`? True when they
 *  are the same namespace, or when one is the other followed by a `_` — because a name under
 *  `plugin_<a>_<rest>` where `a === b + "_" + something` is exactly a name under `plugin_<b>_…` with a longer
 *  tool name. This is the pre-#1391 ambiguity stated as a predicate. */
function sharesNamespace(a: string, b: string): boolean {
  return a === b || a.startsWith(`${b}_`) || b.startsWith(`${a}_`);
}

/** Could `other` be the plugin that a name under `slug`'s legacy namespace — or under the namespace `slug` is
 *  about to be rewritten INTO — actually belongs to? The three tests are spelled out on
 *  {@link pluginToolWireNameRenames}. `slug` itself is never its own rival. */
function rivalsNamespaceOf(slug: string, other: string): boolean {
  if (other === slug) {
    return false;
  }
  return (
    sharesNamespace(legacyFlat(slug), legacyFlat(other)) ||
    sharesNamespace(liveFlat(slug), legacyFlat(other)) ||
    sharesNamespace(liveFlat(slug), liveFlat(other))
  );
}

/**
 * The prefix rewrites the #1391 boot migrations may safely apply, given every installed plugin slug.
 *
 * ONE ENTRY PER HYPHENATED SLUG whose namespace no other installed slug can be mistaken for, as
 * `{ from: "plugin_<legacyFlat>_", to: "plugin_<liveFlat>_" }` — prefixes, not whole names, because the tool
 * half of a persisted name is carried across verbatim and never re-derived.
 *
 * THE THREE REFUSAL TESTS, all of which are "some other installed slug could be speaking here":
 *   1. `legacy(S)` vs `legacy(T)` — a stored name under S's old prefix may be T's. (`foo-bar` beside `foo`:
 *      `plugin_foo_bar_draw` is either `foo-bar`'s `draw` or `foo`'s `bar_draw`.)
 *   2. `live(S)` vs `legacy(T)` — S's rewritten names would land in a namespace T's un-rewritten names still
 *      occupy, so a SECOND run of the migration would rewrite them again. (`foo-bar` beside `foo--bar`.) This
 *      test is what makes the migration idempotent rather than merely correct once.
 *   3. `live(S)` vs `live(T)` — the destination namespaces themselves must stay distinct.
 * A slug that fails any of them is omitted; its rows keep the legacy spelling, and the boot step names it.
 * THE REFUSAL IS PER-SLUG AND DELIBERATELY ASYMMETRIC: in the `foo-bar` / `foo--bar` pair only `foo-bar` is
 * unsafe (test 2 fires for it and for nothing else), and once it is refused nothing is ever written into
 * `foo--bar`'s namespace either — so `foo--bar` migrates and stays idempotent. Refusing both would be safe
 * too, and would strand a plugin whose namespace was never ambiguous. Pinned in the substrate's mirror.
 *
 * A SLUG WITH NO HYPHEN IS NEVER AN ENTRY: its two flattenings are the same string, so there is nothing to
 * rewrite — but it still participates in every test above as a `T`, which is exactly how case 1 bites.
 */
export function pluginToolWireNameRenames(slugs: readonly string[]): readonly { readonly from: string; readonly to: string }[] {
  const distinct = [...new Set(slugs)];
  return distinct
    .filter((slug) => slug.includes("-"))
    .filter((slug) => !distinct.some((other) => rivalsNamespaceOf(slug, other)))
    .map((slug) => ({ from: `plugin_${legacyFlat(slug)}_`, to: `plugin_${liveFlat(slug)}_` }));
}

/** The slugs {@link pluginToolWireNameRenames} REFUSED — the hyphenated slugs whose legacy namespace another
 *  installed slug can also be read as. Returned separately (rather than logged from inside a pure function)
 *  so the boot step can name them: a silent refusal here looks exactly like "nothing needed migrating", and
 *  the whole class of defect this row fixes is a spelling nobody noticed had gone stale. */
export function pluginToolWireNameRenamesRefused(slugs: readonly string[]): readonly string[] {
  const migrated = new Set(pluginToolWireNameRenames(slugs).map((rename) => rename.from));
  return [...new Set(slugs)].filter((slug) => slug.includes("-") && !migrated.has(`plugin_${legacyFlat(slug)}_`));
}
