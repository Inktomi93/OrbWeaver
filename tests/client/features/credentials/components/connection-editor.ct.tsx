// CT: Settings → Connections → the connection EDITOR (inference program §5.3a, step 9; drawn
// as the step-3b editor mock). The four disclosure tiers, driven at BOTH load-bearing
// settings-body widths — 870 with the context panel closed, 486 with it open (§13 step 3b).
//
// WHAT THIS FILE IS FOR, in one line each:
//   • THE DEFAULT STATE IS FOUR FIELDS AND ONE VERDICT LINE AT BOTH WIDTHS. That is §5.3a's whole claim for
//     the tiers, and it holds by CONSTRUCTION (collapsing is width-independent) rather than by squeezing —
//     so it is worth pinning at both widths, because a regression here is a regression of the architecture.
//   • THE TIERS HAVE A REAL A11Y CONTRACT. The mock's `.tierhead` is a `div` with `cursor: pointer` — no
//     `aria-expanded`, no button role, no keyboard — and the mock design §5.2 names it "the single most likely
//     thing to be copied verbatim". These assert the button role, `aria-expanded` and Enter-to-open.
//   • EVERY §5.3a COPY STRING RENDERS VERBATIM. Not "the pane says so" — the exact sentence.
//   • THE QUIRK KEY RULE IS OBSERVABLE. A quirk key stays raw only when that string IS the wire's, so
//     `prefill` survives and `reasoningKeys` renders as "reasoning fields" over an UNCHANGED value. This
//     pins BOTH halves, because the failure mode is a schema identifier leaking to a user surface.
//   • THE WIDTH REFLOWS ARE MEASURED, NOT ASSERTED. `@container`, not `@media`: the viewport is IDENTICAL in
//     both arms and only the mounted box differs, so a media query could not produce a difference at all.
//     The fact row's geometry is read from `boundingBox()`, not from a class name.
//   • THE THREE THINGS THAT MUST NOT RENDER are asserted absent: no `api` control (`showsApiControl` is
//     `apis.length > 1` and every provider now lists one), no prefetch status (§8.3's line was STRUCK by
//     owner ruling), no per-chat/per-room override (F20).

import type { USER_ROLES } from "@orb/contracts/identity";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Locator, Page } from "@playwright/test";
import type { TrpcRecorder, TrpcWireOutput } from "../../../../support/node/route-trpc.ts";
import { routeTrpc } from "../../../../support/node/route-trpc.ts";
import { ConnectionEditorNarrowStory, ConnectionEditorStory } from "../_ct-stories.tsx";

const CONNECTION_ID = "user_connection_cteditor0001";

// The two settings-body widths, each story named ONCE: playwright-ct binds every array-element story reference
// to its own const, so a second table naming the same story fails the bundle at eval (Spine-Testing.md §7).
const WIDTH_ARMS = [
  ["870", ConnectionEditorStory],
  ["486", ConnectionEditorNarrowStory],
] as const;

/** The shipped vLLM provider row, verbatim from `contracts/inference/builtin-providers.ts` — the block the
 *  mock draws. Re-typed rather than imported because this spec runs NODE-side and the contracts barrel pulls
 *  zod through a chain the CT transform does not need; the values are pinned by the copy assertions below. */
const VLLM_PROVIDER: TrpcWireOutput<"connection.providersAvailable">[number]["provider"] = {
  id: "vllm",
  label: "vLLM",
  wire: "openai-compat",
  dialect: "openai-compatible",
  auth: "endpoint",
  apis: ["chat-completions"],
  features: {
    prefill: "continue-final-message",
    strictJson: "default-on",
    effort: "reasoning_effort",
    sleep: { isSleepingPath: "/is_sleeping", wakePath: "/wake_up" },
    rerankPath: "/rerank",
    reasoningKeys: ["reasoning", "reasoning_content"],
    prefillSuppressesThinking: true,
  },
  catalog: "url",
  metered: false,
};

/** A saved endpoint connection. `declared.features.strictJson` is the OVERRIDDEN row the mock draws — the
 *  one that must restate the value it replaced. */
type ConnectionRow = TrpcWireOutput<"connection.get">;

