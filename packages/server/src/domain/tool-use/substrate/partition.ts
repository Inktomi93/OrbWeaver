// domain/tool-use/substrate/partition — THE PER-OWNER PARTITION of the ONE registry: how an entry is KEYED
// and which entries a given DRIVER may see by name. Two files answer the two halves of contributor scoping:
// `reachability.ts` says whose contributor an entry is; this one says where it LIVES and what a name resolves
// to for a caller.
//
// WHY A COMPOSITE KEY (#677). `plugins` is unique per (owner, slug), not globally — two users installing the
// same plugin is the NORMAL case, and the seeded example plugins install for EVERY user. Both installs produce
// the byte-identical namespaced tool name (`plugin_<slug'>_<name>` — the host derives it from the manifest, and
// the manifest is the same file), so a registry keyed by NAME ALONE made the first user to ENABLE the squatter:
// every later activation caught `ToolNameCollisionError` and landed its row `errored`. Fail-CLOSED (nobody read
// anyone else's tool), but an availability defect that fires the moment two people enable the same example.
//
// THE MODEL-VISIBLE NAME IS UNCHANGED, deliberately. A user id in the wire `function.name` would leak account
// identifiers into every prompt and break the byte-stability the prompt cache depends on for a given attachment
// set. Ownership belongs in the REGISTRY, which is host-side; the model keeps seeing `plugin_<slug'>_<name>`.
//
// KEY INJECTIVITY, proved rather than asserted: the key is `<owner>:<name>` and a `UserId` is a TypeID
// (`[a-z0-9_]`), so it can never contain `:`. Two keys are equal only if their text before the FIRST colon is
// equal — that text IS the owner half — so `owner` is recovered unambiguously no matter what `name` contains.
// This matters because the READ paths key on UNVALIDATED names (a name the model emitted, a name stored in a
// rule): even a name full of colons cannot be shaped into another user's key. The empty owner half is the
// first-party partition; `""` is not a valid `UserId`, so builtins are disjoint from every user's shelf.
//
// The key is BRANDED so this file is the only place a key can be minted — a bare `registry.get(name)` is a type
// error, which is what makes the partition physics instead of etiquette (constitution §2, enforcement tier 2).

import type { UserId } from "@orb/kit/ids";
import type { RegisteredTool, ToolRegistry, ToolRegistryKey } from "../contract/results.ts";

/** The ONE key derivation. `owner` is the INSTALLER for a plugin entry and `null` for a first-party builtin
 *  (which belongs to the process, not to a user — `verbs/register.ts`). */
export function toolRegistryKey(owner: UserId | null, name: string): ToolRegistryKey {
  return `${owner ?? ""}:${name}` as ToolRegistryKey;
}

/** What `name` resolves to FOR `driverUserId`: their own contributor entry if they have one, otherwise the
 *  first-party entry. Never another user's — a name another user installed and this driver did not is simply
 *  absent, which is the whole point of the partition (their turn, their rule, their tools).
 *
 *  The two-step is UNAMBIGUOUS rather than a precedence rule: `registerPluginTool` refuses a name a builtin
 *  already holds, and compose-time `register` runs before any activation, so an entry can never exist in both
 *  partitions at once. The order below therefore never decides anything — it only avoids a second lookup. */
export function lookupForDriver(registry: ToolRegistry, driverUserId: UserId, name: string): RegisteredTool | undefined {
  return registry.get(toolRegistryKey(driverUserId, name)) ?? registry.get(toolRegistryKey(null, name));
}
