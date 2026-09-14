// Gate: contract-verb-presence (core/Spine-Testing.md §5) — the INTERFACE-level complement to
// `test-presence`'s FILE-mirror rule: it catches a method a `*Service` interface DECLARES but no test
// ever invokes (wired into the contract with zero behavioral coverage). Enumerates every exported
// `*Service` interface's members per `domain/<d>/contract/service.ts` and requires a boundary-anchored
// service call `<service>.<verb>(` or its `create<Verb>(` factory call in domain tests. COMMENT POSTURE:
// comment-SAFE — AST CallExpressions only. A tracked gap is an exact central reviewed grant whose
// zero/multiple-consumption alarms replace the legacy gate-local DEFERRED ratchet.
// MEMBERS ARE RESOLVED, NOT LOCAL (#943): the verb set is the interface TYPE's properties, so the five verbs
// `WorkloadService extends WorkloadScheduleService` inherits from an imported base are obligations too — a
// local-`getMembers()` reader lost them while the workspace scan stayed healthy. Each verb keeps its
// DECLARING interface for the diagnostic, the scan line prints local/inherited/total, and an `extends`
// clause that resolves to nothing (or a member with no declaration) is a loud refusal, never a smaller set.
import { defineGate } from "../contract/policy.ts";
import { contractVerbPresenceFact } from "../lib/contract-verb-presence-fact.ts";

const OPERATION = "missing-contract-test";

const MESSAGE = (verb: string, declaredIn: string): string =>
  `${verb} (declared on ${declaredIn}) — the *Service interface declares this verb but no test in its domain tree invokes ` +
  "it as a service method or through its `create<Verb>(` factory (core/Spine-Testing.md §5; " +
  "test-support-dry-punchlist.md W1i). Add a behavioral test at tests/server/domain/ or, for a tracked " +
  "gap, a reviewed grant.";

