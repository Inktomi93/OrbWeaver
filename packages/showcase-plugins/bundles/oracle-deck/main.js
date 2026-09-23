// Oracle Deck — the TOOL-REGISTERING archetype of an Orbweaver plugin.
//
// WHAT IT DOES. It puts two tools in front of the model: `draw` deals cards from a shuffled deck mid-turn, and
// `reveal` discloses the seed that produced the shuffle. The narrator can say "the cards say…" and mean it,
// because the order was fixed — and committed to in public — before the first card was dealt.
//
// THE COMMIT-AND-REVEAL MECHANISM, and what it honestly proves:
//   1. The first `draw` of a session mints a secret seed and prints a COMMITMENT derived from it. The
//      commitment goes into the transcript, where it cannot be edited without the edit being visible.
//   2. Every later `draw` deals the next card of the shuffle that seed determines.
//   3. `reveal` prints the seed and the whole ordered shuffle. Anyone can recompute the commitment from the
//      seed and check that the cards they were dealt are the cards that seed produces.
//   That closes the "the narrator made it up after seeing what would be dramatic" loop, which is the only
//   fairness question a story table actually has. It is NOT a cryptographic commitment: the guest realm ships
//   no hash function, so the commitment is an FNV-1a checksum — tamper-EVIDENT against a careless swap, not
//   tamper-PROOF against a determined one. Stated plainly because a fairness claim you cannot cash is worse
//   than no claim.
//
// WHAT A PLUGIN TOOL CANNOT DO, stated so you do not design around a surface that is not there:
//   * NO ARBITRARY PIXELS. You can draw a real card for your tool — this plugin does, at the bottom of the
//     file — but out of the app's OWN components, declared as data, inside a frame that names you. Bespoke
//     card ART (an image per card, a canvas) is not expressible in that vocabulary; a structured card is.
//     Design your result as a DOCUMENT (see `drawResult`), because both the model and the card read it.
//   * NO STABLE ROOM IDENTITY. The chat handle a tool invocation can obtain is a fresh opaque token each time,
//     so a tool handler cannot key state per room. This deck is therefore ONE deck per install, shared across
//     your rooms. (An event handler is different — its fact carries the chat id.)
//
// Everything comes from `orb.host(1)`. No `Date`, no `Math.random`: the seed comes from `host.ids.mint()` and
// the shuffle is pure arithmetic, so the same seed yields the same deck on any machine — which is exactly what
// makes the reveal checkable.

const host = orb.host(1);

/** The deck. Ordered, fixed, and part of the contract: `reveal` is only checkable against a deck the verifier
 *  also has, so changing this list is a BREAKING change to every commitment already in a transcript. */
const DECK = [
  "The Road",
  "The Debt",
  "The Mask",
  "The Storm",
  "The Bargain",
  "The Mirror",
  "The Key",
  "The Wound",
  "The Stranger",
  "The Tower",
  "The Hunger",
  "The Vow",
  "The Thread",
  "The Coin",
  "The Door",
  "The Hollow",
  "The Lantern",
  "The Knife",
  "The Tide",
  "The Crown",
  "The Silence",
  "The Dawn",
];

/** The plugin-private KV key holding the live session. One value, ≤ 64 KiB, per plugin × installing owner. */
const SESSION_KEY = "session";

/** Draw bounds. A tool's arguments come from a MODEL, so every numeric argument is clamped rather than
 *  trusted — a schema `maximum` is a hint to the model, not an enforcement. */
const MIN_DRAW = 1;
const MAX_DRAW = 3;
/** The past/present/future spread deals exactly this many — the one named spread the draw command knows. */
const SPREAD_CARDS = 3;

// The hash + PRNG constants. Named because they are ALGORITHM IDENTITY, not tunables: change one and every
// commitment already printed in a transcript stops verifying. The whole scheme is deliberately plain
// arithmetic (no bitwise, no `Math.imul`, no typed arrays) for one reason — a person checking a reveal has to
// be able to re-implement it in five minutes, in whatever language they have open.
const HASH_MODULUS = 2_147_483_647; // 2^31 - 1, a Mersenne prime — the modulus for both the hash and the PRNG.
const HASH_MULTIPLIER = 31; // The classic polynomial-rolling-hash multiplier.
const LEHMER_MULTIPLIER = 48_271; // MINSTD. `48271 * (2^31 - 2)` stays under 2^53, so float math is exact.
const COMMITMENT_DIGITS = 10;

