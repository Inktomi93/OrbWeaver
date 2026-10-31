// @subject tests/support/node/portability-box.ts
import { createSeededIds } from "../iso/ids.ts";
import { expect, test } from "./fixtures.ts";
import { exportLibrary, restoreBundle, signedInBox } from "./portability-box.ts";

test("a signed-in box exports its library through the product route, and a second box restores that bundle to success", async () => {
  await using source = await signedInBox({ ids: createSeededIds(2 ** 29) });
  const bundle = await exportLibrary(source, ["character"]);
  expect(bundle.byteLength).toBeGreaterThan(0);

  await using target = await signedInBox();
  expect(await restoreBundle(target, bundle)).toEqual({ status: "succeeded", failed: 0 });
  expect((await exportLibrary(target)).byteLength).toBeGreaterThan(0);
});

test("restoring bytes that are no bundle reports a failed workload, never a success", async () => {
  await using box = await signedInBox();
  expect((await restoreBundle(box, new Uint8Array([1, 2, 3]))).status).toBe("failed");
});
