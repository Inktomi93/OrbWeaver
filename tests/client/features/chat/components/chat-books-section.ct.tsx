// CT: the per-chat WORLD BOOKS rack (chat-books-section.tsx, #640) at the REAL 320px context-panel floor.
//
// SPLIT OF DUTY: the tab's own `settings-context-tab.ct.tsx` owns the BEHAVIOR pins (the section's order
// after Documents, the write-reach copy, the attach/detach payloads, the member permission-OMIT) because
// that tab IS the production mount. This file owns what the 380px tab story structurally cannot see —
// the row geometry at the pane floor, where a `shrink-0` trailing cluster sized in a wider context is this
// repo's most common rendered defect.

import { rowActionsName } from "@orb/client/lib";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import type { TrpcWireOutput } from "../../../../support/node/route-trpc.ts";
import { routeTrpc } from "../../../../support/node/route-trpc.ts";
import { ChatBooksSectionStory } from "../_ct-stories.tsx";

// A long name and a long description: the squeeze case. The title is the datum that must take the squeeze
// (truncate) while the kebab keeps its full control width — a name that fits proves nothing.
const ROOM_BOOKS = [
  {
    id: "worldbook_ct_0000000000001",
    name: "The Ashfall Canon — Houses, Oaths and the Long Winter",
    description: "Everything the table has agreed on so far",
    createdAt: 1_700_000_000_000,
    role: null,
  },
  { id: "worldbook_ct_0000000000002", name: "Session Notes", description: null, createdAt: 1_700_000_000_001, role: null },
] as const;

function stubRack(page: Page, books: TrpcWireOutput<"worldInfo.listForChat"> = ROOM_BOOKS): Promise<unknown> {
  return routeTrpc(page, {
    "worldInfo.listForChat": () => books,
    "worldInfo.listBooks": () => [],
    "worldInfo.detachFromChat": () => ({ detached: true }),
  });
}

test("320px: every row's kebab lands at the SAME x, and nothing overflows the pane", async ({ mount, page }) => {
  await stubRack(page);
  const component = await mount(<ChatBooksSectionStory isHost={true} />);

  const long = component.getByRole("button", { name: rowActionsName("The Ashfall Canon — Houses, Oaths and the Long Winter") });
  const short = component.getByRole("button", { name: rowActionsName("Session Notes") });
  await expect(long).toBeVisible();
  await expect(short).toBeVisible();

  // Polled to a SETTLED layout — a same-tick box read samples whatever the first frame had.
  const boxOf = async (name: string): Promise<{ readonly x: number; readonly right: number }> => {
    const box = await component.getByRole("button", { name }).boundingBox();
    return { x: box?.x ?? -1, right: (box?.x ?? -1) + (box?.width ?? 0) };
  };
  const target = await boxOf(rowActionsName("Session Notes"));
  await expect
    .poll(() => boxOf(rowActionsName("The Ashfall Canon — Houses, Oaths and the Long Winter")).then((b) => b.x), { intervals: [20, 50, 100, 200] })
    .toBe(target.x);

  // …and the cluster is INSIDE the 320px pane, not pushed past its right edge by the long title.
  const pane = await component.locator("div").first().boundingBox();
  expect(target.right).toBeLessThanOrEqual((pane?.x ?? 0) + (pane?.width ?? 0));
});

test("320px empty (member): the copy says who can change it, since a member cannot attach", async ({ mount, page }) => {
  await stubRack(page, []);
  const component = await mount(<ChatBooksSectionStory isHost={false} />);
  await expect(component.getByText("the host attaches the ones this room carries", { exact: false })).toBeVisible();
  await expect(component.getByRole("button", { name: "Attach a world book" })).toHaveCount(0);
});

test("inherited sources precede attached books, remain read-only, and can still be attached to the room", async ({ mount, page }) => {
  const inherited: TrpcWireOutput<"worldInfo.listForChat"> = [
    { ...ROOM_BOOKS[0], name: "Global history", inherited: { source: "global", name: null } },
    { ...ROOM_BOOKS[0], id: "worldbook_ct_0000000000003", name: "Character history", inherited: { source: "character", name: "Aveline" } },
    { ...ROOM_BOOKS[0], id: "worldbook_ct_0000000000004", name: "Persona history", inherited: { source: "persona", name: "Nate" } },
  ];
  await routeTrpc(page, {
    "worldInfo.listForChat": () => [...inherited, ROOM_BOOKS[1]],
    "worldInfo.listBooks": () => [{ id: ROOM_BOOKS[0].id, name: "Global history", description: null, createdAt: ROOM_BOOKS[0].createdAt }],
  });
  const component = await mount(<ChatBooksSectionStory isHost={true} />);
  await expect(component.getByText("Global · inherited", { exact: true })).toBeVisible();
  await expect(component.getByText("Character: Aveline · inherited", { exact: true })).toBeVisible();
  await expect(component.getByText("Persona: Nate · inherited", { exact: true })).toBeVisible();
  await expect(component.getByRole("button", { name: rowActionsName("Global history") })).toHaveCount(0);
  await expect(component.getByRole("button", { name: rowActionsName("Session Notes") })).toBeVisible();
  await expect
    .poll(() => component.locator('[data-slot="list-row-title"]').allTextContents())
    .toEqual(["Global history", "Character history", "Persona history", "Session Notes"]);
  await component.getByRole("button", { name: "Attach a world book", exact: true }).click();
  await expect(page.getByRole("button", { name: "Attach Global history to this chat" })).toBeVisible();
});