/** A polynomial rolling hash over a string → an integer in `[0, HASH_MODULUS)`. Used for BOTH the commitment
 *  and the PRNG seed, so a verifier needs exactly this one five-line function to check a reveal. */
function hashOf(text) {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * HASH_MULTIPLIER + text.charCodeAt(i)) % HASH_MODULUS;
  }
  return hash;
}

/** MINSTD (Lehmer) — a tiny deterministic PRNG in `[0, 1)`. Deliberately NOT `host.random.next()`: the host
 *  PRNG is an injected seam whose stream a verifier has no access to, so a shuffle drawn from it could never
 *  be re-derived from a published seed. The host seam mints the SECRET; this turns the secret into the ORDER. */
function makeRng(seedInt) {
  // 0 is the one fixed point of a Lehmer generator (it would emit 0 forever), so it is nudged off it.
  let state = seedInt % HASH_MODULUS === 0 ? 1 : seedInt % HASH_MODULUS;
  return () => {
    state = (state * LEHMER_MULTIPLIER) % HASH_MODULUS;
    return state / HASH_MODULUS;
  };
}

/** Fisher-Yates over a copy of `DECK`, driven entirely by `seed`. Pure: same seed ⇒ same order, forever. */
function shuffleFor(seed) {
  const rng = makeRng(hashOf(seed));
  const cards = [...DECK];
  for (let i = cards.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const swap = cards[i];
    cards[i] = cards[j];
    cards[j] = swap;
  }
  return cards;
}

/** The public commitment for a secret seed — printed BEFORE any card is dealt, checkable AFTER the reveal. */
function commitmentFor(seed) {
  return String(hashOf(`commit:${seed}`)).padStart(COMMITMENT_DIGITS, "0");
}

/** Parse one stored session record. A malformed value (hand-edited, or written by an older version of this
 *  plugin) is treated as absent rather than thrown on — a plugin that crashes on its own stored state is a
 *  plugin that auto-disables three invocations later. */
function parseSession(raw) {
  if (raw === null) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed.seed === "string" && typeof parsed.dealt === "number" ? parsed : null;
  } catch {
    return null;
  }
}

/** Load the live session, or `null`. Read-only — every WRITE goes through `claimCards`. */
async function loadSession() {
  return parseSession(await host.storage.get(SESSION_KEY));
}

/** How many times a contended compare-and-set is retried before the deal is abandoned. No backoff, and none
 *  is possible (the sandbox has no timers or randomness) — but none is needed: the loop never waits, it only
 *  re-reads the record that beat it. */
const CAS_ATTEMPTS = 5;

/** CLAIM the next `count` cards, atomically, starting a session if there is none. Returns
 *  `{ session, taken }` where `session.dealt` is the offset the cards were taken FROM (so the caller numbers
 *  them exactly as before), `taken: []` when the deck is spent, or `null` when the record stayed contended.
 *
 *  A read → slice → `storage.set` LOSES DRAWS, and this plugin is the worst possible place for that: two
 *  claimants that both read `dealt: 3` both deal from index 3, and the second write erases the first's
 *  advance — two people then see the SAME cards out of a deck whose whole demonstration is that its shuffle
 *  was committed to in advance.
 *
 *  WHY, stated exactly, because the obvious version is wrong: this plugin's own SERVER handlers do NOT race
 *  each other — `infra/plugin-host/port.ts` runs every invoke on one resident through a serialized tail chain,
 *  so a tool call, an event delivery and a panel action never interleave. What is NOT serialized is the OTHER
 *  caller of the same KV rows: a Tier-C scripted `ui.js` reaches `storage.*` through `plugin.uiHostCall`,
 *  which goes straight to the bridge with no queue at all — and two browser tabs are two such callers. So any
 *  value derived from its own previous value needs a compare-and-set the moment a plugin grows a client-side
 *  writer, which is the moment nobody remembers to come back and add one.
 *
 *  `host.storage.compareAndSet` writes only while the record still holds what we read, which is what turns a
 *  deal into a claim. */
