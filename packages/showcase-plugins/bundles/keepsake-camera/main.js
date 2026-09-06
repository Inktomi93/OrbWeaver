// Keepsake Camera — the SPEND-PIPELINE archetype of an Orbweaver plugin.
//
// WHAT IT DOES. `/plugin keepsake-camera snapshot` reads the last few beats of the scene, asks the model —
// privately, structured — for a title and a painting prompt, and sends the scene to the image pipeline. The
// postcard is painted INTO THE ROOM, and every keepsake the camera catches also lands in its album page
// (the Extensions rail), where you can revisit or discard them.
//
// THREE THINGS THIS ARCHETYPE TEACHES THAT NO OTHER SEEDED EXAMPLE DOES:
//
//  1. STRUCTURED OUTPUT (`llm.quiet` with a `schema`). The second argument's `schema` arm routes the call to
//     the installer's `structured`-role connection and constrains the answer to your JSON Schema. You get the
//     model's JSON back AS TEXT — parse it, and STILL validate every field (a schema constrains shape, not
//     sense). Contrast with the affinity-tracker, which asks for prose and parses defensively: reach for the
//     schema when you need more than one field back; keep the strict-parse habit either way.
//
//  2. THE HOST-CALL DEADLINE, designed around rather than discovered in production. EVERY host function
//     rejects the guest after a fixed real-time bound (5 s — the membrane's `HOST_FN_DEADLINE_MS`), and an
//     image generation routinely takes longer. The design answer is to make the SLOW CALL's real deliverable
//     independent of the answer: `quiet: false` means the pipeline posts the finished postcard to the ROOM
//     whether or not this guest is still listening. When the call DOES answer in time, the camera "catches"
//     the keepsake — the assetId goes into the album. When it times out, the room still gets its postcard and
//     the album simply misses one; the toast says so honestly. A pipeline that NEEDED the answer would be a
//     pipeline that breaks on every slow backend.
//
//  3. SPEND, twice over. `llm.quiet` (30/hour per plugin) and `imagery.generate` are the two capabilities
//     that cost the installer money; both are granted separately and both are feature-detected at USE so a
//     partial grant degrades to a clear sentence instead of a crash. `imagery.generate` is also
//     HOST-AUTHORITY gated: in a room the installer does not host, the paint becomes a CONFIRM CARD for the
//     room's host and the call throws `PluginSuggestedError` — "it became a question", not a failure.

const host = orb.host(1);

/** How much transcript a snapshot reads. A postcard is about the MOMENT, not the saga. */
const WINDOW = 10;

/** How many keepsakes the album keeps. Storage allows 256 keys; an album is a shelf, not an archive —
 *  the oldest is discarded when a new one lands past the cap. */
const ALBUM_MAX = 24;

/** The camera's styles — each is a PROMPT SUFFIX, and the enum arm of the command's typed args, so the
 *  palette offers exactly these and the guest never sees anything else. */
const STYLES = {
  painterly: "an expressive oil painting, loose brushwork, warm light",
  photograph: "a candid 35mm photograph, natural light, shallow depth of field",
  inkSketch: "a quick ink and wash sketch, confident lines, minimal color",
  storybook: "a children's storybook illustration, soft edges, gentle colors",
};

/** The structured ask (PluginQuietSchema): two fields, both required, both bounded by instruction. The
 *  schema names the SHAPE; the prompt still has to say what good VALUES look like. */
const SNAPSHOT_SCHEMA = {
  name: "keepsake",
  description: "A postcard title and image prompt for the current scene moment.",
  schema: {
    type: "object",
    properties: {
      title: { type: "string", description: "A short evocative title for this moment, at most 8 words." },
      imagePrompt: { type: "string", description: "One sentence describing the scene visually, for an image model. Concrete nouns, mood, setting." },
    },
    required: ["title", "imagePrompt"],
    additionalProperties: false,
  },
};

const SEQ_KEY = "seq";
const SEQ_PAD = 6;
const momentKey = (seq) => `moment:${String(seq).padStart(SEQ_PAD, "0")}`;

/** The guest's OWN clamps over the model's answer — a schema constrains shape, not length or sense. */
const TITLE_MAX_CHARS = 80;
const PROMPT_MAX_CHARS = 400;
/** The fallback's inputs: what counts as a substantial beat, and how much of it a prompt borrows. */
const MIN_BEAT_CHARS = 40;
const BEAT_SLICE_CHARS = 200;
/** The optional `note` arg's ceiling — a nudge for the painter, not a second prompt. */
const NOTE_MAX_CHARS = 200;

