// Product censuses require a rendered subject before DOM stability or any finding collector can establish a verdict.
import { pickKeys } from "@orb/kit/objects";
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import type { SurfaceAuditRequest } from "../node/surface-audit.ts";
import { productNameFindings } from "./accessible-names.ts";
import { densityFindings } from "./density-census.ts";
import { formIdentityFindings } from "./form-identity.ts";

const QUIET_FRAMES = 20;

export interface SurfaceAuditReport {
  readonly names: Awaited<ReturnType<typeof productNameFindings>>;
  readonly forms: Awaited<ReturnType<typeof formIdentityFindings>>;
  readonly density: Awaited<ReturnType<typeof densityFindings>>;
}

/** Await the named scenario's actual content, then collect its selected page-wide census findings. */
export async function auditSurface<const Checks extends SurfaceAuditRequest["checks"]>({
  name,
  scope,
  state,
  witnesses,
  checks,
  requireBothFormKeys = false,
}: SurfaceAuditRequest<Checks>): Promise<Pick<SurfaceAuditReport, Checks[number]>> {
  return await test.step(`Audit ${name} (${state})`, async () => {
    const page = scope.page();
    const witnessSubject = async (): Promise<void> => {
      await expect(scope, `${name}: the audited scope must exist`).toBeVisible();
      for (const witness of witnesses) {
        expect(witness.page(), `${name}: a witness must belong to the audited page`).toBe(page);
        await expect(witness, `${name}: required ${state} content must render`).toBeVisible();
        const contained = await scope.evaluate((subject, element) => subject.contains(element), await witness.elementHandle());
        expect(contained, `${name}: a witness must belong to the audited scope`).toBe(true);
      }
      await expect(scope.locator('[data-slot="query-error"]:visible'), `${name}: read failure must match the selected scenario`).toHaveCount(
        state === "error" ? 1 : 0,
      );
    };
    await witnessSubject();
    await settleDom(page);
    await witnessSubject();
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
