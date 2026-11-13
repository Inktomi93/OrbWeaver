// The names the /imagine dialog prints. A zero-import leaf, so a spec's node side reads them without loading the
// component graph.

/** The pressable mode group's label. */
export const IMAGINE_MODE_NAME = "Mode";

/** The imagine dialog's title. */
export const IMAGINE_DIALOG_TITLE = "Generate an image";

/** The image detail dialog's title. */
export const IMAGE_DETAIL_TITLE = "Image";

/** The image edit dialog's title, and the detail dialog's door to it. */
export const IMAGE_EDIT_NAME = "Edit image";

/** The prompt field. */
export const IMAGINE_PROMPT_NAME = "Image prompt";

/** The image edit dialog's instruction field. */
export const IMAGE_EDIT_INSTRUCTION_NAME = "Edit instruction";

/** What each imagery dialog says when it was opened with nothing to work on. */
export const IMAGINE_EMPTY_TEXT = "Nothing to imagine.";
export const IMAGE_DETAIL_EMPTY_TEXT = "No image selected.";
export const IMAGE_EDIT_EMPTY_TEXT = "No image to edit.";

/** The imagine dialog's collapsed advanced controls: the door, and each field's name. */
export const IMAGINE_MORE_OPTIONS_NAME = "More options";
export const IMAGINE_COUNT_NAME = "Number of images";

/** The imagine dialog's spend press: one image, and a count above one. */
export const IMAGINE_GENERATE_NAME = "Generate";
export function imagineGenerateCountLabel(count: number): string {
  return `Generate ${count} images`;
}

/** The two payers the spend line can name. */
export const IMAGINE_HOST_PAYS_TEXT = "The room's host pays";
export const IMAGINE_YOU_PAY_TEXT = "You pay";

/** The line that names who pays for a count above one. */
export function imagineCountSpendText(count: number, hostPays: boolean): string {
  return `Asks for ${count} images. ${hostPays ? IMAGINE_HOST_PAYS_TEXT : IMAGINE_YOU_PAY_TEXT} for each one that comes back, and some connections make only one.`;
}

/** The image detail dialog's provenance strip: its read in a failure line, and the state of an image with none recorded. */
export const IMAGE_PROVENANCE_READ_LABEL = "this image's details";
export const IMAGE_PROVENANCE_EMPTY_TEXT = "No generation details recorded for this image.";
