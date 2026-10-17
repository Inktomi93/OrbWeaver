import { join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { ESLint, Linter } from "eslint";
import tseslint from "typescript-eslint";

const CONTEXT = "orb/context-definition-shape";
const SHELL = "orb/context-shell-chrome";
const REGISTER = "orb/no-mutating-register-api";

async function messages(
  root: string,
  rule: string,
  source: string,
  path = "packages/client/src/features/probe/lib/probe.tsx",
): Promise<readonly Linter.LintMessage[]> {
  const filename = join(root, path);
  const config = await new ESLint({ cwd: root }).calculateConfigForFile(filename);
  expect(config, filename).toBeDefined();
  const found = new Linter().verify(
    source,
    {
      files: ["**/*.{ts,tsx}"],
      plugins: config.plugins,
      languageOptions: { parser: tseslint.parser, parserOptions: { project: false, projectService: false, ecmaFeatures: { jsx: true } } },
      linterOptions: { reportUnusedDisableDirectives: "error" },
      rules: { [rule]: config.rules[rule] ?? "off" },
    },
    { filename },
  );
  expect(found.some(({ fatal }) => fatal === true)).toBe(false);
  return found;
}

for (const [name, rule, source] of [
  ["hand tabs", CONTEXT, 'export const x={kind:"tabs",useResolved:()=>null};'],
  ["dead mint", CONTEXT, "defineContextTabs<void>({tabs:[]});"],
  ["bodies", CONTEXT, "export const x=<Thing bodies={map}/>;"],
  ["hand region", CONTEXT, "export const x={claims:()=>true,band:()=>null};"],
  ["shell string", SHELL, 'export const x="shell-panel-header";'],
  ["register", REGISTER, "export function register(){}"],
] as const) {
  test(`native context registry founding ${name}`, async ({ repoRoot }) => {
    expect(await messages(repoRoot, rule, source)).toMatchObject([{ ruleId: rule }]);
  });
}

for (const [name, rule, source, count] of [
  ["kind assertion chain", CONTEXT, 'const x={kind:(("tabs" as const) satisfies string),useResolved(){}};', 1],
  ["non-null kind literal", CONTEXT, 'const x={kind:"tabs"!,useResolved:()=>null};', 1],
  ["non-null kind mixed chain", CONTEXT, 'const x={kind:((("tabs"! as const) satisfies string)!),useResolved(){}};', 1],
  ["non-null kind remains dynamic", CONTEXT, "const x={kind:((value! as string) satisfies string)!,useResolved};", 0],
  ["kind no-substitution template", CONTEXT, "const x={kind:`tabs`,useResolved};", 1],
  ["kind ordinary tagged object", CONTEXT, 'const x={kind:"tabs",label:"a"};', 0],
  ["kind dynamic template", CONTEXT, "const x={kind:`t${value}abs`,useResolved};", 0],
  ["kind identifier", CONTEXT, "const x={kind:kind,useResolved};", 0],
  ["kind call", CONTEXT, 'const x={kind:label("tabs"),useResolved};', 0],
  ["quoted kind remains unmatched", CONTEXT, 'const x={"kind":"tabs",useResolved};', 0],
  ["kind getter is not an assignment", CONTEXT, 'const x={get kind(){return "tabs"},useResolved};', 0],
  ["resolved getter is not a reportable property", CONTEXT, 'const x={kind:"tabs",get useResolved(){return 1}};', 0],
  ["parenthesized dead argument stays indirect", CONTEXT, "defineContextTabs<void>(({tabs:[]}));", 0],
  ["parenthesized dead array stays indirect", CONTEXT, "defineContextTabs<void>({tabs:([])});", 0],
  ["parenthesized dead callee stays indirect", CONTEXT, "(defineContextTabs)<void>({tabs:[]});", 0],
  ["asserted dead argument stays indirect", CONTEXT, "defineContextTabs<void>({tabs:[]} as Spec);", 0],
  ["nonempty dead arm", CONTEXT, "defineContextTabs<void>({tabs:[tab]});", 0],
  ["contributors undefined is present", CONTEXT, "defineContextTabs<void>({tabs:[],contributors:undefined});", 0],
  ["contributors false is present", CONTEXT, "defineContextTabs<void>({tabs:[],contributors:false});", 0],
  ["contributors shorthand is present", CONTEXT, "defineContextTabs<void>({tabs:[],contributors});", 0],
  ["spread alone is not a contributors property", CONTEXT, "defineContextTabs<void>({tabs:[],...spec});", 1],
  ["foreign member is not the bare mint", CONTEXT, "other.defineContextTabs<void>({tabs:[]});", 0],
  ["bare local spelling stays judged", CONTEXT, "function defineContextTabs(x){return x}defineContextTabs({tabs:[]});", 1],
  ["optional bare call", CONTEXT, "defineContextTabs?.<void>({tabs:[]});", 1],
  ["bodies string/ReactNode record", CONTEXT, "interface X{readonly bodies:Record<string, ReactNode>}", 1],
  ["bodies partial record", CONTEXT, "type X={bodies:Partial<Record<string,ReactNode>>}", 1],
  ["leading type trivia preserves direct Record text", CONTEXT, "interface X{bodies: /*owner*/ Record<string,ReactNode>}", 1],
  ["parenthesized type trivia stays unmatched", CONTEXT, "interface X{bodies: /*owner*/ (Record<string,ReactNode>)}", 0],
  ["bodies numeric record", CONTEXT, "interface X{bodies:Record<string,number>}", 0],
  ["bodies namespace type stays unmatched", CONTEXT, "interface X{bodies:Record<string,React.ReactNode>}", 0],
  ["bodies alias type stays unmatched", CONTEXT, "interface X{bodies:BodyMap}", 0],
  ["parenthesized record text stays unmatched", CONTEXT, "interface X{bodies:(Record<string,ReactNode>)}", 0],
  ["bodies JSX value-independent", CONTEXT, "const x=<X bodies/>;", 1],
  ["other JSX attribute", CONTEXT, "const x=<X body={map}/>;", 0],
  ["direct region argument", CONTEXT, "defineContextRegion({claims:()=>true,band:()=>null});", 0],
  ["direct region second argument", CONTEXT, "defineContextRegion(other,{claims:()=>true,band:()=>null});", 0],
  ["parenthesized region argument is not direct", CONTEXT, "defineContextRegion(({claims:()=>true,band:()=>null}));", 1],
  ["parenthesized region callee is not bare", CONTEXT, "(defineContextRegion)({claims:()=>true,band:()=>null});", 1],
  ["asserted region argument is not direct", CONTEXT, "defineContextRegion({claims:()=>true,band:()=>null} as Spec);", 1],
  ["region namespace call is not minted", CONTEXT, "other.defineContextRegion({claims:()=>true,band:()=>null});", 1],
  ["region claims getter is not reportable", CONTEXT, "const x={get claims(){return true},band};", 0],
  ["region claims method", CONTEXT, "const x={claims(){return true},band};", 1],
  ["both object walls", CONTEXT, 'const x={kind:"tabs",useResolved,claims,band};', 2],
  ["shell raw substring", SHELL, 'const prose="uses shell-panel-header-group";', 1],
  ["shell head", SHELL, "const x=`shell-panel-header ${value}`;", 1],
  ["shell middle", SHELL, "const x=`${value} shell-panel-header ${other}`;", 1],
  ["shell tail", SHELL, "const x=`${value} shell-panel-header`;", 1],
  ["shell separate carriers", SHELL, "const x=`shell-panel-header ${value} shell-panel-header`;", 2],
  ["shell escapes are raw", SHELL, String.raw`const x="shell-panel-\u0068eader";`, 0],
  ["shell split across expression", SHELL, "const x=`shell-panel-${value}header`;", 0],
  ["shell comment", SHELL, "// shell-panel-header\nconst x=1;", 0],
  ["object method", REGISTER, "const x={register(){}};", 1],
  ["class method", REGISTER, "class X{register(){}}", 1],
  ["abstract class method", REGISTER, "abstract class X{abstract register():void}", 1],
  ["ambient function declaration", REGISTER, "declare function register():void;", 1],
  ["function expression initializer", REGISTER, "let register=function(){};", 1],
  ["arrow initializer", REGISTER, "const register=()=>1;", 1],
  ["typed arrow initializer", REGISTER, "const register:()=>number=()=>1;", 1],
  ["parenthesized initializer stays indirect", REGISTER, "const register=(()=>1);", 0],
  ["asserted initializer stays indirect", REGISTER, "const register=(()=>1) as Fn;", 0],
  ["property arrow remains unmatched", REGISTER, "const x={register:()=>1};", 0],
  ["quoted method remains unmatched", REGISTER, 'class X{"register"(){}}', 0],
  ["computed method remains unmatched", REGISTER, "class X{[register](){}}", 0],
  ["getter remains unmatched", REGISTER, "class X{get register(){return 1}}", 0],
  ["class field remains unmatched", REGISTER, "class X{register=()=>1}", 0],
  ["nonfunction register", REGISTER, 'const register={id:"a"};', 0],
  ["different vocabulary", REGISTER, "function registerAll(){}", 0],
  ["escaped dead callee keeps identifier meaning", CONTEXT, String.raw`defineContextT\u0061bs<void>({tabs:[]});`, 1],
  ["escaped region callee keeps identifier meaning", CONTEXT, String.raw`defineContextR\u0065gion({claims:()=>true,band:()=>null});`, 0],
  ["escaped register declaration keeps identifier meaning", REGISTER, String.raw`function reg\u0069ster(){}`, 1],
  ["escaped register initializer keeps identifier meaning", REGISTER, String.raw`const reg\u0069ster=()=>1;`, 1],
  ["escaped register method keeps identifier meaning", REGISTER, String.raw`class X{reg\u0069ster(){}}`, 1],
  ["escaped kind property", CONTEXT, String.raw`const x={k\u0069nd:"tabs",useResolved};`, 1],
  ["escaped renderer property", CONTEXT, String.raw`const x={kind:"tabs",useRes\u006flved};`, 1],
  ["escaped tabs property", CONTEXT, String.raw`defineContextTabs<void>({t\u0061bs:[]});`, 1],
  ["escaped contributors property is present", CONTEXT, String.raw`defineContextTabs<void>({tabs:[],c\u006fntributors});`, 0],
  ["escaped claims property", CONTEXT, String.raw`const x={cl\u0061ims,band};`, 1],
  ["escaped bodies property", CONTEXT, String.raw`interface X{b\u006fdies:Record<string,ReactNode>}`, 1],
] as const) {
  test(`native context registry boundary ${name}`, async ({ repoRoot }) => {
    expect(await messages(repoRoot, rule, source)).toHaveLength(count);
  });
}

for (const [path, rule, source, count] of [
  ["packages/client/src/lib/registry-contracts.ts", CONTEXT, 'const x={kind:"tabs",useResolved,claims,band};', 0],
  ["packages/client/src/features/x/lib/registry-contracts.ts", CONTEXT, 'const x={kind:"tabs",useResolved,claims,band};', 0],
  ["packages/client/src/lib/registry-contracts.ts", CONTEXT, "defineContextTabs<void>({tabs:[]});", 1],
  ["packages/client/src/features/app-shell/components/probe.tsx", SHELL, 'const x="shell-panel-header";', 0],
  ["packages/client/src/lib/probe.ts", SHELL, 'const x="shell-panel-header";', 0],
  ["packages/client/src/main.tsx", REGISTER, "function register(){}", 1],
  ["packages/client/src/compose/probe.ts", REGISTER, "function register(){}", 1],
  ["packages/client/src/features/x/probe.gen.ts", CONTEXT, 'const x={kind:"tabs",useResolved};', 1],
  ["packages/client/src/features/x/probe.d.ts", CONTEXT, "interface X{bodies:Record<string,ReactNode>}", 1],
  ["packages/client/src/features/x/probe.gen.ts", REGISTER, "function register(){}", 1],
  ["packages/server/src/domain/x/probe.tsx", CONTEXT, 'const x={kind:"tabs",useResolved};', 0],
  ["packages/ui/src/lib/probe.tsx", REGISTER, "function register(){}", 0],
] as const) {
  test(`native context registry population ${path} ${rule}`, async ({ repoRoot }) => {
    expect(await messages(repoRoot, rule, source, path)).toHaveLength(count);
  });
}

for (const [rule, bad] of [
  [CONTEXT, 'const x={kind:"tabs",useResolved};'],
  [SHELL, 'const x="shell-panel-header";'],
  [REGISTER, "function register(){}"],
] as const) {
  test(`native context registry line permission ${rule}`, async ({ repoRoot }) => {
    const permission = `// eslint-disable-next-line ${rule} -- Bounded native permission control.\n`;
    expect(await messages(repoRoot, rule, permission + bad)).toEqual([]);
    expect(await messages(repoRoot, rule, permission + bad + "\n" + bad)).toMatchObject([{ ruleId: rule }]);
    expect(await messages(repoRoot, rule, permission + "const clean=1;")).toMatchObject([
      { ruleId: null, message: expect.stringContaining("Unused eslint-disable directive") },
    ]);
  });
}
