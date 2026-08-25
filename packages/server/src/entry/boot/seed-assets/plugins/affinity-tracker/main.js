// Affinity Tracker — the QUIET THINKER archetype of an Orbweaver plugin.
//
// WHAT IT DOES. Every few messages it reads the recent transcript, asks the model — privately, outside the
// room, on the installer's own summarize connection — how warm the scene has become, keeps the number in its
// own storage, and notifies the installer only when it MOVES. Nothing it does is ever visible in the room.
//
// THE ONE THING THAT MAKES THIS ARCHETYPE DIFFERENT: `llm.quiet` is SPEND. It is the only host function that
// costs the installer money, and it is bounded by exactly two things — the host's hourly per-plugin floor
// (30 calls/hour, the domain's rate belt) and YOUR OWN DEBOUNCE. The floor is a backstop against a runaway
// plugin, not a budget: hitting it means every later call this hour is refused, so a plugin whose design
// relies on the floor is a plugin that stops working halfway through a busy evening. Score every Nth message,
// not every message.
//
// THE MODEL'S ANSWER IS UNTRUSTED INPUT. It is not your code and it is not the host's; it is a string a
// language model produced, and it will eventually be "7/10", "seven", or a paragraph of preamble. Parse it
// strictly, clamp it, and treat an unparseable answer as "no reading this time" rather than as a zero — a
// zero you invented is a number that then gets acted on.
//
// WHAT `llm.quiet` IS NOT: it cannot write. It commits no message, emits no event, takes no turn slot. You
// get a string back and must route it through some OTHER granted capability to make anything happen — which
// is precisely why the capability is addable at all. Here it goes to private storage and a notice.

const host = orb.host(1);

/** Score every Nth committed message. THE budget dial — see the header. */
const SCORE_EVERY = 8;

/** How much transcript the reading is taken over. `listMessages` is capped at 50 host-side and each message's
 *  content is capped at 16 KiB; a dozen is plenty for "how is this scene going" and keeps the prompt cheap. */
const WINDOW = 12;

/** How far the score must move before the installer is told. Without this the notice fires on 6→7 noise, and
 *  a notification that fires on noise is a notification people mute. (The host also enforces a 60 s per-chat
 *  cooldown on plugin notices — that is a flood backstop, not a substitute for having something to say.) */
const NOTIFY_DELTA = 3;

const SCORE_MIN = 0;
const SCORE_MAX = 10;

/** How much of an unusable model reply gets logged — enough to diagnose the prompt, short enough that a
 *  chatty model cannot flood the plugin's bounded log ring with one line. */
const LOG_EXCERPT_CHARS = 80;

/** The FIRST integer in the model's reply, or `null`. Deliberately not `Number(text)`: a reply of
 *  "Warmth: 7 — they finally sat down together" is the common case, not the exception. */
const FIRST_INT_RE = /-?\d+/;

const countKey = (chatId) => `count:${chatId}`;
const scoreKey = (chatId) => `score:${chatId}`;

/** The prompt. Short, closed, and stated as a FORMAT instruction, because the parse below is the contract:
 *  every word you spend asking for prose is a word you then have to defend against. */
function buildPrompt(messages) {
  const transcript = messages.map((m) => `${m.authorDisplayName}: ${m.content}`).join("\n");
  return `Read this excerpt from a roleplay scene and rate how warm and close the participants are toward each other, from ${SCORE_MIN} (hostile) to ${SCORE_MAX} (intimate). Answer with the number and nothing else.\n\n${transcript}`;
}

/** Read + bump the per-chat message counter. Returns the new count. The counter lives in the plugin's OWN KV
 *  (per plugin × installing owner), so it is invisible to every other plugin and to the room. */
async function bumpCount(chatId) {
  const raw = await host.storage.get(countKey(chatId));
  const next = (Number(raw) || 0) + 1;
  await host.storage.set(countKey(chatId), String(next));
  return next;
}

/** Ask the model, parse strictly, clamp. `null` for every failure shape — an unusable answer is not a score. */
async function readScore(chat) {
  const messages = await host.chat.listMessages(chat, { limit: WINDOW });
  if (messages.length === 0) {
    return null;
  }
  const answer = await host.llm.quiet(buildPrompt(messages));
  const match = FIRST_INT_RE.exec(String(answer));
  if (match === null) {
    host.log.info(`unparseable reading: ${String(answer).slice(0, LOG_EXCERPT_CHARS)}`);
    return null;
  }
  return Math.max(SCORE_MIN, Math.min(SCORE_MAX, Number(match[0])));
}

/** Tell the installer only when the reading MOVED. `"host"` is the recipient selector — the host membrane
 *  resolves it DOMAIN-side to the installing user, so a plugin can never notify someone who is not a
 *  participant, and can never name a recipient at all. */
async function announceIfMoved(chat, chatId, score) {
  const previous = await host.storage.get(scoreKey(chatId));
  await host.storage.set(scoreKey(chatId), String(score));
  if (previous === null) {
    return; // The first reading is a baseline, not a change.
  }
  const moved = score - Number(previous);
  if (Math.abs(moved) < NOTIFY_DELTA) {
    return;
  }
  const direction = moved > 0 ? "warmer" : "cooler";
  await host.notifications.post(chat, "host", `The scene has turned ${direction} (${previous} → ${score}).`);
}

host.events.on("messageCommitted", async (fact) => {
  try {
    const chatId = fact?.chatId ? fact.chatId : null;
    if (chatId === null) {
      return; // A chat-less domain fact — nothing to read. (This handler only subscribes to a chat trigger.)
    }
    if ((await bumpCount(chatId)) % SCORE_EVERY !== 0) {
      return; // THE DEBOUNCE. Seven messages out of eight cost one KV read and one KV write.
    }
    // `chat.current()` is the invocation's admitted room. Fetched here, after the debounce, because a handle
    // is only ever valid inside the invocation that minted it — there is nothing to cache.
    const chat = host.chat.current();
    const score = await readScore(chat);
    if (score === null) {
      return;
    }
    host.log.info(`affinity reading for ${chatId}: ${score}`);
    await announceIfMoved(chat, chatId, score);
  } catch (err) {
    // A handler must never throw — three consecutive rejections auto-disable the plugin. The two failures
    // this one actually meets are the hourly `llm.quiet` floor and a model provider having a bad minute;
    // both are "try again later", neither is a defect.
    // `String(err)` rather than `err.message`: it never throws (a guest realm can `throw null`) and an Error
    // stringifies to `Name: message`, which is exactly what a log line wants.
    host.log.warn(`reading skipped: ${String(err)}`);
  }
});

host.log.info(`affinity tracker ready — scoring every ${SCORE_EVERY} messages (grants: ${host.grants.join(", ") || "none"})`);
