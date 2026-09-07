// CT: the Databank CONTEXT arm — the activation panel. What it pins (databank-surface-spec §6):
//
//   · with nothing open it renders the SECTION's own no-selection copy, not the generic "Details / select
//     something" filler the F-12 sweep deleted. A `single` context body is mounted unconditionally by the
//     shell and handed no result, so this arm is the body's own to render;
//   · it owns the OWNER-scoped `Everywhere` write (per-chat attach is HOST authority and lives in the chat
//     panel — the write lives where the authority lives);
//   · it states WHERE the document is active as a NAMED roster of doors — and the leak that once forced two
//     bare counts is closed on the WIRE (chat's `resolveVisibleRooms`), not by hiding names in the client.

import { expect, test } from "@playwright/experimental-ct-react";
import { trpcError, trpcHold } from "../../../../support/node/route-trpc.ts";
import { DatabankContextStory, DatabankWorkspaceListModeStory, DatabankWorkspaceStory } from "../_ct-stories.tsx";
import { ATTACHED_CHARACTER, ATTACHED_ROOM, READY_DOC, stubDatabank } from "../fixtures.ts";

/** The row body opens a document — matched loosely because the row's accessible name carries its scent
 *  line as well as its title (top-level so the pattern is compiled once). */
const CRIMSON_ROW = /The Crimson Court/;

/** The downgraded promise and the roster promise it replaced. */
const COUNT_PROMISE = /how many chats and characters it reaches/u;
const ROSTER_PROMISE = /which chats and characters it already feeds/u;

/** The two Active-in DOORS, by the name a reader meets them under — the room is titled by its CAST (the
 *  fixture's room carries no authored title, which is the point), the card by its own name. */
const ROOM_DOOR = /Azarael/;
const CARD_DOOR = /Duskwater Warden/;

test("CONTEXT with nothing open says what the pane WILL show (its own words, F-12)", async ({ mount, page }) => {
  await stubDatabank(page);
  const context = await mount(<DatabankContextStory />);

  await expect(context.getByText("Where a document fires")).toBeVisible();
  // The generic filler the F-12 sweep deleted must not come back.
  await expect(context.getByText("Select something to see its details here.")).toHaveCount(0);
});

// THE PROMISE MATCHES THE PAYMENT — STILL, IN THE OTHER DIRECTION (#276, superseding side-eye 2026-08-19
// P1's arm of it). P1 measured a promise of names ("WHICH chats and characters it already feeds") paid in
// two integer Badges, and the copy correctly downgraded to the count while the roster was blocked on a read
// that did not exist. The read exists now — `databank.listAttachments` returns NAMED rooms (already
// membership-filtered by chat's leak-safe `resolveVisibleRooms`, D18) and named characters — so the promise
// goes back up WITH the payment, and this pin flips with it: the invariant was never "say count", it was
// "the sentence and the pane agree". Both ends stay pinned, so half of either state cannot land alone.
test("the CONTEXT promise is a ROSTER, and the pane pays it (#276)", async ({ mount, page }) => {
  await stubDatabank(page);
  const context = await mount(<DatabankContextStory />);

  await expect(context.getByText(ROSTER_PROMISE)).toBeVisible();
  await expect(context.getByText(COUNT_PROMISE)).toHaveCount(0);
});

// THE FIRST-RUN TRI-PANE SAID ONE THING THREE TIMES (side-eye 2026-08-19 N-4). On an empty bank all three
// panes are empty at once and all three printed the SAME `FileText` at `lg` — one screen, one glyph, three
// times, which reads as a template rather than three answers. The CONTEXT rail's no-selection arm is the one
// that drops it: it is a CAPTION for a 320px panel, where LIST's glyph sits over the Add that fixes the
// state and CONTENT's is the section's own welcome. Asserted on the RENDERED heads across the whole
// workspace, so it cannot be satisfied by swapping one glyph for another that repeats somewhere else.
//
// THE SETTLE BARRIER MOVED WITH #434, THE INVARIANT DID NOT. This pin used to settle on CONTENT's
// "Your databank" — copy #434 (e28d3cdeb) deliberately deleted on an empty bank with the list on screen, so
// the barrier waited 5s for a string the product had stopped saying and the pin went red without the defect
// coming back (`databank-detail-surface.ct` line 81 pins the SAME absence from the other side). It cannot
// simply be dropped: an empty CONTENT pane and a CONTENT pane whose `bankHealth` census is still in flight
// are the same DOM, so counting at boot would pass while the pane was merely late — a green that survives
// the N-4 defect's return. So CONTENT is settled POSITIVELY through the one regime that makes it speak (the
// list off screen, #434's own conditional arm), and the count is taken back at the boot layout.
test("the empty tri-pane does not print one hero glyph three times (N-4)", async ({ mount, page }) => {
  await stubDatabank(page, { "databank.listGlobal": () => [] }, []);
  const workspace = await mount(<DatabankWorkspaceListModeStory />);
  // SETTLED: LIST and CONTEXT have rendered their own empty…
  await expect(workspace.getByText("Where a document fires")).toBeVisible();
  await expect(workspace.getByText("No documents yet")).toBeVisible();
  // …and CONTENT has too — its census landed, proven by the arm that prints under it.
  await workspace.getByRole("button", { name: "take the list off screen" }).click();
  await expect(workspace.getByText("Your databank")).toBeVisible();
  await workspace.getByRole("button", { name: "put the list back" }).click();
  await expect(workspace.getByText("Your databank")).toHaveCount(0);
  await expect.poll(async () => await page.locator('[data-slot="empty-state-icon"]').count()).toBeLessThan(3);
  // …and it is the CONTEXT arm that gave one up — the other two keep theirs.
  await expect
    .poll(
      async () =>
        await page.evaluate(() => {
          const title = [...document.querySelectorAll('[data-slot="empty-state-title"]')].find((el) => el.textContent?.trim() === "Where a document fires");
          return title?.parentElement?.querySelectorAll('[data-slot="empty-state-icon"]').length ?? -1;
        }),
    )
    .toBe(0);
});

