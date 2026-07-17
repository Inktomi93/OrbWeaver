// CT: the preset CONTENT editor's two P0 regressions (stickler review 2026-07-16-merge-block-28523122),
// the live repros as tests — now pinned against the D78 L1 session BOUNDARY. The original P0 was a frozen
// seed surviving a switch/reset because the remount key lived BELOW the hook owner; the boundary OWNS the
// key (its keyed Session) so both pins ride the real production mechanism:
//   • SWITCH pin — pick A (dirty) → B: the editor must show B's REAL config, and NO `preset.update` may
//     fire against B carrying A's values (the "one keystroke persists the previous preset into the new
//     one" bug). Asserted on the update save-spy (routeTrpc recorder — the house wire-payload pattern).
//   • RESET pin — reset-to-starter: the editor must show the STARTER config AND no `preset.update` may
//     write the pre-reset values back over the freshly-reset row (the durable no-op reset — the boundary's
//     discard-flagged teardown, driven by `session.reseed(row.config)` off the mutation response).
//
// The Quality dial (`params.quality`, first tab, no capability needed) is the visible+editable config
// field: A = "fast", B = "deep", the starter = unset (no radio checked). `preset.get`/`settings.getUserSettings`
// are stubbed at the NETWORK (routeTrpc). No chat model is configured → the sampling/reasoning/output tabs
// show the connect-a-model note; Quality still renders, which is all these pins touch.

import type { PromptConfig } from "@orb/contracts/preset";
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import type { TrpcRecorder } from "../../../../support/ct/route-trpc";
import { routeTrpc } from "../../../../support/ct/route-trpc";
import { PresetEditorSurfaceStory, PresetEditorSwitchStory } from "./_ct-stories";

// The two fixed ids — the plain-string mirror of the story module's branded PresetIds (biome forbids the
// story exporting non-component consts, so the literals live in both places).
const PRESET_A = "preset_ct_aaaaaaaaaa";
const PRESET_B = "preset_ct_bbbbbbbbbb";

// Quality-dial radio accessible-name matchers (hoisted — useTopLevelRegex).
const FAST_RE = /Fast/;
const BALANCED_RE = /Balanced/;
const DEEP_RE = /Deep/;
const RESET_ITEM_RE = /Reset to starter/;

const SETTINGS_VIEW = {
  userId: "user_ct_preset",
  schemaVersion: 1,
  config: DEFAULT_USER_SETTINGS,
  updatedAt: 0,
};

interface PresetDetailFixture {
  readonly id: string;
  readonly name: string;
  readonly kind: string;
  readonly isSystemDefault: boolean;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly config: PromptConfig;
  readonly schemaVersion: number;
}

/** A PresetDetail whose config differs only in `params.quality` — the dial the CT reads + edits. */
function presetDetail(id: string, name: string, quality: "fast" | "balanced" | "deep" | undefined): PresetDetailFixture {
  const config: PromptConfig = quality === undefined ? { ...DEFAULT_PROMPT_CONFIG, params: {} } : { ...DEFAULT_PROMPT_CONFIG, params: { quality } };
  return {
    id,
    name,
    kind: "custom",
    isSystemDefault: false,
    createdAt: 0,
    updatedAt: 0,
    config,
    schemaVersion: config.schemaVersion,
  };
}

const PRESET_A_DETAIL = presetDetail(PRESET_A, "Preset A", "fast");
const PRESET_B_DETAIL = presetDetail(PRESET_B, "Preset B", "deep");
const STARTER_DETAIL = presetDetail(PRESET_A, "Preset A", undefined);

/** The value the editor sends to `preset.update` — `config.params.quality` is the dial the pins read. */
interface UpdateCall {
  readonly id?: string;
  readonly config?: { readonly params?: { readonly quality?: string } };
}

function updatesAgainst(trpc: TrpcRecorder, presetId: string): UpdateCall[] {
  return (trpc.inputs("preset.update") as UpdateCall[]).filter((call) => call.id === presetId);
}

