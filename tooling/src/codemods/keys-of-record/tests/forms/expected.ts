import { parseEvidence } from "@orb/testkit/iso";
import { BUTTON_BOX_OVERFLOW, BUTTON_BOX_STEPS } from "@orb/ui/button/box-hit-area";
import { SEED_THEME_NAMES, TOKENS } from "@orb/ui/tokens";

const SEEDS = SEED_THEME_NAMES;
const FROZEN = [undefined, ...SEED_THEME_NAMES] as const;
const STEPS = BUTTON_BOX_STEPS.button.map((step) => BUTTON_BOX_OVERFLOW.button[step]);
export { FROZEN, parseEvidence, SEEDS, STEPS, TOKENS };
