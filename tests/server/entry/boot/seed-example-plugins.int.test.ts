// The SHOWCASE PLUGIN examples, proven end to end on their REAL packed bytes — no hand-built bundle double.
// `packSeedPluginBundle` zips the two source files exactly as the per-user seeder does, the real `install`
// verb parses and stores them, the real `setGrant` records consent, the real `setEnabled` activates them in
// the REAL `infra/plugin-host` sandbox, and the collected registrations are driven through the SAME
// `invoke(handler, argsJson, chatScope)` closure the compose fan-out and the tool registrar call.
//
// WHY THIS FILE EXISTS AT ALL: the plugin test harness's fake ports carry "P4 / not exercised" comments, and
// those describe the FAKES — the tools/transforms/events collection path has been live since the registrar
// landed. A reader who takes those comments as a statement about the tree concludes the examples cannot work.
// This is the receipt that they do.
//
// NOT EXERCISED HERE, stated so the coverage claim is honest: the familiar's outbound `net.fetch`.
// `safeFetch` has no injection seam, so exercising it would mean a live request to en.wikipedia.org from CI.
// The familiar is therefore driven to the seam BEFORE the fetch (its "no lore book configured" refusal), which
// proves delivery → guest execution → host-function call. The lore write it would perform after a successful
// fetch — the attachment gate, the per-plugin entry cap and `neutralizeMacros` — is pinned by
// `tests/server/domain/plugin/substrate/bridge.test.ts`.

