// Unit: the PREVIEW view-model (features/preset/components/prompt-assembly/preview-model). PURE, node
// lane, DEEP import (not the feature barrel — dom-less graph). Proves the macro tokenizer, the setup/post
// role grouping, the enabled + optional include-predicate filters, and the splice ordering (depth desc,
// order asc within depth — the P1 ST-parity semantics). DISPLAY ONLY — no macro is resolved (BUILD-SPEC §7/§10).

import type { PromptSection } from "@orb/contracts/preset";
import {
  assemblePreview,
  splitMacroTokens,
} from "../../../../../../packages/client/src/features/preset/components/prompt-assembly/preview-model";
import { expect, test } from "../../../../../support/fixtures";

function literal(
  id: string,
  content: string,
  extra: Partial<Extract<PromptSection, { type: "literal" }>> = {},
): PromptSection {
  return { type: "literal", id, name: id, role: "system", content, enabled: true, ...extra };
}

function pivot(id: string, enabled = true): PromptSection {
  return { type: "marker", id, name: id, marker: "chat_history", role: "system", enabled };
}

const always = (): boolean => true;

test("splitMacroTokens splits prose and {{macro}} references, trimming inner whitespace", () => {
  expect(splitMacroTokens("Hi {{char}}, I'm {{ user }}.")).toEqual([
    { kind: "text", value: "Hi " },
    { kind: "macro", value: "char" },
    { kind: "text", value: ", I'm " },
    { kind: "macro", value: "user" },
    { kind: "text", value: "." },
  ]);
});

test("a string that is exactly one macro yields a single macro token", () => {
  expect(splitMacroTokens("{{char}}")).toEqual([{ kind: "macro", value: "char" }]);
});

test("plain text yields a single text token; empty string yields none", () => {
  expect(splitMacroTokens("plain")).toEqual([{ kind: "text", value: "plain" }]);
  expect(splitMacroTokens("")).toEqual([]);
});

test("only enabled, lens-firing, in-flow sections appear; grouped by consecutive role", () => {
  const sections = [
    literal("a", "aaaa"),
    literal("b", "bbbb", { role: "user" }),
    literal("off", "zzzz", { enabled: false }),
    pivot("hist"),
    literal("c", "cccc"),
  ];
  const preview = assemblePreview(sections, always);

  // setup groups: [system: a] then [user: b] (the disabled section is dropped).
  expect(preview.setup.map((g) => g.role)).toEqual(["system", "user"]);
  expect(preview.setup[0]?.blocks.map((b) => b.section.id)).toEqual(["a"]);
  expect(preview.setup[1]?.blocks.map((b) => b.section.id)).toEqual(["b"]);
  expect(preview.post.map((g) => g.blocks.map((b) => b.section.id))).toEqual([["c"]]);
  expect(preview.missingPivot).toBe(false);
  expect(preview.historyEnabled).toBe(true);
});

test("the include predicate drops a section it excludes", () => {
  const sections = [
    literal("normalOnly", "aaaa", { trigger: ["normal"] }),
    literal("always", "bbbb"),
    pivot("hist"),
  ];
  const firesSwipe = (section: PromptSection): boolean => {
    const trigger = "trigger" in section ? section.trigger : undefined;
    return trigger === undefined || trigger.length === 0 || trigger.includes("swipe");
  };
  const preview = assemblePreview(sections, firesSwipe);
  const ids = preview.setup.flatMap((g) => g.blocks.map((b) => b.section.id));
  expect(ids).toEqual(["always"]); // the normal-only section is filtered out under the swipe lens
});

test("spliced sections route to the band, ordered depth DESC then order ASC (P1 semantics)", () => {
  const sections = [
    pivot("hist"),
    literal("low-order", "a", { inject: { depth: 4, order: 5 } }),
    literal("high-order", "b", { inject: { depth: 4, order: 200 } }),
    literal("deeper", "c", { inject: { depth: 10, order: 100 } }),
    literal("inflow", "d"),
  ];
  const preview = assemblePreview(sections, always);

  // depth 10 first; then within depth 4, order 5 before order 200.
  expect(preview.splices.map((s) => s.section.id)).toEqual(["deeper", "low-order", "high-order"]);
  // an absent order defaults to 100 (the assembler default) — the in-flow section stays out of the band.
  expect(preview.post.flatMap((g) => g.blocks.map((b) => b.section.id))).toEqual(["inflow"]);
});

test("missing pivot flags the band; everything falls to setup", () => {
  const preview = assemblePreview([literal("a", "aaaa")], always);
  expect(preview.missingPivot).toBe(true);
  expect(preview.setup.flatMap((g) => g.blocks.map((b) => b.section.id))).toEqual(["a"]);
});

test("a templated marker previews its factory default; a plain marker exposes no author text", () => {
  const sections: PromptSection[] = [
    {
      type: "marker",
      id: "desc",
      name: "desc",
      marker: "char_description",
      role: "system",
      enabled: true,
    },
    {
      type: "marker",
      id: "wi",
      name: "wi",
      marker: "world_info_before",
      role: "system",
      enabled: true,
    },
    pivot("hist"),
  ];
  const preview = assemblePreview(sections, always);
  const blocks = preview.setup.flatMap((g) => g.blocks);
  const desc = blocks.find((b) => b.section.id === "desc");
  const wi = blocks.find((b) => b.section.id === "wi");

  expect(desc?.tokens).toEqual([{ kind: "macro", value: "description" }]); // factory default {{description}}
  expect(wi?.tokens).toBeUndefined(); // plain marker — no author text
  expect(wi?.plainHint).toBeDefined();
});
