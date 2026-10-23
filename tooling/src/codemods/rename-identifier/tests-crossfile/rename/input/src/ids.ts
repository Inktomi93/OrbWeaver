export function castId<T extends string>(raw: string): T {
  return raw as T;
}

export const castIdLabel = "castId";