function connectionRow(over: Partial<ConnectionRow> = {}): ConnectionRow {
  return {
    id: CONNECTION_ID,
    ownerId: "user_ct_editor",
    label: "vLLM · Qwen3-32B",
    providerId: "vllm",
    providerLabel: "vLLM",
    credentialId: null,
    baseUrl: "http://127.0.0.1:8000/v1",
    model: "Qwen/Qwen3-32B",
    api: "auto",
    declared: { features: { strictJson: "declared-only" } },
    // COMPUTED KEYS, not literals: these are a SERVER's own wire field names (and one of the eight the wire
    // owns), which `useNamingConvention` reads as a violation on a literal property. The bracket form is the
    // suppression-free spelling the house already uses for foreign vocabularies.
    extras: { ["top_k"]: 40, stream: false },
    transport: null,
    modelListed: false,
    allowBackground: true,
    promptCache: null,
    tasks: ["chat", "agent", "summarize", "structured"],
    createdAt: 0,
    updatedAt: 0,
    ...over,
  };
}

/** A generation capability — a chat model that takes text, gives back text, and cannot embed or draw. */
const GENERATION_CAPABILITY: NonNullable<TrpcWireOutput<"connection.capabilities">["capability"]> = {
  kind: "generation",
  generation: {
    reasoning: { mode: "effort", enabled: true },
    sampling: {},
    input: ["text"],
    output: { maxTokens: { min: 1, max: 8192 }, modalities: ["text"], structured: true },
    context: { window: 32_768 },
    tools: { parallel: true },
  },
};

const CONNECTION_CAPABILITIES = {
  capability: GENERATION_CAPABILITY,
  baseline: GENERATION_CAPABILITY,
  warnings: [],
  tasks: ["chat", "agent", "summarize", "structured"],
} satisfies TrpcWireOutput<"connection.capabilities">;

async function stubEditor(
  page: Page,
  opts: {
    readonly connection?: ConnectionRow;
    readonly allowlist?: readonly string[];
    readonly role?: (typeof USER_ROLES)[number];
    readonly capabilities?: TrpcWireOutput<"connection.capabilities">;
  } = {},
): Promise<TrpcRecorder> {
  return await routeTrpc(page, {
    "sessions.me": () => ({ userId: "user_ct_editor", handle: "owner", globalRole: opts.role ?? "owner" }),
    "connection.get": () => opts.connection ?? connectionRow(),
    "connection.providersAvailable": () => [{ provider: VLLM_PROVIDER, available: true }],
    "connection.capabilities": () => opts.capabilities ?? CONNECTION_CAPABILITIES,
    // An empty catalog is the TYPED-ID arm — which is what `modelListed: false` is about.
    "connection.catalogModels": () => ({ listed: false, reason: "the provider listed no models" }),
    "connection.update": () => opts.connection ?? connectionRow(),
    "connection.probe": () => ({ status: "unreachable", checkedAt: 0, reason: "connect ECONNREFUSED" }),
    "settings.getAppSettingsWithOverrides": () => ({
      resolved: { privateEndpointAllowlist: opts.allowlist ?? [] },
      overrides: { privateEndpointAllowlist: null },
    }),
    "settings.updateAppSettings": () => ({ privateEndpointAllowlist: [] }),
  });
}

/** A tier's disclosure header, by the name the Collapsible gives it. */
function tier(page: Page, name: string): Locator {
  return page.getByRole("button", { name, exact: false }).filter({ hasText: name });
}

// ── the default state ──────────────────────────────────────────────────────────────────────────────────

