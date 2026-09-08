// Gate: query-freshness-coverage — the FROZEN-SURFACE ratchet. The app's QueryClient runs
// `staleTime: Infinity` + `refetchOnWindowFocus: false` (packages/client/src/data/query-client.ts), so a
// client-consumed tRPC QUERY key that appears in ZERO invalidation rows has NO freshness driver at all: the
// surface it feeds is frozen at its first fetch until the query is GC'd (5 min unobserved) or the page
// reloads. `chat.previewAssembly` + `chat.getShapeTrace` shipped exactly that way — the Preview tab showed a
// pre-re-pin snapshot forever and nothing was red.
//
// The reconcile (the D50 bus-coverage / D107 knob-wire discipline): every consumed key must be COVERED by a
// row in the central invalidation seam, or carry a cited registry entry — STATIC (sanctioned: no bus row is
// warranted, with the reason) or DEFERRED (tracked staleness debt, with the remediation). Self-cleaning in
// BOTH directions: a cited key that GAINS a row is STALE-RED; an entry naming a key nothing consumes any more
// is ORPHAN-RED. The seam module is the file pairing `createInvalidation` with its `Invalidation` anchor,
// never the first same-named symbol and never a hardcoded path
// (path-keyed-gates-die-on-rename), with a paired-anchor tripwire so a rename REDs loudly instead of going
// vacuous-green.
//
// DECLARED BLIND SPOTS (each is a deliberate literal-shape limit, not an oversight):
//  1. LITERAL SHAPE ONLY, both sides. A key is read off the source `trpc.<router>.<proc>.queryOptions(`
//     chain. Computed/aliased access (`trpc[router][proc]`, a destructured proc, a factory handed the proc as
//     a parameter) is invisible: an aliased CONSUMER is never enumerated (a frozen surface this gate cannot
//     see), and an aliased COVERAGE row never counts (a false RED — fix it by writing the row literally, NOT
//     by citing the key). The mustFlag/mustPass pair pins what the literal form DOES catch.
//  2. NAME-KEYED receiver: the chain base must be an identifier/property named `trpc` (so `trpc.` and
//     `deps.trpc.` both work). A differently-named binding (`(t) => t.chat.…`) is invisible on both sides.
//  3. Coverage means a ROW EXISTS, never that the row is CORRECT: whether the event that carries it ever
//     fires, and whether its `queryFilter(input)` matches the consumer's input, are out of scope. This gate
//     proves a declared driver, not a working one.
//  4. Feature-local drivers are NOT coverage — a mutation's own `invalidates`, an SSE adapter calling
//     `invalidation.invalidateFilters([...])`, and a per-query finite `staleTime` are real freshness that
//     lives OUTSIDE the seam. Those keys take a cited registry entry naming the driver; the citation IS the
//     deliverable (the reason gets written down where the next reader finds it).
//  5. `queryKey`-only sites (a `peekQueryData` cache peek, an optimistic-mutation `readKey`) are not
//     consumption: no observer, no surface, nothing to freeze.
//  6. Coverage reachability is computed INSIDE the seam module, from `createInvalidation` outward — a filter
//     in a helper nothing reaches is dead and does not count.
//
// Registration: Core-Enforcement-Active-Gates.md (Layer 3) + the `__g_` fixture in
// tests/tooling/check-gates.repo.int.test.ts. Seam: packages/client/src/data/invalidation.ts.
import type { Node, Project, SourceFile } from "ts-morph";
import { Node as N, SyntaxKind } from "ts-morph";
import type { ExemptionTable, GateDescriptor, GateRunCtx } from "../contract/gate.ts";

