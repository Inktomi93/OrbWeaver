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
  await expect(component.getByLabel("Depth")).toBeDisabled();
  await expect(component.getByLabel("Content")).toBeDisabled();
});
