---
kind: spec
status: active
updated: 2026-07-03
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
  hostVersion: z.literal(1),                              // the membrane major (01 §3) — refused pre-run if unserved
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
|---|---|---|
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
| `events.subscribe` | `events.on` | grant at activation; delivery filtered to chats where the installer participates (a plugin never observes a room its owner can't see) |
| `tools.register` | `tools.register` | grant at activation; INVOCATION is gated by the tool-use registry's own `can()` row as the installing principal (D48 — 03 §5) |
| `net.fetch` | `net.fetch` | grant + exact-host allowlist + SSRF guard + deadline/size caps (01 §2) |

**Grant flow — who approves:** installing and granting are ONE act by ONE person: the plugin's
**owner** (the installing principal). `installPlugin` presents the declared capability list; the
caller confirms; `granted_capabilities` is stored as the confirmed SUBSET (a paranoid owner may
grant less; the guest feature-detects via `host.grants`). Re-grant required when an UPGRADE
declares new capabilities (upgrade with a superset → row lands `disabled` until re-confirmed).
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
upgradePlugin(ctx, { pluginId, bundle }): Promise<PluginView>       // slug must match; new caps ⇒ lands disabled + re-grant (§2)
setPluginEnabled(ctx, { pluginId, enabled }): Promise<void>         // enabled ⇒ activate in the host (03 §1); disable ⇒ dispose instance + deregister tools/transforms/subs
uninstallPlugin(ctx, { pluginId }): Promise<void>                   // dispose → deregister → delete row (+ KV CASCADE) → delete bundle asset
listPlugins(ctx): Promise<PluginView[]>                             // fetchOwned
getPluginLog(ctx, { pluginId, limit? }): Promise<PluginLogView[]>   // the host.log ring (03 §3)
runSnippet(ctx, { chatId, code }): Promise<SnippetResult>           // the inline mode — 03 §1
```

**v1 install authority: `can(principal, "admin", {kind:"global"})` — owner ∪ admin only.** LEAN,
with the criterion recorded: widen to any-user self-install (the model §2 already supports — every
gate is per-installer) after the membrane-escape suite (04) has soaked and a real non-admin demand
exists. WHY start narrow: the membrane is new security-load-bearing code on a self-hosted box; the
D16/D20/D29 host-only-v1 conservatism applies to code execution more than to anything it ever
applied to. *(Rejected: owner-only (`requireOwner`) — a delegated admin who can already touch every
admin surface gains nothing by exclusion; rejected: open self-install v1 — soak first.)*
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
