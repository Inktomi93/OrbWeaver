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
// is ORPHAN-RED. The seam module is found BY SYMBOL (`createInvalidation`), never by path
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
// tests/tooling/check-gates.int.test.ts. Seam: packages/client/src/data/invalidation.ts.
import type { Node, Project, SourceFile } from "ts-morph";
import { Node as N, SyntaxKind } from "ts-morph";
import type { GateDescriptor, GateRunCtx } from "../contract.ts";

// ── the two-map registry (keyed "<router>.<proc>") ───────────────────────────────────────────────────────
// STATIC = a SANCTIONED uncovered key: a bus row is not warranted, and the entry says why (the datum does not
// change in-session, or its freshness driver deliberately lives outside the seam — blind spot 4). DEFERRED =
// TRACKED STALENESS DEBT with its remediation. Delete an entry the moment the key gains a seam row (the gate
// REDs the stale entry). Founding set triaged against the live tree 2026-07-31, consumer by consumer.
const STATIC: Record<string, string> = {
  // ── identity / content-addressed / self-keyed reads: the datum cannot go stale for its key ──────────────
  "sessions.me":
    "the viewer identity minted at login (data/use-viewer.ts). It changes only across a session boundary — login/logout remounts the app tree with a fresh cache — so no in-session writer exists to hang a row on.",
  "assets.resolveChatBlobRefs":
    "keyed by (chatId, the row's asset ids) over CONTENT-ADDRESSED blobs (features/chat/hooks/attachment-url-provider.tsx): the hash behind an assetId never changes, so the resolved map is immutable for its key.",
  "chat.getVariantWire":
    "keyed by (chatId, variantId) over a COMMITTED variant's stamped generation record (features/chat/components/variant-wire-viewer.tsx). A variant's prompt/params/draws are written once at commit and never updated: an edit mints a new variant and a swipe APPENDS one, so a new key is what a change produces — the old key's answer stays true forever. Deleting the message makes the key resolve NOT_FOUND, which the viewer renders as its typed gone-arm.",
  "search.search":
    "input-keyed live search (features/discovery/components/corpus-search-results.tsx) — the query text + `over` target are part of the key, so every new search is a cold fetch of a NEW cache entry.",
  "search.fields":
    "input-keyed BM25 lexical search (same surface) — the query string is part of the key; re-running the identical query inside gcTime correctly returns the same corpus answer.",
  "search.suggest":
    "input-keyed prefix suggest (features/discovery/surfaces/corpus-list-surface.tsx) — keyed by the deferred query text, gated on a minimum length; each keystroke is its own key.",

  // ── freshness driven OUTSIDE the seam, deliberately (blind spot 4) — each names its real driver ─────────
  "chat.checkSendAvailability":
    "carries its OWN finite staleTime (AVAILABILITY_STALE_MS = 15s, features/chat/hooks/use-send-availability.ts). The fact it reads (an engine coming up, a key being added) has NO producer to emit an event; that documented 15s window is the driver, and the file explains why a poll/focus-refetch was rejected.",
  "admin.vllmEngines":
    "POLLS: features/user-admin/components/admin-engines-section.tsx sets a status-adaptive `refetchInterval` (fast while an engine is mid-transition, slow at steady state) — an engine's liveness is a machine fact no bus announces.",
  "notifications.list":
    "driven by the durable inbox SSE adapter (features/notifications/hooks/use-inbox-stream.ts) — every arrival AND every transition into the live state calls invalidation.invalidateFilters([notifications.list]); the bell's own mark-read/dismiss mutations `invalidates` it too.",
  "workloads.list":
    "driven by the per-row workload SSE adapter (features/workloads/hooks/use-workload-stream.ts) — every non-progress event (state change, error, reconnect) invalidates the list through the seam; `progress` stays a row-local buffer by design.",

  // ── writer-local: the ONLY producer is a mutation in the same surface, which cites the filter ───────────
  "workloads.listSchedules":
    "writer-local — the four schedule mutations (features/workloads/hooks/use-workload-mutations.ts) each `invalidates` it. Schedules are per-user and edited from exactly one pane; no second producer can change them behind it.",
  "admin.listUsers":
    "writer-local — every admin user write (features/user-admin/hooks/use-admin-mutations.ts) `invalidates` it. The writes land on OTHER users' rows, so the actor's own user-bus never carries them (the hook's own header); the mutation is the only possible driver.",
  "admin.listSessions":
    "writer-local — the session revoke/reset/kill mutations (features/user-admin/hooks/use-admin-mutations.ts) each `invalidates` it; another user's session lifecycle reaches this admin's bus through nothing.",
  "settings.getAppSettings":
    "writer-local — AppSettings is admin-only and emits no user-bus event; both writers (`useUpdateAppSettings`/`useUpdateAppOverrides` in features/user-admin/hooks/use-admin-mutations.ts and the system-settings surface's own mutation) `invalidates` it.",
  "settings.getAppSettingsWithOverrides":
    "writer-local — the floor-vs-override read of the admin tuning sections; its sole writer `useUpdateAppOverrides` invalidates it alongside `getAppSettings` (same admin-only, bus-less write path).",
  "invites.listInvites":
    "writer-local — the invite create/revoke mutations (features/chat/hooks/use-invite-mutations.ts) `invalidates` the list, and it is the inviting host's own dialog surface (nobody else's action adds a link).",
  "rpg.listCheckpoints":
    "writer-local — create/restore checkpoint (features/rpg/hooks/use-rpg-mutations.ts) each `invalidates` it. Marks are HOST-only and written from this one pane, so the acting tab is the only tab that can be stale.",
  "assets.listGallery":
    "writer-local — add/remove gallery art (features/chat/hooks/use-character-gallery.ts) `invalidates` it; the gallery dialog is the only writer of the junction it reads.",

  // ── corpus analytics: derived data whose only writer is a background pass that announces NOTHING ────────
  // There is no producer to hang a row on: the embeddings indexer / bulk discovery passes rewrite the derived
  // tables with no bus event of any kind, and every one of these reads is a route-scoped dashboard panel that
  // cold-fetches when it mounts after gcTime eviction. A row becomes POSSIBLE only once a corpus-recompute
  // event exists (then these entries go stale-RED and get deleted, which is the point).
  "discovery.home":
    "the corpus home dashboard's headline projection (features/discovery/surfaces/corpus-home-surface.tsx) — recomputed only by the indexer/bulk passes.",
  "discovery.catalog":
    "the browse catalog projection (features/discovery/components/corpus-browse-view.tsx + the list/context headers) — indexer-written derived data.",
  "discovery.browseCharacters":
    "the faceted browse result set (features/discovery/components/corpus-browse-view.tsx, reused by the compare tab) — indexer-written.",
  "discovery.characterFacets": "the browse facet rails (features/discovery/components/corpus-browse-view.tsx) — derived from the same indexer pass.",
  "discovery.archetypes": "the archetype clustering (features/discovery/components/corpus-archetypes-tab.tsx) — a bulk discovery pass writes it.",
  "discovery.visualArchetypes": "the image-embedding archetype clustering (same tab) — written by the image-embed bulk pass.",
  "discovery.themes": "the theme rollup (features/discovery/components/corpus-home-charts.tsx) — recomputed by the themes workload.",
  "discovery.themeDetail": "one theme's drill-down (features/discovery/surfaces/corpus-home-surface.tsx) — same themes workload.",
  "discovery.themeDrift": "theme drift over time (features/discovery/components/corpus-home-charts.tsx) — same themes workload.",
  "discovery.topKeywords": "the keyword rollup (features/discovery/components/corpus-home-charts.tsx) — distillation-pass output.",
  "discovery.cooccurringKeywords": "keyword co-occurrence (same chart surface) — distillation-pass output.",
  "discovery.characterKeywords": "one card's keywords (features/discovery/surfaces/corpus-dossier-surface.tsx) — distillation-pass output.",
  "discovery.characterDossier": "the per-card dossier projection (features/discovery/surfaces/corpus-dossier-surface.tsx) — indexer/distillation output.",
  "discovery.askCard": "the dossier's ask-the-card answer (same surface) — derived over the card's embedded corpus.",
  "discovery.compareCharacters": "the pairwise compare projection (features/discovery/components/corpus-compare-tab.tsx) — embedding-derived.",
  "discovery.compareCharactersDeep": "the deep compare projection (same tab) — embedding-derived.",
  "discovery.corpusProjection": "the 2-D corpus map (features/discovery/components/corpus-map-tab.tsx) — recomputed by the projection pass.",
  "discovery.similarityGraph": "the similarity graph (features/discovery/components/corpus-similarity-tab.tsx) — cosine over indexer-written vectors.",
  "discovery.duplicateCharacters": "near-duplicate cards (features/discovery/components/corpus-similarity-tab.tsx) — same pass.",
  "discovery.duplicateChats": "near-duplicate chats (same tab) — same pass.",
  "discovery.imageDuplicates": "near-duplicate art (same tab) — image-embed pass.",
  "discovery.imageFacets": "the visual facet rails (features/discovery/components/corpus-visuals-tab.tsx) — image-embed pass.",
  "discovery.charactersByImageFacet": "the cards behind one visual facet (same tab) — image-embed pass.",
  "discovery.portraitAlignment": "portrait-vs-card alignment scoring (same tab) — image-embed pass.",
  "discovery.forgottenGems": "the neglected-cards shelf (features/discovery/surfaces/corpus-home-surface.tsx) — recency+centrality rollup.",
  "discovery.unusedCharacters": "the never-played shelf (same surface) — same rollup.",
  "discovery.modelRouting": "the model-routing summary (same surface) — a stats/discovery rollup written by the same passes.",
  "search.similarArt":
    "input-keyed (characterId) cosine over image vectors (features/discovery/surfaces/corpus-dossier-surface.tsx) — the vectors are rewritten only by the image-embed pass, which announces nothing (the analytics class above).",

  // ── databank: NO bus event exists, so every read is driven by the mutations' own `invalidates` (blind
  //    spot 4). `USER_BUS_EVENT_TYPES` has ten members and none is databank, and `domain/databank/**` emits
  //    nothing — so a seam row would have no event to hang on. The drivers are enumerated in
  //    `features/databank/hooks/use-databank-mutations.ts`, which routes EVERY databank write through
  //    `createEntityMutation` with an explicit `invalidates` naming these keys; the CTs at
  //    tests/client/features/databank/** exercise the read↔write pairs. (databank-surface-spec.md §7.) ─────
  "databank.list":
    "the library list + the band's count. Driven by every producer and CRUD verb (createFromText / the three scrapers / rename / remove / reindex) through `invalidates: [databank.list.pathFilter()]`, and by the UPLOAD front door, which is a raw multipart POST and so calls `invalidation.invalidateFilters([...])` by hand from the add dialog. It ADDITIONALLY carries a bounded `refetchInterval` while any row is mid-ingest (D-3 arm b) — the ingest workload writes chunk rows with no event of its own.",
  "databank.get":
    "the open document's detail. Driven by `rename` and `reindex` through `invalidates: [..., databank.get.pathFilter()]`. Its `includeText` twin is the same key with a different input (the lazy source-text read), so it inherits the same driver.",
  "databank.listGlobal":
    "the D-1 global id SET behind the library row's Everywhere toggle. Driven by `attachGlobal`/`detachGlobal` (the only writers of `global_documents`) and by `remove` (the DB cascade drops the junction row), each naming it in `invalidates`.",
  "databank.listAttachments":
    "the CONTEXT panel's read-only 'Active in' chips. Driven by the same global attach/detach mutations; the chat/character junction writers (the per-chat rack, the character rack) are later stages of the databank program and land their own rows with the surfaces that write them.",

  // ── refinery: the SAME shape as databank — NO bus event exists, so every read is driven by the write
  //    tier's own `invalidates` (blind spot 4). `USER_BUS_EVENT_TYPES` has no refinery member and
  //    `domain/refinery/**` emits nothing at all, so a seam row would have no event to hang on. The drivers
  //    are enumerated in `packages/client/src/features/refinery/hooks/use-refinery-mutations.ts`, which routes
  //    every one of the R1 router's six write verbs through `createEntityMutation` with an explicit
  //    `invalidates`; the CT at tests/client/features/refinery/use-refinery-mutations.ct.tsx exercises the
  //    read↔write pair on the wire (a mounted roster read REFETCHES after a write, counted at the network).
  //    (docs/design/refinery-r0.md; board C15 R2.) ────────────────────────────────────────────────────────
  "refinery.listSessions":
    "the D62 sessions roster + its verdict badge. Driven by all six write verbs — `startSession` (a new row), `updateSession` (name/status), `deleteSession` (the row leaves), `runStage`/`iterate` (status back to `active` + `updatedAt` + `latestVerdict`), `applyFields` (status `completed`) — each naming `refinery.listSessions.pathFilter()` in `invalidates`.",
  "refinery.getSession":
    "ONE session's full view (selection · stageConfig · guidance · iterationCount · status; the `originalCard` anchor is frozen at session start and cannot go stale). Driven query-level by every write that touches its row: `updateSession`, `deleteSession`, `runStage`, `iterate`, `applyFields`. `startSession` is absent by construction — the session did not exist, so its first read is a cold fetch of a NEW key.",
  "refinery.listRuns":
    "ONE session's append-only run ledger (the CONTEXT Runs tab). Driven query-level by the two verbs that append to it — `runStage` (one run) and `iterate` (a rewrite + an analyze) — and by `deleteSession`, whose DB cascade drops the rows. Nothing else can write a run.",

  // ── the upload seam: a RAW multipart POST, so its freshness lives outside the seam (blind spot 4) ────────
  "assets.listOwned":
    "driven by the upload front door `useUploadAsset` (data/use-upload-asset.ts) — every completed upload calls invalidation.invalidateFilters([trpc.assets.listOwned.pathFilter()]). The upload route is a raw multipart POST, not a tRPC mutation, so it can carry no `invalidates` and no bus event announces it; the hook IS the driver, and every feature upload (character/persona avatars, backgrounds, chat attachments) goes through it. Proven by tests/client/data/use-upload-asset.ct.tsx (the mounted listOwned read refetches after an upload).",
};

