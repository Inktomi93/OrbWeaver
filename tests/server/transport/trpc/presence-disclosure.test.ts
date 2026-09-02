// presence-disclosure (#1039) — the ONE seam that decides what a client learns about who is online.
//
// The registry's ref-count/grace behaviour is pinned next door (`presence-registry.test.ts`); what is pinned
// HERE is the DISCLOSURE contract, i.e. the three properties a later membership tightening must not break:
//   1. the wire carries the ONLINE SUBSET and nothing else — `lastSeenAt` (WHEN someone's last device went
//      dark) exists on `PresenceView` and is structurally unreachable from the answer;
//   2. an offline / unknown id is ABSENT rather than reported, so a withheld answer and a genuinely-offline
//      user are indistinguishable (no existence oracle when the audience narrows);
//   3. duplicates collapse before the registry is read, so an ask cannot be inflated past its wire cap.
//
// Time is the INJECTED clock, same determinism seam as the registry slice — the grace boundary is exact.

import type { UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { PresenceRegistry } from "@orb/server/transport/trpc";
import { createPresenceRegistry } from "@orb/server/transport/trpc";
import { describe } from "vitest";
import { readPresenceDisclosure } from "../../../../packages/server/src/transport/trpc/presence-disclosure.ts";
import { expect, test } from "../../../support/fixtures.ts";

const ALICE = castId<UserId>("user_alice");
const BOB = castId<UserId>("user_bob");
const CAROL = castId<UserId>("user_carol");

/** The registry's grace window (`presence-registry.ts`), mirrored so a test can step PAST it — the only
 *  state in which `PresenceView.lastSeenAt` is non-null and therefore the only state in which the
 *  projection's "the timestamp never crosses the wire" claim has anything to hide. */
const GRACE_MS = 15_000;
const START_MS = 1000;

/** A registry over a hand-cranked clock, plus a live connection per named user. */
function harness(online: readonly UserId[]): {
  registry: PresenceRegistry;
  drop: (userId: UserId) => void;
  advance: (ms: number) => void;
} {
  let clock = START_MS;
  const registry = createPresenceRegistry(() => clock);
  const controllers = new Map<UserId, AbortController>();
  for (const userId of online) {
    const controller = new AbortController();
    controllers.set(userId, controller);
    registry.connect(userId, controller.signal);
  }
  return {
    registry,
    drop: (userId): void => controllers.get(userId)?.abort(),
    advance: (ms): void => {
      clock += ms;
    },
  };
}

describe("presence-disclosure — the online subset, and nothing else", () => {
  test("returns exactly the asked ids that are online, in ask order", () => {
    const { registry } = harness([ALICE, CAROL]);

    expect(readPresenceDisclosure(registry, [ALICE, BOB, CAROL])).toEqual({ onlineUserIds: [ALICE, CAROL] });
  });

  test("an offline user is ABSENT, never reported — the answer cannot distinguish offline from withheld", () => {
    const { registry } = harness([]);

    const answer = readPresenceDisclosure(registry, [ALICE, BOB]);
    // Not `{alice:false}`, not an entry with a flag: the id simply is not there. That absence is what a
    // future membership filter reuses, so it can never become an existence oracle.
    expect(answer).toEqual({ onlineUserIds: [] });
    expect(JSON.stringify(answer)).not.toContain(ALICE);
  });

  test("lastSeenAt NEVER crosses the wire — the activity timestamp is unreachable from the projection", () => {
    const { registry, drop, advance } = harness([ALICE]);
    drop(ALICE);
    advance(GRACE_MS);
    // The registry itself still knows exactly when Alice's last device went dark…
    expect(registry.read(ALICE).lastSeenAt).toBe(START_MS);

    // …and the disclosure carries neither the value nor a field it could ride on. This is the whole reason
    // the wire shape is an id array rather than `PresenceView[]`: there is nowhere for the timestamp to sit.
    const answer = readPresenceDisclosure(registry, [ALICE]);
    expect(Object.keys(answer)).toEqual(["onlineUserIds"]);
    expect(JSON.stringify(answer)).not.toContain(String(START_MS));
    expect(JSON.stringify(answer)).not.toContain("lastSeenAt");
  });

  test("past the grace window the user is OFFLINE, and offline is still just an absence", () => {
    const { registry, drop, advance } = harness([ALICE, BOB]);
    drop(ALICE);
    advance(GRACE_MS);

    expect(readPresenceDisclosure(registry, [ALICE, BOB])).toEqual({ onlineUserIds: [BOB] });
  });

  test("a within-grace disconnect still reads ONLINE — the debounce is the registry's, and it is honoured", () => {
    const { registry, drop } = harness([ALICE]);
    drop(ALICE);

    // Same injected instant ⇒ inside the 15 s grace window; the dot must not flicker mid-conversation.
    expect(readPresenceDisclosure(registry, [ALICE])).toEqual({ onlineUserIds: [ALICE] });
  });

  test("duplicate ids collapse — an ask cannot be inflated past its wire cap, and the answer never repeats one", () => {
    const { registry } = harness([ALICE]);

    expect(readPresenceDisclosure(registry, [ALICE, ALICE, ALICE, BOB, BOB])).toEqual({ onlineUserIds: [ALICE] });
  });

  test("an empty ask answers empty without touching the registry", () => {
    const { registry } = harness([ALICE]);

    expect(readPresenceDisclosure(registry, [])).toEqual({ onlineUserIds: [] });
  });
});