// §5.3a: "a user who has touched nothing sees FOUR fields — provider, the key-or-URL, model, and the
// auto-minted `label` — and a 'how it's used' line". FOUR, not three: the same tier mandates `label` one
// paragraph down, and the render is what falsified the sentence (the mock design §6-2).
for (const [arm, Story] of WIDTH_ARMS) {
  test(`${arm}: the untouched editor is four fields and one verdict line, with the two heavy tiers collapsed`, async ({ mount, page }) => {
    await stubEditor(page);
    const component = await mount(<Story />);

    await expect(component.getByText("Provider", { exact: true })).toBeVisible();
    await expect(component.getByText("Server URL", { exact: true })).toBeVisible();
    await expect(component.getByText("Model", { exact: true }).first()).toBeVisible();
    await expect(component.getByText("Name", { exact: true })).toBeVisible();
    await expect(component.getByText("This looks like a chat & writing model —")).toBeVisible();

    // The two heavy tiers are CLOSED, and each says how much is inside it rather than being a bare word.
    await expect(tier(page, "Advanced")).toHaveAttribute("aria-expanded", "false");
    await expect(tier(page, "Diagnostics")).toHaveAttribute("aria-expanded", "false");
    await expect(component.getByText("1 field overridden")).toBeVisible();
    await expect(component.getByText("2 set")).toBeVisible();
    // Nothing from the collapsed tiers' BODIES is on the page — collapsing is the mechanism, not a visual
    // trick. The tier's own KICKER survives on purpose: a collapsed tier that is a bare word and a chevron
    // is exactly the wrong thing at 486, where the user is comparing this pane against a room.
    await expect(component.locator('[data-slot="connection-fact-row"]')).toHaveCount(0);
    await expect(component.locator('[data-slot="connection-extra-row"]')).toHaveCount(0);
    await expect(tier(page, "Advanced")).toContainText("What this server accepts · Endpoint quirks");
  });
}

// THE A11Y CONTRACT THE MOCK HAS NONE OF. A `div` with `cursor: pointer` is unreachable by keyboard and
// says nothing about its state; this is the thing the mock design §5.2 says step 9 owes.
test("a tier header is a BUTTON with aria-expanded, and opens from the keyboard", async ({ mount, page }) => {
  await stubEditor(page);
  const component = await mount(<ConnectionEditorStory />);

  const advanced = tier(page, "Advanced");
  await expect(advanced).toHaveAttribute("aria-expanded", "false");
  await advanced.focus();
  await page.keyboard.press("Enter");
  await expect(advanced).toHaveAttribute("aria-expanded", "true");
  await expect(component.getByText("What this server accepts", { exact: true })).toBeVisible();
});

// ── the copy §5.3a makes law ───────────────────────────────────────────────────────────────────────────

test("the typed-model fallback carries §5.3a's sentence verbatim, with its re-check action", async ({ mount, page }) => {
  await stubEditor(page);
  const component = await mount(<ConnectionEditorStory />);

  await expect(
    component.getByText("This model id wasn't in 127.0.0.1:8000's list. It'll be sent as-is; if the server doesn't have it, turns will fail."),
  ).toBeVisible();
  await expect(component.getByRole("button", { name: "Check the list again" })).toBeVisible();
});

test("the four block names are §5.3a's words, never the schema's", async ({ mount, page }) => {
  await stubEditor(page);
  const component = await mount(<ConnectionEditorStory />);

  await tier(page, "Advanced").click();
  await expect(component.getByText("What this server accepts", { exact: true })).toBeVisible();
  await expect(component.getByText("Endpoint quirks", { exact: true })).toBeVisible();
  await tier(page, "Diagnostics").click();
  await expect(component.getByText("Extra request fields", { exact: true })).toBeVisible();
  await expect(component.getByText("Request & response shaping", { exact: true })).toBeVisible();
  // The schema words never reach the surface.
  for (const sealed of ["declared", "features", "extras", "transport"]) {
    await expect(component.getByText(sealed, { exact: true })).toHaveCount(0);
  }
});

// ── the quirk key rule (§5.3a's owed amendment, the mock design §6-3) ────────────────────────────────────────

test("a quirk key stays RAW only when that string is the wire's — `prefill` survives, `reasoningKeys` does not", async ({ mount, page }) => {
  await stubEditor(page);
  const component = await mount(<ConnectionEditorStory />);
  await tier(page, "Advanced").click();

  const quirk = component.locator('[data-fact="features.prefill"]');
  await expect(quirk.getByText("prefill", { exact: true })).toBeVisible();
  await expect(quirk.getByText("continue-final-message", { exact: true })).toBeVisible();
  await expect(quirk.getByText("from the vLLM provider row")).toBeVisible();

  // Our own schema property names are written in plain words; the WIRE's string stays in the value.
  const reasoning = component.locator('[data-fact="features.reasoningKeys"]');
  await expect(reasoning.getByText("reasoning fields", { exact: true })).toBeVisible();
  await expect(reasoning.getByText("reasoning, reasoning_content", { exact: true })).toBeVisible();
  for (const identifier of ["reasoningKeys", "prefillSuppressesThinking", "rerankPath", "strictJson"]) {
    await expect(component.getByText(identifier, { exact: true })).toHaveCount(0);
  }
});

