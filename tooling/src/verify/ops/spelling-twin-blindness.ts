// THE #1506 AUTHORING CONTROL'S DERIVATION, over the MIXED corpus (#2031).
//
// A gate's own conformance rows prove it bites THE SHAPE ITS AUTHOR WROTE. Nothing proves it bites the same
// semantics written another way, and 21 live gates were shown blind at once: `db["insert"]` walked past a
// `PropertyAccessExpression`-keyed detector, `import * as events; events.subscribeAllChatEvents` past an
// `ImportSpecifier`-keyed one. This module RESPELLS each gate's own `mustFlag` fixture through
// `lib/spelling-twins.ts` and feeds it back through the gate's OWN proof door, so the census is the same
// question asked of every gate on the tree.
//
// WHY IT LIVES HERE RATHER THAN INSIDE ITS SUITE (#2031). The derivation used to be private to
// `tests/tooling/gate-spelling-twins.int.test.ts`, which keyed it on `loadGates()` — the LEGACY remnant
// alone (`lib/loader.ts:190`). Every #1584 conversion therefore shrank its subject silently: 54 of the
// ledger's 79 names had converted, the suite compared a two-sided shrink-only ledger with `toEqual`, and it
// sat RED with no membership assertion anywhere in the file (so every membership-shaped census missed it)
// while covering ZERO converted policies — uninformative while reading authoritative. Both engines are
// driven here instead, so the control's subject is the corpus rather than whichever half a loader happens
// to return, and the ledger the suite commits is derived by THIS code rather than by a transcription of it.
//
// THE REMEDY FOR A RED IS NEVER A LEDGER ROW: it is the shared reference reader
// (`lib/symbol-reference.ts` — `readMemberAccess` / `moduleMemberReference` / `readStringConstant`), which
// resolves a reference however it is spelled.
//
// THE TWO DECLARED LIMITS, both stated as SKIPS rather than silence:
//   • a legacy `fsBacked` descriptor materializes its fixtures on real disk, so the in-memory pre-pass that
//     decides WHICH LINES the gate reported would be a guess;
//   • a final `mode: "resource"` proof is the same fact on the other engine — a real temp tree, whose
//     reported lines an in-memory pass cannot stand in for. A policy whose mustFlag rows are ALL
//     resource-mode is skipped whole; one with a mix is censused on the rows that are reachable.

import { refuseDirectInvocation } from "@orb/tooling/_shared/entrypoint";
import type { Project } from "ts-morph";
import type { GateDescriptor, GateExample } from "../contract/gate.ts";
import type { MixedGateCorpus } from "../contract/gate-corpus.ts";
import type { GatePolicy, GatePolicyProof } from "../contract/policy.ts";
import { defineGate } from "../contract/policy.ts";
import type { SpellingBlindSet, SpellingTwinArm, SpellingTwinCensus, SpellingTwinSkip } from "../contract/spelling-twin-blindness.ts";
import { SPELLING_TWIN_ARMS } from "../contract/spelling-twin-blindness.ts";
import type { SpellingTwin } from "../contract/spelling-twins.ts";
import { runPass } from "../lib/pass.ts";
import { runPolicyPass } from "../lib/policy-pass.ts";
import { spellingTwinsOf } from "../lib/spelling-twins.ts";
import { verifyGateProofs } from "./conformance.ts";
import { verifyPolicyProofs } from "./policy-conformance.ts";

refuseDirectInvocation(import.meta.url, "pnpm test:scoped tests/tooling/gate-spelling-twins.int.test.ts");

const DEFAULT_LEGACY_AT = "packages/ui/src/x/x.tsx";

/** The caller's scratch parser for every "what did this gate report" pre-pass. This module CONSTRUCTS NO
 *  WORKSPACE: `tooling-project-home` makes one ts-morph loader the law under `tooling/src/**`, and a scratch
 *  parser here would owe a reviewed grant for a Project its caller already has. Each example lands under its
 *  OWN virtual root, never a re-created path (GATE-AUTHORING.md §12: a re-created SourceFile restarts its
 *  script version and the language service then serves the PREVIOUS document). */
let shared: Project | undefined;
let exampleSeq = 0;

function project(): Project {
  if (shared === undefined) {
    throw new Error("spelling-twin census used outside spellingTwinCensus — the scratch parser is the caller's");
  }
  return shared;
}

function clear(): void {
  for (const previous of project().getSourceFiles()) {
    project().removeSourceFile(previous);
  }
}

function filesOf(example: GateExample): Record<string, string> {
  return typeof example.files === "string" ? { [example.at ?? DEFAULT_LEGACY_AT]: example.files } : { ...example.files };
}

/** `repo-relative file -> the lines this gate reported on`, from a real standalone pass over the fixture.
 *  The respeller needs it because a whole-file rewrite would respell lines the gate never judged, and a
 *  twin that changes an unjudged line proves nothing about the detector. */
function materialize(files: Readonly<Record<string, string>>, root: string): void {
  clear();
  for (const [rel, text] of Object.entries(files)) {
    project().createSourceFile(`${root}/${rel}`, text);
  }
}

function reportedLinesOf(root: string, findings: readonly { readonly file: string; readonly line: number }[]): ReadonlyMap<string, ReadonlySet<number>> {
  const out = new Map<string, Set<number>>();
  for (const finding of findings) {
    const rel = finding.file.replace(`${root}/`, "");
    const lines = out.get(rel) ?? new Set<number>();
    lines.add(finding.line);
    out.set(rel, lines);
  }
  return out;
}

