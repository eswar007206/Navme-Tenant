import crypto from "crypto";
import express from "express";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

for (const envFile of [".env.local", ".env"]) {
  const absolutePath = path.join(__dirname, envFile);
  try {
    process.loadEnvFile(absolutePath);
  } catch {
    // Ignore missing env files so local dev can still run with exported env vars.
  }
}

const isDev = process.argv.includes("--dev");
const port = Number(process.env.PORT || (isDev ? 8080 : 3000));
const hmrPort = Number(process.env.HMR_PORT || port + 1);
const configuredCorsOrigins = String(
  process.env.CORS_ALLOWED_ORIGINS ||
    process.env.MATTECRAFT_ALLOWED_ORIGINS ||
    "",
)
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const allowAllCorsOrigins =
  configuredCorsOrigins.includes("*") || (isDev && configuredCorsOrigins.length === 0);

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const sessionSecret =
  process.env.APP_SESSION_SECRET ||
  process.env.SESSION_SECRET ||
  "navme-local-session-secret-change-me";

const hasBackendConfig = Boolean(supabaseUrl && supabaseServiceRoleKey);
const supabaseAdmin = hasBackendConfig
  ? createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })
  : null;

if (!hasBackendConfig) {
  console.warn(
    "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. API routes will return 500 until they are configured.",
  );
}

const app = express();
app.use((request, response, next) => {
  const origin = typeof request.headers.origin === "string" ? request.headers.origin : null;
  const isAllowedOrigin =
    allowAllCorsOrigins || (origin ? configuredCorsOrigins.includes(origin) : false);

  if (origin && isAllowedOrigin) {
    response.setHeader("Access-Control-Allow-Origin", allowAllCorsOrigins ? "*" : origin);
    response.setHeader("Vary", "Origin");
    response.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, X-Navme-Api-Key, X-Active-Organization-Id, X-File-Path, X-Upsert",
    );
    response.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  }

  if (request.method === "OPTIONS") {
    response.status(204).end();
    return;
  }

  next();
});
app.use(express.json({ limit: "2mb" }));