// ── the two-map registry (keyed "<router>.<proc>") ───────────────────────────────────────────────────────
// STATIC = a SANCTIONED uncovered key: a bus row is not warranted, and the entry says why (the datum does not
// change in-session, or its freshness driver deliberately lives outside the seam — blind spot 4). DEFERRED =
// TRACKED STALENESS DEBT with its remediation. Delete an entry the moment the key gains a seam row (the gate
// REDs the stale entry). Founding set triaged against the live tree 2026-07-31, consumer by consumer.
const STATIC: ExemptionTable = {
  // ── identity / content-addressed / self-keyed reads: the datum cannot go stale for its key ──────────────
  "assets.resolveBlobRefs": {
    why: "the OWNER-scoped twin of `assets.resolveChatBlobRefs` below, same content-addressed argument: keyed by the requested asset ids over CONTENT-ADDRESSED blobs (features/imagery/components/image-detail-body.tsx resolves hash+mime to build the set-as-background source). An asset's hash never changes — `packages/server/src/domain/assets/` carries ZERO `update(assets)` sites, and a re-upload mints a NEW id (D21), so a change produces a new key rather than a stale answer. A DELETED asset drops out of the owner join and the frozen entry can only hand back a hash the server's own ownership gate then refuses — a refused write, never a wrong one.",
  },
  "assets.resolveChatBlobRefs": {
    why: "keyed by (chatId, the row's asset ids) over CONTENT-ADDRESSED blobs (features/chat/hooks/attachment-url-provider.tsx): the hash behind an assetId never changes, so the resolved map is immutable for its key.",
  },
  "chat.getVariantWire": {
    why: "keyed by (chatId, variantId) over a COMMITTED variant's stamped generation record (features/chat/components/variant-wire-viewer.tsx). A variant's prompt/params/draws are written once at commit and never updated: an edit mints a new variant and a swipe APPENDS one, so a new key is what a change produces — the old key's answer stays true forever. Deleting the message makes the key resolve NOT_FOUND, which the viewer renders as its typed gone-arm.",
  },
  "imagery.readProvenance": {
    why: "keyed by assetId over a WRITE-ONCE generation record (features/imagery/components/provenance-strip.tsx — the lightbox's prompt/model/mode/cost strip). The `imagery_generations` row is stamped at generation and never updated: `packages/server/src/` carries ZERO `update(imageryGenerations)` sites, and an EDIT mints a new asset with its own new row (`edited:true`), so a change produces a NEW key — the old key's answer stays true forever (the `chat.getVariantWire` argument, same shape). A non-generated or foreign asset resolves `null` through the owner join, which the strip renders as its typed no-details arm.",
  },
  "search.search": {
    why: "input-keyed live search (features/discovery/components/corpus-search-results.tsx) — the query text + `over` target are part of the key, so every new search is a cold fetch of a NEW cache entry.",
  },
  "search.fields": {
    why: "input-keyed BM25 lexical search (same surface) — the query string is part of the key; re-running the identical query inside gcTime correctly returns the same corpus answer.",
  },
  "search.suggest": {
    why: "input-keyed prefix suggest (features/discovery/surfaces/corpus-list-surface.tsx) — keyed by the deferred query text, gated on a minimum length; each keystroke is its own key.",
  },

  // ── freshness driven OUTSIDE the seam, deliberately (blind spot 4) — each names its real driver ─────────
  "chat.checkSendAvailability": {
    why: "carries its OWN finite staleTime (AVAILABILITY_STALE_MS = 15s, features/chat/hooks/use-send-availability.ts). The fact it reads (an engine coming up, a key being added) has NO producer to emit an event; that documented 15s window is the driver, and the file explains why a poll/focus-refetch was rejected.",
  },
  "admin.vllmEngines": {
    why: "POLLS: features/user-admin/components/admin-engines-section.tsx sets a status-adaptive `refetchInterval` (fast while an engine is mid-transition, slow at steady state) — an engine's liveness is a machine fact no bus announces.",
  },
  "notifications.presence": {
    why: "POLLS (#1039): features/chat/hooks/use-roster-presence.ts sets `refetchInterval = PRESENCE_POLL_MS` (20s) beside a finite 10s staleTime, and the hook's header argues the choice — presence has NO bus (the registry is a ref-count over open sockets with no event and no fan-out), the roster it decorates is itself a query, and the server debounces disconnects behind a 15s grace window, so a sub-second driver could not see a change sooner than the poll does. The `admin.vllmEngines` shape exactly: a machine liveness fact nothing announces. The row goes STALE-RED the day presence grows a bus member and the seam gains its filter, which is the intended end condition.",
  },
  "notifications.list": {
    why: "driven by the durable inbox SSE adapter (features/notifications/hooks/use-inbox-stream.ts) — every arrival AND every transition into the live state calls invalidation.invalidateFilters([notifications.list]); the bell's own mark-read/dismiss mutations `invalidates` it too.",
  },
  "workloads.list": {
    why: "driven by the per-row workload SSE adapter (features/workloads/hooks/use-workload-stream.ts) — every non-progress event (state change, error, reconnect) invalidates the list through the seam; `progress` stays a row-local buffer by design.",
  },

  // ── writer-local: the ONLY producer is a mutation in the same surface, which cites the filter ───────────
  "workloads.listSchedules": {
    why: "writer-local — the four schedule mutations (features/workloads/hooks/use-workload-mutations.ts) each `invalidates` it. Schedules are per-user and edited from exactly one pane; no second producer can change them behind it.",
  },
  "admin.listUsers": {
    why: "writer-local — every admin user write (features/user-admin/hooks/use-admin-mutations.ts) `invalidates` it. The writes land on OTHER users' rows, so the actor's own user-bus never carries them (the hook's own header); the mutation is the only possible driver.",
  },
  "admin.listSessions": {
    why: "writer-local — the session revoke/reset/kill mutations (features/user-admin/hooks/use-admin-mutations.ts) each `invalidates` it; another user's session lifecycle reaches this admin's bus through nothing.",
  },
  "settings.getAppSettings": {
    why: "writer-local — AppSettings is admin-only and emits no user-bus event; both writers (`useUpdateAppSettings`/`useUpdateAppOverrides` in features/user-admin/hooks/use-admin-mutations.ts and the system-settings surface's own mutation) `invalidates` it.",
  },
  "settings.getAppSettingsWithOverrides": {
    why: "writer-local — the floor-vs-override read of the admin tuning sections; its sole writer `useUpdateAppOverrides` invalidates it alongside `getAppSettings` (same admin-only, bus-less write path).",
  },
  "invites.listInvites": {
    why: "writer-local — the invite create/revoke mutations (features/chat/hooks/use-invite-mutations.ts) `invalidates` the list, and it is the inviting host's own dialog surface (nobody else's action adds a link).",
  },
  "rpg.listCheckpoints": {
    why: "writer-local — create/restore checkpoint (features/rpg/hooks/use-rpg-mutations.ts) each `invalidates` it. Marks are HOST-only and written from this one pane, so the acting tab is the only tab that can be stale.",
  },
  "assets.listGallery": {
    why: "writer-local — add/remove gallery art (features/chat/hooks/use-character-gallery.ts) `invalidates` it; the gallery dialog is the only writer of the junction it reads.",
  },

  // (The 27 `discovery.*` rows + `search.similarArt` that stood here were DELETED 2026-08-14, and their own
  //  prose predicted it word for word: "A row becomes POSSIBLE only once a corpus-recompute event exists
  //  (then these entries go stale-RED and get deleted, which is the point)." The `corpusRecomputed` user-bus
  //  member landed — event-bus coverage survey §2.5/§3.4-4/F6 — fanned at the terminal of all six background
  //  passes (discovery's five analytics kinds + the embeddings `index` sweep), and the seam gained
  //  `trpc.discovery.pathFilter()` + `trpc.search.similarArt.pathFilter()`. Every one of the 28 keys went
  //  stale-RED in the same run. `search.search`/`fields`/`suggest` deliberately did NOT join them: they are
  //  input-keyed live queries and keep their own rows above.)

  // (The four `databank.*` rows that stood here were DELETED 2026-08-14 for the same reason and by the same
  //  machinery: the `databankChanged` user-bus member landed — survey H3 — every persisting verb emits it,
  //  the ingest subsystem fans it per touched owner at its terminal, and the seam gained
  //  `trpc.databank.pathFilter()`. The rows' citation had rested on "USER_BUS_EVENT_TYPES has ten members
  //  and none is databank", which is precisely the kind of premise a citation should not be allowed to
  //  outlive. The library's bounded mid-ingest `refetchInterval` STAYS and is not a freshness citation: it
  //  drives PROGRESS between enqueue and terminal, which no event reports and none should.)

  // (The five `refinery.*` rows that stood here were DELETED 2026-08-14 by the machinery working as
  //  designed: the `refineryChanged` user-bus member landed — event-bus coverage survey H1/F1 — the seam
  //  gained its row, and all five keys went STALE-RED in the same run. That is the self-cleaning direction
  //  this registry exists to demonstrate, and it is the answer to any future "no bus event exists" citation:
  //  mint the event instead.)

  // ── the upload seam: a RAW multipart POST, so its freshness lives outside the seam (blind spot 4) ────────
  "assets.listOwned": {
    why: "driven by the upload front door `useUploadAsset` (data/use-upload-asset.ts) — every completed upload calls invalidation.invalidateFilters([trpc.assets.listOwned.pathFilter()]). The upload route is a raw multipart POST, not a tRPC mutation, so it can carry no `invalidates` and no bus event announces it; the hook IS the driver, and every feature upload (character/persona avatars, backgrounds, chat attachments) goes through it. Proven by tests/client/data/use-upload-asset.ct.tsx (the mounted listOwned read refetches after an upload).",
  },

  // ── B2 automation RULES: TWO out-of-seam drivers per key (blind spot 4), plus one immutable catalogue ────
  // The automation bus is deliberately NOT an invalidation seam — its client consumer is a REDUCER over the
  // in-RAM pending-ask list (features/automation/lib/apply-automation-bus-event.ts), because a pending ask
  // has no query behind it (RULED F1). The rule-lifecycle READS are driven from the feature instead, and
  // both drivers are real and tested.
  "automation.listRules": {
    why: "TWO feature-local drivers (blind spot 4). (1) Every rule-lifecycle mutation `invalidates` it — setRuleEnabled/deleteRule/runRuleNow/createRuleFromPreset in features/automation/lib/rule-mutations.ts all carry trpc.automation.listRules.queryFilter({chatId}). (2) The REMOTE-fire edge, which no mutation can see: rules-section.tsx's `useRuleFeedInvalidation` joins the chat's `automation` bus room and calls invalidation.invalidateFilters([listRules.queryFilter]) on ruleFired/ruleErrored/ruleAutoDisabled/rulesChanged, so a rule firing from a real turn moves `enabled`/`lastFiredAt`/`lastError` without a local write. Proven by tests/client/features/automation/components/rules-section.ct.tsx (toggle/Test/Run-now each drive the proc and the list reconciles).",
  },
  "automation.listFires": {
    why: "Same TWO drivers as automation.listRules, keyed by ruleId: testRule/runRuleNow `invalidates` trpc.automation.listFires.queryFilter({ruleId}) (rule-mutations.ts), and the automation-room feed in rules-section.tsx invalidates the fired rule's log on ruleFired/ruleErrored. This is the host's 'why didn't my rule fire' log, so the REMOTE edge is the one that matters — a bus-driven fire is exactly the row it exists to show.",
  },
  "automation.listOwnerRules": {
    why: "C5's owner-GLOBAL rule list, and it has exactly ONE driver where its per-chat twin has two (blind spot 4). (1) Every rule-lifecycle mutation `invalidates` it — the same five verbs drive both surfaces, and `ruleListFilter` in features/automation/lib/rule-mutations.ts maps a `chatId: null` scope onto trpc.automation.listOwnerRules.queryFilter(). (2) There is NO remote-fire edge, and that is a structural fact rather than a gap this cite is hiding: `AutomationBusEvent` is the per-CHAT feedback bus (every member carries a chatId; transport/trpc/stream/sources/automation.ts fans it to one chat's subscribers), so a chat-less rule's fire reaches no subscriber and there is no channel a bus row could ride. The durable fire LOG under each row is what answers 'did it run', and it is re-read on open. Ends the day an owner-plane bus member exists (it would need its own producer belt, coverage sites and a per-USER stream source). Proven by tests/client/features/automation/components/owner-rules-surface.ct.tsx.",
  },
  "automation.getOwnerBudgets": {
    why: "C5's owner-GLOBAL fire-rate ceiling. Its ONLY writer is `setOwnerBudgets`, which `invalidates` trpc.automation.getOwnerBudgets.queryFilter() (features/automation/lib/owner-budget-mutations.ts) — a single-owned belt row nothing else can move: no other principal may write it (the plane is keyed by the caller's own userId) and no bus event touches it. Same no-remote-edge argument as automation.listOwnerRules above.",
  },
  "automation.listRulePresets": {
    why: "IMMUTABLE for the session: the rule-preset catalogue is a pure projection of a compile-time Record (domain/automation/contract/presets.ts via verbs/list-rule-presets.ts — no principal, no chat, no db, per its own header). It cannot change without a deploy, so no bus row is warranted and no mutation can move it; the picker refetching it would answer identically forever.",
  },
  // The D46 plugin lifecycle emits NO bus event at all — there is no plugin room, and `plugin.list` is a
  // per-OWNER catalog read rather than a room read, so there is no channel a bus row could ride. Every
  // mover of these two reads is a mutation the acting tab itself issued, which makes them the writer-local
  // class this table already holds for the admin surfaces above.
  "plugin.list": {
    why: "writer-local — the plugin lifecycle has no bus event (no plugin room; `plugin.list` is a per-owner catalog read), and all four writers `invalidates` it: install/upgrade/setEnabled/uninstall in features/plugin/lib/plugin-mutations.ts each carry trpc.plugin.list.queryFilter(). The SINGLE-WRITER claim rests on OWNERSHIP, not on a role gate (D147, restated 2026-08-24 when plugins went user-scoped and the admin gate came off the verbs): a `plugins` row is stamped ownerId = the installing principal, every management verb loads it through the owner-scoped getById(db, caller.userId, pluginId), and there is no admin any-row branch — so the only principal who can move this catalog is the one reading it, in the tab that issued the write. Proven by tests/client/features/plugin/surfaces/plugins-settings-surface.ct.tsx (install and the enable toggle each reconcile the list from the server's new truth) and by the cross-tenant sweep's four plugin probes (a stranger holding the owner's real pluginId gets NOT_FOUND from upgrade/setGrant/setEnabled/uninstall).",
  },
  "plugin.listSurfaces": {
    why: "writer-local, SAME class as `plugin.list` above (plugin-ui-plane #679 U1) — the resident surface SET is a projection of the plugin lifecycle, which has NO bus event (no plugin room). A plugin's surfaces come and go only on the owner-scoped lifecycle writes that move whether/what it runs: setEnabled brings a plugin's registrations resident or drops them, upgrade swaps the bundle (a different surface set), uninstall removes them — and each of those three `invalidates` trpc.plugin.listSurfaces.queryFilter() in features/plugin/lib/plugin-mutations.ts. (install lands the row `disabled` with nothing resident, so it needs no listSurfaces invalidate — the covering setEnabled does.) The ownership single-writer argument is identical to plugin.list's: registrations are stamped through the owner-scoped plugin row, no admin any-row branch, so the only principal who can move this set is the one reading it in the tab that issued the write. NOTE the per-surface STATE read `plugin.getSurfaceState` is DIFFERENT — it IS bus-driven (`pluginSurfaceStateChanged`, host.ui.setState) and lives in the seam, not here; only the registration LIST is writer-local. Proven by tests/client/features/plugin/components/plugin-surface-renderer.ct.tsx (the affinity-tracker panel renders from listSurfaces and round-trips).",
  },
  "plugin.listCommands": {
    why: "writer-local, the EXACT twin of `plugin.listSurfaces` above (plugin-ui-plane #679 U5) — a plugin's registered COMMAND set is the same projection of the same resident instance, collected by the same activation and dropped by the same deactivate. It moves only on the owner-scoped lifecycle writes that move whether/what a plugin runs, and the same three carry it: setEnabled (activation collects the commands, disable drops them), upgrade (a new bundle registers a different set) and uninstall each `invalidates` trpc.plugin.listCommands.queryFilter() in features/plugin/lib/plugin-mutations.ts. (install lands the row `disabled` with nothing resident, so the covering setEnabled is the one that matters.) The ownership single-writer argument is identical: registrations are stamped through the owner-scoped plugin row, there is no admin any-row branch, so the only principal who can move this set is the one reading it in the tab that issued the write. Its two READERS are always-mounted chrome — the `/plugin` composer dispatcher and the Plugins wand menu — which is precisely why it is cited here rather than left uncovered: a frozen command list is a menu that lists a plugin a person just uninstalled. Proven by tests/server/domain/plugin/verbs/list-commands.int.test.ts (enable/disable each move the projection) and tests/server/entry/boot/seed-example-plugins.int.test.ts (a REAL activation over the WASM runtime registers the oracle deck's two commands).",
  },
  "plugin.listDistributed": {
    why: "writer-local, and more strictly than its siblings: the PUBLISHED set (D147 clause (d)) has exactly two movers and both are admin verbs this same surface issues — `installForAllUsers` and `uninstallForAllUsers` in features/plugin/lib/plugin-mutations.ts each carry trpc.plugin.listDistributed.queryFilter(). Nothing else can move it: it is DEPLOYMENT POLICY rather than anyone's data, so no per-user act (an install, an uninstall, an upgrade of somebody's own copy) touches the record, and there is no bus channel for the same reason plugin.list has none (no plugin room). The one un-covered edge is a SECOND admin publishing from another session, which is the ordinary two-operators-one-console case this table already accepts for the admin.* reads above — and the section re-reads on open. Proven by tests/client/features/settings/surfaces/settings-shell-surface.ct.tsx (an admin publishes and the published list repaints from the server's new truth).",
  },
  "plugin.listDisplayTransforms": {
    why: "writer-local, the EXACT class as `plugin.listSurfaces` above (plugin-ui-plane seam 14, U6) — a plugin's registered DISPLAY transforms are a projection of the same resident instance, so the same three owner-scoped lifecycle writes move them and the same three already `invalidates` the sibling key: setEnabled brings a plugin's registrations resident or drops them, upgrade swaps the bundle, uninstall removes them (features/plugin/lib/plugin-mutations.ts). The ownership single-writer argument is identical (D147: no admin any-row branch, so the only principal who can move this set is the one reading it, in the tab that issued the write). It is deliberately not folded into `listSurfaces`: its ONE job is the per-row BYTE-IDENTITY gate — a viewer with no display transforms must learn so in one room-level query and make zero per-row calls — and a key that answers a cost question wants to be independently cacheable. Proven by tests/server/domain/plugin/verbs/list-display-transforms.int.test.ts (a disabled plugin contributes none; a stranger sees none).",
  },
  "plugin.transformForDisplay": {
    why: "STATIC by CONSTRUCTION, and the strongest form of it in this table: the key CARRIES its own content identity. Its input is `(chatId, messageId, text)` where `text` is the row as this viewer's client has already rendered it, and the answer is a pure function of that input plus the viewer's registered transforms — so an edit, a swipe, or a macro re-resolve produces a DIFFERENT key rather than a stale entry, and a repaint of the same bytes correctly resolves from cache (which is the point: the round-trip is per visible ROW, and a freshness driver that refetched it would be a transcript-wide query storm). The one thing that can change the ANSWER for an unchanged key is the transform SET moving, which is exactly the sibling key above — and that key's own three writers already repaint the surface that consumes this one. Proven by tests/server/domain/plugin/verbs/transform-for-display.int.test.ts.",
  },
  "plugin.listBundleAssets": {
    why: "writer-local, and the NARROWEST member of the plugin family above (#820 seam 11) — the `ui/assets/` path → CAS-id map is a projection of the INSTALLED BUNDLE, so exactly one act can move it for an existing key: an UPGRADE, which replaces the bundle-asset set wholesale (clear-then-insert in `applyUpgrade`). Both upgrade mutations carry it — `useUpgradePlugin` and `useUpgradePluginFromStoredUrl` in features/plugin/lib/plugin-mutations.ts each `invalidates` trpc.plugin.listBundleAssets.queryFilter(). The other lifecycle acts CANNOT produce a stale answer for a live key: install mints a NEW pluginId (a new key, a cold fetch), uninstall removes the row and unmounts every surface that could read it, and setEnabled/setGrant move residency and consent without touching the zip. The ownership single-writer argument is identical to plugin.list's (D147: the map is read through the owner-scoped `getById`, there is no admin any-row branch, so the only principal who can move it is the one reading it in the tab that issued the write). Staleness here is BOUNDED and non-leaking by construction even if a driver were missed: a dropped path resolves to nothing and paints the node's placeholder, and every id the map yields still rides the owner-scoped `assets.resolveBlobRefs`, so a frozen map can show LESS art, never another owner's. Proven by tests/client/features/plugin/components/plugin-surface-renderer.ct.tsx (a shipped path paints; one the plugin never shipped stays a placeholder and never poisons the resolve set) and tests/server/domain/plugin/verbs/upgrade.int.test.ts (the set is replaced, not merged).",
  },
  "plugin.getLog": {
    why: "writer-local — the host.log ring only moves when the plugin RUNS, and the two client acts that can start a run both `invalidates` it: setEnabled (activation logs, or fails and writes lastError) and upgrade (a re-activation on the new bundle) in features/plugin/lib/plugin-mutations.ts carry trpc.plugin.getLog.queryFilter({pluginId}). A run triggered by a chat event moves it with no client act, and that edge is DELIBERATELY not covered here: the log is a disclosure the owner opens on demand, so it refetches when opened rather than streaming — the frozen-tab class this gate guards needs a MOUNTED read, and this one is mounted only inside its own Collapsible.",
  },
};

