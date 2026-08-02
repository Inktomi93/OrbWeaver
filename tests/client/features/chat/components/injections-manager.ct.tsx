// CT: the manual-injections manager (injections-manager.tsx) — source-agnostic InjectionsList over the
// committed data layer (chat.listChatInjections + setChatInjection/deleteChatInjection). Proves: list
// renders from the routed fixture rows; add/edit/delete each fire the MUTATION with the right payload
// (asserted via routeTrpc's recorder — mutation count/input, never a UI reaction, per the D16-precedent
// asserted-the-mutation-fired doctrine); the isHost gating (disabled-with-reason fields for a non-host,
// never omitted — the source's `disabled={!isHost}` on every AppField + the Remove/Add buttons omitted
// for a non-host); the empty state.

import type { ChatInjection } from "@orb/contracts/chat";
import type { ChatInjectionId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "@playwright/experimental-ct-react";
import { assertTokenRoundtrip } from "../../../../support/ct/assert-token-roundtrip";
import { routeTrpc } from "../../../../support/ct/route-trpc";
import { InjectionsManagerStory } from "../_ct-stories";

// `ChatInjectionView` (the persisted row = `ChatInjection` + its id) is a SERVER-domain contract type
// (packages/server/src/domain/chat/contract/views.ts) — not importable from the client across the cake.
// The wire shape a client sees is identical; spell it locally as `ChatInjection & { id }`.
const INJECTION_ROW: ChatInjection & { readonly id: ChatInjectionId } = {
  id: castId<ChatInjectionId>("injection_ct_1"),
  position: "in_chat",
  depth: 2,
  role: "system",
  content: "The tavern is on fire.",
};

test("list renders the routed rows (position/role/depth/content)", async ({ mount, page }) => {
  await routeTrpc(page, {
    "chat.listChatInjections": () => [INJECTION_ROW],
  });

  const component = await mount(<InjectionsManagerStory />);

  await expect(component.getByText("Injection")).toBeVisible();
  // Position/Role are Base UI Select comboboxes (not plain inputs) — assert their displayed label text.
  await expect(component.getByRole("combobox", { name: "Position" })).toHaveText("In chat history (at depth)");
  await expect(component.getByRole("combobox", { name: "Role" })).toHaveText("System");
  await expect(component.getByLabel("Depth", { exact: true })).toHaveValue("2");
  await expect(component.getByLabel("Content")).toHaveValue("The tavern is on fire.");
});

// An EMPTY-content row is inert — assembly skips it at every position, so it reaches no prompt (pinned
// byte-identical in tests/server/domain/chat/assembly/assemble.test.ts). With no enabled/disabled toggle,
// a blank row looks exactly like an active one, so the row must SAY it isn't delivering. (Owner dogfood
// 2026-07-31: a live chat carried an enabled-but-empty in_chat injection he believed was in the prompt.)
test("an empty-content row is badged NOT DELIVERED, and the badge clears the moment content is typed", async ({ mount, page }) => {
  await routeTrpc(page, {
    "chat.listChatInjections": () => [{ ...INJECTION_ROW, content: "" }],
    "chat.setChatInjection": () => ({ ...INJECTION_ROW }),
  });

  const component = await mount(<InjectionsManagerStory isHost={true} />);

  await expect(component.getByText("Not delivered — no content")).toBeVisible();
  // Whitespace-only is the same nothing (assembly trims).
  await component.getByLabel("Content").fill("   ");
  await expect(component.getByText("Not delivered — no content")).toBeVisible();
  // Real content ⇒ the row IS delivering; the warning must not linger.
  await component.getByLabel("Content").fill("The tavern is on fire.");
  await expect(component.getByText("Not delivered — no content")).toHaveCount(0);
});

test("the empty state shows when there are no injections", async ({ mount, page }) => {
  await routeTrpc(page, {
    "chat.listChatInjections": () => [],
  });

  const component = await mount(<InjectionsManagerStory />);

  await expect(component.getByText("No injections yet.")).toBeVisible();
  await expect(component.getByRole("button", { name: "Add injection" })).toBeVisible();
});

test("Add injection fires setChatInjection with the shared NEW_INJECTION seed (host)", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    "chat.listChatInjections": () => [],
    "chat.setChatInjection": () => ({ ...INJECTION_ROW, id: castId<ChatInjectionId>("injection_ct_new") }),
  });

  const component = await mount(<InjectionsManagerStory isHost={true} />);

  await component.getByRole("button", { name: "Add injection" }).click();

  await expect.poll(() => trpc.count("chat.setChatInjection")).toBe(1);
  await expect
    .poll(() => trpc.lastInput("chat.setChatInjection"))
    .toMatchObject({
      position: "in_chat",
      depth: 0,
      role: "system",
      content: "",
    });
});

