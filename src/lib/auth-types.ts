export interface AdminUser {
  id: string;
  email: string;
  display_name: string;
  role: "super_admin" | "admin";
  avatar_url: string | null;
  organization_id: string | null;
  organization_name: string | null;
  organization_slug: string | null;
  created_at: string;
  updated_at: string;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface OrganizationApiKey {
  id: string;
  organization_id: string;
  name: string;
  last_four: string;
  raw_key: string | null;
  is_active: boolean;
  created_at: string;
  last_used_at: string | null;
}

export interface OrganizationFeatures {
  id: string;
  organization_id: string;
  search_people_enabled: boolean;
  search_explore_enabled: boolean;
  search_places_enabled: boolean;
  fab_snapshot_enabled: boolean;
  fab_logout_enabled: boolean;
  fab_complaint_enabled: boolean;
  fab_whatsapp_enabled: boolean;
  fab_feedback_enabled: boolean;
  chatbot_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface AuthSession {
  user: AdminUser;
  activeOrganizationId: string | null;
  activeOrganizationName: string | null;
  activeOrganizationSlug: string | null;
  loginAt: number;
}

export type AdminRole = "super_admin" | "admin";

export interface CreateOrganizationInput {
  name: string;
  slug: string;
  adminEmail: string;
  adminPassword: string;
  adminDisplayName: string;
}

export interface CreateAdminInput {
  email: string;
  password: string;
  displayName: string;
  role: AdminRole;
  organizationId?: string | null;
}

export interface QueryFilter {
  column: string;
  op: "eq" | "in";
  value: string | number | boolean | null | Array<string | number>;
}