const tenantTables = new Set([
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

const queryableTables = new Set([...tenantTables, "dashboard_admins_safe"]);
const mutableTables = new Set(tenantTables);
const ingestTables = new Set([
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
const externalQueryableTables = new Set(tenantTables);
const externalMutableTables = new Set(ingestTables);

function requireSupabase(res) {
  if (supabaseAdmin) return true;
  res.status(500).json({
    error:
      "Backend API is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
  });
  return false;
}

function base64urlEncode(value) {
  return Buffer.from(value).toString("base64url");
}

function base64urlDecode(value) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signSessionToken(payload) {
  const header = base64urlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = base64urlEncode(
    JSON.stringify({
      ...payload,
      exp: Date.now() + 24 * 60 * 60 * 1000,
    }),
  );
  const signature = crypto
    .createHmac("sha256", sessionSecret)
    .update(`${header}.${body}`)
    .digest("base64url");
  return `${header}.${body}.${signature}`;
}

function verifySessionToken(token) {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("Invalid session token.");
  }

  const [header, body, signature] = parts;
  const expected = crypto
    .createHmac("sha256", sessionSecret)
    .update(`${header}.${body}`)
    .digest();
  const received = Buffer.from(signature, "base64url");

  if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) {
    throw new Error("Invalid session signature.");
  }

  const payload = JSON.parse(base64urlDecode(body));
  if (!payload?.exp || payload.exp < Date.now()) {
    throw new Error("Session expired.");
  }
  return payload;
}

function getBearerToken(request) {
  const raw = request.headers.authorization;
  if (!raw || !raw.startsWith("Bearer ")) return null;
  return raw.slice("Bearer ".length);
}

function hashApiKey(rawKey) {
  return crypto.createHash("sha256").update(rawKey).digest("hex");
}

function isTenantTable(table) {
  return tenantTables.has(table);
}

async function requireAuth(request, response, next) {
  if (!requireSupabase(response)) return;
  const token = getBearerToken(request);
  if (!token) {
    response.status(401).json({ error: "Authentication required." });
    return;
  }

  try {
    request.auth = verifySessionToken(token);
    next();
  } catch (error) {
    response.status(401).json({
      error: error instanceof Error ? error.message : "Invalid session.",
    });
  }
}

function requireSuperAdmin(request, response, next) {
  if (request.auth?.role !== "super_admin") {
    response.status(403).json({ error: "Only super admins can perform this action." });
    return;
  }
  next();
}

function parseFilters(filters) {
  if (!Array.isArray(filters)) return [];
  return filters.filter(
    (item) =>
      item &&
      typeof item.column === "string" &&
      (item.op === "eq" || item.op === "in"),
  );
}

function applyFilters(query, filters) {
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

function scopeOnConflict(table, onConflict) {
  if (!onConflict) return onConflict;
  if (!isTenantTable(table)) return onConflict;
  if (onConflict.includes("organization_id")) return onConflict;
  return `organization_id,${onConflict}`;
}

async function resolveActiveOrganizationId(request) {
  if (!request.auth) return null;
  if (request.auth.role !== "super_admin") {
    return request.auth.organizationId ?? null;
  }

  const requested =
    typeof request.headers["x-active-organization-id"] === "string"
      ? request.headers["x-active-organization-id"]
      : request.auth.organizationId ?? null;

  if (!requested) return null;

  const { data, error } = await supabaseAdmin
    .from("organizations")
    .select("id")
    .eq("id", requested)
    .maybeSingle();

  if (error || !data) {
    throw new Error("The selected organization does not exist.");
  }
  return data.id;
}

function injectOrganizationId(table, payload, organizationId) {
  if (!isTenantTable(table)) return payload;
  return {
    ...payload,
    organization_id: organizationId,
  };
}

async function resolveOrganizationApiKey(request) {
  const rawKey = String(request.headers["x-navme-api-key"] || "").trim();
  if (!rawKey) {
    throw new Error("Provide x-navme-api-key.");
  }

  const { data, error } = await supabaseAdmin
    .from("organization_api_keys")
    .select("id, organization_id, is_active")
    .eq("api_key_hash", hashApiKey(rawKey))
    .maybeSingle();

  if (error || !data || !data.is_active) {
    throw new Error("Invalid API key.");
  }

  return data;
}

async function markOrganizationApiKeyUsed(apiKeyId) {
  await supabaseAdmin
    .from("organization_api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", apiKeyId);
}

async function fetchAdminById(adminId) {
  const { data, error } = await supabaseAdmin
    .from("dashboard_admins_safe")
    .select("*")
    .eq("id", adminId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  return data;
}

app.post("/api/auth/login", async (request, response) => {
  if (!requireSupabase(response)) return;

  const email = String(request.body?.email || "").trim();
  const password = String(request.body?.password || "");

  if (!email || !password) {
    response.status(400).json({ error: "Email and password are required." });
    return;
  }

  const { data, error } = await supabaseAdmin.rpc("verify_admin_login", {
    p_email: email,
    p_password: password,
  });

  if (error) {
    response.status(400).json({ error: error.message });
    return;
  }

  if (!data) {
    response.status(401).json({ error: "Invalid email or password." });
    return;
  }

  const user = data;
  const token = signSessionToken({
    sub: user.id,
    email: user.email,
    role: user.role,
    organizationId: user.organization_id ?? null,
  });

  response.json({ token, user });
});

app.get("/api/auth/session", requireAuth, async (request, response) => {
  try {
    const user = await fetchAdminById(request.auth.sub);
    if (!user) {
      response.status(404).json({ error: "Admin account not found." });
      return;
    }
    response.json({ user });
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : "Unable to load session." });
  }
});

app.get("/api/organizations", requireAuth, requireSuperAdmin, async (_request, response) => {
  const { data, error } = await supabaseAdmin
    .from("organizations")
    .select("id, name, slug, is_active, created_at, updated_at")
    .order("created_at", { ascending: true });

  if (error) {
    response.status(400).json({ error: error.message });
    return;
  }

  response.json({ organizations: data ?? [] });
});

app.post("/api/organizations", requireAuth, requireSuperAdmin, async (request, response) => {
  const name = String(request.body?.name || "").trim();
  const slug = String(request.body?.slug || "").trim();
  const adminDisplayName = String(request.body?.adminDisplayName || "").trim();
  const adminEmail = String(request.body?.adminEmail || "").trim();
  const adminPassword = String(request.body?.adminPassword || "");

  if (!name || !slug || !adminDisplayName || !adminEmail || adminPassword.length < 8) {
    response.status(400).json({ error: "Fill in the organization and first-admin details." });
    return;
  }

  const { data, error } = await supabaseAdmin.rpc("create_organization_with_admin", {
    p_caller_id: request.auth.sub,
    p_org_name: name,
    p_org_slug: slug,
    p_admin_email: adminEmail,
    p_admin_password: adminPassword,
    p_admin_display_name: adminDisplayName,
  });

  if (error) {
    response.status(400).json({ error: error.message });
    return;
  }

  response.json({ organization: data });
});

app.get("/api/admins", requireAuth, requireSuperAdmin, async (request, response) => {
  try {
    const scope = String(request.query?.scope || "all").trim().toLowerCase();
    let query = supabaseAdmin
      .from("dashboard_admins_safe")
      .select("*")
      .order("created_at", { ascending: true });

    if (scope === "active") {
      const organizationId = await resolveActiveOrganizationId(request);
      if (!organizationId) {
        response.json({ admins: [] });
        return;
      }
      query = query.eq("organization_id", organizationId);
    }

    const { data, error } = await query;

    if (error) {
      response.status(400).json({ error: error.message });
      return;
    }

    response.json({ admins: data ?? [] });
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : "Unable to load admins." });
  }
});

