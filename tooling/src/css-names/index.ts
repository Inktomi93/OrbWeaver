// The custom-property names a read may rely on, and the D336 intent colour recipes, shared by the Stylelint and ESLint rules that refuse the rest.
export type { CustomPropertyUses } from "./custom-properties.ts";
export {
  baseUiCustomProperties,
  customPropertyUses,
  declaredCustomProperties,
  declaredInCss,
  PROPERTY_READ,
  RUNTIME_CUSTOM_PROPERTIES,
  VENDOR_CUSTOM_PROPERTIES,
} from "./custom-properties.ts";
export { intentColorRecipe } from "./intent-color-recipe.ts";
