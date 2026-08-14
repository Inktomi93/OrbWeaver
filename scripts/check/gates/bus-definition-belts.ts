// Gate: bus-definition-belts (client-architecture-lockdown.md §13 law 4/5, §16 G11) — a new bus's
// `*_EVENT_TYPES` belt const is the PRODUCER-coverage belt; a client mapped-type-total map over its event
// union is the CONSUMER-exhaustiveness belt. Two belt shapes are recognized: the object literal
// `{ … } satisfies Record<X["type"], true>` (CHAT_BUS_EVENT_TYPES/USER_BUS_EVENT_TYPES) and the array
// literal `[…] as const satisfies readonly X["type"][]` (RPG_BUS_EVENT_TYPES) — a plain `[…] as const`
// with no `satisfies` is NOT a bus belt and is out of scope for the two arms below. (Until 2026-08-14
// `DOMAIN_EVENT_TYPES` was that plain shape ON PURPOSE, to hide from the client-map arm; ARM C + the reach
// lane made it honest, and it now carries the `satisfies`.) A new bus can ship the
// belt const and still be missing either enforcement belt (a coverage gate that never got built, or a
// client map that never got wired) — both are silent holes tsc can't see (a `satisfies` const with no
// consumer is legal TypeScript). Every such const found in `@orb/contracts` must have BOTH: a
// `scripts/check/gates/*.ts` coverage-gate file naming it, AND a mapped-type total map over its event union
// somewhere in `packages/client/src` (the ONE invalidation seam `data/invalidation.ts` for the global
// chat/user buses; a bus's own stream hook otherwise — the belt is located client-wide BY SHAPE, never by
// path). (Truth-repair 2026-08-14, event-bus coverage survey §1.2: this line used to name
// `features/rpg/hooks/use-rpg-stream.ts` as the rpg map's home. That file does not exist — `RPG_BUS_FILTERS`
// lives in `data/invalidation.ts` with the other two maps, and the gate never looked at a path anyway.)
//
// ARM C — BELT EXISTENCE (G-B, 2026-08-14, event-bus coverage survey §3.2). The two arms above quantify over
// BELTS; a bus union with NO belt const at all was invisible to all of them, and that is not hypothetical:
// `AutomationBusEvent` shipped beltless, so no gate could see the bus and `rulesChanged` sat declared and
// un-emitted for the domain's whole life (survey §2.3). ARM C closes the quantifier from the UNION side —
// every exported `*BusEvent` alias in `@orb/contracts` (plus `DomainEvent` by name) must have a belt.
//
// THE REACH LANE, and why it is a declared architecture fact rather than a parked allowlist. Minting a belt
// is NEVER inert (the [[belt-const-is-never-inert]] lesson, MEASURED on this tree: the survey planted
// `AUTOMATION_BUS_EVENT_TYPES`, ran this gate alone, and went 0 findings → 2 findings). One of those two —
// the client total map — is structurally unsatisfiable for a bus with no browser consumer: `DomainEvent`
// never leaves the process, and the automation room has zero client subscribers, so a total map would be
// dead wire knip flags. `SERVER_INTERNAL_REACH` names those buses and what satisfies the consumer belt
// INSTEAD (a server-side exhaustive dispatch — `assertNeverEvent` in entry/compose/search-discovery.ts is
// the live exemplar). It is two-sided: the day a union in the table grows a real client total map, its row
// is RED and gets deleted.
import type { SourceFile, Node as TsNode } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { ExemptionTable, GateDescriptor, GateRunCtx } from "../contract.ts";
import { fileLoaded } from "../pass.ts";

const CONTRACTS_SCOPE = /\/packages\/contracts\/src\//u;
const GATES_SCOPE = /\/scripts\/check\/gates\//u;
const OWN_HOME = /bus-definition-belts\.ts$/u;
const CLIENT_SRC = /\/packages\/client\/src\//u;
const EVENT_TYPES_SUFFIX = "_EVENT_TYPES";
const GATE_SELF = "scripts/check/gates/bus-definition-belts.ts";
/** Real-tree anchor for the two STALE sweeps (§4.5) — present on every real run, planted by no example. */
const STALE_ARM_ANCHOR = "packages/db/src/schema/index.ts";

