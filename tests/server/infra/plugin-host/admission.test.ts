import { createAdmission } from "../../../../packages/server/src/infra/plugin-host/admission.ts";
import { expect, test } from "../../../support/fixtures.ts";

test("admission refuses above its ceiling and an idempotent release returns exactly one slot", () => {
  const acquire = createAdmission(2);
  const releaseFirst = acquire();
  const releaseSecond = acquire();

  expect(releaseFirst).not.toBeNull();
  expect(releaseSecond).not.toBeNull();
  expect(acquire()).toBeNull();

  releaseFirst?.();
  releaseFirst?.();
  expect(acquire()).not.toBeNull();
  expect(acquire()).toBeNull();
});