// The honesty guarantee: the thing you overrode is never hidden by the override.
test("an overridden quirk changes colour, RESTATES what it replaced, and swaps Override for Reset", async ({ mount, page }) => {
  await stubEditor(page);
  const component = await mount(<ConnectionEditorStory />);
  await tier(page, "Advanced").click();

  const overridden = component.locator('[data-fact="features.strictJson"]');
  await expect(overridden).toHaveAttribute("data-overridden", "true");
  await expect(overridden.getByText("declared-only", { exact: true })).toBeVisible();
  await expect(overridden.getByText("your override — the vLLM provider row says default-on")).toBeVisible();
  await expect(overridden.getByRole("button", { name: "Reset strict JSON" })).toBeVisible();
  await expect(overridden.getByRole("button", { name: "Override strict JSON" })).toHaveCount(0);

  // …and a row nobody touched carries the Override, named with its field rather than the bare verb (the
  // review's F-finding: 18 buttons all named "Override").
  const untouched = component.locator('[data-fact="features.prefill"]');
  await expect(untouched).toHaveAttribute("data-overridden", "false");
  await expect(untouched.getByRole("button", { name: "Override prefill" })).toBeVisible();
});

test("Override reveals a real labelled control and writes ONE field into `declared`", async ({ mount, page }) => {
  const recorder = await stubEditor(page);
  const component = await mount(<ConnectionEditorStory />);
  await tier(page, "Advanced").click();

  await component.getByRole("button", { name: "Override rerank path" }).click();
  const control = component.getByLabel("rerank path — your value");
  await expect(control).toBeVisible();
  await control.fill("/v1/rerank");
  await component.getByRole("button", { name: "Save your rerank path" }).click();

  await expect
    .poll(() => recorder.lastInput("connection.update"), { intervals: [20, 50, 100] })
    .toEqual({ connectionId: CONNECTION_ID, patch: { declared: { features: { strictJson: "declared-only", rerankPath: "/v1/rerank" } } } });
});

// ── the Purpose tier ───────────────────────────────────────────────────────────────────────────────────

// §5.3a's owed ruling (the mock design §6-5): a cannot-serve verdict is MUTED with `✗` and its reason, never
// destructive. A chat model that cannot embed is not broken — it is every chat model in existence.
test("a cannot-serve badge is muted with its reason, and destructive colour is spent on nothing", async ({ mount, page }) => {
  await stubEditor(page);
  const component = await mount(<ConnectionEditorStory />);

  const rail = component.locator('[data-slot="connection-capability-rail"]');
  await expect(rail.getByText("Chat", { exact: true })).toBeVisible();
  await expect(rail.getByText("Text embedding — wrong kind")).toBeVisible();
  await expect(rail.getByText("Image generation — no image output")).toBeVisible();
  // Not one destructive pill on a healthy connection.
  await expect(rail.locator(".text-destructive")).toHaveCount(0);
  await expect(rail.locator('[class*="destructive"]')).toHaveCount(0);
});

test("the verdict is a SENTENCE with an inline change control, and changing it writes `declared.kind`", async ({ mount, page }) => {
  const recorder = await stubEditor(page);
  const component = await mount(<ConnectionEditorStory />);

  await expect(component.getByText("This looks like a chat & writing model —")).toBeVisible();
  await expect(
    component.getByText("From the model id and what the server reported. Change it if it's wrong — nothing else on this page depends on the guess."),
  ).toBeVisible();

  await component.getByRole("combobox", { name: "Change what this model is for" }).click();
  await page.getByRole("option", { name: "Search vectors" }).click();
  await expect
    .poll(() => recorder.lastInput("connection.update"), { intervals: [20, 50, 100] })
    .toEqual({ connectionId: CONNECTION_ID, patch: { declared: { features: { strictJson: "declared-only" }, kind: "embedding" } } });
});

