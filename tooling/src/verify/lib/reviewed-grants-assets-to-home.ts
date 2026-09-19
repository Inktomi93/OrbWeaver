// Reviewed grants: assets-single-writer, biome-grant-liveness, bound-field-via-hook, bus-channel-primitive, bus-payload-allowlist....
// Split from reviewed-grants.ts — see that file for the central home comment.
import type { ReviewedGateGrant } from "../contract/gate-authority.ts";

const STRUCTURAL_LENGTH_OPERATION = "structural-css-length";
const STRUCTURAL_LENGTH_GRANT_SUBJECTS = [
  ".shell-grid { --list-track: 0px }",
  ".shell-grid { --context-track: 0px }",
  ".shell-grid { height: 100vh }",
  ".shell-grid { height: calc(100dvh - var(--orb-keyboard-inset, 0px)) }",
  ".shell-grid { --pane-deficit: max(0px, var(--dimension-content-reading-floor) - (100dvw - var(--rail-w) - var(--panel-w) - var(--panel-context-w))) }",
  ".shell-grid { --content-primacy-deficit: max(0px, calc(var(--rail-w) + (var(--both-docked-list-track) + var(--both-docked-context-track)) * 1.5 - 100%)) }",
  ".shell-content-primacy-sentinel { block-size: 1px }",
  '.shell-panel[data-panel-mode="docked"], .shell-panel[data-panel-mode="overlay"], .shell-panel[data-panel-mode="collapsed"] { width: 100dvw }',
  '.shell-panel[data-panel-side="list"][data-panel-mode="overlay"], .shell-panel[data-panel-side="list"][data-panel-mode="collapsed"], .shell-panel[data-panel-side="context"][data-panel-mode="overlay"], .shell-panel[data-panel-side="context"][data-panel-mode="collapsed"] { width: 100dvw }',
  '.shell-panel[data-panel-side="list"][data-panel-mode="docked"] { width: 100dvw }',
  "@supports (backdrop-filter: blur(1px)) {",
  "@container shell-main (max-width: 30rem) {",
  "@media (max-width: 48rem) {",
  "packages/client/src/features/chat/lib/pager-chrome.ts :: @max-[12rem]/pager:sr-only",
  "packages/client/src/features/chat/lib/pager-chrome.ts :: @max-[13rem]/pager:gap-tight",
  "packages/client/src/features/chat/lib/pager-chrome.ts :: @max-[13rem]/pager:[word-spacing:-1ch]",
  "packages/client/src/features/character/components/character-create-actions.tsx :: @max-[19rem]:hidden",
  "packages/client/src/features/character/components/character-create-actions.tsx :: @[19rem]:hidden",
  "packages/ui/src/markdown/markdown.tsx :: max-h-[60cqh]",
  "packages/ui/src/layout/variants.ts :: @md:grid-cols-[repeat(auto-fill,8.5rem)]",
  "packages/ui/src/layout/variants.ts :: @min-[100rem]:grid-cols-[1.5fr_1.05fr]",
  "packages/ui/src/layout/variants.ts :: @min-[100rem]:grid-cols-2",
  "packages/ui/src/layout/variants.ts :: grid-cols-[repeat(auto-fit,minmax(min(5rem,100%),1fr))]",
  "packages/ui/src/layout/variants.ts :: grid-cols-[repeat(auto-fit,minmax(min(8.5rem,100%),1fr))]",
  "packages/ui/src/layout/variants.ts :: grid-cols-[repeat(auto-fit,minmax(min(16rem,100%),1fr))]",
  "packages/ui/src/layout/variants.ts :: grid-cols-[repeat(auto-fit,minmax(min(22rem,100%),1fr))]",
  // APPENDED, never inserted (#2442): these ids are positional, so a row placed beside its `.shell-grid`
  // siblings would renumber every row after it. Same species as `--pane-deficit` and
  // `--content-primacy-deficit` above — a pure-arithmetic shell distance whose `0px` floor is the
  // mechanism (a negative delta means the box did not move), not a value any portable token could carry.
  ".shell-grid { --list-track-centre-delta: calc(clamp(0px, 100% + var(--list-track-docked) - var(--width-shell-content), var(--list-track-docked)) / 2) }",
] as const;

