---
kind: spec
status: active
updated: 2026-08-24
---

# 02 — Manifest, Capabilities, and the `domain/plugin` Lifecycle

> **Status: COMMITTED (D46) — prescriptive design; the ledger D-entry wins on any conflict.** The
> manifest is the Zed/WASM-component SHAPE borrow D46 named (copy the manifest/capability shape,
> not the runtime).

---

## 1. The manifest (`@orb/contracts/plugin/manifest.ts`)

```ts
export const PLUGIN_CAPABILITIES = [
  "chat.read",          // listMessages / getVariables / current()
  "chat.variables.write",
  "chat.quick_reply",
  "chat.transform",     // D50 PromptTransform registration
  "worldinfo.write",
  "global_vars",        // the installing user's {{getglobalvar}} namespace
  "storage.kv",         // plugin-private KV
  "notify",
  "turn.trigger",       // SPEND
  "imagery.generate",   // SPEND
  "llm.quiet",          // SPEND — a non-canon generation on the installer's summarize connection; writes NOTHING
  "events.subscribe",
  "tools.register",     // D48
  "net.fetch",          // requires netHosts
] as const;
export type PluginCapability = (typeof PLUGIN_CAPABILITIES)[number];

export const pluginManifestSchema = z.object({
  /** Identity: lowercase slug, unique per installing owner. NOT reverse-DNS (nothing federates;
   *  a slug is what users type and logs show). */
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{1,63}$/),
  name: z.string().min(1).max(80),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),          // plugin's own semver (display + upgrade ordering)
  hostVersion: z.number().int().positive(),              // structural major; lifecycle checks the served tuple
  entry: z.literal("main.js"),                            // ONE fixed entry file in the bundle (below)
  description: z.string().max(500),
  author: z.string().max(120).optional(),
  capabilities: z.array(z.enum(PLUGIN_CAPABILITIES)).max(PLUGIN_CAPABILITIES.length),
  /** Exact hostnames net.fetch may reach (no wildcards, no IPs — the SSRF posture; ≤ 8). REQUIRED
   *  iff "net.fetch" is declared (superRefine ties them). */
  netHosts: z.array(z.string().regex(/^[a-z0-9.-]+$/)).max(8).optional(),
}).superRefine(/* netHosts ⟺ net.fetch */);
export type PluginManifest = z.infer<typeof pluginManifestSchema>;
```

**The bundle format:** a zip containing exactly `manifest.json` + `main.js` (a single pre-bundled
ES script — the guest has NO module loader; authors bundle with whatever they like and ship one
file, ≤ 1 MiB). `main.js` runs once at activation: top-level code calls `orb.host(1)` and registers
handlers (`events.on`, `tools.register`, `transforms.register`). *(Rejected: multi-file module
graphs in the guest — a loader inside the membrane is attack surface + version hell for zero
authoring win over `esbuild --bundle`; rejected: reverse-DNS ids — cargo-culted federation
ceremony.)*

## 2. The capability → enforcement map (every row names its enforcer — AGENTS-1 §2.3)

The manifest DECLARES; the grant RECORDS; the host function ENFORCES per call. A capability is
never a boolean the guest trusts — each maps to a concrete host-side mechanism executed under the
**installing principal**:

