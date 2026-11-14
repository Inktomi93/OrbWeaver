// A user macro resolves an argument a second time only when the call delivered it raw (the `?` flag). An argument
// the engine already resolved, such as a variable read, splices in as literal text, so the variable's own macros
// read and write nothing.

import { createIdSource, ID_PREFIX } from "@orb/kit/ids";
import type { MacroSourceRef, UserMacroDef } from "@orb/kit/macro";
import { createDefaultRegistry, processMacros, registerUserMacros } from "@orb/kit/macro";
import { expect, test } from "@orb/testkit/node";

const CHAR = "KEEPER";
const SOURCE: MacroSourceRef = { kind: "preset", id: createIdSource().typeId(ID_PREFIX.preset) };
const PAYLOAD = "{{setvar::spliced::1}}{{char}}";

function render(template: string): { text: string; env: Record<string, string> } {
  const what: UserMacroDef["args"][number] = { name: "what", type: "string", optional: false };
  const def: UserMacroDef = { name: "shout", description: "", args: [what], body: "[{{what}}]", inputs: [], strict: false };
  const registry = createDefaultRegistry();
  registerUserMacros(registry, [def], { source: SOURCE });
  const env: Record<string, string> = { payload: PAYLOAD };
  return { text: processMacros(template, { char: CHAR, user: "U", persona: "P", scenario: "S", env }, registry), env };
}

function words(text: string): string {
  return text.replace(/[^\p{L}\p{N}:]+/gu, " ").trim();
}

test.for(["{{shout::{{getvar::payload}}}}", "{{!shout::{{getvar::payload}}}}"])("%s splices the variable's text in literal and writes nothing", (template) => {
  const out = render(template);
  expect(words(out.text)).toBe(words(`[${PAYLOAD}]`));
  expect(out.text).not.toContain(CHAR);
  expect(out.env).toEqual({ payload: PAYLOAD });
});

test("a call that delivers its argument raw still resolves the author's own macros once", () => {
  const out = render("{{?shout::{{setvar::raw::1}}{{char}}}}");
  expect(out.text).toBe(`[${CHAR}]`);
  expect(out.env).toEqual({ payload: PAYLOAD, raw: "1" });
});

test("a raw argument that reads a variable resolves the read once, and the variable's text stays literal", () => {
  const out = render("{{?shout::{{getvar::payload}}}}");
  expect(words(out.text)).toBe(words(`[${PAYLOAD}]`));
  expect(out.env).toEqual({ payload: PAYLOAD });
});
