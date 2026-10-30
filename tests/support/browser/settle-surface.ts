// Product censuses require a rendered subject before DOM stability or any finding collector can establish a verdict.
import { pickKeys } from "@orb/kit/objects";
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import type { SurfaceAuditErrorSource, SurfaceAuditRequest } from "../node/surface-audit.ts";
import { productNameFindings } from "./accessible-names.ts";
import { densityFindings } from "./density-census.ts";
import { formIdentityFindings } from "./form-identity.ts";

const QUIET_FRAMES = 20;
const ERROR_QUERY_COUNTS: Readonly<Record<SurfaceAuditErrorSource, number>> = { query: 1, interaction: 0 };

export interface SurfaceAuditReport {
  readonly names: Awaited<ReturnType<typeof productNameFindings>>;
  readonly forms: Awaited<ReturnType<typeof formIdentityFindings>>;
  readonly density: Awaited<ReturnType<typeof densityFindings>>;
}

/** Verify concrete rendered witnesses and their ownership before any audit or measurement. */
export async function assertSurfaceReady({ name, scope, state, witnesses, errorSource }: SurfaceAuditRequest): Promise<void> {
  const page = scope.page();
  await expect(scope, `${name}: the audited scope must exist`).toBeVisible();
  for (const witness of witnesses) {
    expect(witness.page(), `${name}: a witness must belong to the audited page`).toBe(page);
    await expect(witness, `${name}: required ${state} content must render`).toBeVisible();
    const contained = await scope.evaluate((subject, element) => subject.contains(element), await witness.elementHandle());
    expect(contained, `${name}: a witness must belong to the audited scope`).toBe(true);
  }
  await expect(scope.locator('[data-slot="query-error"]:visible'), `${name}: read failure must match the selected scenario`).toHaveCount(
    state === "error" ? ERROR_QUERY_COUNTS[errorSource ?? "query"] : 0,
  );
}

/** Await the named scenario's actual content, then collect its selected page-wide census findings. */
export async function auditSurface<const Checks extends SurfaceAuditRequest["checks"]>(
  request: SurfaceAuditRequest<Checks>,
): Promise<Pick<SurfaceAuditReport, Checks[number]>> {
  const { name, scope, state, checks, requireBothFormKeys = false } = request;
  return await test.step(`Audit ${name} (${state})`, async () => {
    const page = scope.page();
    await assertSurfaceReady(request);
    await settleDom(page);
    await assertSurfaceReady(request);
    const report: SurfaceAuditReport = {
      names: checks.includes("names") ? await productNameFindings(page) : [],
      forms: checks.includes("forms") ? await formIdentityFindings(page, { both: requireBothFormKeys }) : [],
      density: checks.includes("density") ? await densityFindings(page) : [],
    };
    return pickKeys(report, checks);
  });
}

// Quiescence stabilizes rendered geometry; it cannot establish data readiness.
async function settleDom(page: Page): Promise<void> {
  await page.evaluate(
    (quietFrames: number) =>
      new Promise<void>((resolve) => {
        let quiet = 0;
        const observer = new MutationObserver(() => {
          quiet = 0;
        });
        observer.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
        const tick = (): void => {
          quiet += 1;
          if (quiet >= quietFrames) {
            observer.disconnect();
            resolve();
          } else {
            requestAnimationFrame(tick);
          }
        };
        requestAnimationFrame(tick);
      }),
    QUIET_FRAMES,
  );
}
