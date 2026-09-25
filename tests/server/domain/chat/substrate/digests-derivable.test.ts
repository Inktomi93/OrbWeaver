// substrate/digests-derivable — only an unbound summarize connection pauses digests; every other cause is a fault.

import type { SendAvailability } from "@orb/contracts/inference";
import type { UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { digestsDerivable } from "../../../../../packages/server/src/domain/chat/substrate/digests-derivable.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const FUNDER = castId<UserId>("user_funder");
const withAvailability = (availability: SendAvailability): { summarizeAvailability: () => Promise<SendAvailability> } => ({
  summarizeAvailability: () => Promise.resolve(availability),
});

test("no summarize connection bound pauses digests", async () => {
  expect(await digestsDerivable(withAvailability({ available: false, cause: "no-connection" }), FUNDER)).toBe(false);
});

test("a bound summarizer, or any other unavailability, keeps digests on so a real fault still surfaces", async () => {
  expect(await digestsDerivable(withAvailability({ available: true }), FUNDER)).toBe(true);
  expect(await digestsDerivable(withAvailability({ available: false, cause: "endpoint-unreachable" }), FUNDER)).toBe(true);
});
