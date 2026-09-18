// Snap matrix policy shapes. They live with Snap's other typed contracts so the executable policy
// module remains an operation rather than becoming a second type home.

import type {
  BackgroundCapability,
  RuntimeAppearanceContract,
  RuntimeAppearanceContractRow,
  RuntimeAppearanceHistoricalRow,
} from "../../_shared/appearance-matrix.ts";
import type { ThemeEntry } from "../../_shared/theme.ts";
import type { VariantAxis, VariantMatrixPlan } from "../../_shared/variant-matrix.ts";

export type SnapAppearanceContract = RuntimeAppearanceContract;

export interface SnapAppearanceMatrix {
  readonly plan: VariantMatrixPlan;
  readonly appearanceAxes: readonly VariantAxis[];
  readonly dependencies: readonly RuntimeAppearanceContractRow[];
  readonly historicalRows: readonly RuntimeAppearanceHistoricalRow[];
  readonly themes: Readonly<Record<string, ThemeEntry>>;
  /** The live library member every `asset`-arm cell paints with (`null` ⇒ the arm refuses loudly). */
  readonly background: BackgroundCapability | null;
}

export interface SnapMatrixVariant {
  readonly id: string;
  readonly appearance: Readonly<Record<string, unknown>>;
  readonly theme: string;
  readonly device: string | null;
  readonly colorScheme: "light" | "dark";
  readonly reducedMotion: boolean;
  readonly browserContrast: "more" | "no-preference";
  readonly reducedTransparency: boolean;
}