// Empty today — every founding deferral was resolved 2026-08-01 (the twelve `stats.*` reads gained the
// `chatsChanged` row; `assets.listOwned` gained its upload-seam driver and moved to STATIC above). The lane
// stays: this is where a key with a REAL freshness debt gets tracked with its remediation, rather than being
// laundered into STATIC (which asserts the key is fine as-is).
const DEFERRED: Record<string, string> = {};

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

type QueryKey = { readonly router: string; readonly proc: string };

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
type Consumption = { readonly key: string; readonly node: Node };

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
type Coverage = { readonly roots: ReadonlySet<string>; readonly keys: ReadonlySet<string> };

/** The seam module: the client source file that DECLARES `createInvalidation` (symbol-keyed, blind spot 6). */
function findSeam(project: Project): SourceFile | undefined {
  return project.getSourceFiles().find((sf) => CLIENT_SRC.test(sf.getFilePath()) && declaresSeamFactory(sf));
}

function declaresSeamFactory(sf: SourceFile): boolean {
  if (sf.getFunction(SEAM_FACTORY) !== undefined) {
    return true;
  }
  return sf.getVariableDeclaration(SEAM_FACTORY) !== undefined;
}

/** name → declaration node, for every top-level function/variable binding in the seam module. */
function seamBindings(sf: SourceFile): Map<string, Node> {
  const out = new Map<string, Node>();
  for (const fn of sf.getFunctions()) {
    const name = fn.getName();
    if (name !== undefined) {
      out.set(name, fn);
    }
  }
  for (const vd of sf.getVariableDeclarations()) {
    out.set(vd.getName(), vd);
  }
  return out;
}

