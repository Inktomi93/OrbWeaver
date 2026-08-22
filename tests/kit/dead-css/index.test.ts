// The dead-class vocabulary shared by the client's live `[css]` flagger and `pnpm snap --dead-css`.
// The load-bearing cases are the ones the two consumers historically disagreed on: Tailwind's ESCAPED
// variant tokens (`.sm\:max-w-*`), the marker namespaces that ship no rule on purpose, and the regex
// SOURCE constants — snap rebuilds the regex from those inside the browser, so a change to either
// pattern silently changes what the probe calls dead.

import { CLASS_SELECTOR_TOKEN_PATTERN, CLASS_TOKEN_ESCAPE_PATTERN, classTokensInSelector, isDeadCssMarkerClass } from "@orb/kit/dead-css";
import { describe } from "vitest";
import { expect, test } from "../../support/fixtures.ts";

describe("classTokensInSelector", () => {
  test("reads every class token out of a compound selector", () => {
    expect(classTokensInSelector(".card .card-body > .row")).toEqual(["card", "card-body", "row"]);
  });

  test("un-escapes Tailwind's escaped variant tokens", () => {
    // The generated rule is `.sm\:max-w-dialog-lg`; the element wears `sm:max-w-dialog-lg`. Failing to
    // un-escape makes every variant utility read as dead.
    expect(classTokensInSelector(".sm\\:max-w-dialog-lg")).toEqual(["sm:max-w-dialog-lg"]);
    expect(classTokensInSelector(".group\\/rail:hover .w-\\[2px\\]")).toEqual(["group/rail", "w-[2px]"]);
  });

  test("a class-free selector yields nothing (and never a phantom empty token)", () => {
    expect(classTokensInSelector("main > button[data-slot=x]")).toEqual([]);
  });

  test("is stateless across calls — a shared global regex must not carry lastIndex", () => {
    const first = classTokensInSelector(".a .b .c");
    expect(classTokensInSelector(".a .b .c")).toEqual(first);
  });
});

describe("isDeadCssMarkerClass", () => {
  test("skips the marker namespaces that legitimately ship no rule", () => {
    for (const token of ["group", "peer", "group/rail", "peer/field", "lucide-check", "TanStackRouterDevtools", "tsqd-open-btn", "echarts-for-react"]) {
      expect(isDeadCssMarkerClass(token)).toBe(true);
    }
  });

  test("an ordinary utility is not a marker (or nothing would ever be reported dead)", () => {
    for (const token of ["flex", "max-w-dialog-lg", "grouping", "peerish"]) {
      expect(isDeadCssMarkerClass(token)).toBe(false);
    }
  });
});

describe("the serialized regex sources", () => {
  test("compile to the pattern snap ships into the page", () => {
    // snap does `new RegExp(CLASS_SELECTOR_TOKEN_PATTERN, "g")` inside `page.evaluate`; if these
    // sources stop compiling to this shape, the probe and the flagger stop agreeing about "dead".
    expect(new RegExp(CLASS_SELECTOR_TOKEN_PATTERN, "g").source).toBe("\\.((?:\\\\.|[A-Za-z0-9_-])+)");
    expect(new RegExp(CLASS_TOKEN_ESCAPE_PATTERN, "g").source).toBe("\\\\(.)");
  });

  test("tokenize identically to the exported function", () => {
    const selector = ".sm\\:max-w-dialog-lg .group\\/rail:hover .a-b_c";
    const re = new RegExp(CLASS_SELECTOR_TOKEN_PATTERN, "g");
    const unescapeRe = new RegExp(CLASS_TOKEN_ESCAPE_PATTERN, "g");
    const inPage: string[] = [];
    for (const match of selector.matchAll(re)) {
      inPage.push((match[1] ?? "").replace(unescapeRe, "$1"));
    }
    expect(inPage).toEqual(classTokensInSelector(selector));
  });
});
