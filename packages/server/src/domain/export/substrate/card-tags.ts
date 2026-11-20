import { tagStatusSchema } from "@orb/contracts/tag";

/** A card's tags are its accepted junction rows; a pending suggestion is not part of the card. */
export const ACCEPTED_TAG_STATUS = tagStatusSchema.enum.accepted;
