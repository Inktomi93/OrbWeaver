import type { ContentSpan } from "@orb/kit/content";
import { tokenizeContent } from "@orb/kit/content";
import { describe } from "vitest";
import { expect, test } from "../../support/fixtures";

describe("tokenizeContent", () => {
  test("plain text → a single text span", () => {
    expect(tokenizeContent("hello world")).toEqual<ContentSpan[]>([{ kind: "text", text: "hello world" }]);
  });

  test("empty body → one empty text span (the byte-identical path)", () => {
    expect(tokenizeContent("")).toEqual<ContentSpan[]>([{ kind: "text", text: "" }]);
  });

  test("an embedded asset ref → text / image / text spans", () => {
    expect(tokenizeContent("before ![a cat](asset:ast_123) after")).toEqual<ContentSpan[]>([
      { kind: "text", text: "before " },
      { kind: "image", ref: { kind: "asset", assetId: "ast_123" }, alt: "a cat" },
      { kind: "text", text: " after" },
    ]);
  });

  test("an external URL → an external image ref", () => {
    expect(tokenizeContent("![](https://x.test/i.png)")).toEqual<ContentSpan[]>([
      { kind: "image", ref: { kind: "external", url: "https://x.test/i.png" }, alt: "" },
    ]);
  });

  test("adjacent images yield adjacent image spans (no empty text between)", () => {
    expect(tokenizeContent("![](asset:a)![](asset:b)")).toEqual<ContentSpan[]>([
      { kind: "image", ref: { kind: "asset", assetId: "a" }, alt: "" },
      { kind: "image", ref: { kind: "asset", assetId: "b" }, alt: "" },
    ]);
  });

  test("a malformed `![` is left as literal text", () => {
    expect(tokenizeContent("text ![broken(asset:a) end")).toEqual<ContentSpan[]>([{ kind: "text", text: "text ![broken(asset:a) end" }]);
  });

  test("a markdown title form falls through to text (strict matcher)", () => {
    expect(tokenizeContent('![a](asset:x "title")')).toEqual<ContentSpan[]>([{ kind: "text", text: '![a](asset:x "title")' }]);
  });
});