// Empty today — every founding deferral was resolved 2026-08-01 (the twelve `stats.*` reads gained the
// `chatsChanged` row; `assets.listOwned` gained its upload-seam driver and moved to STATIC above). The lane
// stays: this is where a key with a REAL freshness debt gets tracked with its remediation, rather than being
// laundered into STATIC (which asserts the key is fine as-is).
const DEFERRED: ExemptionTable = {
  "automation.listChatActivity": {
    why: "the host-only room Activity readout (features/automation/components/room-activity-log.tsx) reads on tab mount; a new fire lands SERVER-side with no client bus event to drive invalidation. v1 is a read-on-open readout (switching CONTEXT tabs remounts and refetches); the live in-view fire-arrival digest is the separately-priced B6 reactions-while-away bus (interaction-direction-spec B11 / R5). Remediation: add the invalidation row when B6's bus carries the fire-arrival signal.",
  },
};

// ── the seam, found BY SYMBOL (never by path) ────────────────────────────────────────────────────────────
const SEAM_FACTORY = "createInvalidation";
// Companion anchor: the seam's exported interface. Present while the factory is not ⇒ the factory was renamed
// away and the coverage side would go vacuous-green (every key RED, or — worse on a partial tree — silent).
const SEAM_ANCHOR = "Invalidation";