async function claimCards(count) {
  let raw = await host.storage.get(SESSION_KEY);
  for (let attempt = 0; attempt < CAS_ATTEMPTS; attempt += 1) {
    const session = parseSession(raw) ?? { seed: host.ids.mint(), dealt: 0 };
    const cards = shuffleFor(session.seed);
    if (session.dealt >= cards.length) {
      return { session, taken: [] };
    }
    const taken = cards.slice(session.dealt, session.dealt + count);
    const next = JSON.stringify({ seed: session.seed, dealt: session.dealt + taken.length });
    const result = await host.storage.compareAndSet(SESSION_KEY, raw, next);
    if (result.applied) {
      return { session, taken };
    }
    raw = result.current;
  }
  return null;
}

/** Clamp a model-supplied count into the legal range. `Number()` on an absent/garbage argument yields NaN,
 *  which fails both comparisons and lands on `MIN_DRAW`. */
function clampCount(raw) {
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n) || n < MIN_DRAW) {
    return MIN_DRAW;
  }
  return Math.min(n, MAX_DRAW);
}

/** THE RESULT DOCUMENT `draw` returns — and the reason it is JSON rather than a sentence.
 *
 *  A tool result is TWO audiences at once. The model reads it (so every field has to read as plain language),
 *  and — once your plugin registers a `tool-card` surface, below — the CARD binds it: a card's
 *  `{ $state: "result.<field>" }` paths resolve against this object. A handler that returns prose can only
 *  ever be bound as one blob; a handler that returns a document can be drawn as a real card.
 *
 *  EVERY FIELD IS ALWAYS PRESENT, deliberately. A binding whose path is missing renders empty, so a field
 *  that appears only sometimes is a card that is sometimes half-blank. The spent-deck arm below therefore
 *  returns the same shape with zero cards, not a different one. */
function drawResult(session, taken, narration) {
  return JSON.stringify({
    // What the model reads first, and what the card's markdown node draws.
    drawn: narration,
    cards: taken,
    // The public commitment: safe to show every time (only the SEED is secret), which is what lets the card
    // carry it as a stable row instead of a sometimes-line.
    commitment: commitmentFor(session.seed),
    dealt: session.dealt,
    deckSize: DECK.length,
    // Pre-rendered count language, because a card's vocabulary has no arithmetic and no pluralization — the
    // plugin owns the sentence, the app owns the drawing.
    countLabel: taken.length === 1 ? "1 card" : `${taken.length} cards`,
    remainingLabel: `${DECK.length - session.dealt} left in the deck`,
  });
}

// ── THE PRIVATE-EVENT ANNOUNCEMENT (pubsub.emit) ───────────────────────────────────────────────────────────
// Every draw is ANNOUNCED on this plugin's own private channel, `plugin:oracle-deck:draw`. This is the
// multi-plugin composition plane: any OTHER plugin the same person installed can `host.pubsub.on(
// "oracle-deck", "draw", …)` and react (the seeded scene-chips does — install both and the table starts
// playing together). Three facts to copy correctly:
//   1. Emitting to NOBODY is free — no subscriber, no cost, no error. Announce your interesting moments and
//      let the ecosystem decide; do not feature-detect "is anyone listening" (you can't, on purpose).
//   2. The channel is INSTALLER-PRIVATE and one-directional: your emit reaches only the same person's
//      plugins, never a domain event, never automation, never another user. Your slug is stamped host-side —
//      you cannot publish on another plugin's channel.
//   3. A subscriber's handler runs with NO chat scope, so put everything it needs IN the payload (that is
//      why `card` rides here rather than "go read my storage").
// Guarded per-call: `plugin_events` may be unticked, and a decoration must never crash a draw.
async function announceDraw(cards, dealt, commitment) {
  if (!host.grants.includes("plugin_events")) {
    return;
  }
  await host.pubsub.emit("draw", { cards, dealt, commitment, deckSize: DECK.length });
}

