// CT: `<ListPaneHeader>` — the client-shared LIST chrome-band cluster (list-pane-projection §11.2/D12).
// The three landed band headers (chat · corpus · analytics) and the character screen's two modal modes all
// render through it, so the conformance the private copies each held by hand is pinned ONCE here:
//
//   · the title voice is micro-caps against the GENERATED token map (not a hardcoded px), the count is mono;
//   · the accent half (`CHATS · Azarael`) carries the foreground tone while inheriting the caps transform;
//   · a zero count renders NOTHING (a zero census is noise) while a real count renders;
//   · `back` is a real focusable button carrying its accessible name (the glyph has no text);
//   · exactly ONE action node renders (D66 A2 — one primary per pane per mode).

import { ListPaneHeader } from "@orb/client/components";
import { Button } from "@orb/ui/button";
import { TOKENS } from "@orb/ui/tokens";
import { expect, test } from "@playwright/experimental-ct-react";

const MICRO_PX = `${Number.parseFloat(TOKENS["text.micro"].value) * 16}px`;
const MICRO_TRACKING = TOKENS["tracking.micro"].value;
const MONO_STACK_RE = /mono/iu;

test("the title is the micro-caps section voice, sized off the generated token", async ({ mount }) => {
  const component = await mount(<ListPaneHeader count={12} title="Characters" />);

  const heading = component.getByRole("heading", { level: 2 });
  await expect(heading).toHaveCSS("font-size", MICRO_PX);
  await expect(heading).toHaveCSS("text-transform", "uppercase");
  await expect(heading).toHaveCSS("letter-spacing", `${Number.parseFloat(MICRO_TRACKING) * Number.parseFloat(MICRO_PX)}px`);
});

test("the count is mono and micro; a ZERO count renders nothing at all", async ({ mount, page }) => {
  const component = await mount(<ListPaneHeader count={12} title="Chats" />);
  const count = component.getByText("12", { exact: true });
  await expect(count).toHaveCSS("font-size", MICRO_PX);
  expect(await count.evaluate((el) => getComputedStyle(el).fontFamily)).toMatch(MONO_STACK_RE);

  await component.update(<ListPaneHeader count={0} title="Chats" />);
  await expect(page.getByText("0", { exact: true })).toHaveCount(0);
});

test("the accent half carries the foreground tone and inherits the caps transform", async ({ mount }) => {
  const component = await mount(<ListPaneHeader accent="Azarael" title="Chats" />);

  // The whole cluster reads as one line: "CHATS · AZARAEL".
  await expect(component.getByRole("heading", { level: 2 })).toContainText("Azarael");
  const accent = component.getByText("Azarael", { exact: true });
  await expect(accent).toHaveCSS("text-transform", "uppercase");
  // The accent stands FORWARD of the muted title — different resolved colors, not a shared muted tone.
  const [accentColor, titleColor] = await Promise.all([
    accent.evaluate((el) => getComputedStyle(el).color),
    component.getByRole("heading", { level: 2 }).evaluate((el) => getComputedStyle(el).color),
  ]);
  expect(accentColor).not.toBe(titleColor);
});

test("back is a real focusable button named by its label; absent when not supplied", async ({ mount, page }) => {
  const component = await mount(<ListPaneHeader accent="Azarael" back={{ label: "Back to all characters", onClick: (): void => undefined }} title="Chats" />);

  const back = component.getByRole("button", { name: "Back to all characters", exact: true });
  await expect(back).toBeVisible();
  await back.focus();
  await expect(back).toBeFocused();

  await component.update(<ListPaneHeader accent="Azarael" title="Chats" />);
  await expect(page.getByRole("button", { name: "Back to all characters" })).toHaveCount(0);
});

test("back fires its handler; exactly one action node renders (A2 — one primary per mode)", async ({ mount }) => {
  let backs = 0;
  const component = await mount(
    <ListPaneHeader
      action={<Button intent="primary">New chat</Button>}
      back={{
        label: "Back to all characters",
        onClick: (): void => {
          backs += 1;
        },
      }}
      title="Chats"
    />,
  );

  await expect(component.getByRole("button", { name: "New chat", exact: true })).toBeVisible();
  await component.getByRole("button", { name: "Back to all characters", exact: true }).click();
  expect(backs).toBe(1);
  // Two buttons total: back + the ONE primary. No hidden second create.
  await expect(component.getByRole("button")).toHaveCount(2);
});