app.post("/api/admins", requireAuth, requireSuperAdmin, async (request, response) => {
  try {
    const organizationId =
      String(request.body?.organizationId || "").trim() || (await resolveActiveOrganizationId(request));
    if (!organizationId) {
      response.status(400).json({ error: "Select an organization first." });
      return;
    }

    const email = String(request.body?.email || "").trim();
    const password = String(request.body?.password || "");
    const displayName = String(request.body?.displayName || "").trim();
    const role = String(request.body?.role || "admin").trim();

    const { data, error } = await supabaseAdmin.rpc("create_admin_account", {
      p_caller_id: request.auth.sub,
      p_email: email,
      p_password: password,
      p_display_name: displayName,
      p_role: role,
      p_organization_id: organizationId,
    });

    if (error) {
      response.status(400).json({ error: error.message });
      return;
    }

    response.json({ admin: data });
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : "Unable to create admin." });
  }
});

app.delete("/api/admins/:id", requireAuth, requireSuperAdmin, async (request, response) => {
  const { error } = await supabaseAdmin.rpc("delete_admin_account", {
    p_caller_id: request.auth.sub,
    p_target_id: request.params.id,
  });

  if (error) {
    response.status(400).json({ error: error.message });
    return;
  }

  response.status(204).end();
});

app.get("/api/api-keys", requireAuth, requireSuperAdmin, async (request, response) => {
  try {
    const organizationId = await resolveActiveOrganizationId(request);
    if (!organizationId) {
      response.json({ apiKeys: [] });
      return;
    }

    const { data, error } = await supabaseAdmin
      .from("organization_api_keys")
      .select("id, organization_id, name, last_four, is_active, created_at, last_used_at")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false });

    if (error) {
      response.status(400).json({ error: error.message });
      return;
    }

    response.json({ apiKeys: data ?? [] });
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : "Unable to load API keys." });
  }
});

app.post("/api/api-keys", requireAuth, requireSuperAdmin, async (request, response) => {
  try {
    const organizationId = await resolveActiveOrganizationId(request);
    if (!organizationId) {
      response.status(400).json({ error: "Select an organization first." });
      return;
    }

    const name = String(request.body?.name || "").trim();
    if (name.length < 3) {
      response.status(400).json({ error: "Give the API key a clear label." });
      return;
    }

    const rawKey = `navme_${crypto.randomBytes(24).toString("hex")}`;
    const keyHash = hashApiKey(rawKey);

    const { data, error } = await supabaseAdmin
      .from("organization_api_keys")
      .insert({
        organization_id: organizationId,
        name,
        api_key_hash: keyHash,
        last_four: rawKey.slice(-4),
        is_active: true,
      })
      .select("id, organization_id, name, last_four, is_active, created_at, last_used_at")
      .single();

    if (error) {
      response.status(400).json({ error: error.message });
      return;
    }

    response.json({ apiKey: data, rawKey });
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : "Unable to create API key." });
  }
});

app.post("/api/query", requireAuth, async (request, response) => {
  const { table, select = "*", orderBy, ascending = true, filters, count = false, head = false, single = false, limit } =
    request.body || {};

  if (!queryableTables.has(table)) {
    response.status(400).json({ error: "This table is not available through the tenant API." });
    return;
  }

  try {
    let query = supabaseAdmin
      .from(table)
      .select(select, {
        count: count ? "exact" : undefined,
        head,
      });

    if (table === "dashboard_admins_safe") {
      const organizationId = await resolveActiveOrganizationId(request);
      if (organizationId) {
        query = query.eq("organization_id", organizationId);
      }
    } else if (isTenantTable(table)) {
      const organizationId = await resolveActiveOrganizationId(request);
      if (!organizationId) {
        response.status(400).json({ error: "Select an organization first." });
        return;
      }
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
      query = query.maybeSingle();
    }

    const { data, error, count: totalCount } = await query;

    if (error) {
      response.status(400).json({ error: error.message });
      return;
    }

    response.json({ data, count: totalCount ?? null });
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : "Unable to query data." });
  }
});

