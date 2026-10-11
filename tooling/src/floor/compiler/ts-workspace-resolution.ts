// Cache only module lookup results. Source objects, binding, facts and verdicts retain their own lifetimes.
// Failed lookups depend on absent files and directories, so overlays invalidate both before reuse.
import { dirname, resolve } from "node:path";
import type { ResolutionHost } from "ts-morph";
import { ts } from "ts-morph";
import type { WorkspaceResolutionCache } from "./ts-workspace-contract.ts";

/** Resolution reuse for one mutable corpus; callers invalidate every changed and restored absolute path. */
export function createWorkspaceResolutionCache(): WorkspaceResolutionCache {
  const entries = new Map<string, ts.ResolvedModuleWithFailedLookupLocations>();
  const dependencies = new Map<string, Set<string>>();
  const pathsByKey = new Map<string, Set<string>>();
  const canonical = (path: string): string => {
    const absolute = resolve(path);
    return ts.sys.useCaseSensitiveFileNames ? absolute : absolute.toLowerCase();
  };
  const evict = (key: string): void => {
    entries.delete(key);
    for (const path of pathsByKey.get(key) ?? []) {
      const keys = dependencies.get(path);
      keys?.delete(key);
      if (keys?.size === 0) {
        dependencies.delete(path);
      }
    }
    pathsByKey.delete(key);
  };
  const remember = (key: string, result: ts.ResolvedModuleWithFailedLookupLocations, paths: Set<string>): void => {
    entries.set(key, result);
    pathsByKey.set(key, paths);
    for (const path of paths) {
      const keys = dependencies.get(path) ?? new Set<string>();
      keys.add(key);
      dependencies.set(path, keys);
    }
  };
  return {
    invalidate: (paths): void => {
      for (const path of paths) {
        let current = canonical(path);
        do {
          for (const key of [...(dependencies.get(current) ?? [])]) {
            evict(key);
          }
          const parent = dirname(current);
          if (parent === current) {
            break;
          }
          current = parent;
        } while (current !== dirname(current));
      }
    },
    host: (host): ResolutionHost => {
      let priorOptions: string | undefined;
      return {
        resolveModuleNameLiterals: (...[literals, containingFile, redirected, options, source]): readonly ts.ResolvedModuleWithFailedLookupLocations[] => {
          const optionKey = JSON.stringify(options);
          if (priorOptions !== optionKey) {
            entries.clear();
            dependencies.clear();
            pathsByKey.clear();
            priorOptions = optionKey;
          }
          return literals.map((literal) => {
            const name = literal.text;
            const mode = ts.getModeForUsageLocation(source, literal, redirected?.commandLine.options ?? options);
            // Referenced programs own different options; leave their resolution to TypeScript without reuse.
            if (redirected !== undefined) {
              return ts.resolveModuleName(name, containingFile, options, host, undefined, redirected, mode);
            }
            const key = JSON.stringify([canonical(dirname(containingFile)), name, mode]);
            const cached = entries.get(key);
            if (cached !== undefined) {
              return cached;
            }
            const paths = new Set<string>();
            const record = (path: string): void => {
              paths.add(canonical(path));
            };
            const result = ts.resolveModuleName(name, containingFile, options, trackingHost(host, record), undefined, undefined, mode);
            remember(key, result, paths);
            return result;
          });
        },
      };
    },
  };
}

function trackingHost(host: ts.ModuleResolutionHost, record: (path: string) => void): ts.ModuleResolutionHost {
  const directoryExists = host.directoryExists?.bind(host);
  const realpath = host.realpath?.bind(host);
  return {
    ...host,
    fileExists: (path): boolean => {
      record(path);
      return host.fileExists(path);
    },
    readFile: (path): string | undefined => {
      record(path);
      return host.readFile(path);
    },
    ...(directoryExists === undefined
      ? {}
      : {
          directoryExists: (path: string): boolean => {
            const exists = directoryExists(path);
            if (!exists) {
              record(path);
            }
            return exists;
          },
        }),
    ...(realpath === undefined
      ? {}
      : {
          realpath: (path: string): string => {
            record(path);
            const target = realpath(path);
            record(target);
            return target;
          },
        }),
  };
}
