// CT: the plugin TOOL-CARD anchor (plugin-ui-plane #679 U3, seam 7 — closes the recorded A2-F5 gap) over the
// REAL tRPC path with a stubbed network. The subject is chat's own `MessageToolCalls` fed the door's REAL
// `toolRenderers` registry, so what is pinned is the production path: a persisted `ToolCallRecord` → the ONE
// `plugin_`-namespace claim → `plugin.listSurfaces` → the first-party labelled shell.
//
// THE OWNER'S U3 TEST, in two halves:
//   1. "the oracle-deck example's draw renders a house card" — the registered card renders inside the
//      plugin-named shell, with its `{ $state: "result.…" }` values resolved against THE CALL BEING DRAWN
//      (not a published state plane), and the generic block is gone.
//   2. "an unregistered tool still gets the generic block" — and BYTE-IDENTICALLY. The fallback is the null
//      state HERE, the opposite of the flank (§4.9): a tool call is canon, so every arm that is not "this
//      plugin registered a card for this exact tool" owes the reader the generic record, never silence.
//
// EVERY BYTE-IDENTITY PIN IS TAKEN IN A SETTLED STATE, and the settle barrier is a RENDERED one: each of
// those arms carries a SECOND record — the registered `draw` — so waiting for its card to appear proves
// `plugin.listSurfaces` has resolved. Comparing HTML before that would pass for the wrong reason (the card
// renderer had simply not decided yet), which is exactly the flash a contended machine loses.

