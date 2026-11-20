// The host's read of framed markup for script its controls need (`holdsScript`), which decides whether a framed card or
// styled reply explains controls that do nothing: every form a browser runs, the forms it does not, and the read itself,
// which parses the markup without running any script it holds.

import { expect, test } from "@playwright/test";
import type { FrameScriptStory } from "./_frame-script-stories.tsx";

const STORY = "tests/ui/content/sandbox-frame/_frame-script-stories/FrameScriptStory";
const CASE = '[data-slot="frame-script-case"]';

const SCRIPTED: readonly (readonly [string, string])[] = [
  ["a script element", "<p id=t>x</p><script>t.textContent = 'y'</script>"],
  ["a module script", '<script type="module">void 0</script>'],
  ["a script typed as JavaScript in capitals", '<script type="TEXT/JAVASCRIPT">void 0</script>'],
  ["an inline click handler", '<button onclick="void 0">Wind</button>'],
  ["a handler in capitals on a nested element", '<details><summary><span ONMOUSEOVER="void 0">x</span></summary></details>'],
  ["a javascript address", '<a href="javascript:void 0">Open</a>'],
  ["a javascript address split by a tab and led by spaces", '<a href="  java\tscript:void 0">Open</a>'],
  ["a form action", '<form action="JavaScript:void 0"><button>Go</button></form>'],
  ["an svg handler", '<svg><circle r="4" onload="void 0"/></svg>'],
];

const STATIC: readonly (readonly [string, string])[] = [
  ["text only", "<p>High water at dusk.</p>"],
  ["a details panel, which opens with no script", "<details><summary>Tide</summary><p>High water at dusk.</p></details>"],
  ["a data script the browser never runs", '<script type="application/json">{"tide":"dusk"}</script>'],
  ["a link to a page", '<a href="https://example.test/javascript:x">Read</a>'],
  ["handler words in prose", "<p>onclick=void 0 and javascript: are words here.</p>"],
  ["a stylesheet", "<style>.x { color: red }</style><p class=x>x</p>"],
  ["an attribute that only starts with on", '<p one="1" data-onclick="x">x</p>'],
];

test("every form a browser runs reads as script, and static panels, data scripts and words do not", async ({ mount, page }) => {
  const cases = [...SCRIPTED, ...STATIC];
  await mount<typeof FrameScriptStory>(STORY, { cases: cases.map(([, html]) => html) });
  const outputs = page.locator(CASE);
  await expect(outputs).toHaveCount(cases.length);
  for (const [index, [name]] of cases.entries()) {
    await expect(outputs.nth(index), name).toHaveAttribute("data-holds", String(index < SCRIPTED.length));
  }
});

test("reading the markup runs none of its scripts", async ({ mount, page }) => {
  await mount<typeof FrameScriptStory>(STORY, {
    cases: ["<script>document.title = 'ran'</script>", '<img src="/none.png" onerror="document.title = \'ran\'">'],
  });
  await expect(page.locator(`${CASE}[data-holds="true"]`)).toHaveCount(2);
  // The parse is synchronous, so both reads are done once their outputs show.
  expect(await page.title()).not.toBe("ran");
  // Positive control: the same script made a live element in this page's own document does run.
  await page.evaluate(() => {
    const script = document.createElement("script");
    script.textContent = "document.title = 'control'";
    document.head.append(script);
  });
  await expect(page).toHaveTitle("control");
});
