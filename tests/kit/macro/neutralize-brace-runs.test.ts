// Text another author wrote stays literal through the macro engine once `neutralizeMacros` has seen it: no run
// of braces of any length leaves an opener, so neither a read nor a write macro fires. The kit's own splicing
// callers (a user macro's argument, a guided greeting's `{{base}}`) carry the same property.

import { resolveGuidedInstruction } from "@orb/kit/guided";
import { createIdSource, ID_PREFIX } from "@orb/kit/ids";
import type { MacroSourceRef, UserMacroDef } from "@orb/kit/macro";
import { createDefaultRegistry, neutralizeMacros, processMacros, registerUserMacros } from "@orb/kit/macro";
import { expect, test } from "@orb/testkit/node";

const CHAR = "KEEPER";
const USER = "TRAVELER";
const RUN_LENGTHS = [2, 3, 4, 5] as const;
const SOURCE: MacroSourceRef = { kind: "preset", id: createIdSource().typeId(ID_PREFIX.preset) };

interface Rendered {
  readonly text: string;
  readonly env: Record<string, string>;
}

function render(text: string): Rendered {
  const env: Record<string, string> = {};
  return { text: processMacros(text, { char: CHAR, user: USER, persona: "P", scenario: "S", env }), env };
}

/** Every shape a run of `n` braces takes: matched, opener only, closer only, uneven, beside text, and as a write. */
function payloads(n: number): readonly string[] {
  const open = "{".repeat(n);
  const close = "}".repeat(n);
  return [
    `${open}char${close}`,
    `${open}char}}`,
    `{{user${close}`,
    `before ${open}char${close} between ${open}user${close} after`,
    `opener only ${open}char and text`,
    `closer only char${close} and text`,
    `${open}setvar::run${String(n)}::written${close}`,
    `mixed ${open}setvar::mixed${String(n)}::written}} then ${open}{{user}}${close}`,
  ];
}

// The control: the same options reach the engine, which reads and writes through an exact pair.
test("an unneutralized pair evaluates, so the absence below is the neutralizer's doing", () => {
  expect(render("{{char}} and {{user}}").text).toBe(`${CHAR} and ${USER}`);
  expect(render("{{setvar::live::written}}").env).toEqual({ live: "written" });
});

// Stored lore and stashed cards hold these bytes, so an exact pair keeps the one zero-width space between its braces.
test("an exact pair neutralizes to the stored bytes: one U+200B between the two braces", () => {
  expect(neutralizeMacros("a {{char}} b")).toBe("a {\u200B{char}\u200B} b");
});

test.for(RUN_LENGTHS)("a run of %i braces evaluates nothing after neutralizing", (n) => {
  for (const payload of payloads(n)) {
    const out = render(neutralizeMacros(payload));
    expect(out.env, payload).toEqual({});
    expect(out.text, payload).not.toContain(CHAR);
    expect(out.text, payload).not.toContain(USER);
    expect(out.text.replace(/[^\p{L}\p{N}:]+/gu, " ").trim(), payload).toBe(payload.replace(/[^\p{L}\p{N}:]+/gu, " ").trim());
  }
});

test("a user macro's argument that resolves to another author's brace run splices in literal", () => {
  const what: UserMacroDef["args"][number] = { name: "what", type: "string", optional: false };
  const def: UserMacroDef = { name: "shout", description: "", args: [what], body: "[{{what}}]", inputs: [], strict: false };
  const registry = createDefaultRegistry();
  registerUserMacros(registry, [def], { source: SOURCE });
  const env: Record<string, string> = { payload: "{{{setvar::spliced::written}}}{{{char}}}" };
  const out = processMacros("{{shout::{{getvar::payload}}}}", { char: CHAR, user: USER, persona: "P", scenario: "S", env }, registry);
  expect(out).toContain("setvar::spliced::written");
  expect(out).not.toContain(CHAR);
  expect(Object.keys(env)).toEqual(["payload"]);
});

