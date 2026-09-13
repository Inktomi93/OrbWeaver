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
//
// The legacy `bus-channel-primitive` descriptor (123b36f453318217b33a76d6e7ffb0ff15288f06 = `9808b93c0^`)
// ran the spelling-based `getExpression().getText() === "EventEmitter"` check and carried `SANCTIONED_HOMES`
// before this conversion moved both onto the callable-origin reader and the central reviewed-grant table.
//
// FAMILY: SINGLETON (`bus-channel-primitive`). No sibling policy resolves a CONSTRUCTED class's door
// identity; `lib/reference-fact-call.ts#resolveCallableOrigin` and `lib/origin-verdict.ts`'s
// `classifyOriginRefusal`/`referenceNamesExport` are corpus-wide primitives that ~20 policies across four
// families consume, which is a shared PRIMITIVE and not a shared family computation (guide §2: a theme or a
// shared topic is not a family).
// POPULATION PORT: byte-identical. The legacy descriptor filtered `TRANSPORT_SCOPE.test('/' + p)` where
// `TRANSPORT_SCOPE = /\/packages\/server\/src\/transport\//` (`9808b93c0^:36`); the final population is
// `{ in: ["@server"], under: ["packages/server/src/transport/**"] }`, and `@server` is exactly
// `packages/server/src/`. The legacy `SANCTIONED_HOMES` row is NOT a population subtraction on either side —
// it was a scanned-and-excused home then and is a central reviewed grant now.
//
// POPULATION PORT — SET DIFFERENCES, MEASURED (standardization §2.1; lane cb-b-header-residue, 2026-09-13). Legacy
// `bus-channel-primitive` descriptor at 123b36f453318217b33a76d6e7ffb0ff15288f06, the parent of the conversion
// `9808b93c0` (blob read from git with no working-tree plant: a `GateDescriptor`, no `defineGate`). Over the SAME
// 7,219 harness candidates at that tree (`git ls-tree` ∩ `_shared/ts-workspace.ts#harnessGlobs`), legacy `scanRoot`
// admits 58 and final `population` admits 58. legacy − final = ∅. final − legacy = ∅. Controls: inside
// `packages/server/src/transport/jobs/__cbbhr_in_catalog-refresh-scheduler.ts` (virtual) admitted by both; outside
// `packages/client/src/agent-handles/__cbbhr_out_index.ts` (virtual) rejected by both.
import type { Node as MorphNode, SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import { classifyOriginRefusal, referenceNamesExport } from "../lib/origin-verdict.ts";
import { resolveCallableOrigin } from "../lib/reference-fact-call.ts";
import { originModuleSpecifier } from "../lib/sealed-origin.ts";
import { EMITTER_GLOBAL_HOME, emitterGlobalLookalikeProof } from "./_proof/node-types.ts";

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
      grant: { subject: "packages/server/src/transport/trpc/probe-bus.ts", operation: "event-emitter-construction" },
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
      why: "THE PREFILTER CONTROL: a `new` whose class is not NAMED `EventEmitter` never enters the candidate set, so no origin is resolved for it and fail-closure never reaches it. Deleting the name prefilter accuses five live `new TRPCError(…)` sites of being the transport emitter",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/transport/trpc/local-class.ts": "class EventEmitter {\n  on(): void {}\n}\nexport const bus = new EventEmitter();\n",
      },
      why: 'THE PROVEN-OTHER arm of the refusal classifier, and the row that makes the header\'s sentence *a construction that PROVABLY binds another declaration is a different class and passes* an enforced claim rather than a paragraph. A FILE-LOCAL class named `EventEmitter` names the export (the prefilter admits it) and resolves through NEITHER door, so `constructsEventEmitter` reaches `classifyOriginRefusal`, which answers case (a) because the leaf binds a `ClassDeclaration` and not an import alias. Replacing that call with the constant `"unreadable"` — fail-closure with no acquittal — turns this row red; before it, no declared row reached the `other` outcome at all (wave-8 D5, `v-audit-wave8-2026-09-12.md:253`)',
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
        "packages/server/src/transport/trpc/renamed-export-barrel.ts": 'export { setMaxListeners as EventEmitter } from "node:events";\n',
        "packages/server/src/transport/trpc/renamed-export-bus.ts":
          'import { EventEmitter } from "./renamed-export-barrel.ts";\nexport const bus = new EventEmitter();\n',
      },
      why: "THE EXPORTED-NAME COUNTERFACTUAL, and the only row that dies without the `canonical.exportedName` half: a barrel re-exports a DIFFERENT `node:events` export UNDER the name `EventEmitter`, so the name prefilter admits it AND the door comparison passes (it genuinely IS the `node:events` door) — only the canonical exported name rejects it. Dropping that half leaves every other row in this module green (wave-8 D1, `v-audit-wave8-2026-09-12.md:140`). It is the mirror of the `mustPass` row above it: that one holds the NAME and moves the door, this one holds the DOOR and moves the name",
    },
    {
      mode: "types",
      files: {
        ...emitterGlobalLookalikeProof(),
        "packages/server/src/transport/trpc/global-emitter.ts": "export const bus = new EventEmitter();\n",
      },
      why: `THE ORIGIN-KIND FENCE, PINNED: a TRUSTED AMBIENT GLOBAL constructor spelled \`EventEmitter\` (${EMITTER_GLOBAL_HOME}) is admitted by the name prefilter and RESOLVES — to a global origin rather than a module one — so it is the only fixture that reaches \`target.kind !== "module"\`. Node declares no such global; the twin exists so that comparison is enforced rather than asserted. Before it the branch was reached by zero rows, and the row that claimed it planted \`new Map()\`/\`new Set()\`, which the name prefilter rejects before any origin is resolved (wave-8 D5, \`v-audit-wave8-2026-09-12.md:253\`)`,
    },
    {
      mode: "types",
      files: {
        "packages/server/src/transport/trpc/globals.ts": "export const seen = new Map<string, number>();\nexport const once = new Set<string>();\n",
      },
      why: "the PREFILTER control for ambient constructions: `new Map()` / `new Set()` are not named `EventEmitter`, so they never become candidates and no origin is resolved for them. Kept beside the row above because the two are different claims — this one is about what is never asked, that one about what is asked and answered GLOBAL",
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
