// domain/chat/memory/generate/substrate/prompts — pins the PROSE-1 S1 contract: the digest/consolidation
// system prompts are SLOTS resolved against the caller's ProseOverrides (an empty override ⇒ the shipped
// default, byte-identical to pre-PROSE-1), and the structural (non-slot) literals — the transcript label,
// the numbered-facet join — are this module's own composition, never authorable.

import { describe } from "vitest";
import {
  consolidationSystemPrompt,
  consolidationUserPrompt,
  digestSystemPrompt,
  digestUserPrompt,
} from "../../../../../../../packages/server/src/domain/chat/memory/generate/substrate/prompts.ts";
import { expect, test } from "../../../../../../support/fixtures.ts";

describe("digest prompts", () => {
  test("digestSystemPrompt resolves the shipped default with an empty override record", () => {
    const withDefault = digestSystemPrompt({});
    expect(typeof withDefault).toBe("string");
    expect(withDefault.length).toBeGreaterThan(0);
  });

  test("digestSystemPrompt honors a host override — the slot IS the prose surface", () => {
    const overridden = digestSystemPrompt({ "chat.memory.digestSystem": { text: "Custom digest instructions.", baseVersion: 1 } });
    expect(overridden).toBe("Custom digest instructions.");
  });

  test("digestUserPrompt's transcript label is a structural literal, never a slot — the transcript rides verbatim", () => {
    const prompt = digestUserPrompt("Alice: Hello.\nBob: Hi there.");
    expect(prompt).toBe("Transcript block:\n\nAlice: Hello.\nBob: Hi there.");
  });
});

describe("consolidation prompts", () => {
  test("consolidationSystemPrompt resolves the shipped default and honors an override", () => {
    expect(consolidationSystemPrompt({}).length).toBeGreaterThan(0);
    expect(consolidationSystemPrompt({ "chat.memory.consolidationSystem": { text: "Synthesize the arc.", baseVersion: 1 } })).toBe("Synthesize the arc.");
  });

  test("consolidationUserPrompt numbers the child facets and leads with the do-not-repeat slot", () => {
    const prompt = consolidationUserPrompt({ "chat.memory.consolidationLead": { text: "Do not repeat these:", baseVersion: 1 } }, [
      "Alice explored the ruins.",
      "Bob found a key.",
    ]);
    expect(prompt).toBe("Do not repeat these:\n\n[1]\nAlice explored the ruins.\n\n[2]\nBob found a key.");
  });

  test("consolidationUserPrompt with zero child facets still emits the lead with an empty body", () => {
    const prompt = consolidationUserPrompt({ "chat.memory.consolidationLead": { text: "Lead.", baseVersion: 1 } }, []);
    expect(prompt).toBe("Lead.\n\n");
  });
});
