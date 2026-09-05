// The CONDITIONS a registry row's tier membership can hang on (UNIFIED-VERIFICATION-DESIGN §3.2's
// `tierPrecondition`). Split out of registry.ts at the tooling line cap (§4.3, Core-Tooling-Law): that
// file is a LIST OF ROWS, and a predicate with its own failure semantics is logic, not a row.
//
// EVERY PREDICATE HERE IS TRI-STATE. `null` means the question could not be answered — no usable base
// ref, a failed git call, a checkout that is not a repo — and the runner treats that as RUN. A gate whose
// "off" state is indistinguishable from "I could not tell" is a false clean wearing a tier's clothes, so
// the polarity is the point of the type, not a defensive extra.
import { refuseDirectInvocation } from "@orb/tooling/_shared/entrypoint";
import { branchChangedPaths } from "./repo-paths.ts";

refuseDirectInvocation(import.meta.url, "pnpm verify [--push|--full]");

/** The two trees whose change makes the instrument battery a PUSH concern (#1523) — an instrument's own
 *  source, and its own tests. Nothing else can regress a tooling suite that was green on the merge base. */
const TOOLING_PATH_RE = /^(?:tooling\/|tests\/tooling\/)/u;

/** Rendered in `verify --list` on the tier it narrows, and as the skip notice. One spelling. */
export const TOOLING_TOUCHED_REASON = "the branch diff (vs its merge base, plus the working tree) touches tooling/** or tests/tooling/**";

/** Did THIS branch touch an instrument? `null` when the branch diff is unknowable. */
export function toolingTouched(root: string): boolean | null {
  const changed = branchChangedPaths(root);
  return changed === null ? null : changed.some((path) => TOOLING_PATH_RE.test(path));
}
