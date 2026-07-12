export const VERSION: string;

export function normalizeOptions(input?: Record<string, unknown>): Record<string, unknown>;
export function optionsFromEnv(env?: Record<string, string | undefined>): Record<string, unknown>;
export function describePublicOptions(options?: Record<string, unknown>): Record<string, unknown>;

export function createDdysClient(options?: Record<string, unknown>, runtime?: Record<string, unknown>): Record<string, unknown>;
export function createWebDavHandler(options?: Record<string, unknown>, runtime?: Record<string, unknown>): (request: Request) => Promise<Response>;
export function createFetchHandler(options?: Record<string, unknown>, runtime?: Record<string, unknown>): (request: Request) => Promise<Response>;
export function startNodeServer(options?: Record<string, unknown>, runtime?: Record<string, unknown>): Promise<Record<string, unknown>>;
export function exportLibrary(options?: Record<string, unknown>, runtime?: Record<string, unknown>): Promise<Record<string, unknown>>;
export function syncLibrary(options?: Record<string, unknown>, runtime?: Record<string, unknown>): Promise<Record<string, unknown>>;