import type { ToolCallRecord } from "@orb/contracts/chat";
import type { PluginId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "@playwright/experimental-ct-react";
import type { TrpcRoutes, TrpcWireOutput } from "../../../../support/node/route-trpc.ts";
import { routeTrpc } from "../../../../support/node/route-trpc.ts";
import { PluginToolCardStory } from "../_ct-stories.tsx";

const A_PAST_INSTANT = 1_760_000_000_000;
const ORACLE_ID = castId<PluginId>("plugin_ct_oracle0000001");
const PLUGIN_NAME = "Oracle Deck";
/** The MODEL-VISIBLE names the host mints for the seeded deck's two tools (`plugin_<slug'>_<name>`). */
const DRAW = "plugin_oracle__deck_draw";
const REVEAL = "plugin_oracle__deck_reveal";

const BLOCK = '[data-slot="tool-call-block"]';
const LIST = '[data-slot="message-tool-calls"]';

/** One installed row as `plugin.list` projects it — the join the shell's attribution line reads its name from.
 *  The wire shape is pinned by the router/domain tests, never re-typed here. */
const PLUGIN_ROW = {
  id: ORACLE_ID,
  slug: "oracle-deck",
  name: PLUGIN_NAME,
  version: "1.0.0",
  status: "enabled",
  origin: "upload",
  sourceUrl: null,
  updateSource: "showcase",
  declaredCapabilities: ["storage.kv", "tools.register", "ui.surface"],
  grantedCapabilities: ["storage.kv", "tools.register", "ui.surface"],
  netHosts: null,
  reconsentPending: false,
  widenedNetHosts: [],
  builtAgainst: null,
  lastError: null,
  installedAt: A_PAST_INSTANT,
  updatedAt: A_PAST_INSTANT,
} satisfies TrpcWireOutput<"plugin.list">[number];

/** The seeded oracle-deck's OWN card, as its `main.js` registers it: badges + the narration + the commitment
 *  row + a deck meter, every value bound into the call's result document. */
const DRAW_CARD = {
  pluginId: ORACLE_ID,
  id: "draw_card",
  anchor: "tool-card",
  title: "Draw",
  tier: "static",
  toolName: "draw",
  toolWireName: DRAW,
  spec: {
    kind: "section",
    kicker: "Oracle draw",
    children: [
      {
        kind: "row",
        gap: "field",
        children: [
          { kind: "badge", intent: "info", text: { $state: "result.countLabel" } },
          { kind: "badge", intent: "neutral", text: { $state: "result.remainingLabel" } },
        ],
      },
      { kind: "markdown", value: { $state: "result.drawn" } },
      { kind: "keyValue", rows: [{ key: "Commitment", value: { $state: "result.commitment" } }] },
      { kind: "meter", label: "Dealt", max: 22, value: { $state: "result.dealt" } },
    ],
  },
} satisfies TrpcWireOutput<"plugin.listSurfaces">[number];

const DRAW_RESULT = JSON.stringify({
  drawn: "1. **The Road**\n2. **The Mask**",
  cards: ["The Road", "The Mask"],
  commitment: "0000000042",
  dealt: 2,
  deckSize: 22,
  countLabel: "2 cards",
  remainingLabel: "20 left in the deck",
});

function record(overrides: Partial<ToolCallRecord> = {}): ToolCallRecord {
  return { toolCallId: "call_1", name: DRAW, arguments: '{"count":2}', result: DRAW_RESULT, isError: false, durationMs: 12, ...overrides };
}

/** The reveal call — a `plugin_*` tool of the SAME plugin that registered NO card. */
function revealRecord(): ToolCallRecord {
  return record({ toolCallId: "call_2", name: REVEAL, arguments: "{}", result: '"Seed: abc\\nCards dealt: 2"' });
}

/** The plugin routes both halves share. `surfaces` drives the arm. */
function pluginRoutes(
  surfaces: TrpcWireOutput<"plugin.listSurfaces">,
  plugins: TrpcWireOutput<"plugin.list"> = [PLUGIN_ROW],
): TrpcRoutes<"plugin.list" | "plugin.listSurfaces"> {
  return { "plugin.list": () => plugins, "plugin.listSurfaces": () => surfaces };
}

test("a REGISTERED plugin tool renders its card inside the plugin-labelled shell, bound to THIS call", async ({ mount, page }) => {
  await routeTrpc(page, pluginRoutes([DRAW_CARD]));
  const component = await mount(<PluginToolCardStory records={[record()]} />);

  // The impersonation wall (§4.8): the surface body is a group region whose accessible name names the PLUGIN.
  // A card that drew itself without attribution would satisfy every value assertion below.
  const shell = component.getByRole("group", { name: `${PLUGIN_NAME} — Draw` });
  await expect(shell).toBeVisible();
  await expect(component).toContainText("Oracle draw");

  // …and the values are THIS call's result document, resolved through the `$state` bindings — not the
  // plugin's published state plane (a tool card publishes none, and an old draw must keep its own cards).
  await expect(shell).toContainText("2 cards");
  await expect(shell).toContainText("20 left in the deck");
  await expect(shell).toContainText("0000000042");
  await expect(shell.getByText("The Road")).toBeVisible();
  // The meter is a real house control carrying the dealt count, not a badge with a number in it.
  await expect(shell.getByRole("meter")).toHaveAttribute("aria-valuenow", "2");

  // The card OWNS the record: the generic block is gone for this call.
  await expect(component.locator(BLOCK)).toHaveCount(0);
});

test("an UNREGISTERED plugin_* tool keeps the generic block — byte-identically to a build with no plugin renderer", async ({ mount, page }) => {
  // The plugin IS installed, enabled and has a card — for its OTHER tool. This is the arm the seeded deck
  // ships (`reveal` registers no card) and the one a stale linkage degrades into.
  await routeTrpc(page, pluginRoutes([DRAW_CARD]));
  const withPlugin = await mount(<PluginToolCardStory records={[record(), revealRecord()]} />);
  // SETTLE ON A RENDERED STATE: the sibling `draw` card is what proves `listSurfaces` resolved. Reading the
  // reveal block before that would compare an undecided render.
  await expect(withPlugin.getByRole("group", { name: `${PLUGIN_NAME} — Draw` })).toBeVisible();
  await expect(withPlugin.locator(BLOCK)).toHaveCount(1);
  const claimed = await withPlugin
    .locator(BLOCK)
    .first()
    .evaluate((el) => el.outerHTML);
  await withPlugin.unmount();

  // BASELINE: the same two records through a build with NO plugin contribution at the door.
  const bare = await mount(<PluginToolCardStory records={[record(), revealRecord()]} registered={false} />);
  await expect(bare.locator(BLOCK)).toHaveCount(2);
  const baseline = await bare
    .locator(BLOCK)
    .nth(1)
    .evaluate((el) => el.outerHTML);

  // Both operands were captured after their own settled barrier (the card visible / the block count), and
  // both mounts are already gone.
  // @orb-waive ct-no-oneshot-live-read-assert(expect): comparing two captured strings — no DOM read remains that could re-sample.
  expect(claimed).toBe(baseline);
  // @orb-waive ct-no-oneshot-live-read-assert(expect): a re-read of that captured string — non-vacuity (an empty string on both sides would satisfy the equality while the block was missing).
  expect(baseline).toContain(REVEAL);
});

test("a NON-plugin tool name is untouched by the contribution — byte-identical, and never even looked at", async ({ mount, page }) => {
  await routeTrpc(page, pluginRoutes([DRAW_CARD]));
  const dice = record({ toolCallId: "call_3", name: "roll_check", arguments: '{"sides":20}', result: '{"roll":17}' });

  const withPlugin = await mount(<PluginToolCardStory records={[record(), dice]} />);
  await expect(withPlugin.getByRole("group", { name: `${PLUGIN_NAME} — Draw` })).toBeVisible();
  await expect(withPlugin.locator(BLOCK)).toHaveCount(1);
  const claimed = await withPlugin
    .locator(BLOCK)
    .first()
    .evaluate((el) => el.outerHTML);
  await withPlugin.unmount();

  const bare = await mount(<PluginToolCardStory records={[record(), dice]} registered={false} />);
  await expect(bare.locator(BLOCK)).toHaveCount(2);
  const baseline = await bare
    .locator(BLOCK)
    .nth(1)
    .evaluate((el) => el.outerHTML);

  // @orb-waive ct-no-oneshot-live-read-assert(expect): captured strings, taken after the settled barriers above; both mounts are already gone.
  expect(claimed).toBe(baseline);
  // @orb-waive ct-no-oneshot-live-read-assert(expect): a re-read of that captured string — non-vacuity, not a DOM read.
  expect(baseline).toContain("roll_check");
});

test("a plugin whose NAME has not resolved renders the generic block, never an unlabelled card (§4.8)", async ({ mount, page }) => {
  // `listSurfaces` and `plugin.list` are two different reads. A card drawn while the attribution line is
  // unknown would be a plugin surface with no author on it — the one thing the shell exists to prevent.
  await routeTrpc(page, pluginRoutes([DRAW_CARD], []));
  const component = await mount(<PluginToolCardStory records={[record()]} />);
  await expect(component.locator(BLOCK)).toHaveCount(1);
  await expect(component.locator(LIST)).toContainText(DRAW);
  await expect(component.getByRole("group", { name: `${PLUGIN_NAME} — Draw` })).toHaveCount(0);
});
