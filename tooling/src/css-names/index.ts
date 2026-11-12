// The custom-property names a read may rely on, and the D336 intent colour recipes, shared by the Stylelint and ESLint rules that refuse the rest (`orb/custom-property-declared`, `orb/no-intent-color-recipe`).
export type { CustomPropertyUses } from "../eslint/index.ts";
export {
  baseUiCustomProperties,
  customPropertyUses,
  declaredCustomProperties,
  declaredInCss,
  intentColorRecipe,
  PROPERTY_READ,
  RUNTIME_CUSTOM_PROPERTIES,
  VENDOR_CUSTOM_PROPERTIES,
} from "../eslint/index.ts";