app.post("/api/mutate", requireAuth, async (request, response) => {
  const {
    table,
    operation,
    row,
    rows,
    updates,
    filters,
    onConflict,
    select = "*",
  } = request.body || {};

  if (!mutableTables.has(table)) {
    response.status(400).json({ error: "This table is read-only through the tenant API." });
    return;
  }

  try {
    const organizationId = await resolveActiveOrganizationId(request);
    if (!organizationId) {
      response.status(400).json({ error: "Select an organization first." });
      return;
    }

    if (operation === "insert") {
      const payload = injectOrganizationId(table, row || {}, organizationId);
      const { data, error } = await supabaseAdmin.from(table).insert(payload).select(select);
      if (error) {
        response.status(400).json({ error: error.message });
        return;
      }
      response.json({ data, count: null });
      return;
    }

    if (operation === "upsert") {
      const scopedRows = Array.isArray(rows)
        ? rows.map((item) => injectOrganizationId(table, item, organizationId))
        : [];
      const { data, error } = await supabaseAdmin
        .from(table)
        .upsert(scopedRows, {
          onConflict: scopeOnConflict(table, onConflict),
        })
        .select(select);

      if (error) {
        response.status(400).json({ error: error.message });
        return;
      }
      response.json({ data, count: null });
      return;
    }

    const safeFilters = parseFilters(filters);
    if (safeFilters.length === 0) {
      response.status(400).json({ error: "Updates and deletes require at least one filter." });
      return;
    }

    if (operation === "update") {
      let query = supabaseAdmin.from(table).update(updates || {}).eq("organization_id", organizationId);
      query = applyFilters(query, safeFilters).select(select);
      const { data, error } = await query;
      if (error) {
        response.status(400).json({ error: error.message });
        return;
      }
      response.json({ data, count: null });
      return;
    }

    if (operation === "delete") {
      let query = supabaseAdmin.from(table).delete().eq("organization_id", organizationId);
      query = applyFilters(query, safeFilters);
      const { error } = await query;
      if (error) {
        response.status(400).json({ error: error.message });
        return;
      }
      response.status(204).end();
      return;
    }

    response.status(400).json({ error: "Unsupported mutation operation." });
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : "Unable to mutate data." });
  }
});

app.post("/api/external/query/:table", async (request, response) => {
  if (!requireSupabase(response)) return;

  const table = request.params.table;
  if (!externalQueryableTables.has(table)) {
    response.status(400).json({ error: "This table is not available through the organization API." });
    return;
  }

  const {
    select = "*",
    orderBy,
    ascending = true,
    filters,
    count = false,
    head = false,
    single = false,
    limit,
  } = request.body || {};

  try {
    const apiKey = await resolveOrganizationApiKey(request);
    let query = supabaseAdmin
      .from(table)
      .select(select, {
        count: count ? "exact" : undefined,
        head,
      })
      .eq("organization_id", apiKey.organization_id);

    query = applyFilters(query, filters);

    if (orderBy) {
      query = query.order(orderBy, { ascending });
    }
    if (typeof limit === "number" && Number.isFinite(limit)) {
      query = query.limit(limit);
    }
    if (single) {
      query = query.maybeSingle();
    }

    const { data, error, count: totalCount } = await query;

    if (error) {
      response.status(400).json({ error: error.message });
      return;
    }

    await markOrganizationApiKeyUsed(apiKey.id);
    response.json({ data, count: totalCount ?? null });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to query organization data.";
    const status = message === "Provide x-navme-api-key." || message === "Invalid API key." ? 401 : 400;
    response.status(status).json({ error: message });
  }
});

