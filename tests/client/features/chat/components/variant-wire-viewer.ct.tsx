// CT: RAWVIEW — the HOST-only per-variant wire inspector, driven through its REAL graft point (the message
// metadata row's trigger), because the two load-bearing behaviors are both at that seam, not inside the
// dialog:
//   1. THE HOST GATE. A non-host viewer must not render the trigger at all — the read is `requireHost`
//      server-side, so a visible trigger for a member would be an affordance that only ever refuses, and it
//      would advertise a plane they cannot have. This pin is the client half of the two-belt gate; the server
//      half (member ⇒ not_host, stranger ⇒ NOT_FOUND, foreign variantId ⇒ NOT_FOUND) is pinned in
//      tests/server/domain/chat/verbs/read.int.test.ts.
//   2. THE FETCH GATE. `chat.getVariantWire` returns a full assembled prompt — every member's content, the
//      room's hidden spans, every card at full fidelity. It must NOT be fetched per rendered row on mount;
//      the key is built only when the host opens the dialog (`enabled: open`). If that ever loosens, every
//      transcript render would pull the whole host plane down the wire for rows nobody asked about.
// Plus the honest-absence arms: a variant that captured nothing, and a deleted row (NOT_FOUND), each say so
// rather than rendering a blank panel.

import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc, trpcError } from "../../../../support/ct/route-trpc";
import { VariantWireStory } from "../_ct-stories";

const WIRE_PROC = "chat.getVariantWire";
const TRIGGER = "Show what this reply sent";

const WIRE_DATA = {
  variantId: "mv_ct_1",
  prompt: {
    static: "SYSTEM: you are Aria.\nCARD: Aria is a locksmith.",
    dynamic: 'STEER: raise the stakes.\n<lie character="Z" truth="he is the traitor"/>',
    sendHistory: true,
    afterHistory: [{ position: "in_chat", depth: 0, role: "system", content: "keep it terse" }],
  },
  params: { temperature: 0.7 },
  macroDraws: null,
};

test("a NON-HOST viewer gets no trigger at all — the host-only plane is never advertised", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, { [WIRE_PROC]: () => WIRE_DATA });
  const component = await mount(<VariantWireStory viewerIsHost={false} />);

  // The ordinary member-plane datum still renders — the row isn't suppressed, only the host arm is.
  await expect(component.locator('[data-slot="message-metadata-model"]')).toHaveText("qwen3-vl");
  await expect(page.getByRole("button", { name: TRIGGER })).toHaveCount(0);
  await expect.poll(() => trpc.count(WIRE_PROC)).toBe(0);
});

test("the HOST sees the trigger, but NO fetch fires until it is opened", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, { [WIRE_PROC]: () => WIRE_DATA });
  await mount(<VariantWireStory viewerIsHost={true} />);

  await expect(page.getByRole("button", { name: TRIGGER })).toBeVisible();
  // The whole point of the gate: a rendered transcript must not pull the host plane for every row.
  await expect.poll(() => trpc.count(WIRE_PROC)).toBe(0);
});

test("opening fires exactly one fetch keyed by the shown swipe's variantId and renders both prompt halves", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, { [WIRE_PROC]: () => WIRE_DATA });
  await mount(<VariantWireStory viewerIsHost={true} />);

  await page.getByRole("button", { name: TRIGGER }).click();

  await expect.poll(() => trpc.count(WIRE_PROC), { intervals: [20, 50, 100] }).toBe(1);
  // Scoped to the SELECTED variant (the shown swipe), not the slot — a swipe has its own sent prompt.
  await expect.poll(() => trpc.lastInput(WIRE_PROC)).toMatchObject({ chatId: "chat_ct_keystone", variantId: "mv_ct_1" });

  const dialog = page.locator('[data-testid="variant-wire-viewer"]');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("CARD: Aria is a locksmith.");
  await expect(dialog).toContainText("STEER: raise the stakes.");
  // The host IS entitled to the hidden plane (§3.6 — the reveal eye), so the lie's truth is correctly here.
  await expect(dialog).toContainText("he is the traitor");
  await expect(dialog).toContainText("[system @ depth 0] keep it terse");
  await expect(dialog).toContainText("temperature");
});

test("a variant that captured nothing says so — never a blank panel", async ({ mount, page }) => {
  await routeTrpc(page, { [WIRE_PROC]: () => ({ variantId: "mv_ct_1", prompt: null, params: null, macroDraws: null }) });
  await mount(<VariantWireStory viewerIsHost={true} />);

  await page.getByRole("button", { name: TRIGGER }).click();
  const dialog = page.locator('[data-testid="variant-wire-viewer"]');
  await expect(dialog).toContainText("No prompt was captured for this reply");
  // The pointer to where raw provider bytes actually live (the dev ring) — never a fake "not captured" arm
  // for columns that don't exist.
  await expect(dialog).toContainText("WIRE_CAPTURE");
});

test("a deleted row's NOT_FOUND is a typed gone-arm, not a retry spinner or a thrown boundary", async ({ mount, page }) => {
  await routeTrpc(page, { [WIRE_PROC]: () => trpcError({ code: "NOT_FOUND" }) });
  await mount(<VariantWireStory viewerIsHost={true} />);

  await page.getByRole("button", { name: TRIGGER }).click();
  await expect(page.locator('[data-testid="variant-wire-viewer"]')).toContainText("This reply is gone");
});

test("a USER row renders no trigger even for the host — an authored message never generated a prompt", async ({ mount, page }) => {
  await routeTrpc(page, { [WIRE_PROC]: () => WIRE_DATA });
  await mount(<VariantWireStory viewerIsHost={true} messageRole="user" />);
  await expect(page.getByRole("button", { name: TRIGGER })).toHaveCount(0);
});
