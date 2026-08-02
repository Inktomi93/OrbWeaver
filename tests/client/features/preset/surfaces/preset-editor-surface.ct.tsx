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
// The Quality dial (`params.quality`, the Params view's first cluster, no capability needed) is the
// visible+editable config field: A = "fast", B = "deep", the starter = unset (the dial's named OFF arm).
// `preset.get`/`settings.getUserSettings` are stubbed at the NETWORK (routeTrpc). No chat model is
// configured → the SAMPLING/REASONING/OUTPUT clusters show the connect-a-model note; QUALITY still renders,
// which is all these pins touch.
//
// Post-redesign (preset-surface-redesign.md §3/§4): the editor is ONE flat tab level and Params is the
// DEFAULT view, so these pins need no tab navigation at all; the dial is a `Select` (owner ruling O-18 —
// the segmented strip died), so its state reads off the TRIGGER'S TEXT and its options live in a portal.

import type { PromptConfig } from "@orb/contracts/preset";
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Locator, Page } from "@playwright/test";
import { assertTokenRoundtrip } from "../../../../support/ct/assert-token-roundtrip";
import type { TrpcRecorder } from "../../../../support/ct/route-trpc";
import { routeTrpc, trpcError } from "../../../../support/ct/route-trpc";
import { makeModelCapability, makeResolvedChatCapability } from "../../../../support/factories/resolved-connection";
import {
  PresetEditorCapabilityFreshnessStory,
  PresetEditorSurfaceStory,
  PresetEditorSwitchStory,
  PresetForkChoiceStory,
  PresetForkOnceStory,
} from "./_ct-stories";

// The three fixed ids — the plain-string mirror of the story module's branded PresetIds (biome forbids the
// story exporting non-component consts, so the literals live in both places).
const PRESET_A = "preset_ct_aaaaaaaaaa";
const PRESET_B = "preset_ct_bbbbbbbbbb";
const BUILT_IN = "preset_00000000000000000000000000";
const FORK = "preset_ct_forkedddddd";

// Quality-dial option labels. The dial is a SELECT since owner ruling O-18 (the segmented strip died), so
// the state is the TRIGGER'S TEXT — and "no dial" is the named OFF arm, not an empty selection.
const FAST = "Fast";
const BALANCED = "Balanced";
const DEEP = "Deep";
const QUALITY_OFF_LABEL = "Don't use quality";
const RESET_ITEM_RE = /Reset to starter/;
// The G7 provenance chip, matched loosely so its ABSENCE can be asserted without naming a model.
/** The Actions cross-link's accessible name — its health arm prefixes the label, so match the tail. */
const DELIVERS_VIA_RE = /Delivers via Guided instruction/;
const FOR_MODEL_RE = /^for /;

/** The quality dial's trigger — its text IS the current arm (the fixture the dial edits, in one locator). */
function qualityDial(root: Locator): Locator {
  return root.getByRole("combobox", { name: "Quality" });
}

/** Pick a dial arm. The listbox renders in a PORTAL (document.body), outside the mounted root, so the
 *  option is located on the PAGE — the same rule the menu/dialog locators below already follow. */
async function pickQuality(root: Locator, page: Page, label: string): Promise<void> {
  await qualityDial(root).click();
  await page.getByRole("option", { name: label, exact: true }).click();
}

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
  readonly forkedFrom: string | null;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly config: PromptConfig;
  readonly schemaVersion: number;
}

/** A PresetDetail whose config differs only in `params.quality` — the dial the CT reads + edits. A detail is
 *  a superset of the summary the LIST returns, so the same fixtures double as `preset.list` rows (the editor
 *  reads the list to answer the built-in's fork question). */
