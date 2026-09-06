// Scene Chips — the ROOM-SURFACE archetype of an Orbweaver plugin.
//
// WHAT IT DOES. When the narrator lands a long beat, three chips appear under the composer: continue, skip
// ahead, cut to a new scene. Clicking one drops its text into the composer for the member to edit and send.
// It is the cheapest cure for the blank-composer stall, and it is the one archetype whose output the whole
// room can see.
//
// THE THING TO UNDERSTAND BEFORE YOU COPY THIS: A PLUGIN'S CHIPS ARE ALWAYS COMPOSE-MODE. The host pins the
// mode for the plugin emitter and the guest carries no say in it. That is not an oversight — a `send`-mode
// chip posts its text AS THE CLICKING MEMBER's own in-fiction line, so a plugin that could emit one would be
// putting words in a person's mouth on a single click. Compose mode makes the member the author: the text
// lands in their box, they edit it, they send it. Write your `sendText` as a first draft of something a
// PERSON would say, never as a command to the system.
//
// HOST AUTHORITY IS REQUIRED, and it is a FLAT REFUSAL here — not a confirm card. Chips are room-visible, so
// host authority is the ceiling; but a chip's entire value is immediacy, and an ask the host has to read and
// approve before the text can appear as a chip has already shown the host the text. So in a room the
// installer does not host, `surfaceQuickReply` throws. Catch it, log it, move on.
//
// CHIPS ARE TRANSIENT. There is no row, no history, nothing to clean up — they surface on the room's bus and
// are replaced by the next set. That also means there is nothing to check before you emit, which is exactly
// why the debounce below matters: nothing else stops you from carpeting the room in chips.

const host = orb.host(1);

/** Only offer doors after a beat with some weight to it. A chip strip under every one-line exchange is
 *  wallpaper, and wallpaper gets ignored. */
const LONG_BEAT_CHARS = 400;

/** The floor between two chip strips in one room, in ms. THE debounce — plugin chips have no host-side rate
 *  belt at all (unlike `net.fetch` and `llm.quiet`, which carry hourly floors), so this is the only thing
 *  standing between a busy scene and a strip on every single message. */
const CHIP_COOLDOWN_MS = 120_000;

/** The host caps a quick-reply arm at 4 choices. Three leaves room to breathe and reads as a menu rather than
 *  a wall — and two plugins offering four each would stack to eight under one composer. */
const CHOICES = [
  { label: "Continue", sendText: "I keep going, following the moment where it leads." },
  { label: "Time skip", sendText: "Some time passes. Later that day," },
  { label: "New scene", sendText: "Cut to somewhere else — a different place, a little later." },
];

const cooldownKey = (chatId) => `chips:${chatId}`;

/** The plugin-private key holding the most recent oracle omen (see the pubsub subscription below). */
const OMEN_KEY = "omen";

/** How long a drawn card keeps flavoring the chip strip. An omen is a MOMENT — an hour-old card steering
 *  tonight's scene doors would read as a haunting nobody asked for. */
const OMEN_FRESH_MS = 600_000;

/** The freshest omen card, or `null`. Reads the note `pubsub.on` stored — malformed/stale answers `null`,
 *  because a decoration must never become a reason to throw. */
async function freshOmen() {
  const raw = await host.storage.get(OMEN_KEY);
  if (raw === null) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed.card !== "string" || typeof parsed.atMs !== "number") {
      return null;
    }
    return host.clock.nowEpochMs() - parsed.atMs <= OMEN_FRESH_MS ? parsed.card : null;
  } catch {
    return null;
  }
}

/** Is this fact a substantial NARRATOR beat? A member's own message is not a stall — the stall is the pause
 *  AFTER the story moved. `role` comes straight off the delivered fact; the host resolved it, not the guest. */
function isLongNarratorBeat(fact) {
  const message = fact ? fact.message : undefined;
  if (message === undefined || message.role === "user") {
    return false;
  }
  return typeof message.content === "string" && message.content.length >= LONG_BEAT_CHARS;
}

/** The per-room cooldown, in the plugin's private KV. Claimed BEFORE the surface call, not after: two
 *  deliveries can be in flight at once and a stamp written on success would let both strips through. */
