// Where an ABSENCE verdict anchors — the one home for the rule every named-subject tripwire needs.
//
// THE CONTRACT FACT IT ASSERTS. `ctx.report.file` refuses any path outside the effective population
// (`lib/policy-pass-context.ts:314`, `finding file is outside the effective population`). A policy whose
// verdict is "the file I judge is GONE" therefore cannot anchor on its own subject: the thing it is
// accusing does not exist, so no declaration and no population can make its path reportable. Every legacy
// descriptor that reported an absent file at that file (`agent-bridge-lock`, `design-audit-rule-proof`,
// `tooling-instrument-proof`) becomes a runtime throw on conversion unless the verdict is re-anchored.
//
// THE RULE. Anchor on the subject when it is PRESENT; otherwise on the first present member of the
// policy's own ordered subject list; otherwise on the lexicographically first admitted path. The name of
// the missing file moves into the MESSAGE, where it was always the load-bearing half.
//
// WHY IT IS TOTAL RATHER THAN OPTIONAL. Returning `undefined` when nothing is present would hand each
// caller a silent-skip branch, and a tripwire that stops reporting exactly when its whole subject set has
// been deleted is the failure mode tripwires exist to prevent. Population resolution already refuses an
// empty population (`lib/population-resolver.ts` `resolvePopulation`), so the final fallback is reachable
// only with at least one admitted path; the throw below is an assertion about that refusal, in the shape
// `lib/resource-declaration.ts` `readyResourceValue` uses for the resource half of the same idea.
//
// NOT A FAMILY. Three policies with three different subjects share this the way eleven policies share
// `readyResourceValue`: it is a contract assertion, not a subject reader, so it groups nothing. Each
// caller keeps its own `family`.

/** Build the anchor resolver for one policy's ordered named subjects. */
export function subjectAnchor(present: ReadonlySet<string>, subjects: readonly string[]): (subject: string) => string {
  const named = subjects.find((subject) => present.has(subject));
  const [lowest] = [...present].toSorted();
  const fallback = named ?? lowest;
  if (fallback === undefined) {
    throw new Error("an absence anchor was demanded from an empty effective population");
  }
  return (subject) => (present.has(subject) ? subject : fallback);
}