const CLIENT_SRC = /\/packages\/client\/src\//u;

/** The read terminals that CREATE a cache observer (blind spot 5 excludes `queryKey`). */
const READ_TERMINALS = new Set(["queryOptions", "infiniteQueryOptions"]);
/** The invalidation-filter terminals the tRPC proxy exposes. */
const FILTER_TERMINALS = new Set(["pathFilter", "queryFilter"]);

const TRPC_BASE_RE = /^trpc$/iu;

/** Real-tree sentinels: consumed keys the REAL client always produces. The ORPHAN arm judges only when one is
 *  present, so a synthetic conformance mini-tree (its own tiny key set) never orphan-flags the founding
 *  entries (the knob-wire-coverage / verify-registry-parity real-root guard). */
const REAL_TREE_SENTINELS: readonly string[] = ["chat.listMessages", "sessions.me"];

interface QueryKey {
  readonly router: string;
  readonly proc: string;
}

/** Is `node` a `<base>.<router>.<proc>.<terminal>` chain whose base is named `trpc`? Returns the key. */
function trpcChain(node: Node, terminals: ReadonlySet<string>): QueryKey | undefined {
  if (!(N.isPropertyAccessExpression(node) && terminals.has(node.getName()))) {
    return;
  }
  const procAccess = node.getExpression();
  if (!N.isPropertyAccessExpression(procAccess)) {
    return;
  }
  const routerAccess = procAccess.getExpression();
  if (!N.isPropertyAccessExpression(routerAccess)) {
    return;
  }
  if (!baseIsTrpc(routerAccess.getExpression())) {
    return;
  }
  return { router: routerAccess.getName(), proc: procAccess.getName() };
}

