// domain/regex — the SERVICE seam for the two single-entity doors (REGX2 · D121-D).
//
// The doors' behaviour is pinned at the factory level (persistence/portability-write.int.test.ts, where the
// thin-arm property — same bytes as the bundle, same import verb — is provable). What is pinned HERE is the
// only thing the service layer adds and the only thing it can get wrong: the Principal → ownerId wrap.
// `createExportRegexScript`/`createImportRegexScript` are `ownerId`-keyed standalone factories shared with
// the portability registry, so this seam is where a caller's identity becomes an owner scope — and a wrap
// that read the wrong field would be a cross-tenant read with every factory-level test still green.

import { regexScripts } from "@orb/db";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createRegexService } from "@orb/server/domain/regex";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import { freshDb } from "../../../support/db.ts";
import { expect, test } from "../../../support/fixtures.ts";
import { behavior, makeHarness, principal, seedScript, seedUser } from "./_support.ts";

/** The refusal must NAME the family it could not read — matched loosely, since the serde owns the exact
 *  sentence and only the fact that it is actionable is pinned here. */
const REFUSAL_NAMES_REGEX = /regex/iu;

describe("the single-entity doors on the service", () => {
  test("exportScript scopes to the CALLER — their own script comes back, a stranger's does not", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createRegexService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const stranger = await seedUser(db, { handle: castId<Handle>("stranger") });
    const mine = await seedScript(db, { ownerId: owner, id: "regex_script_mine", name: "mine" });

    const file = await svc.exportScript({ principal: principal(owner), scriptId: mine });
    expect(file?.filename).toBe("mine-regex_script_mine.json");
    // The same id, a different caller: one answer, and it is not an oracle.
    expect(await svc.exportScript({ principal: principal(stranger), scriptId: mine })).toBeNull();
  });

  test("importScriptFile lands the script under the CALLER, from the file's text", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createRegexService(h.ctx);
    const author = await seedUser(db, { handle: castId<Handle>("author") });
    const scriptId = await seedScript(db, { ownerId: author, id: "regex_script_x", name: "shared", behavior: behavior({ findRegex: "q" }) });
    const file = await svc.exportScript({ principal: principal(author), scriptId });
    expect(file).not.toBeNull();

    const receiver = await seedUser(db, { handle: castId<Handle>("receiver") });
    const outcome = await svc.importScriptFile({
      principal: principal(receiver),
      fileText: new TextDecoder().decode((file as NonNullable<typeof file>).bytes),
    });

    expect(outcome).toEqual({ created: true });
    const [landed] = await db.select().from(regexScripts).where(eq(regexScripts.ownerId, receiver));
    expect(landed?.name).toBe("shared");
  });

  test("a file this build cannot read is refused with the serde's OWN reason, in words", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createRegexService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });

    // The refusal has to be actionable: "written by a newer orbweaver" and "that isn't a regex script" are
    // different problems, and the import chrome renders whichever the domain says.
    await expect(svc.importScriptFile({ principal: principal(owner), fileText: "{}" })).rejects.toThrow(REFUSAL_NAMES_REGEX);
    expect(await db.select().from(regexScripts)).toHaveLength(0);
  });
});
