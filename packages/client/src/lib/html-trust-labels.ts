// The one home for how the HTML-trust ladder reads: the step names and the install's own setting name. `lib/` is the home
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
