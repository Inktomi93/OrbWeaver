// A settings write's only wrong-key guard: the verb answers success and drops a key the section does not have.
// @subject packages/client/src/data/section-patch-vars.ts

import type { SectionPatchVars } from "@orb/client/data";

export const validLeaf = { section: "memory", patch: { enabled: true } } satisfies SectionPatchVars<"memory">;
export const validNestedLeaf = { section: "chat", patch: { attachmentQuality: { imageDetail: "high" } } } satisfies SectionPatchVars<"chat">;

// `null` is the merge's only clear: an optional leaf takes it, a required one does not.
export const clearedSlot = { section: "prose", patch: { "chat.arbiter.system": null } } satisfies SectionPatchVars<"prose">;

export const clearedRequired = {
  section: "memory",
  // @ts-expect-error a required leaf has no cleared state
  patch: { enabled: null },
} satisfies SectionPatchVars<"memory">;

export const wrongSlot = {
  section: "prose",
  // @ts-expect-error a typo'd slot id is dropped by the merge's reparse
  patch: { "chat.arbiter.systems": null },
} satisfies SectionPatchVars<"prose">;

export const wrongKey = {
  section: "memory",
  // @ts-expect-error a key the section does not have must not compile
  patch: { enable: true },
} satisfies SectionPatchVars<"memory">;

export const wrongNestedKey = {
  section: "chat",
  // @ts-expect-error `Partial` would stop at the first level and pass this
  patch: { attachmentQuality: { nosuch: "high" } },
} satisfies SectionPatchVars<"chat">;

export const wrongValue = {
  section: "memory",
  // @ts-expect-error a known key still carries its own value type
  patch: { enabled: "yes" },
} satisfies SectionPatchVars<"memory">;

export const wrongSection = {
  // @ts-expect-error the section is pinned, so a patch cannot land on another section
  section: "chat",
  patch: { enabled: true },
} satisfies SectionPatchVars<"memory">;