test("the activation body owns the Everywhere write and states where the document is active", async ({ mount, page }) => {
  const trpc = await stubDatabank(page);
  const workspace = await mount(<DatabankWorkspaceStory />);
  await workspace.getByRole("button", { name: CRIMSON_ROW }).first().click();
  await expect(workspace.getByRole("heading", { name: "The Crimson Court" })).toBeVisible();

  const toggle = workspace.getByRole("switch", { name: "Stop feeding The Crimson Court to every chat" });
  await expect(toggle).toBeVisible();
  await expect(workspace.getByText("Every chat", { exact: true })).toBeVisible();
  // NAMES, not "1 chat": the room is named by the client's ONE title chain off the cast the wire carries
  // (the fixture's room has no authored title, so a server-side name would read "Untitled chat" here).
  await expect(workspace.getByRole("button", { name: ROOM_DOOR })).toBeVisible();
  await expect(workspace.getByRole("button", { name: CARD_DOOR })).toBeVisible();

  // GEOMETRY AT THE NARROWEST REAL MOUNT (the 320px CONTEXT rail this story renders at): a door is a glyph +
  // a truncating title + a `shrink-0` recency stamp, which is exactly the cluster shape that overflows its
  // pane when the title refuses to give. Measured, not assumed — a clipped row is invisible to every other
  // assertion here.
  const overflow = await page.evaluate(() => {
    const button = [...document.querySelectorAll("button")].find((el) => el.textContent?.includes("Azarael"));
    if (button === undefined) {
      return { fits: false, why: "no door" };
    }
    const pane = button.closest("[data-slot='surface']") ?? button.parentElement;
    return {
      fits: button.scrollWidth <= button.clientWidth + 1 && (pane === null || button.getBoundingClientRect().right <= pane.getBoundingClientRect().right + 1),
      why: `${button.scrollWidth}/${button.clientWidth}`,
    };
  });
  expect(overflow.fits, `the room door overflows the 320px rail (scroll/client ${overflow.why})`).toBe(true);

  await toggle.click();
  await expect.poll(() => trpc.lastInput("databank.detachGlobal"), { intervals: [20, 50, 100] }).toEqual({ documentId: READY_DOC.id });
});

test("the Everywhere switch locks while its write is held, then remains actionable after a rejection", async ({ mount, page }) => {
  const held = trpcHold();
  let attempts = 0;
  const trpc = await stubDatabank(page, {
    "databank.listGlobal": () => [],
    "databank.attachGlobal": () => {
      attempts += 1;
      if (attempts === 1) {
        return held;
      }
      return attempts === 2 ? trpcError() : null;
    },
  });
  const workspace = await mount(<DatabankWorkspaceStory />);
  await workspace.getByRole("button", { name: CRIMSON_ROW }).first().click();
  const toggle = workspace.getByRole("switch", { name: "Feed The Crimson Court to every chat" });

  await toggle.click();
  await held.requested;
  await expect(toggle).toBeDisabled();
  await expect(workspace.getByRole("status").filter({ hasText: "Feeding The Crimson Court everywhere…" })).toBeVisible();
  held.release(null);
  await expect(toggle).toBeEnabled();

  await toggle.click();
  await expect.poll(() => trpc.count("databank.attachGlobal")).toBe(2);
  await expect(toggle).toBeEnabled();
  await toggle.click();
  await expect.poll(() => trpc.count("databank.attachGlobal")).toBe(3);
});

