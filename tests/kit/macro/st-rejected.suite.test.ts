// ST macro-engine DELIBERATELY-REJECTED constructs — pinned as EXPLICIT rejection tests. Each input
// carries a SillyTavern grammar feature that orbweaver's macro engine designs OUT (D46 permanently
// rejected STscript / getContext() machinery; the substitution language is `kit/macro` ONLY). These pins
// assert our engine's DOCUMENTED fallback (literal passthrough of the unrecognized source span, or ""),
// so if a future change ever started INTERPRETING one of these ST forms, this file goes red on purpose.
//
// The CAPABILITY behind each rejected MECHANISM (where it lives in orbweaver's stack — EXISTS / PLANNED /
// MISSING) is mapped in the report's capability-parity ledger, NOT here (code pins the render behavior;
// the ledger maps the capability). ST source refs are file:line under
// neo-tavern/references/sillytavern/tests/frontend/ (READ-ONLY reference).

import type { ProcessMacroOptions } from "@orb/kit/macro";
import { processMacros } from "@orb/kit/macro";
import { expect, test } from "../../support/fixtures";

function opts(extra: Partial<ProcessMacroOptions> = {}): ProcessMacroOptions {
  return { char: "Character", user: "User", persona: "Hero", scenario: "A quest", env: {}, ...extra };
}
const render = (input: string, extra: Partial<ProcessMacroOptions> = {}): string => processMacros(input, opts(extra));

// ── Legacy angle-bracket identity markers <USER>/<BOT>/<CHAR>/<GROUP> (MacroEngine.e2e.js:194-216) ──
// ST rewrites these via a substituteParams PRE-PROCESSING pass (a legacy STscript compat layer).
// Orbweaver has NO render-time angle-bracket marker layer — the parser only touches `{{…}}`.

test("[reject] legacy <USER> marker is left verbatim (no angle-bracket pre-processor)", () => {
  expect(render("Hello <USER>!")).toBe("Hello <USER>!");
});

test("[reject] legacy <BOT>/<CHAR> markers are left verbatim", () => {
  expect(render("Bot: <BOT>, Char: <CHAR>.")).toBe("Bot: <BOT>, Char: <CHAR>.");
});

// ── STscript execution-modifier flags {{!m}} {{?m}} {{~m}} {{>m}} (MacroLexer.e2e.js:513-643) ──────
// ST's lexer recognizes `! ? ~ / >` as macro EXECUTION MODIFIERS before the identifier. Orbweaver's
// MACRO_IDENT requires a leading LETTER (parser.ts) — a `{{!` / `{{?` / `{{~` / `{{>` fails the identifier
// match, so the whole tag re-emits as its literal source span (never a flagged invocation).

test("[reject] the ! execution-modifier flag is not parsed — tag is literal", () => {
  expect(render("{{!setvar::x::1}}")).toBe("{{!setvar::x::1}}");
});

test("[reject] the ? execution-modifier flag is not parsed — tag is literal", () => {
  expect(render("{{?getvar::x}}")).toBe("{{?getvar::x}}");
});

test("[reject] the ~ execution-modifier flag is not parsed — tag is literal", () => {
  expect(render("{{~char}}")).toBe("{{~char}}");
});

test("[reject] the > filter-modifier flag is not parsed — tag is literal", () => {
  expect(render("{{>char}}")).toBe("{{>char}}");
});

// The `#` flag: ST treats a leading `#` as a legacy no-op flag (MacroEngine.e2e.js:1371) that STILL
// resolves the macro (`{{#char}}` → the char name). Orbweaver's `#` is the BLOCK-OPEN marker (parser.ts):
// `{{#char}}` opens a block named `char` that never closes → rescued as its literal open-tag text. A hard
// GRAMMAR COLLISION, not merely an ignored flag — `#` means something DIFFERENT in each engine.
test("[reject] a leading # opens a block in ours (not ST's no-op flag) — unclosed → literal", () => {
  expect(render("{{#char}}")).toBe("{{#char}}");
});

// ── Variable shorthand syntax {{$local}} {{$$global}} {{var++}} {{var=v}} (MacroLexer.e2e.js:708-933) ──
// ST's lexer has dedicated `$`/`$$`/`++`/`--`/`=`/`+=` variable-shorthand tokens. Orbweaver has no `$`
// sigil — a `$name` fails MACRO_IDENT (leading `$` isn't a letter) → literal passthrough. Our variables
// ride explicit macros ({{getvar}}/{{setvar}}/{{incvar}}/…), never a sigil shorthand.

test("[reject] local-variable shorthand {{$name}} is left verbatim", () => {
  expect(render("{{$greeting}}", { env: { greeting: "Hi" } })).toBe("{{$greeting}}");
});

test("[reject] global-variable shorthand {{$$name}} is left verbatim", () => {
  expect(render("{{$$streak}}")).toBe("{{$$streak}}");
});

test("[reject] increment shorthand {{$name++}} is left verbatim", () => {
  expect(render("{{$counter++}}")).toBe("{{$counter++}}");
});

test("[reject] set shorthand {{$name=value}} is left verbatim", () => {
  expect(render("{{$key=val}}")).toBe("{{$key=val}}");
});

// ── Output modifiers (pipe) {{macro|other}} (MacroLexer.e2e.js:934-1088) ───────────────────────────
// ST chains post-processing via `|name` output modifiers. Orbweaver has NO pipe grammar — the `|` is an
// ordinary arg character. `{{getvar::x|upper}}` reads the key literally as "x|upper" (no such var) → "".
// (The general post-processing seam in ours is ctx.postProcess / block transforms, not a pipe operator.)

test("[reject] a |modifier pipe is swallowed into the arg (no output-modifier grammar)", () => {
  // getvar's key becomes "x|upper" (never set) → "" — the pipe is inert, not a chain operator.
  expect(render("{{getvar::x|upper}}", { env: { x: "hi" } })).toBe("");
});

// ── STscript slash-command bridge macros {{pipe}} {{var::k::i}} {{arg::k}} (MacroSlashCommands.e2e.js) ──
// These only exist inside ST's slash-command execution pipeline (executeSlashCommandsWithOptions +
// getContext scope). D46 permanently rejected STscript. Unregistered in orbweaver → literal passthrough.

test("[reject] the STscript {{pipe}} macro is unknown → literal passthrough", () => {
  expect(render("{{pipe}}")).toBe("{{pipe}}");
});

test("[reject] the STscript {{var::key::index}} indexed-var macro is unknown → literal passthrough", () => {
  expect(render("{{var::list::1}}")).toBe("{{var::list::1}}");
});

test("[reject] the STscript {{arg::name}} closure-arg macro is unknown → literal passthrough", () => {
  expect(render("{{arg::x}}")).toBe("{{arg::x}}");
});

// ── ST named key=value arguments {{macro key=value}} (MacroLexer.e2e.js:255-404) ───────────────────
// ST supports NAMED arguments. Orbweaver macros take POSITIONAL args only — a `key=value` token is passed
// through as a positional arg string; for an unregistered macro the whole tag re-emits verbatim.
test("[reject] ST named key=value args on an unknown macro → literal passthrough", () => {
  expect(render("{{unknownmacro text=abc}}")).toBe("{{unknownmacro text=abc}}");
});
