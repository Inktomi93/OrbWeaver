// The PURE half of snap's Lighthouse arm (#1198): what the accounting block and the RESULT line are
// derived from. The browser-backed proof that the arm bites on a real page is the sibling
// tests/tooling/snap/ops/lighthouse.int.test.ts; these pins fix the READING of a report — the arms that
// a real run cannot produce on demand (a runtime error, a truncated render, a missing category).

import type { LighthouseReceipt } from "../../../../tooling/src/snap/index.ts";
import {
  auditedCount,
  auditNodes,
  categoryScores,
  failedAudits,
  LIGHTHOUSE_CATEGORIES,
  lighthouseLines,
  parseLighthouseDevice,
  parseLighthouseMode,
  reportTruncation,
} from "../../../../tooling/src/snap/index.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const WHOLE_HTML = "x".repeat(20_000);

function lhr(audits: Record<string, unknown>, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    audits,
    categories: Object.fromEntries(LIGHTHOUSE_CATEGORIES.map((id) => [id, { title: id, score: 1 }])),
    ...extra,
  };
}

test("a scored audit below 1 is a failure; the documented unscored modes are neither audited nor failed", () => {
  const report = lhr({
    "label-content-name-mismatch": { id: "label-content-name-mismatch", title: "Mismatch", score: 0, scoreDisplayMode: "binary" },
    "color-contrast": { id: "color-contrast", title: "Contrast", score: 1, scoreDisplayMode: "binary" },
    "heading-order": { id: "heading-order", title: "Headings", score: null, scoreDisplayMode: "notApplicable" },
    // The trap: `score: 0` with an INFORMATIVE mode is documented as meaningless, and counting it would
    // file a finding Lighthouse never made.
    "network-rtt": { id: "network-rtt", title: "RTT", score: 0, scoreDisplayMode: "informative" },
  });

  expect(auditedCount(report)).toBe(2);
  expect(failedAudits(report).map((audit) => audit.id)).toEqual(["label-content-name-mismatch"]);
});

test("the blamed nodes are counted whole and sampled to three selectors", () => {
  const nodes = auditNodes({
    type: "table",
    items: [
      { node: { type: "node", selector: "body > button" } },
      { node: { type: "node", selector: "main > a" } },
      { node: { type: "node", selector: "nav > a" } },
      { node: { type: "node", selector: "footer > a" } },
    ],
  });

  expect(nodes.count).toBe(4);
  expect(nodes.selectors).toEqual(["body > button", "main > a", "nav > a"]);
});

test("a list-shaped details block is walked into, and a row with no node still counts", () => {
  const nodes = auditNodes({
    type: "list",
    items: [{ value: { type: "table", items: [{ node: { selector: "#a" } }, { url: "https://example.test/x" }] } }],
  });

  expect(nodes.count).toBe(2);
  expect(nodes.selectors).toEqual(["#a"]);
});

test("a report is REFUSED when it is not whole — a runtime error, a missing category, or a stunted render", () => {
  expect(reportTruncation(lhr({}, { runtimeError: { code: "NO_FCP", message: "nothing painted" } }), WHOLE_HTML)).toContain("NO_FCP");
  const missing = { audits: {}, categories: { accessibility: { title: "a11y", score: 1 } } };
  expect(reportTruncation(missing, WHOLE_HTML)).toContain("best-practices");
  expect(reportTruncation(lhr({}), "<html>truncated</html>")).toContain("below the");
  // The negative control: a whole report refuses nothing.
  expect(reportTruncation(lhr({}), WHOLE_HTML)).toBeNull();
});

test("a category with no scorable audit reads n/a, never 0", () => {
  const rows = categoryScores({ categories: { seo: { title: "SEO", score: null } } });

  expect(rows).toEqual([{ id: "seo", title: "SEO", score: null }]);
  expect(lighthouseLines({ ...receipt(), categories: rows }).join("\n")).toContain("seo=n/a");
});

function receipt(): LighthouseReceipt {
  return {
    device: "desktop",
    mode: "snapshot",
    url: "http://127.0.0.1:1/x",
    lighthouseVersion: "13.4.1",
    categories: [{ id: "accessibility", title: "Accessibility", score: 0.97 }],
    auditedCount: 23,
    failed: [
      {
        id: "label-content-name-mismatch",
        title: "Elements with visible text labels have matching accessible names",
        score: 0,
        scoreDisplayMode: "binary",
        nodeCount: 5,
        selectors: ["body > button", "main > a", "nav > a"],
      },
    ],
    jsonPath: "reports/runs/snap/x/lighthouse/root.json",
    htmlPath: "reports/runs/snap/x/lighthouse/root.html",
  };
}

test("the accounting block states the denominator, the failing audit, its nodes and where the rest are", () => {
  const block = lighthouseLines(receipt()).join("\n");

  expect(block).toContain("audited=23 failed-audits=1");
  expect(block).toContain("accessibility=97");
  expect(block).toContain("FAIL label-content-name-mismatch  score=0 nodes=5");
  expect(block).toContain("→ body > button");
  expect(block).toContain("+2 more node(s)");
  expect(block).toContain("reports/runs/snap/x/lighthouse/root.html");
});

test("the flag vocabulary refuses anything outside it — a bad arm never silently runs the default", () => {
  expect(parseLighthouseDevice("mobile")).toBe("mobile");
  expect(parseLighthouseDevice("phone")).toBeNull();
  expect(parseLighthouseMode("navigation")).toBe("navigation");
  expect(parseLighthouseMode("timespan")).toBeNull();
});