// ── the tools ──────────────────────────────────────────────────────────────────────────────────────────────
// `tools.register` is activation-time and synchronous. The host namespaces each name to
// `plugin_<slug'>_<name>`, where `slug'` doubles each hyphen (so this pair lands as
// `plugin_oracle__deck_draw` / `plugin_oracle__deck_reveal`) and
// registers it into the ONE tool registry every other tool consumer already funnels through. Your handler runs
// IN the sandbox under the per-invocation budget, and whatever STRING it returns is what the model reads —
// returned verbatim, never re-encoded, so `JSON.stringify(x)` yields exactly that JSON to the model.
//
// FEATURE-DETECT BEFORE YOU REGISTER — the idiom every registration in this file follows. An ungranted host
// call THROWS, registrations run at activation, and one unguarded call takes the whole plugin down. The deck
// needs BOTH `tools.register` (to exist as tools) and `storage.kv` (a session it cannot store is a deck it
// cannot deal), so the guard names both and the dormant arm says exactly what is missing.

const canDeal = host.grants.includes("tools.register") && host.grants.includes("storage.kv");
if (!canDeal) {
  host.log.warn("oracle deck is dormant: it needs tools.register + storage.kv granted (Settings → Plugins)");
}

if (canDeal) {
  host.tools.register({
    name: "draw",
    description:
      "Draw from the oracle deck. Returns the drawn cards in order. The first draw of a session also returns a commitment that fixes the whole shuffle in advance.",
    // Raw JSON Schema, validated host-side. Keep it small and literal: this text is what the model plans against.
    parameters: {
      type: "object",
      properties: {
        count: { type: "integer", minimum: MIN_DRAW, maximum: MAX_DRAW, description: "How many cards to draw (1-3)." },
      },
      additionalProperties: false,
    },
    handler: async (args) => {
      const count = clampCount(args ? args.count : MIN_DRAW);
      const claim = await claimCards(count);
      if (claim === null) {
        return "The deck is being dealt from somewhere else right now — ask again in a moment.";
      }
      const { session, taken } = claim;
      if (taken.length === 0) {
        return drawResult(session, [], "The deck is spent. Call reveal to verify this session, then draw again for a fresh shuffle.");
      }

      const drawn = taken.map((card, i) => `${session.dealt + i + 1}. ${card}`).join("\n");
      await announceDraw(taken, session.dealt + taken.length, commitmentFor(session.seed));
      // The commitment rides in the RESULT on every draw (it is public by construction — only the seed is
      // secret), but the model is TOLD about it only on the first, because that is the moment it means
      // something and repeating it every draw would train everyone to skip the line that matters.
      // "First draw of this session" is now read off the CLAIM (`dealt` was 0 when we took these cards)
      // rather than off a separate pre-read, which the compare-and-set removed along with the race.
      const lead = session.dealt === 0 ? `Commitment ${commitmentFor(session.seed)} — verify it after reveal.` : "";
      return drawResult({ seed: session.seed, dealt: session.dealt + taken.length }, taken, `${lead ? `${lead}\n\n` : ""}${drawn}`);
    },
  });

  host.tools.register({
    name: "reveal",
    description: "Reveal the seed behind the current oracle session so the draws can be verified, and retire the deck. The next draw starts a fresh session.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
    handler: async () => {
      const session = await loadSession();
      if (session === null) {
        return "No oracle session is open — nothing has been drawn yet.";
      }
      // Retiring the session on reveal is the whole discipline: a seed that stays live after it is public is a
      // deck whose remaining order everyone already knows.
      await host.storage.delete(SESSION_KEY);
      const order = shuffleFor(session.seed).join(", ");
      return `Seed: ${session.seed}\nCommitment: ${commitmentFor(session.seed)}\nCards dealt: ${session.dealt}\nFull order: ${order}`;
    },
  });
} // end canDeal — the tools exist only when both capabilities are granted.

