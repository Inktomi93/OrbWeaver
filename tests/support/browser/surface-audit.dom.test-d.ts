import type { Locator } from "@playwright/test";
import { expectTypeOf, test } from "vitest";
import type { SurfaceAuditRequest } from "../node/surface-audit.ts";
import type { auditSurface } from "./settle-surface.ts";

type NamesReport = Awaited<ReturnType<typeof auditSurface<readonly ["names"]>>>;

test("a product audit requires concrete nonempty witnesses and a selected check", () => {
  expectTypeOf<readonly [Locator]>().toExtend<SurfaceAuditRequest["witnesses"]>();
  expectTypeOf<readonly []>().not.toExtend<SurfaceAuditRequest["witnesses"]>();
  expectTypeOf<readonly Locator[]>().not.toExtend<SurfaceAuditRequest["witnesses"]>();
  expectTypeOf<readonly []>().not.toExtend<SurfaceAuditRequest["checks"]>();
  expectTypeOf<Omit<SurfaceAuditRequest, "witnesses">>().not.toExtend<SurfaceAuditRequest>();
  expectTypeOf<Omit<SurfaceAuditRequest, "witnesses"> & { readonly ready: () => Promise<void> }>().not.toExtend<SurfaceAuditRequest>();
  expectTypeOf<keyof NamesReport>().toEqualTypeOf<"names">();
  expectTypeOf<"forms">().not.toExtend<keyof NamesReport>();
  expectTypeOf<"density">().not.toExtend<keyof NamesReport>();
});