| Capability | Host functions | Enforcement (per call, host-side) |
| - | - | - |
| `chat.read` | `chat.current/listMessages/getVariables` | grant check + `can(installer,"read",{kind:"chat",roster})` — the installer must be a PARTICIPANT of the invocation chat; the reduced view (01 §2) is the read ceiling |
| `chat.variables.write` | `applyVariableOps` | grant + `can(installer,"host",chat)` — room-state writes are host authority (the D46 member-overlay reservation applies to plugins identically) |
| `chat.quick_reply` | `surfaceQuickReply` | grant + host on the chat |
| `chat.transform` | `transforms.register` | grant at activation; transforms only attach to chats where the installer is HOST (the pipeline registrar filters per chat) |
| `worldinfo.write` | `worldInfo.upsertEntry` | grant + host + book-attached-to-chat (automation-design/03 §1.3's exact rule) + the 64-entry cap |
| `global_vars` | `variables.*` | grant + `fetchOwned` under the installer — cross-user reads structurally impossible |
| `storage.kv` | `storage.*` | grant + row-scoped `(pluginId, ownerId)`; the 256-key/64 KiB caps |
| `notify` | `notifications.post` | grant + host + participants-only recipients + the 60 s floor |
| `turn.trigger` | `chat.requestTurn` | grant + host + the FULL automation budget/consent stack: `automation_budgets` spend ceilings, `initiator:"plugin"` + depth tagging, D17 hosted-cred consent (fail-closed) — byte-for-byte the `trigger_turn` action's gates |
| `imagery.generate` | `imagery.generatePicture` | grant + host + the same SPEND ceilings |
| `llm.quiet` | `llm.quiet` | grant + an HOURLY per-plugin call floor + a membrane prompt cap + the `quiet_generate` output posture. Deliberately NOT host-gated and NOT chat-scoped: it writes no room state and carries no room context, so `canWrite` would claim a protection it does not provide. CLASS 1 — commits nothing, so it never touches the message-write wall. The connection/credential resolve under the INSTALLER's Principal (the `/autobg` `summarizeQuiet` seam), so D17 governs it exactly as it governs every other derive-role call |
| `events.subscribe` | `events.on` | grant at activation; delivery filtered to chats where the installer participates (a plugin never observes a room its owner can't see) |
| `tools.register` | `tools.register` | grant at activation; INVOCATION is gated by the tool-use registry's own `can()` row as the installing principal (D48 — 03 §5) |
| `net.fetch` | `net.fetch` | grant + exact-host allowlist + SSRF guard + deadline/size caps (01 §2) + an HOURLY per-plugin EGRESS floor. The floor is the only bound on a RATE: `safeFetch` bounds each REQUEST and the manifest bounds the DESTINATIONS, while `HOST_CALLS_IN_FLIGHT_MAX` bounds CONCURRENCY — so without it a plugin subscribed to `messageCommitted` egressed once per committed message, forever (the D46 review's tracked finding). The belt sits on the RESOURCE, not on event delivery: a delivery-side belt would miss the identical egress from a tool handler or a D50 transform |

**POSTURE 2 — a non-host installer's act becomes an ASK (the #14 three-posture law, plugins joining
post-#24; interaction spec §3-S4).** Standing authority ⇒ act; NO standing authority ⇒ a SUGGESTION
the room's host confirms; the fourth posture — direct execution without standing authority — never
exists. Every "host" row in the table above used to be a FLAT REFUSAL when `InvocationChat.canWrite`
was false, which is posture 3 wearing posture 2's clothes: safe, but it made "ask" unexpressible and
pushed authors toward installing under a host account.

- **THREE of the five host-gated ops become asks:** `chat.requestTurn`, `worldInfo.upsertEntry`,
  `imagery.generatePicture` — each maps onto an existing `confirmFirst` automation arm, so the
  question a plugin raises is one the product already knows how to ask.
- **TWO stay refusals, deliberately.** `chat.variables.write`: a variable delta is not a
  human-weighable act ("set tension to 5?" cannot be judged without knowing what the plugin means by
  tension), and it is the highest-frequency write in the set, so posture 2 there is an attention
  flood against §3-S4's one-visible-card budget. `chat.quick_reply`: chips are transient display
  strings whose whole value is immediacy — a card the host reads and then approves so the text can
  appear as a chip has already shown them the text.
- **ONE INBOX.** The ask lands in the SAME `SuggestionStore` a rule's does, keyed by the
  `AutomationEmitSource` union (`{kind:"plugin", pluginId}`), answered by the same confirm/dismiss
  verbs. No second proposal system: a second store means a second TTL, a second sweep, and two places
  a host has to look.
- **THE ENFORCEMENT SET FOLLOWS THE ORIGIN.** A confirmed plugin act re-enters through the PLUGIN's
  own bridge (`substrate/confirmed-act.ts`), NOT automation's `runArm`. Two of the three acts have an
  automation arm that looks identical, so the wrong wiring compiles and demos correctly while silently
  swapping which belts apply — the attach gate, the per-plugin 64-entry ceiling and `neutralizeMacros`
  are the plugin's, and a plugin must not gain reach BY BEING CONFIRMED that it lacks when it acts
  directly. The hourly belts apply to a confirmed act too: a host's "yes" is not a budget top-up.
- **The guest is told by TYPE.** `PluginSuggestedError` — not a resolve (which would tell a plugin its
  act ran) and not `PluginCapabilityError` (which would say the grant is missing).
- **Liveness at confirm, fail-closed both ways:** the plugin is still installed AND enabled, and the
  INSTALLER still holds host. On a host handoff the pending ask is VOIDED — no re-mint, no transfer
  to the new host (owner ruling 2026-08-24). Deactivate/uninstall sweeps a plugin's pending asks.
- **No fire row.** `automation_fires` is keyed to a rule by FK and a plugin has none; a synthetic id
  would put a lie in the log §3-S4 works to keep honest.
- **The class-1 wall is untouched.** A suggestion is an ASK, and a confirmed act is the SAME op set
  the plugin could already perform WITH standing authority — never a new one, and never a message
  write.

**Grant flow — who approves:** installing and granting are ONE act by ONE person: the plugin's
**owner** (the installing principal). `installPlugin` presents the declared capability list; the
caller confirms; `granted_capabilities` is stored as the confirmed SUBSET (a paranoid owner may
grant less; the guest feature-detects via `host.grants`). Re-grant required when an UPGRADE widens
declared REACH — a new capability, **or** a `netHosts` entry the prior manifest never declared
(`net.fetch` is parameterized by its allowlist, so a swapped host re-arms the egress wall at a
destination nobody confirmed). Such an upgrade lands the row `disabled` and carries forward the
INTERSECTION of the prior grant with the newly-declared set, so the new capability is not granted.
**Re-confirming is its own verb, `setGrant` — never a side effect of re-enabling.** As built,
`setEnabled` activates with the STORED grant and recomputes nothing; an enable that recomputed the
grant would silently widen authority on every restart, which is the same defect in the opposite
direction. `setGrant` writes the new subset, refuses anything outside the persisted manifest's
declared set, requires the caller to ECHO the exact `netHosts` list it displayed whenever
`net.fetch` is in the grant (the anti-TOCTOU pin — an upgrade landing under a rendered consent
screen must not arm a host the owner never saw), and never enables a disabled plugin.
Spend capabilities carry no extra approver — the installer's own D17/budget gates already bound
them (an installer who isn't the box owner simply cannot consent hosted-cred spend into existence).
*(Rejected: a separate server-owner approval step for every user install — v1 install is
owner/admin-gated anyway (§4), making it approve-twice ceremony.)*

## 3. Storage — DDL intent (`@orb/db/schema/plugin.ts`)

```sql
CREATE TABLE plugins (
  id            TEXT PRIMARY KEY,            -- TypeID, new prefix: plugin
  owner_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,   -- the installing principal
  slug          TEXT NOT NULL,               -- manifest.id
  name          TEXT NOT NULL,
  version       TEXT NOT NULL,
  manifest      TEXT NOT NULL,               -- json: the FULL validated manifest (provenance; re-validated on load)
  bundle_asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE RESTRICT,  -- main.js bytes in the per-user CAS
  granted_capabilities TEXT NOT NULL,        -- json: PluginCapability[] ⊆ manifest.capabilities
  status        TEXT NOT NULL CHECK (status IN ('disabled','enabled','errored')),
  consecutive_crashes INTEGER NOT NULL DEFAULT 0,       -- the 03 §4 auto-disable counter
  last_error    TEXT,
  installed_at  INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  UNIQUE (owner_id, slug)
);

CREATE TABLE plugin_kv (                      -- the storage.kv plane
  plugin_id  TEXT NOT NULL REFERENCES plugins(id) ON DELETE CASCADE,
  owner_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,   -- denormalized guard column (belt: WHERE both)
  key        TEXT NOT NULL,                   -- ≤ 128 chars
  value      TEXT NOT NULL,                   -- ≤ 64 KiB CHECK
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (plugin_id, key)
);
```

The bundle rides the assets CAS (`"plugin"` joins `ASSET_KINDS` — additive tuple member) — bytes
belong in the byte store, not a BLOB column; RESTRICT because a deleted bundle under an installed
plugin is corruption, and `uninstallPlugin` deletes row-then-asset in one verb. **ID prefix added:**
`plugin: "plugin"`.

## 4. Lifecycle verbs (`domain/plugin/verbs/`)

```ts
installPlugin(ctx, { bundle: Uint8Array, grant: PluginCapability[] }): Promise<PluginView>
  // unzip → validate manifest (zod) + hostVersion served + grant ⊆ declared → store bundle in CAS
  // → row status 'disabled' (enabling is a second explicit act, like rules)
upgradePlugin(ctx, { pluginId, bundle }): Promise<PluginView>       // slug must match; widened reach ⇒ lands disabled, grant intersected (§2)
setPluginGrant(ctx, { pluginId, grant, acknowledgedNetHosts }): Promise<PluginView>
  // the RE-CONSENT act (§2): grant ⊆ the PERSISTED manifest's declared set; net.fetch requires the
  // caller to echo the netHosts it displayed; restarts a resident so running grants == the row;
  // NEVER enables a disabled plugin (enable and re-grant stay two separate owner decisions)
setPluginEnabled(ctx, { pluginId, enabled }): Promise<void>         // enabled ⇒ activate in the host (03 §1) under the STORED grant; disable ⇒ dispose instance + deregister tools/transforms/subs
uninstallPlugin(ctx, { pluginId }): Promise<void>                   // dispose → deregister → delete row (+ KV CASCADE) → delete bundle asset
listPlugins(ctx): Promise<PluginView[]>                             // fetchOwned
getPluginLog(ctx, { pluginId, limit? }): Promise<PluginLogView[]>   // the host.log ring (03 §3)
runSnippet(ctx, { chatId, code }): Promise<SnippetResult>           // the inline mode — 03 §1
```

**Install authority: ANY authenticated principal, for themselves — the row's `ownerId` is the whole
gate (owner-ruled 2026-08-24, `Core-Path-Registry.md` D147).** The paragraph that stood here recorded
`can(principal,"admin",{kind:"global"})` as a LEAN with an explicit widening criterion ("widen to
any-user self-install — the model §2 already supports it, every gate is per-installer — after the
membrane-escape suite has soaked and a real non-admin demand exists"). Both halves came due: the
suite soaked and the owner ruled the demand. D147 is the resolution of this clause, not a
contradiction of it — the mechanism §2 describes is unchanged, its CONDITION moved. D147 also adds
what this clause did not anticipate: there is no admin any-row branch either, because enabling a
plugin runs its guest code as the CALLER.
`runSnippet` authority: any chat PARTICIPANT for read-only snippet profiles, host for the writing
profile (03 §1).

## 5. The 8-slot layout (`domain/plugin/`)

```
domain/plugin/
├── index.ts            FRONT DOOR — PluginService + factory
├── service.ts          COMPOSITION ROOT — zero logic
├── context.ts          DI BUNDLE — { db, clock, can, assets: AssetStoreOps, host: PluginHostPort, ops: PluginHostOps }
├── contract/
│   ├── service.ts      PluginService
│   ├── params.ts       Install/Upgrade/SetEnabled/RunSnippet params
│   ├── results.ts      PluginView · SnippetResult · PluginLogView
│   ├── errors.ts       ManifestInvalidError · HostVersionUnservedError · CapabilityNotGrantedError · PluginCrashedError
│   └── ops.ts          PluginHostOps — the injected op bundle the MEMBRANE's host functions call
│                       (chat/worldInfo/notifications/imagery/tool-use/transform-registrar ops —
│                       the same op TYPES automation-design/04 §4 defines, reused not redeclared)
├── verbs/              one verb per file (§4)
├── persistence/        plugins.ts · plugin-kv.ts (queries only)
├── substrate/          manifest.ts (zod + bundle unzip/validate, pure) · grants.ts (subset math)
└── activation/         NAMED SUBSYSTEM — activate.ts / deactivate.ts (drive PluginHostPort:
                        create context → realm setup → run main.js → collect registrations →
                        hand tools/transforms/subs to their registries) · crash-policy.ts (03 §4)
```

`PluginHostPort` is the infra seam (`infra/plugin-host`'s front door): `createInstance(bundle,
grants, ops, budgets) → PluginInstance`, `invoke(instance, entry, args)`, `dispose(instance)` —
domain/plugin drives it; the port never sees a DB row. The one-directional flow holds: transport →
domain/plugin → infra/plugin-host → (nothing).
