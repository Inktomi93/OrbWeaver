// The output-policy projection of the installed tRPC declarations: Procedure's _def.$types.output/type,
// parser in/out propagation, and DecorateCreateRouterOptions' nested router records. Unlike a loose builder
// stub this preserves the actual native identities the policy resolves. The real-program test pins the door.
const TRPC = `
declare const unset: unique symbol;
type UnsetMarker = typeof unset;
type DefaultValue<T,F> = T extends UnsetMarker ? F : T;
type MaybePromise<T> = T | Promise<T>;
interface BuiltProcedureDef { input: unknown; output: unknown; meta: unknown }
interface Procedure<K extends "query"|"mutation"|"subscription",D extends BuiltProcedureDef> {
 _def: {$types:{input:D["input"];output:D["output"]};procedure:true;type:K;meta:unknown;experimental_caller:boolean;inputs:unknown[]};
 meta:D["meta"];
 (opts:unknown):Promise<D["output"]>;
}
interface ProcedureBuilder<C,M,CO,II,IO,OI,OO,Caller extends boolean> {
 input(schema:unknown):ProcedureBuilder<C,M,CO,II,IO,OI,OO,Caller>;
 output<I,O>(schema:{_input:I;_output:O}):ProcedureBuilder<C,M,CO,II,IO,I,O,Caller>;
 use(middleware:unknown):ProcedureBuilder<C,M,CO,II,IO,OI,OO,Caller>;
 meta(meta:M):ProcedureBuilder<C,M,CO,II,IO,OI,OO,Caller>;
 query<O>(resolver:()=>MaybePromise<DefaultValue<OI,O>>):Procedure<"query",{input:DefaultValue<II,void>;output:DefaultValue<OO,O>;meta:M}>;
 mutation<O>(resolver:()=>MaybePromise<DefaultValue<OI,O>>):Procedure<"mutation",{input:DefaultValue<II,void>;output:DefaultValue<OO,O>;meta:M}>;
 subscription<O>(resolver:()=>O):Procedure<"subscription",{input:DefaultValue<II,void>;output:O;meta:M}>;
}
type AnyProcedure = Procedure<"query"|"mutation"|"subscription",BuiltProcedureDef>;
interface Router<R> {_def:{router:true;record:R;procedures:R;procedure?:never}}
type BuiltRouter<R> = Router<R> & R;
interface CreateRouterOptions {[key:string]:AnyProcedure|Router<CreateRouterOptions>|CreateRouterOptions}
type Decorate<T extends CreateRouterOptions> = {[K in keyof T]:T[K] extends AnyProcedure ? T[K] : T[K] extends Router<infer R> ? R : T[K] extends CreateRouterOptions ? Decorate<T[K]> : never};
export declare function router<T extends CreateRouterOptions>(input:T):BuiltRouter<Decorate<T>>;
export declare const t:{router:typeof router;procedure:ProcedureBuilder<object,object,object,UnsetMarker,UnsetMarker,UnsetMarker,UnsetMarker,false>};
export declare const schema:{_input:{id:string};_output:{id:string}};
`;

export function trpcOutputProof(): Readonly<Record<string, string>> {
  return {
    "node_modules/@trpc/server/index.d.ts": TRPC,
    "packages/server/src/transport/trpc/trpc.ts": 'import {t} from "@trpc/server"; export {t}; export const authedProcedure=t.procedure.use({});',
  };
}