/** ARM C's target set: an exported type alias in contracts is a BUS UNION iff its name ends `BusEvent`, or
 *  it is exactly `DomainEvent` (the one bus whose union name predates the convention — named here so a
 *  rename of EITHER shows up as the §4.6 blindness tripwire below rather than as silence). */
const BUS_UNION_SUFFIX = "BusEvent";
const NAMED_BUS_UNIONS: ReadonlySet<string> = new Set(["DomainEvent"]);

/** Bus unions that legitimately have NO belt of their own → why, and what would end it. Two-sided: a row
 *  whose union is gone, or which has since grown its own belt, is RED. */
const BELT_EXEMPT: ExemptionTable = {
  WiBusEvent: {
    why: "NOT a bus — a SUB-UNION spliced into ChatBusEvent (packages/contracts/src/chat/bus.ts), so its five members are already belted by CHAT_BUS_EVENT_TYPES and a second belt would be a parallel home for the same discriminators. Ends the day world-info gets its own transport room: it would then need its own belt, its own coverage spec, and this row deleted. If WiBusEvent ever stops being spliced into ChatBusEvent, this row is a lie and must go.",
  },
};

/** Buses whose CONSUMER belt is a server-side exhaustive dispatch rather than a client total map → why, and
 *  what would end it. Two-sided: a row whose union DOES have a client total map is RED. */
const SERVER_INTERNAL_REACH: ExemptionTable = {
  DomainEvent: {
    why: "the in-process domain-event bus never leaves the server (entry/compose/event-bus.ts) — its consumer belt is the `assertNeverEvent` exhaustive subscriber at entry/compose/search-discovery.ts. Ends if a domain event is ever forwarded to a browser, at which point it owes a real client total map.",
  },
  AutomationBusEvent: {
    why: "the automation room has a real SSE transport but ZERO client consumers today (`AutomationBusEvent`/`quickReplySurfaced` appear 0 times under packages/client/src; the settings pane is `{placeholder: true}`), so a client total map would be dead wire knip flags rather than enforcement. Ends the moment the quick-reply chips UI lands — the map becomes buildable, this row goes RED, and it gets deleted.",
  },
};

const NO_BELT_PREFIX =
  'bus event union in @orb/contracts with NO `*_EVENT_TYPES` belt const — the coverage ratchets quantify over BELTS, not over buses, so a beltless bus is invisible to every one of them (this is exactly how AutomationBusEvent carried a declared-never-emitted `rulesChanged` for its whole life). Add the belt beside the union, `satisfies Record<Union["type"], true>` or `as const satisfies readonly Union["type"][]`: ';
const STALE_BELT_EXEMPT_PREFIX =
  "BELT_EXEMPT row is stale — the union is gone from @orb/contracts, or it now HAS its own belt. A standing 'this needs no belt' promise for a site that changed is a loaded gun; delete the row in scripts/check/gates/bus-definition-belts.ts: ";
const STALE_REACH_PREFIX =
  "SERVER_INTERNAL_REACH row is stale — this union now HAS a client-side total map, so the reach lane it was granted no longer describes it. Delete the row in scripts/check/gates/bus-definition-belts.ts: ";
const BLIND_MESSAGE =
  "DERIVED NO BUS UNIONS — no exported `*BusEvent` alias was found in packages/contracts/src on a tree that HAS the contracts package. ARM C keys on that name shape, so its ✓ would be a placebo (GATE-AUTHORING.md §4.6). Re-point it: scripts/check/gates/bus-definition-belts.ts";

const NO_COVERAGE_GATE_PREFIX =
  "*_EVENT_TYPES const has NO matching coverage-gate file — a new bus's producer-coverage belt (client-architecture-lockdown.md §13 law 4, the bus-coverage/user-bus-coverage precedent) was never built. Add a scripts/check/gates/<bus>-coverage.ts ratchet naming this const: ";
const NO_CLIENT_MAP_PREFIX =
  "*_EVENT_TYPES const has NO client-side total map in packages/client/src — a new bus's consumer-exhaustiveness belt (client-architecture-lockdown.md §13 law 3/5) is unwired; add a mapped-type total map over the event union (the ONE invalidation seam data/invalidation.ts for global buses, or the bus's own stream hook): ";

