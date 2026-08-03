// infra/extraction/loaders/html — the html-to-text loader (databank-design/04 §2). Asserts the noise
// stripping (script/style/head/nav/footer), links → text, headings NOT uppercased (no case folding), and the
// `<title>` extraction (trimmed / absent).

import { loadHtml } from "../../../../../packages/server/src/infra/extraction/loaders/html.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const enc = new TextEncoder();

test("strips script/style/nav/footer chrome and renders links as their text", async () => {
  const html = [
    "<html><head><title>Doc</title><style>.x{color:red}</style><script>alert(1)</script></head>",
    "<body><nav><a href='/home'>Home</a></nav>",
    "<h1>Chapter</h1><p>Body with a <a href='https://ex.com'>link</a>.</p>",
    "<footer>copyright noise</footer></body></html>",
  ].join("");
  const out = await loadHtml(enc.encode(html));

  expect(out.text).toContain("Body with a link.");
  expect(out.text).not.toContain("alert(1)");
  expect(out.text).not.toContain("color:red");
  expect(out.text).not.toContain("Home");
  expect(out.text).not.toContain("copyright noise");
  expect(out.text).not.toContain("https://ex.com");
});

test("does NOT uppercase headings (the text is canon)", async () => {
  const out = await loadHtml(enc.encode("<h1>Mixed Case Heading</h1>"));
  expect(out.text).toContain("Mixed Case Heading");
  expect(out.text).not.toContain("MIXED CASE HEADING");
});

test("extracts a trimmed <title>", async () => {
  const out = await loadHtml(enc.encode("<html><head><title>  Spaced  Title \n</title></head><body>x</body></html>"));
  expect(out.title).toBe("Spaced Title");
});

test("title is undefined when there is no <title>", async () => {
  const out = await loadHtml(enc.encode("<html><body><p>no title here</p></body></html>"));
  expect(out.title).toBeUndefined();
});