function presetDetail(id: string, name: string, quality: "fast" | "balanced" | "deep" | undefined): PresetDetailFixture {
  const config: PromptConfig = quality === undefined ? { ...DEFAULT_PROMPT_CONFIG, params: {} } : { ...DEFAULT_PROMPT_CONFIG, params: { quality } };
  return {
    id,
    name,
    kind: "custom",
    isSystemDefault: false,
    forkedFrom: null,
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
  readonly config?: { readonly params?: { readonly quality?: string; readonly maxOutputTokens?: number } };
}

function updatesAgainst(trpc: TrpcRecorder, presetId: string): UpdateCall[] {
  return (trpc.inputs("preset.update") as UpdateCall[]).filter((call) => call.id === presetId);
}

// ── The capability-freshness pin (owner dogfood: "connected a model, the editor still said connect one
// until I reloaded"). Connections persists `routing.roleDefaults` through the busDriven
// `settings.updateUserSettingsSection`, so the user-bus `settingsChanged` row in data/invalidation.ts is the
// ONLY thing that can refresh `connection.resolveChatCapability` (staleTime Infinity, no focus refetch).
// The FIRST resolve FAILS → the deck stands on `CapabilityGate`'s FAILURE arm (side-eye F-02's P1: a failed
// read is a routing problem, NOT "connect a chat model" — different problem, different fix, and the server's
// own message is shown verbatim); after the event the second resolve succeeds and the OUTPUT KnobRows render
// — each GHOSTED at its effective value (the twin's blank-means-default placeholder, redesign §4.1) with the
// provenance gloss under the track.
// The read returns the descriptor PLUS the identity it resolved for (`ResolvedChatCapability`); this panel
// reads the descriptor half only.
//
// THE BARRIER IS THE RENDERED FAILURE ARM, not the request count (lane FLK, 2026-08-02). This pin used to
// assert the gate's NO-MODEL note and to gate its bus tick on `count(...) === 1`. Both were races the harness
// lost under battery contention, and both for the same reason: a recorded request proves the ROUTE HANDLER
// ran node-side, never that the browser settled the query. So (a) the no-model note is only ever on screen
// during the in-flight window — the instant the scripted rejection lands, F-02's failure arm replaces it, so
// the assertion was chasing a flash that a busy machine paints past (repro: 3/3 losses on `pnpm test`'s
// battery, "element(s) not found" on that first assertion), and (b) ticking the bus off the count could
// invalidate an IN-FLIGHT query, which yields no second call at all. The FAILURE ARM is a SETTLED, durable
// render — waiting for it is a real browser-side barrier for both hazards, with no timeout anywhere.
const CAPABILITY_FAILURE_RE = /Your chat model couldn't be resolved/;
const ROUTING_FAULT_MESSAGE = "no chat connection configured";
const CAPABILITY = makeResolvedChatCapability({
  capability: makeModelCapability({
    sampling: { temperature: { min: 0, max: 2 } },
    output: { maxTokens: { min: 1, max: 8192 } },
    context: { window: 32_768 },
  }),
});
// The funnel's own projection for this preset (`preset.resolveEffective`, §4.3) — `maxOutputTokens` resolves
// to the engine FLOOR (nothing explicit, nothing dialed), which is exactly what the ghost must show.
const EFFECTIVE_FLOOR = {
  presetId: PRESET_A,
  model: "qwen3-32b",
  knobs: { maxOutputTokens: { value: 2048, provenance: "floor" } },
  stale: [],
};

test("capability freshness — a settingsChanged tick swaps the failed-capability note for the live Output knobs", async ({ mount, page }) => {
  // Fail-then-succeed script (the routeTrpc header's own counter idiom): resolve #1 rejects — the routing
  // fault the owner's receipt named — and every later resolve returns the capability, i.e. the user fixed the
  // model role in Connections. The refetch COUNT below is what proves the invalidation seam fired; the script
  // only decides what that refetch gets back.
  let resolves = 0;
  const trpc = await routeTrpc(page, {
    "preset.get": () => PRESET_A_DETAIL,
    "preset.list": () => [PRESET_A_DETAIL],
    "settings.getUserSettings": () => SETTINGS_VIEW,
    "connection.resolveChatCapability": () => (resolves++ === 0 ? trpcError({ message: ROUTING_FAULT_MESSAGE }) : CAPABILITY),
    "preset.resolveEffective": () => EFFECTIVE_FLOOR,
  });
  const component = await mount(<PresetEditorCapabilityFreshnessStory />);

  // THE BARRIER (see the block header): the failure arm rendered IS the proof that resolve #1 settled in the
  // browser — so the bus tick below can never land on an in-flight query (which yields no second call at all).
  // It doubles as the F-02 P1's only pin: a failed read must NOT read as "connect a chat model", and it must
  // quote the server's own message rather than swallowing it.
  await expect(component.getByText(CAPABILITY_FAILURE_RE)).toBeVisible();
  await expect(component.getByText(ROUTING_FAULT_MESSAGE, { exact: true })).toBeVisible();
  await expect.poll(() => trpc.count("connection.resolveChatCapability")).toBe(1);

  await component.getByRole("button", { name: "connect a chat model" }).click();

  // The seam refetches the capability (proof the map row exists) and the axis re-renders with the knobs.
  await expect.poll(() => trpc.count("connection.resolveChatCapability")).toBe(2);
  await expect(component.getByText(CAPABILITY_FAILURE_RE)).toBeHidden();
  // The GHOST: each twin is genuinely EMPTY (blank-means-default is the storage semantic) while showing the
  // effective value as its placeholder — max output from the funnel's floor, max context from the model's
  // own window — each with its provenance gloss visible.
  await expect(component.getByRole("textbox", { name: "Max output tokens", exact: true })).toHaveAttribute("placeholder", "2048");
  await expect(component.getByRole("textbox", { name: "Max output tokens", exact: true })).toHaveValue("");
  await expect(component.getByRole("textbox", { name: "Max context tokens", exact: true })).toHaveAttribute("placeholder", "32768");
  await expect(component.getByText("default", { exact: true })).toBeVisible();
  await expect(component.getByText("full window", { exact: true })).toBeVisible();
});

test("SWITCH pin — A(dirty)→B shows B's real config and never persists A's values into B", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    "preset.get": (input: unknown) => ((input as { id?: string }).id === PRESET_B ? PRESET_B_DETAIL : PRESET_A_DETAIL),
    "preset.list": () => [PRESET_A_DETAIL, PRESET_B_DETAIL],
    "settings.getUserSettings": () => SETTINGS_VIEW,
    "preset.update": () => ({}),
  });
  const component = await mount(<PresetEditorSwitchStory />);

  // A is open: its name + its Quality dial ("fast") are shown.
  await expect(component.getByText("Preset A")).toBeVisible();
  await expect(qualityDial(component)).toHaveText(FAST);

  // Dirty A to "balanced" (a value DISTINCT from B's "deep", so the frozen-seed bug can't hide behind a
  // coincidental match). The debounced autosave persists it AGAINST A, proving the edit took.
  await pickQuality(component, page, BALANCED);
  await expect.poll(() => updatesAgainst(trpc, PRESET_A).at(-1)?.config?.params?.quality, { intervals: [100, 200, 300, 500] }).toBe("balanced");

  // Switch A→B (the rail prop change). The boundary rekeys its Session on the new entityId and seeds from
  // B's REAL row — the header shows B and the dial shows B's "deep", NOT A's frozen edited "balanced" seed.
  await component.getByRole("button", { name: "switch to B" }).click();
  await expect(component.getByText("Preset B")).toBeVisible();
  await expect(qualityDial(component)).toHaveText(DEEP);

  // THE PIN (Finding 1): the ONE keystroke on the newly-selected B must persist as B's own value — never
  // A's frozen "balanced". Pick "fast" on B; the autosave fires against B with "fast", and NO update
  // against B ever carries A's "balanced" (the frozen-seed persist-the-previous-preset bug).
  await pickQuality(component, page, FAST);
  await expect.poll(() => updatesAgainst(trpc, PRESET_B).at(-1)?.config?.params?.quality, { intervals: [100, 200, 300, 500] }).toBe("fast");
  await page.evaluate(() => new Promise<void>((resolve) => setTimeout(resolve, 300)));
  expect(updatesAgainst(trpc, PRESET_B).some((call) => call.config?.params?.quality === "balanced")).toBe(false);
});

