import type {
  AdminUser,
  AuthSession,
  CreateAdminInput,
  CreateOrganizationInput,
  Organization,
  OrganizationApiKey,
  QueryFilter,
} from "@/lib/auth-types";

export const AUTH_STORAGE_KEY = "navme-admin-api-session";

interface ApiErrorPayload {
  error?: string;
}

interface QueryRequest {
  table: string;
  select?: string;
  orderBy?: string;
  ascending?: boolean;
  filters?: QueryFilter[];
  count?: boolean;
  head?: boolean;
  single?: boolean;
  limit?: number;
}

interface MutationRequest {
  table: string;
  operation: "insert" | "update" | "delete" | "upsert";
  row?: Record<string, unknown>;
  rows?: Record<string, unknown>[];
  updates?: Record<string, unknown>;
  filters?: QueryFilter[];
  onConflict?: string;
  select?: string;
}

interface QueryResponse<T> {
  data: T;
  count?: number | null;
}

interface LoginResponse {
  token: string;
  user: AdminUser;
}

export interface StoredAuthSession extends AuthSession {
  token: string;
}

function buildHeaders(includeJson = true): HeadersInit {
  const headers: Record<string, string> = {};
  if (includeJson) {
    headers["Content-Type"] = "application/json";
  }

  const session = readStoredSession();
  if (session?.token) {
    headers.Authorization = `Bearer ${session.token}`;
  }
  if (session?.activeOrganizationId) {
    headers["X-Active-Organization-Id"] = session.activeOrganizationId;
  }

  return headers;
}

export function readStoredSession(): StoredAuthSession | null {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StoredAuthSession;
  } catch {
    return null;
  }
}

export function writeStoredSession(session: StoredAuthSession | null) {
  if (!session) {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    return;
  }
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as ApiErrorPayload;
    if (payload?.error) return payload.error;
  } catch {
    // Ignore invalid JSON error bodies.
  }
  return `Request failed with status ${response.status}`;
}

async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    credentials: "same-origin",
    ...init,
    headers: {
      ...buildHeaders(!(init.body instanceof FormData)),
      ...(init.headers ?? {}),
    },
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export async function loginWithPassword(email: string, password: string): Promise<LoginResponse> {
  return apiRequest<LoginResponse>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export async function fetchSessionUser(): Promise<AdminUser> {
  const payload = await apiRequest<{ user: AdminUser }>("/api/auth/session");
  return payload.user;
}

export async function listOrganizations(): Promise<Organization[]> {
  const payload = await apiRequest<{ organizations: Organization[] }>("/api/organizations");
  return payload.organizations;
}

export async function createOrganization(input: CreateOrganizationInput): Promise<Organization> {
  const payload = await apiRequest<{ organization: Organization }>("/api/organizations", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return payload.organization;
}

export async function listAdmins(): Promise<AdminUser[]> {
  const payload = await apiRequest<{ admins: AdminUser[] }>("/api/admins");
  return payload.admins;
}

export async function createAdmin(input: CreateAdminInput): Promise<AdminUser> {
  const payload = await apiRequest<{ admin: AdminUser }>("/api/admins", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return payload.admin;
}

export async function deleteAdmin(adminId: string): Promise<void> {
  await apiRequest(`/api/admins/${adminId}`, {
    method: "DELETE",
  });
}

export async function listOrganizationApiKeys(): Promise<OrganizationApiKey[]> {
  const payload = await apiRequest<{ apiKeys: OrganizationApiKey[] }>("/api/api-keys");
  return payload.apiKeys;
}

export async function createOrganizationApiKey(name: string): Promise<{ apiKey: OrganizationApiKey; rawKey: string }> {
  return apiRequest<{ apiKey: OrganizationApiKey; rawKey: string }>("/api/api-keys", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export async function queryTable<T>(request: QueryRequest): Promise<QueryResponse<T>> {
  return apiRequest<QueryResponse<T>>("/api/query", {
    method: "POST",
    body: JSON.stringify(request),
  });
}

export async function mutateTable<T>(request: MutationRequest): Promise<QueryResponse<T>> {
  return apiRequest<QueryResponse<T>>("/api/mutate", {
    method: "POST",
    body: JSON.stringify(request),
  });
}

export async function selectRows<T>(request: QueryRequest): Promise<T[]> {
  const payload = await queryTable<T[]>(request);
  return payload.data ?? [];
}

export async function selectSingleRow<T>(request: QueryRequest): Promise<T | null> {
  const payload = await queryTable<T | null>({ ...request, single: true });
  return payload.data ?? null;
}

export async function countRows(request: QueryRequest): Promise<number> {
  const payload = await queryTable<null>({
    ...request,
    count: true,
    head: true,
  });
  return payload.count ?? 0;
}

export async function insertRow<T>(
  table: string,
  row: Record<string, unknown>,
  select = "*",
): Promise<T[]> {
  const payload = await mutateTable<T[]>({
    table,
    operation: "insert",
    row,
    select,
  });
  return payload.data ?? [];
}

export async function updateRows<T>(
  table: string,
  updates: Record<string, unknown>,
  filters: QueryFilter[],
  select = "*",
): Promise<T[]> {
  const payload = await mutateTable<T[]>({
    table,
    operation: "update",
    updates,
    filters,
    select,
  });
  return payload.data ?? [];
}

export async function deleteRows(
  table: string,
  filters: QueryFilter[],
): Promise<void> {
  await mutateTable<null>({
    table,
    operation: "delete",
    filters,
  });
}

export async function upsertRows<T>(
  table: string,
  rows: Record<string, unknown>[],
  onConflict: string,
  select = "*",
): Promise<T[]> {
  const payload = await mutateTable<T[]>({
    table,
    operation: "upsert",
    rows,
    onConflict,
    select,
  });
  return payload.data ?? [];
}
