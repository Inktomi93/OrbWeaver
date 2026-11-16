// The host's read of framed markup for external media (`holdsExternalMedia`), which decides whether a framed card or
// styled reply explains a refused image: every element and style form the frame's media policy governs, the addresses
// that stay on the app's origin, and the read itself, which parses the markup without fetching any address it names.

import { expect, test } from "@playwright/test";
import type { ExternalMediaCase, ExternalMediaStory } from "./_external-media-stories.tsx";

const STORY = "tests/ui/content/sandbox-frame/_external-media-stories/ExternalMediaStory";
const CASE = '[data-slot="external-media-case"]';
// A reserved test host, answered by the route below; nothing leaves the machine.
const MEDIA_HOST = "media.example.test";
const MEDIA = `https://${MEDIA_HOST}/**`;

const EXTERNAL: readonly (ExternalMediaCase & { readonly name: string })[] = [
  { name: "an image", html: `<img src="https://${MEDIA_HOST}/a.png">` },
  { name: "a plain-http image", html: `<img src="http://${MEDIA_HOST}/a.png">` },
  { name: "a protocol-relative image", html: `<img src="//${MEDIA_HOST}/a.png">` },
  { name: "a backslashed image the URL parser reads as a host", html: `<img src="\\\\${MEDIA_HOST}/a.png">` },
  { name: "a scheme split by a tab the URL parser drops", html: `<img src="ht\ttps://${MEDIA_HOST}/a.png">` },
  { name: "a later srcset candidate", html: `<img srcset="/local.png 1x, https://${MEDIA_HOST}/a.png 2x">` },
  { name: "a picture source", html: `<picture><source srcset="https://${MEDIA_HOST}/a.webp"><img src="/local.png"></picture>` },
  { name: "a video poster", html: `<video poster="https://${MEDIA_HOST}/p.png"></video>` },
  { name: "an audio source", html: `<audio controls><source src="https://${MEDIA_HOST}/a.ogg"></audio>` },
  { name: "an svg image", html: `<svg><image href="https://${MEDIA_HOST}/a.png"/></svg>` },
  { name: "an svg image by xlink", html: `<svg><image xlink:href="https://${MEDIA_HOST}/a.png"/></svg>` },
  { name: "a legacy background attribute", html: `<table background="https://${MEDIA_HOST}/a.png"><tr><td>x</td></tr></table>` },
  { name: "an inline style background", html: `<div style="background: url('https://${MEDIA_HOST}/a.png')">x</div>` },
  { name: "a style element", html: `<style>.x { background-image: url(https://${MEDIA_HOST}/a.png) }</style><p class="x">x</p>` },
  { name: "the card's own stylesheet", html: "<p>x</p>", css: `.x { background: image-set("https://${MEDIA_HOST}/a.png" 1x) }` },
];

const LOCAL: readonly (ExternalMediaCase & { readonly name: string })[] = [
  { name: "text only", html: "<p>High water at dusk.</p>" },
  { name: "a relative image", html: '<img src="/tide.png" srcset="/tide.png 1x, /tide@2x.png 2x">' },
  { name: "an inline data image", html: '<img src="data:image/png;base64,iVBORw0KGgo=">' },
  { name: "a link to an external page", html: `<a href="https://${MEDIA_HOST}/page">Read more</a>` },
  { name: "an address in prose", html: `<p>See https://${MEDIA_HOST}/a.png for the chart.</p>` },
  { name: "a stylesheet with local addresses", html: "<p>x</p>", css: '.x { background: url("/bg.png"), url(data:image/png;base64,AA==) }' },
  { name: "an unclosed address", html: "<p>x</p>", css: '.x { background: url("/bg.png' },
];

test("every form the frame's media policy governs reads as external, and same-origin, inline and link addresses do not", async ({ mount, page }) => {
  const cases = [...EXTERNAL, ...LOCAL];
  await mount<typeof ExternalMediaStory>(STORY, { cases: cases.map(({ html, css }) => (css === undefined ? { html } : { html, css })) });
  const outputs = page.locator(CASE);
  await expect(outputs).toHaveCount(cases.length);
  for (const [index, entry] of cases.entries()) {
    await expect(outputs.nth(index), entry.name).toHaveAttribute("data-holds", String(index < EXTERNAL.length));
  }
});

// The page's own policy refuses an external image, so the probe names this origin's addresses, which the page may load:
// a parse that fetched would ask for them.
const PROBE = "/external-media-probe";
const PROBED: readonly ExternalMediaCase[] = [
  { html: `<img src="${PROBE}/img.png" srcset="${PROBE}/srcset.png 2x">` },
  { html: `<video poster="${PROBE}/poster.png"><source src="${PROBE}/video.webm"></video>` },
  { html: `<div style="background: url(${PROBE}/inline.png)">x</div><style>p { background: url(${PROBE}/style.png) }</style><p>x</p>` },
];

test("reading the markup fetches none of the addresses it names", async ({ mount, page }) => {
  const requested: string[] = [];
  await page.context().route(`**${PROBE}/**`, async (route) => {
    requested.push(new URL(route.request().url()).pathname);
    await route.fulfill({ status: 404, body: "" });
  });
  await page.context().route(MEDIA, async (route) => {
    requested.push(route.request().url());
    await route.fulfill({ status: 404, body: "" });
  });
  const cases = [...PROBED, ...EXTERNAL.map(({ html, css }) => (css === undefined ? { html } : { html, css }))];
  await mount<typeof ExternalMediaStory>(STORY, { cases });
  await expect(page.locator(`${CASE}[data-holds="true"]`)).toHaveCount(EXTERNAL.length);
  // Positive control: an image element made in this page's own document fetches its address through the same route.
  await page.evaluate((address) => {
    document.createElement("img").src = address;
  }, `${PROBE}/control.png`);
  await expect.poll(() => requested).toEqual([`${PROBE}/control.png`]);
});
