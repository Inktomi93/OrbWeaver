// The SOCKET FAILURE NOTICE — the copy and the next step a socket fault offers (side-eye rail sweep P2-10,
// 2026-08-17).
//
// It shipped as `notify.error(error.message)`, so the per-user socket cap surfaced the server's own
// sentence verbatim: "Too many open streams (8). Close a tab and retry." — a server noun ("streams"), an
// internal limit, and a "retry" the user had no control for. The classification is on the tRPC CODE, never
// on the message text (`transport/trpc/error-mapping.ts` maps `DomainRateLimitError` → TOO_MANY_REQUESTS),
// which is what these pin: the cap arm speaks in TABS, the fallback keeps the server's detail as a
// description under a title that scans, and BOTH carry the one action that can fix them.
//
// A unit test, not a CT: the notice is a pure function of (code, message) and the CT beside it
// (`use-orb-socket.ct.tsx`) already drives the socket's real fault routing end to end.

// Deep import the module, NOT the `@orb/client/data` barrel: a barrel import drags browser TSX into the
// dom-less `typecheck:graph` program (the 2026-06-28 dom-lib incident, the `import-bundle.test.ts` note).
import { describe } from "vitest";
import { socketNotice } from "../../../../packages/client/src/data/bus/use-orb-socket.ts";
import { expect, test } from "../../../support/fixtures.ts";

/** The verbatim server sentence the cap arrives with — the string this notice exists to STOP showing. */
const SERVER_MESSAGE = "Too many open streams (8). Close a tab and retry.";

function noticeFor(code: string | undefined): { notice: ReturnType<typeof socketNotice>; retries: () => number } {
  let count = 0;
  const notice = socketNotice(code, SERVER_MESSAGE, () => {
    count += 1;
  });
  return { notice, retries: (): number => count };
}

describe("socketNotice", () => {
  test("the per-user socket cap speaks in TABS, never in the server's own sentence", () => {
    const { notice } = noticeFor("TOO_MANY_REQUESTS");

    expect(notice.title).toBe("Too many tabs are open");
    // The whole defect: none of the server's vocabulary reaches the user.
    expect(notice.description).not.toContain("streams");
    expect(notice.description).not.toContain(SERVER_MESSAGE);
    // …and it does not quote the server's NUMBER either — that digit lives inside the message string, and
    // reading it would key the client on message text.
    expect(notice.description).not.toContain("8");
    expect(notice.description).toContain("tab");
  });

  test("every socket fault carries the ONE action that can fix it", () => {
    const capped = noticeFor("TOO_MANY_REQUESTS");
    const other = noticeFor("INTERNAL_SERVER_ERROR");

    expect(capped.notice.action?.label).toBe("Try again");
    expect(other.notice.action?.label).toBe("Try again");
    // The action re-subscribes rather than describing a reload the user has to perform.
    capped.notice.action?.onClick();
    other.notice.action?.onClick();
    expect(capped.retries()).toBe(1);
    expect(other.retries()).toBe(1);
  });

  test("an unclassified fault keeps the server's detail — as a DESCRIPTION under a title that scans", () => {
    // The fallback is not a copy rewrite: an unknown fault's detail is the only information anyone has.
    // What changes is where it sits — `notify`'s own law is that the TITLE must read at a glance and the
    // detail belongs in `description`.
    const { notice } = noticeFor("INTERNAL_SERVER_ERROR");

    expect(notice.title).toBe("Lost the live connection");
    expect(notice.description).toBe(SERVER_MESSAGE);
  });

  test("a MISSING code takes the fallback arm, never the cap copy", () => {
    // `error.data?.code` is optional at the call site, and a notice that claimed "too many tabs" for an
    // unclassifiable fault would be a confident lie.
    const { notice } = noticeFor(undefined);

    expect(notice.title).toBe("Lost the live connection");
  });
});
