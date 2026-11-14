declare module "node:sqlite" {
  export interface StatementResultingChanges {
    changes: number | bigint;
    lastInsertRowid: number | bigint;
  }

  export class StatementSync {
    get(...anonymousParameters: unknown[]): Record<string, unknown> | undefined;
    all(...anonymousParameters: unknown[]): Record<string, unknown>[];
    run(...anonymousParameters: unknown[]): StatementResultingChanges;
  }

  export class DatabaseSync {
    constructor(location: string, options?: { open?: boolean; readOnly?: boolean });
    prepare(sql: string): StatementSync;
    exec(sql: string): void;
    close(): void;
  }
}

