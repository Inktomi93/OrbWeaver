// Contract tests for @orb/contracts/plugin/ui — the toast vocabulary and the injective plugin tool wire name.

import { PLUGIN_TOAST_LEVELS, PLUGIN_TOOL_NAME_PREFIX, PLUGIN_TOOL_NAME_RE, pluginSlugSchema, pluginToolWireName } from "@orb/contracts/plugin";
import { expect, test } from "@orb/testkit/node/fixtures.ts";

function decodeWireName(wire: string): { slug: string; name: string } | null {
  const body = wire.slice(PLUGIN_TOOL_NAME_PREFIX.length);
  for (const run of body.matchAll(/_+/g)) {
    if (run[0].length % 2 === 1) {
      const separator = (run.index ?? 0) + run[0].length - 1;
      return { slug: body.slice(0, separator).replaceAll("__", "-"), name: body.slice(separator + 1) };
    }
  }
  return null;
}

test("PLUGIN_TOAST_LEVELS is the HOUSE notify vocabulary — a plugin gets no severity the app cannot render", () => {
  expect(PLUGIN_TOAST_LEVELS).toEqual(["info", "success", "warn", "error"]);
});

test("pluginToolWireName is the ONE mint: a slug's hyphens become DOUBLE underscores, and it carries the claimed prefix", () => {
  // The charset half: the OpenAI/MCP function-name grammar has no hyphen, so the slug is transliterated. A
  // second spelling of this rule anywhere would silently unmatch every registered card. `-` becomes `__`
  // (not `_`) — that is the #1391 INJECTIVITY half, pinned below.
  expect(pluginToolWireName("oracle-deck", "draw")).toBe("plugin_oracle__deck_draw");
  expect(pluginToolWireName("mood", "read")).toBe("plugin_mood_read");
  // …and the prefix the client's ONE `pluginToolRenderer` claims is the prefix this mint emits.
  expect(pluginToolWireName("oracle-deck", "draw").startsWith(PLUGIN_TOOL_NAME_PREFIX)).toBe(true);
});

test("the mint is INJECTIVE (#1391 owner ruling): the pair that used to flatten alike now mints two names", () => {
  // THE DEFECT THIS REPLACES: under `-` → `_` both halves below spelled `plugin_foo_bar_baz`, and both are
  // independently valid (`pluginSlugSchema` admits "foo-bar"; PLUGIN_TOOL_NAME_RE admits "bar_baz"), so two
  // legitimately named plugins could not coexist — the second one's install died on `ToolNameCollisionError`.
  // The owner ruled (2026-09-05) for the injective form plus a migration of the persisted spellings.
  expect(pluginSlugSchema.safeParse("foo-bar").success).toBe(true);
  expect(PLUGIN_TOOL_NAME_RE.test("bar_baz")).toBe(true);
  expect(pluginToolWireName("foo-bar", "baz")).toBe("plugin_foo__bar_baz");
  expect(pluginToolWireName("foo", "bar_baz")).toBe("plugin_foo_bar_baz");
  expect(pluginToolWireName("foo-bar", "baz")).not.toBe(pluginToolWireName("foo", "bar_baz"));
});

test("the mint is injective across the WHOLE valid grammar, and the header's decode rule recovers both halves", () => {
  // A property-style pin, not two examples: the corpus is every shape that can imitate a flattened hyphen —
  // hyphen RUNS, a TRAILING hyphen (`SLUG_RE` admits it), and names whose own `_` runs look like slug bytes.
  // Injectivity is asserted as "no two distinct pairs share an output"; the decode is the constructive proof.
  const slugs = ["foo", "foo-bar", "foo--bar", "f-o-o", "foo-", "foo--", "a1-b2", "x9"];
  const names = ["baz", "bar_baz", "b__z", "a_b_c", "q", "z_", "z__"];
  const seen = new Map<string, string>();
  for (const slug of slugs) {
    expect(pluginSlugSchema.safeParse(slug).success).toBe(true);
    for (const name of names) {
      expect(PLUGIN_TOOL_NAME_RE.test(name)).toBe(true);
      const wire = pluginToolWireName(slug, name);
      const pair = `${slug}::${name}`;
      expect(seen.get(wire) ?? pair).toBe(pair);
      seen.set(wire, pair);
      expect(decodeWireName(wire)).toEqual({ slug, name });
    }
  }
  expect(seen.size).toBe(slugs.length * names.length);
});