/** A `<base>.<router>.<terminal>` chain (the ROUTER-ROOT `pathFilter()` — it covers every proc under it). */
function trpcRootChain(node: Node, terminals: ReadonlySet<string>): string | undefined {
  if (!(N.isPropertyAccessExpression(node) && terminals.has(node.getName()))) {
    return;
  }
  const routerAccess = node.getExpression();
  if (!N.isPropertyAccessExpression(routerAccess)) {
    return;
  }
  return baseIsTrpc(routerAccess.getExpression()) ? routerAccess.getName() : undefined;
}

/** The chain base is the tRPC proxy: a bare `trpc` identifier or a `<x>.trpc` property (blind spot 2). */
function baseIsTrpc(base: Node): boolean {
  if (N.isIdentifier(base)) {
    return TRPC_BASE_RE.test(base.getText());
  }
  return N.isPropertyAccessExpression(base) && TRPC_BASE_RE.test(base.getName());
}

// ── side 1: the CONSUMED keys (every observer-creating read under packages/client/src) ────────────────────
interface Consumption {
  readonly key: string;
  readonly node: Node;
}

function consumedKeys(project: Project): Map<string, Node> {
  const out = new Map<string, Node>();
  for (const sf of project.getSourceFiles()) {
    if (!CLIENT_SRC.test(sf.getFilePath())) {
      continue;
    }
    for (const c of fileConsumptions(sf)) {
      if (!out.has(c.key)) {
        out.set(c.key, c.node);
      }
    }
  }
  return out;
}

function fileConsumptions(sf: SourceFile): Consumption[] {
  const out: Consumption[] = [];
  for (const pa of sf.getDescendantsOfKind(SyntaxKind.PropertyAccessExpression)) {
    const key = trpcChain(pa, READ_TERMINALS);
    if (key !== undefined) {
      out.push({ key: `${key.router}.${key.proc}`, node: pa });
    }
  }
  return out;
}

// ── side 2: the COVERED keys (the seam's reachable filter rows) ───────────────────────────────────────────
interface Coverage {
  readonly roots: ReadonlySet<string>;
  readonly keys: ReadonlySet<string>;
}

/** The seam module: the client source file pairing `createInvalidation` with the `Invalidation` anchor. */
function findSeam(project: Project): SourceFile | undefined {
  return project.getSourceFiles().find((sf) => CLIENT_SRC.test(sf.getFilePath()) && declaresSeamFactory(sf) && sf.getInterface(SEAM_ANCHOR) !== undefined);
}

/** A sibling module the seam is allowed to keep its filter rows in: `data/invalidation-*.ts` beside the seam
 *  itself. THE SEAM IS TWO FILES SINCE 2026-08-14 — `component-size` forced the read SETS out of
 *  `invalidation.ts` into `invalidation-reads.ts`, and a coverage walk that stops at the import boundary
 *  would report every one of those rows as MISSING (measured: 5 false findings, the exact "the gate lies"
 *  failure). The pattern is deliberately NARROW — the same directory, the same `invalidation` prefix — so
 *  this admits the seam's own split parts and NOT any client module that happens to hold a filter. */
