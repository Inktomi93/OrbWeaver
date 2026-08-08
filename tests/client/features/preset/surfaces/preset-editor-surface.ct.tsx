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
import { DEFAULT_PROMPT_CONFIG, MAX_FORMAT_STRING_LENGTH } from "@orb/contracts/preset";
import { PROSE_COUNTER_AT, PROSE_MAX_CHARS, PROSE_SLOTS } from "@orb/contracts/prose";
import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import type { PresetId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Locator, Page } from "@playwright/test";
import { assertTokenRoundtrip } from "../../../../support/ct/assert-token-roundtrip.ts";
import { resolvedTokenColor } from "../../../../support/ct/resolved-token-color.ts";
import type { TrpcRecorder } from "../../../../support/ct/route-trpc.ts";
import { routeTrpc, trpcError } from "../../../../support/ct/route-trpc.ts";
import { makeModelCapability, makeResolvedChatCapability } from "../../../../support/factories/resolved-connection.ts";
import {
  PresetEditorCapabilityFreshnessStory,
  PresetEditorSurfaceStory,
  PresetEditorSwitchStory,
  PresetForkChoiceStory,
  PresetForkOnceStory,
} from "./_ct-stories.tsx";

// The three fixed ids — the literal mirror of the story module's branded PresetIds (biome forbids the
// story exporting non-component consts, so the literals live in both places), cast to the brand here.
const PRESET_A = castId<PresetId>("preset_ct_aaaaaaaaaa");
const PRESET_B = castId<PresetId>("preset_ct_bbbbbbbbbb");
const BUILT_IN = castId<PresetId>("preset_00000000000000000000000000");
const FORK = castId<PresetId>("preset_ct_forkedddddd");

// Quality-dial option labels. The dial is a SELECT since owner ruling O-18 (the segmented strip died), so
// the state is the TRIGGER'S TEXT — and "no dial" is the named OFF arm, not an empty selection.
const FAST = "Fast";
const BALANCED = "Balanced";
const DEEP = "Deep";
const QUALITY_OFF_LABEL = "Don't use quality";
const RESET_ITEM_RE = /Reset to starter/;
// The G7 provenance chip, matched loosely so its ABSENCE can be asserted without naming a model. The
// grammar is the READOUT's (crunch-list O-2): "resolved for <model>", never the bare "for <model>" that
// read as "this preset is FOR anthropic/…" — a claim about the preset instead of a statement about which
// model the ghosted numbers were resolved against.
/** The Actions cross-link's accessible name — its health arm prefixes the label, so match the tail. */
const DELIVERS_VIA_RE = /Delivers via Guided instruction/;
const FOR_MODEL_RE = /^resolved for /;

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

