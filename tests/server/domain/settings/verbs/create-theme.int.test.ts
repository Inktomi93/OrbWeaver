// verb: createTheme — write a new OWNED theme from scratch. Runs `themeOverrideSchema.parse` + the
// css-validator at the write boundary; a taken (ownerId, name) throws DomainConflictError (TOCTOU-safe:
// no phantom pre-SELECT — the `tag.create` precedent).

import { DomainConflictError, DomainOperationError } from "@orb/kit/errors";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { makeHarness, principal, seedUser } from "../_support.ts";

describe("createTheme", () => {
  test("writes an owned theme + audits theme.create", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const a = await seedUser(db, { id: "user_a" });
    const view = await h.svc.createTheme({
      principal: principal(a, "user"),
      input: { name: "Mine", override: { accent: "oklch(0.7 0.14 250)" } },
    });
    expect(view.name).toBe("Mine");
    expect(view.isSeed).toBe(false);
    expect(view.override).toEqual({ accent: "oklch(0.7 0.14 250)" });
    expect(h.audits.some((a2) => a2.entry.action === "theme.create")).toBe(true);
  });

  test("a hostile override value degrades per-field (never throws)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const a = await seedUser(db, { id: "user_a" });
    const view = await h.svc.createTheme({
      principal: principal(a, "user"),
      // biome-ignore lint/suspicious/noExplicitAny: deliberately hostile input past the wire type
      input: { name: "Mine", override: { accent: "url(evil)" } as any },
    });
    expect(view.override.accent).toBeUndefined();
  });

  test("a taken name throws DomainConflictError (no pre-SELECT, insert-then-classify)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const a = await seedUser(db, { id: "user_a" });
    await h.svc.createTheme({
      principal: principal(a, "user"),
      input: { name: "Mine", override: {} },
    });
    await expect(
      h.svc.createTheme({ principal: principal(a, "user"), input: { name: "Mine", override: {} } }),
    ).rejects.toThrow(DomainConflictError);
  });

  test("two different users may each use the same theme name", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const a = await seedUser(db, { id: "user_a" });
    const b = await seedUser(db, { id: "user_b" });
    await expect(
      h.svc.createTheme({ principal: principal(a, "user"), input: { name: "Mine", override: {} } }),
    ).resolves.toBeDefined();
    await expect(
      h.svc.createTheme({ principal: principal(b, "user"), input: { name: "Mine", override: {} } }),
    ).resolves.toBeDefined();
  });

  test("custom CSS with `position: fixed` is rejected (a containment break)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const a = await seedUser(db, { id: "user_a" });
    await expect(
      h.svc.createTheme({
        principal: principal(a, "user"),
        input: { name: "Mine", override: {}, css: ".x { position: fixed; }" },
      }),
    ).rejects.toThrow(DomainOperationError);
  });

  test("custom CSS with @import is accepted (warn-only, never rejects)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const a = await seedUser(db, { id: "user_a" });
    const view = await h.svc.createTheme({
      principal: principal(a, "user"),
      input: { name: "Mine", override: {}, css: "@import 'x.css';" },
    });
    expect(view.css).toBe("@import 'x.css';");
  });
});