// ── THE OMEN MACRO (macros.register) ───────────────────────────────────────────────────────────────────────
// `{{plugin_oracle__deck_omen}}` — usable anywhere macros run (a persona note, a scenario line, an author's
// note) — substitutes the MOST RECENT card of the open session. Put "The table's omen is
// {{plugin_oracle__deck_omen}}." in a scenario note and every turn quietly leans toward the last card drawn.
//
// WHAT A PLUGIN MACRO IS, precisely — three facts that shape everything you can do with one:
//   1. It is a VALUE, not a function: `resolve` takes NO arguments. The kit macro engine is synchronous and
//      a guest call is not, so the host resolves each plugin macro ONCE per turn, before assembly, and
//      registers the RESULT as that turn's value. (An arg-taking plugin macro is structurally impossible —
//      do not design around it.)
//   2. The NAME is host-namespaced: you register "omen", macros see `plugin_oracle__deck_omen` (each `-`
//      in the slug becomes `__`, which is what keeps two plugins' namespaces apart). You can never
//      shadow a builtin or another plugin's macro.
//   3. A throw or an overrun resolves to "" for that turn — degrade-never-throw is the macro plane's own law,
//      so returning "" for "nothing to say" (no session yet) is the idiomatic empty, not an error.
// Capability: `chat.transform` — a macro substitutes text into the assembled prompt, which is exactly the
// reach that capability names. Storage is read inside `resolve`, so the guard names both.
if (host.grants.includes("chat.transform") && host.grants.includes("storage.kv")) {
  host.macros.register({
    name: "omen",
    description: "The most recent card drawn from the open oracle session (empty when nothing has been drawn).",
    resolve: async () => {
      const session = await loadSession();
      if (session === null || session.dealt === 0) {
        return "";
      }
      const cards = shuffleFor(session.seed);
      return cards[Math.min(session.dealt, cards.length) - 1];
    },
  });
}

// ── THE CARD (ui.surface at the `tool-card` anchor) ────────────────────────────────────────────────────────
//
// What a `draw` looks like in the transcript. Without this, a plugin tool call renders in the app's GENERIC
// tool block — the raw name, arguments and result, the same for every tool. With it, the app draws YOUR
// card, out of its own components, inside a frame that names this plugin.
//
// THE THREE THINGS TO KNOW:
//  1. `toolName` is the LINKAGE, and it is your OWN name for the tool — `draw`, exactly as `tools.register`
//     took it. The app resolves the model-visible `plugin_oracle__deck_draw` on its side; you never spell
//     that, and a card that named it would break the day your slug changed.
//  2. THE BINDING ROOT IS THE CALL, not `setState`. `{ $state: "result.commitment" }` reads the result
//     document of THE CALL BEING DRAWN, so an old draw in the scrollback keeps showing the cards it drew.
//     (`args.*`, `isError` and `durationMs` are there too.) A tool card publishes no state and needs none.
//  3. IT IS PER TOOL, AND OPTIONAL. `reveal` registers no card, so a reveal renders in the generic block —
//     which is exactly what a plugin gets for free, and always the fallback when a card cannot be drawn. A
//     tool call is part of the conversation's record; the app never renders NOTHING for one.
//
// FEATURE-DETECT THE GRANT, don't assume it. A user may tick `tools.register` and leave `ui.surface`
// unticked — their call, and the deck still works without a card. Calling a host fn you were not granted
// THROWS, and this one runs at activation, so an unguarded call would take the whole plugin down (no tools,
// no deck) over a decoration. `host.grants` is the guest-readable grant set for exactly this.
if (host.grants.includes("ui.surface")) {
  host.ui.register({
    id: "draw_card",
    anchor: "tool-card",
    toolName: "draw",
    title: "Draw",
    tier: "static",
    spec: {
      kind: "section",
      kicker: "Oracle draw",
      children: [
        {
          kind: "row",
          gap: "field",
          children: [
            { kind: "badge", intent: "info", text: { $state: "result.countLabel" } },
            { kind: "badge", intent: "neutral", text: { $state: "result.remainingLabel" } },
          ],
        },
        // The narration the model also read — through the app's own markdown renderer, so the card and the
        // transcript speak in one voice.
        { kind: "markdown", value: { $state: "result.drawn" } },
        { kind: "keyValue", rows: [{ key: "Commitment", value: { $state: "result.commitment" } }] },
        { kind: "meter", label: "Dealt", max: DECK.length, value: { $state: "result.dealt" } },
      ],
    },
  });
}

