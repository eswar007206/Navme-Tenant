import type {
  AdminUser,
  AuthSession,
  CreateAdminInput,
  CreateOrganizationInput,
  OrganizationFeatures,
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

interface ChangePasswordResponse {
  success: boolean;
}

interface ListAdminsOptions {
  scope?: "all" | "active";
}

export const DEFAULT_ORGANIZATION_FEATURES = {
  search_people_enabled: true,
  search_explore_enabled: true,
  search_places_enabled: true,
  fab_snapshot_enabled: true,
  fab_logout_enabled: true,
  fab_complaint_enabled: false,
  fab_whatsapp_enabled: true,
  fab_feedback_enabled: true,
  chatbot_enabled: true,
} as const;

const ORGANIZATION_FEATURES_FALLBACK_FLOOR = "__features__";

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

function isMissingOrganizationFeaturesError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return (
    message.includes("organization_features") &&
    (message.includes("Could not find the table") ||
      message.includes("schema cache") ||
      message.includes("relation") ||
      message.includes("available through the tenant API"))
  );
}

function normalizeFeatureFlagBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return fallback;
}

function parseFallbackFeaturePoints(points: unknown): Record<string, unknown> | null {
  if (!points) return null;
  if (typeof points === "string") {
    try {
      const parsed = JSON.parse(points);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }

  if (typeof points === "object" && !Array.isArray(points)) {
    return points as Record<string, unknown>;
  }

  return null;
}

function normalizeOrganizationFeaturesRow(
  row: Record<string, unknown> | null | undefined,
  fallback?: { organizationId?: string | null; createdAt?: string | null; updatedAt?: string | null; id?: string | null },
): OrganizationFeatures | null {
  if (!row && !fallback?.organizationId) {
    return null;
  }

  const organizationId = String(
    row?.organization_id ??
      fallback?.organizationId ??
      "",
  ).trim();

  if (!organizationId) {
    return null;
  }

  const nowIso = new Date().toISOString();
  const createdAt = String(
    row?.created_at ??
      fallback?.createdAt ??
      row?.updated_at ??
      fallback?.updatedAt ??
      nowIso,
  );
  const updatedAt = String(row?.updated_at ?? fallback?.updatedAt ?? createdAt);

  return {
    id: String(row?.id ?? fallback?.id ?? `fallback:${organizationId}`),
    organization_id: organizationId,
    search_people_enabled: normalizeFeatureFlagBoolean(
      row?.search_people_enabled,
      DEFAULT_ORGANIZATION_FEATURES.search_people_enabled,
    ),
    search_explore_enabled: normalizeFeatureFlagBoolean(
      row?.search_explore_enabled,
      DEFAULT_ORGANIZATION_FEATURES.search_explore_enabled,
    ),
    search_places_enabled: normalizeFeatureFlagBoolean(
      row?.search_places_enabled,
      DEFAULT_ORGANIZATION_FEATURES.search_places_enabled,
    ),
    fab_snapshot_enabled: normalizeFeatureFlagBoolean(
      row?.fab_snapshot_enabled,
      DEFAULT_ORGANIZATION_FEATURES.fab_snapshot_enabled,
    ),
    fab_logout_enabled: normalizeFeatureFlagBoolean(
      row?.fab_logout_enabled,
      DEFAULT_ORGANIZATION_FEATURES.fab_logout_enabled,
    ),
    fab_complaint_enabled: normalizeFeatureFlagBoolean(
      row?.fab_complaint_enabled,
      DEFAULT_ORGANIZATION_FEATURES.fab_complaint_enabled,
    ),
    fab_whatsapp_enabled: normalizeFeatureFlagBoolean(
      row?.fab_whatsapp_enabled,
      DEFAULT_ORGANIZATION_FEATURES.fab_whatsapp_enabled,
    ),
    fab_feedback_enabled: normalizeFeatureFlagBoolean(
      row?.fab_feedback_enabled,
      DEFAULT_ORGANIZATION_FEATURES.fab_feedback_enabled,
    ),
    chatbot_enabled: normalizeFeatureFlagBoolean(
      row?.chatbot_enabled,
      DEFAULT_ORGANIZATION_FEATURES.chatbot_enabled,
    ),
    created_at: createdAt,
    updated_at: updatedAt,
  };
}

async function getOrganizationFeaturesFromFallback(): Promise<OrganizationFeatures | null> {
  const row = await selectSingleRow<{
    organization_id?: string;
    floor: string;
    points: unknown;
    updated_at?: string | null;
  }>({
    table: "floor_nav_paths",
    select: "organization_id, floor, points, updated_at",
    filters: [
      {
        column: "floor",
        op: "eq",
        value: ORGANIZATION_FEATURES_FALLBACK_FLOOR,
      },
    ],
  });

  const points = parseFallbackFeaturePoints(row?.points);
  return normalizeOrganizationFeaturesRow(points, {
    organizationId: row?.organization_id ?? null,
    createdAt: row?.updated_at ?? null,
    updatedAt: row?.updated_at ?? null,
    id: row?.organization_id ? `fallback:${row.organization_id}` : null,
  });
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

export async function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<boolean> {
  const payload = await apiRequest<ChangePasswordResponse>("/api/auth/change-password", {
    method: "POST",
    body: JSON.stringify({
      currentPassword,
      newPassword,
    }),
  });

  return payload.success;
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

export async function deleteOrganization(organizationId: string): Promise<Organization> {
  const payload = await apiRequest<{ organization: Organization }>(`/api/organizations/${organizationId}`, {
    method: "DELETE",
  });
  return payload.organization;
}

export async function listAdmins(options?: ListAdminsOptions): Promise<AdminUser[]> {
  const searchParams = new URLSearchParams();
  if (options?.scope) {
    searchParams.set("scope", options.scope);
  }

  const path = searchParams.size > 0 ? `/api/admins?${searchParams.toString()}` : "/api/admins";
  const payload = await apiRequest<{ admins: AdminUser[] }>(path);
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

export async function getOrganizationFeatures(): Promise<OrganizationFeatures | null> {
  try {
    const row = await selectSingleRow<Record<string, unknown>>({
      table: "organization_features",
      select: "*",
    });
    return normalizeOrganizationFeaturesRow(row);
  } catch (error) {
    if (!isMissingOrganizationFeaturesError(error)) {
      throw error;
    }
  }

  return getOrganizationFeaturesFromFallback();
}

export async function upsertOrganizationFeatures(
  updates: Partial<Omit<OrganizationFeatures, "id" | "organization_id" | "created_at" | "updated_at">>,
): Promise<OrganizationFeatures | null> {
  try {
    const rows = await upsertRows<OrganizationFeatures>(
      "organization_features",
      [updates as Record<string, unknown>],
      "organization_id",
    );

    return rows[0] ?? null;
  } catch (error) {
    if (!isMissingOrganizationFeaturesError(error)) {
      throw error;
    }
  }

  const current = await getOrganizationFeaturesFromFallback();
  const next = {
    ...DEFAULT_ORGANIZATION_FEATURES,
    ...current,
    ...updates,
  };

  const rows = await upsertRows<{
    organization_id?: string;
    floor: string;
    points: unknown;
    updated_at?: string | null;
  }>(
    "floor_nav_paths",
    [
      {
        floor: ORGANIZATION_FEATURES_FALLBACK_FLOOR,
        points: {
          search_people_enabled: next.search_people_enabled,
          search_explore_enabled: next.search_explore_enabled,
          search_places_enabled: next.search_places_enabled,
          fab_snapshot_enabled: next.fab_snapshot_enabled,
          fab_logout_enabled: next.fab_logout_enabled,
          fab_complaint_enabled: next.fab_complaint_enabled,
          fab_whatsapp_enabled: next.fab_whatsapp_enabled,
          fab_feedback_enabled: next.fab_feedback_enabled,
          chatbot_enabled: next.chatbot_enabled,
        },
      },
    ],
    "floor",
    "organization_id, floor, points, updated_at",
  );

  const row = rows[0];
  return normalizeOrganizationFeaturesRow(parseFallbackFeaturePoints(row?.points), {
    organizationId: row?.organization_id ?? current?.organization_id ?? null,
    createdAt: row?.updated_at ?? current?.created_at ?? null,
    updatedAt: row?.updated_at ?? current?.updated_at ?? null,
    id: row?.organization_id ? `fallback:${row.organization_id}` : current?.id ?? null,
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