const SEAM_SIBLING = /\/packages\/client\/src\/data\/invalidation[^/]*\.ts$/u;

/** The seam's module SET: the declaring file plus every `SEAM_SIBLING` it imports (one hop — a sibling's own
 *  imports are not followed, so the surface stays the seam's, not the client tree's). */
function seamModules(seam: SourceFile): SourceFile[] {
  const out = [seam];
  for (const imp of seam.getImportDeclarations()) {
    const target = imp.getModuleSpecifierSourceFile();
    if (target !== undefined && SEAM_SIBLING.test(target.getFilePath()) && !out.includes(target)) {
      out.push(target);
    }
  }
  return out;
}

function declaresSeamFactory(sf: SourceFile): boolean {
  if (sf.getFunction(SEAM_FACTORY) !== undefined) {
    return true;
  }
  return sf.getVariableDeclaration(SEAM_FACTORY) !== undefined;
}

/** name → declaration node, for every top-level function/variable binding across the seam's module SET.
 *  Merged by NAME, which is exactly right for the reachability walk: a helper the seam imports is reached
 *  through the identifier the seam calls it by. */
function seamBindings(modules: readonly SourceFile[]): Map<string, Node> {
  const out = new Map<string, Node>();
  for (const sf of modules) {
    for (const fn of sf.getFunctions()) {
      const name = fn.getName();
      if (name !== undefined) {
        out.set(name, fn);
      }
    }
    for (const vd of sf.getVariableDeclarations()) {
      out.set(vd.getName(), vd);
    }
  }
  return out;
}

/** True when an identifier resolves to the top-level seam binding, following an import alias to the
 * declaration in an admitted split-seam sibling. Object property names can share the same text but resolve
 * to their own property declaration, so they do not manufacture a call-graph edge. */
function referencesBinding(identifier: Node, binding: Node): boolean {
  if (!N.isIdentifier(identifier)) {
    return false;
  }
  const symbol = identifier.getSymbol();
  if (symbol === undefined) {
    return false;
  }
  return (symbol.getAliasedSymbol() ?? symbol).getDeclarations().includes(binding);
}

/** The filter rows reachable from `createInvalidation` — the closure over the seam's own helpers/maps, so a
 *  filter in a helper nothing calls contributes NO coverage. */
function seamCoverage(seam: SourceFile): Coverage {
  const bindings = seamBindings(seamModules(seam));
  const roots = new Set<string>();
  const keys = new Set<string>();
  const seen = new Set<string>();
  const walk = (name: string): void => {
    const decl = bindings.get(name);
    if (decl === undefined || seen.has(name)) {
      return;
    }
    seen.add(name);
    collectFilters(decl, roots, keys);
    for (const [candidate, binding] of bindings) {
      if (candidate === name) {
        continue;
      }
      if (decl.getDescendantsOfKind(SyntaxKind.Identifier).some((id) => referencesBinding(id, binding))) {
        walk(candidate);
      }
    }
  };
  walk(SEAM_FACTORY);
  return { roots, keys };
}

function collectFilters(decl: Node, roots: Set<string>, keys: Set<string>): void {
  for (const pa of decl.getDescendantsOfKind(SyntaxKind.PropertyAccessExpression)) {
    const key = trpcChain(pa, FILTER_TERMINALS);
    if (key !== undefined) {
      keys.add(`${key.router}.${key.proc}`);
      continue;
    }
    const root = trpcRootChain(pa, FILTER_TERMINALS);
    if (root !== undefined) {
      roots.add(root);
    }
  }
}

// ── the reconcile ────────────────────────────────────────────────────────────────────────────────────────
const GATE_FILE = "tooling/src/verify/gates/query-freshness-coverage.ts";

// The MISSING arm no longer has a per-finding message: it is NODE-anchored, so its prose lives on the gate
// descriptor's `message` (a per-occurrence override would force the Finding overload — see §1) and the key
// it named rides in the finding's TOKEN.
const STALE = (key: string): string =>
  `query-freshness-coverage[${key}]: this key GAINED an invalidation row but still carries a STATIC/DEFERRED entry — delete the stale entry in ${GATE_FILE} (the ratchet is self-cleaning in BOTH directions; the D50/D107 discipline).`;
const ORPHAN = (key: string): string =>
  `query-freshness-coverage[${key}]: a STATIC/DEFERRED entry names a query key NOTHING consumes any more (the read was renamed or deleted) — drop the entry in ${GATE_FILE}.`;
const TRIPWIRE = `query-freshness-coverage: the ${SEAM_ANCHOR} seam anchor is present but no client module declares \`${SEAM_FACTORY}\` — the invalidation seam was renamed away, so the coverage side would go vacuous. Re-point SEAM_FACTORY in tooling/src/verify/gates/query-freshness-coverage.ts (path-keyed-gates-die-on-rename; the seam lives at packages/client/src/data/invalidation.ts).`;

/** The finding sink, taken straight off the run context so `reconcile` can use BOTH overloads: the NODE
 *  overload for the MISSING arm (a real consumption site — suppressible, GATE-AUTHORING §1) and the
 *  explicit-`Finding` overload for the three GATE_FILE arms (tripwire / stale / orphan — no node exists). */
type Report = GateRunCtx["report"];

// (`repoRel` died with the MISSING arm's Finding literal — the node overload derives the repo-relative path
// from the node itself, in pass.ts, so the gate no longer computes one.)

/** Is the seam anchor identifier present anywhere in the client tree? (Content-guarded tripwire — a
 *  synthetic tree without the anchor never activates it.) */
function anchorPresent(project: Project): boolean {
  for (const sf of project.getSourceFiles()) {
    if (!CLIENT_SRC.test(sf.getFilePath())) {
      continue;
    }
    for (const id of sf.getDescendantsOfKind(SyntaxKind.Identifier)) {
      if (id.getText() === SEAM_ANCHOR) {
        return true;
      }
    }
  }
  return false;
}

