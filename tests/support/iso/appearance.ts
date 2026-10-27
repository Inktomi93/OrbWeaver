import { appearanceSettingsSchema } from "@orb/contracts/settings/appearance";

const maximumFontScale = appearanceSettingsSchema.unwrap().shape.fontScale.unwrap().unwrap().maxValue;
if (maximumFontScale === null) {
  throw new Error("Enlarged-text cases require the appearance schema's maximum font scale");
}

/** Production appearance defaults with the schema's admitted maximum text scale. */
export const ENLARGED_APPEARANCE_SETTINGS = appearanceSettingsSchema.parse({ fontScale: maximumFontScale });
