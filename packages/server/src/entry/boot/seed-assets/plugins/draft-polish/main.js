// Draft Polish — the PROMPT-TRANSFORM archetype of an Orbweaver plugin.
//
// WHAT IT DOES. It sits on the draft the member is about to send and cleans up typographic scruff before the
// model reads it: three dots become a real ellipsis, doubled spaces collapse, a stray double-space before
// punctuation goes away. The room still shows what the member typed; the MODEL reads the tidied version.
//
// THE DEFINING CONSTRAINT, and the whole reason this archetype is separate: A TRANSFORM HAS 250 ms AND
// CANNOT DO I/O. The registry bounds each transform's `apply` at 250 ms and SKIPS it on a throw or a timeout,
// while `net.fetch`'s own deadline is 5 SECONDS. Those two numbers are structurally incompatible: a fetching
// transform cannot exist. Neither can a `llm.quiet` transform, an `await`-a-database transform, or anything
// else that leaves the sandbox. What fits here is PURE, LOCAL, SYNCHRONOUS-SHAPED text work — string
// manipulation over `input.draft`, with `input.env` carrying the chat id and the current variables so a
// context-sensitive transform still needs no host round-trip.
//
// THE OTHER WALL: SCOPE. The prompt-transform registry is process-global and chat-blind, so the host gates
// every plugin transform on the installer HOSTING the chat. In a room you do not host, your `apply` is never
// called and the draft passes through untouched. That is a fail-closed decision made above you — you cannot
// detect it, and you must not design around it.
//
// A TRANSFORM MUST BE IDEMPOTENT-SAFE AND CONSERVATIVE. It rewrites a human's words. Every rule below is one
// a copy editor would make silently and nobody would argue with; none of them changes meaning, and running
// the output through again changes nothing further. When in doubt, return the draft unchanged — the failure
// mode of an over-eager transform is a member watching the model answer words they did not write.

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

/** The whole transform, as ONE pure function of a string. Pure means: testable in isolation, trivially inside
 *  the deadline, and impossible to accidentally give a side effect. */
function polish(draft) {
  return draft.replaceAll(ELLIPSIS_RE, "…").replaceAll(SPACE_BEFORE_PUNCT_RE, "$1").replaceAll(RUN_OF_SPACES_RE, " ").replaceAll(TRAILING_SPACE_RE, "");
}

// `transforms.register` is activation-time and synchronous, exactly like `tools.register` and `events.on`.
//   * `point` is `"user_input"` (the member's outgoing draft) or `"assembled_dynamic"` (the assembled prompt
//     block). You do NOT supply an order: the host assigns plugin transforms a band ABOVE every first-party
//     one, by registration order, so a plugin can never jump the queue ahead of the app's own rules.
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

host.log.info("draft polish ready — user_input transform registered");
