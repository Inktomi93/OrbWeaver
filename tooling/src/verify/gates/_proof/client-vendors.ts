// Shared isolated-project vendor surfaces for the client policies whose subject is a MEMBER declared by a
// third-party type module (`@tanstack/query-core`, `@tanstack/form-core`, `@trpc/tanstack-react-query`).
//
// These are real package doors in the proof workspace, resolved by the same node module walk the live tree
// uses, so a proof exercises `declaredByPackage` against an actual `/node_modules/<pkg>/` declaration home
// rather than a stub. Each surface has a LOOKALIKE twin exporting the same member names from a different
// package — that pair is the whole identity claim, and every policy here owes a row on both sides.
export const QUERY_CORE_HOME = "node_modules/@tanstack/query-core/index.d.ts";
export const REACT_QUERY_HOME = "node_modules/@tanstack/react-query/index.d.ts";
export const FORM_CORE_HOME = "node_modules/@tanstack/form-core/index.d.ts";
export const TRPC_PROXY_HOME = "node_modules/@trpc/tanstack-react-query/index.d.ts";
export const LOOKALIKE_HOME = "node_modules/vendor-lookalike/index.d.ts";

const QUERY_CORE = [
  "export declare class QueryClient {",
  "  cancelQueries(filters?: unknown): Promise<void>;",
  "  setQueryData(key: unknown, updater: unknown): unknown;",
  "  invalidateQueries(filters?: unknown): Promise<void>;",
  "}",
  "export interface QueryObserverOptions {",
  "  queryKey?: unknown;",
  "  staleTime?: number | 'static';",
  "}",
  "export interface MutationObserverResult {",
  "  error: unknown;",
  "  isPending: boolean;",
  "}",
  "export declare function useQuery(options: QueryObserverOptions): unknown;",
  "export declare function useQueryClient(): QueryClient;",
  "export declare function useMutation(options: unknown): MutationObserverResult;",
  "",
].join("\n");

const REACT_QUERY = ['export * from "@tanstack/query-core";', ""].join("\n");

const FORM_CORE = [
  "export declare class FormApi {",
  "  pushFieldValue(field: string, value: unknown): void;",
  "  removeFieldValue(field: string, index: number): Promise<void>;",
  "  insertFieldValue(field: string, index: number, value: unknown): Promise<void>;",
  "  moveFieldValues(field: string, from: number, to: number): Promise<void>;",
  "  handleSubmit(): Promise<void>;",
  "  reset(): void;",
  "}",
  "",
].join("\n");

const TRPC_PROXY = [
  "export interface DecorateMutationProcedure {",
  "  mutationOptions(): unknown;",
  "}",
  "export interface DecorateQueryProcedure {",
  "  queryOptions(): unknown;",
  "  queryKey(): unknown;",
  "}",
  "export interface ChatRouter {",
  "  send: DecorateMutationProcedure;",
  "  getChat: DecorateQueryProcedure;",
  "}",
  "export interface DatabankRouter {",
  "  create: DecorateMutationProcedure;",
  "}",
  "export type TRPCOptionsProxy = {",
  "  chat: ChatRouter;",
  "  databank: DatabankRouter;",
  "};",
  "export declare function useTRPC(): TRPCOptionsProxy;",
  "",
].join("\n");

// One module exporting every member name the four policies key on, from a package that is NOT the home.
const LOOKALIKE = [
  "export declare class QueryClient {",
  "  cancelQueries(filters?: unknown): Promise<void>;",
  "  setQueryData(key: unknown, updater: unknown): unknown;",
  "}",
  "export interface Options {",
  "  staleTime?: number | 'static';",
  "}",
  "export declare function configure(options: Options): void;",
  "export declare function useQueryClient(): QueryClient;",
  "export declare class FormApi {",
  "  pushFieldValue(field: string, value: unknown): void;",
  "  handleSubmit(): Promise<void>;",
  "}",
  "export interface DecorateMutationProcedure {",
  "  mutationOptions(): unknown;",
  "}",
  "export interface ChatRouter {",
  "  send: DecorateMutationProcedure;",
  "}",
  "export type TRPCOptionsProxy = {",
  "  chat: ChatRouter;",
  "};",
  "export declare function useTRPC(): TRPCOptionsProxy;",
  "",
].join("\n");

/** The TanStack Query surface, split across its real declaration home and the door features import from. */
export function tanstackQueryProof(): Readonly<Record<string, string>> {
  return { [QUERY_CORE_HOME]: QUERY_CORE, [REACT_QUERY_HOME]: REACT_QUERY };
}

export function tanstackFormProof(): Readonly<Record<string, string>> {
  return { [FORM_CORE_HOME]: FORM_CORE };
}

export function trpcProxyProof(): Readonly<Record<string, string>> {
  return { [TRPC_PROXY_HOME]: TRPC_PROXY };
}

/** The same member names from a package that is not the home — the counterfactual half of every claim. */
export function vendorLookalikeProof(): Readonly<Record<string, string>> {
  return { [LOOKALIKE_HOME]: LOOKALIKE };
}
