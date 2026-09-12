// Policy: policy-waiver-spelling — §5b.3 of the soundness enforcer (#1971; family `policy-soundness`, reader
// `lib/policy-descriptor-read.ts`): an ORDINARY policy's `fix` must name the exact waiver spelling
// `@orb-waive <id>(`. §3 of gate-runtime-standardization.md says why the spelling cannot be guessed: the
// reported position is routinely not what a reader would call the offense (a type argument is waived at its
// first identifier; a string-literal token includes its quotes), so a `fix` that omits it makes the policy
// unusable by the very author it fires on. Wave 1's D7 named two modules; the AST census at 8257071ee found
// 51 of 88 — WARNING DEBT tied to its own row (#1978) until the owner ruled `hard` + `warning` a contradiction
// (#2025, 2026-09-12): it is `hard`/`error` now and BLOCKS, and it is still never a grant — the burn-down is
// one `fix` string per module, read off that module's `report.node` call.
//
// The read is a MENTION test over static text, not a marker-form test: a `fix` is prose the author copies
// from, so `@orb-waive <id>(` anywhere in it is the whole requirement; const aliases and `+` concatenation
// resolve through the shared reader, so `fix: FIX` is read exactly like an inline string. A `fix` this
// reader cannot read at all (a call, a parameter) is left unjudged rather than guessed. A `fix` naming a
// DIFFERENT policy's spelling is a finding — the author would type a marker the central engine binds to
// nothing. Hard, reviewed-grant and legacy modules are out of scope: only the ordinary door has a spelling.
import type { ObjectLiteralExpression } from "ts-morph";
import type { GatePolicyContext } from "../contract/policy.ts";
import { defineGate } from "../contract/policy.ts";
import {
  descriptorProperty,
  descriptorValue,
  finalDescriptorOf,
  mentionsWaiverOf,
  policyIdOfPath,
  staticSegments,
  staticText,
} from "../lib/policy-descriptor-read.ts";
import { familyFixture, finalProbeModule, HARD_TRUNK, ORDINARY_TRUNK } from "./_proof/policy-soundness.ts";

const SELF = "tooling/src/verify/gates/policy-waiver-spelling.ts";
const ORDINARY = "ordinary";

const MESSAGE =
  "an ORDINARY policy's `fix` does not name its own waiver spelling `@orb-waive <id>(<position>): <reason>` " +
  "(gate-runtime-standardization.md §5b.3): the reported position is routinely not what a reader would call the offense (§3), " +
  "so an author the policy fires on has no spelling to type. The `fix` token names the string to repair; the `authority` " +
  "token means the policy has no `fix` at all.";
const NO_FIX_MESSAGE =
  "an ORDINARY policy has no `fix` — §5b.3 requires one naming `@orb-waive <id>(<position>): <reason>`, read off the module's own `report.node` call.";
const FIX =
  "read the module's `report.node` call (or the derived position — the first identifier, literal or keyword of the reported node), " +
  "then state `@orb-waive <id>(<position>): <reason>` in `fix` the way no-raw-spacing-in-features.ts:73-77 does, quotes rule included.";
const BLIND =
  `BLINDNESS: ${SELF} is in the effective population and does not read as a final policy — the import-origin recognizer ` +
  "(lib/gate-contract-origin.ts isCanonicalDefineGate) is dead, so every module would read out of scope. Refusing the run.";

/** The one arm over ONE ordinary module: the `fix` text mentions this policy's own spelling. */
function judgeModule(ctx: GatePolicyContext, descriptor: ObjectLiteralExpression, id: string): void {
  if (staticText(descriptorValue(descriptor, "authority")) !== ORDINARY) {
    return;
  }
  const fix = descriptorValue(descriptor, "fix");
  const fixProperty = descriptorProperty(descriptor, "fix");
  if (fix === undefined) {
    ctx.report.node(descriptorProperty(descriptor, "authority") ?? descriptor, { token: "authority", offset: 0, message: NO_FIX_MESSAGE });
    return;
  }
  const text = staticSegments(fix);
  if (fixProperty !== undefined && text.segments.length > 0 && !text.segments.some((segment) => mentionsWaiverOf(segment, id))) {
    ctx.report.node(fixProperty, { token: "fix", offset: 0 });
  }
}

