// How a FINDING row CITES its run (#1369). Display only: the persisted `next`/`evidence` in run.json keep
// the absolute index path their own validator requires (`assertFindings`, ops/run-report.ts) — this
// shortens what the TERMINAL prints, and nothing else.
//
// WHY: a printed row carried the run's absolute index path TWICE (once in `evidence=`, once in `next=`),
// ~700 bytes per row. On a real /chats run that was 42% of the whole output — the annotation rows alone
// outweighed every line the argv asked for. The short forms are not lossier: `--report <runId>` is a
// resolution `resolveSnapRunIndex` already accepts (and disambiguates across worktrees), and the artifact
// is named relative to the slot the `RUN` line one row above just printed.
import { dirname } from "node:path";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { SnapCompositeFinding, SnapRunIndex } from "../contract/run-index.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap --report <index>");

/** The run's own slot prefix, with its trailing separator, so a foreign artifact cannot match it. */
function slotPrefix(indexPath: string): string {
  return `${dirname(indexPath)}/`;
}

/** `<source>@<path>` for every evidence ref, with THIS run's slot prefix dropped. An artifact from
 *  somewhere else keeps its absolute path: a shortened path that is not slot-relative would be a lie. */
export function findingEvidenceDisplay(finding: SnapCompositeFinding, indexPath: string): string {
  const prefix = slotPrefix(indexPath);
  return finding.evidence.map((row) => `${row.source}@${row.artifact.startsWith(prefix) ? row.artifact.slice(prefix.length) : row.artifact}`).join(",");
}

/** The `next=` command with the absolute index path swapped for the run id. Every other token — the
 *  `--arm`/`--channel`/`--context`/`--page`/`--window` narrowing the producer chose — is untouched, so
 *  the printed command still runs verbatim. */
export function findingNextDisplay(finding: SnapCompositeFinding, index: SnapRunIndex, indexPath: string): string {
  return finding.next.replace(indexPath, index.identity.runId);
}