/** The filter rows reachable from `createInvalidation` — the closure over the seam's own helpers/maps, so a
 *  filter in a helper nothing calls contributes NO coverage. */
function seamCoverage(sf: SourceFile): Coverage {
  const bindings = seamBindings(sf);
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
    for (const id of decl.getDescendantsOfKind(SyntaxKind.Identifier)) {
      const text = id.getText();
      if (text !== name && bindings.has(text)) {
        walk(text);
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
const GATE_FILE = "scripts/check/gates/query-freshness-coverage.ts";

// The MISSING arm no longer has a per-finding message: it is NODE-anchored, so its prose lives on the gate
// descriptor's `message` (a per-occurrence override would force the Finding overload — see §1) and the key
// it named rides in the finding's TOKEN.
const STALE = (key: string): string =>
  `query-freshness-coverage[${key}]: this key GAINED an invalidation row but still carries a STATIC/DEFERRED entry — delete the stale entry in ${GATE_FILE} (the ratchet is self-cleaning in BOTH directions; the D50/D107 discipline).`;
const ORPHAN = (key: string): string =>
  `query-freshness-coverage[${key}]: a STATIC/DEFERRED entry names a query key NOTHING consumes any more (the read was renamed or deleted) — drop the entry in ${GATE_FILE}.`;
const TRIPWIRE = `query-freshness-coverage: the ${SEAM_ANCHOR} seam anchor is present but no client module declares \`${SEAM_FACTORY}\` — the invalidation seam was renamed away, so the coverage side would go vacuous. Re-point SEAM_FACTORY in scripts/check/gates/query-freshness-coverage.ts (path-keyed-gates-die-on-rename; the seam lives at packages/client/src/data/invalidation.ts).`;

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
    "a client-consumed tRPC query key appears in ZERO invalidation rows, so it has NO freshness driver — with the app QueryClient's staleTime:Infinity + no focus-refetch, the surface it feeds is FROZEN at its first fetch until the query is GC'd or the page reloads (the previewAssembly/getShapeTrace frozen-Preview-tab class). The finding's TOKEN is the query key. Add the row to packages/client/src/data/invalidation.ts, or cite the key STATIC/DEFERRED with a real reason in scripts/check/gates/query-freshness-coverage.ts.",
  fix: "add the narrowest pathFilter/queryFilter row to packages/client/src/data/invalidation.ts, or add a cited STATIC/DEFERRED entry in scripts/check/gates/query-freshness-coverage.ts; a stale entry (the key gained a row) must be deleted in the same change.",
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
