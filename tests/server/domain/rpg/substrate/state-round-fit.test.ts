import { DEFAULT_MAX_OUTPUT_TOKENS } from "@orb/contracts/preset";
import { stateRoundNeededTokens } from "../../../../../packages/server/src/domain/rpg/substrate/state-round-fit.ts";
import { expect, test } from "../../../../support/fixtures.ts";

test("the state round prices its tool/schema payload and reserves output even with empty story text", () => {
  expect(stateRoundNeededTokens([])).toBe(DEFAULT_MAX_OUTPUT_TOKENS);
  const request = ["Track the room", "The story moved", '{"type":"object","properties":{"weather":{"type":"string"}}}'];
  const withoutPayload = stateRoundNeededTokens(request.slice(0, 2));
  const withPayload = stateRoundNeededTokens(request);
  expect(withPayload).toBeGreaterThan(withoutPayload);
  const contextWindow = withoutPayload;
  expect(withPayload).toBeGreaterThan(contextWindow);
  expect(withoutPayload).toBe(contextWindow);
});
