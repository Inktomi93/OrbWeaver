// Policy: bus-channel-primitive (client-architecture-lockdown.md §13/§16 G10) — `defineBusChannel`
// (transport/trpc/bus-channel.ts) is the ONE transport EventEmitter home. chat/user/notifications used to
// hand-roll `new EventEmitter()` + `setMaxListeners(0)` + a channel-key fn + `on(emitter, channel, {signal})`
// three times over (M9); a fourth bus reaching for a bespoke emitter instead of the mint is the same drift
// reappearing. Buddy's `@orb/kit/replay-buffer`-backed bus is domain-minted, not a transport `EventEmitter` —
// out of scope by owner ruling (O4).
//
// IDENTITY, NOT SPELLING: the legacy check was `node.getExpression().getText() === "EventEmitter"`, which a
// local class of that name false-reds and an alias (`import { EventEmitter as EE }`), a namespace member
// (`events.EventEmitter`) or a barrel re-export walks straight past. The subject is now the CONSTRUCTED
// CLASS resolved through the shared callable-origin reader: the `EventEmitter` export entering through the
// `node:events` door, however the consumer spelled it. Node's builtin has no declaration file in this
// program, so the canonical origin is an EXTERNAL DOOR — the door plus the export name IS the identity
// available, and a project class of the same name resolves to a project declaration and is therefore not it.
//
// AUTHORITY IS reviewed-grant. The mint's own module is not a per-occurrence mistake; it is a recurring
// repository PERMISSION — the emitter it wraps is constructed THERE, which is the entire point of the mint.
// It is one exact `(subject, operation)` row in the central reviewed-grant table with `why` and `endsWhen`.
// A row consumed zero times is STALE — which is exactly the rename tripwire the legacy `SANCTIONED_HOMES`
// table carried, now owned centrally: the day the mint moves, the row goes red at its dead subject. Nothing
// here subtracts a path from the population and this policy holds no allowlist of its own.
import type { Node as MorphNode, SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import { classifyOriginRefusal, referenceNamesExport } from "../lib/origin-verdict.ts";
import { resolveCallableOrigin } from "../lib/reference-fact-call.ts";
import { originModuleSpecifier } from "../lib/sealed-origin.ts";

const EMITTER_EXPORT = "EventEmitter";
const OPERATION = "event-emitter-construction";
/** The two authored spellings of node's own events door; the canonical origin reports the one it entered. */
const EVENTS_DOORS: readonly string[] = ["node:events", "events"];

const MESSAGE =
  "`new EventEmitter()` under packages/server/src/transport/ outside the mint — defineBusChannel " +
  "(transport/trpc/bus-channel.ts, client-architecture-lockdown.md §13/§16 G10) is the ONE transport " +
  "EventEmitter home; a bespoke emitter re-introduces the machinery M9 unified. Buddy's domain-minted " +
  "replay-buffer bus is out of scope (O4).";
const FIX = "route the bus through defineBusChannel (transport/trpc/bus-channel.ts) instead of a bespoke `new EventEmitter()`.";

interface Construction {
  readonly node: MorphNode;
  readonly subject: string;
}

/** Does this construction reach node's `EventEmitter`, or is it unreadable? Fail-closed: a `new` whose class
 *  cannot be read at all is reported, because a one-home rule an unreadable barrel can walk through is not
 *  one. A construction that PROVABLY binds another declaration is a different class and passes. */
function constructsEventEmitter(node: MorphNode): boolean {
  if (!Node.isNewExpression(node)) {
    return false;
  }
  // THE CANDIDATE PREFILTER, and fail-closure's mandatory companion: without it every `new X()` whose class
  // the reader cannot name — `new TRPCError(…)` five times over on the live tree — is accused of being the
  // emitter. It follows an import ALIAS and immutable CONST-ALIAS hops, so the only spelling it loses is a
  // re-export under a DIFFERENT name (a declared limit with its own row).
  if (!referenceNamesExport(node.getExpression(), EMITTER_EXPORT)) {
    return false;
  }
  const origin = resolveCallableOrigin(node);
  if (origin.kind === "unresolved") {
    // The CALLEE is the binding whose identity is in question — the refusal's own node can sit anywhere
    // along the trace, and classifying that one answers a different question than the policy asked.
    return classifyOriginRefusal(origin.reason, node.getExpression()) === "unreadable";
  }
  const target = origin.value.target;
  if (target.kind !== "module") {
    return false;
  }
  return target.canonical.exportedName === EMITTER_EXPORT && EVENTS_DOORS.includes(originModuleSpecifier(target));
}

export const gate = defineGate({
  id: "bus-channel-primitive",
  family: "bus-channel-primitive",
  authority: "reviewed-grant",
  severity: "error",
  population: { in: ["@server"], under: ["packages/server/src/transport/**"] },
  analysis: "types",
  execution: "entire-population",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => {
    const constructions = new Map<string, Construction>();
    return {
      visitors: [
        {
          kinds: [SyntaxKind.NewExpression],
          visit: (node, sourceFile: SourceFile) => {
            if (!constructsEventEmitter(node)) {
              return;
            }
            const subject = ctx.relativePath(sourceFile);
            // ONE finding per carrier: a grant licenses one `(subject, operation)`, and a home that
            // constructs twice would make its own row OVER-BROAD and license nothing.
            if (!constructions.has(subject)) {
              constructions.set(subject, { node, subject });
            }
          },
        },
      ],
      evaluate: () => {
        for (const [subject, construction] of [...constructions].toSorted(([left], [right]) => left.localeCompare(right))) {
          ctx.report.node(construction.node, {
            subject,
            operation: OPERATION,
            message: `${MESSAGE} Constructor: ${subject}.`,
            fix: FIX,
          });
        }
      },
    };
  },
  mustFlag: [
    {
      mode: "types",
      files: {
        "packages/server/src/transport/trpc/probe-bus.ts": 'import { EventEmitter } from "node:events";\nexport const bus = new EventEmitter();\n',
      },
      expect: { count: 1, messageIncludes: "packages/server/src/transport/trpc/probe-bus.ts" },
      why: "the founding shape — a bespoke `new EventEmitter()` under transport/, which reintroduces the pre-M9 pattern; the message carries the exact grant SUBJECT",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/transport/trpc/alias-bus.ts": 'import { EventEmitter as EE } from "node:events";\nexport const bus = new EE();\n',
      },
      expect: { count: 1 },
      why: 'AN IMPORT ALIAS constructs the same class — the legacy `getText() === "EventEmitter"` check saw `EE` and passed it',
    },
    {
      mode: "types",
      files: {
        "packages/server/src/transport/trpc/ns-bus.ts": 'import * as events from "node:events";\nexport const bus = new events.EventEmitter();\n',
      },
      expect: { count: 1 },
      why: "A NAMESPACE MEMBER is the same class and produces no import specifier the legacy text match could read",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/transport/trpc/barrel.ts": 'export { EventEmitter } from "node:events";\n',
        "packages/server/src/transport/trpc/reexport-bus.ts": 'import { EventEmitter } from "./barrel.ts";\nexport const bus = new EventEmitter();\n',
      },
      expect: { count: 1, messageIncludes: "reexport-bus.ts" },
      why: "A RE-EXPORT through a project barrel is the same node class — the canonical origin still names the `node:events` door, so the barrel is not a laundry",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/transport/trpc/twice.ts":
          'import { EventEmitter } from "node:events";\nexport const a = new EventEmitter();\nexport const b = new EventEmitter();\n',
      },
      expect: { count: 1 },
      why: "GRANT GRANULARITY: two constructions in one carrier are ONE finding, because a reviewed grant licenses one `(subject, operation)` and two matching findings make the row OVER-BROAD and license neither",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/transport/trpc/unreadable.ts": 'import { EventEmitter } from "./missing-barrel.ts";\nexport const bus = new EventEmitter();\n',
      },
      expect: { count: 1 },
      why: "FAIL-CLOSED: a construction whose class door does not resolve is reported rather than silently admitted",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/transport/trpc/const-alias.ts":
          'import { EventEmitter } from "node:events";\nconst EE = EventEmitter;\nexport const bus = new EE();\n',
      },
      expect: { count: 1 },
      why: "a CONST ALIAS of the imported class names the same export one binding later — the prefilter follows immutable const hops, so the identity reader still gets to judge it",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        "packages/server/src/transport/trpc/barrel.ts": 'export { EventEmitter as Bus } from "node:events";\n',
        "packages/server/src/transport/trpc/renamed.ts": 'import { Bus } from "./barrel.ts";\nexport const bus = new Bus();\n',
      },
      why: "DECLARED LIMIT — a barrel that RE-EXPORTS the emitter under a DIFFERENT name is outside the candidate prefilter. The prefilter is what keeps fail-closure honest (an unprefiltered arm accused five `new TRPCError(…)` sites on the live tree), and the legacy text comparison missed this shape too",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/transport/trpc/other.ts": "export class Thing {}\nexport const t = new Thing();\n",
      },
      why: "a `new` of a locally declared class under transport/ — a different class, and the reader proves it by its declaration rather than by its name",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/transport/trpc/lookalike.ts": "export class EventEmitter {\n  on(): void {}\n}\n",
        "packages/server/src/transport/trpc/lookalike-bus.ts": 'import { EventEmitter } from "./lookalike.ts";\nexport const bus = new EventEmitter();\n',
      },
      why: "THE HOME COUNTERFACTUAL — a GENUINE module export named `EventEmitter` that resolves cleanly to a PROJECT declaration is not node's emitter. Deleting the door comparison turns this row red, which is what proves the identity was resolved and not spelled",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/transport/trpc/globals.ts": "export const seen = new Map<string, number>();\nexport const once = new Set<string>();\n",
      },
      why: "ambient global constructions under transport/ resolve to a GLOBAL origin, never a module one — the arm keys on the node:events door and abstains on everything else",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/transport/trpc/mutable-alias.ts":
          'import { EventEmitter } from "node:events";\nlet EE = EventEmitter;\nEE = EventEmitter;\nexport const bus = new EE();\n',
      },
      why: "DECLARED LIMIT on the shared name prefilter: it follows an IMMUTABLE const hop and stops at a reassignable one, because a binding that can be written is not one identity and following it would claim an origin the reader cannot prove. Bounded in practice by biome's `useConst`, which reds a `let` that is never reassigned; the termination behaviour of the hop itself (a mutual or self alias cycle ends through the visited set) is pinned in tests/tooling/verify/lib/origin-verdict.test.ts",
    },
  ],
});
