import { createClient } from "@supabase/supabase-js";
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

const DEFAULT_SUPABASE_URL = "https://vfpgtifzqznfdtecmpsc.supabase.co";
const DEFAULT_SUPABASE_PUBLISHABLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZmcGd0aWZ6cXpuZmR0ZWNtcHNjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5OTgyMjgsImV4cCI6MjA4NzU3NDIyOH0.GIRe4b0UzY8znx-Rnd-YYYMNRVkv6WIJanmNEPNFF-k";

const SUPABASE_URL =
  String(import.meta.env.VITE_SUPABASE_URL ?? "").trim() || DEFAULT_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY =
  String(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "").trim() ||
  DEFAULT_SUPABASE_PUBLISHABLE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

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

export interface StoredAuthSession extends AuthSession {
  token: string;
}

export interface MattercraftConnectionDetails {
  supabaseUrl: string;
  supabasePublishableKey: string;
  organizationId: string | null;
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

const TENANT_TABLES = new Set([
  "organization_features",
  "ar_ropin_pois",
  "ar_ropin_users",
  "ar_ropin_navnode",
  "ar_ropin_saved_places",
  "ar_ropin_connections",
  "ar_ropin_feedback",
  "ar_electronic_assets",
  "ar_complaints",
  "ar_snapshots",
  "ar_office_gate_entries",
  "ar_nav_popups",
  "ar_nav_matrices",
  "ar_nav_matrix_items",
  "access_control_zones",
  "emergency_state",
  "emergency_stuck_reports",
  "emergency_checkins",
  "emergency_responses",
  "ar_rooms",
  "ar_ropin_buildings",
  "ar_ropin_floors",
  "ar_ropin_zones",
  "ar_ropin_entries",
  "floor_nav_paths",
]);

const QUERYABLE_TABLES = new Set([...TENANT_TABLES, "dashboard_admins_safe", "organizations"]);
const MUTABLE_TABLES = new Set(TENANT_TABLES);

const ORGANIZATION_DELETE_TABLE_ORDER = [
  "ar_ropin_connections",
  "ar_ropin_feedback",
  "ar_complaints",
  "ar_snapshots",
  "ar_office_gate_entries",
  "ar_nav_matrix_items",
  "ar_nav_matrices",
  "ar_nav_popups",
  "emergency_checkins",
  "emergency_responses",
  "emergency_stuck_reports",
  "emergency_state",
  "access_control_zones",
  "ar_electronic_assets",
  "ar_ropin_saved_places",
  "ar_ropin_navnode",
  "ar_ropin_users",
  "ar_rooms",
  "ar_ropin_entries",
  "ar_ropin_pois",
  "ar_ropin_zones",
  "ar_ropin_floors",
  "ar_ropin_buildings",
  "floor_nav_paths",
  "organization_features",
];

function isTenantTable(table: string): boolean {
  return TENANT_TABLES.has(table);
}

function scopeOnConflict(table: string, onConflict?: string): string | undefined {
  if (!onConflict) return onConflict;
  if (!isTenantTable(table)) return onConflict;
  if (onConflict.includes("organization_id")) return onConflict;
  return `organization_id,${onConflict}`;
}

function parseFilters(filters?: QueryFilter[]): QueryFilter[] {
  if (!Array.isArray(filters)) return [];
  return filters.filter(
    (filter) =>
      filter &&
      typeof filter.column === "string" &&
      (filter.op === "eq" || filter.op === "in"),
  );
}

type FilterableBuilder<TBuilder> = {
  eq: (column: string, value: unknown) => TBuilder;
  in: (column: string, values: Array<string | number>) => TBuilder;
};

function applyFilters<TBuilder extends FilterableBuilder<TBuilder>>(
  query: TBuilder,
  filters?: QueryFilter[],
): TBuilder {
  return parseFilters(filters).reduce((builder, filter) => {
    if (filter.op === "eq") {
      return builder.eq(filter.column, filter.value);
    }
    if (filter.op === "in" && Array.isArray(filter.value)) {
      return builder.in(filter.column, filter.value);
    }
    return builder;
  }, query);
}

function injectOrganizationId(
  table: string,
  payload: Record<string, unknown>,
  organizationId: string,
): Record<string, unknown> {
  if (!isTenantTable(table)) return payload;
  return {
    ...payload,
    organization_id: organizationId,
  };
}

function normalizeOrganizationId(value: string | null | undefined): string | null {
  const trimmed = String(value ?? "").trim();
  return trimmed || null;
}

function getStoredOrganizationId(required = false): string | null {
  const session = readStoredSession();
  const organizationId =
    normalizeOrganizationId(session?.activeOrganizationId) ??
    normalizeOrganizationId(session?.user.organization_id) ??
    null;

  if (!organizationId && required) {
    throw new Error("Select an organization first.");
  }

  return organizationId;
}

function getStoredUserId(): string {
  const userId = normalizeOrganizationId(readStoredSession()?.user.id);
  if (!userId) {
    throw new Error("Your dashboard session expired. Please sign in again.");
  }
  return userId;
}

function isMissingRelationError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return (
    message.includes("Could not find the table") ||
    message.includes("schema cache") ||
    message.includes("relation") ||
    message.includes("does not exist")
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
  fallback?: {
    organizationId?: string | null;
    createdAt?: string | null;
    updatedAt?: string | null;
    id?: string | null;
  },
): OrganizationFeatures | null {
  if (!row && !fallback?.organizationId) {
    return null;
  }

  const organizationId = String(row?.organization_id ?? fallback?.organizationId ?? "").trim();
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

export function getMattercraftConnectionDetails(
  organizationId: string | null,
): MattercraftConnectionDetails {
  return {
    supabaseUrl: SUPABASE_URL,
    supabasePublishableKey: SUPABASE_PUBLISHABLE_KEY,
    organizationId,
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

export async function loginWithPassword(
  email: string,
  password: string,
): Promise<LoginResponse> {
  const { data, error } = await supabase.rpc("verify_admin_login", {
    p_email: email,
    p_password: password,
  });

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error("Invalid email or password.");
  }

  return {
    token: `direct:${String((data as AdminUser).id ?? "")}`,
    user: data as AdminUser,
  };
}

export async function fetchSessionUser(): Promise<AdminUser> {
  const adminId = getStoredUserId();
  const { data, error } = await supabase
    .from("dashboard_admins_safe")
    .select("*")
    .eq("id", adminId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error("Admin account not found.");
  }

  return data as AdminUser;
}

export async function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<boolean> {
  const adminId = getStoredUserId();
  const { data, error } = await supabase.rpc("change_admin_password", {
    p_admin_id: adminId,
    p_current_password: currentPassword,
    p_new_password: newPassword,
  });

  if (error) {
    const message = error.message.includes("change_admin_password")
      ? "Apply the latest Supabase migration before using password changes."
      : error.message;
    throw new Error(message);
  }

  return Boolean((data as ChangePasswordResponse | boolean | null) ?? true);
}

export async function listOrganizations(): Promise<Organization[]> {
  const { data, error } = await supabase
    .from("organizations")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as Organization[];
}

export async function createOrganization(
  input: CreateOrganizationInput,
): Promise<Organization> {
  const callerId = getStoredUserId();
  const { data, error } = await supabase.rpc("create_organization_with_admin", {
    p_caller_id: callerId,
    p_org_name: input.name,
    p_org_slug: input.slug,
    p_admin_email: input.adminEmail,
    p_admin_password: input.adminPassword,
    p_admin_display_name: input.adminDisplayName,
  });

  if (error) {
    throw new Error(error.message);
  }

  return data as Organization;
}

async function deleteOrganizationSnapshotFiles(organizationId: string): Promise<void> {
  try {
    const { data, error } = await supabase
      .from("ar_snapshots")
      .select("image_path")
      .eq("organization_id", organizationId);

    if (error || !Array.isArray(data) || data.length === 0) {
      return;
    }

    const paths = data
      .map((row) => String((row as { image_path?: unknown }).image_path ?? "").trim())
      .filter(Boolean);

    if (paths.length === 0) {
      return;
    }

    await supabase.storage.from("snapshots").remove(paths);
  } catch {
    // Best-effort cleanup only.
  }
}

async function deleteOrganizationScopedRows(
  table: string,
  organizationId: string,
): Promise<void> {
  const { error } = await supabase.from(table).delete().eq("organization_id", organizationId);
  if (error && !isMissingRelationError(error)) {
    throw new Error(`Unable to remove ${table}: ${error.message}`);
  }
}

export async function deleteOrganization(
  organizationId: string,
): Promise<Organization> {
  const { data: organization, error: organizationError } = await supabase
    .from("organizations")
    .select("*")
    .eq("id", organizationId)
    .maybeSingle();

  if (organizationError) {
    throw new Error(organizationError.message);
  }

  if (!organization) {
    throw new Error("That client could not be found.");
  }

  await deleteOrganizationSnapshotFiles(organizationId);

  for (const table of ORGANIZATION_DELETE_TABLE_ORDER) {
    await deleteOrganizationScopedRows(table, organizationId);
  }

  const { error: deleteAdminsError } = await supabase
    .from("dashboard_admins")
    .delete()
    .eq("organization_id", organizationId);

  if (deleteAdminsError && !isMissingRelationError(deleteAdminsError)) {
    throw new Error(deleteAdminsError.message);
  }

  const { error: deleteOrganizationError } = await supabase
    .from("organizations")
    .delete()
    .eq("id", organizationId);

  if (deleteOrganizationError) {
    throw new Error(deleteOrganizationError.message);
  }

  return organization as Organization;
}

export async function listAdmins(options?: ListAdminsOptions): Promise<AdminUser[]> {
  let query = supabase
    .from("dashboard_admins_safe")
    .select("*")
    .order("created_at", { ascending: true });

  if (options?.scope === "active") {
    const organizationId = getStoredOrganizationId(true);
    query = query.eq("organization_id", organizationId);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as AdminUser[];
}

export async function createAdmin(input: CreateAdminInput): Promise<AdminUser> {
  const callerId = getStoredUserId();
  const organizationId =
    normalizeOrganizationId(input.organizationId) ?? getStoredOrganizationId(true);

  const { data, error } = await supabase.rpc("create_admin_account", {
    p_caller_id: callerId,
    p_email: input.email,
    p_password: input.password,
    p_display_name: input.displayName,
    p_role: input.role,
    p_organization_id: organizationId,
  });

  if (error) {
    throw new Error(error.message);
  }

  return data as AdminUser;
}

export async function deleteAdmin(adminId: string): Promise<void> {
  const callerId = getStoredUserId();
  const { error } = await supabase.rpc("delete_admin_account", {
    p_caller_id: callerId,
    p_target_id: adminId,
  });

  if (error) {
    throw new Error(error.message);
  }
}

export async function listOrganizationApiKeys(): Promise<OrganizationApiKey[]> {
  const organizationId = getStoredOrganizationId(true);
  const { data, error } = await supabase
    .from("organization_api_keys")
    .select("id, organization_id, name, last_four, is_active, created_at, last_used_at")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });

  if (error) {
    if (isMissingRelationError(error)) {
      return [];
    }
    throw new Error(error.message);
  }

  return ((data ?? []) as OrganizationApiKey[]).map((apiKey) => ({
    ...apiKey,
    raw_key: null,
  }));
}

export async function createOrganizationApiKey(): Promise<{
  apiKey: OrganizationApiKey;
  rawKey: string;
}> {
  throw new Error(
    "Organization API keys are retired in the direct Supabase architecture.",
  );
}

export async function getOrganizationFeatures(): Promise<OrganizationFeatures | null> {
  try {
    const row = await selectSingleRow<Record<string, unknown>>({
      table: "organization_features",
      select: "*",
    });
    return normalizeOrganizationFeaturesRow(row);
  } catch (error) {
    if (!isMissingRelationError(error)) {
      throw error;
    }
  }

  return getOrganizationFeaturesFromFallback();
}

export async function upsertOrganizationFeatures(
  updates: Partial<
    Omit<OrganizationFeatures, "id" | "organization_id" | "created_at" | "updated_at">
  >,
): Promise<OrganizationFeatures | null> {
  try {
    const rows = await upsertRows<OrganizationFeatures>(
      "organization_features",
      [updates as Record<string, unknown>],
      "organization_id",
    );

    return rows[0] ?? null;
  } catch (error) {
    if (!isMissingRelationError(error)) {
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
    "organization_id,floor",
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

export async function queryTable<T>(
  request: QueryRequest,
): Promise<QueryResponse<T>> {
  const {
    table,
    select = "*",
    orderBy,
    ascending = true,
    filters,
    count = false,
    head = false,
    single = false,
    limit,
  } = request;

  if (!QUERYABLE_TABLES.has(table)) {
    throw new Error("This table is not available through the dashboard client.");
  }

  let query = supabase.from(table).select(select, {
    count: count ? "exact" : undefined,
    head,
  });

  if (table === "dashboard_admins_safe") {
    const organizationId = getStoredOrganizationId(false);
    if (organizationId) {
      query = query.eq("organization_id", organizationId);
    }
  } else if (isTenantTable(table)) {
    const organizationId = getStoredOrganizationId(true);
    query = query.eq("organization_id", organizationId);
  }

  query = applyFilters(query, filters);

  if (orderBy) {
    query = query.order(orderBy, { ascending });
  }

  if (typeof limit === "number" && Number.isFinite(limit)) {
    query = query.limit(limit);
  }

  if (single) {
    const { data, error, count: totalCount } = await query.maybeSingle();
    if (error) {
      throw new Error(error.message);
    }
    return {
      data: (data ?? null) as T,
      count: totalCount ?? null,
    };
  }

  const { data, error, count: totalCount } = await query;
  if (error) {
    throw new Error(error.message);
  }

  return {
    data: ((data ?? (head ? null : [])) as unknown) as T,
    count: totalCount ?? null,
  };
}

export async function mutateTable<T>(
  request: MutationRequest,
): Promise<QueryResponse<T>> {
  const {
    table,
    operation,
    row,
    rows,
    updates,
    filters,
    onConflict,
    select = "*",
  } = request;

  if (!MUTABLE_TABLES.has(table)) {
    throw new Error("This table is read-only through the dashboard client.");
  }

  const organizationId = getStoredOrganizationId(true);

  if (operation === "insert") {
    const payload = injectOrganizationId(table, row ?? {}, organizationId);
    const { data, error } = await supabase.from(table).insert(payload).select(select);
    if (error) {
      throw new Error(error.message);
    }
    return { data: (data ?? []) as T, count: null };
  }

  if (operation === "upsert") {
    const scopedRows = Array.isArray(rows)
      ? rows.map((item) => injectOrganizationId(table, item, organizationId))
      : [];
    const { data, error } = await supabase
      .from(table)
      .upsert(scopedRows, {
        onConflict: scopeOnConflict(table, onConflict),
      })
      .select(select);

    if (error) {
      throw new Error(error.message);
    }

    return { data: (data ?? []) as T, count: null };
  }

  const safeFilters = parseFilters(filters);
  if (safeFilters.length === 0) {
    throw new Error("Updates and deletes require at least one filter.");
  }

  if (operation === "update") {
    let query = supabase.from(table).update(updates ?? {}).eq("organization_id", organizationId);
    query = applyFilters(query, safeFilters).select(select);
    const { data, error } = await query;
    if (error) {
      throw new Error(error.message);
    }
    return { data: (data ?? []) as T, count: null };
  }

  if (operation === "delete") {
    let query = supabase.from(table).delete().eq("organization_id", organizationId);
    query = applyFilters(query, safeFilters);
    const { error } = await query;
    if (error) {
      throw new Error(error.message);
    }
    return { data: null as T, count: null };
  }

  throw new Error("Unsupported mutation operation.");
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
