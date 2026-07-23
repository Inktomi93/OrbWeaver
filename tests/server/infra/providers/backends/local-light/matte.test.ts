// infra/providers/backends/local-light/matte — the alpha-matte op goldens (expressions-design/03 §4.1). A thin
// wrapper over the shared cache's `removeBackground`: it resolves the model id (RMBG-1.4 default, overridable),
// passes the bytes through, and honors the AbortSignal at the call boundary. The transformers.js segmentation
// itself is the cache's concern (faked here — the real RMBG pass is the manual E4 checkpoint).

import type { LocalLightModelCache } from "@orb/server/infra/providers/backends/local-light";
import { createLocalLightMatte, DEFAULT_MATTE_MODEL } from "@orb/server/infra/providers/backends/local-light";
import type { Mock } from "vitest";
import { vi } from "vitest";
import { expect, test } from "../../../../../support/fixtures";

const PNG_OUT = Uint8Array.of(9, 8, 7);

function fakeCache(): { cache: LocalLightModelCache; removeBackground: Mock<LocalLightModelCache["removeBackground"]> } {
  const removeBackground = vi.fn<LocalLightModelCache["removeBackground"]>(() => Promise.resolve(PNG_OUT));
  const cache: LocalLightModelCache = {
    embedTexts: () => Promise.resolve([]),
    scorePairs: () => Promise.resolve([]),
    embedImages: () => Promise.resolve([]),
    embedClipTexts: () => Promise.resolve([]),
    removeBackground,
  };
  return { cache, removeBackground };
}

test("delegates to removeBackground with the default RMBG model and returns its PNG bytes", async () => {
  const { cache, removeBackground } = fakeCache();
  const matte = createLocalLightMatte(cache);
  const out = await matte(Uint8Array.of(1, 2, 3));
  expect(out).toBe(PNG_OUT);
  expect(removeBackground).toHaveBeenCalledWith(DEFAULT_MATTE_MODEL, Uint8Array.of(1, 2, 3));
});

test("an explicit opts.model overrides the default", async () => {
  const { cache, removeBackground } = fakeCache();
  const matte = createLocalLightMatte(cache);
  await matte(Uint8Array.of(1), { model: "briaai/RMBG-2.0" });
  expect(removeBackground).toHaveBeenCalledWith("briaai/RMBG-2.0", Uint8Array.of(1));
});

test("a pre-aborted signal throws before touching the cache", async () => {
  const { cache, removeBackground } = fakeCache();
  const matte = createLocalLightMatte(cache);
  const controller = new AbortController();
  controller.abort();
  await expect(matte(Uint8Array.of(1), { signal: controller.signal })).rejects.toThrow();
  expect(removeBackground).not.toHaveBeenCalled();
});
