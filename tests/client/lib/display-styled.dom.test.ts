// The display pass reports a row as styled only when a display script's OWN template drew markup into it:
// model-written markup, a capture that echoes it, a text-only template and a script that never matched all leave
// the row unstyled. Runs `renderStyledMessageForDisplay`, the display pipeline the Worker's per-script step shares.
import type { RegexScriptRow } from "@orb/contracts/regex";
import { rawTextElements } from "@orb/kit/content";
import type { CharacterId, PersonaId } from "@orb/kit/ids";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import type { RowCharacterName, RowPersonaName } from "@orb/kit/macro";
import { NO_SEATS } from "@orb/kit/message-author";
import { executeRegexScripts } from "@orb/kit/regex";
import { createSeededIds } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import { describe } from "vitest";
import type { DisplayRowCall, MessageRenderContext } from "#client/lib/message-render.ts";
import { renderMessageForDisplay, renderStyledMessageForDisplay } from "#client/lib/message-render.ts";

const BANNER_SOURCE = '<scene_header location="Great Hall" />';
const BANNER_TEMPLATE = '<div class="banner"><style>.banner{color:#f4a261}</style><strong>$1</strong></div>';

const ids = createSeededIds();

function displayScript(findRegex: string, replaceString: string): RegexScriptRow {
  return {
    id: mintTypeId(ID_PREFIX.regexScript, ids.next),
    name: findRegex,
    enabled: true,
    updatedAt: 0,
    targets: ["AI_OUTPUT"],
    passes: ["display"],
    findRegex,
    replaceString,
    runOnEdit: false,
    trimStrings: [],
    substituteRegex: 0,
  };
}

function context(displayScripts: readonly RegexScriptRow[]): MessageRenderContext {
  return {
    characterNamesById: new Map<CharacterId, RowCharacterName>(),
    personaNamesById: new Map<PersonaId, RowPersonaName>(),
    displayScripts,
    room: NO_SEATS,
  };
}

// A settled reply at the newest position.
const REPLY: DisplayRowCall = {
  target: "AI_OUTPUT",
  row: { role: "assistant", kind: "standard", authorUserId: null, characterId: null, personaId: null },
  depth: 0,
};

const banner = displayScript(String.raw`/<scene_header location="([^"]*)" \/>/g`, BANNER_TEMPLATE);

describe("a row is styled only by a display script's own markup", () => {
  test("a markup template that replaced a match styles the row, and the text is the plain pass's text", () => {
    const ctx = context([banner]);
    const styled = renderStyledMessageForDisplay(`Prose.\n\n${BANNER_SOURCE}`, ctx, REPLY);
    expect(styled).toEqual({ text: `Prose.\n\n<div class="banner"><style>.banner{color:#f4a261}</style><strong>Great Hall</strong></div>`, styled: true });
    expect(renderMessageForDisplay(`Prose.\n\n${BANNER_SOURCE}`, ctx, REPLY)).toBe(styled.text);
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
  ])("$name leaves the row unstyled", ({ scripts, body }) => {
    expect(renderStyledMessageForDisplay(body, context(scripts), REPLY).styled).toBe(false);
  });

  test.for([
    { name: "an opening-tag-only template", template: '<span style="color:#f4a261">' },
    { name: "a closing-tag-only template", template: "</span></div>" },
    { name: "markup after a literal dollar", template: "$$<b>paid</b>" },
    { name: "markup after a literal that only looks like a capture", template: "$x<em>tagged</em>" },
  ])("$name styles the row", ({ template }) => {
    expect(renderStyledMessageForDisplay("[mark]", context([displayScript(String.raw`/\[mark\]/g`, template)]), REPLY).styled).toBe(true);
  });

  test("a markup template whose replacement leaves the text unchanged still styles the row", () => {
    const styled = renderStyledMessageForDisplay("<b>Bold</b>", context([displayScript("/<b>/g", "<b>")]), REPLY);

    expect(styled).toEqual({ text: "<b>Bold</b>", styled: true });
  });

  test("chained scripts produce the text the executor produces over the whole list in one call", () => {
    const scripts = [banner, displayScript("/Great/g", "Grand"), displayScript("/<strong>/g", '<strong class="loud">'), displayScript("/(b+)+c/g", "never")];
    const body = `${BANNER_SOURCE} Great things.`;
    const whole = executeRegexScripts({
      text: body,
      scripts,
      call: { pass: "display", ...REPLY, room: NO_SEATS },
      ctx: { char: "", user: "", persona: "", scenario: "", env: {} },
    });
    const styled = renderStyledMessageForDisplay(body, context(scripts), REPLY);
    expect(styled.text).toBe('<div class="banner"><style>.banner{color:#f4a261}</style><strong class="loud">Grand Hall</strong></div> Grand things.');
    expect(whole).toBe(styled.text);
    expect(styled.styled).toBe(true);
  });
});

// A name is another reader's text: the anchor persona can be a member's, and a framed reply runs its script bodies at
// the interactive step. So the display pass resolves a name in the prose and never inside a style or script body,
// in a model panel or in a card fence the card frame draws as HTML.
describe("the display pass splices no name into a style or script body", () => {
  const HostileName = 'Nate"); parent.postMessage("pwn", "*"); ("';
  const HostileDescription = '"}body{background:url(https://example.test/x)}.a{content:"';
  const bodiesOf = (text: string): readonly string[] => rawTextElements(text).map((element) => text.slice(element.bodyStart, element.bodyEnd));

  test.for([
    {
      name: "a model panel",
      body: '<div class="hud">Hello {{user}}.<script>greet("{{user}}")</script><style>.hud::after{content:"{{persona}}"}</style></div>',
    },
    { name: "a card fence", body: ':::card title="Status"\n<p>{{user}} waits.</p>\n<script>greet("{{user}}")</script>\n:::' },
    { name: "an unclosed script", body: '{{user}} arrives.\n\n<script>greet("{{user}}")' },
  ])("$name keeps its bodies as written and names the persona in its prose", ({ body }) => {
    const ctx: MessageRenderContext = { ...context([]), fallbackPersonaName: HostileName, fallbackPersonaDescription: HostileDescription };
    const text = renderMessageForDisplay(body, ctx, REPLY);

    expect(bodiesOf(text)).toEqual(bodiesOf(body));
    expect(text).toContain(HostileName);
    for (const shown of bodiesOf(text)) {
      expect(shown).not.toContain(HostileName);
      expect(shown).not.toContain(HostileDescription);
    }
  });

  test("the Markdown repair leaves a body's lone asterisk as written and still repairs the prose", () => {
    const body = '*She waits <style>.a::after{content:"*"}</style>';
    const text = renderMessageForDisplay(body, { ...context([]), autoFixMarkdown: true }, REPLY);

    expect(bodiesOf(text)).toEqual(['.a::after{content:"*"}']);
    expect(text).not.toBe(body);
  });
});
