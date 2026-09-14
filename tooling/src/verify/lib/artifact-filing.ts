// The family reader for the ARTIFACT laws — `tooling-artifact-path-home` (a `reports/…` path is spelled in
// ONE home, `_shared/artifacts.ts`) and `tooling-artifact-run-slot` (a tool that FILES an artifact through
// `_shared/artifact-out.ts` opens a run slot in its cli.ts) — so what counts as "a reports path literal fed
// to a path call" and "a filing door" is ONE predicate in two policies (family `tooling-artifact`).
//
// IDENTITY, NOT SPELLING. The legacy gate compared callee TEXT: `join(` matched, `path.join(` did not, and
// `tooling/src/model-ab/ops/run.ts:110` spelled `path.join(REPO_ROOT, "reports", "ab", stamp)` unseen for
// its whole life (found by this conversion's differential, fixed in the same commit). The path callee is now
// judged by where it RESOLVES — node's own path/fs doors, through the shared callable-origin reader — so the
// default-import, namespace-import and aliased spellings are one read; a callee the readers cannot place is
// `unreadable`, which the consuming policy reports rather than passes (#944's third answer). The filing doors
// are judged against the LOCATED `_shared/artifact-out.ts` home (`lib/project-home-origin.ts`), so a local
// function named `artifactFile` is not a filer and an aliased import is.
//
// A pure reader over delivered nodes: no walk, no Project, no filesystem, no cache.

import { readMemberReference, readStaticString } from "@orb/tooling/_shared/reference-fact";
import { resolveCallableOrigin } from "@orb/tooling/_shared/reference-fact-call";
import type { CallExpression, Node as MorphNode } from "ts-morph";
import { Node } from "ts-morph";
import type { PathCalleeVerdict, ProjectHomeVerdict } from "../contract/origin-verdict.ts";
import { classifyOriginRefusal } from "./origin-verdict.ts";
import type { LocatedProjectHome, ProjectHomeDeclaration } from "./project-home-origin.ts";
import { classifyProjectHomeOrigin } from "./project-home-origin.ts";
import { originModuleSpecifier } from "./sealed-origin.ts";

/** The `--out` filing layer: the two FILING doors and the one RUN-SLOT door, all exported from one home. */
export const ARTIFACT_FILERS: ProjectHomeDeclaration = { path: "tooling/src/_shared/artifact-out.ts", names: ["artifactDir", "artifactFile"] };
export const RUN_SLOT_DOOR: ProjectHomeDeclaration = { path: "tooling/src/_shared/artifact-out.ts", names: ["withInstrumentRun"] };

/** The path-shaped callees a `reports/…` literal is fed to, and node's own doors that declare them. */
const PATH_CALLEES: ReadonlySet<string> = new Set(["join", "resolve", "mkdir", "mkdirSync"]);
const PATH_DOORS: ReadonlySet<string> = new Set(["node:path", "path", "node:path/posix", "path/posix", "node:fs", "fs", "node:fs/promises", "fs/promises"]);
const REPORTS = "reports";
const REPORTS_PREFIX = `${REPORTS}/`;

/** The name a callee is spelled with — the identifier, or the member name of a property access — so a
 *  policy can PREFILTER by name before any identity work (the prefilter is what keeps fail-closure honest:
 *  only a callee that LOOKS like the door is ever reported as unreadable). */
function calleeName(call: CallExpression): string | undefined {
  const expression = call.getExpression();
  if (Node.isIdentifier(expression)) {
    return expression.getText();
  }
  const member = readMemberReference(expression);
  return member.kind === "resolved" ? member.value.name : undefined;
}

/** The first `"reports"` / `"reports/…"` string among a call's arguments, resolved statically (a const
 *  holding the literal is the same respell one line up), or null. */
export function reportsPathArgument(call: CallExpression): MorphNode | null {
  for (const argument of call.getArguments()) {
    const value = readStaticString(argument);
    if (value.kind === "resolved" && (value.value === REPORTS || value.value.startsWith(REPORTS_PREFIX))) {
      return argument;
    }
  }
  return null;
}

/** Does this call enter one of node's path/fs doors at a path-shaped export (`join`/`resolve`/`mkdir`/
 *  `mkdirSync`)? The default-import (`path.join`), namespace (`import * as path`), named and ALIASED
 *  spellings all resolve to the same door + member; a project-declared `join` is provably a different
 *  callee. The identity runs FIRST; the spelled name gates only the FAIL-CLOSED answer, so an unplaceable
 *  callee is reported only when it is spelled like a path door. */
export function classifyPathCallee(call: CallExpression): PathCalleeVerdict {
  const origin = resolveCallableOrigin(call);
  if (origin.kind === "unresolved") {
    const name = calleeName(call);
    return name !== undefined && PATH_CALLEES.has(name) ? classifyOriginRefusal(origin.reason, call.getExpression()) : "other";
  }
  const { target } = origin.value;
  if (target.kind !== "module") {
    return "other";
  }
  const named = target.memberPath.length === 0 ? target.exportedName : target.memberPath.at(-1);
  return PATH_DOORS.has(originModuleSpecifier(target)) && named !== undefined && PATH_CALLEES.has(named) ? "path-call" : "other";
}

/** Judge one call against a located filing home. The identity runs FIRST (an aliased import spells a
 *  different local name and must still resolve to the door); the spelled name gates only the FAIL-CLOSED
 *  answer, so a callee the readers cannot place is reported only when it is spelled like the door —
 *  otherwise every unplaceable call in the tree would be a finding. */
export function classifyFilingCall(call: CallExpression, home: LocatedProjectHome): ProjectHomeVerdict {
  const verdict = classifyProjectHomeOrigin(call.getExpression(), home);
  if (verdict !== "unreadable") {
    return verdict;
  }
  const name = calleeName(call);
  return name !== undefined && home.names.has(name) ? "unreadable" : "other";
}
