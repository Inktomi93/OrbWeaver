// `wire-json-parsed-at-consumer` reports every cast spelling of a response body read (`.json()`, a `.then` callback
// returning it, `JSON.parse` over `.text()`) and passes the parsed and `unknown` forms. The declared rows carry each
// plant; this runs them.

import process from "node:process";
import type { RealCorpusLivenessArm } from "@orb/testkit/node/real-corpus-liveness.ts";
import { assertArmVerdict, openRealCorpusLiveness } from "@orb/testkit/node/real-corpus-liveness.ts";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { gate } from "../../../../tooling/src/verify/gates/wire-json-parsed-at-consumer.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { scaledBudget } from "../../_load-budget.ts";

const CONFORMANCE_TIMEOUT_MS = scaledBudget(120_000);

test(
  "every catch and pass row holds through the production dispatcher",
  () => {
    expect(verifyPolicyProofs([gate])).toEqual([]);
  },
  CONFORMANCE_TIMEOUT_MS,
);

const BODY_CAST_SOURCE = "export const read = async (res: Response): Promise<{ id: string }> => (await res.json()) as { id: string };\n";
const WIRE_READER_ARM: RealCorpusLivenessArm = {
  policy: gate,
  overlays: [
    { kind: "add", path: "packages/client/src/data/wire-reader-liveness.ts", source: BODY_CAST_SOURCE },
    { kind: "add", path: "packages/server/src/infra/wire-reader-liveness.ts", source: BODY_CAST_SOURCE },
    { kind: "add", path: "packages/inference/src/catalog/wire-reader-liveness.ts", source: BODY_CAST_SOURCE },
  ],
  messageIncludes: "a response body is cast instead of parsed",
};

test(
  "the native workspace reports an unparsed body in every actual reading package",
  () => {
    const runner = openRealCorpusLiveness(process.cwd(), [WIRE_READER_ARM]);
    const messages = assertArmVerdict(WIRE_READER_ARM, runner.verdict(WIRE_READER_ARM));
    expect(messages).toHaveLength(WIRE_READER_ARM.overlays.length);
  },
  CONFORMANCE_TIMEOUT_MS,
);
