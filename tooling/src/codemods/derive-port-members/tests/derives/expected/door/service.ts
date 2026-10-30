export interface SessionsService {
  create: (input: string) => Promise<number>;
  revoke: (token: string) => Promise<void>;
  lookup: (id: string) => Promise<string | null>;
}
