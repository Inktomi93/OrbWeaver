// Draft Polish — the TEXT-PIPELINE archetype of an Orbweaver plugin: ONE capability, TWO seams.
//
// WHAT IT DOES. Two registrations, same craft, opposite directions:
//   * a PROMPT transform (`transforms.register`) tidies the draft a member is about to send, on its way to
//     the MODEL — the room still shows what the member typed; the model reads the cleaned version;
//   * a DISPLAY transform (`transforms.registerDisplay`) typesets what YOUR OWN SCREEN shows — curly quotes,
//     real ellipses, em dashes — without touching canon, the model, or any other viewer.
// Both ride the ONE `chat.transform` capability: a display rewrite of your own screen is strictly narrower
// than the prompt rewrite that capability already buys, so there is no second consent line to ask for.
//
// THE TWO SEAMS, side by side — copy the one you actually need:
//
//   |                    | prompt transform (`register`)         | display transform (`registerDisplay`)   |
//   | reaches            | the MODEL (and only the model)        | the INSTALLER's screen (and only it)    |
//   | canon              | untouched (the room shows the typed)  | untouched (a re-render decoration)      |
//   | input              | `{draft, env:{chatId, vars}}`         | `{text, env:{chatId, messageId}}`       |
//   | deadline           | 250 ms, SKIP on throw/overrun (D53)   | per-message budget, SKIP on throw       |
//   | scope gate         | installer must HOST the room          | none — it is your own screen            |
//   | risk if wrong      | the model answers words nobody wrote  | a glyph looks odd until you disable it  |
//
// That last row is the design lesson: the PROMPT seam must be timid (every rule below is one a copy editor
// would make silently), while the DISPLAY seam may be bolder — a wrong display glyph costs a shrug, so the
// display side also does smart quotes, which the prompt side deliberately leaves alone.
//
// THE DEFINING CONSTRAINT of the prompt seam: A TRANSFORM HAS 250 ms AND CANNOT DO I/O. The registry bounds
// each `apply` and SKIPS it on a throw or a timeout, while `net.fetch`'s own deadline is 5 SECONDS — a
// fetching transform cannot exist, structurally. Neither can an `llm.quiet` transform. What fits is PURE,
// LOCAL text work over `input.draft`, with `input.env` carrying the chat id and current variables so a
// context-sensitive transform still needs no host round-trip.
//
// THE OTHER WALL: SCOPE. The prompt-transform registry is process-global and chat-blind, so the host gates
// every plugin transform on the installer HOSTING the chat. In a room you do not host, your `apply` is never
// called and the draft passes through untouched. Fail-closed, decided above you. The DISPLAY seam has no such
// gate — it rewrites only what your own client already rendered, which is yours to decorate.
//
// A TRANSFORM MUST BE IDEMPOTENT-SAFE AND CONSERVATIVE. Both of these rewrite a human's words. Running the
// output through again changes nothing further; when in doubt, return the input unchanged.

const host = orb.host(1);

/** Three-or-more dots → one ellipsis. The most common piece of scruff in roleplay prose. */
const ELLIPSIS_RE = /\.{3,}/g;

/** Runs of horizontal whitespace → one space. Newlines are deliberately NOT touched: paragraph shape is
 *  authorial, and collapsing it would be the meaning-changing edit this file swore off. */
const RUN_OF_SPACES_RE = /[ \t]{2,}/g;

/** A space stranded before sentence punctuation. */
const SPACE_BEFORE_PUNCT_RE = / +([,.;:!?])/g;

/** Trailing horizontal whitespace at the end of any line. */
const TRAILING_SPACE_RE = /[ \t]+$/gm;

/** The rules BOTH seams share — ellipses, stranded spaces, runs of spaces. One pure function of a string. */
function tidy(text) {
  return text.replaceAll(ELLIPSIS_RE, "…").replaceAll(SPACE_BEFORE_PUNCT_RE, "$1").replaceAll(RUN_OF_SPACES_RE, " ");
}

/** The whole PROMPT-side transform. Trailing-space stripping lives ONLY here, and that placement is a bug
 *  this plugin's own test suite caught: the display path runs over SEGMENTS between code spans, and
 *  `TRAILING_SPACE_RE`'s `$` anchor matches a segment's end — so "ran `echo`" lost the space before its
 *  backtick. A rule that is safe on a whole draft is not automatically safe on a slice of one. On screen,
 *  trailing whitespace is invisible anyway; in a prompt it is bytes, which is why the prompt side keeps it. */
function polish(draft) {
  return tidy(draft).replaceAll(TRAILING_SPACE_RE, "");
}