function updatesAgainst(trpc: TrpcRecorder, presetId: PresetId): UpdateCall[] {
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
/** The headline of the gate's ROUTING arm — the one failure that has EARNED naming the chat model as the
 *  cause. Both fixtures below therefore throw `BAD_REQUEST`, the code a real routing refusal carries
 *  (`DomainOperationError` → `transport/trpc/error-mapping.ts`): these two tests are ABOUT the routing fault
 *  they name, and an unstamped throw is an `INTERNAL_SERVER_ERROR`, whose honest arm names only the READ.
 *  They passed unstamped while the gate asserted this sentence over every code alike (2026-08-08). */
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
    "connection.resolveChatCapability": () => (resolves++ === 0 ? trpcError({ code: "BAD_REQUEST", message: ROUTING_FAULT_MESSAGE }) : CAPABILITY),
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

// ── PENDING IS NOT AN EMPTY STATE (lane FLK's F-02 class, owner-boarded) ──────────────────────────────
// `CapabilityGate`'s connect-a-model note was reachable ONLY while the capability read was in flight:
// `connection.resolveChatCapability` returns a REQUIRED descriptor, so a settled-successful read always
// carries one and a settled failure carries an error — leaving `capability===undefined && error===null` as
// the PENDING state and nothing else. So EVERY editor open flashed "connect a chat model" at users who had
// one, and the state the note described was never actually rendered by anyone.
//
// The in-flight window is HELD OPEN here (the FORK-ONCE pin's `page.route` + delay idiom), so the pending
// render is a stable, deterministic state for the whole hold rather than a flash the assertion chases: the
// barrier is the rendered skeleton, and the negative assertion runs inside a window we own.
const CAPABILITY_HOLD_MS = 1500;
// Any prose claiming something about the user's chat model. Deliberately BROADER than the deleted string:
// the pin is "the gate asserts NOTHING about the connection until the read settles", so a future arm that
// re-introduces any such claim on the pending path fails here too.
const CHAT_MODEL_CLAIM_RE = /chat model/;
const SAMPLING_KICKER = "Sampling · reasoning · output";

/** Hold every `connection.resolveChatCapability` request open for `CAPABILITY_HOLD_MS`, then let routeTrpc
 *  answer it. Registered AFTER routeTrpc so Playwright runs it FIRST and defers via `fallback()`. The proc
 *  rides the batch URL's comma-joined path, so matching the path is enough (and it deliberately holds
 *  whatever else shares that batch — the suspense reads have already settled by then). */
async function holdCapability(page: Page): Promise<void> {
  await page.route("**/api/trpc/**", async (route) => {
    if (route.request().url().includes("connection.resolveChatCapability")) {
      await new Promise<void>((resolve) => setTimeout(resolve, CAPABILITY_HOLD_MS));
    }
    await route.fallback();
  });
}

test("PENDING — a user WITH a chat model never sees a connect-a-model note; the gate holds a skeleton until the read lands", async ({ mount, page }) => {
  await routeTrpc(page, {
    "preset.get": () => PRESET_A_DETAIL,
    "preset.list": () => [PRESET_A_DETAIL],
    "settings.getUserSettings": () => SETTINGS_VIEW,
    "connection.resolveChatCapability": () => CAPABILITY,
    "preset.resolveEffective": () => EFFECTIVE_FLOOR,
  });
  await holdCapability(page);
  const component = await mount(<PresetEditorSurfaceStory />);

  // THE BARRIER: the gate's PENDING render, which is stable for the whole hold. The kicker still stands (the
  // clusters' slot is held, so the deck does not jump when the descriptor lands) and the placeholder rows
  // under it are the shared `SkeletonRows` — a real busy region, not a sentence.
  const gate = component.locator("section").filter({ has: page.getByRole("heading", { name: SAMPLING_KICKER }) });
  await expect(gate.locator('[aria-busy="true"] [data-slot="skeleton"]').first()).toBeVisible();

  // THE PIN: nothing on screen claims anything about this user's chat model — they HAVE one, and the read
  // simply has not landed. This is the regression: the old gate printed the connect-a-model note here.
  await expect(component.getByText(CHAT_MODEL_CLAIM_RE)).toHaveCount(0);

  // …and when the read lands, the model-fed clusters replace the skeleton with the descriptor's own knobs.
  await expect(component.getByRole("slider", { name: "Temperature" })).toBeVisible();
  await expect(component.getByText(CHAT_MODEL_CLAIM_RE)).toHaveCount(0);
  await expect(gate.locator('[data-slot="skeleton"]')).toHaveCount(0);
});

test("PENDING — a FAILED read says nothing until it settles, then states the routing fault verbatim", async ({ mount, page }) => {
  await routeTrpc(page, {
    "preset.get": () => PRESET_A_DETAIL,
    "preset.list": () => [PRESET_A_DETAIL],
    "settings.getUserSettings": () => SETTINGS_VIEW,
    "connection.resolveChatCapability": () => trpcError({ code: "BAD_REQUEST", message: ROUTING_FAULT_MESSAGE }),
    "preset.resolveEffective": () => EFFECTIVE_FLOOR,
  });
  await holdCapability(page);
  const component = await mount(<PresetEditorSurfaceStory />);

  const gate = component.locator("section").filter({ has: page.getByRole("heading", { name: SAMPLING_KICKER }) });
  await expect(gate.locator('[aria-busy="true"] [data-slot="skeleton"]').first()).toBeVisible();
  // Neither arm's prose may be on screen before the read settles — a pending gate makes no claim at all.
  await expect(component.getByText(CHAT_MODEL_CLAIM_RE)).toHaveCount(0);

  // SETTLED no-capability: the failure arm, quoting the server (F-02's P1 — a routing fault, not "connect
  // a model"), and the skeleton is gone.
  await expect(component.getByText(CAPABILITY_FAILURE_RE)).toBeVisible();
  await expect(component.getByText(ROUTING_FAULT_MESSAGE, { exact: true })).toBeVisible();
  await expect(gate.locator('[data-slot="skeleton"]')).toHaveCount(0);
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
const FORK_ONE = castId<PresetId>("preset_ct_fork0000001");
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

// ── THE PROSE CAP (verifier finding on the EXTRACTION merge) ──────────────────────────────────────────
// `proseOverridesSchema` wraps every override in a per-key `.catch(undefined)`. That is right at the contract
// — one malformed row must not make a whole stored blob unparseable — but it means an over-cap framing
// template does not BOUNCE, it VANISHES: the write "succeeds", the key heals to absent, the shipped default
// rides, and the host's wording is gone with nothing anywhere having said so. Fail-open, silently, on the
// user's own words. The schema stays; the EDITOR is what must stop the loss before the wire, and these are
// the three halves of that — cap the typing, show the ceiling coming, refuse a save that would delete text.
//
// The framing rows are the third form path (`promptConfig.prose`), so they are the surface at risk: the
// `formatStrings`/`guidedActions` rows next to them in this same list are plain strings with no such heal.
// "Continuation cue" is the framing row with NO required-token capability, so its footer carries only the
// length signals and nothing else can be mistaken for them.
const CONTINUATION_ROW = "Edit Continuation cue";
const CONTINUATION_SLOT = "chat.assembly.continuationNudge";
const TEMPLATE_FIELD = "Template";
/** The `hint-editor` grammar the cap adopts: quiet until 80% of the cap, then a live count. */
const COUNTER_FROM = PROSE_MAX_CHARS * PROSE_COUNTER_AT;
/** A field one character short of the cap, plus the ONE keystroke the cap still admits. */
const AT_CAP = `${"x".repeat(PROSE_MAX_CHARS - 1)}a`;
/** Longer than the cap can ever be TYPED — the shape only pre-existing data can have. */
const OVERLONG = "y".repeat(PROSE_MAX_CHARS + 500);
/** The withheld-save alert, AFTER one deletion: 499, because the count tracks the live field. */
const OVER_CAP_ALERT_RE = /499 characters over the 4000 limit/;

/** `PRESET_A` carrying one stored framing override — the pre-existing-data arm's fixture. */
function presetWithProse(text: string): PresetDetailFixture {
  const base = presetDetail(PRESET_A, "Preset A", "fast");
  return {
    ...base,
    config: { ...base.config, prose: { [CONTINUATION_SLOT]: { text, baseVersion: PROSE_SLOTS[CONTINUATION_SLOT].version } } },
  };
}

/** Open the Continuation-cue framing template's drill-in and return its textarea. */
async function openContinuationCue(component: Locator): Promise<Locator> {
  await component.getByRole("tab", { name: "Actions" }).click();
  await component.getByRole("button", { name: CONTINUATION_ROW }).click();
  // BARRIER: the drill-in's back row is the settled render of the editor — never assert into the swap.
  await expect(component.getByRole("button", { name: "Back to actions" })).toBeVisible();
  return component.getByRole("textbox", { name: TEMPLATE_FIELD, exact: true });
}

test("PROSE CAP — the counter is quiet until 80% of the cap, then typing HARD-STOPS at it", async ({ mount, page }) => {
  await routeTrpc(page, {
    "preset.get": () => PRESET_A_DETAIL,
    "preset.list": () => [PRESET_A_DETAIL],
    "settings.getUserSettings": () => SETTINGS_VIEW,
    "preset.resolveEffective": () => EFFECTIVE_FLOOR,
    "preset.update": () => ({}),
  });
  const component = await mount(<PresetEditorSurfaceStory />);
  const field = await openContinuationCue(component);

  // Well under the cap: no counter. An always-on counter is chrome; the affordance IS its lateness.
  await field.fill("x".repeat(100));
  await expect(component.getByText(`100/${String(PROSE_MAX_CHARS)}`)).toHaveCount(0);

  // One character under the counter threshold — still silent. The boundary is asserted from BOTH sides so a
  // future off-by-one in the threshold cannot pass by simply showing the counter earlier.
  await field.fill("x".repeat(COUNTER_FROM - 1));
  await expect(component.getByText(`${String(COUNTER_FROM - 1)}/${String(PROSE_MAX_CHARS)}`)).toHaveCount(0);

  // At the threshold the count appears and tracks the box.
  await field.fill("x".repeat(PROSE_MAX_CHARS - 1));
  await expect(component.getByText(`${String(PROSE_MAX_CHARS - 1)}/${String(PROSE_MAX_CHARS)}`)).toBeVisible();

  // THE PIN: real keystrokes at the boundary. `pressSequentially` goes through the keyboard (unlike `fill`,
  // which assigns the value and would sail past a native cap), so this is the affordance a person meets —
  // two more characters, exactly ONE of which is allowed to land.
  await field.pressSequentially("ab");
  await expect(field).toHaveValue(AT_CAP);
  await expect(component.getByText(`${String(PROSE_MAX_CHARS)}/${String(PROSE_MAX_CHARS)}`)).toBeVisible();
  // …and it is a stop, not a lag: further typing changes nothing at all.
  await field.pressSequentially("cde");
  await expect(field).toHaveValue(AT_CAP);
});

test("PROSE CAP — an ALREADY-over-cap stored override shows its real text and REFUSES to save until trimmed", async ({ mount, page }) => {
  // The only way to be over the cap now that the field stops at it: text that arrived that way — an imported
  // preset, a direct API write, a blob predating the cap. Truncating it would be the same data loss the
  // schema's self-heal already commits, just with a friendlier name, so the editor refuses instead.
  const trpc = await routeTrpc(page, {
    "preset.get": () => presetWithProse(OVERLONG),
    "preset.list": () => [presetWithProse(OVERLONG)],
    "settings.getUserSettings": () => SETTINGS_VIEW,
    "preset.resolveEffective": () => EFFECTIVE_FLOOR,
    "preset.update": () => ({}),
  });
  const component = await mount(<PresetEditorSurfaceStory />);
  const field = await openContinuationCue(component);

  // THE AUTHOR'S BYTES ARE ON SCREEN, all 4500 of them — never silently clipped to the cap behind their back.
  await expect(field).toHaveValue(OVERLONG);

  // A real edit — the author starts deleting. Under the old code this debounced straight into a write whose
  // payload the server would heal away to nothing.
  await field.press("End");
  await field.press("Backspace");
  await expect(field).toHaveValue("y".repeat(PROSE_MAX_CHARS + 499));

  // THE PIN, FIRST: no write, ever. The debounce (500ms) plus a full round-trip have had their chance. It
  // leads deliberately — an assertion ordered behind a cosmetic one is an assertion that never runs on the
  // red side, and THIS is the defect (measured on the unfixed tree: exactly one `preset.update` fired,
  // carrying 4499 characters the schema would then heal to nothing).
  await page.evaluate(() => new Promise<void>((resolve) => setTimeout(resolve, 900)));
  // ONESHOT-OK: settled — the preceding 900ms real-timer wait IS the negative-assertion window.
  expect(trpc.count("preset.update")).toBe(0);

  // …and the withheld save is STATED, as an alert: the autosave that would normally reassure is the thing
  // being held back, so this badge is the only place that state is legible.
  await expect(component.getByRole("alert")).toHaveText(OVER_CAP_ALERT_RE);

  // …AND THE REFUSAL LIFTS. A form that stayed invalid forever would be a worse bug than the one being fixed:
  // trimming under the cap must let the edit through, carrying the author's own trimmed text.
  await field.fill("y".repeat(3000));
  await expect(component.getByRole("alert")).toHaveCount(0);
  await expect
    .poll(() => (trpc.inputs("preset.update") as ProseUpdateCall[]).at(-1)?.config?.prose?.[CONTINUATION_SLOT]?.text?.length, {
      intervals: [100, 200, 300, 500],
    })
    .toBe(3000);
});

// ── THE GEOMETRY OF THE REFUSAL + THE HEADER'S TRUTH (side-eye PROSE-LIMIT P1/P2/P3) ──────────────────
// The cap above stopped the data loss and then hid its own affordances: `field-sizing: content` has no
// ceiling, so the over-cap value all three signals are ABOUT rendered as one 2300px box and pushed the
// counter, the `role="alert"` refusal and the header's save status below the fold. Meanwhile the header kept
// reading "Saved" — the save driver gates on `form.state.isValid`, so the write was being held, and the one
// line whose whole job is to say whether this preset is saved said the opposite of the truth.
test("PROSE GEOMETRY — the box scrolls at its cap, the refusal stays on screen, and the header stops saying Saved", async ({ mount, page }) => {
  await routeTrpc(page, {
    "preset.get": () => presetWithProse(OVERLONG),
    "preset.list": () => [presetWithProse(OVERLONG)],
    "settings.getUserSettings": () => SETTINGS_VIEW,
    "preset.resolveEffective": () => EFFECTIVE_FLOOR,
    "preset.update": () => ({}),
  });
  const component = await mount(<PresetEditorSurfaceStory />);
  const field = await openContinuationCue(component);
  await expect(field).toHaveValue(OVERLONG);

  // THE BOX IS CAPPED AND SCROLLS — every byte still reachable, none of it spent on page height.
  const box = await field.evaluate((el: HTMLTextAreaElement) => ({ client: el.clientHeight, content: el.scrollHeight }));
  expect(box.content).toBeGreaterThan(box.client);
  expect(box.client).toBeLessThan((page.viewportSize()?.height ?? 0) / 2);

  await field.press("End");
  await field.press("Backspace");

  // THE REFUSAL IS ON SCREEN WITH THE FIELD it refuses — scrolling the FIELD into view (never the alert,
  // which would place the thing under test by hand) is what an author editing this template does.
  await field.scrollIntoViewIfNeeded();
  const alert = component.getByRole("alert");
  await expect(alert).toHaveText(OVER_CAP_ALERT_RE);
  await expect(alert).toBeInViewport();
  // …and the counter beside it reads as part of that refusal rather than as quiet chrome (P3).
  const counter = component.getByText(`${String(PROSE_MAX_CHARS + 499)}/${String(PROSE_MAX_CHARS)}`);
  await expect(counter).toBeInViewport();
  await expect(counter).toHaveCSS("color", resolvedTokenColor("color.destructive"));

  // THE HEADER STATES THE STATE (P2). The badge is the REASON; this line is whether the editor is saved —
  // and it is the live region a screen-reader user hears when they leave the field expecting an autosave.
  const status = component.getByRole("status");
  await expect(status).toContainText("Not saved");
  // …AND IT LIFTS when the refusal does.
  await field.fill("y".repeat(3000));
  await expect(status).toContainText("Saved");
  await expect(status).not.toContainText("Not saved");
});

// ── THE FORMAT-STRING CAP (the SECOND of the three regimes on this surface) ────────────────────────────
// `formatStringsSchema` bounds every slot at MAX_FORMAT_STRING_LENGTH and the SAME schema is the read path
// (`parsePromptConfig` degrades a failed parse to DEFAULT_PROMPT_CONFIG), so an over-cap nudge is not one
// bounced field — it is the whole preset reading as defaults. The field wore no cap and no counter at all:
// three cap regimes met on this one drill-in and exactly one of them was signalled.
const CONTINUE_NUDGE_ROW = "Edit Continue nudge";
/** The format-string counter's threshold — the shared capped-field grammar's default 80%. */
const FORMAT_COUNTER_FROM = MAX_FORMAT_STRING_LENGTH * 0.8;

test("FORMAT-STRING CAP — the nudge field wears the schema's cap and counts toward it", async ({ mount, page }) => {
  await routeTrpc(page, {
    "preset.get": () => PRESET_A_DETAIL,
    "preset.list": () => [PRESET_A_DETAIL],
    "settings.getUserSettings": () => SETTINGS_VIEW,
    "preset.resolveEffective": () => EFFECTIVE_FLOOR,
    "preset.update": () => ({}),
  });
  const component = await mount(<PresetEditorSurfaceStory />);
  await component.getByRole("tab", { name: "Actions" }).click();
  await component.getByRole("button", { name: CONTINUE_NUDGE_ROW }).click();
  await expect(component.getByRole("button", { name: "Back to actions" })).toBeVisible();
  const field = component.getByRole("textbox", { name: TEMPLATE_FIELD, exact: true });

  // THE CAP IS THE SCHEMA'S, worn by the control the browser enforces it in.
  await expect(field).toHaveAttribute("maxlength", String(MAX_FORMAT_STRING_LENGTH));

  // The counter is quiet until 80% of it, asserted from both sides so an off-by-one can't pass by showing
  // the count earlier.
  await field.fill("x".repeat(FORMAT_COUNTER_FROM - 1));
  await expect(component.getByText(`${String(FORMAT_COUNTER_FROM - 1)}/${String(MAX_FORMAT_STRING_LENGTH)}`)).toHaveCount(0);
  await field.fill("x".repeat(FORMAT_COUNTER_FROM));
  await expect(component.getByText(`${String(FORMAT_COUNTER_FROM)}/${String(MAX_FORMAT_STRING_LENGTH)}`)).toBeVisible();

  // …and the box that now holds 8000 characters is still a field, not a page: it scrolls at its ceiling.
  const box = await field.evaluate((el: HTMLTextAreaElement) => ({ client: el.clientHeight, content: el.scrollHeight }));
  expect(box.content).toBeGreaterThan(box.client);
  expect(box.client).toBeLessThan((page.viewportSize()?.height ?? 0) / 2);
});

/** The framing override as it rides `preset.update` — the payload the cap exists to keep parseable. */
interface ProseUpdateCall {
  readonly config?: { readonly prose?: Record<string, { readonly text?: string } | undefined> };
}

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

  // The provenance of every ghosted number in the deck, stated where the preset is named — in the ONE
  // grammar the readout uses for the same fact (O-2), so the header echo cannot drift into a claim that
  // the PRESET belongs to a model.
  await expect(component.getByText(`resolved for ${EFFECTIVE_FLOOR.model}`, { exact: true })).toBeVisible();
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

// ── THE SECTION DRILL'S LIFECYCLE (graduation verifier, 2026-08-08) ───────────────────────────────────
// Moving the drill from local component state onto a store fixed the fork-eject — and, with no reset story,
// bought three defects the local state never had, because a `useState` died on unmount and a store does not.
// All three are properties of the WHOLE surface (view axis, selection axis and drill axis are three stores),
// so nothing below the surface can see them. The door test above stayed green throughout the regression
// only because it never drilled first — which is exactly what the first pin does.

test("the Delivers-via chip lands on the RACK even when a DIFFERENT section is already drilled", async ({ mount, page }) => {
  await routeTrpc(page, {
    "preset.get": () => PRESET_A_DETAIL,
    "preset.list": () => [PRESET_A_DETAIL],
    "settings.getUserSettings": () => SETTINGS_VIEW,
    "preset.resolveEffective": () => EFFECTIVE_FLOOR,
  });
  const component = await mount(<PresetEditorSurfaceStory />);

  // Drill into "Main" — the state the door test never established.
  await component.getByRole("tab", { name: "Prompt" }).click();
  await component.getByRole("button", { name: "Edit Main", exact: true }).click();
  await expect(component.getByRole("button", { name: "Back to rack" })).toBeVisible();

  // Now take the cross-link from Actions, naming a DIFFERENT section.
  await component.getByRole("tab", { name: "Actions" }).click();
  await component.getByRole("button", { name: DELIVERS_VIA_RE }).click();

  // THE REGRESSION: the door painted the still-drilled "Main" EDITOR, so it named one section and opened
  // another — and the row it selected was never rendered at all. The rack must be standing.
  await expect(component.getByRole("button", { name: "Back to rack" })).toHaveCount(0);
  await expect(component.getByRole("button", { name: "Guided instruction", exact: true })).toHaveAttribute("aria-current", "true");
});

test("leaving the Prompt view while drilled and returning lands on the RACK, not back inside the editor", async ({ mount, page }) => {
  await routeTrpc(page, {
    "preset.get": () => PRESET_A_DETAIL,
    "preset.list": () => [PRESET_A_DETAIL],
    "settings.getUserSettings": () => SETTINGS_VIEW,
    "preset.resolveEffective": () => EFFECTIVE_FLOOR,
  });
  const component = await mount(<PresetEditorSurfaceStory />);

  await component.getByRole("tab", { name: "Prompt" }).click();
  await component.getByRole("button", { name: "Edit Main", exact: true }).click();
  await expect(component.getByRole("button", { name: "Back to rack" })).toBeVisible();

  // Away and back — the old local drill state died with the unmount; the store's did not.
  await component.getByRole("tab", { name: "Params" }).click();
  await component.getByRole("tab", { name: "Prompt" }).click();

  await expect(component.getByRole("button", { name: "Back to rack" })).toHaveCount(0);
  await expect(component.getByRole("button", { name: "Main", exact: true })).toBeVisible();
});

test("a drill in preset A does not leak into preset B — the section ids are the SAME literals", async ({ mount, page }) => {
  // The leak's whole mechanism: rack section ids are `DEFAULT_PROMPT_CONFIG` literals, so A and B carry the
  // byte-identical "main". An unscoped drill therefore RESOLVED in B and opened B directly inside its own
  // "Main" editor — a preset the user had just opened for the first time, already drilled.
  await routeTrpc(page, {
    "preset.get": (input: unknown) => ((input as { id?: string }).id === PRESET_B ? PRESET_B_DETAIL : PRESET_A_DETAIL),
    "preset.list": () => [PRESET_A_DETAIL, PRESET_B_DETAIL],
    "settings.getUserSettings": () => SETTINGS_VIEW,
    "preset.resolveEffective": () => EFFECTIVE_FLOOR,
    "preset.update": () => ({}),
  });
  const component = await mount(<PresetEditorSwitchStory />);

  await component.getByRole("tab", { name: "Prompt" }).click();
  await component.getByRole("button", { name: "Edit Main", exact: true }).click();
  await expect(component.getByRole("button", { name: "Back to rack" })).toBeVisible();

  // Open B (the rail's prop change) — B is a different preset, so its rack is what opens.
  await component.getByRole("button", { name: "switch to B" }).click();
  await expect(component.getByText("Preset B")).toBeVisible();
  await expect(component.getByRole("button", { name: "Back to rack" })).toHaveCount(0);
  await expect(component.getByRole("button", { name: "Main", exact: true })).toBeVisible();
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
