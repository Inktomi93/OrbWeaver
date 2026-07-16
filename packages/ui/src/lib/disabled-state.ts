// The disabled-state class pairs, extracted so the ~17 seals that carry them can never drift the
// `pointer-events-none`/`opacity-50` combination. Two variants because Base UI signals disabled two
// ways: `data-disabled` (its own state attr on wrapped Roots) and the native `:disabled` pseudo (on
// real <button>/<input>/<textarea> elements). A control that is BOTH a native element AND a Base UI
// Root (button/input/number-field steppers) composes both.
export const DISABLED_STATE = "data-disabled:pointer-events-none data-disabled:opacity-50";

export const DISABLED_STATE_NATIVE = "disabled:pointer-events-none disabled:opacity-50";
