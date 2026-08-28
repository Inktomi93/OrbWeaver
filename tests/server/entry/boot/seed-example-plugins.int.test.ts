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
import type { ChatId, Handle, MessageId, PluginId } from "@orb/kit/ids";
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
  /** The collected VALUE macros (plugin-ui-plane §5.15) — guest-local names; the registrar namespaces them. */
  readonly macros: { readonly name: string; readonly handler: PluginHandlerRef }[];
  /** The collected private-event subscriptions (§5a) — `(emitterSlug, name)` channel coordinates. */
  readonly pubsubSubs: { readonly emitterSlug: string; readonly name: string; readonly handler: PluginHandlerRef }[];
  /** Every `pubsub.emit` the guests fired, in order — the announce half of the composition demo. */
  readonly pubsubEmits: { readonly emitterSlug: string; readonly name: string; readonly data: Record<string, unknown> }[];
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
  const captured: Captured = { events: [], tools: [], transforms: [], macros: [], pubsubSubs: [], pubsubEmits: [], chips: [], invoke: null, scope: null };
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
    pubsub: {
      emit: ({ emitterSlug, name, data }): Promise<void> => {
        captured.pubsubEmits.push({ emitterSlug, name, data });
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
      registerMacros: (macros, invoke, scope): PluginRegistrationHandle => {
        for (const macro of macros) {
          captured.macros.push({ name: macro.name, handler: macro.handler });
        }
        captured.invoke = invoke;
        captured.scope = scope;
        return noop;
      },
      subscribeEvent: (subscriptions, invoke, scope): PluginRegistrationHandle => {
        for (const sub of subscriptions) {
          captured.events.push({ type: sub.type, handler: sub.handler });
        }
        captured.invoke = invoke;
        captured.scope = scope;
        return noop;
      },
      subscribePubsub: (subscriptions, invoke, scope): PluginRegistrationHandle => {
        for (const sub of subscriptions) {
          captured.pubsubSubs.push({ emitterSlug: sub.emitterSlug, name: sub.name, handler: sub.handler });
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
  const grant: readonly PluginCapability[] = ["storage.kv", "tools.register", "ui.surface", "chat.transform", "plugin_events"];
  await h.service.setGrant({ caller, pluginId: installed.id, grant: [...grant], acknowledgedNetHosts: [] });
  await h.service.setEnabled({ caller, pluginId: installed.id, enabled: true });
  expect((await h.service.list({ caller }))[0]?.status).toBe("enabled");

  // BOTH tools reached the registrar — the guest-local names the host then prefixes to `plugin_oracle_deck_*`.
  expect(captured.tools.map((t) => t.name)).toEqual(["draw", "reveal"]);
  // …and so did the OMEN value macro (§5.15) — guest-local name here; the registrar namespaces it.
  expect(captured.macros.map((m) => m.name)).toEqual(["omen"]);
  const invoke = requireInvoke(captured);
  const draw = requireHandler(captured.tools, 0, "tool");
  const reveal = requireHandler(captured.tools, 1, "tool");
  const omen = requireHandler(captured.macros, 0, "macro");

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
    // …and the U6 per-row mark — the smallest legal `message-footer` occupant (one static badge).
    expect.objectContaining({ id: "table_mark", anchor: "message-footer", tier: "static" }),
  ]);

  // The two COMMANDS the same activation registered — what `/plugin oracle-deck draw` and the Plugins wand menu
  // both dispatch against. The SLUG is projected here (only this side knows it), which is the first token of the
  // dispatch grammar. `draw` declares the #791 TYPED ARGS (projected so both client surfaces can collect +
  // autocomplete them); `reveal` declares none, so its `args` projects EMPTY — the two shapes side by side.
  const commands = await h.service.listCommands({ caller });
  expect(commands).toEqual([
    expect.objectContaining({ pluginId: installed.id, slug: "oracle-deck", pluginName: "Oracle Deck", name: "draw" }),
    expect.objectContaining({ pluginId: installed.id, slug: "oracle-deck", pluginName: "Oracle Deck", name: "reveal", args: [] }),
  ]);
  expect(commands[0]?.args).toEqual([
    expect.objectContaining({ name: "count", type: "number" }),
    expect.objectContaining({ name: "spread", type: "enum", enumValues: ["single", "past_present_future"] }),
  ]);

  // The macro BEFORE any draw: an open question resolves to "" — the macro plane's degrade-to-empty idiom,
  // never a throw and never placeholder text a prompt would then carry.
  expect(await invoke(omen, "{}", null)).toBe("");

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

  // The macro AFTER a draw: the omen is the MOST RECENT card dealt — the same truth the result document told
  // the model. One draw, one truth, three readers (model, card, macro).
  expect(await invoke(omen, "{}", null)).toBe(first.cards[1]);

  // The draw was ANNOUNCED on the private plugin-event plane (§5a): the composition half scene-chips listens
  // to. The payload carries everything a subscriber needs (a pubsub handler runs with NO chat scope).
  expect(captured.pubsubEmits).toEqual([
    { emitterSlug: "oracle-deck", name: "draw", data: { cards: first.cards, dealt: 2, commitment: first.commitment, deckSize: 22 } },
  ]);

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

test("draft polish: the DISPLAY transform typesets the viewer's own screen and leaves code spans alone", async () => {
  const db = await freshDb();
  const { ops } = recordingOps(db, new Map());
  const h = makePluginHarness(db, { port: realHost(), ops });
  const caller = ownerPrincipalFor(await seedUser(db, { handle: castId<Handle>("owner") }));

  await installGrantEnable({ h, caller, slug: "draft-polish", grant: ["chat.transform"] });

  // The REAL per-row round-trip (seam 14): the caller submits the text their client already rendered, the
  // resident's `registerDisplay` handler runs under the deadline, and the annotated text comes back. Smart
  // quotes + em dash + ellipsis prove the display seam is BOLDER than the prompt seam (which never curls a
  // quote) — and the backtick span survives byte-for-byte, because pre-markdown text is what this seam sees.
  const result = await h.service.transformForDisplay({
    caller,
    chatId: castId<ChatId>("chat_1"),
    messageId: castId<MessageId>("msg_1"),
    text: 'She said "wait..." -- then ran `echo "hi"` twice.',
  });
  expect(result).toEqual({ text: 'She said “wait…”—then ran `echo "hi"` twice.' });
});

test("scene chips: the real bundle offers chips on a long narrator beat, once per cooldown", async () => {
  const db = await freshDb();
  const { ops, captured } = recordingOps(db, new Map());
  const h = makePluginHarness(db, { port: realHost(), ops });
  const caller = ownerPrincipalFor(await seedUser(db, { handle: castId<Handle>("owner") }));

  await installGrantEnable({ h, caller, slug: "scene-chips", grant: ["chat.read", "chat.quick_reply", "storage.kv", "events.subscribe", "plugin_events"] });
  const invoke = requireInvoke(captured);
  const handler = requireHandler(captured.events, 0, "event handler");
  const beat = "The vault door groans open. ".repeat(20); // Past the plugin's 400-char long-beat floor.

  // The private-event subscription was collected: `(oracle-deck, draw)` — the composition demo's listening half.
  expect(captured.pubsubSubs.map((s) => ({ emitterSlug: s.emitterSlug, name: s.name }))).toEqual([{ emitterSlug: "oracle-deck", name: "draw" }]);

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

  // THE COMPOSITION PAYOFF: an oracle draw arrives on the private plane — delivered EXACTLY as the bus does
  // it, `{name, data}` with a NULL chat scope (a pubsub handler has no room) — and the NEXT long beat offers a
  // FOURTH, omen-flavored door. A second room dodges the per-room cooldown the second beat above just claimed.
  const pubsubHandler = requireHandler(captured.pubsubSubs, 0, "pubsub subscription");
  await invoke(pubsubHandler, JSON.stringify({ name: "draw", data: { cards: ["The Storm"], dealt: 1, commitment: "0000000001", deckSize: 22 } }), null);
  const otherRoom = castId<ChatId>("chat_2");
  await invoke(handler, messageFact(otherRoom, beat, "assistant"), chatScope(otherRoom, true));
  expect(captured.chips).toHaveLength(2);
  expect(captured.chips[1]?.map((c) => c.label)).toEqual(["Continue", "Time skip", "New scene", "Follow the omen"]);
  expect(captured.chips[1]?.at(-1)?.sendText).toContain("The Storm");
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

/** The install-time refusals a copied example must not trip: the packer emits only ADMITTED entries, and every
 *  seeded manifest is one the real trust edge accepts. An unknown entry, an over-cap file, a manifest typo — or
 *  (since U4) a `ui.js` whose presence disagrees with its manifest's `uiEntry` in either direction — would be an
 *  install-time refusal for every user on their first request. The SEEDER'S OWN TUPLE is the list under test,
 *  never a hand-written copy of it, so a sixth example is covered the day it is added. */
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

/** THE GRANT-GUARD RECEIPT (#774 comment 1). A user may tick some capabilities and leave `ui.surface`
 *  unticked — their call, and the plugin must DEGRADE TO HEADLESS, not die at activation: an unguarded
 *  `host.ui.register` throws `PluginCapabilityError` while `main.js` evaluates, which takes the WHOLE plugin
 *  down (no event handler, no tools) over a decoration. The correct idiom is the oracle's feature-detect
 *  (`host.grants.includes("ui.surface")`), and this pin holds every UI-registering example to it: activation
 *  under a UI-less grant must still collect the plugin's non-UI registrations and reach its ready line.
 *  (Red-first: the pre-fix affinity-tracker failed exactly here — enable succeeded but the guest crashed
 *  before `events.on`, so `captured.events` came back EMPTY.) */
test("affinity tracker: a grant without ui.surface still activates headless — the guard idiom", async () => {
  const db = await freshDb();
  const { ops, captured } = recordingOps(db, new Map());
  const h = makePluginHarness(db, { port: realHost(), ops });
  const caller = ownerPrincipalFor(await seedUser(db, { handle: castId<Handle>("owner") }));

  const headlessGrant: readonly PluginCapability[] = ["chat.read", "storage.kv", "notify", "llm.quiet", "events.subscribe"];
  await installGrantEnable({ h, caller, slug: "affinity-tracker", grant: headlessGrant });

  // The non-UI half survived: the messageCommitted subscription was collected and the guest reached its
  // ready line (which prints AFTER every registration in the file — so it doubles as "nothing above threw").
  expect(captured.events.map((e) => e.type)).toEqual(["messageCommitted"]);
  const invoke = requireInvoke(captured);
  const handler = requireHandler(captured.events, 0, "event handler");
  // One delivery through the real guest proves the handler is live (the debounce swallows it silently).
  await invoke(handler, messageFact(CHAT, "hello there"), chatScope(CHAT, true));
  const log = await h.service.getLog({ caller, pluginId: (await h.service.list({ caller }))[0]?.id as PluginId });
  expect(log.some((line) => line.message.includes("affinity tracker ready"))).toBe(true);
});

/** THE TIER-C END-TO-END RECEIPT (plugin-ui-plane #679 U4). The shipped `affinity-tracker` carries a third
 *  bundle entry, and this walks the whole path a browser walks: pack → the real install verb → the CAS → and
 *  back out through `getUiBundle`, which re-parses the stored zip rather than trusting anything cached. If the
 *  packer stops emitting `ui.js`, if the funnel stops admitting it, or if the verb stops finding it, the
 *  scripted surface silently never boots and NOTHING else goes red — which is exactly why this is pinned on a
 *  REAL example rather than a fixture. The sibling assertion is the other half of the same fact: an example
 *  with no client half answers `null`, which is a normal answer and not an error. */
test("the seeded scripted example round-trips its ui.js through install → CAS → getUiBundle", async () => {
  const db = await freshDb();
  const h = makePluginHarness(db, { port: realHost(), ops: makeInertOps() });
  const caller = ownerPrincipalFor(await seedUser(db, { handle: castId<Handle>("owner") }));

  const scripted = await packSeedPluginBundle("affinity-tracker");
  const installed = await h.service.install({ caller, bundle: scripted as Uint8Array, grant: [] });
  const source = await h.service.getUiBundle({ caller, pluginId: installed.id });
  expect(source, "affinity-tracker ships a ui.js and it must survive the round trip").not.toBeNull();
  // Not merely non-null: it is the REAL file. `orb.ui(1)` is the one door a scripted guest can open, so its
  // presence is what distinguishes the shipped client half from any other text that could land here.
  expect(source).toContain("orb.ui(1)");

  // A Tier-S example answers `null` — an absence, not a failure.
  const staticOnly = await packSeedPluginBundle("oracle-deck");
  const staticRow = await h.service.install({ caller, bundle: staticOnly as Uint8Array, grant: [] });
  expect(await h.service.getUiBundle({ caller, pluginId: staticRow.id })).toBeNull();
});
