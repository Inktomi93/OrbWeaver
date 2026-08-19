// CT: the Databank CONTEXT arm — the activation panel. What it pins (databank-surface-spec §6):
//
//   · with nothing open it renders the SECTION's own no-selection copy, not the generic "Details / select
//     something" filler the F-12 sweep deleted. A `single` context body is mounted unconditionally by the
//     shell and handed no result, so this arm is the body's own to render;
//   · it owns the OWNER-scoped `Everywhere` write (per-chat attach is HOST authority and lives in the chat
//     panel — the write lives where the authority lives);
//   · it states WHERE the document is active, as counts rather than a roster of other people's rooms.

import { expect, test } from "@playwright/experimental-ct-react";
import { DatabankContextStory, DatabankWorkspaceStory } from "../_ct-stories.tsx";
import { READY_DOC, stubDatabank } from "../fixtures.ts";

/** The row body opens a document — matched loosely because the row's accessible name carries its scent
 *  line as well as its title (top-level so the pattern is compiled once). */
const CRIMSON_ROW = /The Crimson Court/;

/** The downgraded promise, and the roster promise it replaced (top-level — compiled once, `useTopLevelRegex`). */
const COUNT_PROMISE = /how many chats and characters it reaches/u;
const ROSTER_PROMISE = /which chats and characters it already feeds/u;

test("CONTEXT with nothing open says what the pane WILL show (its own words, F-12)", async ({ mount, page }) => {
  await stubDatabank(page);
  const context = await mount(<DatabankContextStory />);

  await expect(context.getByText("Where a document fires")).toBeVisible();
  // The generic filler the F-12 sweep deleted must not come back.
  await expect(context.getByText("Select something to see its details here.")).toHaveCount(0);
});

// THE PROMISE MATCHES THE PAYMENT (side-eye 2026-08-19 P1). The no-selection copy offered to show "WHICH
// chats and characters it already feeds" over a pane that renders two count Badges and no names — a promise
// of a roster paid in integers, which reads as a broken pane rather than as the count it does offer. The
// roster is not refused, it is unbuilt: `databank.listAttachments` returns ids and no names, and naming
// ROOMS needs chat's leak-safe `resolveVisibleRooms` (an ex-host's `chat_documents` row outlives their
// seat, D18). So the sentence states the count. This pins the pairing dead from BOTH ends — the promise
// word is gone AND the counts still render — so a future edit cannot restore half of it silently.
test("the CONTEXT promise is a COUNT, never a roster it cannot pay (P1)", async ({ mount, page }) => {
  await stubDatabank(page);
  const context = await mount(<DatabankContextStory />);

  await expect(context.getByText(COUNT_PROMISE)).toBeVisible();
  await expect(context.getByText(ROSTER_PROMISE)).toHaveCount(0);
});

test("the activation body owns the Everywhere write and states where the document is active", async ({ mount, page }) => {
  const trpc = await stubDatabank(page);
  const workspace = await mount(<DatabankWorkspaceStory />);
  await workspace.getByRole("button", { name: CRIMSON_ROW }).first().click();
  await expect(workspace.getByRole("heading", { name: "The Crimson Court" })).toBeVisible();

  const toggle = workspace.getByRole("switch", { name: "Stop feeding The Crimson Court to every chat" });
  await expect(toggle).toBeVisible();
  await expect(workspace.getByText("Every chat", { exact: true })).toBeVisible();
  await expect(workspace.getByText("1 chat", { exact: true })).toBeVisible();

  await toggle.click();
  await expect.poll(() => trpc.lastInput("databank.detachGlobal"), { intervals: [20, 50, 100] }).toEqual({ documentId: READY_DOC.id });
});

// THE RETRIEVAL POINTER IS A DOOR (side-eye 2026-08-19 P2). It used to spell "Settings → Chat behavior →
// Databank" in prose, beside an `openSettingsTo` seam that lands on that exact subcategory — a navigation
// the product knew how to perform, printed as instructions for the user to perform by hand. Asserted at the
// STORE ACTION (the story's probe), because this story mounts no settings shell: a rendered echo would be
// asserting the harness, and the deep link's whole payload is the category + subcategory it targets.
test("the Retrieval pointer OPENS the settings it names (P2)", async ({ mount, page }) => {
  await stubDatabank(page);
  const workspace = await mount(<DatabankWorkspaceStory />);
  const probe = workspace.getByRole("status");
  // The three blocks only exist with a document OPEN (the no-selection arm is the section's own empty).
  await workspace.getByRole("button", { name: CRIMSON_ROW }).first().click();
  await expect(workspace.getByRole("heading", { name: "The Crimson Court" })).toBeVisible();

  await expect(probe).toContainText("modal=none");
  await workspace.getByRole("button", { name: "Retrieval settings" }).click();

  await expect(probe).toContainText("modal=settings");
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

  const measured = await page.evaluate(() =>
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
  );

  expect(measured).toEqual([
    { name: "Everywhere", transform: "uppercase", separators: 1 },
    { name: "Active in", transform: "uppercase", separators: 1 },
    { name: "Retrieval", transform: "uppercase", separators: 1 },
  ]);
});
