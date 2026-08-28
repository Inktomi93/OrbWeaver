// Research Familiar — the EVENT-DRIVEN archetype of an Orbweaver plugin.
//
// WHAT IT DOES. Someone writes `((lookup: Aurora borealis))` in the room. The familiar notices, fetches the
// Wikipedia summary for that term, and files it as a world-info entry so every later turn can use it. No model
// is called, so the whole feature costs nothing but one HTTP request.
//
// WHY IT IS SHAPED LIKE THIS — the three rules an event plugin lives or dies by:
//   1. A HANDLER MUST NEVER THROW. Three consecutive rejected invocations auto-disable the plugin
//      (`PLUGIN_CRASH_DISABLE_THRESHOLD = 3`) and notify the installer. A network blip is not a defect, so
//      every failure path here logs and returns.
//   2. YOU MUST DEBOUNCE YOURSELF. `messageCommitted` fires on every committed message in every room you can
//      see. The host bounds your EGRESS rate (120 fetches/hour/plugin) but nothing bounds your DELIVERY rate,
//      so a plugin that acts on every message is a plugin that burns its whole budget in one busy scene. This
//      one acts only on an explicit marker, and remembers what it already looked up.
//   3. THE ROOM'S HOST OWNS ROOM STATE. `worldInfo.upsertEntry` needs host authority on the chat. Without it
//      the host membrane converts your write into a CONFIRM CARD the room's host answers, and throws
//      `PluginSuggestedError` at you. That throw is not a failure — it means "it became an ask" — so it is
//      caught by name and logged as such.
//
// Everything the guest can touch comes from `orb.host(1)`. There is no `Date`, no `Math.random`, no `fetch`,
// no timers and no module loader in this realm: time and entropy arrive as injected host seams so two runs
// under the same seams are byte-identical, and I/O only happens through capabilities the installer granted.

const host = orb.host(1);

// ── configuration ──────────────────────────────────────────────────────────────────────────────────────────
// The lore book the familiar files into. A plugin has NO way to browse your books (the host surface exposes
// `worldInfo.upsertEntry` and nothing else), so the target is read from the installer's own global-variable
// namespace — the same plane `{{getglobalvar}}` reads. Set it once from any chat:
//
//     {{setglobalvar::familiar_book_id::wib_01j…}}
//
// Unset ⇒ the familiar stays completely inert. That is the deliberate default: a plugin that guesses where to
// write is a plugin that writes somewhere you did not mean.
const BOOK_ID_VAR = "familiar_book_id";

/** `((lookup: Term))` / `((clip: Term))` — EXPLICIT, human-typed markers. Scanning prose for "interesting
 *  nouns" would make every message an egress candidate; a marker makes the room's members the rate limiter.
 *  TWO verbs because the same fetch has two honest destinations, and the difference is the lesson:
 *   - `lookup` files a SHORT excerpt into a LORE BOOK (`worldInfo.upsertEntry`) — room state, injected into
 *     every later prompt, host-authority-gated, and it needs a configured destination (the book id below);
 *   - `clip` files the WHOLE summary into YOUR DATABANK (`databank.ingest`) — your own library, owner-scoped
 *     by construction, indexed for retrieval, no destination to configure and no host authority to ask:
 *     a write into your own shelves is your own reach.
 *  One marker per message, first match wins — `lookup` is checked first only because it came first. */
const LOOKUP_RE = /\(\(\s*lookup:\s*([^)]{2,80}?)\s*\)\)/i;
const CLIP_RE = /\(\(\s*clip:\s*([^)]{2,80}?)\s*\)\)/i;

/** The smallest gap between two live fetches, in ms. The SECOND debounce layer: the per-term memory below
 *  stops repeats, this stops a burst of ten distinct markers pasted at once. */
const MIN_FETCH_GAP_MS = 30_000;

/** Wikipedia's REST summary endpoint. `en.wikipedia.org` is the ONLY host this bundle declares in
 *  `manifest.netHosts`, and the host membrane pins the fetch to that allowlist — a redirect off it, a private
 *  IP, or a scheme downgrade is refused by the host, not by this code. */
const SUMMARY_URL = "https://en.wikipedia.org/api/rest_v1/page/summary/";

/** The one status that means "there is an article". `net.fetch` reports every other status as DATA (there is
 *  no throw-on-4xx here) — a 404 for a term nobody wrote about is a normal outcome, not an error. */
const HTTP_OK = 200;

/** How much of the summary gets filed. World-info entries are injected into prompts; a 4 KB one is a tax on
 *  every turn forever. */
const EXTRACT_MAX_CHARS = 600;

// ── storage keys (the plugin-private KV: per plugin × installing owner, ≤ 256 keys, ≤ 64 KiB per value) ─────
const LAST_FETCH_KEY = "lastFetchAtMs";
/** Per-VERB memory: a term already filed as lore may still be clipped, and vice versa — two destinations,
 *  two memories. (The databank additionally dedupes clips by content hash host-side; this key just saves
 *  the fetch.) */