interface EventTypesConst {
  readonly name: string;
  readonly unionName: string;
  readonly file: string;
}

/** `decl`'s initializer, if it is one of the two producer-coverage belt shapes — the union's type-name,
 *  or `undefined` if the shape doesn't match. Both shapes assert the belt is total over `Union["type"]`:
 *    A. object literal `{ … } satisfies Record<Union["type"], true>` (chat/user)
 *    B. array literal `[…] as const satisfies readonly Union["type"][]` (rpg)
 *  A plain `[…] as const` with NO `satisfies` (e.g. `DOMAIN_EVENT_TYPES`) is NOT a bus belt — excluded. */
function recordUnionName(decl: { getInitializer: () => TsNode | undefined }): string | undefined {
  const init = decl.getInitializer();
  if (init === undefined || !Node.isSatisfiesExpression(init)) {
    return;
  }
  const typeNode = init.getTypeNode();
  // Shape A: satisfies Record<Union["type"], true>
  if (Node.isTypeReference(typeNode) && typeNode.getTypeName().getText() === "Record") {
    const first = typeNode.getTypeArguments()[0];
    return first !== undefined && Node.isIndexedAccessTypeNode(first) ? first.getObjectTypeNode().getText() : undefined;
  }
  // Shape B: satisfies readonly Union["type"][]  (the `readonly` is a TypeOperator wrapping the ArrayType)
  const arrayType = Node.isTypeOperatorTypeNode(typeNode) ? typeNode.getTypeNode() : typeNode;
  if (arrayType === undefined || !Node.isArrayTypeNode(arrayType)) {
    return;
  }
  const el = arrayType.getElementTypeNode();
  return Node.isIndexedAccessTypeNode(el) ? el.getObjectTypeNode().getText() : undefined;
}

/** Every `X_EVENT_TYPES` const in @orb/contracts shaped `satisfies Record<Union["type"], true>` — the
 *  belt-set's producer side (bus-coverage.ts's own home). Vacuous on a synthetic tree with no contracts. */
function findEventTypesConsts(files: readonly SourceFile[]): EventTypesConst[] {
  const found: EventTypesConst[] = [];
  for (const sf of files.filter((f) => CONTRACTS_SCOPE.test(f.getFilePath()))) {
    for (const decl of sf.getDescendantsOfKind(SyntaxKind.VariableDeclaration)) {
      const name = decl.getName();
      if (!name.endsWith(EVENT_TYPES_SUFFIX)) {
        continue;
      }
      const unionName = recordUnionName(decl);
      if (unionName !== undefined) {
        found.push({ name, unionName, file: sf.getFilePath() });
      }
    }
  }
  return found;
}

/** Does any scripts/check/gates/*.ts file (other than this one) name the const literally? Mirrors
 *  bus-coverage.ts's own `const TYPES_CONST = "CHAT_BUS_EVENT_TYPES"` convention. */
function hasCoverageGate(files: readonly SourceFile[], constName: string): boolean {
  return files.some((sf) => GATES_SCOPE.test(sf.getFilePath()) && !OWN_HOME.test(sf.getFilePath()) && sf.getFullText().includes(constName));
}

/** Is `node` an `IndexedAccessTypeNode` over exactly `unionName["type"]`-shaped? */
function isIndexedOverUnion(node: TsNode | undefined, unionName: string): boolean {
  return node !== undefined && Node.isIndexedAccessTypeNode(node) && node.getObjectTypeNode().getText() === unionName;
}

/** Does SOME `packages/client/src` file declare a mapped type (`[K in Union["type"]]`) OR a
 *  `Record<Union["type"], …>` type reference over this exact union — the client consumer-exhaustiveness
 *  belt. All three live maps (chat/user/rpg) happen to sit in the ONE invalidation seam
 *  `data/invalidation.ts` today, but the search is BY SHAPE and client-wide on purpose: a feature bus may
 *  legitimately home its total map in its own stream hook, and a path-keyed gate dies on a rename.
 *  (Truth-repair 2026-08-14: this comment used to assert the rpg map lived in
 *  `features/rpg/hooks/use-rpg-stream.ts` — no such file exists.) */
