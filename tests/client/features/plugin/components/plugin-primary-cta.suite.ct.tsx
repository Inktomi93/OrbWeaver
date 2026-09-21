// CT: the PER-ANCHOR `primary` CTA arbitration (#818, the owner ruling that closed stickler F3). The
// vocabulary now SPELLS `variant: "primary"` at every anchor and the renderer decides who gets it, so the law
// is only real in a browser: it is about which button carries the house primary weight on screen.
//
// WHAT ONLY A REAL MOUNT CAN PROVE, and what this file owns:
//   1. THE GRANT — a `page`-anchored surface's first `primary` button renders as the house primary CTA. The
//      anchor is `data-cta` on the sealed `Button` (`button.tsx:61` — the attribute the gradient accent ring
//      keys off), so this is the rendered weight, not the spec's claim.
//   2. THE ONE-PER-ANCHOR REFUSAL — a SECOND `primary` in the same surface renders at the neutral weight and
//      the plugin's author is told, in the browser console, which button was demoted and why. The console
//      line is the whole refusal channel (never a throw, never a toast: nothing is broken for the person).
//   3. THE BAND KEEPS THE CLAMP — the same spec at `chat-settings-section` grants NOBODY. The S1 one-primary
//      law was minted for the chat control band; the ruling changed its INPUT (a page owns its own attention
//      budget), not its text, so this arm is what proves the old law still holds where it was minted.
//   4. THE DIALOG grants too — the second admitting anchor, through its own real mount (the house modal body).
//
// The pixel this closes: `atlas-detail-populated.png`, where "Add to library" and "Back to results"
// carried near-equal visual weight. (The stickler report calls that CTA "Summon to your library" — the
// label was renamed before this lane; "Add to library" is what the card-atlas seed registers today.)

import type { PluginId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import { HOST_BAND, openContextSections } from "../../../../support/node/open-context-sections.ts";
import { REGEX_READS_EMPTY } from "../../../../support/node/regex-reads-empty.ts";
import { routeTrpc } from "../../../../support/node/route-trpc.ts";
import { userSettingsView } from "../../../../support/node/user-settings-view.ts";
import { ExtensionsPageStory, PluginChatSettingsSectionStory, PluginDialogBodyStory } from "../_ct-stories.tsx";

const A_PAST_INSTANT = 1_760_000_000_000;
const ATLAS_ID = castId<PluginId>("plugin_ct_affinity000001");
const DIALOG_ID = castId<PluginId>("plugin_ct_dialog00000001");
const PLUGIN_NAME = "Card Atlas";
const USER_VIEWER = { userId: "user_ct_plugin", handle: "plugin_user", globalRole: "user" };

/** One installed row as `plugin.list` projects it — the join the attribution shell reads its name from. */
function pluginRow(id: PluginId, name: string): Record<string, unknown> {
  return {
    id,
    slug: "card-atlas",
    name,
    version: "1.0.0",
    status: "enabled",
    origin: "upload",
    declaredCapabilities: ["ui.surface"],
    grantedCapabilities: ["ui.surface"],
    netHosts: null,
    reconsentPending: false,
    widenedNetHosts: [],
    builtAgainst: null,
    lastError: null,
    installedAt: A_PAST_INSTANT,
    updatedAt: A_PAST_INSTANT,
  };
}

/** One static `listSurfaces` row (the serializable meta + pluginId; the `onAction` handle stays server-side). */
function surfaceRow(row: { pluginId: PluginId; anchor: string; id: string; title: string; spec: unknown }): Record<string, unknown> {
  return { pluginId: row.pluginId, id: row.id, anchor: row.anchor, title: row.title, tier: "static", spec: row.spec };
}

/** The card-atlas detail stage, verbatim in shape (stickler F3): the decision CTA, the way back, and — the
 *  thing the ruling had to bound — a SECOND button that also claims the primary weight. */
const DETAIL_SPEC = {
  kind: "stack",
  gap: "block",
  children: [
    { kind: "text", value: "Aria, the Cartographer" },
    { kind: "button", actionId: "add_to_library", label: "Add to library", variant: "primary" },
    { kind: "button", actionId: "back", label: "Back to results", variant: "neutral" },
    { kind: "button", actionId: "add_alt", label: "Add a second copy", variant: "primary" },
  ],
};

/** Every `console.warn` the page emitted, in order. Registered BEFORE the mount — a listener attached after
 *  the surface has painted would miss the refusal, which fires in the renderer's first committed effect. */
function warnings(page: Page): string[] {
  const lines: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "warning") {
      lines.push(message.text());
    }
  });
  return lines;
}