const seenKey = (verb, term) => `${verb}:${term.toLowerCase()}`;

/** Extract the message's marker as `{verb, term}`, or `null`. Kept pure + tiny: the guest CPU deadline is
 *  per invocation, and a regex over an arbitrarily long message is the one place a handler can accidentally
 *  spend it. One marker per message; `lookup` wins when both appear. */
function readMarker(fact) {
  const content = fact?.message ? fact.message.content : "";
  if (typeof content !== "string" || content.length === 0) {
    return null;
  }
  const lookup = LOOKUP_RE.exec(content);
  if (lookup !== null) {
    return { verb: "lookup", term: lookup[1].trim() };
  }
  const clip = CLIP_RE.exec(content);
  return clip === null ? null : { verb: "clip", term: clip[1].trim() };
}

/** Has this term already been handled BY THIS VERB? The FIRST debounce layer, and the one that matters:
 *  without it every re-read of a scrollback message would re-fetch. */
async function alreadyFiled(verb, term) {
  return (await host.storage.get(seenKey(verb, term))) !== null;
}

/** Is the global fetch gap satisfied? `host.clock.nowEpochMs()` is the injected clock — the guest realm has no
 *  `Date`, and that is the point: a plugin cannot measure the host's real time to game a budget. */
async function gapElapsed() {
  const raw = await host.storage.get(LAST_FETCH_KEY);
  if (raw === null) {
    return true;
  }
  const last = Number(raw);
  return !Number.isFinite(last) || host.clock.nowEpochMs() - last >= MIN_FETCH_GAP_MS;
}

/** Fetch one summary. Returns `{title, extract}` UNCUT, or `null` for EVERY failure shape — an off-allowlist
 *  refusal, a 404 for a term nobody wrote an article about, a 5 s deadline, a body that is not the JSON we
 *  expected. Silence is the correct behaviour for all of them: the room should never see the familiar fail.
 *  The CALLERS decide how much to keep — `lookup` cuts to `EXTRACT_MAX_CHARS` (a lore entry taxes every
 *  prompt), `clip` keeps the whole thing (a databank document is indexed, not injected). */
async function fetchSummary(term) {
  try {
    // `net.fetch` returns JSON-safe primitives only — `{status, body}`. There is no `Response` object, no
    // streaming, and the body is already UTF-8 decoded and byte-capped host-side.
    const res = await host.net.fetch(SUMMARY_URL + encodeURIComponent(term.replaceAll(" ", "_")));
    if (res.status !== HTTP_OK) {
      host.log.info(`no article for "${term}" (status ${res.status})`);
      return null;
    }
    const parsed = JSON.parse(res.body);
    const extract = parsed.extract;
    if (typeof extract !== "string" || extract.length === 0) {
      return null;
    }
    return { title: typeof parsed.title === "string" && parsed.title.length > 0 ? parsed.title : term, extract };
  } catch (err) {
    // Includes the host's own refusals (an allowlist miss, the hourly egress floor). Logged, never rethrown.
    // `String(err)` rather than `err.message`: it never throws (a guest realm can `throw null`) and an Error
    // stringifies to `Name: message`, which is exactly what a log line wants.
    host.log.warn(`fetch for "${term}" failed: ${String(err)}`);
    return null;
  }
}

/** File the entry. `chat` is the OPAQUE HANDLE for THIS invocation — it is a fresh token every time, it cannot
 *  be stored or reused, and passing a forged one is refused by the host. */
async function fileEntry(chat, bookId, term, extract) {
  await host.worldInfo.upsertEntry(chat, {
    bookId,
    // `entryKey` is the idempotency key: writing the same key again UPDATES the entry instead of adding a
    // second one, so a re-run can never fan the book out.
    entryKey: `familiar:${term.toLowerCase()}`,
    // The keys that ACTIVATE the entry during assembly — the term itself is the honest one.
    keys: [term],
    contentTemplate: `${term}: ${extract}`,
    position: "before",
  });
}

/** The ADMISSION chain, in cheapest-first order — the whole debounce posture lives here, and reading it top to
 *  bottom is the cheapest way to copy this plugin correctly. Returns the work to do, or `null` to stay silent.
 *
 *  Order is not cosmetic: the marker test is a local regex, the two memory reads are plugin-private KV, and
 *  the config read is a db round-trip. A busy room runs the first line thousands of times and stops there.
 *
 *  The PER-VERB tail is the capability lesson: `clip` needs only its grant (your databank is your own —
 *  nothing to configure), while `lookup` needs its grant AND a configured destination book. Feature-detect
 *  with `host.grants` at the moment of use — a marker for an ungranted verb logs once and stays silent, it
 *  never throws. */