/** Milliseconds per minute/hour/day — for the relative "kept … ago" caption. Plain arithmetic on the
 *  INJECTED clock, because there is NO `Date` in this realm: `new Date(x)` THROWS here (the determinism
 *  stubs — time exists only as `host.clock.nowEpochMs()`). A caption is the honest scope of date handling a
 *  guest should attempt; anything fancier belongs on the other side of the membrane. */
const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 86_400_000;

function ago(nowMs, thenMs) {
  const delta = Math.max(0, nowMs - thenMs);
  if (delta < MS_PER_HOUR) {
    return `${Math.max(1, Math.floor(delta / MS_PER_MINUTE))} min ago`;
  }
  if (delta < MS_PER_DAY) {
    return `${Math.floor(delta / MS_PER_HOUR)} h ago`;
  }
  return `${Math.floor(delta / MS_PER_DAY)} d ago`;
}

/** Parse + CLAMP the structured answer. A schema-constrained model can still return an empty title or a
 *  novel — the guest owns its own bounds (the affinity lesson, one shape up). `null` ⇒ use the fallback. */
function parseKeepsake(answer) {
  try {
    const parsed = JSON.parse(answer);
    const title = typeof parsed.title === "string" ? parsed.title.trim().slice(0, TITLE_MAX_CHARS) : "";
    const prompt = typeof parsed.imagePrompt === "string" ? parsed.imagePrompt.trim().slice(0, PROMPT_MAX_CHARS) : "";
    return title.length > 0 && prompt.length > 0 ? { title, prompt } : null;
  } catch {
    return null;
  }
}

/** The NO-MODEL fallback: title + prompt straight from the last substantial beat. The quiet call can be
 *  refused (hourly floor), slow (the deadline), or unhelpful — a camera that cannot click without a second
 *  model in the loop is a camera that jams. */
function localKeepsake(messages) {
  const last = [...messages].reverse().find((m) => m.content.length > MIN_BEAT_CHARS) ?? messages.at(-1);
  const beat = last === undefined ? "a quiet scene" : last.content.slice(0, BEAT_SLICE_CHARS);
  return { title: "A kept moment", prompt: `The scene as just described: ${beat}` };
}

/** Title + paint the moment. Every failure arm answers a SENTENCE (the toast), never a throw. */
async function takeSnapshot(chat, styleKey, note) {
  const messages = await host.chat.listMessages(chat, { limit: WINDOW });
  if (messages.length === 0) {
    await host.ui.toast("warn", "Nothing to photograph yet — say something first.");
    return;
  }

  // The TITLING pass — structured when granted, local when not (or when the model lets us down).
  let keepsake = null;
  if (host.grants.includes("llm.quiet")) {
    try {
      const transcript = messages.map((m) => `${m.authorDisplayName}: ${m.content}`).join("\n");
      const answer = await host.llm.quiet(`Title this scene moment and describe it for a painter.\n\n${transcript}`, { schema: SNAPSHOT_SCHEMA });
      keepsake = parseKeepsake(answer);
    } catch (err) {
      host.log.info(`titling pass skipped: ${String(err)}`); // The floor or the deadline — the fallback covers it.
    }
  }
  const chosen = keepsake ?? localKeepsake(messages);
  const style = STYLES[styleKey] ?? STYLES.painterly;
  const fullPrompt = `${chosen.prompt}${note ? ` ${note}` : ""} — ${style}`;

  // THE PAINT. `quiet: false` ⇒ the finished postcard POSTS TO THE ROOM regardless of whether this call
  // answers inside the host bound (teaching point 2 in the header). The args shape is the SAME
  // `generate_image` vocabulary automation rules use — one vocabulary across rule, tool, and plugin.
  try {
    const { assetId } = await host.imagery.generatePicture(chat, {
      mode: "scenario",
      prompt: fullPrompt,
      n: 1,
      useAvatarReference: false,
      reuse: "never",
      quiet: false,
    });
    await keepMoment(chosen.title, styleKey, assetId);
    await host.ui.toast("success", `Kept: "${chosen.title}" — the postcard is in the room and the album.`);
  } catch (err) {
    const name = err && err.name ? err.name : "Error";
    if (name === "PluginSuggestedError") {
      // Not the host of this room: the paint became a confirm card for the room's host. Designed outcome.
      await host.ui.toast("info", "This room's host was asked to approve the postcard.");
      return;
    }
    // Most commonly the host-call deadline on a slow image backend: the room still gets its postcard when
    // the pipeline finishes; only the album misses the catch. Say exactly that.
    host.log.info(`snapshot not caught: ${String(err)}`);
    await host.ui.toast("info", "The postcard is developing — it will appear in the room. (The album only keeps ones the camera catches in time.)");
  }
}

/** How many times a contended compare-and-set is retried before the write is abandoned. No backoff, and none
 *  is possible (the sandbox has no timers or randomness) — but none is needed: the loop never waits, it only
 *  re-reads the value that beat it. */