export const gate = defineGate({
  id: "contract-verb-presence",
  family: "contract-verb-presence",
  authority: "reviewed-grant",
  severity: "error",
  population: {
    in: ["@server", "@tests"],
    under: ["packages/server/src/domain/**", "tests/server/domain/**"],
  },
  analysis: "types",
  execution: "entire-population",
  facts: [contractVerbPresenceFact],
  resources: [],
  message:
    "a *Service interface declares a verb that no test in its domain tree invokes — a wired-but-never-run verb (add a behavioral test at tests/server/domain/, or an exact central reviewed grant keyed on this verb and missing-contract-test operation). core/Spine-Testing.md §5.",
  fix: "add a behavioral test that invokes the verb (or its create<Verb>( factory) under tests/server/domain/<domain>/, or add a cited row to tooling/src/verify/lib/reviewed-grants.ts keyed on this policy, verb subject, and missing-contract-test operation.",
  create: (ctx) => ({
    evaluate: () => {
      const population = ctx.fact(contractVerbPresenceFact);
      const members = population.local + population.inherited;
      ctx.receipt({
        kind: "population",
        source: `service-verbs[interfaces=${population.services};local=${population.local};inherited=${population.inherited}]`,
        members: members > 0 ? members : population.sources,
      });
      for (const candidate of population.candidates) {
        ctx.report.node(candidate.node, {
          subject: candidate.subject,
          operation: OPERATION,
          token: candidate.verb,
          offset: Math.max(candidate.node.getText().indexOf(candidate.verb), 0),
          message: MESSAGE(candidate.subject, candidate.declaredIn),
        });
      }
    },
  }),
  mustFlag: [
    {
      mode: "types",
      grant: { subject: "hub.uncoveredVerb", operation: OPERATION },
      files: {
        "packages/server/src/domain/hub/contract/service.ts": "export interface HubService {\n  uncoveredVerb(): void;\n}\n",
        "tests/server/domain/hub/x.test.ts": "export const q = 'nothing';\n",
      },
      expect: { count: 1 },
      why: "a Service verb (uncoveredVerb) with no test invocation in the domain tree — a dead-wired verb",
    },
    {
      // THE #943 SPLIT: the verb lives on an IMPORTED base interface the service extends. Only the local
      // verb is exercised, and the inherited one must still be an obligation.
      mode: "types",
      grant: { subject: "hub.inherited", operation: OPERATION },
      files: {
        "packages/server/src/domain/hub/contract/verbs.ts": "export interface HubVerbService {\n  inherited(): void;\n}\n",
        "packages/server/src/domain/hub/contract/service.ts":
          'import type { HubVerbService } from "./verbs.ts";\nexport interface HubService extends HubVerbService {\n  local(): void;\n}\n',
        "tests/server/domain/hub/x.test.ts": "const service = createHubService(ctx);\nexport const q = service.local();\n",
      },
      expect: { count: 1, messageIncludes: "hub.inherited (declared on HubVerbService)" },
      why: "THE #943 ESCAPE, MADE PERMANENT: a local-`getMembers()` reader saw only `local` and reported a healthy denominator while the five verbs `WorkloadService` inherits from imported `WorkloadScheduleService` owed no test at all. The finding names the DECLARING interface, so the fix lands on the base contract.",
    },
    {
      // a longer identifier ending in the verb name (rebuild vs build) is NOT boundary-anchored coverage.
      mode: "types",
      grant: { subject: "hub.build", operation: OPERATION },
      files: {
        "packages/server/src/domain/hub/contract/service.ts": "export interface HubService {\n  readonly build: () => void;\n}\n",
        "tests/server/domain/hub/x.test.ts": "await rebuild({ id: 1 });\n",
      },
      expect: { count: 1, messageIncludes: "hub.build" },
      why: "a bare call to a LONGER identifier ending in the verb name (rebuild) does not count as coverage",
    },
    {
      // COMMENT POSTURE (issue #117/#132) in the PERMISSIVE direction — the one that silently disarms the
      // gate: a verb NAMED in a test comment is not an invocation.
      mode: "types",
      grant: { subject: "hub.parkedVerb", operation: OPERATION },
      files: {
        "packages/server/src/domain/hub/contract/service.ts": "export interface HubService {\n  readonly parkedVerb: () => void;\n}\n",
        "tests/server/domain/hub/x.test.ts": "// TODO cover parkedVerb() — createParkedVerb( needs a fixture first.\nexport const q = 1;\n",
      },
      expect: { count: 1, messageIncludes: "hub.parkedVerb" },
      why: "COMMENT POSTURE: the corpus is read as CODE, so a TODO naming the verb (and its factory) is not coverage — a file-text scan called this verb covered and the gate went green on exactly the wired-with-zero-coverage shape it exists to find",
    },
    {
      // MethodSignature members (not just readonly-arrow properties) are enumerated as verbs.
      mode: "types",
      grant: { subject: "hub.save", operation: OPERATION },
      files: {
        "packages/server/src/domain/hub/contract/service.ts": "export interface HubService {\n  save(): void;\n}\n",
        "tests/server/domain/hub/x.test.ts": "export const q = 'nothing';\n",
      },
      expect: { count: 1, messageIncludes: "hub.save" },
      why: "a MethodSignature member is enumerated as a verb too — flags when uncovered",
    },
    {
      mode: "types",
      grant: { subject: "hub.save", operation: OPERATION },
      files: {
        "packages/server/src/domain/hub/contract/service.ts": "export interface HubService {\n  readonly save: () => void;\n}\n",
        "tests/server/domain/hub/x.test.ts": "function save() {}\nsave();\n",
      },
      expect: { count: 1, messageIncludes: "hub.save" },
      why: "a same-named bare helper call is not evidence that the HubService method ran",
    },
    {
      mode: "types",
      grant: { subject: "hub.save", operation: OPERATION },
      files: {
        "packages/server/src/domain/hub/contract/service.ts": "export interface HubService {\n  readonly save: () => void;\n}\n",
        "tests/server/domain/hub/x.test.ts": "logger.save();\n",
      },
      expect: { count: 1, messageIncludes: "hub.save" },
      why: "a same-named method on an unrelated receiver is not evidence that the assembled HubService ran",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        "packages/server/src/domain/hub/contract/service.ts": "export interface HubService {\n  coveredVerb(): void;\n}\n",
        "tests/server/domain/hub/x.test.ts": "const service = createHubService(ctx);\nexport const q = service.coveredVerb();\n",
      },
      why: "the verb is invoked on a service assembled by its domain factory — covered, passes",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/hub/contract/verbs.ts": "export interface HubVerbService {\n  inherited(): void;\n}\n",
        "packages/server/src/domain/hub/contract/service.ts":
          'import type { HubVerbService } from "./verbs.ts";\nexport interface HubService extends HubVerbService {\n  local(): void;\n}\n',
        "tests/server/domain/hub/x.test.ts": "const service = createHubService(ctx);\nservice.local();\nservice.inherited();\n",
      },
      why: "the SPLIT's green half: both the local and the imported-base verb are exercised through the assembled service — resolving inherited members widens the obligation set without widening the accusation (the live workloads shape, whose five schedule verbs all have behavioral tests)",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/hub/contract/verbs.ts": "export interface HubBundle {\n  readonly notAVerb: string;\n}\n",
        "packages/server/src/domain/hub/contract/service.ts":
          'import type { HubBundle } from "./verbs.ts";\nexport interface HubService extends HubBundle {\n  readonly local: () => void;\n}\n',
        "tests/server/domain/hub/x.test.ts": "const service = createHubService(ctx);\nservice.local();\n",
      },
      why: "an inherited member that is NOT verb-shaped (a plain data property) is not an obligation — the resolved-member widening keeps the function-type test, so a DI/data base contributes nothing to the denominator",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/hub/contract/service.ts": "export interface HubService {\n  coveredVerb(): void;\n}\n",
        "tests/server/domain/hub/x.test.ts":
          'import type { HubService } from "../../../../packages/server/src/domain/hub/contract/service.ts";\ndeclare const fixture: { readonly svc: HubService };\nfixture.svc.coveredVerb();\n',
      },
      why: "a service carried as a typed property on a fixture preserves the exact contract-interface identity — the dominant real test shape",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/hub/contract/service.ts": "export interface HubService {\n  coveredVerb(): void;\n}\n",
        "packages/server/src/domain/hub/verbs/reads.ts": "export function createHubReads() { return { coveredVerb: (): void => undefined }; }\n",
        "tests/server/domain/hub/x.test.ts":
          'import { createHubReads } from "../../../../packages/server/src/domain/hub/verbs/reads.ts";\ncreateHubReads().coveredVerb();\n',
      },
      why: "a verb invoked through a concrete bundle factory declared in the owning domain's verbs tree is covered — the grouped ChatService test shape",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/hub/contract/service.ts": "export interface HubService {\n  coveredVerb(): void;\n}\n",
        "packages/server/src/domain/hub/verbs/reads.ts": "export function createHubReads() { return { coveredVerb: (): void => undefined }; }\n",
        "tests/server/domain/hub/x.test.ts":
          'import { createHubReads } from "../../../../packages/server/src/domain/hub/verbs/reads.ts";\ndeclare const fixture: { readonly reads: ReturnType<typeof createHubReads> };\nfixture.reads.coveredVerb();\n',
      },
      why: "a verb bundle carried on a fixture retains the owning factory's property-declaration identity — the nested Chat turn harness shape",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/hub/contract/service.ts": "export interface HubService {\n  save(): void;\n}\n",
        "tests/server/domain/hub/x.test.ts": "const svc = createHubService(ctx);\nconst alias = svc;\nalias.save();\n",
      },
      why: "a local alias of the assembled service preserves receiver identity — covered, passes",
    },
    {
      // covered only by its create<Verb>( factory (the alias-invoked closure shape).
      mode: "types",
      files: {
        "packages/server/src/domain/hub/contract/service.ts": "export interface HubService {\n  readonly build: () => void;\n}\n",
        "tests/server/domain/hub/build.int.test.ts": "const run = createBuild({ db });\nawait run();\n",
      },
      why: "a verb covered only by its create<Verb>( factory (alias-invoked) is covered — passes",
    },
    {
      // *ServiceDeps (a DI bundle) + non-Service interfaces are not the verb surface.
      mode: "types",
      files: {
        "packages/server/src/domain/hub/contract/service.ts":
          "export interface HubServiceDeps {\n  readonly build: () => void;\n}\nexport interface HubContext {\n  readonly wipe: () => void;\n}\n",
      },
      why: "*ServiceDeps and non-Service interfaces are ignored — only the verb surface counts, passes",
    },
  ],
});