/** The reads every plugin surface mount makes, whatever anchor it hangs at. */
const SURFACE_ROUTES: Readonly<Record<string, unknown>> = {
  "plugin.getSurfaceState": () => null,
  "plugin.getLog": () => [],
  "assets.resolveBlobRefs": () => [],
  "sessions.me": () => USER_VIEWER,
};

/** The "This chat" tab's own sections all suspend on reads of their own; a section left unfed renders its
 *  error arm and the composition contract silently stops being covered (#629). The proven feed, copied from
 *  chat-anchors.ct.tsx rather than re-derived. */
const TAB_ROUTES: Readonly<Record<string, unknown>> = {
  "chat.getGroupConfig": () => ({ toolRecurseLimit: 7, participants: [] }),
  "chat.setRoomOverrides": () => ({}),
  "databank.listActiveForChat": () => [],
  "worldInfo.listForChat": () => [],
  "chat.listChatInjections": () => [],
  "chat.getUserMacroPicks": () => ({ macros: [], values: {} }),
  "chat.getVariablePicks": () => ({ variables: [], values: {} }),
  "settings.getUserSettings": () => userSettingsView({ seeds: { defaultPresetId: null } }),
  "chat.getChat": () => ({ id: "chat_ct", viewerIsHost: true, toolRecurseLimit: 7, hostDisplayScripts: false, roomOverrides: {}, participants: [] }),
  // The #1742 Regex section's reads (#1788). Its heading chip reads `chat.listEffectiveRegex` outside every
  // disclosure, so the read fires on any mount that reaches this tab and an unfed one takes the tab's error
  // arm — which is what hid the CHAT BAND arm of the one-primary law below. Off-and-empty: this suite counts
  // CTA weights inside the host band and a populated feed would add rows to it.
  ...REGEX_READS_EMPTY,
};

test("PAGE: the first `primary` renders as the house CTA — and the SECOND is demoted, with the author told why", async ({ mount, page }) => {
  const warned = warnings(page);
  await routeTrpc(page, {
    ...SURFACE_ROUTES,
    "plugin.list": () => [pluginRow(ATLAS_ID, PLUGIN_NAME)],
    "plugin.listSurfaces": () => [surfaceRow({ pluginId: ATLAS_ID, anchor: "page", id: "atlas_detail", title: "Browse cards", spec: DETAIL_SPEC })],
  });
  await mount(<ExtensionsPageStory selectKey={{ pluginId: ATLAS_ID, surfaceId: "atlas_detail" }} />);

  const cta = page.getByRole("button", { name: "Add to library" });
  const back = page.getByRole("button", { name: "Back to results" });
  const second = page.getByRole("button", { name: "Add a second copy" });
  await expect(cta).toBeVisible();

  // THE GRANT, read off the rendered button rather than off the spec: `data-cta` is present ONLY at
  // `intent="primary"`, and it is what the accent ring paints from.
  await expect(cta).toHaveAttribute("data-cta", "");
  // …and it is the ONLY one. The neutral sibling never claimed it; the second claimant was refused.
  await expect(back).not.toHaveAttribute("data-cta", "");
  await expect(second).toBeVisible();
  await expect(second).not.toHaveAttribute("data-cta", "");

  // THE PIXELS, not just the attribute (`done ≠ rendered`): the granted CTA's fill must actually differ
  // from both demoted siblings', and the two demoted ones must match EACH OTHER — which is exactly the F3
  // defect stated as a measurement (before the ruling, all three painted the same secondary fill). Read as
  // opaque strings, never parsed: the house paints in `oklch`, and a colour regex would find nothing.
  const fill = async (target: typeof cta): Promise<string> => await target.evaluate((node) => getComputedStyle(node).backgroundColor);
  const [ctaFill, backFill, secondFill] = [await fill(cta), await fill(back), await fill(second)];
  expect(ctaFill).not.toBe(backFill);
  expect(ctaFill).not.toBe(secondFill);
  // The demoted claimant is pixel-identical to the plain neutral sibling — a refusal, not a middle weight.
  expect(secondFill).toBe(backFill);

  // THE REFUSAL CHANNEL: a console line naming the demoted button and the anchor. Not a throw and not a
  // toast — the button still works, it is only weighted, so the person is not interrupted.
  await expect.poll(() => warned.filter((line) => line.includes("primary refused"))).toHaveLength(1);
  const refusal = warned.find((line) => line.includes("primary refused")) ?? "";
  expect(refusal).toContain("Add a second copy");
  expect(refusal).toContain("anchor page");
  // The GRANTED button is never named as refused — the line reports the demotion, not the whole claim set.
  expect(refusal).not.toContain("Add to library");
});

