// The case that raised brand-flow: `first-model-setup.tsx` held a connection id in `useState<string>`, fed it from a
// `UserConnectionId`, and compared the state back to a row's id. While the file keeps that shape the scan must report
// the state widen and the compare that launders it back; once the state is typed as the brand it must report neither.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import { scanBrandFlow } from "../../../tooling/src/brand-flow/index.ts";

const ROOT = join(import.meta.dirname, "../../..");
const FILE = "packages/client/src/features/credentials/components/first-model-setup.tsx";
const CLIENT_WORLD = "packages/client/tsconfig.json";
const UNFIXED_STATE = "useState<string>(picked";

test("the known first-model-setup case is reported until its state is typed as the brand", { timeout: 300_000 }, () => {
  const unfixed = readFileSync(join(ROOT, FILE), "utf8").includes(UNFIXED_STATE);
  const report = scanBrandFlow({ root: ROOT, worlds: [CLIENT_WORLD], log: () => undefined });
  const states = report.widens.filter((widen) => widen.file === FILE && widen.slot.kind === "state");
  const laundered = report.renarrows.filter((site) => site.file === FILE && site.proof === "slot-widened");
  expect({ states: states.length > 0, laundered: laundered.length > 0 }).toEqual({ states: unfixed, laundered: unfixed });
});