const CAS_ATTEMPTS = 5;

/** Take the next album sequence number, ATOMICALLY, or `null` if the counter stayed contended.
 *
 *  `get` + 1 + `set` is a lost update waiting to happen, and here it costs a KEEPSAKE rather than a count:
 *  two claimants that both read `4` both file at `moment:5`, and the second overwrites the first — the album
 *  silently eats a picture.
 *
 *  WHY, stated exactly, because the obvious version is wrong: this plugin's own SERVER handlers do NOT race
 *  each other — `infra/plugin-host/port.ts` runs every invoke on one resident through a serialized tail chain,
 *  so a tool call, an event delivery and a panel action never interleave. What is NOT serialized is the OTHER
 *  caller of the same KV rows: a Tier-C scripted `ui.js` reaches `storage.*` through `plugin.uiHostCall`,
 *  which goes straight to the bridge with no queue at all — and two browser tabs are two such callers. So any
 *  value derived from its own previous value needs a compare-and-set the moment a plugin grows a client-side
 *  writer, which is the moment nobody remembers to come back and add one.
 *
 *  `host.storage.compareAndSet` only writes while the counter still holds what we read, so a sequence number
 *  belongs to exactly one moment. */
async function nextSequence() {
  let current = await host.storage.get(SEQ_KEY);
  for (let attempt = 0; attempt < CAS_ATTEMPTS; attempt += 1) {
    const next = String((Number(current) || 0) + 1);
    const result = await host.storage.compareAndSet(SEQ_KEY, current, next);
    if (result.applied) {
      return Number(next);
    }
    current = result.current;
  }
  return null;
}

/** File one caught keepsake, evicting past the album cap, and refresh the page. */
async function keepMoment(title, styleKey, assetId) {
  const seq = await nextSequence();
  if (seq === null) {
    // Contended past the bound. Say so rather than filing over someone else's moment — the postcard is still
    // in the room either way; only the album misses this one.
    host.log.info("album sequence stayed contended — this keepsake was not filed");
    return;
  }
  await host.storage.set(momentKey(seq), JSON.stringify({ title, style: styleKey ?? "painterly", assetId, atMs: host.clock.nowEpochMs() }));
  const keys = (await host.storage.list("moment:")).sort();
  for (const key of keys.slice(0, Math.max(0, keys.length - ALBUM_MAX))) {
    await host.storage.delete(key);
  }
  await publishAlbum();
}

/** Load every kept moment, NEWEST first, as `[key, data]` pairs. Malformed rows are dropped, not fatal. */
async function loadMoments() {
  const keys = (await host.storage.list("moment:")).sort().reverse();
  const raw = await Promise.all(keys.map((key) => host.storage.get(key)));
  const out = [];
  for (let i = 0; i < keys.length; i += 1) {
    try {
      const parsed = JSON.parse(raw[i]);
      if (typeof parsed.title === "string" && typeof parsed.assetId === "string") {
        out.push([keys[i], parsed]);
      }
    } catch {
      // A hand-edited row is treated as absent — never a crash (the loadSession posture, one deck over).
    }
  }
  return out;
}

/** Publish the ALBUM state: the BOUND grid's tile array (#774 ARM C — `tilesFrom` resolves this) plus the
 *  detail stage's fields. Tile ids are the storage keys' digits (`m000007`) so `open` can find the row; the
 *  cover `assetId` is state data the renderer format-checks and then resolves OWNER-SCOPED, exactly like a
 *  spec-declared image — a foreign id would paint nothing, never someone else's picture.
 *
 *  Published with NO chat handle: the album is a CROSS-ROOM roll-up, so every room (and the Extensions page)
 *  shows the same publication — the deliberate contrast with the per-room `setState(…, chat)` the
 *  story-clocks and affinity examples use. Pick the scope that matches what the data is ABOUT. */
async function publishAlbum(detail) {
  const moments = await loadMoments();
  await host.ui.setState("album_page", {
    stage: detail === undefined ? "album" : "moment",
    count: moments.length === 1 ? "1 keepsake" : `${moments.length} keepsakes`,
    tiles: moments.map(([key, m]) => ({
      id: `m${key.slice("moment:".length)}`,
      title: m.title,
      subtitle: m.style,
      assetId: m.assetId,
      alt: m.title,
    })),
    detail: detail ?? {},
  });
}

// ── the command (typed args, #791) ─────────────────────────────────────────────────────────────────────────
const canShoot =
  host.grants.includes("ui.surface") && host.grants.includes("storage.kv") && host.grants.includes("chat.read") && host.grants.includes("imagery.generate");
if (!canShoot) {
  host.log.warn("keepsake camera is dormant: it needs ui.surface + storage.kv + chat.read + imagery.generate granted (Settings → Plugins)");
}