function routeReset(page: Page): Promise<TrpcRecorder> {
  let didReset = false;
  return routeTrpc(page, {
    // Before reset → A ("fast"); after `preset.resetToDefault` fires → the starter (unset quality).
    "preset.get": () => (didReset ? STARTER_DETAIL : PRESET_A_DETAIL),
    "preset.list": () => [PRESET_A_DETAIL],
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
  await expect(qualityDial(component)).toHaveText(FAST);
  await pickQuality(component, page, BALANCED);
  await expect.poll(() => updatesAgainst(trpc, PRESET_A).at(-1)?.config?.params?.quality, { intervals: [100, 200, 300, 500] }).toBe("balanced");

  // Snapshot the update count once the pre-reset edit has settled — any write past this line is the
  // teardown clobber the fix must prevent (the debounce window has elapsed, so nothing else is pending).
  await page.evaluate(() => new Promise<void>((resolve) => setTimeout(resolve, 300)));
  const updatesBeforeReset = trpc.count("preset.update");

  // Reset to starter: the header's reset DOOR → confirm. The command is its own named control now, not an
  // item behind a ⋯ that held nothing else (side-eye F-18). The ConfirmDialog still renders in a PORTAL
  // (document.body), outside the mounted component root — locate it on `page`, not `component`.
  await component.getByRole("button", { name: RESET_ITEM_RE }).click();
  await page.getByRole("button", { name: "Reset" }).click();

  // The editor reseeds from the FRESH starter row — the dial returns to its OFF arm (params unset), and it
  // SAYS so (owner ruling O-18) rather than rendering as an empty control.
  await expect(qualityDial(component)).toHaveText(QUALITY_OFF_LABEL);

  // THE PIN: the reset calls `session.reseed(starter)`, whose discard-flagged teardown must NOT flush the
  // dirty pre-reset form. With the old frozen-seed bug (or a non-discard teardown) that flush writes the
  // pre-reset "balanced" back over the starter — a NEW `preset.update` past the snapshot. Wait it out; none.
  await page.evaluate(() => new Promise<void>((resolve) => setTimeout(resolve, 700)));
  // ONESHOT-OK: settled — the preceding 700ms real-timer wait is the negative-assertion window itself
  // (proving NO late `preset.update` fires); there is no later state to race against.
  expect(trpc.count("preset.update")).toBe(updatesBeforeReset);
});

// ── The FORK-ONCE pin (owner dogfood, live: "editing the built-in default minted a NEW 'Default (edited)' on
// EVERY field save — I have ten — and Active-for-generation still points at the built-in, so none of my edits
// generate anything"). The built-in is copy-on-write SERVER-side (`preset.update` against the system default
// inserts a fork and returns ITS id); the editor is what must close that loop, and didn't.
//
// The race arm is the flood MECHANISM, so it is DRIVEN, not assumed: the mint response is held in flight (a
// route handler ahead of routeTrpc delays exactly the built-in-targeted POST, then falls back) while a SECOND
// field's debounce fires. Unserialized, that second save still carries the built-in id → mint #2.
const MINT_DELAY_MS = 2000;
const BUILT_IN_DETAIL = { ...presetDetail(BUILT_IN, "Default", undefined), isSystemDefault: true };
const MAX_OUTPUT_LABEL = "Max output tokens";

test("FORK-ONCE pin — a built-in edit mints exactly ONE copy; the editor, the racing save and the active pick all retarget to it", async ({ mount, page }) => {
  // The server's fork row, accumulating every patch — the CT's stand-in for the persisted copy.
  let forkConfig: PromptConfig = BUILT_IN_DETAIL.config;
  let activeId: string | null = null;
  const forkDetail = (): PresetDetailFixture => ({
    ...presetDetail(FORK, "Default (edited)", undefined),
    config: forkConfig,
    schemaVersion: forkConfig.schemaVersion,
  });

  // The owner has NO fork yet — the copy-on-write stays silent (nothing to forget), which is what keeps this
  // pin about the fork-ONCE mechanism. The minted fork joins the list, exactly as the real invalidation does.
  let minted = false;
  const trpc = await routeTrpc(page, {
    "preset.get": (input: unknown) => ((input as { id?: string }).id === BUILT_IN ? BUILT_IN_DETAIL : forkDetail()),
    "preset.list": () => (minted ? [BUILT_IN_DETAIL, { ...forkDetail(), forkedFrom: BUILT_IN }] : [BUILT_IN_DETAIL]),
    "settings.getUserSettings": () => ({
      ...SETTINGS_VIEW,
      config: { ...DEFAULT_USER_SETTINGS, seeds: { ...DEFAULT_USER_SETTINGS.seeds, defaultPresetId: activeId } },
    }),
    "settings.updateUserSettingsSection": (input: unknown) => {
      activeId = (input as { patch: { defaultPresetId: string | null } }).patch.defaultPresetId;
      return {};
    },
    "connection.resolveChatCapability": () => CAPABILITY,
    // Every write lands on the fork row; targeting the built-in is what MINTS it (a NEW id in the response).
    "preset.update": (input: unknown) => {
      forkConfig = (input as { config: PromptConfig }).config;
      minted = true;
      return forkDetail();
    },
  });

  // Hold the mint in flight. Registered AFTER routeTrpc so it runs FIRST and defers via fallback(); only the
  // built-in-targeted MUTATION body matches (queries carry their input on the URL, so reads stay fast).
  let mintRequests = 0;
  await page.route("**/api/trpc/**", async (route) => {
    if ((route.request().postData() ?? "").includes(`"${BUILT_IN}"`)) {
      mintRequests += 1;
      await new Promise<void>((resolve) => setTimeout(resolve, MINT_DELAY_MS));
    }
    await route.fallback();
  });

  const component = await mount(<PresetForkOnceStory />);
  await expect(component.getByText(`selected=${BUILT_IN}`)).toBeVisible();
  await expect(qualityDial(component)).toHaveText(QUALITY_OFF_LABEL);

  // FIELD 1 — the Quality dial. Its debounce fires the first save, which the route handler holds open.
  await pickQuality(component, page, BALANCED);
  await expect.poll(() => mintRequests, { intervals: [50, 100, 200, 300] }).toBe(1);

  // FIELD 2, fired INSIDE the mint's in-flight window — the race arm. Serialized, it must wait for the fork id
  // and patch the copy; unserialized it re-targets the built-in and mints a second "(edited)" row.
  await component.getByRole("textbox", { name: MAX_OUTPUT_LABEL, exact: true }).fill("1234");

  // THE PIN: the retarget is complete — the selection, the editor's own save target, and the
  // active-for-generation pick are all the fork (a fork nothing generates with is a no-op edit).
  await expect.poll(() => activeId, { intervals: [100, 200, 300, 500, 500] }).toBe(FORK);
  await expect(component.getByText(`selected=${FORK}`)).toBeVisible();
  // Both field values landed on the ONE copy (the racing save patched it, never a second fork).
  await expect
    .poll(() => updatesAgainst(trpc, FORK).at(-1)?.config?.params, { intervals: [100, 200, 300, 500] })
    .toMatchObject({ quality: "balanced", maxOutputTokens: 1234 });

  // Let any late debounce / teardown flush land, then assert the mint stayed at exactly one.
  await page.evaluate(() => new Promise<void>((resolve) => setTimeout(resolve, 900)));
  // ONESHOT-OK: settled — the preceding 900ms real-timer wait is the negative-assertion window itself.
  expect(updatesAgainst(trpc, BUILT_IN).length).toBe(1);
  expect(updatesAgainst(trpc, FORK).length).toBeGreaterThanOrEqual(1);
});

// ── The FORK-CHOICE pins (owner ruling). The silent copy-on-write above is right exactly ONCE: the first
// fork has nothing to forget. Once the owner already HAS a fork of the built-in, a second silent COW either
// converges onto a copy they had moved on from or hides the edit in a row they can't find — so the editor
// asks BEFORE the write, at the one place a built-in edit enters the mutation path (`usePresetAutosave`).
// The library list is mounted beside the editor because the answer is only legible against those rows.
const FORK_ONE = "preset_ct_fork0000001";
const FORK_ONE_NAME = "Default (edited)";
const FORK_TWO = "preset_ct_fork0000002";
const SUGGESTED_NAME = "Default fork 2";
const KEEP_EDITING_LABEL = `Keep editing ${FORK_ONE_NAME}`;
const NEW_FORK_LABEL = "Start a new fork";
const LINEAGE_RE = /forked from Default/;
// The dialog's own copy, not the library row behind it: it must NAME the fork the primary arm targets.
const NAMES_THE_FORK_RE = /You already have one: Default \(edited\)/;
const SETTLE_MS = 500;

interface ForkUpdateCall {
  readonly id?: string;
  readonly fork?: { readonly mode?: string; readonly name?: string };
  readonly config?: { readonly params?: { readonly quality?: string } };
}

/** The owner's library: the built-in plus ONE existing fork of it — the precondition for the choice. The
 *  fake server mirrors the verb: a `new` intent MINTS a row, an absent/`converge` one lands on the existing
 *  fork (recorded either way, so a test can prove which arm actually ran). */
function routeForkChoice(page: Page): Promise<TrpcRecorder> {
  const forkOne = { ...presetDetail(FORK_ONE, FORK_ONE_NAME, undefined), forkedFrom: BUILT_IN };
  const rows: PresetDetailFixture[] = [BUILT_IN_DETAIL, forkOne];
  let activeId: string | null = null;
  const patch = (id: string, config: PromptConfig): PresetDetailFixture => {
    const index = rows.findIndex((row) => row.id === id);
    const next = { ...(rows[index] ?? forkOne), config, schemaVersion: config.schemaVersion };
    rows[index] = next;
    return next;
  };
  return routeTrpc(page, {
    "preset.get": (input: unknown) => rows.find((row) => row.id === (input as { id?: string }).id) ?? BUILT_IN_DETAIL,
    "preset.list": () => rows,
    "settings.getUserSettings": () => ({
      ...SETTINGS_VIEW,
      config: { ...DEFAULT_USER_SETTINGS, seeds: { ...DEFAULT_USER_SETTINGS.seeds, defaultPresetId: activeId } },
    }),
    "settings.updateUserSettingsSection": (input: unknown) => {
      activeId = (input as { patch: { defaultPresetId: string | null } }).patch.defaultPresetId;
      return {};
    },
    "connection.resolveChatCapability": () => CAPABILITY,
    "preset.update": (input: unknown) => {
      const call = input as ForkUpdateCall & { config: PromptConfig };
      if (call.id === BUILT_IN && call.fork?.mode === "new") {
        const minted = {
          ...presetDetail(FORK_TWO, call.fork.name ?? "", undefined),
          forkedFrom: BUILT_IN,
          config: call.config,
          schemaVersion: call.config.schemaVersion,
        };
        rows.push(minted);
        return minted;
      }
      // Both the plain patch of a fork and the (unwanted here) silent convergence land through one seam.
      return patch(call.id === BUILT_IN ? FORK_ONE : (call.id ?? FORK_ONE), call.config);
    },
  });
}

test("FORK-CHOICE — with a fork already in the library, a built-in edit is INTERCEPTED: both arms, the fork NAMED, and nothing written yet", async ({
  mount,
  page,
}) => {
  const trpc = await routeForkChoice(page);
  const component = await mount(<PresetForkChoiceStory />);
  await expect(component.getByText(`selected=${BUILT_IN}`)).toBeVisible();

  await pickQuality(component, page, BALANCED);

  // The dialog renders in a PORTAL (document.body) — and it NAMES the fork, since "your edits live in a copy"
  // is useless if the owner can't tell which of their rows that is.
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("button", { name: KEEP_EDITING_LABEL })).toBeVisible();
  await expect(dialog.getByRole("button", { name: NEW_FORK_LABEL })).toBeVisible();
  await expect(dialog.getByText(NAMES_THE_FORK_RE)).toBeVisible();

  // THE PIN: the save is PARKED. A dialog that appears after the write already landed is theatre.
  await page.evaluate((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)), SETTLE_MS);
  // ONESHOT-OK: settled — the preceding wait is the negative-assertion window itself (the debounce + a full
  // save round-trip have had their chance; the dialog is what holds the chain).
  expect(trpc.count("preset.update")).toBe(0);
});

