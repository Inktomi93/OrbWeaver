import type {
  AssembleCharacter,
  AssembleContext,
  AssembledPrompt,
  AssemblePersona,
  AssembleTrace,
  AssembleWorldEntry,
  ChatInjection,
  SectionPreview,
} from "@orb/contracts/chat";
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { expect, test } from "../../support/fixtures";

// ═══ the 8 assemble shapes (slim projections) ══════════════════════════════════

test("the 8 assemble shapes pin (slim projections; AssembleContext refs PromptConfig)", () => {
  const character: AssembleCharacter = { name: "Aria", description: "a bard" };
  const persona: AssemblePersona = { name: "Alice", description: "the user" };
  const entry: AssembleWorldEntry = {
    id: mintTypeId(ID_PREFIX.worldEntry),
    content: "the kingdom of Eld",
    scope: "always",
    keys: [],
    priority: 100,
    enabled: true,
    source: "character",
    position: "before",
    inject: { depth: 2, role: "system" },
  };
  const injection: ChatInjection = {
    position: "in_chat",
    depth: 0,
    role: "user",
    content: "[note]",
  };
  const trace: AssembleTrace = {
    staticSections: ["main"],
    dynamicSections: [],
    worldInfoIncluded: 1,
    worldInfoDropped: [],
    worldInfoActivated: [{ id: "we_1", keys: ["dragon"] }],
    matchedKeys: [],
    compactSummaryIncluded: false,
    memoryIncluded: false,
    guidedInstructionIncluded: false,
    staticCacheBusters: [],
    chatInjectionsIncluded: 0,
    afterHistorySections: [],
  };
  const assembled: AssembledPrompt = {
    static: "system",
    dynamic: "",
    afterHistory: [injection],
    sendHistory: true,
    trace,
  };
  const ctx: AssembleContext = {
    character,
    promptConfig: DEFAULT_PROMPT_CONFIG,
    recentMessages: ["hi"],
    pinnedPersona: persona,
  };
  const sectionPreview: SectionPreview = { rendered: "system", half: "static", trace };
  expect(ctx.promptConfig).toBe(DEFAULT_PROMPT_CONFIG);
  expect(assembled.afterHistory[0]?.role).toBe("user");
  expect(entry.inject?.role).toBe("system");
  expect(sectionPreview.half).toBe("static");
});
