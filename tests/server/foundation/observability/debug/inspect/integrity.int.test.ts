// foundation/observability/debug/inspect/integrity — the whole-DB integrity probe (PRAGMA
// foreign_key_check + integrity_check) against a real libSQL :memory: db. Asserts the healthy path
// (ok=true, no violations, integrity_check all "ok") AND the not-ok path: an orphan FK row planted with
// enforcement toggled OFF is surfaced by foreign_key_check, flipping ok to false. The parse-the-unnamed-
// column logic for integrity_check is exercised on the way through.

import { sessionEntries } from "@orb/db";
import type { ChatId, SessionEntryId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { integrityProbe } from "@orb/server/foundation/observability/debug";
import { sql } from "drizzle-orm";
import { freshDb } from "../../../../../support/db";
import { expect, test } from "../../../../../support/fixtures";

const SEEDED_THROUGH_SEQ = 4;
const CANON_HASH = "canon-hash-integrity";

test("a healthy db probes ok — no FK violations, integrity_check all ok", async () => {
  const db = await freshDb();
  const report = await integrityProbe(db);
  expect(report.ok).toBe(true);
  expect(report.foreignKeyViolations).toEqual([]);
  // integrity_check on a sound db returns the single sentinel row "ok".
  expect(report.integrityCheck).toEqual(["ok"]);
});

test("an orphan FK row (planted with enforcement OFF) flips ok=false and is surfaced", async () => {
  const db = await freshDb();
  // FK enforcement is ON by default (createDb refuses to boot otherwise). Toggle it OFF on the connection
  // to plant an orphan that a live insert would have rejected — exactly the corruption foreign_key_check
  // exists to catch (a dropped FK clause / a pre-existing orphan).
  await db.run(sql`PRAGMA foreign_keys = OFF`);
  await db.insert(sessionEntries).values({
    id: castId<SessionEntryId>("session_entry_orphan"),
    chatId: castId<ChatId>("chat_does_not_exist"),
    sdkSessionId: "sdk-orphan",
    seq: 0,
    seededThroughSeq: SEEDED_THROUGH_SEQ,
    canonHash: CANON_HASH,
  });
  await db.run(sql`PRAGMA foreign_keys = ON`);

  const report = await integrityProbe(db);
  expect(report.ok).toBe(false);
  expect(report.foreignKeyViolations.length).toBeGreaterThan(0);
});