test("FORK-CHOICE keep-editing — the edit lands on the EXISTING fork, the editor retargets, and nothing is minted", async ({ mount, page }) => {
  const trpc = await routeForkChoice(page);
  const component = await mount(<PresetForkChoiceStory />);
  await expect(component.getByText(`selected=${BUILT_IN}`)).toBeVisible();

  await pickQuality(component, page, BALANCED);
  await page.getByRole("dialog").getByRole("button", { name: KEEP_EDITING_LABEL }).click();

  // The pending edit applies THERE (the arm is a retarget, not a discard).
  await expect.poll(() => updatesAgainst(trpc, FORK_ONE).at(-1)?.config?.params?.quality, { intervals: [100, 200, 300, 500] }).toBe("balanced");
  // …and the editor follows it, exactly as the silent COW's retarget does.
  await expect(component.getByText(`selected=${FORK_ONE}`)).toBeVisible();

  await page.evaluate((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)), SETTLE_MS);
  // THE PIN (mutation count): the built-in is never written to, so the server never COWs — the library still
  // holds exactly the ONE fork it started with, no second copy minted behind the owner's back.
  // ONESHOT-OK: settled — the wait above is the negative-assertion window.
  expect(updatesAgainst(trpc, BUILT_IN).length).toBe(0);
  expect((trpc.inputs("preset.update") as ForkUpdateCall[]).every((call) => call.id === FORK_ONE)).toBe(true);
  await expect(component.getByText(LINEAGE_RE)).toHaveCount(1);
});