// ── the DISPLAY-side extras (bolder, screen-only) ──────────────────────────────────────────────────────────

/** `--` between words → an em dash. Display-only: an em dash in a PROMPT is byte-noise to argue about; on a
 *  screen it is just better typesetting. */
const DOUBLE_DASH_RE = /(\S) ?-- ?(?=\S)/g;

/** An apostrophe INSIDE a word (don't, it's, o'clock) → the typographic one. */
const APOSTROPHE_RE = /(\w)'(?=\w)/g;

/** A straight double quote that OPENS (after start-of-line/whitespace/an opening bracket) vs one that
 *  CLOSES. Two passes, order matters: openers first, then everything left is a closer. */
const OPEN_DQUOTE_RE = /(^|[\s([{])"/gm;
const CLOSE_DQUOTE_RE = /"/g;

/** Smart-set ONE prose segment. Straight quotes → curly, `--` → em dash, on top of the shared `tidy` (NOT
 *  `polish` — see its header for why trailing-space stripping must not run on a segment). */
function typesetProse(text) {
  return tidy(text).replaceAll(DOUBLE_DASH_RE, "$1—").replaceAll(APOSTROPHE_RE, "$1’").replaceAll(OPEN_DQUOTE_RE, "$1“").replaceAll(CLOSE_DQUOTE_RE, "”");
}

/** THE GOTCHA THIS FUNCTION EXISTS FOR: display text arrives BEFORE markdown renders (the recorded ordering
 *  is member macros → member display regex → plugin display transforms → markdown). So the string still
 *  contains markdown syntax, and a naive quote pass would corrupt code: `"hello"` inside a backtick span is
 *  CODE, and curling its quotes changes what the block says. Split on code spans (fenced first — a fence can
 *  contain backticks), typeset only the prose between them, and reassemble byte-for-byte around the code. */
const CODE_SPAN_RE = /(```[\s\S]*?```|`[^`\n]*`)/g;

function typeset(text) {
  return text
    .split(CODE_SPAN_RE)
    .map((segment, i) => (i % 2 === 1 ? segment : typesetProse(segment)))
    .join("");
}

// ── the registrations ──────────────────────────────────────────────────────────────────────────────────────
// Both are activation-time and synchronous, like `tools.register` and `events.on` — and both sit behind a
// FEATURE-DETECT of the grant. A user may install this and grant nothing; an ungranted host call THROWS, and
// a throw at activation takes the whole plugin down. Degrading to a clear log line is the house idiom.

if (host.grants.includes("chat.transform")) {
  //   * `point` is `"user_input"` (the member's outgoing draft) or `"assembled_dynamic"` (the assembled
  //     prompt's dynamic half). You do NOT supply an order: the host assigns plugin transforms a band ABOVE
  //     every first-party one, by registration order, so a plugin can never jump the queue.
  //   * `apply` receives ONE object — `{draft, env}` — and returns the new draft. `env` is `{chatId, vars}`,
  //     read synchronously, so the common "branch on a chat variable" case needs no host call inside the 250 ms.
  host.transforms.register({
    name: "typography",
    point: "user_input",
    apply: (input) => {
      const draft = input && typeof input.draft === "string" ? input.draft : "";
      // A `vars` read costs nothing here (the host handed it over with the draft) — this is the shape a
      // context-sensitive transform uses. `polishOff` in the room's variables turns the plugin off for that
      // room without touching the grant, which is the courtesy an always-on transform owes its users.
      const vars = input?.env?.vars ? input.env.vars : {};
      if (vars.polishOff === "1") {
        return draft;
      }
      return polish(draft);
    },
  });

  // The DISPLAY seam. `input.text` is what your client has ALREADY rendered for the row (macros and your
  // display regex have run); the return replaces it on YOUR screen only. A throw or an overrun SKIPS this
  // transform — the row keeps the text it had, never a spinner, never a blocked message. Note the env: there
  // is no `vars` here (and so no per-room opt-out) — a display transform is per-VIEWER, and its off switch is
  // the plugin toggle in Settings → Plugins.
  host.transforms.registerDisplay({
    name: "typeset",
    apply: (input) => Promise.resolve(typeset(input && typeof input.text === "string" ? input.text : "")),
  });

  host.log.info("draft polish ready — user_input transform + display typesetting registered");
} else {
  // Dormant, and SAYING SO — the log line is what a person finds when they wonder why nothing changed.
  host.log.warn("draft polish is dormant: the chat.transform capability is not granted (Settings → Plugins)");
}
