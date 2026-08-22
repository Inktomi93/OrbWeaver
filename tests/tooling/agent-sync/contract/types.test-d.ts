// Type-level pin for the Claude role manifest the Codex TOML is rendered from. The property no runtime
// test can see: every field is REQUIRED and non-optional — a role with no `effort` (or no `description`)
// cannot be constructed, which is why the renderer can emit the TOML without a single `?? ""` fallback.
// A field that drifted to optional would turn a missing manifest key into a silently empty Codex setting.
import { expectTypeOf, test } from "vitest";
import type { ClaudeAgent } from "../../../../tooling/src/agent-sync/index.ts";

test("a parsed role manifest carries every field the renderer emits", () => {
  expectTypeOf<ClaudeAgent["name"]>().toEqualTypeOf<string>();
  expectTypeOf<ClaudeAgent["description"]>().toEqualTypeOf<string>();
  expectTypeOf<ClaudeAgent["effort"]>().toEqualTypeOf<string>();
  expectTypeOf<ClaudeAgent["body"]>().toEqualTypeOf<string>();
  expectTypeOf<ClaudeAgent["skills"]>().toEqualTypeOf<readonly string[]>();
  // @ts-expect-error — no field is optional: a manifest missing `effort` must fail the PARSER, not render.
  const partial: ClaudeAgent = { name: "verifier", description: "d", body: "b", skills: [] };
  void partial;
});