test("a brace a user macro's template writes against its slot cannot pair with the spliced value's edge brace", () => {
  const what: UserMacroDef["args"][number] = { name: "what", type: "string", optional: false };
  const def: UserMacroDef = { name: "edge", description: "", args: [what], body: "[{{{what}}}]", inputs: [], strict: false };
  const registry = createDefaultRegistry();
  registerUserMacros(registry, [def], { source: SOURCE });
  // A variable read delivers the value whole; written inline, its `::` would split it into several arguments.
  const env: Record<string, string> = { value: "{setvar::edge::written}" };
  const out = processMacros("{{edge::{{getvar::value}}}}", { char: CHAR, user: USER, persona: "P", scenario: "S", env }, registry);
  expect(out).toContain("setvar::edge::written");
  expect(env).toEqual({ value: "{setvar::edge::written}" });
});

test("a brace a guided template writes against its base slot cannot pair with the base text's edge brace", () => {
  const env: Record<string, string> = {};
  const out = resolveGuidedInstruction(
    "{{user}} rewrites: {{{base}}}",
    "",
    { char: CHAR, user: USER, persona: "P", scenario: "S", env },
    {
      base: "{setvar::edge::written}",
    },
  );
  expect(out.startsWith(`${USER} rewrites:`)).toBe(true);
  expect(out).toContain("setvar::edge::written");
  expect(env).toEqual({});
});

/** A one-arg user macro named `edge` whose body is `body`, rendered with the value delivered whole through a variable. */
function renderEdge(body: string, value: string): { readonly out: string; readonly env: Record<string, string> } {
  const what: UserMacroDef["args"][number] = { name: "what", type: "string", optional: false };
  const registry = createDefaultRegistry();
  registerUserMacros(registry, [{ name: "edge", description: "", args: [what], body, inputs: [], strict: false }], { source: SOURCE });
  const env: Record<string, string> = { value };
  return { out: processMacros("{{edge::{{getvar::value}}}}", { char: CHAR, user: USER, persona: "P", scenario: "S", env }, registry), env };
}

function guidedBase(template: string, base: string): string {
  return resolveGuidedInstruction(template, "", { char: CHAR, user: USER, persona: "P", scenario: "S", env: {} }, { base });
}

// The mirrors of the case above: a value's edge brace of either kind meets the template's brace on that side.
test("a value ending in an opening brace cannot pair with the opening brace a template writes after the slot", () => {
  expect(renderEdge("({{what}}{char}})", "story {").out).not.toContain(CHAR);
  expect(guidedBase("{{base}}{char}}", "greeting {")).not.toContain(CHAR);
});

test("a value starting with a closing brace cannot pair with the closing brace a template writes before the slot", () => {
  expect(renderEdge("({{char}{{what}})", "} story").out).not.toContain(CHAR);
  expect(guidedBase("{{char}{{base}}", "} greeting")).not.toContain(CHAR);
});

test("a spliced value's replacement patterns stay literal text", () => {
  for (const pattern of ["$&", "$$", "$`", "$'"]) {
    expect.soft(renderEdge("<{{what}}>", pattern).out, `user macro ${pattern}`).toBe(`<${pattern}>`);
    expect.soft(guidedBase("<{{base}}>", pattern), `guided base ${pattern}`).toBe(`<${pattern}>`);
  }
});

test("a guided greeting's base text keeps its brace runs literal while the template's own macros evaluate", () => {
  const env: Record<string, string> = {};
  const out = resolveGuidedInstruction(
    "{{user}} rewrites: {{base}} / {{input}}",
    "{{{setvar::input::written}}}",
    { char: CHAR, user: USER, persona: "P", scenario: "S", env },
    {
      base: "{{{setvar::base::written}}}{{{char}}}",
    },
  );
  expect(out.startsWith(`${USER} rewrites:`)).toBe(true);
  expect(out).toContain("setvar::base::written");
  expect(out).toContain("setvar::input::written");
  expect(out).not.toContain(CHAR);
  expect(env).toEqual({});
});
