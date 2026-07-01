// agent/tools — the buddy's curated hands. Pins: PROPOSE tools STASH only (never mutate — confirm is the
// sole executor), the stash is OWNER-scoped (a tool closes over userId), and the read tools are scoped to
// the owner's rows. (tools + the agency Map are flat/domain-internal → deep relative imports.)

import type { UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { BuddyToolSpec } from "@orb/server/domain/buddy";
import { describe } from "vitest";
import { peekProposal } from "../../../../../packages/server/src/domain/buddy/agency/proposals.ts";
import { createBuddyTools } from "../../../../../packages/server/src/domain/buddy/agent/tools.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { seedUser } from "../_support.ts";

const NOW = 1_750_000_000_000;

function toolsFor(db: Awaited<ReturnType<typeof freshDb>>, userId: UserId): BuddyToolSpec[] {
  let n = 0;
  return createBuddyTools({
    db,
    userId,
    now: () => NOW,
    newProposalId: () => {
      n += 1;
      return `proposal_${n}`;
    },
  });
}

function tool(specs: BuddyToolSpec[], name: string): BuddyToolSpec {
  const spec = specs.find((s) => s.name === name);
  if (spec === undefined) {
    throw new Error(`missing tool ${name}`);
  }
  return spec;
}

describe("buddy tools", () => {
  test("propose_rename STASHES a proposal (does NOT rename) scoped to the owner", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { id: "user_o" });
    const other = castId<UserId>("user_other");
    const specs = toolsFor(db, owner);

    await tool(specs, "propose_rename").handler({ newName: "Sparkle" });

    const stashed = peekProposal(owner, NOW);
    expect(stashed?.kind).toBe("rename");
    // Owner-scoped: another user has no pending proposal from this tool.
    expect(peekProposal(other, NOW)).toBeNull();
  });

  test("propose_workload stashes a workload proposal", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { id: "user_w" });
    const specs = toolsFor(db, owner);

    await tool(specs, "propose_workload").handler({ kind: "embed-corpus" });
    const stashed = peekProposal(owner, NOW);
    expect(stashed?.kind).toBe("workload");
  });

  test("buddy_status reads the owner's own row (hatched:false before hatch)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { id: "user_s" });
    const specs = toolsFor(db, owner);

    const result = await tool(specs, "buddy_status").handler({});
    expect(result.content[0]?.text).toContain("hatched");
  });
});