export const REVIEWED_GRANTS_ASSETS_TO_HOME: readonly ReviewedGateGrant[] = [
  {
    id: "assets-single-writer:persistence-asset-refs",
    policyId: "assets-single-writer",
    subject: "packages/server/src/domain/assets/persistence/asset-refs.ts",
    operation: "asset-write-site",
    why: "This assets-domain module is an audited CAS-coherence writer or storeBlob caller in the D21 single-writer boundary.",
    endsWhen: "the module stops writing assets or calling storeBlob, or the CAS boundary moves to a different exact module.",
  },
  {
    id: "assets-single-writer:persistence-queries",
    policyId: "assets-single-writer",
    subject: "packages/server/src/domain/assets/persistence/queries.ts",
    operation: "asset-write-site",
    why: "This assets-domain module is an audited CAS-coherence writer or storeBlob caller in the D21 single-writer boundary.",
    endsWhen: "the module stops writing assets or calling storeBlob, or the CAS boundary moves to a different exact module.",
  },
  {
    id: "assets-single-writer:verbs-backfill-avatars",
    policyId: "assets-single-writer",
    subject: "packages/server/src/domain/assets/verbs/backfill-avatars.ts",
    operation: "asset-write-site",
    why: "This assets-domain module is an audited CAS-coherence writer or storeBlob caller in the D21 single-writer boundary.",
    endsWhen: "the module stops writing assets or calling storeBlob, or the CAS boundary moves to a different exact module.",
  },
  {
    id: "assets-single-writer:verbs-import-asset",
    policyId: "assets-single-writer",
    subject: "packages/server/src/domain/assets/verbs/import-asset.ts",
    operation: "asset-write-site",
    why: "This assets-domain module is an audited CAS-coherence writer or storeBlob caller in the D21 single-writer boundary.",
    endsWhen: "the module stops writing assets or calling storeBlob, or the CAS boundary moves to a different exact module.",
  },
  {
    id: "assets-single-writer:verbs-rebuild-from-tree",
    policyId: "assets-single-writer",
    subject: "packages/server/src/domain/assets/verbs/rebuild-from-tree.ts",
    operation: "asset-write-site",
    why: "This assets-domain module is an audited CAS-coherence writer or storeBlob caller in the D21 single-writer boundary.",
    endsWhen: "the module stops writing assets or calling storeBlob, or the CAS boundary moves to a different exact module.",
  },
  {
    id: "assets-single-writer:verbs-store",
    policyId: "assets-single-writer",
    subject: "packages/server/src/domain/assets/verbs/store.ts",
    operation: "asset-write-site",
    why: "This assets-domain module is an audited CAS-coherence writer or storeBlob caller in the D21 single-writer boundary.",
    endsWhen: "the module stops writing assets or calling storeBlob, or the CAS boundary moves to a different exact module.",
  },
  {
    id: "biome-grant-liveness:catalog-tmp",
    policyId: "biome-grant-liveness",
    subject: "docs/catalog/catalog.tmp.*.json",
    operation: "biome-glob-grant",
    why: "absent at rest BY DESIGN and never tracked: the doc-catalog's biome round-trip writes docs/catalog/catalog.tmp.<runId>.json, formats it through the binary, and rm's it in a `finally` — the run identity in the name is what stops two concurrent catalog runs from formatting each other's file (#1029), and the files.maxSize grant must PRE-EXIST the write. Producer: tooling/src/doc-catalog/ops/tree.ts. This ONE row replaces the pair the retired tables carried, whose own comment asked to 'collapse the pair the day one table can express both' (#2021).",
    endsWhen:
      "the catalog serializer stops formatting through a temp file — the glob then matches nothing anybody wrote, the finding disappears and this row is consumed zero times.",
  },
  {
    id: "bound-field-via-hook:use-bound-field",
    policyId: "bound-field-via-hook",
    subject: "packages/client/src/forms/editor/bound-fields/use-bound-field.ts",
    operation: "raw-field-context-read",
    why: "`useBoundField` IS the one home for the bound-field wiring (derive-modernization-audit.md §W3 G28): it reads the raw form context once, normalizes the touch-gated error, and assembles the `<Field>` prop bundle every bound field then shares. The seal cannot be built without the read it seals.",
    endsWhen:
      "the bound-field bundle is assembled from something other than the raw `useFieldContext` — at which point this file stops making the read and the row goes stale on its own.",
  },
  {
    id: "bus-channel-primitive:bus-channel-mint",
    policyId: "bus-channel-primitive",
    subject: "packages/server/src/transport/trpc/bus-channel.ts",
    operation: "event-emitter-construction",
    why: "`defineBusChannel`'s own module — the emitter it wraps is constructed HERE, which is the entire point of the mint (M9, client-architecture-lockdown.md §13/§16 G10).",
    endsWhen:
      "the mint moves or stops wrapping a node EventEmitter; the row is then consumed zero times and reds at its dead subject, which is the rename tripwire the legacy SANCTIONED_HOMES table owned by hand.",
  },
  {
    id: "bus-payload-allowlist:credential-id",
    policyId: "bus-payload-allowlist",
    subject: "credentialId",
    operation: "bus-payload-field",
    why: "the user-bus `credentialsChanged` payload carries a branded `UserCredentialId` — an ID, not a secret, and D16's SAFE pattern is exactly id-only re-read: the subscriber re-reads canon by id and never trusts event-carried data. The SUBJECT here is the field NAME rather than a path, because the licensed thing is the name's appearance anywhere on the wire (the `suppressions` precedent for a class-wide identity), and the policy aggregates every site of one name into one finding so this row stays 1:1 (§12.5). This replaces the legacy gate-owned `SANCTIONED_FIELDS` table and its hand-rolled two-sided stale sweep; the central `stale-reviewed-grant` alarm is the stronger successor.",
    endsWhen:
      "no scanned bus payload declares a `credentialId` field any more — the user-bus stops carrying the id at all, this row is consumed zero times and the run alarms at its dead subject, which is exactly the loaded-gun case the legacy table's stale arm existed to catch.",
  },
  {
    id: "chat-stream-writes-in-bus-only:chat-bus-writes",
    policyId: "chat-stream-writes-in-bus-only",
    subject: "packages/client/src/data/bus/chat-bus-writes.ts",
    operation: "chat-stream-write-handle",
    why: "this file IS the bus applier (UI-Gates-and-Lessons.md §11.1): `applyChatBusEvent` turns bus events into turn-slot writes, so it is the one writer the rule exists to make singular.",
    endsWhen:
      "turn slots are written by the stream store itself rather than applied from bus events, or the applier moves — either way this row stops being consumed.",
  },
  {
    id: "chat-stream-writes-in-bus-only:chat-ct-stories",
    policyId: "chat-stream-writes-in-bus-only",
    subject: "tests/client/features/chat/_ct-stories.tsx",
    operation: "chat-stream-write-handle",
    why: "the chat CT story harness seeds turn state directly because a component test mounts without a live bus: there is no `applyChatBusEvent` producer in a story, so the write api is how a phase gets rendered at all. This site is NEW EVIDENCE from the conversion — the legacy check keyed on the literal `#state` specifier and this file imports through `@orb/client/state`, so it was never judged.",
    endsWhen:
      "the CT stories seed turn state through a bus-event fixture instead of the write handle (the honest fix, and the reason this is a row rather than a population exclusion).",
  },
  {
    id: "client-cache-surgery-only-in-data:create-entity-mutation-cancel",
    policyId: "client-cache-surgery-only-in-data",
    subject: "packages/client/src/data/create-entity-mutation.ts",
    operation: "cache-surgery:cancelQueries",
    why: "`createEntityMutation` IS the optimistic-write seam (UI-Gates-and-Lessons.md §11.3): cancelling in-flight reads before the optimistic patch is step one of the recipe every feature is supposed to get from it rather than write.",
    endsWhen: "the optimistic recipe stops cancelling in flight, or the seam moves.",
  },
  {
    id: "client-cache-surgery-only-in-data:create-entity-mutation-get",
    policyId: "client-cache-surgery-only-in-data",
    subject: "packages/client/src/data/create-entity-mutation.ts",
    operation: "cache-surgery:getQueryData",
    why: "the seam snapshots the previous cache value so `onError` can roll the optimistic patch back — the rollback half of the same recipe.",
    endsWhen: "the seam rolls back from something other than a cache snapshot.",
  },
  {
    id: "client-cache-surgery-only-in-data:create-entity-mutation-remove",
    policyId: "client-cache-surgery-only-in-data",
    subject: "packages/client/src/data/create-entity-mutation.ts",
    operation: "cache-surgery:removeQueries",
    why: "a deleted entity's own query is dropped by the seam rather than left to refetch a 404 — the delete arm of the recipe.",
    endsWhen: "deletes stop pruning their entity query at the seam.",
  },
  {
    id: "client-cache-surgery-only-in-data:create-entity-mutation-set",
    policyId: "client-cache-surgery-only-in-data",
    subject: "packages/client/src/data/create-entity-mutation.ts",
    operation: "cache-surgery:setQueryData",
    why: "writing the optimistic value into the cache IS what `createEntityMutation` exists to do once, for every feature.",
    endsWhen: "optimistic writes are applied somewhere other than this seam.",
  },
  {
    id: "client-cache-surgery-only-in-data:invalidation",
    policyId: "client-cache-surgery-only-in-data",
    subject: "packages/client/src/data/invalidation.ts",
    operation: "cache-surgery:invalidateQueries",
    why: "the central invalidation seam owns the exhaustive event→filter maps and the sole invalidate call; the seam cannot obey its own rule.",
    endsWhen: "invalidation is expressed as data rather than as a call here, or the seam moves.",
  },
  {
    id: "client-cache-surgery-only-in-data:invalidation-carrier-get",
    policyId: "client-cache-surgery-only-in-data",
    subject: "packages/client/src/data/invalidation-carrier.ts",
    operation: "cache-surgery:getQueryData",
    why: "the invalidation carrier reads the current cache entry to decide whether the event's payload can be merged in place instead of refetched — part of the same seam, split out for size.",
    endsWhen: "the carrier stops reading the cache to make that decision.",
  },
  {
    id: "client-cache-surgery-only-in-data:invalidation-carrier-set",
    policyId: "client-cache-surgery-only-in-data",
    subject: "packages/client/src/data/invalidation-carrier.ts",
    operation: "cache-surgery:setQueryData",
    why: "and writes the merged entry back — the carrier's whole purpose is to be the one place that surgery happens.",
    endsWhen: "the carrier stops writing merged entries.",
  },
  {
    id: "client-cache-surgery-only-in-data:peek-query",
    policyId: "client-cache-surgery-only-in-data",
    subject: "packages/client/src/data/peek-query.ts",
    operation: "cache-surgery:getQueryData",
    why: "`peekQuery` IS the sanctioned non-subscribing cache READ that features are pointed at instead of reaching for the client themselves; it is one function whose whole body is the read.",
    endsWhen: "the peek is served by a query observer rather than a direct cache read.",
  },
  {
    id: "client-cache-surgery-only-in-data:use-start-chat",
    policyId: "client-cache-surgery-only-in-data",
    subject: "packages/client/src/data/use-start-chat.ts",
    operation: "cache-surgery:setQueryData",
    why: "the start-chat seam seeds the new chat's cache entry from the create response so the room can render before its first read lands — a data/ seam doing exactly what the seam layer is for.",
    endsWhen: "the new chat's first render no longer depends on a seeded cache entry.",
  },
  {
    id: "config-anchor-in-registry:config-jump",
    policyId: "config-anchor-in-registry",
    subject: "packages/client/src/features/config/lib/config-jump.ts",
    operation: "config-anchor-stamp",
    why: "the config JUMP resolves an anchor id to scroll to it — the READER half of §6.8.3's contract, which is the reason anchors are derived from the registry rather than authored twice.",
    endsWhen: "jump targets are resolved from registry rows directly instead of by re-deriving the anchor id.",
  },
  {
    id: "config-anchor-in-registry:config-scroll-spy",
    policyId: "config-anchor-in-registry",
    subject: "packages/client/src/features/config/hooks/use-config-scroll-spy.ts",
    operation: "config-anchor-stamp",
    why: "the config content pane's scroll-spy hook READS anchors rather than painting one: it derives the active group's anchor prefix to drive the spy (the WHEN half split out of `surfaces/config-content-surface.tsx` on main, #1632 train 81; the grant moved with the reader, which is exactly the liveness this row is keyed on). It owns no config row and must not be registered as one (config-revamp-design.md §6.8.3).",
    endsWhen: "the spy's prefix is supplied by the registry itself instead of recomputed at the reader.",
  },
  {
    id: "content-part-seam:chat-contract-results",
    policyId: "content-part-seam",
    subject: "packages/server/src/domain/chat/contract/results.ts",
    operation: "chat-content-part-reference",
    why: "the domain-side request DTO the seam populates (`content: ChatContentPart[]` handed to the runner) — the shape the engine fills and infra reads.",
    endsWhen:
      "the wire seam stops taking content PARTS (D51 is retired) or this module stops naming the type; either way the row is consumed zero times and reds.",
  },
  {
    id: "content-part-seam:chat-engine-pipeline",
    policyId: "content-part-seam",
    subject: "packages/server/src/domain/chat/engine/pipeline.ts",
    operation: "chat-content-part-reference",
    why: "the engine request seam ASSEMBLES the parts the CONVERT step builds, and mints its own for the TOOL-RESULT rows (`toolResultMessages`), which never pass through the history conversion.",
    endsWhen:
      "the wire seam stops taking content PARTS (D51 is retired) or this module stops naming the type; either way the row is consumed zero times and reds.",
  },
  {
    id: "content-part-seam:chat-wire-history",
    policyId: "content-part-seam",
    subject: "packages/server/src/domain/chat/substrate/wire-history.ts",
    operation: "chat-content-part-reference",
    why: "THE one producer (D51). The CONVERT step moved here at #1540 so the read verb's previews price the same converted rows the turn's fitter prices; a pure read cannot import the turn-execution module.",
    endsWhen:
      "the wire seam stops taking content PARTS (D51 is retired) or this module stops naming the type; either way the row is consumed zero times and reds.",
  },
  {
    id: "content-part-seam:providers-contract-chat",
    policyId: "content-part-seam",
    subject: "packages/server/src/infra/providers/contract/chat.ts",
    operation: "chat-content-part-reference",
    why: "the sealed runner tier's own request contract — the shape every backend runner is handed.",
    endsWhen:
      "the wire seam stops taking content PARTS (D51 is retired) or this module stops naming the type; either way the row is consumed zero times and reds.",
  },
  {
    id: "content-part-seam:runner-custom-byo-chat",
    policyId: "content-part-seam",
    subject: "packages/server/src/infra/providers/backends/custom-byo/runners/chat.ts",
    operation: "chat-content-part-reference",
    why: "the sealed runner tier is the D51 seam's ONLY consumer — this runner maps content parts onto its backend's wire, which is the reason parts exist at all.",
    endsWhen:
      "the wire seam stops taking content PARTS (D51 is retired) or this module stops naming the type; either way the row is consumed zero times and reds.",
  },
  {
    id: "content-part-seam:runner-kit-history",
    policyId: "content-part-seam",
    subject: "packages/server/src/infra/providers/backends/kit/history.ts",
    operation: "chat-content-part-reference",
    why: "the sealed runner tier is the D51 seam's ONLY consumer — this runner maps content parts onto its backend's wire, which is the reason parts exist at all.",
    endsWhen:
      "the wire seam stops taking content PARTS (D51 is retired) or this module stops naming the type; either way the row is consumed zero times and reds.",
  },
  {
    id: "content-part-seam:runner-openrouter-responses",
    policyId: "content-part-seam",
    subject: "packages/server/src/infra/providers/backends/openrouter/runners/chat/responses.ts",
    operation: "chat-content-part-reference",
    why: "the sealed runner tier is the D51 seam's ONLY consumer — this runner maps content parts onto its backend's wire, which is the reason parts exist at all.",
    endsWhen:
      "the wire seam stops taking content PARTS (D51 is retired) or this module stops naming the type; either way the row is consumed zero times and reds.",
  },
  {
    id: "content-part-seam:runner-openrouter-shared",
    policyId: "content-part-seam",
    subject: "packages/server/src/infra/providers/backends/openrouter/runners/chat/shared.ts",
    operation: "chat-content-part-reference",
    why: "the sealed runner tier is the D51 seam's ONLY consumer — this runner maps content parts onto its backend's wire, which is the reason parts exist at all.",
    endsWhen:
      "the wire seam stops taking content PARTS (D51 is retired) or this module stops naming the type; either way the row is consumed zero times and reds.",
  },
  {
    id: "content-part-seam:runner-vllm-chat",
    policyId: "content-part-seam",
    subject: "packages/server/src/infra/providers/vllm/surfaces/chat.ts",
    operation: "chat-content-part-reference",
    why: "the sealed runner tier is the D51 seam's ONLY consumer — this runner maps content parts onto its backend's wire, which is the reason parts exist at all.",
    endsWhen:
      "the wire seam stops taking content PARTS (D51 is retired) or this module stops naming the type; either way the row is consumed zero times and reds.",
  },
  {
    id: "contract-derives-not-respells:discovery-theme-row",
    policyId: "contract-derives-not-respells",
    subject: "packages/server/src/domain/discovery/contract/results.ts::ThemeRow",
    operation: "contract-hand-row:themes",
    why: "HOMONYM: discovery's `ThemeRow` is an emergent THEME CLUSTER (k-means over digest embeddings — id/level/clusterIdx/size/model), while the `themes` table is the UI palette/token-override row (owner-scoped `override` blob). Same word, unrelated concepts; the cluster's own table is `themeClusters`.",
    endsWhen:
      "the shape is renamed or derived, or the `themes` table disappears — any of the three ends the collision the operation names, the row is consumed zero times and it reds as `stale-reviewed-grant`. That is the two-sided ratchet the retired `contract-derives-not-respells-health` policy owned by hand (#2176 Phase F).",
  },
  {
    id: "contract-derives-not-respells:stats-model-stat-row",
    policyId: "contract-derives-not-respells",
    subject: "packages/server/src/domain/stats/contract/views.ts::ModelStatRow",
    operation: "contract-hand-row:modelStats",
    why: "AGGREGATE: a read-time GROUP BY projection over `model_stats` carrying computed fields that are never columns (`charactersUsedWith` — model_stats is character-less, plus the p50/p90 percentiles the file header says are computed on read, invariant #6). Deriving it from `$inferSelect` would be a lie about what the read returns.",
    endsWhen:
      "the projection stops being hand-written (it derives, or it is renamed so it no longer collides), or the `modelStats` table disappears — the row is then consumed zero times and reds as `stale-reviewed-grant`.",
  },
  // THE THREE BOUNDED DIRECT-SKIN RECIPES (#2181, #1584). They replace `EXPECTED_DIRECT_CLIENT_UI_MECHANISMS`
  // — three hand-spelled COUNTS in `lib/css-family-census.ts` that §12.5 bans and that the §5b audit measured
  // reached by ZERO proof rows (cut f07) and unmoved by a changed number (cut f08). The exemption is real and
  // survives; its cardinality is now the 1:1 grant identity, and its STALENESS is the central
  // `stale-reviewed-grant` alarm rather than a literal nobody re-measured.
  {
    id: "css-family-direct-client-mechanism:alert-dialog-popup",
    policyId: "css-family-direct-client-mechanism",
    subject: "packages/client/src/styles/globals.css",
    operation: "direct-client-mechanism:slot:alert-dialog-popup",
    why: "the alert dialog's popup is positioned against the DOCUMENT, not against a component ancestor: the rule is `html `-rooted because the portal target is the document body, and a `tv()` variant on the primitive cannot express a document-rooted carrier.",
    endsWhen:
      "the alert dialog stops portalling to the document body, or `@orb/ui` gains a document-carrier variant slot — either way client globals stops selecting this hook, the row is consumed zero times and reds STALE.",
  },
  {
    id: "css-family-direct-client-mechanism:dialog-popup",
    policyId: "css-family-direct-client-mechanism",
    subject: "packages/client/src/styles/globals.css",
    operation: "direct-client-mechanism:slot:dialog-popup",
    why: "same document-rooted portal seam as the alert dialog, for the plain dialog. The `html ` prefix is the whole reason the recipe is legitimate and is enforced by the policy rather than by this row.",
    endsWhen:
      "the dialog stops portalling to the document body, or `@orb/ui` gains a document-carrier variant slot; the row then consumes zero candidates and reds STALE.",
  },
  {
    id: "css-family-direct-client-mechanism:message-list-scroll",
    policyId: "css-family-direct-client-mechanism",
    subject: "packages/client/src/styles/globals.css",
    operation: "direct-client-mechanism:slot:message-list-scroll",
    why: "the message list's scroll container is a CLIENT scroll mechanism wearing a UI primitive's slot — the pinning/overflow behaviour belongs to the chat surface that owns the scroll position, not to the primitive that renders the box.",
    endsWhen:
      "the chat surface stops driving the scroll container from client globals (it moves onto a capability carrier or into the primitive), and the row consumes zero candidates and reds STALE. It is ONE row for however many selectors express the recipe: the policy reports one finding per (carrier, hook) class precisely so a reviewer's decision stays 1:1.",
  },
  ...STRUCTURAL_LENGTH_GRANT_SUBJECTS.map(
    (subject, index): ReviewedGateGrant => ({
      id: `css-length-tokens-grants:${String(index + 1).padStart(2, "0")}`,
      policyId: "css-length-tokens-grants",
      subject,
      operation: STRUCTURAL_LENGTH_OPERATION,
      why: `${subject} is an exact raw length used as structural mechanics that cannot consume a portable token.`,
      endsWhen: `the exact structural subject ${subject} disappears or becomes token-expressible; central liveness then reports this row stale.`,
    }),
  ),
  ...[
    "--accordion-panel-height",
    "--active-tab-left",
    "--active-tab-width",
    "--anchor-width",
    "--available-height",
    "--available-width",
    "--collapsible-panel-height",
    "--drawer-snap-point-offset",
    "--drawer-swipe-movement-x",
    "--drawer-swipe-movement-y",
    "--toast-swipe-movement-x",
    "--toast-swipe-movement-y",
    "--transform-origin",
  ].map(
    (property): ReviewedGateGrant => ({
      id: `css-var-defined-grants:${property.slice(2)}`,
      policyId: "css-var-defined-grants",
      subject: property,
      operation: "base-ui-runtime-property",
      why: `${property} is a Base UI runtime custom property proved by both the committed API mirror and the installed CssVars declarations; authored consumers may read it although product CSS cannot define its runtime value.`,
      endsWhen: `Delete the unused central grant when no product source or stylesheet references ${property}; the candidate disappears and central liveness reports this row stale.`,
    }),
  ),
  ...[
    [
      "app-shell-width",
      "packages/client/src/features/app-shell/surfaces/app-shell.tsx",
      "--width-shell-content",
      "the user stored chat width is read at runtime",
    ],
    [
      "web-weave-hub-x",
      "packages/ui/src/art/web-weave/web-weave.tsx",
      "--orb-weave-hub-x",
      "the generated weave geometry computes the horizontal hub per instance",
    ],
    [
      "web-weave-hub-y",
      "packages/ui/src/art/web-weave/web-weave.tsx",
      "--orb-weave-hub-y",
      "the generated weave geometry computes the vertical hub per instance",
    ],
    ["waystone-pitch", "packages/ui/src/charts/meter/waystone-layers.tsx", "--orb-ws-pitch", "the lattice pitch is per-layer data"],
    ["waystone-glow", "packages/ui/src/charts/meter/waystone-layers.tsx", "--orb-ws-glow", "the animation floor is computed per frame"],
    ["spinner-length", "packages/ui/src/primitives/spinner/spinner.tsx", "--orb-web-spiral-length", "the dash length derives from the generated spiral path"],
  ].map(
    ([id, subject, property, reason]): ReviewedGateGrant => ({
      id: `css-var-defined-grants:${id}`,
      policyId: "css-var-defined-grants",
      subject: subject ?? "",
      operation: `css-runtime-writer:${property}`,
      why: `${property} is written in ${subject} because ${reason}; no static product-CSS value can serve.`,
      endsWhen: `Delete the stale producer grant or review and repoint it when ${subject} stops writing ${property}, or the value becomes static; central liveness then reports this exact row stale.`,
    }),
  ),
];