function reconcile(ctx: Pick<GateRunCtx, "project" | "root">, report: Report): void {
  const consumed = consumedKeys(ctx.project);
  const seam = findSeam(ctx.project);
  if (seam === undefined) {
    if (anchorPresent(ctx.project)) {
      report({ file: GATE_FILE, line: 1, column: 0, message: TRIPWIRE });
    }
    return;
  }
  const coverage = seamCoverage(seam);
  const covered = (key: string, router: string): boolean => coverage.keys.has(key) || coverage.roots.has(router);

  for (const [key, node] of consumed) {
    const router = key.slice(0, key.indexOf("."));
    const isCovered = covered(key, router);
    const cited = key in STATIC || key in DEFERRED;
    if (!(isCovered || cited)) {
      // The MISSING arm is NODE-anchored (the consumption site itself) — the NODE overload, so
      // `// @orb-gate-ignore query-freshness-coverage(<router>.<proc>): <reason>` works (GATE-AUTHORING §1;
      // until 2026-08-08 this rode the Finding overload, which bypasses `hasGateIgnore`). The token is the
      // query key: §4.3a's position, since one line can chain two reads. Prefer a cited STATIC/DEFERRED row.
      report(node, { token: key, offset: 0 });
    }
    if (isCovered && cited) {
      report({ file: GATE_FILE, line: 1, column: 0, message: STALE(key) });
    }
  }

  // ORPHAN — only on the real tree (a synthetic key set must not flag the founding entries).
  if (!REAL_TREE_SENTINELS.some((s) => consumed.has(s))) {
    return;
  }
  for (const key of [...Object.keys(STATIC), ...Object.keys(DEFERRED)]) {
    if (!consumed.has(key)) {
      report({ file: GATE_FILE, line: 1, column: 0, message: ORPHAN(key) });
    }
  }
}

