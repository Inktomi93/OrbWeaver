// domain/plugin/persistence/wire-name-census — the ONE cross-owner read the plugin domain holds, and it
// exists for exactly one caller: the #1391 boot migration of persisted `plugin_…` wire names.
//
// WHY IT IS NOT IN `persistence/plugins.ts`, WHICH IS THE INTERESTING PART. That file's header rules, in
// terms: "there is deliberately NO un-owner-scoped read here for an 'admin may manage any row' branch to
// reach for. Adding one would run one user's untrusted bundle under another user's identity at `setEnabled`."
// That ruling SURVIVES and its mechanism is preserved here rather than reversed — the danger it names is an
// unscoped read of a plugin ROW (id, manifest, grants, status) sitting next to the verbs, where a future
// caller can pick it up by mistake. So this read lives in its own file, returns nothing but a set of SLUG
// STRINGS, and can therefore feed no authority decision at all: there is no id to act on, no manifest to
// execute, and no owner to act as. A verb that reached for it would get a vocabulary, not a subject.
//
// WHY THE MIGRATION NEEDS EVERY OWNER'S SLUGS AND NOT ONE OWNER'S: a wire name is a GLOBAL string. It is
// persisted inside a chat's variant JSON and inside an automation rule's arm list, neither of which records
// which installer's plugin minted it, and `pluginToolWireNameRenames` decides a rename by proving that no
// OTHER installed slug could be speaking through the same namespace. Restricting that proof to one owner
// would make it a weaker proof, not a safer one — it would happily rename `foo-bar`'s rows on a box where
// another user's `foo` also exists, which is precisely the mis-attribution the whole check is there to
// prevent.

import type { Db } from "@orb/db";
import { plugins } from "@orb/db";

/** Every distinct installed plugin slug, across all owners. Read by ONE caller, the boot step
 *  `entry/boot/migrate-plugin-tool-wire-names`, and deliberately the narrowest possible projection — see the
 *  header for why that width is the whole safety argument. */
// THIS READ CARRIES NO OWNER-SCOPE EXEMPTION MARKER, deliberately. That vocabulary is TWO-SIDED and belongs
// to a bare BY-ID read (`owner-scoped-reads`), which this is not: there is no id in the predicate, and no
// predicate at all. A marker here would guard nothing and be RED as a stale exemption — and merely SPELLING
// the marker token in a comment is enough to trip it, which is how this note earned its careful wording. The
// safety argument is the one in the header, and it is structural rather than promised: the projection is a
// single column of slug strings.
export async function readInstalledPluginSlugs(db: Db): Promise<readonly string[]> {
  const rows = await db.selectDistinct({ slug: plugins.slug }).from(plugins);
  return rows.map((row) => row.slug);
}