// ── the Extras editor: the three properties a textarea regresses ───────────────────────────────────────

test("a belt key is glossed at AUTHORING time, before the turn", async ({ mount, page }) => {
  await stubEditor(page);
  const component = await mount(<ConnectionEditorStory />);
  await tier(page, "Diagnostics").click();

  const owned = component.locator('[data-extra-key="stream"]');
  await expect(owned.locator('[data-slot="connection-extra-belt-gloss"]')).toHaveText(
    "We own stream — it is how the reply is read back as it arrives. This row is dropped before the request is sent.",
  );
  // A key we do NOT own carries no gloss at all.
  await expect(component.locator('[data-extra-key="top_k"] [data-slot="connection-extra-belt-gloss"]')).toHaveCount(0);
});

test("an unfinished row is HELD through a save, and remove takes the row it names", async ({ mount, page }) => {
  const recorder = await stubEditor(page);
  const component = await mount(<ConnectionEditorStory />);
  await tier(page, "Diagnostics").click();

  const rows = component.locator('[data-slot="connection-extra-row"]');
  await expect(rows).toHaveCount(3); // two saved + the always-present empty one
  await expect(component.getByText("Empty rows stay while you're typing; nothing is saved until the row has a key.")).toBeVisible();

  // Type a key into the empty row and blur it: the autosave fires and the keyless row SURVIVES.
  const empty = rows.last();
  await empty.getByLabel("Field", { exact: true }).fill("repetition_penalty");
  await empty.getByLabel("Field", { exact: true }).blur();
  await expect.poll(() => recorder.count("connection.update"), { intervals: [20, 50, 100] }).toBeGreaterThan(0);
  await expect(rows).toHaveCount(3);

  // Remove names ITS row, by key — row identity is the id, not the index.
  await expect(component.getByRole("button", { name: "Remove the top_k field" })).toBeVisible();
  await component.getByRole("button", { name: "Remove the top_k field" }).click();
  await expect(component.locator('[data-extra-key="top_k"]')).toHaveCount(0);
  await expect(component.locator('[data-extra-key="stream"]')).toHaveCount(1);
});

// ── reachability + the admission affordance ────────────────────────────────────────────────────────────

test("an unreachable endpoint says §5.3a's sentence, and the owner is offered the admission", async ({ mount, page }) => {
  const recorder = await stubEditor(page);
  const component = await mount(<ConnectionEditorStory />);
  await tier(page, "Diagnostics").click();

  await component.getByRole("button", { name: "Check again" }).click();
  await expect(component.locator('[data-slot="connection-unreachable"]')).toHaveText("Can't reach 127.0.0.1 — the server may be down.");

  // The host is not written down, so the repair is offered where the failure is.
  await component.getByRole("button", { name: "Admit 127.0.0.1" }).click();
  await expect
    .poll(() => recorder.lastInput("settings.updateAppSettings"), { intervals: [20, 50, 100] })
    .toEqual({ partial: { privateEndpointAllowlist: ["127.0.0.1"] } });
});

test("a host already named in the allowlist is NOT offered an admission", async ({ mount, page }) => {
  await stubEditor(page, { allowlist: ["127.0.0.1:8000"] });
  const component = await mount(<ConnectionEditorStory />);
  await tier(page, "Diagnostics").click();

  await expect(component.getByRole("button", { name: "Check again" })).toBeVisible();
  await expect(component.locator('[data-slot="connection-admit-host"]')).toHaveCount(0);
});

// A member cannot change a deployment setting, so they are not shown a control that would 403.
test("a non-owner is offered no admission at all", async ({ mount, page }) => {
  await stubEditor(page, { role: "user" });
  const component = await mount(<ConnectionEditorStory />);
  await tier(page, "Diagnostics").click();

  await expect(component.getByRole("button", { name: "Check again" })).toBeVisible();
  await expect(component.locator('[data-slot="connection-admit-host"]')).toHaveCount(0);
});

