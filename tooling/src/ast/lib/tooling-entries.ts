// Runtime/tool entry conventions shared by file reachability and symbol liveness.

/** Package-root build-tool configs are loaded by filename convention. A config nested below `src/`
 *  is an ordinary module and must not inherit that external consumer. */
const PACKAGE_ROOT_TOOLING_CONFIG_RE = /\/packages\/[^/]+\/[^/]+\.config\.ts$/u;

export function isPackageRootToolingConfig(filePath: string): boolean {
  return PACKAGE_ROOT_TOOLING_CONFIG_RE.test(filePath);
}