async function admit(fact) {
  const marker = readMarker(fact);
  if (marker === null) {
    return null; // The overwhelmingly common path. Cheap, silent, no host call at all.
  }
  const { verb, term } = marker;
  if (await alreadyFiled(verb, term)) {
    host.log.info(`"${term}" is already ${verb === "lookup" ? "filed" : "clipped"} — skipping`);
    return null;
  }
  if (!(await gapElapsed())) {
    host.log.info(`"${term}" deferred — inside the ${MIN_FETCH_GAP_MS} ms fetch gap`);
    return null;
  }
  if (verb === "clip") {
    if (!host.grants.includes("databank.ingest")) {
      host.log.warn("a ((clip: …)) marker needs the databank.ingest capability granted (Settings → Plugins)");
      return null;
    }
    return { verb, term, bookId: null };
  }
  if (!host.grants.includes("worldinfo.write")) {
    host.log.warn("a ((lookup: …)) marker needs the worldinfo.write capability granted (Settings → Plugins)");
    return null;
  }
  const bookId = await host.variables.get(BOOK_ID_VAR);
  if (bookId === null || bookId.length === 0) {
    host.log.warn(`no lore book configured — set {{setglobalvar::${BOOK_ID_VAR}::<book id>}} to switch me on`);
    return null;
  }
  return { verb, term, bookId };
}

/** RULE 1's implementation. Two named host shapes get a friendlier line; everything else is still swallowed,
 *  because a throw out of a handler is a strike against the auto-disable counter and a network is allowed to
 *  be flaky. `err.name` crosses the sandbox boundary intact, which is why branching on it is legitimate and
 *  message-substring matching is not. */
function logFailure(err) {
  const name = err?.name ? err.name : "Error";
  if (name === "PluginSuggestedError") {
    host.log.info("not the host of this room — the write became a card for the host to confirm");
    return;
  }
  if (name === "PluginCapabilityError") {
    host.log.warn("a capability I need is not granted — check Settings → Plugins");
    return;
  }
  host.log.error(`handler failed: ${String(err)}`);
}

// ── the subscription ───────────────────────────────────────────────────────────────────────────────────────
// `events.on` is activation-time and synchronous: it records the subscription, it does not deliver anything
// yet. The type must be a member of the host's own trigger taxonomy — plugins get no private event vocabulary.
// Delivery is filtered host-side BEFORE your handler runs: you receive a fact only for a chat the INSTALLER
// can see (membership plus the history floor plus hidden-span stripping), and only at cascade depth 0 unless
// the manifest opts into `matchAutomationEvents`. Guarded like every activation-time registration: an
// ungranted host call THROWS, and a throw at activation takes the whole plugin down.
if (host.grants.includes("events.subscribe")) {
  host.events.on("messageCommitted", async (fact) => {
    try {
      const work = await admit(fact);
      if (work === null) {
        return;
      }

      // Claim the gap BEFORE the fetch, not after: two deliveries can be in flight at once, and a gap stamped
      // on success would let both through.
      await host.storage.set(LAST_FETCH_KEY, String(host.clock.nowEpochMs()));

      const summary = await fetchSummary(work.term);
      if (summary === null) {
        return;
      }

      if (work.verb === "clip") {
        // THE DATABANK ARM. A canon write into the INSTALLER's OWN library: owner-scoped by construction (a
        // guest can name no other owner), indexed automatically (the write enqueues the ingest workload), and
        // deduped by content hash host-side — re-clipping identical text returns the SAME document id, so
        // even a lost `clipped:` memory cannot fan your library out. Note what is NOT here: no chat handle
        // (a library write is not room state) and no host authority (your shelves are yours).
        const { documentId } = await host.databank.ingest({
          name: `Wikipedia — ${summary.title}`,
          text: `${summary.extract}\n\n(Clipped from the Wikipedia summary of "${summary.title}".)`,
        });
        await host.storage.set(seenKey("clip", work.term), String(host.clock.nowEpochMs()));
        host.log.info(`clipped "${summary.title}" into the databank (${documentId})`);
        return;
      }

      // THE LORE ARM. `chat.current()` resolves the invocation's chat. It throws outside a chat scope — a
      // domain-bus fact (`character.updated`) carries no room — so it is called only after we know we have
      // work to do. The excerpt is CUT here: a lore entry is injected into prompts, and a 4 KB one is a tax
      // on every turn forever.
      await fileEntry(host.chat.current(), work.bookId, work.term, summary.extract.slice(0, EXTRACT_MAX_CHARS));
      await host.storage.set(seenKey("lookup", work.term), String(host.clock.nowEpochMs()));
      host.log.info(`filed "${work.term}"`);
    } catch (err) {
      logFailure(err);
    }
  });
} else {
  host.log.warn("research familiar is dormant: the events.subscribe capability is not granted (Settings → Plugins)");
}

host.log.info(`research familiar ready (grants: ${host.grants.join(", ") || "none"})`);
