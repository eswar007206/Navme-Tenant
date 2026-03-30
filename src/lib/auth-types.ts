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
  is_active: boolean;
  created_at: string;
  last_used_at: string | null;
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
