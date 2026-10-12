// The SHOWCASE PLUGIN examples, proven end to end on their REAL release-built bytes — no hand-built bundle double.
// The suite materializes the ignored runtime zip tree first; `packShowcaseBundle` then reads exactly the bytes the per-user seeder reads, and the real `install`
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
// The familiar's configured drive instead finds a deterministic `search.query` hit, proving the host-call
// path through the attached-book read and lore write without making CI depend on a public network or paid provider. The
// bridge's attachment gate, per-plugin entry cap and `neutralizeMacros` remain pinned by its domain suite.

// @orb-waive-file no-test-fabrication({ commitment: string; dealt: number }): baselined when the gate widened to value casts; burn-down item 906.
import type { Principal } from "@orb/contracts/identity";
import type { PluginCapability } from "@orb/contracts/plugin";
import type { ChatId, Handle, MessageId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { ChatOperationError } from "@orb/server/domain/chat";
import type { PluginHostOps } from "@orb/server/domain/plugin";
import { FROZEN_AT_MS } from "@orb/testkit/iso/clock.ts";
import { freshDb } from "@orb/testkit/node/db.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { seedChat, seedParticipant } from "../../domain/chat/_support.ts";
import { makePluginHarness, ownerPrincipalFor, seedUser } from "../../domain/plugin/_support.ts";
import {
  CHAT,
  chatScope,
  FAMILIAR_BOOK_ID,
  installGrantEnable,
  messageFact,
  packShowcaseBundle,
  realHost,
  recordingOps,
  requireHandler,
  requireInvoke,
  roomAuthority,
} from "./_seed-example-plugins-support.ts";

const DRAW_LINE_RE = /^\d+\. (.+)$/;
/** The public commitment's shape — a check value of two four-digit hex groups (`commitmentFor`). */
const COMMITMENT_RE = /^[0-9A-F]{4}-[0-9A-F]{4}$/;

const FAMILIAR_GRANT: readonly PluginCapability[] = [
  "chat.read",
  "worldinfo.read",
  "worldinfo.write",
  "global_vars",
  "storage.kv",
  "search.query",
  "events.subscribe",
  "net.fetch",
  "databank.ingest",
  "ui.surface",
  "notify",
];

test("research familiar: the real bundle installs consent-first, and its messageCommitted handler actually fires", async () => {
  const db = await freshDb();
  const globals = new Map<string, string>();
  const { ops, captured } = recordingOps(db, globals);
  const configurationWrites: { readonly ownerId: Principal["userId"]; readonly key: string; readonly value: string }[] = [];
  const configuredOps: PluginHostOps = {
    ...ops,
    variables: {
      ...ops.variables,
      set: (ownerId, key, value): Promise<void> => {
        configurationWrites.push({ ownerId, key, value });
        globals.set(key, value);
        return Promise.resolve();
      },
    },
  };
  const h = makePluginHarness(db, { port: realHost(), ops: configuredOps });
  const caller = ownerPrincipalFor(await seedUser(db, { handle: castId<Handle>("owner") }));

  // THE SEEDED SEQUENCE, verbatim: install with an EMPTY grant, then the empty RE-GRANT that raises the
  // standing consent ask. The row can do nothing at all until a human answers it.
  const bundle = await packShowcaseBundle("research-familiar");
  expect(bundle).not.toBeNull();
  // @orb-waive no-test-fabrication(Uint8Array): baselined when the gate widened to value casts; burn-down item 906.
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
  expect(log.some((line) => line.level === "warn" && line.message.includes("Choose lore book"))).toBe(true);

  // The CLIP verb's per-verb grant gate: `databank.ingest` was deliberately left out of the grant above, so
  // the marker is admitted through the same debounce chain and then refused BY NAME — a warn log, never a
  // throw (a throw here would be a strike against the auto-disable counter over a capability the user simply
  // has not ticked). This is also the seam immediately before the outbound fetch, for the same CI reason.
  await invoke(handler, messageFact(CHAT, "keep the whole article ((clip: Aurora borealis))"), chatScope(CHAT, true));
  const afterClip = await h.service.getLog({ caller, pluginId: installed.id });
  expect(afterClip.some((line) => line.level === "warn" && line.message.includes("databank.ingest"))).toBe(true);

  // The configured lookup stays inside the host when the installer already has a useful document: it proves
  // the destination is attached, asks the owner-scoped corpus, and files the local hit without public egress.
  // The script's UI relay uses the same owner-scoped variable writer as the real composer-free dialog.
  await h.service.uiHostCall({ caller, pluginId: installed.id, fn: "variables.set", argsJson: JSON.stringify(["familiar_book_id", FAMILIAR_BOOK_ID]) });
  expect(globals.get("familiar_book_id")).toBe(FAMILIAR_BOOK_ID);
  expect(configurationWrites).toEqual([{ ownerId: caller.userId, key: "familiar_book_id", value: FAMILIAR_BOOK_ID }]);
  await invoke(handler, messageFact(CHAT, "we ride north ((lookup: Aurora borealis))"), chatScope(CHAT, true));
  expect(captured.worldBookReads).toEqual([{ chatId: CHAT }]);
  expect(captured.searches).toEqual([{ queryText: "Aurora borealis", limit: 1 }]);
  expect(captured.worldWrites).toEqual([{ bookId: FAMILIAR_BOOK_ID, content: "Aurora borealis: Charged particles excite gases high above the polar sky." }]);
});

test("oracle deck: the real bundle registers both tools and a draw is verifiable against the reveal", async () => {
  const db = await freshDb();
  const { ops, captured } = recordingOps(db, new Map());
  const h = makePluginHarness(db, { port: realHost(), ops });
  const caller = ownerPrincipalFor(await seedUser(db, { handle: castId<Handle>("owner") }));

  const bundle = await packShowcaseBundle("oracle-deck");
  expect(bundle).not.toBeNull();
  // @orb-waive no-test-fabrication(Uint8Array): baselined when the gate widened to value casts; burn-down item 906.
  const installed = await h.service.install({ caller, bundle: bundle as Uint8Array, grant: [] });
  const grant: readonly PluginCapability[] = ["storage.kv", "tools.register", "ui.surface", "chat.transform", "plugin_events"];
  await h.service.setGrant({ caller, pluginId: installed.id, grant: [...grant], acknowledgedNetHosts: [] });
  await h.service.setEnabled({ caller, pluginId: installed.id, enabled: true });
  expect((await h.service.list({ caller }))[0]?.["status"]).toBe("enabled");

  // BOTH tools reached the registrar — the guest-local names the host then prefixes to `plugin_oracle__deck_*`
  // (the slug's hyphen DOUBLES: `pluginToolWireName` is injective since #1391).
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
    expect.objectContaining({ id: "draw_card", anchor: "tool-card", toolName: "draw", toolWireName: "plugin_oracle__deck_draw" }),
    // …and the two U5 surfaces the same activation registered (#679 U5): the full-page deck behind the ONE
    // Plugins rail entry, and the reveal DIALOG — which the deck opens only from its own page/command, never
    // spontaneously. This is the end-to-end receipt that `page` and `dialog` survive a REAL activation over the
    // WASM runtime, not just the schema.
    expect.objectContaining({ id: "deck_page", anchor: "page", title: "The Deck" }),
    expect.objectContaining({ id: "reveal_dialog", anchor: "dialog", title: "Reveal this session" }),
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
  expect(commands.map((command) => command.placements.map((placement) => placement.target))).toEqual([["composer-action"], ["composer-action"]]);
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
  // @orb-waive no-test-fabrication({): baselined when the gate widened to value casts; burn-down item 906.
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
  // @orb-waive no-test-fabrication({ cards: string[]; dealt: number }): baselined when the gate widened to value casts; burn-down item 906.
  const first = JSON.parse(a) as { cards: string[]; dealt: number };
  // @orb-waive no-test-fabrication({ cards: string[]; dealt: number }): baselined when the gate widened to value casts; burn-down item 906.
  const second = JSON.parse(b) as { cards: string[]; dealt: number };

  // No card is dealt twice — the property the commitment/reveal ceremony is worthless without.
  const all = [...first.cards, ...second.cards];
  expect(new Set(all).size).toBe(all.length);
  // …and the counter accounts for every card, so the reveal's "Cards dealt" is the truth.
  expect(Math.max(first.dealt, second.dealt)).toBe(all.length);
});

test("draft polish: the real bundle explicitly replaces a draft and registers no hidden outgoing transform", async () => {
  const db = await freshDb();
  const { ops, captured } = recordingOps(db, new Map());
  const h = makePluginHarness(db, { port: realHost(), ops });
  const caller = ownerPrincipalFor(await seedUser(db, { handle: castId<Handle>("owner") }));

  const installed = await installGrantEnable({ h, caller, slug: "draft-polish", grant: ["chat.transform", "ui.surface"] });
  expect(captured.transforms).toEqual([]);
  const commands = await h.service.listCommands({ caller });
  expect(commands).toEqual([
    expect.objectContaining({ name: "polish", composerDraft: true, placements: [{ target: "composer-action", label: "Polish", icon: "sparkles" }] }),
  ]);
  const result = await h.service.invokeUiCommand({
    caller,
    pluginId: installed,
    name: "polish",
    args: "",
    chatId: CHAT,
    composerDraft: 'he paused...  then ran `echo  "..."` , quietly  ',
  });
  expect(result).toEqual({ toasts: [], composerDraft: 'he paused… then ran `echo  "..."`, quietly' });
  expect(captured.transforms).toEqual([]);
  await h.service.setEnabled({ caller, pluginId: installed, enabled: false });
  expect(await h.service.listCommands({ caller })).toEqual([]);
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
  const { ops: recorded, captured } = recordingOps(db, new Map());
  const caller = ownerPrincipalFor(await seedUser(db, { handle: castId<Handle>("owner") }));
  await seedChat(db, "scene", { id: CHAT });
  await seedParticipant(db, { chatId: CHAT, key: "scene_host", userId: caller.userId, role: "host" });
  const otherRoom = await seedChat(db, "scene_other", { id: castId<ChatId>("chat_2") });
  await seedParticipant(db, { chatId: otherRoom, key: "scene_other_host", userId: caller.userId, role: "host" });
  const memberRoom = await seedChat(db, "scene_member");
  const foreignHost = await seedUser(db, { handle: castId<Handle>("foreign_host") });
  await seedParticipant(db, { chatId: memberRoom, key: "scene_member", userId: caller.userId, role: "member" });
  await seedParticipant(db, { chatId: memberRoom, key: "scene_foreign_host", userId: foreignHost, role: "host" });
  const h = makePluginHarness(db, { port: realHost(), ops: { ...recorded, chat: { ...recorded.chat, ...roomAuthority(db) } } });

  const pluginId = await installGrantEnable({
    h,
    caller,
    slug: "scene-chips",
    grant: ["chat.read", "chat.quick_reply", "storage.kv", "events.subscribe", "plugin_events"],
  });
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
  await invoke(handler, messageFact(otherRoom, beat, "assistant"), chatScope(otherRoom, true));
  expect(captured.chips).toHaveLength(2);
  expect(captured.chips[1]?.map((c) => c.label)).toEqual(["Continue", "Time skip", "New scene", "Follow the omen"]);
  expect(captured.chips[1]?.at(-1)?.sendText).toContain("The Storm");

  // A stale admission bit cannot authorize chips in a room whose live host is somebody else.
  await expect(roomAuthority(db).requireHost(memberRoom, caller.userId)).rejects.toBeInstanceOf(ChatOperationError);
  await invoke(handler, messageFact(memberRoom, beat, "assistant"), chatScope(memberRoom, true));
  expect(captured.chips).toHaveLength(2);
  expect((await h.service.getLog({ caller, pluginId })).some((line) => line.message.includes("chips not offered: ChatOperationError"))).toBe(true);
});
