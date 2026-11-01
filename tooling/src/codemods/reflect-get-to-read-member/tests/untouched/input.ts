export const meter = (): unknown => Reflect.get(globalThis, "__perfMeter");
export const has = (value: object): boolean => Reflect.has(value, "mode");

export async function focused(first: { evaluate: (fn: (element: object) => boolean) => Promise<boolean> }): Promise<boolean> {
  return first.evaluate((element) => {
    const matches = Reflect.get(element, "matches");
    return typeof matches === "function";
  });
}