export const gate: GateDescriptor = {
  name: "query-freshness-coverage",
  docRow: "Core-Enforcement-Active-Gates.md (Layer 3)",
  status: "active",
  scopeSafety: "whole-project",
  scanRoot: (p) => CLIENT_SRC.test(`/${p}`),
  // The MISSING arm's prose lives HERE (it stopped riding a per-finding message when it moved to the node
  // overload); its token is the `<router>.<proc>` key. The three GATE_FILE arms keep their own messages —
  // each names a specific dead/lying registry row, which is per-occurrence detail by nature.
  message:
    "a client-consumed tRPC query key appears in ZERO invalidation rows, so it has NO freshness driver — with the app QueryClient's staleTime:Infinity + no focus-refetch, the surface it feeds is FROZEN at its first fetch until the query is GC'd or the page reloads (the previewAssembly/getShapeTrace frozen-Preview-tab class). The finding's TOKEN is the query key. Add the row to packages/client/src/data/invalidation.ts, or cite the key STATIC/DEFERRED with a real reason in tooling/src/verify/gates/query-freshness-coverage.ts.",
  fix: "add the narrowest pathFilter/queryFilter row to packages/client/src/data/invalidation.ts, or add a cited STATIC/DEFERRED entry in tooling/src/verify/gates/query-freshness-coverage.ts; a stale entry (the key gained a row) must be deleted in the same change.",
  run: (ctx) => {
    reconcile(ctx, ctx.report);
  },
  mustFlag: [
    {
      // A consumed key with no row anywhere in the seam and no registry entry — the frozen-surface class.
      files: {
        "packages/client/src/data/invalidation.ts":
          "export interface Invalidation { readonly invalidate: () => void }\nexport function createInvalidation(trpc: Trpc) {\n  return [trpc.other.thing.pathFilter()];\n}\n",
        "packages/client/src/features/x/components/x.tsx": "export const q = trpc.ghost.frozenRead.queryOptions({});\n",
      },
      expect: { count: 1, token: "ghost.frozenRead" },
      why: "the literal `trpc.<router>.<proc>.queryOptions(` consumption with no seam row — the previewAssembly/getShapeTrace bug, now RED",
    },
    {
      // Nested deeper than the shallow fixture, through a `deps.trpc` receiver + infiniteQueryOptions.
      files: {
        "packages/client/src/data/invalidation.ts":
          "export interface Invalidation { readonly invalidate: () => void }\nexport function createInvalidation(trpc: Trpc) {\n  return [trpc.other.thing.pathFilter()];\n}\n",
        "packages/client/src/features/x/surfaces/deep/nested/y.tsx": "export const q = deps.trpc.ghost.pagedRead.infiniteQueryOptions({});\n",
      },
      expect: { count: 1, token: "ghost.pagedRead" },
      why: "a nested-path consumer through a `deps.trpc` receiver + the infinite read terminal — the enumerator is not shallow-path- or bare-identifier-bound",
    },
    {
      files: {
        "packages/client/src/a-impersonator.ts": "export function createInvalidation(trpc: Trpc) {\n  return [trpc.ghost.frozenRead.pathFilter()];\n}\n",
        "packages/client/src/data/invalidation.ts":
          "export interface Invalidation { readonly invalidate: () => void }\nexport function createInvalidation(trpc: Trpc) {\n  return [trpc.other.thing.pathFilter()];\n}\n",
        "packages/client/src/features/x/components/x.tsx": "export const q = trpc.ghost.frozenRead.queryOptions({});\n",
      },
      expect: { count: 1, token: "ghost.frozenRead" },
      why: "the first unrelated same-named factory in project order cannot impersonate the canonical factory paired with the Invalidation seam anchor",
    },
    {
      // Coverage that is UNREACHABLE from createInvalidation (a dead helper) does not count.
      files: {
        "packages/client/src/data/invalidation.ts":
          "export interface Invalidation { readonly invalidate: () => void }\nfunction deadHelper(trpc: Trpc) {\n  return [trpc.ghost.orphanRead.pathFilter()];\n}\nexport function createInvalidation(trpc: Trpc) {\n  return [trpc.other.thing.pathFilter()];\n}\n",
        "packages/client/src/features/x/components/x.tsx": "export const q = trpc.ghost.orphanRead.queryOptions({});\n",
      },
      expect: { count: 1, token: "ghost.orphanRead" },
      why: "a filter row parked in a helper nothing reaches from createInvalidation is dead wire, not coverage",
    },
    {
      files: {
        "packages/client/src/data/invalidation.ts":
          "export interface Invalidation { readonly invalidate: () => void }\nfunction deadHelper(trpc: Trpc) {\n  return [trpc.ghost.propertyCollision.pathFilter()];\n}\nexport function createInvalidation(trpc: Trpc) {\n  return [{ deadHelper: false }, trpc.other.thing.pathFilter()];\n}\n",
        "packages/client/src/features/x/components/x.tsx": "export const q = trpc.ghost.propertyCollision.queryOptions({});\n",
      },
      expect: { count: 1, token: "ghost.propertyCollision" },
      why: "an inert object property key that merely shares a helper's text is not a declaration reference and cannot make the helper's filter callable from createInvalidation",
    },
    {
      // STALE: a cited key that GAINED its row. A synthetic tree cannot inject into this module's own maps, so
      // the proof BORROWS a live registry key — `notifications.list` (STATIC: SSE-driven) — and gives it a
      // row. NEXT PRUNER: if that entry is ever deleted, repoint this fixture at another SURVIVING registry
      // key (else the stale-bite proof goes vacuous — it would expect a finding and get none). It must NOT be
      // a REAL_TREE_SENTINELS key: a sentinel in the synthetic tree activates the ORPHAN arm and buries this
      // finding under 40 orphan reports.
      files: {
        "packages/client/src/data/invalidation.ts":
          "export interface Invalidation { readonly invalidate: () => void }\nexport function createInvalidation(trpc: Trpc) {\n  return [trpc.notifications.list.pathFilter()];\n}\n",
        "packages/client/src/features/x/components/x.tsx": "export const q = trpc.notifications.list.queryOptions({});\n",
      },
      expect: { messageIncludes: "GAINED an invalidation row" },
      why: "the ratchet's other direction: a cited key that gains a seam row must RED its now-lying registry entry",
    },
    {
      // The SIBLING PATTERN IS NARROW — the two-sided half of the split-seam mustPass below. Widening the
      // seam to two files must NOT widen it to `data/**`: a filter parked in an unrelated client-data module
      // the seam happens to import is still not seam coverage.
      files: {
        "packages/client/src/data/invalidation.ts":
          'import { somethingElse } from "./use-upload-asset.ts";\nexport interface Invalidation { readonly invalidate: () => void }\nexport function createInvalidation(trpc: Trpc) {\n  return somethingElse(trpc);\n}\n',
        "packages/client/src/data/use-upload-asset.ts": "export function somethingElse(trpc: Trpc) {\n  return [trpc.ghost.notTheSeam.pathFilter()];\n}\n",
        "packages/client/src/features/x/components/x.tsx": "export const q = trpc.ghost.notTheSeam.queryOptions({});\n",
      },
      expect: { count: 1, token: "ghost.notTheSeam" },
      why: "the sibling pattern admits `data/invalidation*.ts` ONLY — a filter in any other client-data module is not seam coverage, so the key still REDs",
    },
    {
      // TRIPWIRE: the seam anchor survives but the factory symbol was renamed away.
      files: {
        "packages/client/src/data/invalidation.ts":
          "export interface Invalidation { readonly invalidate: () => void }\nexport function buildInvalidation(trpc: Trpc) {\n  return [trpc.other.thing.pathFilter()];\n}\n",
        "packages/client/src/features/x/components/x.tsx": "export const q = trpc.ghost.frozenRead.queryOptions({});\n",
      },
      expect: { messageIncludes: "renamed away" },
      why: "the paired-anchor tripwire: the Invalidation anchor is present but createInvalidation is gone — RED loudly, never vacuous-green",
    },
  ],
  mustPass: [
    {
      // Covered by the key's OWN row, reached through a helper the map composes.
      files: {
        "packages/client/src/data/invalidation.ts":
          "export interface Invalidation { readonly invalidate: () => void }\nfunction canonReads(trpc: Trpc) {\n  return [trpc.ghost.livingRead.pathFilter()];\n}\nconst MAP = { x: (trpc: Trpc) => canonReads(trpc) };\nexport function createInvalidation(trpc: Trpc) {\n  return MAP.x(trpc);\n}\n",
        "packages/client/src/features/x/components/x.tsx": "export const q = trpc.ghost.livingRead.queryOptions({});\n",
      },
      why: "the key's row lives in a helper the map composes — helper composition is followed, so it passes",
    },
    {
      files: {
        "packages/client/src/data/invalidation.ts":
          "export interface Invalidation { readonly invalidate: () => void }\nfunction livingHelper(trpc: Trpc) {\n  return [trpc.ghost.calledHelper.pathFilter()];\n}\nexport function createInvalidation(trpc: Trpc) {\n  return livingHelper(trpc);\n}\n",
        "packages/client/src/features/x/components/x.tsx": "export const q = trpc.ghost.calledHelper.queryOptions({});\n",
      },
      why: "a real symbol reference in a call from createInvalidation reaches the helper and counts its filter as coverage",
    },
    {
      // THE SEAM IS TWO FILES: the row lives in the sibling `invalidation-reads.ts` the seam imports.
      files: {
        "packages/client/src/data/invalidation.ts":
          'import { canonReads } from "./invalidation-reads.ts";\nexport interface Invalidation { readonly invalidate: () => void }\nexport function createInvalidation(trpc: Trpc) {\n  return canonReads(trpc);\n}\n',
        "packages/client/src/data/invalidation-reads.ts": "export function canonReads(trpc: Trpc) {\n  return [trpc.ghost.splitRead.pathFilter()];\n}\n",
        "packages/client/src/features/x/components/x.tsx": "export const q = trpc.ghost.splitRead.queryOptions({});\n",
      },
      why: "the seam's read SETS live in `data/invalidation-reads.ts` since component-size split them out (2026-08-14) — a one-hop walk into that sibling is what keeps the coverage side honest; without it every split-out row reads as MISSING",
    },
    {
      // Covered by the ROUTER-ROOT pathFilter (it invalidates every proc under the router).
      files: {
        "packages/client/src/data/invalidation.ts":
          "export interface Invalidation { readonly invalidate: () => void }\nexport function createInvalidation(trpc: Trpc) {\n  return [trpc.ghost.pathFilter()];\n}\n",
        "packages/client/src/features/x/components/x.tsx": "export const q = trpc.ghost.anyProc.queryOptions({});\n",
      },
      why: "a router-root pathFilter() invalidates every proc under it — root coverage is real coverage, passes",
    },
    {
      // A `queryKey`-only cache peek is not a consumption (blind spot 5) — no observer, nothing to freeze.
      files: {
        "packages/client/src/data/invalidation.ts":
          "export interface Invalidation { readonly invalidate: () => void }\nexport function createInvalidation(trpc: Trpc) {\n  return [trpc.other.thing.pathFilter()];\n}\n",
        "packages/client/src/features/x/components/x.tsx": "export const k = trpc.ghost.peeked.queryKey({});\n",
      },
      why: "a queryKey-only peek/readKey creates no observer and no surface — not a consumption, passes",
    },
  ],
};
