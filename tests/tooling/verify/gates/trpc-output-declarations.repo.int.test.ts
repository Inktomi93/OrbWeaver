// Native installed tRPC types, mounted population, and virtual-only omissions on actual service routes.

import process from "node:process";
import { gate } from "../../../../tooling/src/verify/gates/trpc-output-declarations.ts";
import { assertArmVerdict, openRealCorpusLiveness } from "../../../support/real-corpus-liveness.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { TRPC_OUTPUT_ARMS } from "./_liveness/trpc-output.ts";

const arm = TRPC_OUTPUT_ARMS[0];
if (arm === undefined) {
  throw new Error("Missing tRPC output liveness arm");
}

test("native AppRouter output coverage is clean and virtual omission controls all bite", () => {
  const runner = openRealCorpusLiveness(process.cwd(), [arm]);
  expect(runner.assertBaseline()).toEqual([gate.id]);
  const verdict = runner.verdict(arm);
  const messages = assertArmVerdict(arm, verdict).join("\n");
  for (const path of ["refinery.iterate", "refinery.applyFields", "refinery.applyAsCopy", "chat.listMessages", "workloads.get"]) {
    expect(messages).toContain(`Mounted: ${path}`);
  }
}, 60_000);
