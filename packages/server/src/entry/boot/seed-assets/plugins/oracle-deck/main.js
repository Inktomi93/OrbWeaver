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
//   * NO CUSTOM RENDERING. The client's tool-renderer registry is first-party and assembled at build time; a
//     plugin cannot register one. Your tool's call and its result render in the GENERIC tool block. Bespoke
//     card art is a real gap, not an exercise for the reader — design your result STRING to read well as
//     plain text, because plain text is what the room gets.
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

/** Load the live session, or `null`. A malformed value (hand-edited, or written by an older version of this
 *  plugin) is treated as absent rather than thrown on — a plugin that crashes on its own stored state is a
 *  plugin that auto-disables three invocations later. */
async function loadSession() {
  const raw = await host.storage.get(SESSION_KEY);
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

/** Start a session: mint the secret from the host's injected id seam and publish its commitment. */
async function startSession() {
  const session = { seed: host.ids.mint(), dealt: 0 };
  await host.storage.set(SESSION_KEY, JSON.stringify(session));
  return session;
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

// ── the tools ──────────────────────────────────────────────────────────────────────────────────────────────
// `tools.register` is activation-time and synchronous. The host namespaces each name to
// `plugin_<slug>_<name>` (so this pair lands as `plugin_oracle_deck_draw` / `plugin_oracle_deck_reveal`) and
// registers it into the ONE tool registry every other tool consumer already funnels through. Your handler runs
// IN the sandbox under the per-invocation budget, and whatever STRING it returns is what the model reads —
// returned verbatim, never re-encoded, so `JSON.stringify(x)` yields exactly that JSON to the model.

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
    const existing = await loadSession();
    const session = existing ?? (await startSession());
    const cards = shuffleFor(session.seed);

    if (session.dealt >= cards.length) {
      return "The deck is spent. Call reveal to verify this session, then draw again for a fresh shuffle.";
    }
    const taken = cards.slice(session.dealt, session.dealt + count);
    await host.storage.set(SESSION_KEY, JSON.stringify({ seed: session.seed, dealt: session.dealt + taken.length }));

    const drawn = taken.map((card, i) => `${session.dealt + i + 1}. ${card}`).join("\n");
    // The commitment rides only on the FIRST draw — that is the moment it means something, and repeating it
    // every draw would train everyone to skip the line that matters.
    return existing === null ? `Commitment ${commitmentFor(session.seed)} (verify after reveal)\n${drawn}` : drawn;
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

host.log.info(`oracle deck ready — ${DECK.length} cards (grants: ${host.grants.join(", ") || "none"})`);