async function handleOrganizationApiMutation(request, response) {
  if (!requireSupabase(response)) return;

  const table = request.params.table;
  if (!externalMutableTables.has(table)) {
    response.status(400).json({ error: "This table is not writable through the organization API." });
    return;
  }

  try {
    const apiKey = await resolveOrganizationApiKey(request);
    const organizationId = apiKey.organization_id;
    const operation = String(request.body?.operation || "insert");
    const select = String(request.body?.select || "*");

    if (operation === "insert") {
      const row = injectOrganizationId(table, request.body?.row || {}, organizationId);
      const { data, error } = await supabaseAdmin.from(table).insert(row).select(select);
      if (error) {
        response.status(400).json({ error: error.message });
        return;
      }
      await markOrganizationApiKeyUsed(apiKey.id);
      response.json({ data });
      return;
    }

    if (operation === "upsert") {
      const rows = Array.isArray(request.body?.rows) ? request.body.rows : [];
      const scopedRows = rows.map((item) => injectOrganizationId(table, item, organizationId));
      const { data, error } = await supabaseAdmin
        .from(table)
        .upsert(scopedRows, {
          onConflict: scopeOnConflict(table, request.body?.onConflict),
        })
        .select(select);
      if (error) {
        response.status(400).json({ error: error.message });
        return;
      }
      await markOrganizationApiKeyUsed(apiKey.id);
      response.json({ data });
      return;
    }

    if (operation === "update") {
      const safeFilters = parseFilters(request.body?.filters);
      if (safeFilters.length === 0) {
        response.status(400).json({ error: "Organization API updates require at least one filter." });
        return;
      }

      let query = supabaseAdmin.from(table).update(request.body?.updates || {}).eq("organization_id", organizationId);
      query = applyFilters(query, safeFilters).select(select);
      const { data, error } = await query;
      if (error) {
        response.status(400).json({ error: error.message });
        return;
      }
      await markOrganizationApiKeyUsed(apiKey.id);
      response.json({ data });
      return;
    }

    response.status(400).json({ error: "Unsupported organization API operation." });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to write organization data.";
    const status = message === "Provide x-navme-api-key." || message === "Invalid API key." ? 401 : 400;
    response.status(status).json({ error: message });
  }
}

app.post("/api/external/mutate/:table", handleOrganizationApiMutation);
app.post("/api/ingest/:table", handleOrganizationApiMutation);
app.post(
  "/api/external/storage/:bucket",
  express.raw({ type: "*/*", limit: "15mb" }),
  async (request, response) => {
    if (!requireSupabase(response)) return;

    const bucket = request.params.bucket;
    const rawPath = String(request.headers["x-file-path"] || "").trim().replace(/^\/+/, "");
    const upsert = String(request.headers["x-upsert"] || "false").toLowerCase() === "true";
    const contentType = String(request.headers["content-type"] || "application/octet-stream");

    if (!bucket || !rawPath) {
      response.status(400).json({ error: "Provide a bucket and x-file-path header." });
      return;
    }

    if (!Buffer.isBuffer(request.body) || request.body.length === 0) {
      response.status(400).json({ error: "Upload body is empty." });
      return;
    }

    try {
      const apiKey = await resolveOrganizationApiKey(request);
      const scopedPath = `${apiKey.organization_id}/${rawPath}`;

      const { error } = await supabaseAdmin.storage
        .from(bucket)
        .upload(scopedPath, request.body, {
          contentType,
          upsert,
        });

      if (error) {
        response.status(400).json({ error: error.message });
        return;
      }

      const { data: publicUrlData } = supabaseAdmin.storage.from(bucket).getPublicUrl(scopedPath);
      await markOrganizationApiKeyUsed(apiKey.id);

      response.json({
        data: {
          path: scopedPath,
          publicUrl: publicUrlData.publicUrl,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to upload file.";
      const status = message === "Provide x-navme-api-key." || message === "Invalid API key." ? 401 : 400;
      response.status(status).json({ error: message });
    }
  },
);

async function start() {
  if (isDev) {
    const { createServer } = await import("vite");
    const vite = await createServer({
      root: __dirname,
      server: {
        middlewareMode: true,
        hmr: {
          port: hmrPort,
          clientPort: hmrPort,
        },
      },
      appType: "spa",
    });

    app.use(vite.middlewares);
    app.use(async (request, response, next) => {
      try {
        const templatePath = path.join(__dirname, "index.html");
        const template = await fs.readFile(templatePath, "utf8");
        const html = await vite.transformIndexHtml(request.originalUrl, template);
        response.status(200).set({ "Content-Type": "text/html" }).end(html);
      } catch (error) {
        next(error);
      }
    });
  } else {
    const distPath = path.join(__dirname, "dist");
    app.use(express.static(distPath));
    app.use((_request, response) => {
      response.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
  });
}

start().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
