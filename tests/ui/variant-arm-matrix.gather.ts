// The variant-arm suite's PAGE→NODE seam validator (#1015).
//
// Pass 1 of the gather hands `page.evaluate` a real FUNCTION, so playwright infers its return type and
// tsc checks the shape at the authoring site. Pass 2 cannot: the inactive classifier must be the shared
// `INACTIVE_KIND_EXPR` STRING inlined verbatim (that constant is a string precisely so every instrument
// runs one home unmodified), and a string `evaluate` returns `unknown`. It was settled with
// `as Promise<Record<string, InactiveKind>>` — a cast with no compiler behind it, over the page boundary,
// which is the exact shape that once disabled the design-audit hover pass's restoration withholding
// (`JSON.parse(raw) as number[]` over selector strings) and that `tooling/src/ui-audit/ops/hover-validate.ts`
// exists to forbid.
//
// THE SILENT ARM IS THE MISSING KEY, not a malformed one. The consumer reads `inactiveByRef[ref] ?? "none"`,
// so a ref the classifier never returned reads as an ACTIVE control — the arm that is judged against the
// full 4.5:1 AA floor. A classifier that silently stopped stamping would turn every disabled twin into a
// false failure, and nothing in the suite could tell that from a real one. So the refs pass 1 actually
// sampled are the DENOMINATOR here: every one must come back classified, or the run is not a verdict.
import type { InactiveKind } from "@orb/tooling/_shared/wcag";
import { INACTIVE_KINDS } from "@orb/tooling/_shared/wcag";

function isInactiveKind(value: unknown): value is InactiveKind {
  return typeof value === "string" && (INACTIVE_KINDS as readonly string[]).includes(value);
}

/** Settle the classifier's payload against the refs pass 1 stamped. Throws a named INSTRUMENT ERROR —
 *  never returns a partial map, because a partial map is indistinguishable from "these are all active". */
export function inactiveClassification(parsed: unknown, sampledRefs: readonly string[]): Record<string, InactiveKind> {
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`INSTRUMENT ERROR: the inactive classifier returned ${parsed === null ? "null" : typeof parsed}, not a ref→kind map`);
  }
  const out: Record<string, InactiveKind> = {};
  for (const [ref, value] of Object.entries(parsed)) {
    if (!isInactiveKind(value)) {
      throw new Error(
        `INSTRUMENT ERROR: the inactive classifier returned ${JSON.stringify(value)} for "${ref}", not one of ${INACTIVE_KINDS.join("/")} — the shared expression did not run`,
      );
    }
    out[ref] = value;
  }
  const missing = sampledRefs.filter((ref) => out[ref] === undefined);
  if (missing.length > 0) {
    throw new Error(
      `INSTRUMENT ERROR: the inactive classifier skipped ${String(missing.length)} sampled ref(s) (${missing
        .slice(0, 3)
        .join(", ")}) — an unclassified ref reads as an ACTIVE control and is judged against the full AA floor`,
    );
  }
  return out;
}
