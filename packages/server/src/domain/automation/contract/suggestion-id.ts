import type { AutomationSuggestionId } from "@orb/kit/ids";

/** The pending-ask id minter: an ephemeral TypeID with no table, the id is the claim handle. */
export type NewSuggestionId = () => AutomationSuggestionId;
