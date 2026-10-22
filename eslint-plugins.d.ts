// This plugin publishes JavaScript without declarations; its config boundary uses ESLint's native plugin contract.
declare module "eslint-plugin-drizzle" {
  const plugin: import("eslint").ESLint.Plugin;
  export default plugin;
}

declare module "eslint-plugin-jsx-a11y" {
  const plugin: import("eslint").ESLint.Plugin & {
    flatConfigs: { recommended: import("eslint").Linter.Config; strict: import("eslint").Linter.Config };
  };
  export default plugin;
}
