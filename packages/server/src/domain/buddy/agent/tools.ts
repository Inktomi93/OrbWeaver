// domain/buddy/agent/tools — the buddy's curated hands as SDK-free tool specs. Handlers close over
// (db, userId), so a tool can never act as another user. READ tools return status + owned-entity counts;
// PROPOSE tools stash a proposal and ask the user to confirm — only buddy.confirm executes.

import type { Db } from "@orb/db";
import { buddies, characters, chatParticipants } from "@orb/db";
import type { UserId } from "@orb/kit/ids";
import { and, count, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import type { BuddyWorkloadKind } from "../contract/agent-env";
import type { BuddyToolResult, BuddyToolSpec } from "../contract/agent-turn";
import { proposeAction } from "../substrate/gate";

const TOOL_PAYLOAD_MAX_CHARS = 8000;
const NAME_MIN = 1;
const NAME_MAX = 48;

const WORKLOAD_KINDS = ["find-duplicates", "index"] as const;

function toolText(text: string): BuddyToolResult {
  const clipped =
    text.length > TOOL_PAYLOAD_MAX_CHARS
      ? `${text.slice(0, TOOL_PAYLOAD_MAX_CHARS)}\n…[truncated ${text.length - TOOL_PAYLOAD_MAX_CHARS} chars]`
      : text;
  return { content: [{ type: "text", text: clipped }] };
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asWorkloadKind(value: unknown): BuddyWorkloadKind {
  return value === "index" ? "index" : "find-duplicates";
}

interface BuddyToolDeps {
  readonly db: Db;
  readonly userId: UserId;
  readonly now: () => number;
  readonly newProposalId: () => string;
}

export function createBuddyTools(deps: BuddyToolDeps): BuddyToolSpec[] {
  const { db, userId, now, newProposalId } = deps;
  return [
    {
      name: "buddy_status",
      description:
        "Your own identity and state: name, species, rarity, mood, and disposition stats.",
      inputSchema: {},
      handler: async (): Promise<BuddyToolResult> => {
        const rows = await db.select().from(buddies).where(eq(buddies.userId, userId)).limit(1);
        const row = rows[0];
        const text = row
          ? JSON.stringify({
              name: row.name,
              species: row.species,
              rarity: row.rarity,
              mood: row.mood,
              stats: row.stats,
            })
          : JSON.stringify({ hatched: false });
        return toolText(text);
      },
    },
    {
      name: "chat_count",
      description: "How many chats the user currently hosts.",
      inputSchema: {},
      handler: async (): Promise<BuddyToolResult> => {
        const rows = await db
          .select({ n: count() })
          .from(chatParticipants)
          .where(
            and(
              eq(chatParticipants.userId, userId),
              eq(chatParticipants.role, "host"),
              // Present host only — a departed ex-host row would over-count chats no longer hosted.
              isNull(chatParticipants.leftSeq),
            ),
          );
        return toolText(JSON.stringify({ chats: rows[0]?.n ?? 0 }));
      },
    },
    {
      name: "character_count",
      description: "How many characters the user currently owns.",
      inputSchema: {},
      handler: async (): Promise<BuddyToolResult> => {
        const rows = await db
          .select({ n: count() })
          .from(characters)
          .where(eq(characters.ownerId, userId));
        return toolText(JSON.stringify({ characters: rows[0]?.n ?? 0 }));
      },
    },
    {
      name: "propose_rename",
      description:
        "Propose changing YOUR OWN name. This does NOT rename you — it asks the user to confirm in the UI. Use when the user asks you to go by a new name or nickname.",
      inputSchema: { newName: z.string().min(NAME_MIN).max(NAME_MAX) },
      handler: (args: Record<string, unknown>): Promise<BuddyToolResult> => {
        const newName = asString(args["newName"]).trim();
        proposeAction(
          userId,
          { id: newProposalId(), kind: "rename", newName, summary: `Rename to "${newName}"` },
          now(),
        );
        return Promise.resolve(
          toolText(
            `Proposed. Tell the user you'd love to go by "${newName}" and that they can Confirm or Cancel it below.`,
          ),
        );
      },
    },
    {
      name: "propose_workload",
      description:
        "Propose running a maintenance job on the user's data: 'find-duplicates' (scan for near-duplicate characters/chats) or 'index' (build/refresh search embeddings across their whole library). This does NOT run it — it asks the user to confirm. Use when the user asks you to tidy/scan/embed their stuff.",
      inputSchema: { kind: z.enum(WORKLOAD_KINDS) },
      handler: (args: Record<string, unknown>): Promise<BuddyToolResult> => {
        const kind = asWorkloadKind(args["kind"]);
        proposeAction(
          userId,
          {
            id: newProposalId(),
            kind: "workload",
            workloadKind: kind,
            summary: `Run the ${kind} job`,
          },
          now(),
        );
        return Promise.resolve(
          toolText(
            `Proposed the ${kind} job. Tell the user what it does and that they can Confirm or Cancel below.`,
          ),
        );
      },
    },
  ];
}
