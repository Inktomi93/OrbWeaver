// CT: the group cast bar (chat-cast-bar.tsx, task #29). Drives the production path over the stubbed
// network (routeTrpc) — `chat.getChat` supplies the roster. Proves the D16 size-gate (a solo roster of
// ≤1 character renders NO bar) and the multi-member render (a chip per character; a muted member's chip
// is marked/dimmed). Read-only surface — no mutations here (those live in the Roster tab + composer).
//
// The roster stub returns only what the bar reads (`participants` with kind/characterId/displayName/
// disabled) — a partial `ChatDetail`, the same posture as chat-context-panel-surface.ct's stub.

import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc } from "../../../../support/ct/route-trpc";
import { ChatCastBarStory } from "../_ct-stories";

/** A character seat — only the fields the cast bar reads; the rest is filler the bar ignores. */
function character(key: string, name: string, over: Record<string, unknown> = {}): unknown {
  return {
    id: `chat_participant_${key}`,
    kind: "character",
    userId: null,
    characterId: `character_${key}`,
    role: "member",
    displayName: name,
    disabled: false,
    talkativeness: 0.5,
    ...over,
  };
}

function roster(...members: unknown[]): unknown {
  return { participants: members };
}

test("a solo roster (1 character) renders NO cast bar (the D16 size-gate)", async ({
  mount,
  page,
}) => {
  await routeTrpc(page, { "chat.getChat": () => roster(character("aria", "Aria")) });
  const component = await mount(<ChatCastBarStory />);
  // Give the query a beat to settle, then assert the bar never appears.
  await expect(component.getByText("Aria")).toHaveCount(0);
  await expect(component.getByTestId("chat-cast-bar")).toHaveCount(0);
});

test("a 2+ roster renders a chip per character", async ({ mount, page }) => {
  await routeTrpc(page, {
    "chat.getChat": () => roster(character("aria", "Aria"), character("bryn", "Bryn")),
  });
  const component = await mount(<ChatCastBarStory />);

  await expect(component.getByTestId("chat-cast-bar")).toBeVisible();
  await expect(component.getByText("Aria")).toBeVisible();
  await expect(component.getByText("Bryn")).toBeVisible();
});

test("a muted member's chip is marked (dimmed)", async ({ mount, page }) => {
  await routeTrpc(page, {
    "chat.getChat": () =>
      roster(character("aria", "Aria"), character("bryn", "Bryn", { disabled: true })),
  });
  const component = await mount(<ChatCastBarStory />);

  // Both chips render; exactly one carries the muted marker (Bryn).
  await expect(component.locator('[data-slot="cast-chip"]')).toHaveCount(2);
  await expect(component.locator('[data-slot="cast-chip"][data-muted]')).toHaveCount(1);
});
