// The display pass reports a row as styled only when a display script's OWN template drew markup into it:
// model-written markup, a capture that echoes it, a text-only template, a script that never matched and a
// script the display guard refuses all leave the row unstyled. Runs `renderStyledMessageForDisplay`, the
// display pipeline every transcript row renders through.
import type { MessageRenderContext } from "@orb/client/lib";
import { renderMessageForDisplay, renderStyledMessageForDisplay } from "@orb/client/lib";
import type { CharacterId, PersonaId } from "@orb/kit/ids";
import type { RowCharacterName, RowPersonaName } from "@orb/kit/macro";
import type { RegexScriptInput } from "@orb/kit/regex";
import { executeRegexScripts } from "@orb/kit/regex";
import { expect, test } from "@orb/testkit/node";
import { describe } from "vitest";

const BANNER_SOURCE = '<scene_header location="Great Hall" />';
const BANNER_TEMPLATE = '<div class="banner"><style>.banner{color:#f4a261}</style><strong>$1</strong></div>';

function displayScript(findRegex: string, replaceString: string): RegexScriptInput {
  return { enabled: true, placement: ["DISPLAY"], findRegex, replaceString };
}

function context(displayScripts: readonly RegexScriptInput[]): MessageRenderContext {
  return { characterNamesById: new Map<CharacterId, RowCharacterName>(), personaNamesById: new Map<PersonaId, RowPersonaName>(), displayScripts };
}

const banner = displayScript(String.raw`/<scene_header location="([^"]*)" \/>/g`, BANNER_TEMPLATE);

describe("a row is styled only by a display script's own markup", () => {
  test("a markup template that replaced a match styles the row, and the text is the plain pass's text", () => {
    const ctx = context([banner]);
    const styled = renderStyledMessageForDisplay(`Prose.\n\n${BANNER_SOURCE}`, ctx);
    expect(styled).toEqual({ text: `Prose.\n\n<div class="banner"><style>.banner{color:#f4a261}</style><strong>Great Hall</strong></div>`, styled: true });
    expect(renderMessageForDisplay(`Prose.\n\n${BANNER_SOURCE}`, ctx)).toBe(styled.text);
  });

  test.for([
    { name: "model-written markup with no scripts", scripts: [], body: '<div style="color:red">Bare</div>' },
    { name: "a markup template that matched nothing", scripts: [banner], body: "Plain prose." },
    {
      name: "a template that only echoes the model's markup",
      scripts: [displayScript("/<b>(.*?)<\\/b>/g", "$1")],
      body: '<b><div style="color:red">x</div></b>',
    },
    { name: "a whole-match echo", scripts: [displayScript("/<div[^>]*>/g", "{{MATCH}}")], body: '<div style="color:red">x</div>' },
    { name: "a named-group echo", scripts: [displayScript("/<i>(?<tag>.*?)<\\/i>/g", "$<tag>")], body: '<i><b style="color:red">x</b></i>' },
    { name: "a text-only template", scripts: [displayScript("/Great/g", "Grand $$")], body: "Great Hall" },
    { name: "a template whose only angle bracket opens no tag", scripts: [displayScript("/love/g", "<3 love")], body: "love" },
    { name: "a markup template the display guard refuses", scripts: [displayScript("/(a+)+<scene/g", "<div>refused</div>")], body: "aaaa<scene" },
  ])("$name leaves the row unstyled", ({ scripts, body }) => {
    expect(renderStyledMessageForDisplay(body, context(scripts)).styled).toBe(false);
  });

  test.for([
    { name: "an opening-tag-only template", template: '<span style="color:#f4a261">' },
    { name: "a closing-tag-only template", template: "</span></div>" },
    { name: "markup after a literal dollar", template: "$$<b>paid</b>" },
    { name: "markup after a literal that only looks like a capture", template: "$x<em>tagged</em>" },
  ])("$name styles the row", ({ template }) => {
    expect(renderStyledMessageForDisplay("[mark]", context([displayScript(String.raw`/\[mark\]/g`, template)])).styled).toBe(true);
  });

  test("chained scripts produce the text the executor produces over the whole list in one call", () => {
    const scripts = [banner, displayScript("/Great/g", "Grand"), displayScript("/<strong>/g", '<strong class="loud">'), displayScript("/(b+)+c/g", "never")];
    const body = `${BANNER_SOURCE} Great things.`;
    const whole = executeRegexScripts({ text: body, scripts, placement: "DISPLAY", ctx: { char: "", user: "", persona: "", scenario: "", env: {} } });
    const styled = renderStyledMessageForDisplay(body, context(scripts));
    expect(styled.text).toBe('<div class="banner"><style>.banner{color:#f4a261}</style><strong class="loud">Grand Hall</strong></div> Grand things.');
    expect(whole).toBe(styled.text);
    expect(styled.styled).toBe(true);
  });
});