test("CHAT BAND: the same spec grants NOBODY — the S1 one-primary law still holds where it was minted", async ({ mount, page }) => {
  const warned = warnings(page);
  await routeTrpc(page, {
    ...TAB_ROUTES,
    ...SURFACE_ROUTES,
    "plugin.list": () => [pluginRow(ATLAS_ID, PLUGIN_NAME)],
    "plugin.listSurfaces": () => [
      surfaceRow({ pluginId: ATLAS_ID, anchor: "chat-settings-section", id: "atlas_room", title: "Room cards", spec: DETAIL_SPEC }),
    ],
  });
  const component = await mount(<PluginChatSettingsSectionStory />);

  // #830 — the host band and the grafted plugin section are both disclosures; two presses is the host's real
  // path to a plugin panel.
  await openContextSections(component, HOST_BAND, "Plugin panels");
  const cta = component.getByRole("button", { name: "Add to library" });
  await expect(cta).toBeVisible();

  // The band's attention budget is the HOST's. Both claimants render at the neutral weight.
  await expect(cta).not.toHaveAttribute("data-cta", "");
  await expect(component.getByRole("button", { name: "Add a second copy" })).not.toHaveAttribute("data-cta", "");
  await expect.poll(() => warned.filter((line) => line.includes("primary refused"))).toHaveLength(1);
  const refusal = warned.find((line) => line.includes("primary refused")) ?? "";
  // BOTH are named here (the anchor refuses every claimant, not just the surplus one) — the difference from
  // the page arm is the whole ruling, and this is where it is legible.
  expect(refusal).toContain("Add to library");
  expect(refusal).toContain("Add a second copy");
  expect(refusal).toContain("anchor chat-settings-section");
});

test("DIALOG: the second admitting anchor grants its one primary inside the house modal body", async ({ mount, page }) => {
  const warned = warnings(page);
  await routeTrpc(page, {
    ...SURFACE_ROUTES,
    "plugin.list": () => [pluginRow(DIALOG_ID, "Chess")],
    "plugin.listSurfaces": () => [
      surfaceRow({
        pluginId: DIALOG_ID,
        anchor: "dialog",
        id: "board",
        title: "Chess board",
        spec: {
          kind: "stack",
          children: [
            { kind: "button", actionId: "resign", label: "Resign the game", variant: "neutral" },
            { kind: "button", actionId: "play", label: "Play this move", variant: "primary" },
          ],
        },
      }),
    ],
  });
  await mount(<PluginDialogBodyStory />);

  // Document order decides, never spec order-of-weight: the primary here is the SECOND child, so a renderer
  // that granted "the first button" rather than "the first CLAIMANT" would fail this arm.
  await expect(page.getByRole("button", { name: "Play this move" })).toHaveAttribute("data-cta", "");
  await expect(page.getByRole("button", { name: "Resign the game" })).not.toHaveAttribute("data-cta", "");
  expect(warned.filter((line) => line.includes("primary refused"))).toHaveLength(0);
});
