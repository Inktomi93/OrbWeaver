// substrate/image-space-degrade — the announce latch for the §10-3 captioned-text fallback.
//
// WHAT IS UNDER TEST is the LATCH KEY, not the logging. The degrade is a fact about the owner's BINDING, so
// a 350-image sweep must say it ONCE — but a RE-BINDING must get its own say, or the operator sees the old
// state's line and never the new one. Those two requirements pull in opposite directions and the key is
// what reconciles them: `(owner, space, cause)`.
//
// The log itself is asserted through a spy on the shared logger rather than by reading the message: what a
// caller can act on is "how many times did this speak", which is the property the latch exists for.

import type { UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { getLog } from "@orb/server/foundation/observability";
import { beforeEach, vi } from "vitest";
import { __resetImageSpaceDegrade, reportImageSpaceDegrade } from "../../../../../packages/server/src/domain/embeddings/substrate/image-space-degrade.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const OWNER = castId<UserId>("user_degrade_a");
const OTHER = castId<UserId>("user_degrade_b");

beforeEach(() => {
  __resetImageSpaceDegrade();
});

function warnSpy(): ReturnType<typeof vi.spyOn> {
  return vi.spyOn(getLog(), "warn").mockImplementation(() => undefined);
}

test("says it ONCE per owner+space+cause — a whole sweep is one line, not one per asset", () => {
  const warn = warnSpy();
  for (let i = 0; i < 5; i += 1) {
    reportImageSpaceDegrade(OWNER, "text-model", "no-image-embed-connection");
  }
  expect(warn).toHaveBeenCalledTimes(1);
  warn.mockRestore();
});

test("a DIFFERENT owner gets their own say — the latch is not a global flag", () => {
  const warn = warnSpy();
  reportImageSpaceDegrade(OWNER, "text-model", "no-image-embed-connection");
  reportImageSpaceDegrade(OTHER, "text-model", "no-image-embed-connection");
  expect(warn).toHaveBeenCalledTimes(2);
  warn.mockRestore();
});

test("a re-binding speaks again — a new space or a new cause is a new state, not a repeat", () => {
  const warn = warnSpy();
  reportImageSpaceDegrade(OWNER, "text-model", "no-image-embed-connection");
  // Same owner, same cause, DIFFERENT space: they re-pointed their embed connection and the degrade now
  // describes a different geometry. Silencing this would leave the operator reading a stale line forever.
  reportImageSpaceDegrade(OWNER, "other-model", "no-image-embed-connection");
  // Same owner, same space, DIFFERENT cause: they bound an imageEmbed model that cannot take a picture —
  // a distinct, separately-fixable state.
  reportImageSpaceDegrade(OWNER, "other-model", "image-embed-model-takes-no-image-input");
  expect(warn).toHaveBeenCalledTimes(3);
  warn.mockRestore();
});

test("the message names the FIX, not just the symptom", () => {
  const warn = warnSpy();
  reportImageSpaceDegrade(OWNER, "text-model", "no-image-embed-connection");
  const [context, message] = warn.mock.calls[0] ?? [];
  // A degrade a user can repair is only useful if the line says how: the structured context carries the
  // cause for machines, the message carries the action for humans.
  expect(context).toMatchObject({ ownerId: OWNER, space: "text-model", cause: "no-image-embed-connection" });
  expect(String(message)).toMatch(/imageEmbed connection/u);
  warn.mockRestore();
});
