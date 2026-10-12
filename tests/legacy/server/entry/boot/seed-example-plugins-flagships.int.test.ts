// The flagship showcase plugins on their real release-built bytes: story clocks, the pocket arcade, the keepsake camera, the card atlas, the affinity tracker and the scripted ui.js round trip.

// @orb-waive-file no-test-fabrication(readonly { id: string; assetId: AssetId }[]): baselined when the gate widened to value casts; burn-down item 906.
import type { VariablePrecondition, VariableWriteResult } from "@orb/contracts/chat";
import { historyFloor } from "@orb/contracts/chat";
import type { PluginCapability } from "@orb/contracts/plugin";
import type { AssetId, ChatId, Handle, PluginId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { freshDb } from "@orb/testkit/node/db.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import type { PluginHostOps } from "#server/domain/plugin/index.ts";
import { createSurfaceStatePublisher } from "#server/domain/plugin/index.ts";
import { seedChat, seedParticipant } from "../../domain/chat/_support.ts";
import { makeInertOps, makePluginHarness, ownerPrincipalFor, seedUser } from "../../domain/plugin/_support.ts";
import {
  CHAT,
  chatScope,
  installGrantEnable,
  messageFact,
  packShowcaseBundle,
  realHost,
  recordingOps,
  requireHandler,
  requireInvoke,
  roomAuthority,
} from "./_seed-example-plugins-support.ts";

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
  const caller = ownerPrincipalFor(await seedUser(db, { handle: castId<Handle>("owner") }));
  await seedChat(db, "clocks", { id: CHAT });
  await seedParticipant(db, { chatId: CHAT, key: "clock_host", userId: caller.userId, role: "host" });
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
      ...roomAuthority(db),
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
    grant: ["chat.read", "storage.kv", "assets.read", "llm.quiet", "imagery.generate", "ui.surface"],
  });

  // The collected shape: one typed-args command and the ARM C album page (a masterDetail whose browse stage
  // is a BOUND grid and whose detail stage is a BOUND image — this passing the real registration validation
  // IS the receipt that the new vocabulary survives an actual activation over the WASM runtime).
  const commands = await h.service.listCommands({ caller });
  expect(commands).toEqual([
    expect.objectContaining({ name: "snapshot", slug: "keepsake-camera", placements: [{ target: "composer-media", label: "Snapshot", icon: "images" }] }),
  ]);
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
  expect(captured.assetReads).toEqual([validAsset]);
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
  expect(opened?.["detail"]).toEqual(expect.objectContaining({ assetId: validAsset, mime: "image/png", size: "2097152 bytes" }));

  // …and `discard` forgets the album copy (the rooms keep their postcards) and returns home, empty.
  await h.service.invokeUiAction({ caller, pluginId, surfaceId: "album_page", actionId: "discard", values: {} });
  const after = await h.service.getSurfaceState({ caller, pluginId, surfaceId: "album_page" });
  expect(after?.["stage"]).toBe("album");
  expect(after?.["tiles"]).toEqual([]);
});

/** The flagship's CI slice, honest about its edge: like the familiar, the atlas's fetch arms (`safeFetch` has
 *  no injection seam) would be LIVE requests to community card hubs, so CI drives everything UP TO the wire —
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
  // Both pager buttons wait on a search: bound to the same published flag, so neither is enabled before one.
  expect(spec.match(/"disabled":\{"\$state":"noSearch"\}/g)).toHaveLength(2);
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
  // @orb-waive no-test-fabrication({): baselined when the gate widened to value casts; burn-down item 906.
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
  expect(initial?.["noSearch"]).toBe(true);
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

/** THE TIER-C END-TO-END RECEIPT. The shipped `affinity-tracker` carries a third
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
  // @orb-waive no-test-fabrication(Uint8Array): baselined when the gate widened to value casts; burn-down item 906.
  const installed = await h.service.install({ caller, bundle: scripted as Uint8Array, grant: [] });
  const source = await h.service.getUiBundle({ caller, pluginId: installed.id });
  expect(source, "affinity-tracker ships a ui.js and it must survive the round trip").not.toBeNull();
  // Not merely non-null: it is the REAL file. `orb.ui(1)` is the one door a scripted guest can open, so its
  // presence is what distinguishes the shipped client half from any other text that could land here.
  expect(source).toContain("orb.ui(1)");

  // A Tier-S example answers `null` — an absence, not a failure.
  const staticOnly = await packShowcaseBundle("oracle-deck");
  // @orb-waive no-test-fabrication(Uint8Array): baselined when the gate widened to value casts; burn-down item 906.
  const staticRow = await h.service.install({ caller, bundle: staticOnly as Uint8Array, grant: [] });
  expect(await h.service.getUiBundle({ caller, pluginId: staticRow.id })).toBeNull();
});