async function claimCooldown(chatId) {
  const key = cooldownKey(chatId);
  const raw = await host.storage.get(key);
  const now = host.clock.nowEpochMs();
  if (raw !== null && now - Number(raw) < CHIP_COOLDOWN_MS) {
    return false;
  }
  // COMPARE-AND-SET is what makes the claim a claim. Writing the stamp BEFORE the surface call was already
  // the right instinct; the compare is what makes it hold against a caller the host does NOT serialize. This
  // plugin's own server deliveries are mutually exclusive (`infra/plugin-host/port.ts`'s per-instance invoke
  // queue), but a Tier-C `ui.js` reaches the same key through `plugin.uiHostCall`, which rides no queue — and
  // a plain `set` lets any two such claimants through, because both read the same stale stamp. The cooldown
  // belongs only to the claimant whose write actually landed against the stamp it read.
  return (await host.storage.compareAndSet(key, raw, String(now))).applied;
}

// Registrations are activation-time, so each sits behind a FEATURE-DETECT — an ungranted host call THROWS,
// and a throw at activation takes the whole plugin down (the house guard idiom; see the oracle-deck).
if (host.grants.includes("events.subscribe")) {
  host.events.on("messageCommitted", async (fact) => {
    try {
      const chatId = fact?.chatId ? fact.chatId : null;
      if (chatId === null || !isLongNarratorBeat(fact)) {
        return;
      }
      if (!(await claimCooldown(chatId))) {
        return;
      }
      // A fresh oracle omen flavors the strip with a FOURTH door (the host caps an arm at 4 — see CHOICES).
      // This is the composition payoff: install the oracle too and the table starts playing together; without
      // it (or without the `plugin_events` grant) `freshOmen()` is simply never fed and the strip stays three.
      const omen = await freshOmen();
      const choices =
        omen === null ? CHOICES : [...CHOICES, { label: "Follow the omen", sendText: `The omen said ${omen}. I let it steer what happens next:` }];
      // `chat.current()` resolves the invocation's admitted room into the opaque handle every room-scoped host
      // function takes. It is minted fresh per invocation and refused if forged — there is nothing to cache.
      await host.chat.surfaceQuickReply(host.chat.current(), choices);
      host.log.info(`offered ${choices.length} doors in ${chatId}`);
    } catch (err) {
      // The expected failure is the host-authority refusal in a room the installer does not host (see the
      // header). Swallowed like every other handler failure — three consecutive throws auto-disable a plugin.
      // `String(err)` rather than `err.message`: it never throws (a guest realm can `throw null`) and an Error
      // stringifies to `Name: message`, which is exactly what a log line wants.
      host.log.info(`chips not offered: ${String(err)}`);
    }
  });
}

// ── THE PRIVATE-EVENT SUBSCRIPTION (pubsub.on) — the other half of the composition demo ────────────────────
// The seeded oracle-deck ANNOUNCES every draw on its own channel; this subscribes to it. Facts to copy:
//   * `pubsub.on("oracle-deck", "draw", …)` names WHICH of the installer's plugins to listen to, by slug. If
//     that plugin is not installed (or never emits), the subscription simply never fires — absence is free,
//     so composing with a sibling never makes it a dependency.
//   * The handler runs with NO CHAT SCOPE — `chat.current()` would throw here, and no room write is possible.
//     Everything it may do is per-install: private storage, global `setState`. So it takes a NOTE (the card +
//     when), and the room-scoped event handler above decides later whether the note is still fresh.
//   * The payload is `{name, data}`, exactly what the emitter published — never a TriggerFact, never
//     automation. A private plane between YOUR OWN plugins, nothing more.
if (host.grants.includes("plugin_events")) {
  host.pubsub.on("oracle-deck", "draw", async (event) => {
    try {
      const cards = Array.isArray(event?.data?.cards) ? event.data.cards : [];
      const last = cards.length > 0 ? cards.at(-1) : null;
      if (typeof last !== "string") {
        return;
      }
      await host.storage.set(OMEN_KEY, JSON.stringify({ card: last, atMs: host.clock.nowEpochMs() }));
      host.log.info(`noted the omen: ${last}`);
    } catch (err) {
      host.log.warn(`omen note failed: ${String(err)}`);
    }
  });
}

host.log.info(`scene chips ready — ${CHOICES.length} doors, ${CHIP_COOLDOWN_MS} ms apart (grants: ${host.grants.join(", ") || "none"})`);