import type { InvocationChat, PluginCapability, PluginHandlerRef } from "@orb/contracts/plugin";
import type { Db } from "@orb/db";
import type { ChatId, Handle, PluginId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
// The ALIASED front door, not a deep relative path: biome's type service cannot see through
// `../../../../packages/server/src/...` into a branded type, and it then mis-fires `useAwaitThenable` /
// `noUnnecessaryConditions` on perfectly typed code.
import type { PluginActivationScope, PluginHostOps, PluginHostPort, PluginInvokeHandler, PluginRegistrationHandle } from "@orb/server/domain/plugin";
import { buildPluginStorage } from "@orb/server/domain/plugin";
import { createPluginHost } from "@orb/server/infra/plugin-host";
import { packSeedPluginBundle } from "../../../../packages/server/src/entry/boot/seed-assets/index.ts";
import { createExamplePluginSeeder, EXAMPLE_PLUGIN_SLUGS } from "../../../../packages/server/src/entry/boot/seed-example-plugins.ts";
import { FROZEN_AT_MS } from "../../../support/clock.ts";
import { freshDb } from "../../../support/db.ts";
import { expect, test } from "../../../support/fixtures.ts";
import { makeInertOps, makePluginHarness, ownerPrincipalFor, seedUser } from "../../domain/plugin/_support.ts";

const DRAW_LINE_RE = /^\d+\. (.+)$/;
/** The public commitment's shape — ten digits, zero-padded (`commitmentFor`). */
const COMMITMENT_RE = /^\d{10}$/;

/** The production runtime under DETERMINISTIC seams — the same object compose builds, so the membrane, the
 *  registration collection and the resident-invoke path are all real. */
function realHost(): PluginHostPort {
  let n = 0;
  return createPluginHost({
    nowEpochMs: (): number => FROZEN_AT_MS,
    nextRandom: (): number => 0.5,
    mintId: (): string => {
      n += 1;
      return `seed_${n}`;
    },
  });
}

/** What the registrar ops saw at activation — the seam the compose fan-out and the tool registry consume. */
interface Captured {
  readonly events: { readonly type: string; readonly handler: PluginHandlerRef }[];
  readonly tools: { readonly name: string; readonly handler: PluginHandlerRef }[];
  readonly transforms: { readonly name: string; readonly point: string; readonly handler: PluginHandlerRef }[];
  /** Each `surfaceQuickReply` emission, in order — the room-visible half of the chip archetype. */
  readonly chips: (readonly { readonly label: string; readonly sendText: string }[])[];
  /** The per-activation invoke closure (crash-policy wrapped) — how a delivery/tool call actually re-enters. */
  invoke: PluginInvokeHandler | null;
  scope: PluginActivationScope | null;
}

/** A `PluginHostOps` that RECORDS its registrations, over the REAL plugin-private KV (the deck's state plane)
 *  and a scriptable global-variable read (the familiar's configuration plane). */
function recordingOps(db: Db, globals: Map<string, string>): { ops: PluginHostOps; captured: Captured } {
  const base = makeInertOps();
  const noop: PluginRegistrationHandle = { unregister: (): void => undefined };
  const captured: Captured = { events: [], tools: [], transforms: [], chips: [], invoke: null, scope: null };
  const ops: PluginHostOps = {
    ...base,
    storage: buildPluginStorage(db, () => FROZEN_AT_MS),
    variables: { ...base.variables, get: (_ownerId, key): Promise<string | null> => Promise.resolve(globals.get(key) ?? null) },
    quickReply: {
      surface: ({ choices }): Promise<void> => {
        captured.chips.push(choices);
        return Promise.resolve();
      },
    },
    registrar: {
      registerTool: (reg, invoke, scope): PluginRegistrationHandle => {
        captured.tools.push({ name: reg.name, handler: reg.handler });
        captured.invoke = invoke;
        captured.scope = scope;
        return noop;
      },
      registerTransform: (reg, invoke, scope): PluginRegistrationHandle => {
        captured.transforms.push({ name: reg.name, point: reg.point, handler: reg.handler });
        captured.invoke = invoke;
        captured.scope = scope;
        return noop;
      },
      registerMacros: (): PluginRegistrationHandle => noop,
      subscribeEvent: (subscriptions, invoke, scope): PluginRegistrationHandle => {
        for (const sub of subscriptions) {
          captured.events.push({ type: sub.type, handler: sub.handler });
        }
        captured.invoke = invoke;
        captured.scope = scope;
        return noop;
      },
    },
  };
  return { ops, captured };
}

/** The per-activation invoke closure, or a legible failure. Split out of the call sites because biome's type
 *  service models `arr[0]` as always-defined (no `noUncheckedIndexedAccess`), so an inline
 *  `x[0]?.h === undefined` guard reads to it as statically dead and poisons the narrowing around it. */
function requireInvoke(captured: Captured): PluginInvokeHandler {
  const invoke = captured.invoke;
  if (invoke === null) {
    throw new Error("activation registered nothing — no invoke closure reached the registrar");
  }
  return invoke;
}

/** One captured handler ref by index, or a legible failure. `.at()` is honestly typed `T | undefined`. */
function requireHandler(entries: readonly { readonly handler: PluginHandlerRef }[], index: number, what: string): PluginHandlerRef {
  const entry = entries.at(index);
  if (entry === undefined) {
    throw new Error(`activation registered no ${what} at index ${index}`);
  }
  return entry.handler;
}

/** The whole user-facing sequence on an example's REAL packed bytes: install with an empty grant, consent to
 *  `grant`, enable. Returns the row id. `netHosts` is the caller's echo of the displayed host list — the
 *  anti-TOCTOU pin `setGrant` refuses on when the grant includes `net.fetch`. */
async function installGrantEnable(args: {
  readonly h: ReturnType<typeof makePluginHarness>;
  readonly caller: ReturnType<typeof ownerPrincipalFor>;
  readonly slug: string;
  readonly grant: readonly PluginCapability[];
  readonly netHosts?: readonly string[];
}): Promise<PluginId> {
  const { h, caller, slug, grant } = args;
  const bundle = await packSeedPluginBundle(slug);
  expect(bundle, `${slug} has no packable source directory`).not.toBeNull();
  const installed = await h.service.install({ caller, bundle: bundle as Uint8Array, grant: [] });
  expect(installed.status).toBe("disabled");
  expect(installed.grantedCapabilities).toEqual([]);
  await h.service.setGrant({ caller, pluginId: installed.id, grant: [...grant], acknowledgedNetHosts: [...(args.netHosts ?? [])] });
  await h.service.setEnabled({ caller, pluginId: installed.id, enabled: true });
  const [view] = await h.service.list({ caller });
  expect(view?.status).toBe("enabled");
  expect(view?.grantedCapabilities).toEqual([...grant]);
  return installed.id;
}

/** The one room every delivery in this file is scoped to. The ONE cast seam: these tests never touch the
 *  chats table (a delivery is a push — the fan-out already admitted the room), so there is no row to mint an
 *  id from, and the id is only ever compared against itself. */
const CHAT = castId<ChatId>("chat_1");

/** The chat scope a delivery carries: the admitted room plus whether the installer HOSTS it. */
function chatScope(chatId: ChatId, canWrite: boolean): InvocationChat {
  return { chatId, canWrite, automationDepth: 0 };
}

/** A `messageCommitted` fact as the fan-out marshals it — the WIRE shape, whose ids are plain strings by
 *  contract (`triggerFactSchema`), re-branded only by a reader that re-queries them. */
function messageFact(chatId: ChatId, content: string, role = "user"): string {
  return JSON.stringify({
    type: "messageCommitted",
    bus: "chat",
    chatId,
    message: { id: "msg_1", role, authorUserId: null, characterId: null, seq: 1, content },
  });
}

const FAMILIAR_GRANT: readonly PluginCapability[] = ["chat.read", "worldinfo.write", "global_vars", "storage.kv", "events.subscribe", "net.fetch"];

test("research familiar: the real bundle installs consent-first, and its messageCommitted handler actually fires", async () => {
  const db = await freshDb();
  const { ops, captured } = recordingOps(db, new Map());
  const h = makePluginHarness(db, { port: realHost(), ops });
  const caller = ownerPrincipalFor(await seedUser(db, { handle: castId<Handle>("owner") }));

  // THE SEEDED SEQUENCE, verbatim: install with an EMPTY grant, then the empty RE-GRANT that raises the
  // standing consent ask. The row can do nothing at all until a human answers it.
  const bundle = await packSeedPluginBundle("research-familiar");
  expect(bundle).not.toBeNull();
  const installed = await h.service.install({ caller, bundle: bundle as Uint8Array, grant: [] });
  expect(installed.status).toBe("disabled");
  expect(installed.grantedCapabilities).toEqual([]);
  await h.service.setGrant({ caller, pluginId: installed.id, grant: [], acknowledgedNetHosts: [] });

  const [seeded] = await h.service.list({ caller });
  expect(seeded?.reconsentPending).toBe(true);
  expect(seeded?.declaredCapabilities).toEqual([...FAMILIAR_GRANT]);
  expect(seeded?.netHosts).toEqual(["en.wikipedia.org"]);

  // Consent, then run.
  await h.service.setGrant({ caller, pluginId: installed.id, grant: [...FAMILIAR_GRANT], acknowledgedNetHosts: ["en.wikipedia.org"] });
  expect((await h.service.list({ caller }))[0]?.reconsentPending).toBe(false);
  await h.service.setEnabled({ caller, pluginId: installed.id, enabled: true });

  // ACTIVATION COLLECTED THE SUBSCRIPTION — the half the harness's fake ports never exercise.
  expect(captured.events.map((e) => e.type)).toEqual(["messageCommitted"]);
  expect(captured.scope?.slug).toBe("research-familiar");
  const invoke = requireInvoke(captured);
  const handler = requireHandler(captured.events, 0, "event handler");

  // A message with NO marker: the cheap path. The guest runs and says nothing beyond its activation banner.
  await invoke(handler, messageFact(CHAT, "just talking"), chatScope(CHAT, true));
  expect(await h.service.getLog({ caller, pluginId: installed.id })).toEqual([
    { level: "info", message: expect.stringContaining("research familiar ready"), at: FROZEN_AT_MS },
  ]);

  // A message WITH the marker and no configured book: the handler admits the term through its debounce chain,
  // reads the installer's global-variable plane, and then refuses to guess a destination. This is the seam
  // immediately before the outbound fetch (see the file header).
  await invoke(handler, messageFact(CHAT, "we ride north ((lookup: Aurora borealis))"), chatScope(CHAT, true));
  const log = await h.service.getLog({ caller, pluginId: installed.id });
  expect(log.some((line) => line.level === "warn" && line.message.includes("familiar_book_id"))).toBe(true);
});

test("oracle deck: the real bundle registers both tools and a draw is verifiable against the reveal", async () => {
  const db = await freshDb();
  const { ops, captured } = recordingOps(db, new Map());
  const h = makePluginHarness(db, { port: realHost(), ops });
  const caller = ownerPrincipalFor(await seedUser(db, { handle: castId<Handle>("owner") }));

  const bundle = await packSeedPluginBundle("oracle-deck");
  expect(bundle).not.toBeNull();
  const installed = await h.service.install({ caller, bundle: bundle as Uint8Array, grant: [] });
  const grant: readonly PluginCapability[] = ["storage.kv", "tools.register", "ui.surface"];
  await h.service.setGrant({ caller, pluginId: installed.id, grant: [...grant], acknowledgedNetHosts: [] });
  await h.service.setEnabled({ caller, pluginId: installed.id, enabled: true });
  expect((await h.service.list({ caller }))[0]?.status).toBe("enabled");

  // BOTH tools reached the registrar — the guest-local names the host then prefixes to `plugin_oracle_deck_*`.
  expect(captured.tools.map((t) => t.name)).toEqual(["draw", "reveal"]);
  const invoke = requireInvoke(captured);
  const draw = requireHandler(captured.tools, 0, "tool");
  const reveal = requireHandler(captured.tools, 1, "tool");

  // …and so did the `draw` CARD (#679 U3), linked to the guest-local tool name and PROJECTED to the
  // model-visible one — the whole path a transcript needs to draw a house card instead of the generic block.
  expect(await h.service.listSurfaces({ caller })).toEqual([
    expect.objectContaining({ id: "draw_card", anchor: "tool-card", toolName: "draw", toolWireName: "plugin_oracle_deck_draw" }),
    // …and the two U5 surfaces the same activation registered (#679 U5): the full-page deck behind the ONE
    // Extensions rail entry, and the reveal DIALOG — which the deck opens only from its own page/command, never
    // spontaneously. This is the end-to-end receipt that `page` and `dialog` survive a REAL activation over the
    // WASM runtime, not just the schema.
    expect.objectContaining({ id: "deck_page", anchor: "page", title: "The Deck" }),
    expect.objectContaining({ id: "reveal_dialog", anchor: "dialog", title: "Reveal this session" }),
  ]);

  // The two COMMANDS the same activation registered — what `/plugin oracle-deck draw` and the Plugins wand menu
  // both dispatch against. The SLUG is projected here (only this side knows it), which is the first token of the
  // dispatch grammar.
  expect(await h.service.listCommands({ caller })).toEqual([
    { pluginId: installed.id, slug: "oracle-deck", pluginName: "Oracle Deck", name: "draw", describe: "Draw one card from the oracle deck" },
    { pluginId: installed.id, slug: "oracle-deck", pluginName: "Oracle Deck", name: "reveal", describe: "Open the reveal dialog for this oracle session" },
  ]);

  // A tool call carries no chat scope of its own here (the deck never asks for one), exactly as a direct-drive
  // invocation would. The handler's STRING return is what the model reads, verbatim — a JSON DOCUMENT here,
  // because the same fields the model reads are the fields its card binds (`{ $state: "result.<field>" }`).
  const first = JSON.parse(await invoke(draw, JSON.stringify({ count: 2 }), null)) as {
    drawn: string;
    cards: string[];
    commitment: string;
    dealt: number;
    countLabel: string;
  };
  expect(first.commitment).toMatch(COMMITMENT_RE);
  expect(first.countLabel).toBe("2 cards");
  expect(first.dealt).toBe(2);
  // The narration the model reads names the same cards the document lists — one draw, one truth.
  const drawn = first.drawn
    .split("\n")
    .map((line) => DRAW_LINE_RE.exec(line)?.[1])
    .filter((card): card is string => card !== undefined);
  expect(drawn).toEqual(first.cards);
  expect(drawn).toHaveLength(2);

  // THE FAIRNESS CHECK, performed the way a suspicious player would: reveal the seed, then confirm the cards
  // that were dealt really are the first cards of the order that seed produces.
  const revealed = await invoke(reveal, "{}", null);
  expect(revealed).toContain("Seed: ");
  expect(revealed).toContain("Cards dealt: 2");
  const order = (revealed.split("Full order: ")[1] ?? "").split(", ");
  expect(order.slice(0, 2)).toEqual(drawn);

  // The reveal RETIRES the session: the next draw commits to a fresh shuffle rather than dealing on from a
  // seed everybody can now see.
  const afterReveal = JSON.parse(await invoke(draw, JSON.stringify({ count: 1 }), null)) as { commitment: string; dealt: number };
  expect(afterReveal.commitment).toMatch(COMMITMENT_RE);
  expect(afterReveal.commitment).not.toBe(first.commitment);
  expect(afterReveal.dealt).toBe(1);
});

test("draft polish: the real bundle registers a user_input transform that tidies a draft", async () => {
  const db = await freshDb();
  const { ops, captured } = recordingOps(db, new Map());
  const h = makePluginHarness(db, { port: realHost(), ops });
  const caller = ownerPrincipalFor(await seedUser(db, { handle: castId<Handle>("owner") }));

  await installGrantEnable({ h, caller, slug: "draft-polish", grant: ["chat.transform"] });
  expect(captured.transforms.map((t) => ({ name: t.name, point: t.point }))).toEqual([{ name: "typography", point: "user_input" }]);

  // The transform is re-entered with ONE `{draft, env}` object — the same single-arg seam the domain
  // registrar's `buildPluginPromptTransform` uses — and the STRING return is the new draft.
  const invoke = requireInvoke(captured);
  const apply = requireHandler(captured.transforms, 0, "transform");
  const env = { chatId: "chat_1", vars: {} };
  expect(await invoke(apply, JSON.stringify({ draft: "he paused...  then  spoke , quietly  ", env }), null)).toBe("he paused… then spoke, quietly");

  // A room that opted out through its own variables gets the draft back untouched — the courtesy an
  // always-on transform owes its users, and proof the synchronous `env.vars` read reaches the guest.
  const optedOut = JSON.stringify({ draft: "leave  me   alone...", env: { chatId: "chat_1", vars: { polishOff: "1" } } });
  expect(await invoke(apply, optedOut, null)).toBe("leave  me   alone...");
});

test("scene chips: the real bundle offers chips on a long narrator beat, once per cooldown", async () => {
  const db = await freshDb();
  const { ops, captured } = recordingOps(db, new Map());
  const h = makePluginHarness(db, { port: realHost(), ops });
  const caller = ownerPrincipalFor(await seedUser(db, { handle: castId<Handle>("owner") }));

  await installGrantEnable({ h, caller, slug: "scene-chips", grant: ["chat.read", "chat.quick_reply", "storage.kv", "events.subscribe"] });
  const invoke = requireInvoke(captured);
  const handler = requireHandler(captured.events, 0, "event handler");
  const beat = "The vault door groans open. ".repeat(20); // Past the plugin's 400-char long-beat floor.

  // A short member line is not a stall: no chips.
  await invoke(handler, messageFact(CHAT, "ok", "user"), chatScope(CHAT, true));
  expect(captured.chips).toHaveLength(0);

  // A long narrator beat opens the doors.
  await invoke(handler, messageFact(CHAT, beat, "assistant"), chatScope(CHAT, true));
  expect(captured.chips).toHaveLength(1);
  expect(captured.chips[0]?.map((c) => c.label)).toEqual(["Continue", "Time skip", "New scene"]);

  // A second long beat inside the cooldown is silent — the plugin's OWN debounce, since plugin chips carry
  // no host-side rate belt at all.
  await invoke(handler, messageFact(CHAT, beat, "assistant"), chatScope(CHAT, true));
  expect(captured.chips).toHaveLength(1);
});

test("the per-user seeder lands every example installed, disabled and UNGRANTED — and re-runs are a no-op", async () => {
  const db = await freshDb();
  const h = makePluginHarness(db, { port: realHost(), ops: makeInertOps() });
  const caller = ownerPrincipalFor(await seedUser(db, { handle: castId<Handle>("owner") }));
  let latched = false;

  const seeder = createExamplePluginSeeder({
    packBundle: packSeedPluginBundle,
    install: async ({ caller: principal, bundle }) => await h.service.install({ caller: principal, bundle, grant: [] }),
    requestConsent: async ({ caller: principal, pluginId }) => {
      await h.service.setGrant({ caller: principal, pluginId, grant: [], acknowledgedNetHosts: [] });
    },
    alreadyInstalled: async (principal, slug) => (await h.service.list({ caller: principal })).some((row) => row.slug === slug),
    isSeeded: (): Promise<boolean> => Promise.resolve(latched),
    markSeeded: (): Promise<void> => {
      latched = true;
      return Promise.resolve();
    },
  });

  await seeder.ensureSeeded(caller);
  const rows = await h.service.list({ caller });
  expect(rows.map((r) => r.slug).sort()).toEqual([...EXAMPLE_PLUGIN_SLUGS].sort());
  // THE CONSENT POSTURE, asserted on every row: present, off, allowed nothing, and standing an ask.
  for (const row of rows) {
    expect(row.status, row.slug).toBe("disabled");
    expect(row.grantedCapabilities, row.slug).toEqual([]);
    expect(row.reconsentPending, row.slug).toBe(true);
    expect(row.declaredCapabilities.length, row.slug).toBeGreaterThan(0);
  }
  expect(latched).toBe(true);

  // The in-process memo makes a second call free; clearing it and re-running must still mint nothing (the
  // persisted latch is the DELETION-RESPECT guard — an example the user removed must not come back).
  await seeder.ensureSeeded(caller);
  expect(await h.service.list({ caller })).toHaveLength(EXAMPLE_PLUGIN_SLUGS.length);
});

/** The install-time refusals a copied example must not trip: the packer emits EXACTLY the two admitted entries,
 *  and every seeded manifest is one the real trust edge accepts. A third entry, an over-cap file or a manifest
 *  typo would be an install-time refusal for every user on their first request — and the SEEDER'S OWN TUPLE is
 *  the list under test, never a hand-written copy of it, so a sixth example is covered the day it is added. */
test("every seeded example packs to a bundle the real install verb accepts", async () => {
  const db = await freshDb();
  const h = makePluginHarness(db, { port: realHost(), ops: makeInertOps() });
  const caller = ownerPrincipalFor(await seedUser(db, { handle: castId<Handle>("owner") }));
  const ids: PluginId[] = [];
  for (const slug of EXAMPLE_PLUGIN_SLUGS) {
    const bundle = await packSeedPluginBundle(slug);
    expect(bundle, `${slug} has no packable source directory`).not.toBeNull();
    const row = await h.service.install({ caller, bundle: bundle as Uint8Array, grant: [] });
    expect(row.slug).toBe(slug);
    ids.push(row.id);
  }
  expect(ids).toHaveLength(EXAMPLE_PLUGIN_SLUGS.length);
});