test("editing a field autosaves — fires setChatInjection with the id + new value (host)", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    "chat.listChatInjections": () => [INJECTION_ROW],
    "chat.setChatInjection": () => ({ ...INJECTION_ROW }),
  });

  const component = await mount(<InjectionsManagerStory isHost={true} />);

  const content = component.getByLabel("Content");
  await content.fill("The tavern burned down.");
  await content.blur();

  await expect.poll(() => trpc.count("chat.setChatInjection")).toBeGreaterThan(0);
  await expect
    .poll(() => trpc.lastInput("chat.setChatInjection"))
    .toMatchObject({
      id: "injection_ct_1",
      content: "The tavern burned down.",
    });
});

// The owner ruling MACROS NEVER RESOLVE IN WRITABLE FIELDS, on the injection body — a template field the
// assembler resolves at turn time. If this editor ever painted resolved text, the next autosave would
// overwrite the stored `{{user}}` with whoever happened to be bound (see the helper's header). The shared
// assertion lives in tests/support/ct/assert-token-roundtrip.ts precisely so no editor re-spells it.
test("a literal {{token}} typed into Content round-trips to the wire unresolved", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    "chat.listChatInjections": () => [{ ...INJECTION_ROW, content: "{{char}} watches the door." }],
    "chat.setChatInjection": () => ({ ...INJECTION_ROW }),
  });

  const component = await mount(<InjectionsManagerStory isHost={true} />);

  // The READ half of the invariant: a STORED template paints literally in the field — the editor never
  // resolves on load (which is what would make the next autosave overwrite the template with one binding).
  await expect(component.getByLabel("Content")).toHaveValue("{{char}} watches the door.");

  // The WRITE half, via the shared helper.
  await assertTokenRoundtrip({
    trpc,
    field: component.getByLabel("Content"),
    proc: "chat.setChatInjection",
    payloadKey: "content",
  });
});

test("Remove fires deleteChatInjection with the row's id (host)", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    "chat.listChatInjections": () => [INJECTION_ROW],
    "chat.deleteChatInjection": () => ({}),
  });

  const component = await mount(<InjectionsManagerStory isHost={true} />);

  await component.getByRole("button", { name: "Remove injection" }).click();

  await expect.poll(() => trpc.count("chat.deleteChatInjection")).toBe(1);
  await expect.poll(() => trpc.lastInput("chat.deleteChatInjection")).toMatchObject({ injectionId: "injection_ct_1" });
});

test("a non-host sees no Add/Remove affordances and every field is disabled-with-reason (never omitted)", async ({ mount, page }) => {
  await routeTrpc(page, {
    "chat.listChatInjections": () => [INJECTION_ROW],
  });

  const component = await mount(<InjectionsManagerStory isHost={false} />);

  // Read-only copy names the host as the actor.
  await expect(component.getByText("Ad-hoc context the host has added to this chat's prompt.")).toBeVisible();

  // Add/Remove affordances are omitted entirely for a non-host.
  await expect(component.getByRole("button", { name: "Add injection" })).toHaveCount(0);
  await expect(component.getByRole("button", { name: "Remove injection" })).toHaveCount(0);

  // Every field STAYS present, disabled — never omitted (the §8.1 host-only gating class).
  await expect(component.getByLabel("Position")).toBeDisabled();
  await expect(component.getByLabel("Role")).toBeDisabled();
  // The INPUT specifically: since side-eye F-20 the steppers take the field's name as their subject
  // ("Decrease Depth" / "Increase Depth"), so a bare `getByLabel("Depth")` now matches all three.
  await expect(component.getByRole("textbox", { name: "Depth" })).toBeDisabled();
  await expect(component.getByLabel("Content")).toBeDisabled();
});