// ── what must not render ───────────────────────────────────────────────────────────────────────────────

test("no api control, no prefetch status, no per-room override — each absent by DATA", async ({ mount, page }) => {
  await stubEditor(page);
  const component = await mount(<ConnectionEditorStory />);
  await tier(page, "Advanced").click();
  await tier(page, "Diagnostics").click();

  for (const banned of ["Protocol", "Chat Completions", "downloading", "Prefetch", "This room", "Room override", "Per-chat"]) {
    await expect(component.getByText(banned, { exact: false })).toHaveCount(0);
  }
});

// ── the width reflows, MEASURED ────────────────────────────────────────────────────────────────────────

// The viewport is IDENTICAL in both arms — only the mounted box differs — so a `@media` mechanism could not
// produce a difference here at all. This is the receipt that the adaptation is `@container`.
/** The vertical gap between two settled boxes, polled — a same-tick geometry read after a disclosure opens
 *  is a false negative by construction (the panel animates its height). */
async function verticalGap(scope: Locator, first: string, second: string): Promise<number> {
  const top = await scope.getByText(first, { exact: true }).boundingBox();
  const bottom = await scope.getByText(second, { exact: true }).boundingBox();
  if (top === null || bottom === null) {
    throw new Error(`a box is missing: ${first}=${String(top !== null)} ${second}=${String(bottom !== null)}`);
  }
  return bottom.y - top.y;
}

test("870: the fact row's key and value share a line; 486: it stacks", async ({ mount, page }) => {
  await stubEditor(page);
  const wide = await mount(<ConnectionEditorStory />);
  await tier(page, "Advanced").click();
  const wideRow = wide.locator('[data-fact="features.prefill"]');
  await expect(wideRow).toBeVisible();
  await expect.poll(async () => Math.abs(await verticalGap(wideRow, "prefill", "continue-final-message")), { intervals: [20, 50, 100] }).toBeLessThan(4);

  await wide.unmount();
  await stubEditor(page);
  const narrow = await mount(<ConnectionEditorNarrowStory />);
  await tier(page, "Advanced").click();
  const narrowRow = narrow.locator('[data-fact="features.prefill"]');
  await expect(narrowRow).toBeVisible();
  await expect.poll(async () => await verticalGap(narrowRow, "prefill", "continue-final-message"), { intervals: [20, 50, 100] }).toBeGreaterThan(8);
});

