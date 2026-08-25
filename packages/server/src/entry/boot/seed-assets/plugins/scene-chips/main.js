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
  const raw = await host.storage.get(cooldownKey(chatId));
  const now = host.clock.nowEpochMs();
  if (raw !== null && now - Number(raw) < CHIP_COOLDOWN_MS) {
    return false;
  }
  await host.storage.set(cooldownKey(chatId), String(now));
  return true;
}

host.events.on("messageCommitted", async (fact) => {
  try {
    const chatId = fact?.chatId ? fact.chatId : null;
    if (chatId === null || !isLongNarratorBeat(fact)) {
      return;
    }
    if (!(await claimCooldown(chatId))) {
      return;
    }
    // `chat.current()` resolves the invocation's admitted room into the opaque handle every room-scoped host
    // function takes. It is minted fresh per invocation and refused if forged — there is nothing to cache.
    await host.chat.surfaceQuickReply(host.chat.current(), CHOICES);
    host.log.info(`offered ${CHOICES.length} doors in ${chatId}`);
  } catch (err) {
    // The expected failure is the host-authority refusal in a room the installer does not host (see the
    // header). Swallowed like every other handler failure — three consecutive throws auto-disable a plugin.
    // `String(err)` rather than `err.message`: it never throws (a guest realm can `throw null`) and an Error
    // stringifies to `Name: message`, which is exactly what a log line wants.
    host.log.info(`chips not offered: ${String(err)}`);
  }
});

host.log.info(`scene chips ready — ${CHOICES.length} doors, ${CHIP_COOLDOWN_MS} ms apart (grants: ${host.grants.join(", ") || "none"})`);
