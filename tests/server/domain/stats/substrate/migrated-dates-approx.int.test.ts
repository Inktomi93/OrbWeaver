// @subject packages/server/src/domain/stats/substrate/rebuild-rollups.ts
// @subject packages/server/src/domain/stats/persistence/rollups.ts
import { createCharacterSchema } from "@orb/contracts/character";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness } from "@orb/testkit/node/composed";

const ENCODER = new TextEncoder();

/** One ST transcript of two lines. The filename token is the chat's original creation (it survives an ST
 *  re-save); `sentAt` is what a re-save rewrites onto every line. */
async function importTranscript(root: ServerTestHarness, handle: string, createdToken: string, sentAt: string): Promise<void> {
  const descriptor = root.app.portability.find((entity) => entity.kind === "chat");
  if (descriptor === undefined) {
    throw new Error("the production chat import descriptor is missing");
  }
  const lines = [
    `{"character_name":"${handle}","user_name":"Nate","create_date":"${sentAt}"}`,
    `{"name":"${handle}","is_user":false,"is_system":false,"mes":"${handle} greets you.","send_date":"${sentAt}"}`,
    `{"name":"Nate","is_user":true,"is_system":false,"mes":"Hello.","send_date":"${sentAt}"}`,
  ];
  const outcome = await descriptor.importFile(root.ownerId, {
    filename: `${handle}/${handle} - ${createdToken}.jsonl`,
    bytes: ENCODER.encode(lines.join("\n")),
  });
  if (!outcome.ok) {
    throw new Error(`the production chat import refused the transcript: ${JSON.stringify(outcome)}`);
  }
}

test("a rebuild over a migrated chat flags its buckets approximate through the timeseries read, and only those", async () => {
  await using root = await createServerHarness();
  const principal = await root.principalFor(root.ownerId);
  for (const handle of ["migrated-keeper", "native-keeper"]) {
    await root.services.character.create({
      principal,
      input: createCharacterSchema.parse({ handle, name: handle, description: `${handle} keeps the lamp.` }),
    });
  }
  // Created in January 2024 and re-saved in July 2025: every line is dated far past its chat's creation.
  await importTranscript(root, "migrated-keeper", "2024-01-05@10h00m00s", "2025-07-18@12h00m01s");
  // Saved the day it was created: its dates are exact.
  await importTranscript(root, "native-keeper", "2025-07-19@12h00m00s", "2025-07-19@12h00m01s");
  await root.settleBackground();

  await root.services.stats.reconcile(root.ownerId);

  const buckets = await root.services.stats.timeseries(root.ownerId);
  const turns = (rows: typeof buckets): number => rows.reduce((sum, bucket) => sum + bucket.userTurns + bucket.assistantTurns, 0);
  const approximate = buckets.filter((bucket) => bucket.messageDatesApprox);
  const exact = buckets.filter((bucket) => !bucket.messageDatesApprox);
  // The exact chat is the positive control: the flag is per bucket, not stamped on the whole timeline.
  expect(turns(exact)).toBe(2);
  expect(turns(approximate)).toBe(2);
});
