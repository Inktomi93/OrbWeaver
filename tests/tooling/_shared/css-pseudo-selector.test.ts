// #2431: the split that lets a rendered reader address a PSEUDO CARRIER. Its whole job is a boundary — the
// suffix is taken only where CSS means "this generated box IS the subject", never where a pseudo merely
// appears inside the host's match condition. Both arms matter: the first is what unblocked
// `light-art-scrim-glass-elevation` after #1154 moved the shell panes' glass onto `::before`; the second is
// what keeps `:has(a::before)` addressed to the host it actually names.
import { CSS_PSEUDO_TYPE, splitPseudoSelector } from "../../../tooling/src/_shared/css-pseudo-selector.ts";
import { expect, test } from "../../support/tool-fixtures.ts";

test("a trailing carrier splits off the host and keeps Chromium's own pseudo-type key", () => {
  expect(splitPseudoSelector('.shell-panel[data-panel-side="list"]::before')).toEqual({
    host: '.shell-panel[data-panel-side="list"]',
    pseudo: "::before",
  });
  expect(splitPseudoSelector(".x::after")).toEqual({ host: ".x", pseudo: "::after" });
  expect(CSS_PSEUDO_TYPE["::before"]).toBe("before");
  expect(CSS_PSEUDO_TYPE["::after"]).toBe("after");
});

test("a pseudo that is not the subject is left alone — the selector stays the host's", () => {
  expect(splitPseudoSelector(".shell-panel")).toEqual({ host: ".shell-panel", pseudo: null });
  // The condition mentions a pseudo; the SUBJECT is the element that matches.
  expect(splitPseudoSelector(".shell-panel:has(a::before)")).toEqual({ host: ".shell-panel:has(a::before)", pseudo: null });
  // A highlight pseudo has no generated box to sample, so it is not a carrier and is never split.
  expect(splitPseudoSelector(".x::selection")).toEqual({ host: ".x::selection", pseudo: null });
});