test("FORK-CHOICE new fork — the suggested name is pre-filled, the mint carries the intent, and the list shows BOTH forks", async ({ mount, page }) => {
  const trpc = await routeForkChoice(page);
  const component = await mount(<PresetForkChoiceStory />);
  await expect(component.getByText(`selected=${BUILT_IN}`)).toBeVisible();

  await pickQuality(component, page, BALANCED);
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: NEW_FORK_LABEL }).click();

  // The name step opens pre-filled and FOCUSED (the owner types over it, never hunts for the field).
  const nameField = dialog.getByLabel("New fork name");
  await expect(nameField).toHaveValue(SUGGESTED_NAME);
  await expect(nameField).toBeFocused();
  await nameField.fill("Deep run");
  await dialog.getByRole("button", { name: "Create fork" }).click();

  // THE PIN: the write goes against the BUILT-IN carrying the explicit `new` intent + the name — the arm that
  // mints a sibling instead of converging on the fork the owner already had.
  await expect
    .poll(() => (trpc.inputs("preset.update") as ForkUpdateCall[]).at(-1)?.fork, { intervals: [100, 200, 300, 500] })
    .toEqual({
      mode: "new",
      name: "Deep run",
    });
  expect(updatesAgainst(trpc, FORK_ONE).length).toBe(0);
  expect((trpc.inputs("preset.update") as ForkUpdateCall[]).at(-1)?.config?.params?.quality).toBe("balanced");

  // The editor retargets onto the NEW fork, and the library now shows two rows both scented "forked from
  // Default" — the lineage that makes a library of forks navigable at all.
  await expect(component.getByText(`selected=${FORK_TWO}`)).toBeVisible();
  // The new row is IN THE LIBRARY (a row button), not just in the editor header the retarget also updated.
  await expect(component.getByRole("button", { name: "Deep run", exact: true })).toBeVisible();
  await expect(component.getByText(LINEAGE_RE)).toHaveCount(2);
});