// ── THE U5 SURFACES: a COMMAND, a PAGE, and a DIALOG ────────────────────
//
// The card above is what a tool call looks like. These are what a PERSON reaches for directly, without asking
// the model for anything:
//
//  * `registerCommand` — the deck, from the composer or the Plugins wand menu. The app routes
//    `/plugin oracle-deck draw` and a menu item to this handler; you never claim a top-level slash token, so
//    two plugins can both have a `draw` and neither shadows the other (or a house command).
//  * `ui.page` — a FULL-PAGE surface, listed in the app's one "Extensions" rail entry. This is the home for a
//    plugin with more to show than a panel holds; the app draws the switcher and the attributed page band.
//  * `dialog` — a house modal, opened ONLY from your own surface or command (`host.ui.openDialog`). There is
//    no way to open one spontaneously, which is the point: a modal a plugin could raise unprompted is the
//    most convincing thing it could ever fake.
//
// `host.ui.toast` is the third host-mediated affordance: a house toast, prefixed with THIS plugin's name (the
// app stamps it — you supply only the sentence), rate-floored, and delivered on the round-trip you raised it
// from. It is transient feedback; anything that must survive being missed rides `notifications.post`.
//
// All four ride the SAME `ui.surface` grant as the card, so the same feature-detect guard covers them.
if (host.grants.includes("ui.surface")) {
  /** The page's published state — the deck's own dashboard. `setState` replaces it whole. */
  const publishDeckState = async () => {
    const session = await loadSession();
    await host.ui.setState("deck_page", {
      status: session === null ? "No session open" : `Session open · ${session.dealt} dealt`,
      commitment: session === null ? "—" : commitmentFor(session.seed),
      dealt: session === null ? 0 : session.dealt,
      deckSize: DECK.length,
    });
  };

  // TYPED COMMAND ARGS (#791). Declaring `args` buys the whole platform half for free: the palette shows a
  // typed input strip, the composer autocompletes `count=`/`spread=`, both surfaces validate BEFORE your code
  // runs, and the server re-validates at the membrane — so `a.values` here holds only well-typed, in-enum,
  // required-present values. The RAW remainder still arrives as `a.args` (unchanged, `{}`-values when you
  // declare nothing), so a command with its own grammar keeps it. Declare an arg per QUESTION the command
  // answers, not per flag you can imagine: `spread` (which shape) and `count` (how many) is this command's
  // whole decision surface.
  host.ui.registerCommand({
    name: "draw",
    describe: "Draw from the oracle deck — one card, several, or a past/present/future spread",
    args: [
      { name: "count", type: "number", describe: "How many cards to draw (1-3, default 1)" },
      {
        name: "spread",
        type: "enum",
        enumValues: ["single", "past_present_future"],
        describe: "A named spread — past_present_future deals three labeled cards",
      },
    ],
    onRun: async (a) => {
      // The values bag is TYPED: `count` is a number (or absent), `spread` is one of the declared members
      // (or absent). No parsing, no trimming, no "is it a string" — the platform did that on both sides.
      const spread = a.values.spread === "past_present_future" ? SPREAD_CARDS : MIN_DRAW;
      const count = clampCount(a.values.count ?? spread);
      const claim = await claimCards(count);
      if (claim === null) {
        await host.ui.toast("warn", "The deck is being dealt from somewhere else right now — try again in a moment.");
        return;
      }
      const { session, taken } = claim;
      if (taken.length === 0) {
        await host.ui.toast("warn", "The deck is spent — reveal it to start a fresh shuffle.");
        return;
      }
      await publishDeckState();
      await announceDraw(taken, session.dealt + taken.length, commitmentFor(session.seed));
      // The toast is the ANSWER to the command: a command that runs and says nothing reads as broken, and the
      // person who typed it is right there, which is exactly the audience a transient notice is for.
      const labels = ["Past", "Present", "Future"];
      const line =
        a.values.spread === "past_present_future" && taken.length === SPREAD_CARDS
          ? taken.map((card, i) => `${labels[i]}: ${card}`).join(" · ")
          : taken.join(", ");
      await host.ui.toast("info", `${line} (${session.dealt + taken.length} of ${DECK.length} dealt)`);
    },
  });

  host.ui.registerCommand({
    name: "reveal",
    describe: "Open the reveal dialog for this oracle session",
    onRun: async () => {
      const session = await loadSession();
      await host.ui.setState("reveal_dialog", {
        seed: session === null ? "—" : session.seed,
        commitment: session === null ? "—" : commitmentFor(session.seed),
        order: session === null ? "No session is open." : shuffleFor(session.seed).join(", "),
      });
      // The one way a plugin opens a modal: as the OUTCOME of the act the person just performed.
      await host.ui.openDialog("reveal_dialog");
    },
  });

  host.ui.register({
    id: "deck_page",
    anchor: "page",
    title: "The Deck",
    tier: "static",
    spec: {
      kind: "stack",
      gap: "block",
      children: [
        { kind: "text", value: { $state: "status" }, voice: "label" },
        { kind: "keyValue", rows: [{ key: "Commitment", value: { $state: "commitment" } }] },
        { kind: "meter", label: "Dealt", max: DECK.length, value: { $state: "dealt" } },
        { kind: "button", actionId: "draw_one", label: "Draw a card", variant: "outline" },
        { kind: "button", actionId: "reveal_now", label: "Reveal the session", variant: "neutral" },
      ],
    },
    onAction: async (action) => {
      if (action.actionId === "draw_one") {
        const claim = await claimCards(1);
        if (claim === null) {
          await host.ui.toast("warn", "The deck is being dealt from somewhere else right now — try again in a moment.");
          return;
        }
        if (claim.taken.length > 0) {
          await host.ui.toast("info", `${claim.taken[0]} (${claim.session.dealt + 1} of ${DECK.length})`);
        } else {
          await host.ui.toast("warn", "The deck is spent — reveal it to start a fresh shuffle.");
        }
        await publishDeckState();
        return;
      }
      const session = await loadSession();
      await host.ui.setState("reveal_dialog", {
        seed: session === null ? "—" : session.seed,
        commitment: session === null ? "—" : commitmentFor(session.seed),
        order: session === null ? "No session is open." : shuffleFor(session.seed).join(", "),
      });
      await host.ui.openDialog("reveal_dialog");
    },
  });

  host.ui.register({
    id: "reveal_dialog",
    anchor: "dialog",
    title: "Reveal this session",
    tier: "static",
    spec: {
      kind: "stack",
      gap: "block",
      children: [
        {
          kind: "keyValue",
          rows: [
            { key: "Seed", value: { $state: "seed" } },
            { key: "Commitment", value: { $state: "commitment" } },
          ],
        },
        { kind: "text", value: { $state: "order" }, voice: "gloss" },
        {
          kind: "confirmButton",
          actionId: "retire",
          label: "Retire this deck",
          confirmTitle: "Retire the deck?",
          confirmBody: "The next draw starts a fresh shuffle.",
        },
      ],
    },
    onAction: async (action) => {
      if (action.actionId !== "retire") {
        return;
      }
      await host.storage.delete(SESSION_KEY);
      await publishDeckState();
      await host.ui.toast("success", "Deck retired — the next draw starts a fresh shuffle.");
    },
  });

  // ── THE MESSAGE-FOOTER MARK — the per-row anchor, and its honest constraints ─────────────────────────────
  // `message-footer` mounts once per COMMITTED transcript row, so it carries the tightest bounds in the
  // vocabulary, all enforced at registration: STATIC tier only, decoration kinds only (badge/text/meter/
  // image/row — no buttons, no lists, no markdown), ≤ 8 nodes, depth ≤ 2, and — the one that shapes what a
  // footer can BE — no `$state` bindings: a bound footer would paint fallbacks under every row until you
  // publish, so the mount skips bound specs entirely. A footer is therefore a FIXED mark, the same under
  // every message. Use it for something that is true of every row, keep it to ONE small node, and remember
  // the strip already carries your plugin's name — say one thing, quietly. Here: the deck's table-presence
  // mark, the standing reminder that this room's draws are commitment-checked.
  host.ui.register({
    id: "table_mark",
    anchor: "message-footer",
    title: "At the table",
    tier: "static",
    spec: { kind: "badge", intent: "neutral", text: "⟡ draws are committed — reveal verifies" },
  });
}

host.log.info(`oracle deck ready — ${DECK.length} cards (grants: ${host.grants.join(", ") || "none"})`);
