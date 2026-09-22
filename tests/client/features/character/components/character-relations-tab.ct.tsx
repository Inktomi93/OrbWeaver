// CT: the characters CONTEXT Relations tab — its READ ARMS (#1500).
//
// THE DEFECT: all four reads were consumed as `?? []` with no error check anywhere in the file, so a failed
// `worldInfo.listForCharacter` said "No world books linked." about a character that may have five, and a
// failed `worldInfo.listBooks` said "Every book is already linked." about a library the pane never read.
//
// A RELATION SECTION IS ATOMIC, which is why one arm covers both reads: the list IS the section's answer and
// the catalogue is what its picker offers, so with either unknown every affordance in it states something
// false. The retry re-reads both, and the pin proves it by scripting a fail-then-succeed on each in turn.

import { expect, test } from "@playwright/experimental-ct-react";
import type { TrpcWireOutput } from "../../../../support/node/route-trpc.ts";
import { routeTrpc, trpcError } from "../../../../support/node/route-trpc.ts";
import { CharacterRelationsTabStory } from "../_ct-stories.tsx";

const BOOK: TrpcWireOutput<"worldInfo.listForCharacter">[number] = {
  id: "world_book_relations001",
  name: "The Ninefold Reach",
  description: null,
  createdAt: 1,
  role: "auxiliary",
};
const BOOK_CATALOGUE: TrpcWireOutput<"worldInfo.listBooks">[number] = {
  id: BOOK.id,
  name: BOOK.name,
  description: BOOK.description,
  createdAt: BOOK.createdAt,
};
const PERSONA: TrpcWireOutput<"persona.list">[number] = {
  id: "persona_00000000000000000001",
  name: "Nate",
  title: null,
  description: "",
  starred: false,
  avatarAssetId: null,
  avatarHash: null,
  metadata: null,
  createdAt: 1,
  updatedAt: 1,
};

test("a FAILED linked-books read never says 'No world books linked', and its Retry re-reads BOTH (#1500)", async ({ mount, page }) => {
  let attempts = 0;
  const trpc = await routeTrpc(page, {
    "worldInfo.listForCharacter": () => (attempts++ === 0 ? trpcError({ message: "linked books read failed" }) : [BOOK]),
    "worldInfo.listBooks": () => [BOOK_CATALOGUE],
    "persona.listConnectedToCharacter": () => [PERSONA],
    "persona.list": () => [PERSONA],
  });
  const tab = await mount(<CharacterRelationsTabStory />);

  await expect(tab.getByText("Couldn't load this character's linked world books.")).toBeVisible();
  await expect(tab.getByText("No world books linked.")).toHaveCount(0);
  // The sibling section read fine and is unaffected — the failure is scoped to the section that had one.
  await expect(tab.getByRole("heading", { name: "Connected personas" })).toBeVisible();

  await tab.getByRole("button", { name: "Retry" }).click();
  await expect.poll(() => trpc.count("worldInfo.listForCharacter"), { intervals: [20, 50, 100] }).toBe(2);
  await expect.poll(() => trpc.count("worldInfo.listBooks"), { intervals: [20, 50, 100] }).toBe(2);
  await expect(tab.getByText(BOOK.name)).toBeVisible();
});

test("a FAILED CATALOGUE read fails the section too — the picker must not claim everything is linked (#1500)", async ({ mount, page }) => {
  await routeTrpc(page, {
    "worldInfo.listForCharacter": () => [],
    "worldInfo.listBooks": () => trpcError({ message: "book catalogue read failed" }),
    "persona.listConnectedToCharacter": () => [PERSONA],
    "persona.list": () => [PERSONA],
  });
  const tab = await mount(<CharacterRelationsTabStory />);

  await expect(tab.getByText("Couldn't load this character's linked world books.")).toBeVisible();
  // Neither half of the lie survives: not the empty list, and not the picker's "nothing left to add".
  await expect(tab.getByText("No world books linked.")).toHaveCount(0);
  await expect(tab.getByRole("button", { name: "Link a book" })).toHaveCount(0);
});
