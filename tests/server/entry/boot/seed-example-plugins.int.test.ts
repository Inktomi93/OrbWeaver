// The SHOWCASE PLUGIN examples, proven end to end on their REAL packed bytes — no hand-built bundle double.
// `packShowcaseBundle` zips the two source files exactly as the per-user seeder does, the real `install`
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

import type { VariablePrecondition, VariableWriteResult } from "@orb/contracts/chat";
import { historyFloor } from "@orb/contracts/chat";
import type { Principal } from "@orb/contracts/identity";
import type { InvocationChat, PluginCapability, PluginHandlerRef } from "@orb/contracts/plugin";
import type { Db } from "@orb/db";
import type { AssetId, ChatId, Handle, MessageId, PluginId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createNotificationsService } from "@orb/server/domain/notifications";
// The ALIASED front door, not a deep relative path: biome's type service cannot see through
// `../../../../packages/server/src/...` into a branded type, and it then mis-fires `useAwaitThenable` /
// `noUnnecessaryConditions` on perfectly typed code.
import type { PluginActivationScope, PluginHostOps, PluginHostPort, PluginInvokeHandler, PluginRegistrationHandle } from "@orb/server/domain/plugin";
import { buildPluginStorage, createSurfaceStatePublisher } from "@orb/server/domain/plugin";
import { createPluginHost } from "@orb/server/infra/plugin-host";
import { unzipSync, zipSync } from "fflate";
import type { ExamplePluginSeederDeps } from "../../../../packages/server/src/entry/boot/seed-example-plugins.ts";
import { createExamplePluginSeeder } from "../../../../packages/server/src/entry/boot/seed-example-plugins.ts";
import { packShowcaseBundle, readShowcaseManifest, SHOWCASE_PLUGIN_SLUGS } from "../../../../packages/showcase-plugins/src/index.ts";
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
  /** Every `host.ui.toast` the guests asked for, at the OP seam (the compose-wired outbox is a compose
   *  concern; the drive asserts what the guest SAID, not how chrome delivers it). */
  readonly toasts: { readonly level: string; readonly message: string }[];
  /** The per-activation invoke closure (crash-policy wrapped) — how a delivery/tool call actually re-enters. */
  invoke: PluginInvokeHandler | null;
  scope: PluginActivationScope | null;
}

/** A `PluginHostOps` that RECORDS its registrations, over the REAL plugin-private KV (the deck's state plane)
 *  and a scriptable global-variable read (the familiar's configuration plane). */
