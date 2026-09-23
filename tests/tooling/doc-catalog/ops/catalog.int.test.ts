// The PERMANENT PIN for #968: the doc-catalog artifacts must be canonical under the repo's OWN
// formatter, and `check:doc-catalog` must SAY SO. It used to be blind — the tool validated row CONTENT
// and never FORM, so a hand-edited receipt in raw `JSON.stringify` shape (arrays expanded across lines
// where biome inlines them) went red in `lint:biome` hours later in an unrelated stage.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ArtifactForm, LaneConfig } from "../../../../tooling/src/doc-catalog/index.ts";
import { authoredArtifacts, offCanonicalPaths, unformattedArtifacts } from "../../../../tooling/src/doc-catalog/index.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const LANES_PATH = "docs/catalog/lanes.json";
/** receipts + state.json — the artifacts a lane writes BY HAND (catalog.json is generated, and its own
 *  two-sided arm is `catalogIsStale`). */
const STATE_ARTIFACTS = 1;

function lanes(repoRoot: string): LaneConfig {
  return JSON.parse(readFileSync(join(repoRoot, LANES_PATH), "utf8")) as LaneConfig;
}

function form(current: string, canonical: string): ArtifactForm {
  return { path: "docs/catalog/receipts/example.json", current, canonical };
}

test("PLANTED CONTROL — the mis-shaped array the generator's formatter inlines is reported off-canonical", () => {
  const raw = '{\n  "entries": [\n    "docs/Mission.md"\n  ]\n}\n';
  const canonical = '{\n  "entries": ["docs/Mission.md"]\n}\n';
  expect(offCanonicalPaths([form(raw, canonical)])).toEqual(["docs/catalog/receipts/example.json"]);
});

test("the other direction — a byte-identical artifact is silent", () => {
  const canonical = '{\n  "entries": ["docs/Mission.md"]\n}\n';
  expect(offCanonicalPaths([form(canonical, canonical)])).toEqual([]);
});

test("the reconciliation names EVERY off-canonical artifact, not just the first", () => {
  const forms: readonly ArtifactForm[] = [
    { path: "a.json", current: "x", canonical: "y" },
    { path: "b.json", current: "same", canonical: "same" },
    { path: "c.json", current: "p", canonical: "q" },
  ];
  expect(offCanonicalPaths(forms)).toEqual(["a.json", "c.json"]);
});

test("the REAL tree: every hand-authored catalog artifact is already canonical", ({ repoRoot }) => {
  const config = lanes(repoRoot);
  // THE DENOMINATOR IS THE RECEIPT: a formatter arm that examined zero artifacts is "I could not
  // measure", never "clean" — so assert what it looked at before believing the empty verdict.
  expect(authoredArtifacts(config)).toHaveLength(config.lanes.length + STATE_ARTIFACTS);
  expect(unformattedArtifacts(config)).toEqual([]);
});