function fileHasTotalMap(sf: SourceFile, unionName: string): boolean {
  const mappedHit = sf.getDescendantsOfKind(SyntaxKind.MappedType).some((m) => isIndexedOverUnion(m.getTypeParameter().getConstraint(), unionName));
  if (mappedHit) {
    return true;
  }
  return sf
    .getDescendantsOfKind(SyntaxKind.TypeReference)
    .some((ref) => ref.getTypeName().getText() === "Record" && isIndexedOverUnion(ref.getTypeArguments()[0], unionName));
}

function hasClientTotalMap(files: readonly SourceFile[], unionName: string): boolean {
  return files.some((f) => CLIENT_SRC.test(f.getFilePath()) && fileHasTotalMap(f, unionName));
}

interface BusUnion {
  readonly name: string;
  readonly file: string;
  readonly line: number;
}

/** ARM C's derivation: every EXPORTED type alias in `@orb/contracts` whose name ends `BusEvent`, plus the
 *  by-name members of `NAMED_BUS_UNIONS`. The discriminant TWINS (`AutomationBusEventType`,
 *  `RpgBusEventType`, `DomainEventType`) fall out by the suffix test — they end `EventType`, not
 *  `BusEvent` — and are not buses. */
function findBusUnions(files: readonly SourceFile[]): BusUnion[] {
  const found: BusUnion[] = [];
  for (const sf of files.filter((f) => CONTRACTS_SCOPE.test(f.getFilePath()))) {
    for (const alias of sf.getTypeAliases()) {
      const name = alias.getName();
      if (!(alias.isExported() && (name.endsWith(BUS_UNION_SUFFIX) || NAMED_BUS_UNIONS.has(name)))) {
        continue;
      }
      found.push({ name, file: sf.getFilePath(), line: alias.getStartLineNumber() });
    }
  }
  return found;
}

const repoRel = (root: string, abs: string): string => (root === "" ? abs : abs.slice(root.length + 1));

/** The two ORIGINAL arms: each belt const owes a coverage-gate file and (unless it is on the reach lane) a
 *  client total map. */
function reportBeltGaps(ctx: GateRunCtx, files: readonly SourceFile[], belts: readonly EventTypesConst[]): void {
  for (const c of belts) {
    const file = repoRel(ctx.root, c.file);
    if (!hasCoverageGate(files, c.name)) {
      ctx.report({ file, line: 1, column: 0, message: NO_COVERAGE_GATE_PREFIX + c.name });
    }
    // THE REACH LANE: a server-internal bus satisfies the consumer belt with an exhaustive server-side
    // dispatch instead of a client total map (see the header).
    if (!(c.unionName in SERVER_INTERNAL_REACH || hasClientTotalMap(files, c.unionName))) {
      ctx.report({ file, line: 1, column: 0, message: NO_CLIENT_MAP_PREFIX + c.name });
    }
  }
}

/** The two STALE sweeps — WHOLE-TREE claims, so they run only behind the real-tree anchor (§4.5). */
function reportStaleTables(ctx: GateRunCtx, files: readonly SourceFile[], liveUnions: ReadonlySet<string>, belted: ReadonlySet<string>): void {
  if (!fileLoaded(ctx, STALE_ARM_ANCHOR)) {
    return;
  }
  for (const name of Object.keys(BELT_EXEMPT)) {
    if (!liveUnions.has(name) || belted.has(name)) {
      ctx.report({ file: GATE_SELF, line: 1, column: 0, message: `${STALE_BELT_EXEMPT_PREFIX}"${name}" — scripts/check/gates/bus-definition-belts.ts` });
    }
  }
  for (const name of Object.keys(SERVER_INTERNAL_REACH)) {
    if (liveUnions.has(name) && hasClientTotalMap(files, name)) {
      ctx.report({ file: GATE_SELF, line: 1, column: 0, message: `${STALE_REACH_PREFIX}"${name}" — scripts/check/gates/bus-definition-belts.ts` });
    }
  }
}

