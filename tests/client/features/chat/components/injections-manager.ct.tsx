// CT: the manual-injections manager (injections-manager.tsx) — source-agnostic InjectionsList over the
// committed data layer (chat.listChatInjections + setChatInjection/deleteChatInjection). Proves: list
// renders from the routed fixture rows; add/edit/delete each fire the MUTATION with the right payload
// (asserted via routeTrpc's recorder — mutation count/input, never a UI reaction, per the D16-precedent
// asserted-the-mutation-fired doctrine); the isHost gating (disabled-with-reason fields for a non-host,
// never omitted — the source's `disabled={!isHost}` on every AppField + the Remove/Add buttons omitted
// for a non-host); the empty state.
//
// EVERY EDITOR ASSERTION NOW OPENS ITS ROW FIRST (#821). The rows are collapse-until-needed — a summary
// line plus a content excerpt, with the six fields behind the disclosure — because always-open they were
// ~370px each and the section's skeleton stood in for 920px of them. The pins below therefore press the
// row's disclosure before touching a field, and the collapsed face has pins of its own.

import type { ChatInjection } from "@orb/contracts/chat";
import type { ChatInjectionId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Locator } from "@playwright/test";
import { measureClamp } from "../../../../support/browser/measure-clamp.ts";
import { assertTokenRoundtrip } from "../../../../support/node/assert-token-roundtrip.ts";
import { routeTrpc } from "../../../../support/node/route-trpc.ts";
import { InjectionsManagerStory, InjectionsReserveStory } from "../_ct-stories.tsx";

/** The Nth row's disclosure. Named by the row's ORDINAL, which is the only stable name an injection has —
 *  the rest of the accessible name is its summary, so a `^Injection N` anchor survives an edit to either. */
function rowDisclosure(component: Locator, ordinal: number): Locator {
  return component.getByRole("button", { name: new RegExp(`^Injection ${ordinal}\\b`, "u") });
}

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

  await rowDisclosure(component, 1).click();
  // Position/Role are Base UI Select comboboxes (not plain inputs) — assert their displayed label text.
  await expect(component.getByRole("combobox", { name: "Position" })).toHaveText("In chat history (at depth)");
  await expect(component.getByRole("combobox", { name: "Role" })).toHaveText("System");
  await expect(component.getByLabel("Depth", { exact: true })).toHaveValue("2");
  await expect(component.getByLabel("Content")).toHaveValue("The tavern is on fire.");
});

// #821 — THE COLLAPSED FACE. A row carrying content arrives CLOSED: its editor is not in the document at
// all (Base UI removes a closed panel), and what stands in its place is the summary the host scans by —
// where the injection lands, in whose voice, at what depth — plus a one-line excerpt of the text itself.
// This is the defect proof, not a fence: against the pre-#821 source the six fields are present on arrival
// and there is no disclosure to press.
test("a row with content arrives COLLAPSED — summary + excerpt, editor absent until the disclosure is pressed", async ({ mount, page }) => {
  await routeTrpc(page, {
    "chat.listChatInjections": () => [INJECTION_ROW],
  });

  const component = await mount(<InjectionsManagerStory />);

  const disclosure = rowDisclosure(component, 1);
  await expect(disclosure).toBeVisible();
  // The EXACT accessible name: the ordinal that names the row, then the summary — position, role, depth.
  await expect(disclosure).toHaveAccessibleName("Injection 1 In chat history (at depth) · System · depth 2");
  await expect(disclosure).toHaveAttribute("aria-expanded", "false");
  // The content is legible without opening anything…
  await expect(component.getByText("The tavern is on fire.")).toBeVisible();
  // …and the editor is genuinely absent, which is what makes the row 40px instead of ~370px.
  await expect(component.getByLabel("Content")).toHaveCount(0);

  await disclosure.click();
  await expect(component.getByLabel("Content")).toHaveValue("The tavern is on fire.");
  await expect(disclosure).toHaveAttribute("aria-expanded", "true");
});

