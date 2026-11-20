// The one home for how character trust reads: the ladder's step names, the install's own setting name, and the media switch. `lib/` is the home
// because the character Trust tab, the admin Media and trust section and the chat notices all name the same steps, and
// features cannot import each other.

import type { HtmlTrustStep } from "@orb/contracts/chat";

/** What each step of the ladder is called, wherever a control or a notice names one. */
export const HTML_TRUST_STEP_LABELS: Record<HtmlTrustStep, string> = {
  untrusted: "Plain text",
  trusted: "Rich HTML",
  interactive: "Interactive",
};

/** The install's step for characters on "Inherit default", as its nav entry, its select and the notices name it. */
export const DEFAULT_HTML_STEP_SETTING_LABEL = "Default for characters";

/** The one control block that decides whether a character's content loads, on its Trust tab and in the install's
 *  defaults, as the chat notices name it. */
export const CHARACTER_TRUST_BLOCK_LABEL = "Character trust";

/** The switch in that block that lets a character's content load images and media from the internet. */
export const LOAD_INTERNET_MEDIA_LABEL = "Load internet media";
