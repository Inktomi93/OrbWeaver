// Gate: no-caller-user-id (D19 turn-identity). The caller is `Principal.userId`; a turn's
// RESPONSIBLE human is `triggeredBy`, the FUNDER is `funderUserId`, and assembly/tools run as `runAsUserId`.
// The term `callerUserId`
// conflates caller with turn-identity (the neo bug class: the caller's id reaching `resolveCredential`/
// `loadUserSettings`). tsc cannot catch a NEWLY-INTRODUCED forbidden name, so this gate does — before the
// turn-running/engine chunks accrete. AST identifiers only: comments, quoted/computed keys, and string literals are exempt;
// every identifier position is judged, including property names, destructuring, and locally shadowed bindings.
//
// POPULATION PORT — SET DIFFERENCES, MEASURED (standardization §2.1; lane cb-b-header-residue, 2026-09-13). Legacy
// `no-caller-user-id` descriptor at 073520068d3305dfedbb481153cadfef6b30f847, the parent of the conversion
// `45743d76d` (blob read from git with no working-tree plant: a `GateDescriptor`, no `defineGate`). Over the SAME
// 7,006 harness candidates at that tree (`git ls-tree` ∩ `_shared/ts-workspace.ts#harnessGlobs`), legacy `scanRoot`
// admits 6,751 and final `population` admits 6,751. legacy − final = ∅. final − legacy = ∅. Controls: inside
// `packages/client/src/agent-handles/__cbbhr_in_index.ts` (virtual) admitted by both; outside
// `tooling/src/verify/gates/__cbbhr_out_agent-bridge-lock.ts` (virtual) rejected by both.
//
// FAMILY: a declared SINGLETON under its own id. It imports nothing from `lib/`; one banned identifier spelling has
// no shared computation and no sibling.
import { SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";

const FORBIDDEN = "callerUserId";

const MESSAGE =
  "`callerUserId` is forbidden (D19): the caller is `Principal.userId`; use `triggeredBy` for attribution/abort, `funderUserId` for the funded connection/credentials, or `runAsUserId` for assembly/tools. Never route the caller's id into credential or settings resolution. See docs/adr/0019-turn-identity-has-three-distinct-concepts.md.";
export const gate = defineGate({
  id: "no-caller-user-id",
  family: "no-caller-user-id",
  authority: "ordinary",
  severity: "error",
  population: {
    // `@inference` ADDED 2026-09-20 (lane cb-gate-reach, the §12 EXTRACTION AUDIT of
    // `docs/design/orbweaver-inference-package.md`). ~104 source files left `packages/server/src/infra/providers/`
    // for the new `@orb/inference` workspace package, and every `@server`-scoped policy stopped judging them the
    // day they moved, silently. This population was already every authored root; `@inference` is the one the extraction added and nobody
    // joined. D19's conflation is LIVE here — the package resolves a connection for a `funder` and an `actor` and
    // hands a credential to a backend, which is the exact `resolveCredential`-gets-the-caller's-id bug class the
    // name ban exists to keep out. Measured at the widening: ZERO findings.
    in: ["@client", "@ui", "@server", "@db", "@contracts", "@kit", "@inference", "@tooling", "@tests", "@scripts"],
    notUnder: ["tooling/src/verify/gates/**"],
  },
  analysis: "syntax",
  execution: "selected-files",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix:
    "use `triggeredBy` for attribution/abort, `funderUserId` for connection/credential funding, or " +
    "`runAsUserId` for assembly/tools — never the caller's id in credential or settings resolution. A deliberate site is waived with `@orb-waive " +
    "no-caller-user-id(<position>): <reason>` on the line above, where <position> is the literal `callerUserId`.",
  create: (ctx) => ({
    visitors: [
      {
        kinds: [SyntaxKind.Identifier],
        visit: (node) => {
          if (node.getText() === FORBIDDEN) {
            ctx.report.node(node, { token: FORBIDDEN, offset: 0 });
          }
        },
      },
    ],
  }),
  mustFlag: [
    {
      mode: "source",
      files: { "packages/server/src/domain/chat/x.ts": "export function f(callerUserId: string) {\n  return callerUserId;\n}\n" },
      expect: { count: 2 },
      why: "the banned D19 term as a code identifier — every occurrence (param + use) is its own finding",
    },
    {
      mode: "source",
      files: {
        "packages/server/src/domain/chat/positions.ts":
          "const callerUserId = 1;\nconst record = { callerUserId };\nconst { callerUserId: extracted } = record;\nexport { extracted };\n",
      },
      expect: { count: 3 },
      why: "the spelling ban intentionally includes a shadowed binding, shorthand property, and destructuring property name",
    },
  ],
  mustPass: [
    {
      mode: "source",
      files: { "packages/server/src/domain/chat/y.ts": "// callerUserId is forbidden (D19)\nexport const doc = 'route the callerUserId';\n" },
      why: "the term in a COMMENT / string literal — AST identifiers only; documentation is exempt",
    },
    {
      mode: "source",
      files: {
        "packages/server/src/domain/chat/quoted.ts":
          'const record = { "callerUserId": 1, ["callerUserId"]: 2 };\nexport const value = record["callerUserId"];\n',
      },
      why: "quoted and computed string keys are the declared boundary of the identifier-only policy",
    },
    {
      mode: "source",
      files: {
        "packages/server/src/domain/chat/waived.ts":
          "// @orb-waive no-caller-user-id(callerUserId): the proof's stand-in reason; ends when this fixture stops flagging.\n" +
          "export const forward = (callerUserId: string): void => undefined;\n",
      },
      why: "POSITIONAL IDENTITY: each banned identifier occurrence is its own finding at the token `callerUserId`. The fixture is authored with exactly ONE occurrence instead of reusing a mustFlag row, because both mustFlag rows fire two and three times inside one carrier and one marker consumes one occurrence",
    },
  ],
});