test("SWITCH pin — A(dirty)→B shows B's real config and never persists A's values into B", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    "preset.get": (input: unknown) => ((input as { id?: string }).id === PRESET_B ? PRESET_B_DETAIL : PRESET_A_DETAIL),
    "settings.getUserSettings": () => SETTINGS_VIEW,
    "preset.update": () => ({}),
  });
  const component = await mount(<PresetEditorSwitchStory />);

  // A is open: its name + its Quality dial ("fast") are shown.
  await expect(component.getByText("Preset A")).toBeVisible();
  await expect(component.getByRole("radio", { name: FAST_RE })).toBeChecked();

  // Dirty A to "balanced" (a value DISTINCT from B's "deep", so the frozen-seed bug can't hide behind a
  // coincidental match). The debounced autosave persists it AGAINST A, proving the edit took.
  await component.getByRole("radio", { name: BALANCED_RE }).click();
  await expect.poll(() => updatesAgainst(trpc, PRESET_A).at(-1)?.config?.params?.quality, { intervals: [100, 200, 300, 500] }).toBe("balanced");

  // Switch A→B (the rail prop change). The boundary rekeys its Session on the new entityId and seeds from
  // B's REAL row — the header shows B and the dial shows B's "deep", NOT A's frozen edited "balanced" seed.
  await component.getByRole("button", { name: "switch to B" }).click();
  await expect(component.getByText("Preset B")).toBeVisible();
  await expect(component.getByRole("radio", { name: DEEP_RE })).toBeChecked();
  await expect(component.getByRole("radio", { name: BALANCED_RE })).not.toBeChecked();

  // THE PIN (Finding 1): the ONE keystroke on the newly-selected B must persist as B's own value — never
  // A's frozen "balanced". Pick "fast" on B; the autosave fires against B with "fast", and NO update
  // against B ever carries A's "balanced" (the frozen-seed persist-the-previous-preset bug).
  await component.getByRole("radio", { name: FAST_RE }).click();
  await expect.poll(() => updatesAgainst(trpc, PRESET_B).at(-1)?.config?.params?.quality, { intervals: [100, 200, 300, 500] }).toBe("fast");
  await page.evaluate(() => new Promise<void>((resolve) => setTimeout(resolve, 300)));
  expect(updatesAgainst(trpc, PRESET_B).some((call) => call.config?.params?.quality === "balanced")).toBe(false);
});

function routeReset(page: Page): Promise<TrpcRecorder> {
  let didReset = false;
  return routeTrpc(page, {
    // Before reset → A ("fast"); after `preset.resetToDefault` fires → the starter (unset quality).
    "preset.get": () => (didReset ? STARTER_DETAIL : PRESET_A_DETAIL),
    "settings.getUserSettings": () => SETTINGS_VIEW,
    "preset.resetToDefault": () => {
      didReset = true;
      return STARTER_DETAIL;
    },
    "preset.update": () => ({}),
  });
}

test("RESET pin — reset-to-starter shows the starter config and never writes the pre-reset values back", async ({ mount, page }) => {
  const trpc = await routeReset(page);
  const component = await mount(<PresetEditorSurfaceStory />);

  // A is open with "fast". Dirty it to "balanced" so the pre-reset form is non-default (isDefaultValue
  // false — the exact precondition under which the teardown flush would re-persist the old values). This
  // fires ONE legit autosave against A (the pre-reset edit); the pin below counts only writes AFTER reset.
  await expect(component.getByRole("radio", { name: FAST_RE })).toBeChecked();
  await component.getByRole("radio", { name: BALANCED_RE }).click();
  await expect.poll(() => updatesAgainst(trpc, PRESET_A).at(-1)?.config?.params?.quality, { intervals: [100, 200, 300, 500] }).toBe("balanced");

  // Snapshot the update count once the pre-reset edit has settled — any write past this line is the
  // teardown clobber the fix must prevent (the debounce window has elapsed, so nothing else is pending).
  await page.evaluate(() => new Promise<void>((resolve) => setTimeout(resolve, 300)));
  const updatesBeforeReset = trpc.count("preset.update");

  // Reset to starter: options menu → the reset item → confirm. The Menu popup + ConfirmDialog render in a
  // PORTAL (document.body), outside the mounted component root — locate them on `page`, not `component`.
  await component.getByRole("button", { name: "Preset options" }).click();
  await page.getByRole("menuitem", { name: RESET_ITEM_RE }).click();
  await page.getByRole("button", { name: "Reset" }).click();

  // The editor reseeds from the FRESH starter row — the Quality dial shows NO selection (params unset).
  await expect(component.getByRole("radio", { name: FAST_RE })).not.toBeChecked();
  await expect(component.getByRole("radio", { name: BALANCED_RE })).not.toBeChecked();
  await expect(component.getByRole("radio", { name: DEEP_RE })).not.toBeChecked();

  // THE PIN: the reset calls `session.reseed(starter)`, whose discard-flagged teardown must NOT flush the
  // dirty pre-reset form. With the old frozen-seed bug (or a non-discard teardown) that flush writes the
  // pre-reset "balanced" back over the starter — a NEW `preset.update` past the snapshot. Wait it out; none.
  await page.evaluate(() => new Promise<void>((resolve) => setTimeout(resolve, 700)));
  expect(trpc.count("preset.update")).toBe(updatesBeforeReset);
});
