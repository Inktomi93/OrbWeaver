// entry/http/frame-handle-store — the ONE opaque-handle store behind the card-frame and plugin-frame
// doorways. The load-bearing property is a SECURITY one and the module's own header states it: `take`
// returns `undefined` for unknown, expired AND FOREIGN alike, so a handle a stranger guesses (or steals
// from a shared link) is indistinguishable from one that never existed — no existence oracle. The other
// two are the retention ceilings (count AND bytes, oldest-first) and the TTL that SLIDES on each serve.
// Pure in-process: the only impurity is the injected clock, which is the seam this pins time through.

import type { UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe } from "vitest";
// Deep-imported: the store is internal to the two frame registrars and deliberately not on the
// `entry/http` front door (the `catalog-refresh-scheduler` test's spelling).
import { createFrameHandleStore, FRAME_HANDLE_SHAPE, FRAME_HANDLE_TTL_MS } from "../../../../packages/server/src/entry/http/frame-handle-store.ts";
import { createFrozenClock } from "../../../support/clock.ts";
import { expect, test } from "../../../support/fixtures.ts";

const OWNER = castId<UserId>("user_owner");
const STRANGER = castId<UserId>("user_stranger");
const CSP = "default-src 'none'";

function put(store: ReturnType<typeof createFrameHandleStore>, doc: string, userId: UserId = OWNER, expiresAt = 0): string {
  return store.put({ userId, doc, csp: CSP, expiresAt });
}

describe("frame-handle-store — the no-existence-leak contract", () => {
  test("the minting owner resolves the document, and the handle matches the path grammar", () => {
    const clock = createFrozenClock();
    const store = createFrameHandleStore(clock.now);

    const id = put(store, "<html>card</html>", OWNER, clock.now() + FRAME_HANDLE_TTL_MS);

    expect(FRAME_HANDLE_SHAPE.test(id)).toBe(true);
    expect(store.take(id, OWNER)?.doc).toBe("<html>card</html>");
    expect(store.take(id, OWNER)?.csp).toBe(CSP);
  });

  test("a FOREIGN owner gets the same answer as an unknown handle — one arm, no oracle", () => {
    const clock = createFrozenClock();
    const store = createFrameHandleStore(clock.now);
    const id = put(store, "<html>private</html>", OWNER, clock.now() + FRAME_HANDLE_TTL_MS);

    const foreign = store.take(id, STRANGER);
    const unknown = store.take("f".repeat(32), STRANGER);

    expect(foreign).toBeUndefined();
    expect(foreign).toStrictEqual(unknown);
    // POSITIVE CONTROL — the same handle is live for its owner, so the undefined above is the OWNER
    // CHECK firing and not a mis-wired fixture that stored nothing.
    expect(store.take(id, OWNER)).toBeDefined();
  });

  test("a foreign read does not evict the document out from under its owner", () => {
    const clock = createFrozenClock();
    const store = createFrameHandleStore(clock.now);
    const id = put(store, "<html>private</html>", OWNER, clock.now() + FRAME_HANDLE_TTL_MS);

    store.take(id, STRANGER);

    expect(store.take(id, OWNER)?.doc).toBe("<html>private</html>");
  });
});

describe("frame-handle-store — expiry and the sliding TTL", () => {
  // Two stores, because a `take` inside the window SLIDES the deadline — reading the control off the
  // same store would move the boundary it is meant to pin (the first draft of this test did exactly
  // that and passed at the deadline).
  test("an entry expires AT its instant (`<= now`), and is live one tick before it", () => {
    const clock = createFrozenClock();
    const live = createFrameHandleStore(clock.now);
    const dead = createFrameHandleStore(clock.now);
    const expiresAt = clock.now() + FRAME_HANDLE_TTL_MS;
    const liveId = put(live, "<html>x</html>", OWNER, expiresAt);
    const deadId = put(dead, "<html>x</html>", OWNER, expiresAt);

    clock.advance(FRAME_HANDLE_TTL_MS - 1);
    expect(live.take(liveId, OWNER)).toBeDefined();

    clock.advance(1);
    expect(dead.take(deadId, OWNER)).toBeUndefined();
  });

  test("each serve SLIDES the deadline — a re-framed tab never finds a hole where its document was", () => {
    const clock = createFrozenClock();
    const store = createFrameHandleStore(clock.now);
    const id = put(store, "<html>x</html>", OWNER, clock.now() + FRAME_HANDLE_TTL_MS);

    // Serve just inside the window, twice, spanning MORE than one whole TTL from the mint.
    clock.advance(FRAME_HANDLE_TTL_MS - 1);
    expect(store.take(id, OWNER)).toBeDefined();
    clock.advance(FRAME_HANDLE_TTL_MS - 1);
    expect(store.take(id, OWNER)).toBeDefined();
  });

  test("a FOREIGN read does not slide the deadline (the owner check is the last word)", () => {
    const clock = createFrozenClock();
    const store = createFrameHandleStore(clock.now);
    const id = put(store, "<html>x</html>", OWNER, clock.now() + FRAME_HANDLE_TTL_MS);

    clock.advance(FRAME_HANDLE_TTL_MS - 1);
    store.take(id, STRANGER);
    clock.advance(1);

    expect(store.take(id, OWNER)).toBeUndefined();
  });
});

describe("frame-handle-store — the two retention ceilings", () => {
  test("the byte ceiling evicts OLDEST-first and never the handle just minted", () => {
    const clock = createFrozenClock();
    const store = createFrameHandleStore(clock.now);
    const expiresAt = clock.now() + FRAME_HANDLE_TTL_MS;
    const fiveMib = "a".repeat(5 * 1_048_576);

    const first = put(store, fiveMib, OWNER, expiresAt);
    expect(store.take(first, OWNER)).toBeDefined();

    // 5 MiB + 5 MiB is over the 8 MiB ceiling: the oldest goes, the fresh one survives.
    const second = put(store, fiveMib, OWNER, expiresAt);

    expect(store.take(second, OWNER)).toBeDefined();
    expect(store.take(first, OWNER)).toBeUndefined();
  });

  test("the count ceiling caps the map at 256 live handles, evicting from the oldest end", () => {
    const clock = createFrozenClock();
    const store = createFrameHandleStore(clock.now);
    const expiresAt = clock.now() + FRAME_HANDLE_TTL_MS;

    const ids = Array.from({ length: 257 }, (_, i) => put(store, `<html>${i}</html>`, OWNER, expiresAt));
    const oldest = ids[0] ?? "";
    const newest = ids.at(-1) ?? "";

    expect(store.take(oldest, OWNER)).toBeUndefined();
    expect(store.take(newest, OWNER)).toBeDefined();
    // The survivor set is exactly the cap — the second-oldest is still live.
    expect(store.take(ids[1] ?? "", OWNER)).toBeDefined();
  });
});
