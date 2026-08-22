// CT: the group cast bar (chat-cast-bar.tsx, task #29). Drives the production path over the stubbed
// network (routeTrpc) — `chat.getChat` supplies the roster. Proves the D16 size-gate (a solo roster of
// ≤1 character renders NO bar) and the multi-member render (a chip per character; a muted member's chip
// is marked/dimmed). Read-only surface — no mutations here (those live in the Roster tab + composer).
//
// The roster stub returns only what the bar reads (`participants` with kind/characterId/displayName/
// disabled) — a partial `ChatDetail`, the same posture as chats-section.ct's stub.

import type { ParticipantRole } from "@orb/contracts/identity";
import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc } from "../../../../support/ct/route-trpc.ts";
import { ChatCastBarStory } from "../_ct-stories.tsx";

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

/** A human seat — `role` seats a host/member; the bar's add-member gate is the separate server-resolved
 *  `viewerIsHost` field, NOT this seat's role (a member behind a host seat must not see the "+"). */
function human(role: ParticipantRole): unknown {
  return {
    id: `participant_${role}`,
    kind: "human",
    role,
    userId: `user_${role}`,
    characterId: null,
  };
}

/** A committed `ChatDetail` stub carrying the server-resolved host gate + a 2-character cast (so the bar
 *  renders past the D16 size-gate). A host FIRST human seat trips the retired first-seat proxy. */
function castWithHost(viewerIsHost: boolean): unknown {
  return {
    participants: [human("host"), human("member"), character("aria", "Aria"), character("bryn", "Bryn")],
    viewerIsHost,
  };
}

test("a solo roster (1 character) renders NO cast bar (the D16 size-gate)", async ({ mount, page }) => {
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
  await expect(component.getByRole("group", { name: "Cast" })).toBeVisible();
  await expect(component.getByText("Aria")).toBeVisible();
  await expect(component.getByText("Bryn")).toBeVisible();
});

test("a muted member's chip is marked (dimmed)", async ({ mount, page }) => {
  await routeTrpc(page, {
    "chat.getChat": () => roster(character("aria", "Aria"), character("bryn", "Bryn", { disabled: true })),
  });
  const component = await mount(<ChatCastBarStory />);

  // Both chips render; exactly one carries the muted marker (Bryn).
  await expect(component.locator('[data-slot="cast-chip"]')).toHaveCount(2);
  await expect(component.locator('[data-slot="cast-chip"][data-muted]')).toHaveCount(1);
});

// ── #490: THE STRIP CARRIES NO MUTATION AT ALL, HOST OR NOT ───────────────────────────────────────
// INVERTED, deliberately. The two cases here used to be "a member sees NO '+'" / "a host sees the '+'" —
// a host-gate pin on a door that should never have been on this strip: it made "add a character" a
// SIMULTANEOUSLY VISIBLE second door beside the CONTEXT panel's CAST header (`design-audit`
// `duplicate-action-door`, side-eye 2026-08-22), and this component's own header declares it
// "presence-at-a-glance only, no mutations". The host GATE is not what moved — the door's ONE home is
// `committed-members-tab.tsx`, where `members-panel.ct.tsx` pins exactly this host/member pair. Half a
// migration is the rot, so the old pins are re-aimed rather than left asserting a door that is gone.
test("#490 neither a host nor a member gets an add-member door on the strip (its ONE home is CONTEXT)", async ({ mount, page }) => {
  await routeTrpc(page, { "chat.getChat": () => castWithHost(false) });
  const asMember = await mount(<ChatCastBarStory />);
  await expect(asMember.getByTestId("chat-cast-bar")).toBeVisible();
  await expect(asMember.getByRole("button", { name: "Add a character" })).toHaveCount(0);
  await asMember.unmount();

  // The arm that would silently come back if someone re-mounted the popover behind the host gate.
  await routeTrpc(page, { "chat.getChat": () => castWithHost(true) });
  const asHost = await mount(<ChatCastBarStory />);
  await expect(asHost.getByTestId("chat-cast-bar")).toBeVisible();
  await expect(asHost.getByRole("button", { name: "Add a character" })).toHaveCount(0);
  // …and the strip is still the strip: it is not empty, it just does not mutate.
  await expect(asHost.locator('[data-slot="cast-chip"]')).not.toHaveCount(0);
});

// ── #229/#237: the strip's OVER-ART legibility backing ────────────────────────────────────────────
// The bar sits in `.shell-main`, which a wallpaper makes transparent (shell.css), so its chips and names
// floated on the raw photo behind only a halo text-shadow — the over-art chrome class #106/#221 closed
// for the message row's own bands, and the one rule #237 extends across the shell's chrome. The backing
// is self-gated on the shell's `data-has-bg-image`, so the plain-background arm must not move a pixel.
test("#229: over a wallpaper the strip takes the derived plate + blur; without one it is byte-identical", async ({ mount, page }) => {
  await routeTrpc(page, { "chat.getChat": () => roster(character("a", "Birdie"), character("b", "Hikari")) });
  const plain = await mount(<ChatCastBarStory />);
  const plainStrip = plain.getByTestId("chat-cast-bar");
  await expect(plainStrip).toBeVisible();
  const plainPaint = await plainStrip.evaluate((el) => {
    const s = getComputedStyle(el);
    return { backdrop: s.backdropFilter, bg: s.backgroundColor };
  });
  // No wallpaper ⇒ no plate, no blur: the strip is exactly the transparent band it always was.
  expect(plainPaint).toStrictEqual({ backdrop: "none", bg: "rgba(0, 0, 0, 0)" });
  await plain.unmount();

  const overArt = await mount(<ChatCastBarStory overArt={true} />);
  const artStrip = overArt.getByTestId("chat-cast-bar");
  await expect(artStrip).toBeVisible();
  const artPaint = await artStrip.evaluate((el) => {
    const s = getComputedStyle(el);
    return { backdrop: s.backdropFilter, bg: s.backgroundColor, plate: s.getPropertyValue("--color-reading-plate").trim() };
  });
  // The fill is the ROW'S OWN plate token — the polarity-derived backing, never a hand-picked smoke.
  expect(artPaint.plate).not.toBe("");
  expect(artPaint.bg).not.toBe("rgba(0, 0, 0, 0)");
  expect(artPaint.backdrop).toContain("blur");
});