// §5.3a: where the rail truncates it truncates GREENS LAST, so the survivors say what the connection CAN do.
test("486: the capability rail keeps the greens and summarises the rest", async ({ mount, page }) => {
  await stubEditor(page);
  const component = await mount(<ConnectionEditorNarrowStory />);

  const rail = component.locator('[data-slot="connection-capability-rail"]');
  await expect(rail.getByText("Chat", { exact: true })).toBeVisible();
  await expect(rail.getByText("Text embedding — wrong kind")).toBeHidden();
  await expect(rail.getByText(/…and \d+ more it can't serve\./)).toBeVisible();
});

// The mock swept the transport pair's crossover to 490px of CONTENT; the container's `lg` step is the
// ratified edge above it, so 486 is one-up and 870 is two-up.
/** The two transport fields' offsets, polled to settled. */
async function transportPairOffset(scope: Locator): Promise<{ readonly dx: number; readonly dy: number }> {
  const headers = await scope.getByLabel("Extra headers").boundingBox();
  const exclude = await scope.getByLabel("Don't send these fields").boundingBox();
  if (headers === null || exclude === null) {
    throw new Error("the transport pair has not settled");
  }
  return { dx: exclude.x - headers.x, dy: exclude.y - headers.y };
}

test("the transport pair is two-up at 870 and one-up at 486", async ({ mount, page }) => {
  await stubEditor(page);
  const wide = await mount(<ConnectionEditorStory />);
  await tier(page, "Diagnostics").click();
  await expect(wide.getByLabel("Extra headers")).toBeVisible();
  await expect.poll(async () => (await transportPairOffset(wide)).dx, { intervals: [20, 50, 100] }).toBeGreaterThan(100);

  await wide.unmount();
  await stubEditor(page);
  const narrow = await mount(<ConnectionEditorNarrowStory />);
  await tier(page, "Diagnostics").click();
  await expect(narrow.getByLabel("Extra headers")).toBeVisible();
  await expect.poll(async () => Math.abs((await transportPairOffset(narrow)).dx), { intervals: [20, 50, 100] }).toBeLessThan(4);
  await expect.poll(async () => (await transportPairOffset(narrow)).dy, { intervals: [20, 50, 100] }).toBeGreaterThan(8);
});

// ── the Prompt caching tier ──────────────────────────────────────────────────────────────────────────────
// Shown only where the capability places explicit cache markers; every control writes the WHOLE settings
// document, and "use the defaults" writes NULL (the shipped behavior).

const EXPLICIT_CACHE_CAPABILITY: NonNullable<TrpcWireOutput<"connection.capabilities">["capability"]> = {
  kind: "generation",
  generation: {
    ...GENERATION_CAPABILITY.generation,
    turns: { assistantPrefill: false, midConversationSystem: false, historySystemRows: false, roleHandlingFloor: "strict", explicitPromptCache: true },
  },
};
const EXPLICIT_CACHE_CAPABILITIES = { ...CONNECTION_CAPABILITIES, capability: EXPLICIT_CACHE_CAPABILITY, baseline: EXPLICIT_CACHE_CAPABILITY };
const SHIPPED = { enabled: true, cacheSystem: true, historyDepth: null, ttl: "1h" } as const;
// Comfortably past the autosave debounce, so a frozen clock run this far always closes the save window.
const PAST_THE_SAVE_WINDOW_MS = 2000;

function cacheTier(page: Page): Locator {
  return page.locator('[data-slot="connection-editor-tier"][data-tier="Prompt caching"]');
}

async function openCacheTier(page: Page): Promise<Locator> {
  await cacheTier(page).getByRole("button").first().click();
  const body = page.locator('[data-slot="connection-prompt-cache"]');
  await expect(body).toBeVisible();
  return body;
}

test("no Prompt caching tier on a connection whose capability places no explicit cache markers", async ({ mount, page }) => {
  await stubEditor(page);
  await mount(<ConnectionEditorStory />);
  await expect(tier(page, "Advanced")).toBeVisible();
  await expect(cacheTier(page)).toHaveCount(0);
});

for (const [arm, Story] of WIDTH_ARMS) {
  test(`${arm}: an explicit-cache connection gets the tier, COLLAPSED, so the untouched editor keeps its four fields`, async ({ mount, page }) => {
    await stubEditor(page, { capabilities: EXPLICIT_CACHE_CAPABILITIES });
    await mount(<Story />);
    await expect(cacheTier(page)).toHaveCount(1);
    await expect(cacheTier(page).getByRole("button").first()).toHaveAttribute("aria-expanded", "false");
    await expect(page.locator('[data-slot="connection-prompt-cache"]')).toHaveCount(0);
  });
}

test("the caching switch writes the whole document with caching off", async ({ mount, page }) => {
  const recorder = await stubEditor(page, { capabilities: EXPLICIT_CACHE_CAPABILITIES });
  await mount(<ConnectionEditorStory />);
  const body = await openCacheTier(page);
  await body.getByRole("switch").nth(0).click();
  await expect
    .poll(() => recorder.lastInput("connection.update"), { intervals: [20, 50, 100] })
    .toEqual({ connectionId: CONNECTION_ID, patch: { promptCache: { ...SHIPPED, enabled: false } } });
});

test("the system-prompt switch writes cacheSystem off and keeps the rest", async ({ mount, page }) => {
  const recorder = await stubEditor(page, { capabilities: EXPLICIT_CACHE_CAPABILITIES });
  await mount(<ConnectionEditorStory />);
  const body = await openCacheTier(page);
  await body.getByRole("switch").nth(1).click();
  await expect
    .poll(() => recorder.lastInput("connection.update"), { intervals: [20, 50, 100] })
    .toEqual({ connectionId: CONNECTION_ID, patch: { promptCache: { ...SHIPPED, cacheSystem: false } } });
});

test("the TTL radio writes 5m; the options come in contract order", async ({ mount, page }) => {
  const recorder = await stubEditor(page, { capabilities: EXPLICIT_CACHE_CAPABILITIES });
  await mount(<ConnectionEditorStory />);
  const body = await openCacheTier(page);
  const radios = body.getByRole("radio");
  await expect(radios).toHaveCount(2);
  await expect(radios.nth(1)).toHaveAttribute("aria-checked", "true");
  await radios.nth(0).click();
  await expect
    .poll(() => recorder.lastInput("connection.update"), { intervals: [20, 50, 100] })
    .toEqual({ connectionId: CONNECTION_ID, patch: { promptCache: { ...SHIPPED, ttl: "5m" } } });
});

test("the depth field commits on Enter, never per keystroke", async ({ mount, page }) => {
  const recorder = await stubEditor(page, { capabilities: EXPLICIT_CACHE_CAPABILITIES });
  await mount(<ConnectionEditorStory />);
  const body = await openCacheTier(page);
  const depth = body.getByRole("textbox");
  // Typed key by key: a per-keystroke write would land a 1 before the 12, and the count below would be 2.
  await depth.pressSequentially("12");
  await expect(depth).toHaveValue("12");
  await depth.press("Enter");
  await expect
    .poll(() => recorder.lastInput("connection.update"), { intervals: [20, 50, 100] })
    .toEqual({ connectionId: CONNECTION_ID, patch: { promptCache: { ...SHIPPED, historyDepth: 12 } } });
  await expect.poll(() => recorder.count("connection.update"), { intervals: [20, 50, 100] }).toBe(1);
});

// The tier is an autosave form (D78): changes made inside one save window reach the server as ONE whole
// document carrying all of them. The page clock is frozen after the tier opens, so the window closes only
// when the test runs it forward; a write per control would land twice, the second without the first change.
test("two changes inside one save window are written once, as one document holding both", async ({ mount, page }) => {
  const recorder = await stubEditor(page, { capabilities: EXPLICIT_CACHE_CAPABILITIES });
  await mount(<ConnectionEditorStory />);
  const body = await openCacheTier(page);
  await page.clock.install();
  await body.getByRole("switch").nth(1).click();
  await body.getByRole("radio").nth(0).click();
  await page.clock.runFor(PAST_THE_SAVE_WINDOW_MS);
  await expect
    .poll(() => recorder.lastInput("connection.update"), { intervals: [20, 50, 100] })
    .toEqual({ connectionId: CONNECTION_ID, patch: { promptCache: { ...SHIPPED, cacheSystem: false, ttl: "5m" } } });
  await expect.poll(() => recorder.count("connection.update"), { intervals: [20, 50, 100] }).toBe(1);
  await expect(body.getByRole("switch").nth(1)).not.toBeChecked();
  await expect(body.getByRole("radio").nth(0)).toHaveAttribute("aria-checked", "true");
});

test("stored settings with caching off: the dependent controls are disabled, the badge counts, and the reset writes NULL", async ({ mount, page }) => {
  const stored = { enabled: false, cacheSystem: true, historyDepth: null, ttl: "5m" } as const;
  const recorder = await stubEditor(page, { capabilities: EXPLICIT_CACHE_CAPABILITIES, connection: connectionRow({ promptCache: stored }) });
  await mount(<ConnectionEditorStory />);
  await expect(cacheTier(page).locator('[data-slot="badge"]')).toHaveCount(1);
  const body = await openCacheTier(page);
  await expect(body.getByRole("switch").nth(0)).toBeEnabled();
  await expect(body.getByRole("switch").nth(1)).toBeDisabled();
  await expect(body.getByRole("textbox")).toBeDisabled();
  for (const radio of await body.getByRole("radio").all()) {
    await expect(radio).toHaveAttribute("aria-disabled", "true");
  }
  await body.getByRole("button", { name: "Use the defaults" }).click();
  await expect
    .poll(() => recorder.lastInput("connection.update"), { intervals: [20, 50, 100] })
    .toEqual({ connectionId: CONNECTION_ID, patch: { promptCache: null } });
});
