import type { HomeTileContribution } from "@orb/client/state";

declare const base: Pick<HomeTileContribution, "id" | "title" | "icon">;
const dormant: HomeTileContribution = { ...base, body: { dormant: { reason: "Not built", teaser: "A real subject" } } };
const live: HomeTileContribution = { ...base, action: "Open", body: () => null };
// @ts-expect-error a dormant doorway cannot expose an action
const dishonest: HomeTileContribution = { ...base, action: "Open", body: { dormant: { reason: "Not built", teaser: "A real subject" } } };
void [dormant, live, dishonest];