export const gate = defineGate({
  id: "policy-waiver-spelling",
  family: "policy-soundness",
  authority: "hard",
  severity: "error",
  population: { in: ["@tooling"], under: ["tooling/src/verify/gates/**"], notUnder: ["tooling/src/verify/gates/_proof/**"] },
  analysis: "types",
  execution: "selected-files",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => ({
    evaluate: (): void => {
      for (const sourceFile of ctx.files) {
        const path = ctx.relativePath(sourceFile);
        const descriptor = finalDescriptorOf(sourceFile);
        if (descriptor !== undefined) {
          judgeModule(ctx, descriptor, policyIdOfPath(path));
        } else if (path === SELF) {
          throw new Error(BLIND);
        }
      }
    },
  }),
  mustFlag: [
    {
      mode: "types",
      files: familyFixture(
        finalProbeModule(`${ORDINARY_TRUNK}\n  fix: "move it.",\n  mustPass: [{ mode: "source", files: { "packages/client/src/b.ts": "y" }, why: "w" }],`),
      ),
      expect: { count: 1, token: "fix" },
      why: "THE FOUNDING SHAPE (wave-1 D7): remediation prose with no waiver spelling — the author who cannot take the remediation has nothing to type",
    },
    {
      mode: "types",
      files: familyFixture(finalProbeModule(`${ORDINARY_TRUNK}\n  mustPass: [{ mode: "source", files: { "packages/client/src/b.ts": "y" }, why: "w" }],`)),
      expect: { count: 1, token: "authority", messageIncludes: "has no `fix`" },
      why: "no `fix` at all on an ordinary policy — anchored on `authority` because the door is what obliges the spelling",
    },
    {
      mode: "types",
      files: familyFixture(
        finalProbeModule(
          `${ORDINARY_TRUNK}\n  fix: FIX,\n  mustPass: [{ mode: "source", files: { "packages/client/src/b.ts": "y" }, why: "w" }],`,
          'const FIX = "move the shape " + "to contract/.";\n',
        ),
      ),
      expect: { count: 1, token: "fix" },
      why: "a `fix` behind a const alias built by concatenation is read exactly like an inline string — the spelling is still absent",
    },
    {
      mode: "types",
      files: familyFixture(
        finalProbeModule(
          `${ORDINARY_TRUNK}\n  fix: "waive with @orb-waive other-policy(<position>): <reason>",\n  mustPass: [{ mode: "source", files: { "packages/client/src/b.ts": "y" }, why: "w" }],`,
        ),
      ),
      expect: { count: 1, token: "fix" },
      why: "a spelling naming ANOTHER policy is a marker the central engine binds to nothing (unknown-policy short-circuit) — the id half of the spelling is the identity",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: familyFixture(
        finalProbeModule(
          `${ORDINARY_TRUNK}\n  fix: "a deliberate site is waived with @orb-waive probe(<position>): <reason> on the line above.",\n  mustPass: [{ mode: "source", files: { "packages/client/src/b.ts": "y" }, why: "w" }],`,
        ),
      ),
      why: "the standard met: the exact spelling, in prose the author copies from (no-raw-spacing-in-features.ts:73-77 is the corpus precedent)",
    },
    {
      mode: "types",
      files: familyFixture(
        finalProbeModule(
          `${ORDINARY_TRUNK}\n  fix: "move it, or " + "waive with @orb-waive " + "probe(<position>): <reason>.",\n  mustPass: [{ mode: "source", files: { "packages/client/src/b.ts": "y" }, why: "w" }],`,
        ),
      ),
      why: "the spelling assembled across THREE concatenated literals is one contiguous static text to the reader — a join boundary is not a gap",
    },
    {
      mode: "types",
      files: familyFixture(
        finalProbeModule(
          `${HARD_TRUNK}\n  message: "m",\n  create: () => ({ evaluate: () => undefined }),\n  mustFlag: [{ mode: "source", files: { "packages/client/src/a.ts": "x" }, expect: { count: 1 }, why: "w" }],`,
        ),
      ),
      why: "SCOPE: a HARD policy has no waiver door, so it owes no spelling — and may carry no `fix` at all",
    },
    {
      mode: "types",
      files: familyFixture(
        finalProbeModule(
          `${ORDINARY_TRUNK.replace('authority: "ordinary"', 'authority: "reviewed-grant"')}\n  fix: "add an exact reviewed grant.",\n  mustPass: [{ mode: "source", files: { "packages/client/src/b.ts": "y" }, why: "w" }],`,
        ),
      ),
      why: "SCOPE: a reviewed-grant policy's door is the central grant table, not an inline marker — its `fix` describes the grant route",
    },
    {
      mode: "types",
      files: familyFixture('export const gate = { name: "probe", docRow: "x", message: "m", fix: "move it.", mustFlag: [1], mustPass: [1] };\n'),
      why: "SCOPE: a legacy descriptor's markers are `@orb-gate-ignore`, judged by its own runtime; this family reads the final contract only",
    },
  ],
});
