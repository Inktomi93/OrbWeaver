// substrate: redact-injections — the host-audience redaction seam (chat-crew-design/04 §2, CREW-6). PURE. A
// `ChatInjection` with `audience:"host"` (the director's host-ring guidance) must have its content elided from
// a prompt-inspection projection served to a NON-host caller, while the host sees it unchanged and the shape
// (ordering, depths, counts) is preserved. `audience:"all"`/absent injections are never touched.

import type { AssembledPrompt, ChatInjection } from "@orb/contracts/chat";
import { describe } from "vitest";
import { HOST_ONLY_INJECTION_PLACEHOLDER, redactHostInjections } from "../../../../../packages/server/src/domain/chat/substrate/redact-injections.ts";
import { expect, test } from "../../../../support/fixtures";

function injection(content: string, audience?: "all" | "host"): ChatInjection {
  return { position: "in_chat", depth: 4, role: "system", content, ...(audience !== undefined ? { audience } : {}) };
}

function prompt(afterHistory: ChatInjection[]): AssembledPrompt {
  return {
    static: "system",
    dynamic: "",
    afterHistory,
    sendHistory: true,
    trace: {
      staticSections: [],
      dynamicSections: [],
      worldInfoIncluded: 0,
      worldInfoDropped: [],
      matchedKeys: [],
      compactSummaryIncluded: false,
      memoryIncluded: false,
      guidedInstructionIncluded: false,
      staticCacheBusters: [],
      chatInjectionsIncluded: 0,
      afterHistorySections: [],
    },
  };
}

const SECRET = "TWIST: the creditor is Cal's own uncle";

describe("redactHostInjections", () => {
  test("non-host: audience:host content is replaced by the placeholder; shape preserved", () => {
    const redacted = redactHostInjections(prompt([injection("visible note", "all"), injection(SECRET, "host")]), false);
    expect(redacted.afterHistory).toHaveLength(2);
    expect(redacted.afterHistory[0]?.content).toBe("visible note"); // audience:all untouched
    expect(redacted.afterHistory[1]?.content).toBe(HOST_ONLY_INJECTION_PLACEHOLDER);
    expect(redacted.afterHistory[1]?.content).not.toContain("creditor"); // the secret bytes are gone
    expect(redacted.afterHistory[1]?.depth).toBe(4); // depth/role/position preserved
    expect(redacted.afterHistory[1]?.audience).toBe("host");
  });

  test("host: audience:host content passes through unchanged (the host sees the hidden hand)", () => {
    const original = prompt([injection(SECRET, "host")]);
    const redacted = redactHostInjections(original, true);
    expect(redacted.afterHistory[0]?.content).toBe(SECRET);
    expect(redacted).toBe(original); // returned as-is (no copy) when host
  });

  test("a prompt with no host-audience injection is returned identical either way", () => {
    const original = prompt([injection("note", "all"), injection("bare")]);
    expect(redactHostInjections(original, false)).toBe(original);
    expect(redactHostInjections(original, true)).toBe(original);
  });
});