if (canShoot) {
  host.ui.registerCommand({
    name: "snapshot",
    describe: "Paint this moment of the scene into a postcard for the room (and the album)",
    args: [
      { name: "style", type: "enum", enumValues: Object.keys(STYLES), describe: "The postcard's look (default painterly)" },
      { name: "note", type: "string", describe: "Something the painter should not miss" },
    ],
    onRun: async (a) => {
      // A snapshot needs a SCENE: run outside a room and `chat.current()` throws — caught into the honest
      // sentence rather than a crash strike (a command can be run from the palette anywhere).
      let chat;
      try {
        chat = host.chat.current();
      } catch {
        await host.ui.toast("warn", "Run the camera inside a chat — it photographs the scene you are in.");
        return;
      }
      const style = typeof a.values.style === "string" ? a.values.style : "painterly";
      const note = typeof a.values.note === "string" ? a.values.note.slice(0, NOTE_MAX_CHARS) : "";
      await takeSnapshot(chat, style, note);
    },
  });

  // ── THE ALBUM (ui.page + the ARM C bound collections) ────────────────────────────────────────────────────
  // A masterDetail page whose BROWSE stage is a BOUND grid (`tilesFrom`) — the tile count is DATA, so the
  // album grows one keepsake at a time with no ghost slots — and whose DETAIL stage is a BOUND image
  // (`assetFrom`) + bound text. Stage navigation is ordinary published state: `open` publishes the picked
  // moment and flips `stage`; `back` flips it home. Leaving the Extensions section and returning lands on
  // the same stage — the state lives here, not in the mount.
  host.ui.register({
    id: "album_page",
    anchor: "page",
    title: "The Album",
    tier: "static",
    spec: {
      kind: "masterDetail",
      active: { $state: "stage" },
      stages: [
        {
          id: "album",
          kind: "browse",
          title: "Keepsakes",
          body: {
            kind: "stack",
            gap: "block",
            children: [
              { kind: "text", voice: "gloss", value: { $state: "count" } },
              {
                kind: "grid",
                tilesFrom: { $state: "tiles" },
                tileAction: "open",
                aspect: "landscape",
                empty: "No keepsakes yet — run /plugin keepsake-camera snapshot inside a chat.",
              },
            ],
          },
        },
        {
          id: "moment",
          kind: "detail",
          title: { $state: "detail.title" },
          body: {
            kind: "stack",
            gap: "block",
            children: [
              { kind: "image", assetFrom: { $state: "detail.assetId" }, aspect: "landscape" },
              {
                kind: "keyValue",
                rows: [
                  { key: "Style", value: { $state: "detail.style" } },
                  { key: "Kept", value: { $state: "detail.kept" } },
                ],
              },
              {
                kind: "row",
                gap: "field",
                children: [
                  { kind: "button", actionId: "back", label: "Back to the album", variant: "outline" },
                  {
                    kind: "confirmButton",
                    actionId: "discard",
                    label: "Discard",
                    confirmTitle: "Discard this keepsake?",
                    confirmBody: "The postcard stays in any room it was posted to; only the album copy is discarded.",
                  },
                ],
              },
            ],
          },
        },
      ],
    },
    // The action router. `open` remembers WHICH keepsake is on the detail stage in the plugin's own storage
    // (`open_key`) — an action's `values` carries the FORM draft plus the clicked tile, so navigation state
    // the next action needs (what should `discard` discard?) is the guest's own job to keep.
    onAction: async (a) => {
      try {
        if (a.actionId === "open") {
          const key = `moment:${String(a.values.tile ?? "").slice(1)}`;
          const raw = await host.storage.get(key);
          if (raw === null) {
            await publishAlbum();
            return;
          }
          const m = JSON.parse(raw);
          await host.storage.set("open_key", key);
          await publishAlbum({ key, title: m.title, style: m.style, assetId: m.assetId, kept: ago(host.clock.nowEpochMs(), m.atMs) });
          return;
        }
        if (a.actionId === "discard") {
          const key = await host.storage.get("open_key");
          if (key !== null) {
            await host.storage.delete(key);
            await host.storage.delete("open_key");
            await host.ui.toast("info", "Keepsake discarded — the album forgets, the rooms remember.");
          }
          await publishAlbum();
          return;
        }
        await publishAlbum();
      } catch (err) {
        host.log.warn(`album action failed: ${String(err)}`);
      }
    },
  });

  // Publish the album ONCE at activation so the page renders on first open (a bound spec is withheld until
  // its state lands — publish early, publish honest: an empty album IS a publishable state).
  void publishAlbum().catch((err) => host.log.warn(`album publish failed: ${String(err)}`));
}

host.log.info(`keepsake camera ready (grants: ${host.grants.join(", ") || "none"})`);