// The just-added state IS the empty state: `Add injection` seeds a blank row, and a blank row collapsed to
// "Injection 1 — not delivered" would hide the one field the host pressed Add to reach.
test("an empty-content row opens itself, so a just-added row lands on its editor", async ({ mount, page }) => {
  await routeTrpc(page, {
    "chat.listChatInjections": () => [{ ...INJECTION_ROW, content: "" }],
  });

  const component = await mount(<InjectionsManagerStory />);

  await expect(rowDisclosure(component, 1)).toHaveAttribute("aria-expanded", "true");
  await expect(component.getByLabel("Content")).toHaveValue("");
});

// The ordinal is what makes N disclosures distinguishable to a screen reader — the defect side-eye #621
// filed against N rule rows all announcing a bare "Recent activity".
test("each row's disclosure is named by its own ordinal", async ({ mount, page }) => {
  await routeTrpc(page, {
    "chat.listChatInjections": () => [
      INJECTION_ROW,
      { ...INJECTION_ROW, id: castId<ChatInjectionId>("injection_ct_2"), position: "before_prompt" as const, content: "Keep it terse." },
    ],
  });

  const component = await mount(<InjectionsManagerStory />);

  await expect(rowDisclosure(component, 1)).toHaveAccessibleName("Injection 1 In chat history (at depth) · System · depth 2");
  await expect(rowDisclosure(component, 2)).toHaveAccessibleName("Injection 2 Before system prompt · System");
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

// #847 — THE EXCERPT'S ONE-LINE CLAMP MUST END ON A LINE BOUNDARY. Shipped, the collapsed row's excerpt
// rendered an ellipsis at the end of line 1 AND a second line sliced horizontally through its own x-height:
// text damaged in two contradictory ways on the same paragraph.
//
// THE MECHANISM, RE-DERIVED (the side-eye report's `display: flow-root overrides the clamp` reading is
// WRONG, and `flow-root` is a red herring — it is simply what Chrome computes for a blockified
// `display: -webkit-box`, and the clamp IS engaged: measured `clientHeight: 25` = ONE 13.125px line plus
// the element's own ~11.9px `pb-block`). The defect is that the clamp and the PADDING sat on the same
// element: `overflow: hidden` clips at the PADDING box, so the ~11.9px of bottom padding is visible area
// BELOW the clamp point, and the clamped-away line 2 paints into it. The fix moves the block padding onto a
// wrapper, so the clamped element's own box ends exactly where its last line does.
//
// The oracle is the LINE GRID, not `scrollHeight > clientHeight` — that is the standard "is this text
// truncated?" probe, so a correctly clamped run reports true and it answers a different question entirely
// (see `measure-clamp.ts`). Long content only: a short excerpt fits on one line and cannot show the
// defect (side-eye 2026-08-30 measured exactly this — "Injection 1 does not clip").
const LONG_EXCERPT =
  "The tavern is on fire and the roof beams are coming down; get everyone out through the cellar door before the stairs go, and do not stop for the strongbox.";

test("#847: a long collapsed excerpt is clamped to WHOLE lines — no second line sliced through its x-height", async ({ mount, page }) => {
  await routeTrpc(page, {
    "chat.listChatInjections": () => [{ ...INJECTION_ROW, content: LONG_EXCERPT }],
  });

  const component = await mount(<InjectionsManagerStory />);

  const excerpt = component.getByText(LONG_EXCERPT, { exact: true });
  await expect(excerpt).toBeVisible();
  expect(await measureClamp(excerpt)).toMatchObject({ partialLinePx: 0, visibleLines: 1 });
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

  await rowDisclosure(component, 1).click();
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
// assertion lives in tests/support/node/assert-token-roundtrip.ts precisely so no editor re-spells it.
test("a literal {{token}} typed into Content round-trips to the wire unresolved", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    "chat.listChatInjections": () => [{ ...INJECTION_ROW, content: "{{char}} watches the door." }],
    "chat.setChatInjection": () => ({ ...INJECTION_ROW }),
  });

  const component = await mount(<InjectionsManagerStory isHost={true} />);

  await rowDisclosure(component, 1).click();
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

// Remove lives INSIDE the panel now (where the Field-overrides row puts Clear), so reaching it is an
// expand — an irreversible action is never one click off a collapsed scan-list.
test("Remove fires deleteChatInjection with the row's id (host)", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    "chat.listChatInjections": () => [INJECTION_ROW],
    "chat.deleteChatInjection": () => null,
  });

  const component = await mount(<InjectionsManagerStory isHost={true} />);

  await expect(component.getByRole("button", { name: "Remove injection" })).toHaveCount(0);
  await rowDisclosure(component, 1).click();
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

  // A member reads the rows too — the disclosure is not host-gated, only the writes are.
  await rowDisclosure(component, 1).click();

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

// ── #821: THE RESERVE ────────────────────────────────────────────────────────────────────────────────
// A skeleton's ONE job is that nothing moves when the data lands (UI-Arch §307). The pre-#821 fallback was
// `SkeletonRows count={1} shape="line"` — an 89px bar standing in for 920px of open editors, which is the
// 0.30837 paid shift the side-eye measured at 4× CPU on a phone. These pins measure the reserve against the
// thing it reserves for, in one settled frame, at both real context-panel widths.
//
// WHY THE TWO BOXES ARE IN ONE PAGE: comparing across two mounts compares two layout passes at whatever
// width each happened to get. The story renders the fallback and the settled section as siblings, so the
// widths are identical by construction and the numbers are directly subtractable.
const RESERVE_TOLERANCE = 0.1;
/** The two real context-panel widths: 367px docked at 1280×800, 411px at --mobile 430×932. */
const PANE_WIDTHS = [367, 411] as const;
const ROW_COUNTS = [0, 1, 2, 5] as const;

function reserveRow(index: number): ChatInjection & { readonly id: ChatInjectionId } {
  return {
    ...INJECTION_ROW,
    id: castId<ChatInjectionId>(`injection_ct_reserve_${index}`),
    content: `Row ${index}: ad-hoc context long enough to run past one line at the pane's real width.`,
  };
}

for (const width of PANE_WIDTHS) {
  for (const count of ROW_COUNTS) {
    test(`the reserved box is within 10% of the settled section — ${count} rows at ${width}px`, async ({ mount, page }) => {
      await routeTrpc(page, {
        "chat.listChatInjections": () => Array.from({ length: count }, (_row, index) => reserveRow(index)),
      });

      const component = await mount(<InjectionsReserveStory count={count} width={width} />);

      const settled = component.locator('[data-testid="injections-settled"]');
      // The settled arm is the barrier: poll it to its RESOLVED state (its own text, not the fallback's)
      // before either height is read, so neither number is taken mid-flight.
      await expect(settled.getByText(count === 0 ? "No injections yet." : "Injection 1", { exact: true })).toBeVisible();

      const heights = await page.evaluate(() => {
        const box = (id: string): number => document.querySelector(`[data-testid="${id}"]`)?.getBoundingClientRect().height ?? 0;
        return { reserved: box("injections-reserve"), settled: box("injections-settled") };
      });
      // Liveness first: a zero here is "I could not measure", which must never read as a pass.
      // @orb-waive ct-no-oneshot-live-read-assert(expect): the settled arm was polled to its resolved text before the read, so both boxes come out of ONE settled frame — which is the point (two polls would compare two layout passes).
      expect(heights.settled).toBeGreaterThan(0);
      expect(Math.abs(heights.reserved - heights.settled) / heights.settled).toBeLessThanOrEqual(RESERVE_TOLERANCE);
    });
  }
}
