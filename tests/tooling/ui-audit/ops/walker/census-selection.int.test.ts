// Adversarial selection-delta controls for #984 through real computed paint.
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "../../../../support/tool-fixtures.ts";
import { RELATIONAL_CLI_TIMEOUT_MS, relationalDocument, stateTwin } from "../../../../support/ui-audit-relational.ts";

test("selection-idiom ignores invariant base paint when selected and unselected twins use the same channel", async ({ runCli, scratch }) => {
  const invariant = [
    stateTwin("selected", "", "background:#333"),
    stateTwin("selected", "", "border:3px solid #fff"),
    stateTwin("selected", "", "box-shadow:0 0 5px #fff"),
  ].join("");
  await writeFile(join(scratch, "invariant-selection-paint.html"), relationalDocument(invariant));
  const res = await runCli("ui-audit", ["/invariant-selection-paint.html", "--base", `file://${scratch}`, "--fail-on", "P2"], {
    timeoutMs: RELATIONAL_CLI_TIMEOUT_MS,
  });
  expect(res.stdout, "absolute card paint is not a selection treatment when the unselected twin shares it").not.toContain("selection-idiom");
});

test("selection-idiom aggregates delta vocabularies across checked, selected, and current state kinds", async ({ runCli, scratch }) => {
  const vocabularies = [
    stateTwin("checked", "outline:2px solid orange"),
    stateTwin("selected", "background:#402000"),
    stateTwin("current", "border-left:3px solid orange"),
  ].join("");
  await writeFile(join(scratch, "cross-kind-selection.html"), relationalDocument(vocabularies));
  const res = await runCli("ui-audit", ["/cross-kind-selection.html", "--base", `file://${scratch}`, "--fail-on", "P2"], {
    timeoutMs: RELATIONAL_CLI_TIMEOUT_MS,
  });
  expect(res.stdout, "three surface-wide delta vocabularies cannot hide in three one-item state buckets").toContain("selection-idiom");
  expect(res.stdout).toContain("ringx1 · fillx1 · bar-leftx1");
});