function recordingOps(db: Db, globals: Map<string, string>): { ops: PluginHostOps; captured: Captured } {
  const base = makeInertOps();
  const noop: PluginRegistrationHandle = { unregister: (): void => undefined };
  const captured: Captured = {
    events: [],
    tools: [],
    transforms: [],
    macros: [],
    pubsubSubs: [],
    pubsubEmits: [],
    chips: [],
    toasts: [],
    invoke: null,
    scope: null,
  };
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
    ui: {
      ...base.ui,
      toast: (_plugin, level, message): Promise<void> => {
        captured.toasts.push({ level, message });
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
  const bundle = await packShowcaseBundle(slug);
  expect(bundle, `${slug} has no packable source directory`).not.toBeNull();
  const installed = await h.service.install({ caller, bundle: bundle as Uint8Array, grant: [] });
  expect(installed.status).toBe("disabled");
  expect(installed.grantedCapabilities).toEqual([]);
  await h.service.setGrant({ caller, pluginId: installed.id, grant: [...grant], acknowledgedNetHosts: [...(args.netHosts ?? [])] });
  await h.service.setEnabled({ caller, pluginId: installed.id, enabled: true });
  const [view] = await h.service.list({ caller });
  expect(view?.["status"]).toBe("enabled");
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

const FAMILIAR_GRANT: readonly PluginCapability[] = [
  "chat.read",
  "worldinfo.write",
  "global_vars",
  "storage.kv",
  "events.subscribe",
  "net.fetch",
  "databank.ingest",
];

test("research familiar: the real bundle installs consent-first, and its messageCommitted handler actually fires", async () => {
  const db = await freshDb();
  const { ops, captured } = recordingOps(db, new Map());
  const h = makePluginHarness(db, { port: realHost(), ops });
  const caller = ownerPrincipalFor(await seedUser(db, { handle: castId<Handle>("owner") }));

  // THE SEEDED SEQUENCE, verbatim: install with an EMPTY grant, then the empty RE-GRANT that raises the
  // standing consent ask. The row can do nothing at all until a human answers it.
  const bundle = await packShowcaseBundle("research-familiar");
  expect(bundle).not.toBeNull();
  const installed = await h.service.install({ caller, bundle: bundle as Uint8Array, grant: [] });
  expect(installed.status).toBe("disabled");
  expect(installed.grantedCapabilities).toEqual([]);
  await h.service.setGrant({ caller, pluginId: installed.id, grant: [], acknowledgedNetHosts: [] });

  const [seeded] = await h.service.list({ caller });
  expect(seeded?.reconsentPending).toBe(true);
  expect(seeded?.declaredCapabilities).toEqual([...FAMILIAR_GRANT]);
  expect(seeded?.netHosts).toEqual(["en.wikipedia.org"]);

  // Consent — to everything EXCEPT `databank.ingest`, deliberately: the clip drive below proves the per-verb
  // grant gate, and a full grant would send the clip arm to a LIVE fetch (see the file header). A PARTIAL
  // grant leaves the consent ask STANDING (`refusalAfterGrant` — the unanswered capability keeps the row's
  // reconsent raised), and the plugin still runs under what WAS granted: consent is per-capability, not
  // all-or-nothing. Then run.
  const granted = FAMILIAR_GRANT.filter((cap) => cap !== "databank.ingest");
  await h.service.setGrant({ caller, pluginId: installed.id, grant: granted, acknowledgedNetHosts: ["en.wikipedia.org"] });
  expect((await h.service.list({ caller }))[0]?.reconsentPending).toBe(true);
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

  // The CLIP verb's per-verb grant gate: `databank.ingest` was deliberately left out of the grant above, so
  // the marker is admitted through the same debounce chain and then refused BY NAME — a warn log, never a
  // throw (a throw here would be a strike against the auto-disable counter over a capability the user simply
  // has not ticked). This is also the seam immediately before the outbound fetch, for the same CI reason.
  await invoke(handler, messageFact(CHAT, "keep the whole article ((clip: Aurora borealis))"), chatScope(CHAT, true));
  const afterClip = await h.service.getLog({ caller, pluginId: installed.id });
  expect(afterClip.some((line) => line.level === "warn" && line.message.includes("databank.ingest"))).toBe(true);
});

test("oracle deck: the real bundle registers both tools and a draw is verifiable against the reveal", async () => {
  const db = await freshDb();
  const { ops, captured } = recordingOps(db, new Map());
  const h = makePluginHarness(db, { port: realHost(), ops });
  const caller = ownerPrincipalFor(await seedUser(db, { handle: castId<Handle>("owner") }));

  const bundle = await packShowcaseBundle("oracle-deck");
  expect(bundle).not.toBeNull();
  const installed = await h.service.install({ caller, bundle: bundle as Uint8Array, grant: [] });
  const grant: readonly PluginCapability[] = ["storage.kv", "tools.register", "ui.surface", "chat.transform", "plugin_events"];
  await h.service.setGrant({ caller, pluginId: installed.id, grant: [...grant], acknowledgedNetHosts: [] });
  await h.service.setEnabled({ caller, pluginId: installed.id, enabled: true });
  expect((await h.service.list({ caller }))[0]?.["status"]).toBe("enabled");

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

// #1442 — A FENCE, AND LABELLED ONE. It PASSES against the pre-fix guest (measured: the old `main.js`
// restored from HEAD, this file re-run, exit 0), so it is not a defect proof and must not be read as one.
// The reason is worth recording, because #1442's own stated mechanism — "the plugin's handlers race inside
// ONE process" — does not survive the tree: `infra/plugin-host/port.ts` (its header: "the queue is a
// per-instance tail-promise chain") serializes every invoke on one resident, so a tool call, an event
// delivery and a panel action on the SAME instance cannot interleave. That queue was minted for the strictly
// worse version of this bug — concurrent `setInvocationChat` corrupting `chat.current()`/`automationDepth`.
//
// What this pins is therefore the PROPERTY, not the fix: two draws in flight at once against the real
// membrane and the real `plugin_kv` deal disjoint cards and account for every one of them. It goes red if
// either leg of that guarantee is removed — the invoke queue OR the guest's compare-and-set claim.
//
// The unserialized caller the CAS actually defends against is Tier C: `domain/plugin/verbs/ui-host-call.ts`
// calls the bridge directly, with no resident and no queue, and `storage.set` is UI-proxyable. No shipped
// example writes from a `ui.js` today, which is exactly why this could not be made red here.
test("oracle deck: two CONCURRENT draws claim DISJOINT cards — the shared session record never loses a write", async () => {
  const db = await freshDb();
  const { ops, captured } = recordingOps(db, new Map());
  const h = makePluginHarness(db, { port: realHost(), ops });
  const caller = ownerPrincipalFor(await seedUser(db, { handle: castId<Handle>("owner") }));

  await installGrantEnable({ h, caller, slug: "oracle-deck", grant: ["storage.kv", "tools.register", "ui.surface", "plugin_events"] });
  const invoke = requireInvoke(captured);
  const draw = requireHandler(captured.tools, 0, "tool");

  const [a, b] = await Promise.all([invoke(draw, JSON.stringify({ count: 2 }), null), invoke(draw, JSON.stringify({ count: 2 }), null)]);
  const first = JSON.parse(a) as { cards: string[]; dealt: number };
  const second = JSON.parse(b) as { cards: string[]; dealt: number };

  // No card is dealt twice — the property the commitment/reveal ceremony is worthless without.
  const all = [...first.cards, ...second.cards];
  expect(new Set(all).size).toBe(all.length);
  // …and the counter accounts for every card, so the reveal's "Cards dealt" is the truth.
  expect(Math.max(first.dealt, second.dealt)).toBe(all.length);
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

/** The two `UserSettings.onboarding` fields the seeder owns, as one mutable object a test can hand to several
 *  seeder INSTANCES in turn — which is what "the next boot" means here (the in-process memo makes a second
 *  `ensureSeeded` on the SAME instance a no-op by design, so a re-run test needs a fresh instance over the
 *  same persisted state). */
interface SeedLatch {
  seeded: boolean;
  versions: Record<string, string>;
}

/** The compose wiring (`entry/compose/services.ts`), against the harness's REAL plugin service and an
 *  in-memory settings latch. Every arm here mirrors a compose line; `overrides` is how one test narrows one
 *  of them (a missing bundle, a bumped version) without re-spelling the other eight. */
function seederDeps(h: ReturnType<typeof makePluginHarness>, latch: SeedLatch, overrides: Partial<ExamplePluginSeederDeps> = {}): ExamplePluginSeederDeps {
  return {
    packBundle: packShowcaseBundle,
    bundledVersion: async (slug): Promise<string | null> => (await readShowcaseManifest(slug))?.version ?? null,
    install: async ({ caller: principal, bundle }) => await h.service.install({ caller: principal, bundle, grant: [] }),
    upgrade: async ({ caller: principal, pluginId, bundle }): Promise<void> => {
      await h.service.upgrade({ caller: principal, pluginId, bundle });
    },
    requestConsent: async ({ caller: principal, pluginId }): Promise<void> => {
      await h.service.setGrant({ caller: principal, pluginId, grant: [], acknowledgedNetHosts: [] });
    },
    listHeld: async (principal) => (await h.service.list({ caller: principal })).map((row) => ({ slug: row.slug, pluginId: row.id, version: row.version })),
    isSeeded: (): Promise<boolean> => Promise.resolve(latch.seeded),
    markSeeded: (): Promise<void> => {
      latch.seeded = true;
      return Promise.resolve();
    },
    readSeededVersions: (): Promise<Readonly<Record<string, string>>> => Promise.resolve(latch.versions),
    writeSeededVersions: (_principal, versions): Promise<void> => {
      latch.versions = { ...versions };
      return Promise.resolve();
    },
    ...overrides,
  };
}

/** A REAL shipped bundle with one field changed: its manifest `version`. Used to stand in for "a later release
 *  of this showcase plugin" without committing a second copy of a bundle — the packer's fixed mtime is reused
 *  so the forged bytes stay a pure function of their inputs, exactly like the shipped ones. */
async function bundleAtVersion(slug: string, version: string): Promise<Uint8Array> {
  const packed = await packShowcaseBundle(slug);
  const entries = unzipSync(packed as Uint8Array);
  const manifest = JSON.parse(new TextDecoder().decode(entries["manifest.json"])) as Record<string, unknown>;
  manifest["version"] = version;
  const rebuilt: Record<string, [Uint8Array, { mtime: number }]> = {};
  for (const [name, bytes] of Object.entries(entries)) {
    rebuilt[name] = [name === "manifest.json" ? new TextEncoder().encode(JSON.stringify(manifest)) : bytes, { mtime: FORGED_BUNDLE_MTIME_MS }];
  }
  return zipSync(rebuilt);
}

/** The packer's own fixed stamp (`@orb/showcase-plugins`) — re-stated here rather than exported, because a
 *  TEST forging bytes is not a second packer and must not make the real one's constant part of an API. */
const FORGED_BUNDLE_MTIME_MS = 331_257_600_000;

test("the per-user seeder lands every example installed, disabled and UNGRANTED — and re-runs are a no-op", async () => {
  const db = await freshDb();
  const h = makePluginHarness(db, { port: realHost(), ops: makeInertOps() });
  const caller = ownerPrincipalFor(await seedUser(db, { handle: castId<Handle>("owner") }));
  const latch: SeedLatch = { seeded: false, versions: {} };

  const seeder = createExamplePluginSeeder(seederDeps(h, latch));

  await seeder.ensureSeeded(caller);
  const rows = await h.service.list({ caller });
  expect(rows.map((r) => r.slug).sort()).toEqual([...SHOWCASE_PLUGIN_SLUGS].sort());
  // THE CONSENT POSTURE, asserted on every row: present, off, allowed nothing, and standing an ask.
  for (const row of rows) {
    expect(row.status, row.slug).toBe("disabled");
    expect(row.grantedCapabilities, row.slug).toEqual([]);
    expect(row.reconsentPending, row.slug).toBe(true);
    expect(row.declaredCapabilities.length, row.slug).toBeGreaterThan(0);
  }
  expect(latch.seeded).toBe(true);

  // The in-process memo makes a second call free; clearing it and re-running must still mint nothing (the
  // persisted latch is the DELETION-RESPECT guard — an example the user removed must not come back).
  await seeder.ensureSeeded(caller);
  expect(await h.service.list({ caller })).toHaveLength(SHOWCASE_PLUGIN_SLUGS.length);
});

// #1411 — the LATCH IS A COMPLETENESS CLAIM, not a "the pass ran" claim. `seedOne` returning false for a
// bundle the pack could not produce was fed only into a log-line count, and `markSeeded` ran unconditionally
// after it — so ONE transiently missing bundle latched `examplePluginsSeeded` forever and every later boot
// short-circuited in `isSeeded` before `seedOne` could ever retry. The user silently lost that example for
// the life of the install. The file header's "a missing example skips ONE plugin, it does not fail the pass"
// still holds and is asserted here (the other eight land, nothing throws) — what changed is that an
// incomplete pass no longer LATCHES.
test("a MISSING bundle does not latch — the incomplete pass retries and completes once the bundle appears", async () => {
  const db = await freshDb();
  const h = makePluginHarness(db, { port: realHost(), ops: makeInertOps() });
  const caller = ownerPrincipalFor(await seedUser(db, { handle: castId<Handle>("owner") }));
  const latch: SeedLatch = { seeded: false, versions: {} };
  // A MUTABLE HOLDER, not a bare `let`: biome narrows a `let x = true` initializer and then calls the guard
  // below "always truthy", while a property read is opaque to that narrowing. Same value, no suppression.
  const pack: { absent: boolean } = { absent: true };
  const missingSlug = "oracle-deck";

  const seeder = createExamplePluginSeeder(
    seederDeps(h, latch, { packBundle: async (slug) => (pack.absent && slug === missingSlug ? null : await packShowcaseBundle(slug)) }),
  );

  await seeder.ensureSeeded(caller);
  // The pass did NOT fail: every other example is installed (the header's per-slug tolerance, preserved).
  expect((await h.service.list({ caller })).map((r) => r.slug).sort()).toEqual([...SHOWCASE_PLUGIN_SLUGS].filter((s) => s !== missingSlug).sort());
  // …but it was INCOMPLETE, so it must stay retryable — both the persisted latch and the in-process memo.
  expect(latch.seeded).toBe(false);

  pack.absent = false;
  await seeder.ensureSeeded(caller);
  expect((await h.service.list({ caller })).map((r) => r.slug).sort()).toEqual([...SHOWCASE_PLUGIN_SLUGS].sort());
  expect(latch.seeded).toBe(true);
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
  for (const slug of SHOWCASE_PLUGIN_SLUGS) {
    const bundle = await packShowcaseBundle(slug);
    expect(bundle, `${slug} has no packable source directory`).not.toBeNull();
    const row = await h.service.install({ caller, bundle: bundle as Uint8Array, grant: [] });
    expect(row.slug).toBe(slug);
    ids.push(row.id);
  }
  expect(ids).toHaveLength(SHOWCASE_PLUGIN_SLUGS.length);
});

/** The live value of one key in a room's variable store — `null` for an unset key, which is the reading a
 *  `{ expected: null }` belief claims (and is NOT the same as the empty string). */
function liveVar(vars: Record<string, string>, key: string): string | null {
  return Object.hasOwn(vars, key) ? (vars[key] ?? null) : null;
}

/** The `stale` refusal for a belief set that no longer holds, or `null` when every belief still holds — the
 *  compare-and-set half of the room-variable store (#1555), reproduced faithfully because a guest that retries
 *  on a refusal is only exercised by a store that can REFUSE. */
function casRefusal(vars: Record<string, string>, beliefs: readonly VariablePrecondition[]): VariableWriteResult | null {
  if (beliefs.every((b) => liveVar(vars, b.key) === b.expected)) {
    return null;
  }
  return { outcome: "stale", actual: Object.fromEntries(beliefs.map((b) => [b.key, liveVar(vars, b.key)])) };
}

test("story clocks: variables are the room-state plane, the tool ticks, and a human fill asks for a turn", async () => {
  const db = await freshDb();
  const { ops: recorded, captured } = recordingOps(db, new Map());
  // The ROOM-STATE fakes this archetype is about: a per-room chat-variable store the delta seam mutates, and
  // a `requestTurn` capture — both riding the exact op signatures compose wires.
  const roomVars = new Map<string, Record<string, string>>();
  const turnRequests: { readonly chatId: ChatId; readonly guided?: string }[] = [];
  /** A ONE-SHOT racing writer, fired inside the next CONDITIONAL write — the window between the guest's read
   *  and its write, which is where the lost tick lives (#1555) and which nothing else in this harness can
   *  reach. Armed by the compare-and-set arm at the bottom of this test. */
  let interloper: (() => void) | null = null;
  /** Fire the armed interloper (once) if this write carries beliefs — i.e. only on the CAS path under test. */
  const raceOnce = (beliefs: readonly VariablePrecondition[] | undefined): void => {
    if (interloper === null || (beliefs?.length ?? 0) === 0) {
      return;
    }
    const fire = interloper;
    interloper = null;
    fire();
  };
  const ops: PluginHostOps = {
    ...recorded,
    chat: {
      ...recorded.chat,
      getVariables: (chatId): Promise<Record<string, string>> => Promise.resolve({ ...(roomVars.get(chatId) ?? {}) }),
      applyVariableOps: (chatId, varOps, beliefs): Promise<VariableWriteResult> => {
        raceOnce(beliefs);
        const vars = roomVars.get(chatId) ?? {};
        // A violated belief writes NOTHING and hands back what the keys actually read (see `casRefusal`).
        const refusal = casRefusal(vars, beliefs ?? []);
        if (refusal !== null) {
          return Promise.resolve(refusal);
        }
        for (const op of varOps) {
          if (op.op === "set") {
            vars[op.key] = op.value;
          } else if (op.op === "delete") {
            delete vars[op.key];
          }
        }
        roomVars.set(chatId, vars);
        return Promise.resolve({ outcome: "applied" });
      },
      requestTurn: (req): Promise<void> => {
        turnRequests.push({ chatId: req.chatId, ...(req.guided === undefined ? {} : { guided: req.guided }) });
        return Promise.resolve();
      },
    },
    // The REAL state-plane publisher over the harness's OWN store (late-bound: the store is minted inside
    // `makePluginHarness`), so `host.ui.setState` lands where `getSurfaceState` reads — the compose wiring,
    // reproduced with the compose factory rather than a hand-rolled fake.
    ui: {
      ...recorded.ui,
      setState: (req): Promise<void> => publishState(req),
    },
  };
  const h = makePluginHarness(db, { port: realHost(), ops });
  const publishState = createSurfaceStatePublisher(h.ctx.surfaceState, () => undefined);
  const caller = ownerPrincipalFor(await seedUser(db, { handle: castId<Handle>("owner") }));

  const pluginId = await installGrantEnable({
    h,
    caller,
    slug: "story-clocks",
    grant: ["chat.read", "chat.variables.write", "turn.trigger", "events.subscribe", "tools.register", "ui.surface"],
  });

  // The collected shape: one verb tool, the chatOpened hydration, and the two room surfaces — a read-only
  // flank and the HOST-band panel (the anchor the host-controls family mounts host-gated).
  expect(captured.tools.map((t) => t.name)).toEqual(["advance_clock"]);
  expect(captured.events.map((e) => e.type)).toEqual(["chatOpened"]);
  expect(await h.service.listSurfaces({ caller })).toEqual([
    expect.objectContaining({ id: "clock_flank", anchor: "chat-flank", tier: "static" }),
    expect.objectContaining({ id: "clock_panel", anchor: "chat-settings-section", tier: "static" }),
  ]);

  // THE MODEL'S PATH: `advance_clock` starts a clock on first mention, and the write lands in the ROOM'S OWN
  // variable plane — the same store {{getvar}} macros and CEL predicates read.
  const invoke = requireInvoke(captured);
  const tool = requireHandler(captured.tools, 0, "tool");
  expect(await invoke(tool, JSON.stringify({ name: "The Ritual", segments: 4 }), chatScope(CHAT, true))).toContain('Started the clock "the ritual" at 1/4');
  expect(roomVars.get(CHAT)?.["clock:the_ritual"]).toBe("1/4");

  // Ticks advance; the MODEL filling a clock reports the fill IN PROSE and does NOT request a turn (the model
  // is already narrating — the requestTurn arm belongs to the human path only).
  await invoke(tool, JSON.stringify({ name: "the ritual" }), chatScope(CHAT, true));
  await invoke(tool, JSON.stringify({ name: "the ritual" }), chatScope(CHAT, true));
  const full = await invoke(tool, JSON.stringify({ name: "the ritual" }), chatScope(CHAT, true));
  expect(full).toContain("FULL");
  expect(roomVars.get(CHAT)?.["clock:the_ritual"]).toBe("4/4");
  expect(turnRequests).toHaveLength(0);

  // THE HUMAN'S PATH: the host-band panel's actions, through the REAL `invokeUiAction` round-trip (the room is
  // a verified claim; the handler receives its opaque handle). Start a second clock, tick it to the fill…
  const act = (actionId: string, values: Record<string, string>): ReturnType<typeof h.service.invokeUiAction> =>
    h.service.invokeUiAction({ caller, pluginId, surfaceId: "clock_panel", actionId, values, chatId: CHAT });
  await act("start", { name: "The Omen", segments: "4" });
  expect(roomVars.get(CHAT)?.["clock:the_omen"]).toBe("0/4");
  // Every action ANSWERS with a toast — asserted at the op seam (the guest's ask; chrome delivery is a
  // compose concern this harness fakes).
  expect(captured.toasts.some((t) => t.message.includes("starts at 0/4"))).toBe(true);
  for (let i = 0; i < 3; i += 1) {
    await act("tick", { name: "the omen", segments: "4" });
  }
  await act("tick", { name: "the omen", segments: "4" });
  // …and the FILL asks the narrator to land it: ONE requestTurn, guided by the clock's name.
  expect(roomVars.get(CHAT)?.["clock:the_omen"]).toBe("4/4");
  expect(turnRequests).toHaveLength(1);
  expect(turnRequests[0]?.guided).toContain("the omen");

  // `clear` deletes the variable — room state, so gone for every reader at once.
  await act("clear", { name: "the omen", segments: "4" });
  expect(roomVars.get(CHAT)?.["clock:the_omen"]).toBeUndefined();

  // THE HYDRATION IDIOM: `chatOpened` publishes the room's clocks to the PER-ROOM state plane, and the read
  // verb serves them back for exactly that room.
  const opened = requireHandler(captured.events, 0, "event handler");
  await invoke(opened, JSON.stringify({ type: "chatOpened", bus: "chat", chatId: CHAT }), chatScope(CHAT, true));
  const state = await h.service.getSurfaceState({ caller, pluginId, surfaceId: "clock_flank", chatId: CHAT });
  expect(String(state?.["line0"])).toContain("the ritual");
  expect(String(state?.["line0"])).toContain("4/4");

  // THE LOST TICK, CLOSED (#1555). A tick is read-modify-write, and this plugin's two writers do not see each
  // other: `advance_clock` rides the resident's serialized invoke queue, a panel button arrives on a fresh
  // bridge that never touches it. `interloper` fires INSIDE the write — the window between the guest's read
  // and its write, which no ordering of these two doors could otherwise reproduce.
  const vars = roomVars.get(CHAT) ?? {};
  vars["clock:the_ritual"] = "1/4";
  roomVars.set(CHAT, vars);
  interloper = (): void => {
    // Somebody else ticked it to 2/4 while the guest was computing 2/4 from 1/4. Unconditionally, this write
    // would land 2/4 and the interloper's tick would be gone.
    (roomVars.get(CHAT) ?? {})["clock:the_ritual"] = "2/4";
  };
  const raced = await invoke(tool, JSON.stringify({ name: "the ritual" }), chatScope(CHAT, true));

  // The guest's precondition ("I read 1/4") no longer held, the host refused AS DATA, and the guest re-derived
  // from `actual` — so BOTH ticks are in the number: 1/4 → (interloper) 2/4 → (retry) 3/4.
  expect(roomVars.get(CHAT)?.["clock:the_ritual"]).toBe("3/4");
  expect(raced).toContain("3/4");
  expect(interloper).toBeNull(); // the one-shot really fired — a planted control for the arm itself
});

test("pocket arcade: a one-capability frame plugin registers its document, and the bytes never reach the wire", async () => {
  const db = await freshDb();
  const { ops } = recordingOps(db, new Map());
  const h = makePluginHarness(db, { port: realHost(), ops });
  const caller = ownerPrincipalFor(await seedUser(db, { handle: castId<Handle>("owner") }));

  await installGrantEnable({ h, caller, slug: "pocket-arcade", grant: ["ui.frame"] });

  // The frame surface is REGISTERED and projected — tier `frame`, no `spec` (a frame renders its own
  // document, never a node tree).
  const surfaces = await h.service.listSurfaces({ caller });
  expect(surfaces).toEqual([expect.objectContaining({ id: "arcade_2048", anchor: "chat-flank", tier: "frame", title: "2048" })]);

  // THE BYTES-LEAK WALL: the document body hangs off the RESIDENT registration, never off the projected
  // meta — `PluginSurfaceView extends` the meta, so anything on the meta would ship to every listSurfaces
  // caller. Asserted the blunt way: the serialized projection contains none of the document's markup.
  const wire = JSON.stringify(surfaces);
  expect(wire).not.toContain("2048 board");
  expect(wire).not.toContain("<script>");
});

test("keepsake camera: the spend pipeline — structured quiet falls back, the paint is captured, the ARM C album navigates", async () => {
  const db = await freshDb();
  const { ops: recorded, captured } = recordingOps(db, new Map());
  const paints: { readonly prompt: string; readonly quiet: boolean }[] = [];
  const validAsset = castId<AssetId>("asset_01h455vb4pex5vsknk084sn02q");
  const ops: PluginHostOps = {
    ...recorded,
    chat: {
      ...recorded.chat,
      // The bridge clamps every canon read through the viewer-visibility verdict BEFORE it crosses the realm
      // boundary, and the inert default reports NO membership (an empty read) — so a member verdict is part of
      // the fixture, not a nicety: without it the camera correctly answers "nothing to photograph".
      resolveViewerVisibility: (): ReturnType<PluginHostOps["chat"]["resolveViewerVisibility"]> =>
        Promise.resolve({ role: "host", historyFloorSeq: historyFloor(0), readsHidden: true }),
      // Two beats on the record, so the local-fallback titling pass has something to borrow.
      listMessages: (): ReturnType<PluginHostOps["chat"]["listMessages"]> =>
        Promise.resolve([
          { id: "m1", role: "user", authorDisplayName: "Rowan", characterId: null, seq: 1, content: "We shelter under the broken aqueduct." },
          {
            id: "m2",
            role: "assistant",
            authorDisplayName: "Narrator",
            characterId: null,
            seq: 2,
            content: "Rain threads the arches; the lantern gutters but holds.",
          },
        ]),
    },
    imagery: {
      generatePicture: ({ args }): ReturnType<PluginHostOps["imagery"]["generatePicture"]> => {
        paints.push({ prompt: args.prompt ?? "", quiet: args.quiet });
        return Promise.resolve({ assetId: validAsset });
      },
    },
    // The REAL state-plane publisher, late-bound over the harness's own store (the story-clocks wiring).
    ui: { ...recorded.ui, setState: (req): Promise<void> => publishState(req) },
  };
  const h = makePluginHarness(db, { port: realHost(), ops });
  const publishState = createSurfaceStatePublisher(h.ctx.surfaceState, () => undefined);
  const caller = ownerPrincipalFor(await seedUser(db, { handle: castId<Handle>("owner") }));

  const pluginId = await installGrantEnable({
    h,
    caller,
    slug: "keepsake-camera",
    grant: ["chat.read", "storage.kv", "llm.quiet", "imagery.generate", "ui.surface"],
  });

  // The collected shape: one typed-args command and the ARM C album page (a masterDetail whose browse stage
  // is a BOUND grid and whose detail stage is a BOUND image — this passing the real registration validation
  // IS the receipt that the new vocabulary survives an actual activation over the WASM runtime).
  const commands = await h.service.listCommands({ caller });
  expect(commands).toEqual([expect.objectContaining({ name: "snapshot", slug: "keepsake-camera" })]);
  expect(commands[0]?.args?.map((arg) => arg.name)).toEqual(["style", "note"]);
  expect(await h.service.listSurfaces({ caller })).toEqual([expect.objectContaining({ id: "album_page", anchor: "page", tier: "static" })]);

  // THE SNAPSHOT, through the REAL command round-trip. The inert quiet op answers "" (an unusable titling), so
  // the LOCAL fallback titles it — the pipeline that cannot jam. The paint op captures the prompt: the style
  // suffix and the note both rode along, and `quiet:false` is the room-postcard posture (teaching point 2).
  await h.service.invokeUiCommand({ caller, pluginId, name: "snapshot", args: "", values: { style: "inkSketch", note: "keep the lantern lit" }, chatId: CHAT });
  expect(paints).toHaveLength(1);
  expect(paints[0]?.quiet).toBe(false);
  expect(paints[0]?.prompt).toContain("ink and wash");
  expect(paints[0]?.prompt).toContain("keep the lantern lit");
  expect(captured.toasts.some((t) => t.message.startsWith("Kept:"))).toBe(true);

  // The album published GLOBALLY (no chat key — a cross-room roll-up): one bound tile carrying the caught
  // asset, on the browse stage.
  const album = await h.service.getSurfaceState({ caller, pluginId, surfaceId: "album_page" });
  expect(album?.["stage"]).toBe("album");
  const tiles = album?.["tiles"] as readonly { id: string; assetId: AssetId }[];
  expect(tiles).toHaveLength(1);
  expect(tiles[0]?.assetId).toBe(validAsset);

  // Stage navigation is ordinary published state: `open` flips to the detail stage with the picked moment…
  await h.service.invokeUiAction({ caller, pluginId, surfaceId: "album_page", actionId: "open", values: { tile: tiles[0]?.id ?? "" } });
  const opened = await h.service.getSurfaceState({ caller, pluginId, surfaceId: "album_page" });
  expect(opened?.["stage"]).toBe("moment");
  expect((opened?.["detail"] as { assetId: AssetId }).assetId).toBe(validAsset);

  // …and `discard` forgets the album copy (the rooms keep their postcards) and returns home, empty.
  await h.service.invokeUiAction({ caller, pluginId, surfaceId: "album_page", actionId: "discard", values: {} });
  const after = await h.service.getSurfaceState({ caller, pluginId, surfaceId: "album_page" });
  expect(after?.["stage"]).toBe("album");
  expect(after?.["tiles"]).toEqual([]);
});

/** The flagship's CI slice, honest about its edge: like the familiar, the atlas's fetch arms (`safeFetch` has
 *  no injection seam) would be LIVE requests to two community hubs, so CI drives everything UP TO the wire —
 *  the ARM C page spec surviving a REAL registration, the activation-time publish, and the no-network action
 *  arms. The wire halves (search decode incl. the devalue un-flatten, paging, the tag filters, the reshape,
 *  the add-to-library import) were probed against both live hubs on 2026-08-29 and are the live side-eye
 *  drive's checklist. */
test("card atlas: the ARM C flagship page registers, publishes its empty browse state, and refuses gracefully off-line", async () => {
  const db = await freshDb();
  const { ops: recorded } = recordingOps(db, new Map());
  const ops: PluginHostOps = {
    ...recorded,
    ui: { ...recorded.ui, setState: (req): Promise<void> => publishState(req) },
  };
  const h = makePluginHarness(db, { port: realHost(), ops });
  const publishState = createSurfaceStatePublisher(h.ctx.surfaceState, () => undefined);
  const caller = ownerPrincipalFor(await seedUser(db, { handle: castId<Handle>("owner") }));

  const pluginId = await installGrantEnable({
    h,
    caller,
    slug: "card-atlas",
    grant: ["storage.kv", "ui.surface", "net.fetch", "net.fetch_asset", "character.ingest", "character.card_state"],
    // The acknowledged list mirrors the manifest EXACTLY (the anti-TOCTOU pin): nine hub APIs plus each
    // hub's art CDN — netHosts matching is exact-host, so every CDN is its own consent line. Sixteen
    // entries = NET_HOSTS_MAX exactly (v1.3 landed at the cap without a bump).
    netHosts: [
      "character-tavern.com",
      "ct-cards.storage.character-tavern.com",
      "realm.risuai.net",
      "sv.risuai.xyz",
      "api.chub.ai",
      "avatars.charhub.io",
      "api.wyvern.chat",
      "imagedelivery.net",
      "api.aicharactercards.com",
      "charavault.net",
      "botbooru.com",
      "server.pygmalion.chat",
      "assets.pygmalion.chat",
      "datacat.run",
      "media.datacat.run",
      "ella.janitorai.com",
    ],
  });

  // The masterDetail + searchBar + BOUND-grid page passed the REAL registration validation over the
  // WASM runtime — the flagship's whole vocabulary, end to end. v1.3 registers the default posture
  // SYNCHRONOUSLY at activation (a floated-only registration measurably raced this very read — the pin
  // that killed that design) and revises via the `ui.register` upsert when the kv SFW read lands; the
  // toEqual (not arrayContaining) is ALSO the upsert pin: a re-register that APPENDED instead of
  // replacing would project two atlas_page rows here.
  const surfaces = await h.service.listSurfaces({ caller });
  expect(surfaces).toEqual([expect.objectContaining({ id: "atlas_page", anchor: "page", tier: "static" })]);
  // The v1.3 spec shapes (card-atlas-next-level): the Hub + Sort selects and the SFW toggle stay
  // ALWAYS-VISIBLE (never inside the searchBar disclosure — that ruling survives), the Sort select's
  // options are BOUND per-hub vocabulary (`optionsFrom` — a hub only advertises orderings it honors),
  // the detail's stat sheet is BOUND rows (`rowsFrom` — each hub shows the counters it returned), the
  // TAG FILTERS are exactly what the disclosure holds, the pager row exists, the detail stage binds its
  // hero to runtime-fetched art (`assetFrom` — #798), and the plain-named "Add to library" stands.
  const spec = JSON.stringify(surfaces[0]?.["spec"] ?? {});
  expect(spec).toContain('"name":"source"');
  expect(spec).toContain('"name":"sort"');
  expect(spec).toContain('"optionsFrom":{"$state":"sortOptions"}');
  expect(spec).toContain('"name":"sfw"');
  expect(spec).toContain('"rowsFrom":{"$state":"detail.stats"}');
  expect(spec).toContain('"name":"include_tags"');
  expect(spec).toContain('"name":"exclude_tags"');
  expect(spec).toContain('"actionId":"prev_page"');
  expect(spec).toContain('"actionId":"next_page"');
  expect(spec).toContain('"label":"Add to library"');
  expect(spec).not.toContain("Summon");
  // #818: the decision CTA is the page's ONE primary, and it is the only claimant in the whole spec — so
  // the renderer's first-in-document-order grant lands on it and cannot drift to the pager or "Back".
  expect(spec).toContain('{"kind":"button","actionId":"add_to_library","label":"Add to library","variant":"primary"}');
  expect(spec.match(/"variant":"primary"/g)).toHaveLength(1);
  expect(spec).toContain('"assetFrom":{"$state":"detail.art"}');
  // The nine-hub roster rides the Hub select's declared options.
  for (const hub of ["tavern", "realm", "chub", "wyvern", "aicc", "charavault", "botbooru", "pygmalion", "datacat"]) {
    expect(spec).toContain(`"value":"${hub}"`);
  }
  // The DISCLOSURE holds ONLY the tag textFields — a select inside it would be the buried-switcher failure
  // the always-visible pin above exists to prevent. Structured read, not a substring: the filters array is
  // the searchBar's own field.
  const atlasSpec = surfaces[0]?.["spec"] as {
    stages: readonly { body: { children: readonly { kind: string; filters?: readonly { kind: string }[] }[] } }[];
  };
  const searchBar = atlasSpec.stages[0]?.body.children.find((node) => node.kind === "searchBar");
  expect(searchBar?.filters?.map((node) => node.kind)).toEqual(["textField", "textField"]);

  // The activation publish: an empty atlas is a PUBLISHABLE state (bound specs render only once state
  // lands) — and it carries the DEFAULT hub's sort menu (the bound select's vocabulary, v1.3).
  const initial = await h.service.getSurfaceState({ caller, pluginId, surfaceId: "atlas_page" });
  expect(initial?.["stage"]).toBe("browse");
  expect(initial?.["tiles"]).toEqual([]);
  expect(initial?.["sortOptions"]).toEqual(
    expect.arrayContaining([expect.objectContaining({ value: "relevance" }), expect.objectContaining({ value: "downloads", label: "Most downloaded" })]),
  );

  // The no-network arms (an empty query now legitimately BROWSES the hub, so its wire half moved to the live
  // drive's checklist): a pager click with no session answers in the status line, never a fetch; a stale tile
  // (no session — e.g. a respawn between search and click) folds the same way, never a crash.
  await h.service.invokeUiAction({ caller, pluginId, surfaceId: "atlas_page", actionId: "next_page", values: {} });
  const unpaged = await h.service.getSurfaceState({ caller, pluginId, surfaceId: "atlas_page" });
  expect(String(unpaged?.["status"])).toContain("Search first");
  await h.service.invokeUiAction({ caller, pluginId, surfaceId: "atlas_page", actionId: "open_result", values: { tile: "r0" } });
  const stale = await h.service.getSurfaceState({ caller, pluginId, surfaceId: "atlas_page" });
  expect(String(stale?.["status"])).toContain("stale");
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

  const scripted = await packShowcaseBundle("affinity-tracker");
  const installed = await h.service.install({ caller, bundle: scripted as Uint8Array, grant: [] });
  const source = await h.service.getUiBundle({ caller, pluginId: installed.id });
  expect(source, "affinity-tracker ships a ui.js and it must survive the round trip").not.toBeNull();
  // Not merely non-null: it is the REAL file. `orb.ui(1)` is the one door a scripted guest can open, so its
  // presence is what distinguishes the shipped client half from any other text that could land here.
  expect(source).toContain("orb.ui(1)");

  // A Tier-S example answers `null` — an absence, not a failure.
  const staticOnly = await packShowcaseBundle("oracle-deck");
  const staticRow = await h.service.install({ caller, bundle: staticOnly as Uint8Array, grant: [] });
  expect(await h.service.getUiBundle({ caller, pluginId: staticRow.id })).toBeNull();
});

/** THE FRESH-BOOT CONSENT ASK, END TO END (#1041 / #924 item 2). The nine examples land installed, disabled
 *  and ungranted — and BEFORE this row, nothing ever told the person. This is the receipt that the seeder's
 *  own pass now leaves exactly ONE durable inbox row saying how many plugins are waiting, addressed to the
 *  principal that OWNS them.
 *
 *  It is the join of the two halves pinned separately (`domain/plugin/substrate/consent-prompt.int.test.ts`
 *  decides the move; `domain/notifications/verbs/standing.int.test.ts` pins what each move does): here the
 *  REAL plugin verbs drive the REAL notifications service over the REAL packed bundles.
 *
 *  THE COUNT IS THE POINT, and it is why the ops are wired rather than recorded: the seeder installs all nine
 *  slugs CONCURRENTLY, so nine consent raises each finish and then ask "how many are pending now?". Without
 *  the producer's per-recipient serialisation the surviving row carries whichever count raced last, and a
 *  fresh boot could greet its owner with "7 plugins are waiting" while nine wait. RED-FIRST RECEIPT
 *  (2026-09-05, `git show HEAD:` sources): `items` was EMPTY. */
test("the seeder leaves the owner ONE durable ask that counts every waiting plugin", async () => {
  const db = await freshDb();
  const notifications = createNotificationsService({ db, now: (): number => FROZEN_AT_MS });
  const inert = makeInertOps();
  const ops: PluginHostOps = {
    ...inert,
    notifications: {
      ...inert.notifications,
      // The compose bodies, minus the transport publish (`entry/compose/automation-plugin.ts`).
      emitStanding: async (event): Promise<void> => {
        await notifications.record({ event, supersedeActiveOfSameType: true });
      },
      refreshStanding: async (event): Promise<void> => {
        await notifications.refreshStanding({ event });
      },
      retractStanding: async (req): Promise<void> => {
        await notifications.retract(req);
      },
    },
  };
  const h = makePluginHarness(db, { port: realHost(), ops });
  const caller = ownerPrincipalFor(await seedUser(db, { handle: castId<Handle>("owner") }));
  const latch: SeedLatch = { seeded: false, versions: {} };

  const seeder = createExamplePluginSeeder(seederDeps(h, latch));

  await seeder.ensureSeeded(caller);

  const inbox = await notifications.list({ principal: caller });
  expect(inbox.items).toHaveLength(1);
  expect(inbox.items[0]?.payload).toEqual({
    type: "plugins-awaiting-consent",
    recipientUserId: caller.userId,
    pendingCount: SHOWCASE_PLUGIN_SLUGS.length,
  });
  // Unread: the whole point is that it reaches the bell as something new.
  expect(inbox.items[0]?.readAt).toBeNull();

  // ANSWERING ONE DOES NOT RE-ASK: the standing row's number drops in place, same row, still one row.
  const [firstRow] = await h.service.list({ caller });
  await h.service.setGrant({
    caller,
    pluginId: firstRow?.id as PluginId,
    grant: firstRow?.declaredCapabilities ?? [],
    acknowledgedNetHosts: firstRow?.netHosts ?? [],
  });
  const after = await notifications.list({ principal: caller });
  expect(after.items).toHaveLength(1);
  expect(after.items[0]?.id).toBe(inbox.items[0]?.id);
  expect(after.items[0]?.payload).toEqual({
    type: "plugins-awaiting-consent",
    recipientUserId: caller.userId,
    pendingCount: SHOWCASE_PLUGIN_SLUGS.length - 1,
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────────
// #803 — THE AUTO-UPGRADE (owner-ruled 2026-09-05, arm (a)). The four arms of one decision, each with the
// state that decides it. Before this, `examplePluginsSeeded` gated the WHOLE pass, so an improved bundle
// (card-atlas 1.0.0 → 1.1.0) reached only a FRESH database and every existing install stayed on the old
// version until someone dropped their db. The upgrade half now runs on every pass and touches a row only
// when it is still exactly what this system last wrote.
//
// "The next boot" is a SECOND SEEDER INSTANCE over the SAME latch object, deliberately: the in-process memo
// makes a repeat `ensureSeeded` on one instance a no-op by design, so re-running through the same instance
// would prove nothing about the persisted state.
// ────────────────────────────────────────────────────────────────────────────────────────────────────

/** The slug these four use: Tier-S (no `ui.js`), so a forged bundle stays a two-entry zip. */
const UPGRADE_SLUG = "draft-polish";

async function seedOnce(h: ReturnType<typeof makePluginHarness>, latch: SeedLatch, caller: Principal): Promise<void> {
  await createExamplePluginSeeder(seederDeps(h, latch)).ensureSeeded(caller);
}

type ListedPlugin = Awaited<ReturnType<ReturnType<typeof makePluginHarness>["service"]["list"]>>[number];

/** One slug's row out of a `plugin.list` read, or `undefined` when the caller does not hold it — which is
 *  itself an assertion subject here (the deleted arm). */
function rowFor(rows: readonly ListedPlugin[], slug: string): ListedPlugin | undefined {
  return rows.find((row) => row.slug === slug);
}

test("#803 a NEWER bundle reaches a PRISTINE seeded install — same row, upgraded in place", async () => {
  const db = await freshDb();
  const h = makePluginHarness(db, { port: realHost(), ops: makeInertOps() });
  const caller = ownerPrincipalFor(await seedUser(db, { handle: castId<Handle>("owner") }));
  const latch: SeedLatch = { seeded: false, versions: {} };

  await seedOnce(h, latch, caller);
  const before = rowFor(await h.service.list({ caller }), UPGRADE_SLUG);
  expect(before).toBeDefined();
  // The install half recorded OUR provenance — that record is what makes the row recognisable as ours later.
  expect(latch.versions[UPGRADE_SLUG]).toBe(before?.version);

  // The next release of that showcase plugin.
  const shipped = "9.9.9";
  const nextBoot = createExamplePluginSeeder(
    seederDeps(h, latch, {
      packBundle: async (slug) => (slug === UPGRADE_SLUG ? await bundleAtVersion(slug, shipped) : await packShowcaseBundle(slug)),
      bundledVersion: async (slug): Promise<string | null> => (slug === UPGRADE_SLUG ? shipped : ((await readShowcaseManifest(slug))?.version ?? null)),
    }),
  );
  await nextBoot.ensureSeeded(caller);

  const after = rowFor(await h.service.list({ caller }), UPGRADE_SLUG);
  expect(after?.version).toBe(shipped);
  // The SAME row, not a re-install: the plugin id is the FK every `plugin_kv` key and surface state hangs
  // off, so a new id would silently orphan everything the user's copy had accumulated.
  expect(after?.id).toBe(before?.id);
  // The consent posture survives the upgrade untouched — still nothing granted, still off.
  expect(after?.grantedCapabilities).toEqual([]);
  expect(after?.status).toBe("disabled");
  // …and the provenance advanced, so the NEXT release compares against what we actually wrote.
  expect(latch.versions[UPGRADE_SLUG]).toBe(shipped);
});

test("#803 a DIVERGED install is left alone — the user has taken the plugin over", async () => {
  const db = await freshDb();
  const h = makePluginHarness(db, { port: realHost(), ops: makeInertOps() });
  const caller = ownerPrincipalFor(await seedUser(db, { handle: castId<Handle>("owner") }));
  const latch: SeedLatch = { seeded: false, versions: {} };

  await seedOnce(h, latch, caller);
  const seeded = rowFor(await h.service.list({ caller }), UPGRADE_SLUG);
  // The user replaces it with their own build, through the real upgrade verb — the row moves to a version
  // this system never wrote, which is the plugin domain's own divergence oracle
  // (`verbs/uninstall-for-all-users.ts`: a `version-diverged` row is one its owner has taken over).
  await h.service.upgrade({ caller, pluginId: seeded?.id as PluginId, bundle: await bundleAtVersion(UPGRADE_SLUG, "5.0.0") });
  expect(rowFor(await h.service.list({ caller }), UPGRADE_SLUG)?.version).toBe("5.0.0");

  const shipped = "9.9.9";
  await createExamplePluginSeeder(
    seederDeps(h, latch, {
      packBundle: async (slug) => (slug === UPGRADE_SLUG ? await bundleAtVersion(slug, shipped) : await packShowcaseBundle(slug)),
      bundledVersion: async (slug): Promise<string | null> => (slug === UPGRADE_SLUG ? shipped : ((await readShowcaseManifest(slug))?.version ?? null)),
    }),
  ).ensureSeeded(caller);

  // Untouched: their fork stands, and our provenance record still names what WE last wrote.
  expect(rowFor(await h.service.list({ caller }), UPGRADE_SLUG)?.version).toBe("5.0.0");
  expect(latch.versions[UPGRADE_SLUG]).toBe(seeded?.version);
});

test("#803 a DELETED seeded plugin stays deleted, even when a newer bundle ships", async () => {
  const db = await freshDb();
  const h = makePluginHarness(db, { port: realHost(), ops: makeInertOps() });
  const caller = ownerPrincipalFor(await seedUser(db, { handle: castId<Handle>("owner") }));
  const latch: SeedLatch = { seeded: false, versions: {} };

  await seedOnce(h, latch, caller);
  const seeded = rowFor(await h.service.list({ caller }), UPGRADE_SLUG);
  await h.service.uninstall({ caller, pluginId: seeded?.id as PluginId });

  const shipped = "9.9.9";
  await createExamplePluginSeeder(
    seederDeps(h, latch, {
      packBundle: async (slug) => (slug === UPGRADE_SLUG ? await bundleAtVersion(slug, shipped) : await packShowcaseBundle(slug)),
      bundledVersion: async (slug): Promise<string | null> => (slug === UPGRADE_SLUG ? shipped : ((await readShowcaseManifest(slug))?.version ?? null)),
    }),
  ).ensureSeeded(caller);

  // DELETION-RESPECT is not a second rule in the upgrade half — a row the user removed is simply not in the
  // held set, so there is nothing to upgrade and the latch still forbids re-installing it.
  expect(rowFor(await h.service.list({ caller }), UPGRADE_SLUG)).toBeUndefined();
});

test("#803 a settled boot at EQUAL versions writes nothing at all", async () => {
  const db = await freshDb();
  const h = makePluginHarness(db, { port: realHost(), ops: makeInertOps() });
  const caller = ownerPrincipalFor(await seedUser(db, { handle: castId<Handle>("owner") }));
  const latch: SeedLatch = { seeded: false, versions: {} };

  await seedOnce(h, latch, caller);
  const first = await h.service.list({ caller });
  const recorded = { ...latch.versions };

  // The next boot on the SAME shipped bundles: no install (latched), no upgrade (nothing is newer), and —
  // the part a version compare alone would not give — no settings write either.
  const writes: number[] = [];
  await createExamplePluginSeeder(
    seederDeps(h, latch, {
      writeSeededVersions: (): Promise<void> => {
        writes.push(1);
        return Promise.resolve();
      },
    }),
  ).ensureSeeded(caller);

  expect(writes).toHaveLength(0);
  expect(latch.versions).toEqual(recorded);
  const second = await h.service.list({ caller });
  expect(second.map((row) => `${row.slug}@${row.version}`).sort()).toEqual(first.map((row) => `${row.slug}@${row.version}`).sort());
  expect(second.map((row) => row.updatedAt)).toEqual(first.map((row) => row.updatedAt));
});