// ── The FIVE-VIEW SHELL (redesign §3) + the macro-gate belt ───────────────────────────────────────────
// The two-level tree is gone: ONE tab strip, five views, Params first. The Actions view is where the
// guided templates + nudges now live (§3's map moved them out of the Prompt tab's collapsibles), and a
// template-text editor is exactly the surface the macro-resolution ruling covers — so the re-homed nudge
// editor carries the SHARED roundtrip assertion (tests/support/ct/assert-token-roundtrip.ts), never a
// hand-rolled one. That gate is import-keyed and blind to this data flow; the helper is its belt.
test("FIVE VIEWS — one flat strip (Params default), and the re-homed nudge editor round-trips a raw {{token}}", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    "preset.get": () => PRESET_A_DETAIL,
    "preset.list": () => [PRESET_A_DETAIL],
    "settings.getUserSettings": () => SETTINGS_VIEW,
    "preset.resolveEffective": () => EFFECTIVE_FLOOR,
    "preset.update": () => ({}),
  });
  const component = await mount(<PresetEditorSurfaceStory />);

  // ONE level: exactly the five views, in strip order, with Params selected by default (the store's unset
  // read resolves to the tuple's first entry). The old Generation/Prompt/Context/Transforms group strip and
  // its ten leaves are gone — a second tablist would fail this count.
  await expect(component.getByRole("tab")).toHaveText(["Params", "Prompt", "Actions", "Data", "Transforms"]);
  await expect(component.getByRole("tab", { name: "Params" })).toHaveAttribute("aria-selected", "true");

  await component.getByRole("tab", { name: "Actions" }).click();
  await expect(component.getByRole("tab", { name: "Actions" })).toHaveAttribute("aria-selected", "true");

  // The nudge's editor is its DRILL-IN now — the template's ONE editing home (§6.1; the round-4 inline
  // accordion is dead). The row is registry-derived, so reaching the field is: chevron, then the field.
  await component.getByRole("button", { name: "Edit Continue nudge" }).click();
  await expect(component.getByRole("button", { name: "Back to actions" })).toBeVisible();

  // THE BELT: the nudge editor must SHOW and SAVE raw template text. A resolver anywhere in this path would
  // persist "Alex is watching …" — irreversibly, and every other assertion here would stay green.
  await assertTokenRoundtrip({
    trpc,
    // The field is labelled "Template" (side-eye F-32): the drill-in header already names the template, so
    // a field label repeating it was the same word at three levels.
    field: component.getByRole("textbox", { name: "Template", exact: true }),
    proc: "preset.update",
    payloadKey: "config.formatStrings.continueNudge",
  });
});

