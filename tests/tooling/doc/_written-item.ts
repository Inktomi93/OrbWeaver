// The one place a doc test gets real What, Why and Done when text, because a mint refuses an item without it.
import type { ItemContent, NewItemInput } from "../../../tooling/src/doc/index.ts";
import { itemTemplate } from "../../../tooling/src/doc/index.ts";

export const WRITTEN_CONTENT = {
  what: "Split the ledger into one file per decision.",
  why: "One file holds every ruling, so no two lanes can edit it at once.",
  done: "Each ruling has its own file and the index lists them.",
} satisfies ItemContent;

/** `input` as a mint takes it: the written default fills each section the test does not set. */
export function written(input: Omit<NewItemInput, "content"> & { readonly content?: Partial<ItemContent> }): NewItemInput {
  return { ...input, content: { ...WRITTEN_CONTENT, ...input.content } };
}

const BARE_ITEM = { kind: "work", status: "open", updated: "2026-09-23" } as const;

/** An item file as the template leaves it: every section at its prompt. */
export function bareItemSource(title: string): string {
  return itemTemplate(BARE_ITEM, title);
}

/** The prompt the template puts under `## <section>`, read from the template itself. */
export function templatePrompt(section: "What" | "Why" | "Done when" | "Evidence"): string {
  const prompt = new RegExp(`^## ${section}\\n\\n(.+)$`, "mu").exec(bareItemSource("T"))?.[1];
  if (prompt === undefined) {
    throw new Error(`the item template has no ## ${section} prompt`);
  }
  return prompt;
}
