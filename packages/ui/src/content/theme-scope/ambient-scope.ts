// What a ThemeScope hands its descendants beside its base and accent, in its own file because `MessageBubble` reads it too.
import { createContext } from "react";
import type { ScopeAmbient } from "./clamp.ts";

/** The validated inks, picked fills and per-role bubble scopes of the scopes above, and the fill a descendant sits inside. */
export const AmbientScopeContext = createContext<Omit<ScopeAmbient, "palette">>({});