function legacyReportedLines(gate: GateDescriptor, files: Readonly<Record<string, string>>): ReadonlyMap<string, ReadonlySet<number>> {
  exampleSeq += 1;
  const root = `/repo-twin-${exampleSeq}`;
  materialize(files, root);
  // A `status` other than "active" would make the pass skip the gate entirely and report zero lines, which
  // the respeller would read as "the gate judged nothing" rather than "the gate was not run".
  const asActive: GateDescriptor = gate.status === "active" ? gate : { ...gate, status: "active" };
  const result = runPass([asActive], {
    root,
    project: project(),
    scope: { kind: "project" },
    files: project().getSourceFiles(),
    checker: () => project().getTypeChecker(),
  });
  const lines = reportedLinesOf(root, result.gates.find((entry) => entry.name === gate.name)?.findings ?? []);
  clear();
  return lines;
}

function finalReportedLines(policy: GatePolicy, files: Readonly<Record<string, string>>): ReadonlyMap<string, ReadonlySet<number>> {
  exampleSeq += 1;
  const root = `/repo-twin-${exampleSeq}`;
  materialize(files, root);
  const result = runPolicyPass({
    knownPolicies: [policy],
    policies: [policy],
    root,
    project: project(),
    reviewedGrants: [],
    failOnWarnings: false,
  });
  const lines = reportedLinesOf(root, result.authority.effectiveFindings);
  clear();
  return lines;
}

function armsOf(twins: SpellingTwin): readonly (readonly [SpellingTwinArm, Readonly<Record<string, string>> | undefined])[] {
  return SPELLING_TWIN_ARMS.map((arm) => [arm, twins[arm]] as const);
}

/** The arms a LEGACY descriptor stops biting under, across all of its mustFlag fixtures. */
function legacyBlindArms(gate: GateDescriptor): readonly SpellingTwinArm[] {
  const blind = new Set<SpellingTwinArm>();
  for (const example of gate.mustFlag) {
    const files = filesOf(example);
    for (const [arm, twin] of armsOf(spellingTwinsOf(files, legacyReportedLines(gate, files)))) {
      if (twin === undefined) {
        continue;
      }
      const respelled: GateDescriptor = { ...gate, mustFlag: [{ files: twin, why: `${arm} twin of: ${example.why ?? "(no rationale given)"}` }], mustPass: [] };
      if (verifyGateProofs([respelled]).length > 0) {
        blind.add(arm);
      }
    }
  }
  return [...blind].sort();
}

/** The arms a FINAL policy stops biting under. Two differences from the legacy side, both forced by the
 *  final contract rather than chosen: `mustPass` may not be empty (`lib/policy-validation.ts`), so the
 *  policy's OWN passing rows ride along and only `mustFlag` failures are counted; and the respelled copy
 *  must be re-branded through `defineGate`, because the brand is a WeakSet on object identity and a spread
 *  copy carries none. */
function finalBlindArms(policy: GatePolicy, reachable: readonly GatePolicyProof[]): readonly SpellingTwinArm[] {
  const blind = new Set<SpellingTwinArm>();
  for (const proof of reachable) {
    for (const [arm, twin] of armsOf(spellingTwinsOf(proof.files, finalReportedLines(policy, proof.files)))) {
      if (twin === undefined) {
        continue;
      }
      const respelled = defineGate({
        ...policy,
        mustFlag: [{ mode: proof.mode, files: twin, why: `${arm} twin of: ${proof.why}` }],
        mustPass: policy.mustPass,
      } as GatePolicy);
      if (verifyPolicyProofs([respelled]).some((failure) => failure.arm === "mustFlag")) {
        blind.add(arm);
      }
    }
  }
  return [...blind].sort();
}

/** THE CENSUS over both engines. Deterministic: gates are visited in id order and every arm set is sorted,
 *  so the committed ledger is a stable document rather than a loader-order artifact.
 *
 *  It takes only the two DESCRIPTOR LISTS, not the whole corpus — a planted control constructs two gates and
 *  drives them, and demanding a roster/files accounting it could not honestly build would push the control
 *  into faking one. `scratch` is the caller's in-memory parser (see the `shared` note above). */
export function spellingTwinCensus(corpus: Pick<MixedGateCorpus, "legacy" | "final">, scratch: Project): SpellingTwinCensus {
  shared = scratch;
  const blind: Record<string, readonly SpellingTwinArm[]> = {};
  const skipped: SpellingTwinSkip[] = [];
  let examined = 0;

  for (const gate of [...corpus.legacy].sort((left, right) => left.name.localeCompare(right.name))) {
    if (gate.fsBacked === true) {
      skipped.push({ id: gate.name, reason: "legacy fsBacked — its fixtures live on real disk, so an in-memory pre-pass cannot say which lines it reported" });
      continue;
    }
    examined += 1;
    const arms = legacyBlindArms(gate);
    if (arms.length > 0) {
      blind[gate.name] = arms;
    }
  }

  for (const policy of [...corpus.final].sort((left, right) => left.id.localeCompare(right.id))) {
    const reachable = policy.mustFlag.filter((proof) => proof.mode !== "resource");
    if (reachable.length === 0) {
      skipped.push({ id: policy.id, reason: "every mustFlag proof is resource-mode — a real temp tree, which an in-memory pre-pass cannot stand in for" });
      continue;
    }
    examined += 1;
    const arms = finalBlindArms(policy, reachable);
    if (arms.length > 0) {
      blind[policy.id] = arms;
    }
  }

  return { blind: sortedBlindSet(blind), skipped, examined };
}

/** Key order is part of the committed document — a ledger that reorders on every run is a diff nobody can
 *  read, and `toEqual` would not notice either way. */
function sortedBlindSet(blind: Readonly<Record<string, readonly SpellingTwinArm[]>>): SpellingBlindSet {
  return Object.fromEntries(Object.entries(blind).sort(([left], [right]) => left.localeCompare(right)));
}
