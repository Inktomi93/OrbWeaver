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

/** `((lookup: Term))` — an EXPLICIT, human-typed marker. Scanning prose for "interesting nouns" would make
 *  every message an egress candidate; a marker makes the room's members the rate limiter. */
const LOOKUP_RE = /\(\(\s*lookup:\s*([^)]{2,80}?)\s*\)\)/i;

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
const seenKey = (term) => `seen:${term.toLowerCase()}`;

/** Extract the marker's term, or `null`. Kept pure + tiny: the guest CPU deadline is per invocation, and a
 *  regex over an arbitrarily long message is the one place a handler can accidentally spend it. */
function readLookupTerm(fact) {
  const content = fact?.message ? fact.message.content : "";
  if (typeof content !== "string" || content.length === 0) {
    return null;
  }
  const match = LOOKUP_RE.exec(content);
  return match === null ? null : match[1].trim();
}

/** Has this term already been filed? The FIRST debounce layer, and the one that matters: without it every
 *  re-read of a scrollback message would re-fetch. */
async function alreadyFiled(term) {
  return (await host.storage.get(seenKey(term))) !== null;
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

/** Fetch one summary. Returns the extract text, or `null` for EVERY failure shape — an off-allowlist refusal,
 *  a 404 for a term nobody wrote an article about, a 5 s deadline, a body that is not the JSON we expected.
 *  Silence is the correct behaviour for all of them: the room should never see the familiar fail. */
async function fetchSummary(term) {
  try {
    // `net.fetch` returns JSON-safe primitives only — `{status, body}`. There is no `Response` object, no
    // streaming, and the body is already UTF-8 decoded and byte-capped host-side.
    const res = await host.net.fetch(SUMMARY_URL + encodeURIComponent(term.replaceAll(" ", "_")));
    if (res.status !== HTTP_OK) {
      host.log.info(`no article for "${term}" (status ${res.status})`);
      return null;
    }
    const extract = JSON.parse(res.body).extract;
    return typeof extract === "string" && extract.length > 0 ? extract.slice(0, EXTRACT_MAX_CHARS) : null;
  } catch (err) {
    // Includes the host's own refusals (an allowlist miss, the hourly egress floor). Logged, never rethrown.
    // `String(err)` rather than `err.message`: it never throws (a guest realm can `throw null`) and an Error
    // stringifies to `Name: message`, which is exactly what a log line wants.
    host.log.warn(`lookup for "${term}" failed: ${String(err)}`);
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
 *  the config read is a db round-trip. A busy room runs the first line thousands of times and stops there. */
async function admit(fact) {
  const term = readLookupTerm(fact);
  if (term === null) {
    return null; // The overwhelmingly common path. Cheap, silent, no host call at all.
  }
  if (await alreadyFiled(term)) {
    host.log.info(`"${term}" is already filed — skipping`);
    return null;
  }
  if (!(await gapElapsed())) {
    host.log.info(`"${term}" deferred — inside the ${MIN_FETCH_GAP_MS} ms fetch gap`);
    return null;
  }
  const bookId = await host.variables.get(BOOK_ID_VAR);
  if (bookId === null || bookId.length === 0) {
    host.log.warn(`no lore book configured — set {{setglobalvar::${BOOK_ID_VAR}::<book id>}} to switch me on`);
    return null;
  }
  return { term, bookId };
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
// the manifest opts into `matchAutomationEvents`.
host.events.on("messageCommitted", async (fact) => {
  try {
    const work = await admit(fact);
    if (work === null) {
      return;
    }

    // Claim the gap BEFORE the fetch, not after: two deliveries can be in flight at once, and a gap stamped on
    // success would let both through.
    await host.storage.set(LAST_FETCH_KEY, String(host.clock.nowEpochMs()));

    const extract = await fetchSummary(work.term);
    if (extract === null) {
      return;
    }

    // `chat.current()` resolves the invocation's chat. It throws outside a chat scope — a domain-bus fact
    // (`character.updated`) carries no room — so it is called only after we know we have work to do.
    await fileEntry(host.chat.current(), work.bookId, work.term, extract);
    await host.storage.set(seenKey(work.term), String(host.clock.nowEpochMs()));
    host.log.info(`filed "${work.term}"`);
  } catch (err) {
    logFailure(err);
  }
});

host.log.info(`research familiar ready (grants: ${host.grants.join(", ") || "none"})`);
