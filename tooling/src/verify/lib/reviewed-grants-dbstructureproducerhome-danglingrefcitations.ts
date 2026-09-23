// Reviewed grants: db-structure-producer-home, dangling-ref-citations, duplicate-action-doors.
// Split from reviewed-grants.ts — see that file for the central home comment.
import { ACTION_DOOR_RULINGS, rulingOperation } from "../../_shared/action-door-rulings.ts";
import type { ReviewedGateGrant } from "../contract/gate-authority.ts";

export const REVIEWED_GRANTS_DBSTRUCTUREPRODUCERHOME_DANGLINGREFCITATIONS: readonly ReviewedGateGrant[] = [
  {
    id: "db-structure-producer-home:gallery",
    policyId: "db-structure-producer-home",
    subject: "packages/db/src/schema/gallery.ts",
    operation: "non-domain-schema-producer",
    why: "the assets domain owns gallery presentation rows.",
    endsWhen: "the schema module gains a same-named producer domain, moves under its producer, or packages/db/src/schema/gallery.ts is removed.",
  },
  {
    id: "db-structure-producer-home:rate-limit",
    policyId: "db-structure-producer-home",
    subject: "packages/db/src/schema/rate-limit.ts",
    operation: "non-domain-schema-producer",
    why: "transport owns limiter rows; a rate-limit domain would collapse the transport tier.",
    endsWhen: "the schema module gains a same-named producer domain, moves under its producer, or packages/db/src/schema/rate-limit.ts is removed.",
  },
  {
    id: "db-structure-producer-home:connection-bindings",
    policyId: "db-structure-producer-home",
    subject: "packages/db/src/schema/connection-bindings.ts",
    operation: "non-domain-schema-producer",
    why: "domain/connection produces `connection_bindings` and `provider_rows` (inference program §5.3/§5.9-1); they live apart from `connection.ts` ONLY to break an import cycle (the bindings FK `automation_rules`/`plugins`, whose files import `chat.ts`, which FKs `user_connections`).",
    endsWhen: "the two tables move back into packages/db/src/schema/connection.ts (the cycle resolved another way) or the file is removed.",
  },
  {
    id: "db-structure-producer-home:sdk-session",
    policyId: "db-structure-producer-home",
    subject: "packages/db/src/schema/sdk-session.ts",
    operation: "non-domain-schema-producer",
    why: "the agent-sdk backend owns its internal session cache.",
    endsWhen: "the schema module gains a same-named producer domain, moves under its producer, or packages/db/src/schema/sdk-session.ts is removed.",
  },
  {
    id: "dangling-ref-citations:account-action",
    policyId: "dangling-ref-citations",
    subject: "ACCOUNT_ACTION",
    operation: "dangling-symbol-cite",
    why: "Temporary CERD truth-audit scope split carried from the legacy dangling-refs authority table: a living architecture doc still names this purged or pre-M4 shape. The reviewed row preserves only this exact citation identity while its owning doc repair lands; it does not classify the cited code as present.",
    endsWhen:
      "the owning documentation repair removes, strikes, riders, or repoints `ACCOUNT_ACTION`; the grouped finding disappears and central zero-use reconciliation stales this row.",
  },
  {
    id: "dangling-ref-citations:anth-direct-sampling",
    policyId: "dangling-ref-citations",
    subject: "ANTH_DIRECT_SAMPLING",
    operation: "dangling-symbol-cite",
    why: "Temporary CERD truth-audit scope split carried from the legacy dangling-refs authority table: a living architecture doc still names this purged or pre-M4 shape. The reviewed row preserves only this exact citation identity while its owning doc repair lands; it does not classify the cited code as present.",
    endsWhen:
      "the owning documentation repair removes, strikes, riders, or repoints `ANTH_DIRECT_SAMPLING`; the grouped finding disappears and central zero-use reconciliation stales this row.",
  },
  {
    id: "dangling-ref-citations:chat-context-slots",
    policyId: "dangling-ref-citations",
    subject: "CHAT_CONTEXT_SLOTS",
    operation: "dangling-symbol-cite",
    why: "Temporary CERD truth-audit scope split carried from the legacy dangling-refs authority table: a living architecture doc still names this purged or pre-M4 shape. The reviewed row preserves only this exact citation identity while its owning doc repair lands; it does not classify the cited code as present.",
    endsWhen:
      "the owning documentation repair removes, strikes, riders, or repoints `CHAT_CONTEXT_SLOTS`; the grouped finding disappears and central zero-use reconciliation stales this row.",
  },
  {
    id: "dangling-ref-citations:chat-surface-slots",
    policyId: "dangling-ref-citations",
    subject: "CHAT_SURFACE_SLOTS",
    operation: "dangling-symbol-cite",
    why: "Temporary CERD truth-audit scope split carried from the legacy dangling-refs authority table: a living architecture doc still names this purged or pre-M4 shape. The reviewed row preserves only this exact citation identity while its owning doc repair lands; it does not classify the cited code as present.",
    endsWhen:
      "the owning documentation repair removes, strikes, riders, or repoints `CHAT_SURFACE_SLOTS`; the grouped finding disappears and central zero-use reconciliation stales this row.",
  },
  {
    id: "dangling-ref-citations:command-action",
    policyId: "dangling-ref-citations",
    subject: "COMMAND_ACTION",
    operation: "dangling-symbol-cite",
    why: "Temporary CERD truth-audit scope split carried from the legacy dangling-refs authority table: a living architecture doc still names this purged or pre-M4 shape. The reviewed row preserves only this exact citation identity while its owning doc repair lands; it does not classify the cited code as present.",
    endsWhen:
      "the owning documentation repair removes, strikes, riders, or repoints `COMMAND_ACTION`; the grouped finding disappears and central zero-use reconciliation stales this row.",
  },
  {
    id: "dangling-ref-citations:context-slots",
    policyId: "dangling-ref-citations",
    subject: "CONTEXT_SLOTS",
    operation: "dangling-symbol-cite",
    why: "Temporary CERD truth-audit scope split carried from the legacy dangling-refs authority table: a living architecture doc still names this purged or pre-M4 shape. The reviewed row preserves only this exact citation identity while its owning doc repair lands; it does not classify the cited code as present.",
    endsWhen:
      "the owning documentation repair removes, strikes, riders, or repoints `CONTEXT_SLOTS`; the grouped finding disappears and central zero-use reconciliation stales this row.",
  },
  {
    id: "dangling-ref-citations:domain-buddy",
    policyId: "dangling-ref-citations",
    subject: "domain/buddy",
    operation: "dangling-path-cite",
    why: "Temporary CERD truth-audit scope split carried from the legacy dangling-refs authority table: a living architecture doc still names this purged or pre-M4 shape. The reviewed row preserves only this exact citation identity while its owning doc repair lands; it does not classify the cited code as present.",
    endsWhen:
      "the owning documentation repair removes, strikes, riders, or repoints `domain/buddy`; the grouped finding disappears and central zero-use reconciliation stales this row.",
  },
  {
    id: "dangling-ref-citations:hub-adapters",
    policyId: "dangling-ref-citations",
    subject: "HUB_ADAPTERS",
    operation: "dangling-symbol-cite",
    why: "Temporary CERD truth-audit scope split carried from the legacy dangling-refs authority table: a living architecture doc still names this purged or pre-M4 shape. The reviewed row preserves only this exact citation identity while its owning doc repair lands; it does not classify the cited code as present.",
    endsWhen:
      "the owning documentation repair removes, strikes, riders, or repoints `HUB_ADAPTERS`; the grouped finding disappears and central zero-use reconciliation stales this row.",
  },
  {
    id: "dangling-ref-citations:infra-network-hubs",
    policyId: "dangling-ref-citations",
    subject: "infra/network/hubs/",
    operation: "dangling-path-cite",
    why: "Temporary CERD truth-audit scope split carried from the legacy dangling-refs authority table: a living architecture doc still names this purged or pre-M4 shape. The reviewed row preserves only this exact citation identity while its owning doc repair lands; it does not classify the cited code as present.",
    endsWhen:
      "the owning documentation repair removes, strikes, riders, or repoints `infra/network/hubs/`; the grouped finding disappears and central zero-use reconciliation stales this row.",
  },
  {
    id: "dangling-ref-citations:message-media",
    policyId: "dangling-ref-citations",
    subject: "@orb/ui/MessageMedia",
    operation: "dangling-path-cite",
    why: "Temporary CERD truth-audit scope split carried from the legacy dangling-refs authority table: a living architecture doc still names this purged or pre-M4 shape. The reviewed row preserves only this exact citation identity while its owning doc repair lands; it does not classify the cited code as present.",
    endsWhen:
      "the owning documentation repair removes, strikes, riders, or repoints `@orb/ui/MessageMedia`; the grouped finding disappears and central zero-use reconciliation stales this row.",
  },
  {
    id: "dangling-ref-citations:mobile-primary-sections",
    policyId: "dangling-ref-citations",
    subject: "MOBILE_PRIMARY_SECTIONS",
    operation: "dangling-symbol-cite",
    why: "Temporary CERD truth-audit scope split carried from the legacy dangling-refs authority table: a living architecture doc still names this purged or pre-M4 shape. The reviewed row preserves only this exact citation identity while its owning doc repair lands; it does not classify the cited code as present.",
    endsWhen:
      "the owning documentation repair removes, strikes, riders, or repoints `MOBILE_PRIMARY_SECTIONS`; the grouped finding disappears and central zero-use reconciliation stales this row.",
  },
  {
    id: "dangling-ref-citations:modal-slots",
    policyId: "dangling-ref-citations",
    subject: "MODAL_SLOTS",
    operation: "dangling-symbol-cite",
    why: "Temporary CERD truth-audit scope split carried from the legacy dangling-refs authority table: a living architecture doc still names this purged or pre-M4 shape. The reviewed row preserves only this exact citation identity while its owning doc repair lands; it does not classify the cited code as present.",
    endsWhen:
      "the owning documentation repair removes, strikes, riders, or repoints `MODAL_SLOTS`; the grouped finding disappears and central zero-use reconciliation stales this row.",
  },
  {
    id: "dangling-ref-citations:pairwise-cosine",
    policyId: "dangling-ref-citations",
    subject: "@orb/kit/vector-math.pairwiseCosine",
    operation: "dangling-path-cite",
    why: "Knowledge-Cluster.md §inv1 cites a real package export as `@orb/kit/vector-math.pairwiseCosine`; the path resolver proves files and directories but does not resolve a member after the dot. This exact token is licensed until the citation reader gains export-member identity.",
    endsWhen: "arm 3 resolves the export member structurally, or the doc stops citing this exact token; central zero-use reconciliation then stales this row.",
  },
  {
    id: "dangling-ref-citations:rail-actions",
    policyId: "dangling-ref-citations",
    subject: "RAIL_ACTIONS",
    operation: "dangling-symbol-cite",
    why: "Temporary CERD truth-audit scope split carried from the legacy dangling-refs authority table: a living architecture doc still names this purged or pre-M4 shape. The reviewed row preserves only this exact citation identity while its owning doc repair lands; it does not classify the cited code as present.",
    endsWhen:
      "the owning documentation repair removes, strikes, riders, or repoints `RAIL_ACTIONS`; the grouped finding disappears and central zero-use reconciliation stales this row.",
  },
  {
    id: "dangling-ref-citations:rail-sections",
    policyId: "dangling-ref-citations",
    subject: "RAIL_SECTIONS",
    operation: "dangling-symbol-cite",
    why: "Temporary CERD truth-audit scope split carried from the legacy dangling-refs authority table: a living architecture doc still names this purged or pre-M4 shape. The reviewed row preserves only this exact citation identity while its owning doc repair lands; it does not classify the cited code as present.",
    endsWhen:
      "the owning documentation repair removes, strikes, riders, or repoints `RAIL_SECTIONS`; the grouped finding disappears and central zero-use reconciliation stales this row.",
  },
  {
    id: "dangling-ref-citations:section-panel-defaults",
    policyId: "dangling-ref-citations",
    subject: "SECTION_PANEL_DEFAULTS",
    operation: "dangling-symbol-cite",
    why: "Temporary CERD truth-audit scope split carried from the legacy dangling-refs authority table: a living architecture doc still names this purged or pre-M4 shape. The reviewed row preserves only this exact citation identity while its owning doc repair lands; it does not classify the cited code as present.",
    endsWhen:
      "the owning documentation repair removes, strikes, riders, or repoints `SECTION_PANEL_DEFAULTS`; the grouped finding disappears and central zero-use reconciliation stales this row.",
  },
  {
    id: "dangling-ref-citations:section-placeholder-copy",
    policyId: "dangling-ref-citations",
    subject: "SECTION_PLACEHOLDER_COPY",
    operation: "dangling-symbol-cite",
    why: "Temporary CERD truth-audit scope split carried from the legacy dangling-refs authority table: a living architecture doc still names this purged or pre-M4 shape. The reviewed row preserves only this exact citation identity while its owning doc repair lands; it does not classify the cited code as present.",
    endsWhen:
      "the owning documentation repair removes, strikes, riders, or repoints `SECTION_PLACEHOLDER_COPY`; the grouped finding disappears and central zero-use reconciliation stales this row.",
  },
  {
    id: "dangling-ref-citations:sqlite-busy",
    policyId: "dangling-ref-citations",
    subject: "SQLITE_BUSY",
    operation: "dangling-symbol-cite",
    why: "Tier-1-DB.md cites SQLite's external C-API error code `SQLITE_BUSY`. It is not a repository declaration, so the declaration index correctly cannot resolve it; this exact external symbol is the classified reviewed exception.",
    endsWhen:
      "the doc stops citing `SQLITE_BUSY` or the repository defines its own symbol with that name; the finding disappears and central zero-use reconciliation stales this row.",
  },
  {
    id: "dangling-ref-citations:tab-edge-classes",
    policyId: "dangling-ref-citations",
    subject: "TAB_EDGE_CLASSES",
    operation: "dangling-symbol-cite",
    why: "Temporary CERD truth-audit scope split carried from the legacy dangling-refs authority table: a living architecture doc still names this purged or pre-M4 shape. The reviewed row preserves only this exact citation identity while its owning doc repair lands; it does not classify the cited code as present.",
    endsWhen:
      "the owning documentation repair removes, strikes, riders, or repoints `TAB_EDGE_CLASSES`; the grouped finding disappears and central zero-use reconciliation stales this row.",
  },
  {
    id: "dangling-ref-citations:tokens",
    policyId: "dangling-ref-citations",
    subject: "@orb/tokens",
    operation: "dangling-path-cite",
    why: "Temporary CERD truth-audit scope split carried from the legacy dangling-refs authority table: a living architecture doc still names this purged or pre-M4 shape. The reviewed row preserves only this exact citation identity while its owning doc repair lands; it does not classify the cited code as present.",
    endsWhen:
      "the owning documentation repair removes, strikes, riders, or repoints `@orb/tokens`; the grouped finding disappears and central zero-use reconciliation stales this row.",
  },
  {
    id: "dangling-ref-citations:transport-buddy-bus",
    policyId: "dangling-ref-citations",
    subject: "transport/trpc/buddy-bus.ts",
    operation: "dangling-path-cite",
    why: "Temporary CERD truth-audit scope split carried from the legacy dangling-refs authority table: a living architecture doc still names this purged or pre-M4 shape. The reviewed row preserves only this exact citation identity while its owning doc repair lands; it does not classify the cited code as present.",
    endsWhen:
      "the owning documentation repair removes, strikes, riders, or repoints `transport/trpc/buddy-bus.ts`; the grouped finding disappears and central zero-use reconciliation stales this row.",
  },
  {
    id: "dangling-ref-citations:you-modal-rows",
    policyId: "dangling-ref-citations",
    subject: "YOU_MODAL_ROWS",
    operation: "dangling-symbol-cite",
    why: "Temporary CERD truth-audit scope split carried from the legacy dangling-refs authority table: a living architecture doc still names this purged or pre-M4 shape. The reviewed row preserves only this exact citation identity while its owning doc repair lands; it does not classify the cited code as present.",
    endsWhen:
      "the owning documentation repair removes, strikes, riders, or repoints `YOU_MODAL_ROWS`; the grouped finding disappears and central zero-use reconciliation stales this row.",
  },
  // THE TWO SYMBOLS THE 2026-09-13 CONVERSIONS DELETED, STILL NAMED BY LAW DOCS ON PURPOSE (#1584, #1939).
  // These are NOT the pending-doc-repair class above. The conversions deleted both gate-local tables and the
  // law docs name them to record WHAT was retired and what replaced it — a reader tracing an old prefix table
  // to its successor grants needs the old name in the sentence. Striking the names would destroy the very
  // connection the paragraphs exist to make, so the citation is intentional history, not drift.
  {
    id: "dangling-ref-citations:elevated-allow",
    policyId: "dangling-ref-citations",
    subject: "ELEVATED_ALLOW",
    operation: "dangling-symbol-cite",
    why: "`density-tier`'s gate-local 11-row directory/file PREFIX table, deleted by the 2026-09-13 authority migration that replaced it with 12 per-file `elevated-radius` reviewed grants (a strengthening: a prefix silently covered every file in a primitive directory). Core-Enforcement-Active-Gates.md:239 and UI-Density-Law.md:166 both name it to record that retirement and its direction.",
    endsWhen:
      "both law docs stop naming `ELEVATED_ALLOW` — i.e. the retirement paragraphs are archived out of the living docs once nobody needs to trace the prefix table to its successor grants.",
  },
  {
    id: "dangling-ref-citations:exempt-procedures",
    policyId: "dangling-ref-citations",
    subject: "EXEMPT_PROCEDURES",
    operation: "dangling-symbol-cite",
    why: "`duplicate-action-doors`' gate-local ExemptionTable (one procedure-keyed row qualifying on four planes), deleted by the 2026-09-13 authority migration that replaced it with four of the ten central door-set grants. Core-Enforcement-Active-Gates.md:294 names it twice: once to record where the exemption mechanism went, and once to state the behaviour change it caused — a new settings-section door now REDS where this table absorbed it silently (#2352).",
    endsWhen:
      "Core-Enforcement-Active-Gates.md stops naming `EXEMPT_PROCEDURES`, which requires #2352 to land first: until the section-discriminant predicate exists, that paragraph is the only record of why a new settings section reds.",
  },
  // THE #252 DUPLICATE-ACTION DOOR RULINGS (#1584, 2026-09-13). They replace
  // `duplicate-action-doors.baseline.json` (six RATIFIED count rows whose `cite` list was the real ruling) and the
  // gate-local `EXEMPT_PROCEDURES` table (one procedure-keyed row, four qualifying planes). THE RULED UNIT IS THE
  // DOOR SET and it lives in the `operation`, which is what preserves #2101's two-sided semantics through the
  // migration: a third door, a moved door, a swapped door or a pure RENAME changes the set, the row stops matching,
  // the finding is effective, and the orphaned row alarms stale.
  //
  // THE ROWS ARE AUTHORED IN `_shared/action-door-rulings.ts` AND MAPPED HERE, which is the ONLY placement that
  // serves both readers: the `ast subset-callers` lens renders the same ruling, and a lens reading this table
  // through `verify/index.ts` closes a real import cycle (measured 2026-09-13: five `noImportCycles` errors, the
  // loop being verify/index → ops/debt → … → ast/index → ops/subset-callers). `_shared` is the floor both tools
  // read down into; the retired `DOORS_BASELINE_REL` sat there for exactly this reason. Consumption, staleness and
  // over-broad judgment remain entirely central.
  ...ACTION_DOOR_RULINGS.map(
    (ruling): ReviewedGateGrant => ({
      id: ruling.id,
      policyId: "duplicate-action-doors",
      subject: ruling.subject,
      operation: rulingOperation(ruling),
      why: ruling.why,
      endsWhen: ruling.endsWhen,
    }),
  ),
];