/** ARM C: every bus UNION owes a belt, plus the blindness tripwire and the two stale sweeps. */
function reportArmC(ctx: GateRunCtx, files: readonly SourceFile[], belted: ReadonlySet<string>): void {
  const unions = findBusUnions(files);
  if (unions.length === 0) {
    // A whole-tree claim: a conformance mini-project legitimately has contracts files and no bus union, so
    // the tripwire anchors on a REAL-TREE file no example plants (§4.5), never on `scope.kind`.
    if (fileLoaded(ctx, STALE_ARM_ANCHOR)) {
      ctx.report({ file: GATE_SELF, line: 1, column: 0, message: BLIND_MESSAGE });
    }
    return;
  }
  for (const u of unions) {
    if (!(belted.has(u.name) || u.name in BELT_EXEMPT)) {
      ctx.report({ file: repoRel(ctx.root, u.file), line: u.line, column: 0, message: NO_BELT_PREFIX + u.name });
    }
  }
  reportStaleTables(ctx, files, new Set(unions.map((u) => u.name)), belted);
}

export const gate: GateDescriptor = {
  name: "bus-definition-belts",
  docRow: "client-architecture-lockdown.md §13 law 4/5, §16 G11",
  status: "active",
  scopeSafety: "whole-project",
  message: NO_COVERAGE_GATE_PREFIX,
  fix: "add the missing belt: a scripts/check/gates/<bus>-coverage.ts ratchet naming the const, and/or a mapped-type total map over the event union somewhere in packages/client/src (data/invalidation.ts for global buses, or the bus's own stream hook).",
  run: (ctx) => {
    const files = ctx.project.getSourceFiles();
    const belts = findEventTypesConsts(files);
    reportBeltGaps(ctx, files, belts);
    reportArmC(ctx, files, new Set(belts.map((b) => b.unionName)));
  },
  mustFlag: [
    {
      files: {
        "packages/contracts/src/__probe/index.ts":
          'export type PEv = { type: "a" };\nexport const PROBE_EVENT_TYPES = { a: true } satisfies Record<PEv["type"], true>;\n',
        "packages/client/src/data/invalidation.ts": "export const untouched = 1;\n",
      },
      expect: { messageIncludes: "NO matching coverage-gate file" },
      why: "a new bus's *_EVENT_TYPES const with NEITHER a coverage-gate file NOR a client total map — both belts missing",
    },
    {
      // the ARRAY-belt shape (`[…] as const satisfies readonly X["type"][]`, the rpg pattern) is now in
      // scope — it too fires when both belts are missing.
      files: {
        "packages/contracts/src/__probe/index.ts":
          'export type PArr = { type: "a" };\nexport const PARR_EVENT_TYPES = ["a"] as const satisfies readonly PArr["type"][];\n',
        "packages/client/src/data/invalidation.ts": "export const untouched = 1;\n",
      },
      expect: { messageIncludes: "NO matching coverage-gate file" },
      why: "an array-literal `satisfies readonly X[type][]` belt (the rpg shape) with neither belt — the array-shape blindness fix now catches it",
    },
    {
      // ARM C: the union exists, no belt const anywhere. THE FOUNDING SHAPE — this is `AutomationBusEvent`
      // as it stood until 2026-08-14, and no gate on the tree could see it.
      files: {
        "packages/contracts/src/automation/index.ts": 'export type PAutoBusEvent = { type: "ruleFired" } | { type: "rulesChanged" };\n',
        "packages/client/src/data/invalidation.ts": "export const untouched = 1;\n",
      },
      expect: { messageIncludes: "NO `*_EVENT_TYPES` belt const" },
      why: "ARM C's founding shape: a beltless bus union. The two older arms quantify over belts, so before this arm existed a union with no belt was reachable by NO gate — which is how rulesChanged shipped dead",
    },
    {
      // ARM C by NAME: `DomainEvent` does not end `BusEvent`, so the suffix test alone would miss it.
      files: {
        "packages/contracts/src/events/index.ts": 'export type DomainEvent = { type: "character.updated" };\n',
        "packages/client/src/data/invalidation.ts": "export const untouched = 1;\n",
      },
      expect: { messageIncludes: "NO `*_EVENT_TYPES` belt const" },
      why: "the by-NAME half of the derivation — `DomainEvent` predates the `*BusEvent` convention, and naming it explicitly is what makes a rename of it show up as the blindness tripwire instead of silence",
    },
  ],
  mustPass: [
    {
      files: {
        "packages/contracts/src/__probe/index.ts":
          'export type PEv = { type: "a" };\nexport const PROBE_EVENT_TYPES = { a: true } satisfies Record<PEv["type"], true>;\n',
        "scripts/check/gates/__probe-coverage.ts": 'export const TYPES_CONST = "PROBE_EVENT_TYPES";\n',
        "packages/client/src/data/invalidation.ts":
          'import type { PEv } from "@orb/contracts/__probe";\ntype ProbeMap = { readonly [K in PEv["type"]]: () => void };\n',
      },
      why: "the const has BOTH belts: a coverage-gate file naming it + a client mapped-type total map over its union — passes",
    },
    {
      files: {
        "packages/contracts/src/events/index.ts": 'export const SOME_LOOKUP_EVENT_TYPES = ["character.updated"] as const;\n',
        "packages/client/src/data/invalidation.ts": "export const untouched = 1;\n",
      },
      why: "a plain `as const` array with NO `satisfies` is not a belt and its const is not a bus — the two belt arms are shape-keyed. (This used to be DOMAIN_EVENT_TYPES itself; ARM C is precisely what stopped that shape from being a hiding place, so the row now uses a neutral const)",
    },
    {
      // the array-belt shape WITH both belts — and the client total map homed in a FEATURE STREAM HOOK
      // (not data/invalidation.ts), the rpg `use-rpg-stream.ts` case: the belt is located client-wide.
      files: {
        "packages/contracts/src/__probe/index.ts":
          'export type PArr = { type: "a" };\nexport const PARR_EVENT_TYPES = ["a"] as const satisfies readonly PArr["type"][];\n',
        "scripts/check/gates/__parr-coverage.ts": 'export const TYPES_CONST = "PARR_EVENT_TYPES";\n',
        "packages/client/src/features/probe/hooks/use-probe-stream.ts":
          'import type { PArr } from "@orb/contracts/__probe";\ntype ProbeMap = { readonly [K in PArr["type"]]: () => void };\n',
      },
      why: "an array-belt const with BOTH belts, the client map in a feature stream hook (not the invalidation seam) — the client-wide belt location, passes",
    },
    {
      // THE REACH LANE: a SERVER_INTERNAL bus with its belt + coverage gate and NO client map — satisfied
      // by the server-side exhaustive dispatch instead. This is the live `DomainEvent` shape.
      files: {
        "packages/contracts/src/events/index.ts":
          'export type DomainEvent = { type: "asset.created" };\nexport const DOMAIN_EVENT_TYPES = ["asset.created"] as const satisfies readonly DomainEvent["type"][];\n',
        "scripts/check/gates/__domain-events-coverage.ts": 'export const TYPES_CONST = "DOMAIN_EVENT_TYPES";\n',
        "packages/client/src/data/invalidation.ts": "export const untouched = 1;\n",
      },
      why: "the declared REACH LANE — a bus that never reaches a browser owes an exhaustive SERVER-side subscriber, not a client total map. Without this lane, belting DomainEvent would demand dead wire, which is exactly why it was left un-`satisfies`'d and invisible for so long",
    },
    {
      // ARM C's exemption: a SUB-UNION spliced into another bus's union is belted by the PARENT.
      files: {
        "packages/contracts/src/world-info/index.ts": 'export type WiBusEvent = { type: "wiBookAttached" };\n',
        "packages/contracts/src/chat/bus.ts":
          'import type { WiBusEvent } from "../world-info/index.ts";\nexport type ChatBusEvent = WiBusEvent | { type: "delta" };\nexport const CHAT_BUS_EVENT_TYPES = { wiBookAttached: true, delta: true } satisfies Record<ChatBusEvent["type"], true>;\n',
        "scripts/check/gates/__chat-coverage.ts": 'export const TYPES_CONST = "CHAT_BUS_EVENT_TYPES";\n',
        "packages/client/src/data/invalidation.ts":
          'import type { ChatBusEvent } from "@orb/contracts/chat";\ntype Filters = { readonly [K in ChatBusEvent["type"]]: () => void };\n',
      },
      why: "`WiBusEvent`'s BELT_EXEMPT row, live: its five members ride CHAT_BUS_EVENT_TYPES, and a second belt would be a parallel home for the same discriminators. The row is two-sided — it REDs the day WiBusEvent grows its own belt or leaves the tree",
    },
  ],
};