// THE ACTIVE-IN ROWS ARE DOORS (#276). The block shipped as two dead integers, and the pane's own header
// recorded WHY the roster was unbuilt rather than refused: naming rooms straight off `chat_documents` would
// name rooms the reader was kicked out of (D18 — a junction row outlives its attacher's seat). The wire is
// leak-safe now, so the names are exactly the rooms this reader can still open — and a row you can open is
// a row that should open. Asserted at the STORE ACTIONS both doors write (section + the selected id), never
// at a rendered echo: this story mounts neither a chats section nor a characters section.
test("an Active-in row OPENS the room / the card it names (#276)", async ({ mount, page }) => {
  await stubDatabank(page);
  const workspace = await mount(<DatabankWorkspaceStory />);
  const probe = workspace.getByRole("status");
  await workspace.getByRole("button", { name: CRIMSON_ROW }).first().click();
  await expect(workspace.getByRole("heading", { name: "Active in" })).toBeVisible();

  await workspace.getByRole("button", { name: ROOM_DOOR }).click();
  await expect(probe).toContainText("section=chats");
  await expect(probe).toContainText(`chat=${ATTACHED_ROOM}`);

  await workspace.getByRole("button", { name: CARD_DOOR }).click();
  await expect(probe).toContainText("section=characters");
  await expect(probe).toContainText(`character=${ATTACHED_CHARACTER}`);
});

// THE RETRIEVAL POINTER IS A DOOR (side-eye 2026-08-19 P2). It used to spell "Settings → Chat behavior →
// Databank" in prose, beside an `openConfigTo` seam that lands on that exact section — a navigation the
// product knew how to perform, printed as instructions for the user to perform by hand. Asserted at the
// STORE ACTION (the story's probe), because this story mounts no config host: a rendered echo would be
// asserting the harness, and the deep link's whole payload is the group + section it targets. Since #866 S1
// the door switches the SECTION (the settings modal is gone), so the probe reads the section + the target.
test("the Retrieval pointer OPENS the settings it names (P2)", async ({ mount, page }) => {
  await stubDatabank(page);
  const workspace = await mount(<DatabankWorkspaceStory />);
  const probe = workspace.getByRole("status");
  // The three blocks only exist with a document OPEN (the no-selection arm is the section's own empty).
  await workspace.getByRole("button", { name: CRIMSON_ROW }).first().click();
  await expect(workspace.getByRole("heading", { name: "The Crimson Court" })).toBeVisible();

  await expect(probe).toContainText("modal=none");
  await workspace.getByRole("button", { name: "Retrieval settings" }).click();

  await expect(probe).toContainText("modal=none");
  await expect(probe).toContainText("section=config");
  await expect(probe).toContainText("category=chat-behavior");
  await expect(probe).toContainText("sub=databank");
});

// CD1 (section.tsx's own doc): a read-only GROUPING gets the micro-caps kicker + a hairline rule, not the
// settings-pane `heading`. Asserted on the COMPUTED transform and the Separator sibling — the two marks the
// kicker arm actually draws — never on a class name, so a variant rewrite cannot satisfy this by spelling.
test("the CONTEXT groups are CD1 kickers, hairline and all (P2)", async ({ mount, page }) => {
  await stubDatabank(page);
  const workspace = await mount(<DatabankWorkspaceStory />);
  await workspace.getByRole("button", { name: CRIMSON_ROW }).first().click();
  await expect(workspace.getByRole("heading", { name: "Everywhere" })).toBeVisible();
  await expect
    .poll(
      async () =>
        await page.evaluate(() =>
          ["Everywhere", "Active in", "Retrieval"].map((name) => {
            const heading = [...document.querySelectorAll("h3")].find((el) => el.textContent?.trim() === name);
            if (heading === undefined) {
              return { name, transform: "MISSING", separators: -1 };
            }
            const row = heading.parentElement;
            return {
              name,
              transform: getComputedStyle(heading).textTransform,
              separators: row === null ? -1 : row.querySelectorAll('[data-slot="separator"]').length,
            };
          }),
        ),
    )
    .toEqual([
      { name: "Everywhere", transform: "uppercase", separators: 1 },
      { name: "Active in", transform: "uppercase", separators: 1 },
      { name: "Retrieval", transform: "uppercase", separators: 1 },
    ]);
});

// "NOWHERE YET" IS A CLAIM ABOUT THE JUNCTION TABLE (#1500). The block branched on `isPending` alone, so a
// failed `listAttachments` emptied both lists and the pane stated that this document feeds nothing — the
// exact sentence a reader would act on, about data the pane had not read.
test("a FAILED attachments read never claims the document is attached NOWHERE (#1500)", async ({ mount, page }) => {
  const trpc = await stubDatabank(page, { "databank.listAttachments": () => trpcError({ message: "attachments read failed" }) });
  const workspace = await mount(<DatabankWorkspaceStory />);
  await workspace.getByRole("button", { name: CRIMSON_ROW }).first().click();
  await expect(workspace.getByRole("heading", { name: "Active in" })).toBeVisible();

  await expect(workspace.getByText("Couldn't load where this document is active.")).toBeVisible();
  await expect(workspace.getByText("Nowhere yet — it only feeds chats you attach it to.")).toHaveCount(0);

  const before = trpc.count("databank.listAttachments");
  await workspace.getByRole("button", { name: "Retry" }).click();
  await expect.poll(() => trpc.count("databank.listAttachments"), { intervals: [20, 50, 100] }).toBe(before + 1);
});