// ── G7: HEADER TRUTH (redesign §10 G7 / §16 row 3 echo b) ────────────────────────────────────────
// Two facts change UNDER an open editor and are otherwise only legible in another pane: whether this preset
// is the ACTIVE one (the fork-once retarget moves it mid-edit), and which model the deck's effective column
// resolved against. The Activate affordance exists ONLY in the not-active state — a status chip naming an
// actionable state must act — and it rides the SAME `settings.updateUserSettingsSection` seeds patch as the
// LIST row toggle and its kebab mirror.

function settingsWithActive(activeId: string | null): Record<string, unknown> {
  return {
    ...SETTINGS_VIEW,
    config: { ...DEFAULT_USER_SETTINGS, seeds: { ...DEFAULT_USER_SETTINGS.seeds, defaultPresetId: activeId } },
  };
}

interface SeedsPatchCall {
  readonly patch?: { readonly defaultPresetId?: string | null };
}

test("G7 a NOT-active preset's header offers Activate — the same setDefault seeds patch the LIST row fires", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    "preset.get": () => PRESET_A_DETAIL,
    "preset.list": () => [PRESET_A_DETAIL],
    "settings.getUserSettings": () => settingsWithActive(null),
    "settings.updateUserSettingsSection": () => ({}),
    "preset.resolveEffective": () => EFFECTIVE_FLOOR,
  });
  const component = await mount(<PresetEditorSurfaceStory />);

  await expect(component.getByText("Preset A", { exact: true })).toBeVisible();
  // No chip while it isn't the pick — the state that IS true is the one that shows.
  await expect(component.getByText("Active", { exact: true })).toHaveCount(0);

  await component.getByRole("button", { name: "Activate Preset A for generation" }).click();
  await expect
    .poll(() => (trpc.inputs("settings.updateUserSettingsSection") as SeedsPatchCall[]).map((call) => call.patch?.defaultPresetId))
    .toEqual([PRESET_A]);
});

test("G7 the ACTIVE preset's header wears the chip and offers NO Activate", async ({ mount, page }) => {
  await routeTrpc(page, {
    "preset.get": () => PRESET_A_DETAIL,
    "preset.list": () => [PRESET_A_DETAIL],
    "settings.getUserSettings": () => settingsWithActive(PRESET_A),
    "preset.resolveEffective": () => EFFECTIVE_FLOOR,
  });
  const component = await mount(<PresetEditorSurfaceStory />);

  await expect(component.getByText("Preset A", { exact: true })).toBeVisible();
  await expect(component.getByText("Active", { exact: true })).toBeVisible();
  await expect(component.getByRole("button", { name: "Activate Preset A for generation" })).toHaveCount(0);
});

test("G7 the header names the model the effective column resolved AGAINST, and omits it when there is none", async ({ mount, page }) => {
  await routeTrpc(page, {
    "preset.get": () => PRESET_A_DETAIL,
    "preset.list": () => [PRESET_A_DETAIL],
    "settings.getUserSettings": () => settingsWithActive(PRESET_A),
    "preset.resolveEffective": () => EFFECTIVE_FLOOR,
  });
  const component = await mount(<PresetEditorSurfaceStory />);

  // The provenance of every ghosted number in the deck, stated where the preset is named.
  await expect(component.getByText(`for ${EFFECTIVE_FLOOR.model}`, { exact: true })).toBeVisible();
});

test("G7 no resolvable model ⇒ NO provenance chip (never a guessed name)", async ({ mount, page }) => {
  await routeTrpc(page, {
    "preset.get": () => PRESET_A_DETAIL,
    "preset.list": () => [PRESET_A_DETAIL],
    "settings.getUserSettings": () => settingsWithActive(PRESET_A),
    "preset.resolveEffective": () => trpcError({ message: "no chat connection configured" }),
  });
  const component = await mount(<PresetEditorSurfaceStory />);

  await expect(component.getByText("Preset A", { exact: true })).toBeVisible();
  await expect(component.getByText("Active", { exact: true })).toBeVisible();
  await expect(component.getByText(FOR_MODEL_RE)).toHaveCount(0);
});

