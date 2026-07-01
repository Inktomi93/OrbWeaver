import type { CharacterId, ChatId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe } from "vitest";
import { resolveCfg } from "../../../../../../packages/server/src/domain/chat/memory/constants";
import { buildRecallQuery } from "../../../../../../packages/server/src/domain/chat/memory/recall/query";
import type {
  MemoryScope,
  MsgRow,
} from "../../../../../../packages/server/src/domain/chat/memory/types";
import { expect, test } from "../../../../../support/fixtures";

const chatId = castId<ChatId>("chat_q");
const aria = castId<CharacterId>("character_aria");
const scope: MemoryScope = { chatId, scopedCharacterId: aria, isGroup: true };

function row(seq: number, content: string): MsgRow {
  return { seq, role: "assistant", characterId: aria, authorUserId: null, content };
}

describe("memory/recall/query — buildRecallQuery", () => {
  const cfg = resolveCfg({ queryWindow: 2, minScore: 0.4, keywordMatch: true, recencyBias: 0.1 });
  const names = new Map<CharacterId, string>([[aria, "Aria"]]);
  const recent = [row(1, "a"), row(2, "b"), row(3, "c")];

  test("the chat-scope (#5) + the resolved knobs (#6) ride MemoryQueryOptions", () => {
    const q = buildRecallQuery(cfg, scope, recent, names);
    expect(q.scope).toEqual({ chat: chatId });
    expect(q.mode).toBe(cfg.mode);
    expect(q.minScore).toBe(0.4);
    expect(q.keywordMatch).toBe(true);
    expect(q.recencyBias).toBe(0.1);
    expect(q.verbatimWindow).toBe(cfg.verbatimWindow);
  });

  test("the egocentric query text (#4) = the name-prefixed last `queryWindow` messages", () => {
    const q = buildRecallQuery(cfg, scope, recent, names);
    expect(q.queryText).toBe("Aria: b\nAria: c"); // last 2 (queryWindow), name-prefixed
  });

  test("the egocentric scopedCharacterId (#4) is homed on MemoryQueryOptions (a real CharacterId — inv 8)", () => {
    expect(buildRecallQuery(cfg, scope, recent, names).scopedCharacterId).toBe(aria);
  });

  test("candidates is absent here (the bridge restriction is layered by recall.ts, not buildRecallQuery)", () => {
    expect(buildRecallQuery(cfg, scope, recent, names).candidates).toBeUndefined();
  });
});
