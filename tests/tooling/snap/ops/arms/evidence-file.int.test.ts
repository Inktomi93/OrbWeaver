// EVERY PAGE ARM FILES WHAT IT PRINTS (#1342). A run's end card names `EVIDENCE <run.json>` as the receipt
// a review cites; before this, the values behind that receipt were on the reviewer's terminal and nowhere
// else.
//
// THE DEFECT THIS PINS. Side-eye's P1 about the /chats month filter (2026-09-04) cited run
// `main-1759904-…T15-45-33-301Z` for the value `Chats 0 of 6`. In that slot the eval fact read
// `{ expressions: 1, failures: 0 }` with `artifacts: []`, and `grep -c 'Chats 0 of 6'` over run.json plus
// every `evidence/*.json` returned 0 — so a second reader could not confirm or refute the finding, and
// `--report --arm eval` had nothing to replay. The same hole covered the ASSERT lines, the CONTRAST
// readings, the surface map, the a11y tree and the dead-CSS census.
//
// THE CONTRACT: a planted value is recoverable FROM THE SLOT WITH NO BROWSER, and the arm's fact in the
// immutable index REFERENCES the file that holds it (the index binds an artifact to its `producerArm`).
//
// @instrument-proof: the fixture plants a value no other artifact could contain, and the negative control
// is the same run's arms that were never asked for — an arm that files unconditionally would leave an
// `evidence/map.json` claiming a population this run never measured.
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { EXIT } from "@orb/tooling/_shared/exit-contract";
import { expect, test } from "../../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../../_load-budget.ts";

const BROWSER_TIMEOUT_MS = scaledBudget(60_000);

/** The planted string exists nowhere else in the repo, so finding it in the slot cannot be a coincidence. */
const PLANTED = "planted receipt 4711";
const FIXTURE = `<!doctype html><html data-app-ready="settled"><head><title>${PLANTED}</title><style>
  body { margin: 0; background: #ffffff; }
  p { color: #111111; font-size: 16px; }
</style></head><body><p id="line">${PLANTED}</p></body></html>`;

interface RunIndex {
  readonly results?: {
    readonly batches: readonly { readonly arms: readonly { readonly arm: string; readonly artifacts: readonly string[] }[] }[];
  };
  readonly artifacts: readonly { readonly relativePath: string; readonly producerArm: string | null; readonly records: number | null }[];
}

/** The slot the run itself named on its RESULT line — never a guess at "the newest directory". */
function slotOf(stdout: string): string {
  const index = /RESULT snap exit=\d+ index=(\S+)/u.exec(stdout)?.[1];
  if (index === undefined) {
    throw new Error(`the run printed no RESULT index= line:\n${stdout}`);
  }
  return dirname(index);
}

function factArtifacts(index: RunIndex, arm: string): readonly string[] {
  return (index.results?.batches ?? []).flatMap((batch) => batch.arms.filter((fact) => fact.arm === arm).flatMap((fact) => fact.artifacts));
}

test("a planted --eval value is recoverable from the run slot with no browser, and its fact names the file", { timeout: BROWSER_TIMEOUT_MS }, async ({
  plantedTree,
  runCli,
}) => {
  const root = await plantedTree({ "page.html": FIXTURE });
  const run = await runCli(
    "snap",
    ["--file", `${root}/page.html`, "--no-shot", "--no-failure-evidence", "--eval", "document.title", "--text", "--contrast", "p", "--expect-visible", "#line"],
    { timeoutMs: BROWSER_TIMEOUT_MS },
  );
  await expect(run).toExitWith(EXIT.clean);

  const slot = slotOf(run.stdout);
  const evidence = readdirSync(join(slot, "evidence"));
  const index = JSON.parse(readFileSync(join(slot, "run.json"), "utf8")) as RunIndex;

  // 1. THE VALUE IS ON DISK — the exact string a review would quote, in the slot the review cites.
  const evals = readFileSync(join(slot, "evidence", "evals.json"), "utf8");
  expect(evals).toContain(PLANTED);
  expect(JSON.parse(evals)).toMatchObject({ v: 1, evals: [{ page: 0, expression: "document.title", error: null }] });

  // 2. THE FACT POINTS AT IT. Without this a reader has to guess which file belongs to which arm.
  expect(factArtifacts(index, "eval")).toContain("evidence/evals.json");
  expect(factArtifacts(index, "assert")).toContain("evidence/assertions.json");
  expect(factArtifacts(index, "contrast")).toContain("evidence/contrast.json");
  expect(factArtifacts(index, "aria")).toContain("evidence/aria.json");

  // 3. THE OTHER PRINTED ARMS ARE FILED TOO — the values, not just their counts.
  expect(readFileSync(join(slot, "evidence", "assertions.json"), "utf8")).toContain("ASSERT visible #line: PASS");
  expect(readFileSync(join(slot, "evidence", "contrast.json"), "utf8")).toContain('"requiredRatio"');
  expect(readFileSync(join(slot, "evidence", "aria.json"), "utf8")).toContain(PLANTED);

  // 4. THE NEGATIVE CONTROL: arms this run never asked for file NOTHING. An unconditional writer would
  //    leave a map/dead-css population that was never measured, which is the lie one rung worse than
  //    silence.
  expect(evidence).not.toContain("map.json");
  expect(evidence).not.toContain("dead-css.json");
  // …and every filed row is inventoried with a real record count, which is what makes it citable.
  const filed = index.artifacts.filter((artifact) => artifact.relativePath.startsWith("evidence/") && artifact.producerArm !== null);
  expect(filed.length).toBeGreaterThanOrEqual(4);
  expect(filed.every((artifact) => (artifact.records ?? 0) > 0)).toBe(true);
});
