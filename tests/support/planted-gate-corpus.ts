// ONE SOURCE FOR A PLANTED GATE MODULE — the fixture five CLI-driving suites used to spell for themselves.
//
// WHY IT EXISTS NOW. Until #2176 Phase F (2026-09-14) the cheap planted corpus was a LEGACY descriptor
// object literal: eight lines, no imports, no contract to resolve. Every suite that needed "a gate the
// structure CLI will load over a planted root" wrote its own. The legacy contract is deleted, so the cheap
// fixture is a `defineGate` policy — which needs the REAL `contract/policy.ts` resolved by absolute file URL
// (the loader refuses an unbranded lookalike, `lib/loader.ts`) and the whole required descriptor. Five
// hand-written copies of that is five places a contract change has to land, and the shapes were already
// drifting apart before the conversion.
//
// IT IS DELIBERATELY NOT A `defineGate` CALL IN THIS FILE. The subject is a module the CHILD PROCESS loads
// off a planted root, so what a suite needs is SOURCE TEXT, not a policy object — and the contract has to be
// imported by the planted module rather than shared through this one, or the brand WeakSet would belong to
// the parent process and every planted module would refuse.
//
// THE SILENCE CONVENTION. A policy must carry ≥1 `mustFlag` row (the loader's proof floor), so every planted
// policy here REPORTS on exactly one subject path. A suite that wants a SILENT gate on the real planted tree
// simply does not plant that subject: the proof row still fires on its own virtual fixture, and the planted
// run sees nothing to report. That keeps "silent" a property of the TREE rather than a second fixture shape.
import { join } from "node:path";
import { pathToFileURL } from "node:url";

/** Every subject line is `export const <name> = 1;`, and `export const ` is 13 characters — so the token
 *  starts at column 14. The central ordinary-waiver engine raises an AUTHORITY ALARM when a finding's
 *  `token` is not the exact slice at its reported position, and an alarm is unconditionally blocking, which
 *  would make a suite's exit codes say something other than what it is measuring. */
export const SUBJECT_COLUMN = 14;

/** The one-line subject a planted policy reports on. */
export function plantedSubject(name: string): string {
  return `export const ${name} = 1;\n`;
}

export interface PlantedPolicyRequest {
  /** The repo root, for the absolute `file://` import of the REAL contract. */
  readonly repoRoot: string;
  readonly id: string;
  /** Defaults to `id` — the loader requires a singleton family to equal its policy id. */
  readonly family?: string;
  /** The ONE file this policy reports on. Plant it for a loud gate; omit it for a silent one. */
  readonly subjectPath: string;
  /** The reported token; defaults to `id`'s last path segment being unreadable, so callers pass it. */
  readonly token: string;
  /** `hard` by default — an `ordinary` policy opens the `@orb-waive` door, which some suites measure. */
  readonly authority?: "hard" | "ordinary";
  /** `error` by default. A `warning` policy also needs `workItem`, which the caller supplies through `extra`. */
  readonly severity?: "error" | "warning";
  /** Extra descriptor fields, spelled as source and inserted verbatim before `create` (e.g. `workItem: 7,`). */
  readonly extraFields?: string;
  /** Extra hooks inside `create`'s returned object, spelled as source (e.g. an `evaluate` that throws). */
  readonly extraHooks?: string;
}

/** The planted module's source. `population: { of: "all" }` is deliberate: the planted tree IS this
 *  fixture's whole world, so a population expression that named packages would make every suite's tree
 *  layout part of the fixture contract. */
export function plantedPolicySource(request: PlantedPolicyRequest): string {
  const { repoRoot, id, subjectPath, token } = request;
  const family = request.family ?? id;
  const authority = request.authority ?? "hard";
  const severity = request.severity ?? "error";
  const contract = JSON.stringify(pathToFileURL(join(repoRoot, "tooling/src/verify/contract/policy.ts")).href);
  const quiet = `${subjectPath.slice(0, subjectPath.lastIndexOf("/"))}/quiet.ts`;
  return [
    `import { defineGate } from ${contract};`,
    "",
    "export const gate = defineGate({",
    `  id: ${JSON.stringify(id)},`,
    `  family: ${JSON.stringify(family)},`,
    `  authority: ${JSON.stringify(authority)},`,
    `  severity: ${JSON.stringify(severity)},`,
    '  population: { of: "all", why: "the planted tree is this fixture policy\'s whole world" },',
    '  analysis: "syntax",',
    '  execution: "selected-files",',
    "  facts: [],",
    "  resources: [],",
    `  message: ${JSON.stringify(`planted debt for ${id}`)},`,
    `  fix: ${JSON.stringify(`delete the planted subject, or waive it with \`@orb-waive ${id}(<position>): <reason>\``)},`,
    ...(request.extraFields === undefined ? [] : [`  ${request.extraFields}`]),
    "  create: (ctx) => ({",
    "    visitFile: (sourceFile) => {",
    "      const path = ctx.relativePath(sourceFile);",
    `      if (path === ${JSON.stringify(subjectPath)}) {`,
    `        ctx.report.file(path, { line: 1, column: ${SUBJECT_COLUMN}, token: ${JSON.stringify(token)} });`,
    "      }",
    "    },",
    ...(request.extraHooks === undefined ? [] : [`    ${request.extraHooks}`]),
    "  }),",
    `  mustFlag: [{ mode: "source", files: { ${JSON.stringify(subjectPath)}: ${JSON.stringify(plantedSubject(token))} }, expect: { count: 1, line: 1, token: ${JSON.stringify(token)} }, why: "the planted subject is the one file this fixture policy reports" }],`,
    `  mustPass: [{ mode: "source", files: { ${JSON.stringify(quiet)}: ${JSON.stringify(plantedSubject("quiet"))} }, why: "every other source file is silent" }],`,
    "});",
    "",
  ].join("\n");
}
