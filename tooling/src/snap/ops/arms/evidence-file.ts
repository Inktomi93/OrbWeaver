// THE PAGE ARMS' FILING DOOR (#1342). A page arm's numbers reached the run index; its VALUES reached only
// stdout — so the immutable slot a review cites carried `expressions: 1, failures: 0, artifacts: []` and
// nothing a second reader could open.
//
// MEASURED 2026-09-04 (cold-agent dogfood). Side-eye's P1 about the /chats month filter cited run
// `main-1759904-…T15-45-33-301Z` for the value `Chats 0 of 6`; `grep -c 'Chats 0 of 6'` over that slot's
// run.json and every `evidence/*.json` returned 0. The reviewer's terminal was the only copy, and
// `--report … --arm eval` had nothing to replay. Same shape for the assertion lines, the contrast rows,
// the map, the a11y text, the perf read and the dead-CSS census.
//
// THE MECHANISM. An artifact declares its `producerArm`, and `ops/run-bundle.ts` binds every artifact whose
// producerArm + scope match a fact onto that fact's `artifacts` list when it writes the index. So an arm
// does not hand its refs anywhere: it WRITES its file with its own arm name and the reference appears.
// (That binding predates this file — what was missing was any page arm ever writing one.)
//
// BOUNDED BY CONTRACT. Every writer here passes what it already printed, which is already capped by the arm
// that produced it (`capEvalText`'s 20 000-char both-ends cap, the map's entry cap, the aria depth), and
// says so in `completenessDetail`. This door adds no second cap and no second read of the page.
import { writeFile } from "node:fs/promises";
import type { InstrumentArtifactCompleteness, InstrumentArtifactLimitReceipt } from "../../../_shared/artifact-out.ts";
import { artifactFile } from "../../../_shared/artifact-out.ts";
import { aggregateScope } from "../../../_shared/artifact-scope.ts";
import { refuseDirectInvocation } from "../../../_shared/entrypoint.ts";
import type { Arm } from "../../contract/arm-vocabulary.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route> --eval <expression>");

export interface ArmEvidenceFile {
  /** The arm this evidence belongs to — the ONLY thing that binds the artifact to that arm's fact. */
  readonly arm: Arm;
  /** Basename inside `evidence/`, without extension: `evals`, `assertions`, `contrast`, … */
  readonly name: string;
  /** Per-call-site prefix so a scenario's checkpoints do not overwrite one another (`""` for a plain run). */
  readonly slug: string;
  readonly schema: string;
  /** Rows in the body — what a reader can expect to find, and the artifact's `records` receipt. */
  readonly records: number;
  readonly completeness: InstrumentArtifactCompleteness;
  readonly completenessDetail: string;
  readonly limits?: readonly InstrumentArtifactLimitReceipt[];
  readonly body: unknown;
}

/** Write one page arm's printed evidence into the run slot, declared under that arm. Nothing is written
 *  for an arm that measured nothing — an empty file would claim a population that does not exist. */
export async function writeArmEvidenceFile(file: ArmEvidenceFile): Promise<void> {
  if (file.records === 0) {
    return;
  }
  const path = await artifactFile("evidence", `${file.slug}${file.name}`, ".json", {
    producer: "snap",
    producerArm: file.arm,
    channel: file.name,
    mediaType: "application/json",
    schema: file.schema,
    role: "primary",
    completeness: file.completeness,
    completenessDetail: file.completenessDetail,
    // AGGREGATE on purpose: a page arm's fact is emitted at aggregate scope, and `run-bundle.ts` only binds
    // an artifact to a non-exact fact when all three scope axes are aggregate too.
    scope: aggregateScope(),
    records: file.records,
    limits: file.limits ?? [],
  });
  await writeFile(path, `${JSON.stringify(file.body, null, 2)}\n`, "utf8");
}
