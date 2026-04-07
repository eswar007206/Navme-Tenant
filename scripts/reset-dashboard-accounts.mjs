import path from "node:path";
import bcrypt from "bcryptjs";
import { createClient } from "@supabase/supabase-js";

process.loadEnvFile(path.resolve(".env"));

const email = process.env.NAVME_SUPER_ADMIN_EMAIL || "superadmin@navme";
const password = process.env.NAVME_SUPER_ADMIN_PASSWORD || "12345678";
const displayName = process.env.NAVME_SUPER_ADMIN_DISPLAY_NAME || "NavMe Super Admin";

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  },
);

async function run() {
  const [apiKeysBefore, adminsBefore] = await Promise.all([
    supabase
      .from("organization_api_keys")
      .select("id", { count: "exact", head: true }),
    supabase
      .from("dashboard_admins")
      .select("id", { count: "exact", head: true }),
  ]);

  if (apiKeysBefore.error) throw apiKeysBefore.error;
  if (adminsBefore.error) throw adminsBefore.error;

  const { error: deleteApiKeysError } = await supabase
    .from("organization_api_keys")
    .delete()
    .not("id", "is", null);
  if (deleteApiKeysError) throw deleteApiKeysError;

  const { error: deleteAdminsError } = await supabase
    .from("dashboard_admins")
    .delete()
    .not("id", "is", null);
  if (deleteAdminsError) throw deleteAdminsError;

  const bootstrapEmail = `bootstrap-superadmin-${Date.now()}@navme.local`;
  const bootstrapPasswordHash = bcrypt.hashSync(`bootstrap-${Date.now()}`, 10);

  const { data: bootstrapAdmin, error: bootstrapAdminError } = await supabase
    .from("dashboard_admins")
    .insert({
      email: bootstrapEmail,
      password_hash: bootstrapPasswordHash,
      display_name: "Bootstrap Super Admin",
      role: "super_admin",
      organization_id: null,
    })
    .select("id, email, display_name, role, organization_id, created_at")
    .single();
  if (bootstrapAdminError) throw bootstrapAdminError;

  const { data: createdSuperAdmin, error: createdSuperAdminError } = await supabase.rpc(
    "create_admin_account",
    {
      p_caller_id: bootstrapAdmin.id,
      p_email: email.toLowerCase(),
      p_password: password,
      p_display_name: displayName,
      p_role: "super_admin",
      p_organization_id: null,
    },
  );
  if (createdSuperAdminError) throw createdSuperAdminError;

  const { error: deleteBootstrapError } = await supabase
    .from("dashboard_admins")
    .delete()
    .eq("id", bootstrapAdmin.id);
  if (deleteBootstrapError) throw deleteBootstrapError;

  const [finalAdmins, loginCheck] = await Promise.all([
    supabase
      .from("dashboard_admins_safe")
      .select("id, email, display_name, role, organization_id, created_at")
      .order("created_at", { ascending: true }),
    supabase.rpc("verify_admin_login", {
      p_email: email.toLowerCase(),
      p_password: password,
    }),
  ]);
  if (finalAdmins.error) throw finalAdmins.error;
  if (loginCheck.error) throw loginCheck.error;
  if (!loginCheck.data) {
    throw new Error("Super admin login verification failed after reset.");
  }

  console.log(
    JSON.stringify(
      {
        deletedApiKeys: apiKeysBefore.count ?? 0,
        deletedAdmins: adminsBefore.count ?? 0,
        createdSuperAdmin,
        finalAdmins: finalAdmins.data,
        loginVerified: true,
        credentials: {
          email,
          password,
        },
      },
      null,
      2,
    ),
  );
}

await run();