// ── O-13★: THE GUIDED-INSTRUCTION CROSS-LINK IS A REAL DOOR ───────────────────────────────────────────
// It selected the marker's rack row and left you standing in ACTIONS, where no rack exists — a control
// that does nothing you can see. The door is both halves (view + selection), which is exactly the
// navigation the Actions readout's own note promises. Only a whole-surface test can see it: the view axis
// and the selection axis live in different stores, and the button writes through both.

test("O-13 — the Delivers-via chip OPENS the Guided instruction row in the Prompt view", async ({ mount, page }) => {
  await routeTrpc(page, {
    "preset.get": () => PRESET_A_DETAIL,
    "preset.list": () => [PRESET_A_DETAIL],
    "settings.getUserSettings": () => SETTINGS_VIEW,
    "preset.resolveEffective": () => EFFECTIVE_FLOOR,
  });
  const component = await mount(<PresetEditorSurfaceStory />);

  await component.getByRole("tab", { name: "Actions" }).click();
  await component.getByRole("button", { name: DELIVERS_VIA_RE }).click();

  // The VIEW moved…
  await expect(component.getByRole("tab", { name: "Prompt" })).toHaveAttribute("aria-selected", "true");
  // …and the row it named is the SELECTED one (ListRow paints `aria-current` on the selection).
  await expect(component.getByRole("button", { name: "Guided instruction", exact: true })).toHaveAttribute("aria-current", "true");
});

// ── O-16★: EXPORT HAS ONE HOME, AND IT IS THE LIST ROW ────────────────────────────────────────────────
// The editor-header kebab carried an Export echo (the fix-all's §16 rows 7+27 sanctioned it). Overruled:
// lifecycle lives list-side, matching characters/chats. The kebab keeps exactly one item.

test("O-16 + F-18 — the header offers Reset as its OWN named door; Export is not a second home, and there is no ⋯", async ({ mount, page }) => {
  await routeTrpc(page, {
    "preset.get": () => PRESET_A_DETAIL,
    "preset.list": () => [PRESET_A_DETAIL],
    "settings.getUserSettings": () => SETTINGS_VIEW,
    "preset.resolveEffective": () => EFFECTIVE_FLOOR,
  });
  const component = await mount(<PresetEditorSurfaceStory />);

  // F-18: a ⋯ that hid exactly ONE command bought nothing and cost discoverability twice — `⋯` promises
  // "there is more here" (there wasn't) and says nothing about WHAT. The command wears its own glyph, its
  // own name, and the O-3 icon-door anatomy (aria-label === title, from one string).
  await expect(component.getByRole("button", { name: "Preset options" })).toHaveCount(0);
  const reset = component.getByRole("button", { name: "Reset to starter arrangement" });
  await expect(reset).toBeVisible();
  await expect(reset).toHaveAttribute("title", "Reset to starter arrangement");
  // O-16 stands: Export is single-homed in the LIST row's kebab, nowhere in the editor header.
  await expect(component.getByRole("button", { name: "Export" })).toHaveCount(0);
  await expect(page.getByRole("menuitem", { name: "Export" })).toHaveCount(0);
});

// ── O-17★: THE WIRE-SHAPING TAIL LIVES IN TRANSFORMS ──────────────────────────────────────────────────
// Delivery (speaker names · continue delimiter) and Collapsing (adjacent-role merging · squash system
// notes) shape the WIRE, not the prompt's content — owner sort. They must be in ONE view, not both.

test("O-17 — Delivery + Collapsing render under Transforms and are gone from Prompt", async ({ mount, page }) => {
  await routeTrpc(page, {
    "preset.get": () => PRESET_A_DETAIL,
    "preset.list": () => [PRESET_A_DETAIL],
    "settings.getUserSettings": () => SETTINGS_VIEW,
    "preset.resolveEffective": () => EFFECTIVE_FLOOR,
  });
  const component = await mount(<PresetEditorSurfaceStory />);

  await component.getByRole("tab", { name: "Prompt" }).click();
  await expect(component.getByRole("combobox", { name: "Speaker names" })).toHaveCount(0);
  await expect(component.getByRole("combobox", { name: "Adjacent-role merging" })).toHaveCount(0);

  await component.getByRole("tab", { name: "Transforms" }).click();
  await expect(component.getByRole("combobox", { name: "Speaker names" })).toBeVisible();
  await expect(component.getByRole("combobox", { name: "Continue delimiter" })).toBeVisible();
  await expect(component.getByRole("combobox", { name: "Adjacent-role merging" })).toBeVisible();
  await expect(component.getByRole("switch", { name: "Squash system notes" })).toBeVisible();
});
