import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  LuUserCog as UserCog,
  LuPlus as Plus,
  LuTrash2 as Trash2,
  LuKeyRound as KeyRound,
  LuCopy as Copy,
  LuLoaderCircle as Loader2,
  LuCheck as Check,
  LuX as X,
} from "react-icons/lu";
import { format } from "date-fns";
import {
  createAdmin,
  createOrganization,
  createOrganizationApiKey,
  deleteAdmin,
  listAdmins,
  listOrganizationApiKeys,
  listOrganizations,
} from "@/lib/api-client";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/dashboard/PageHeader";
import type {
  AdminRole,
  AdminUser,
  Organization,
  OrganizationApiKey,
} from "@/lib/auth-types";

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function getInitials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export default function AdminManagement() {
  const queryClient = useQueryClient();
  const {
    activeOrganizationId,
    activeOrganizationName,
    setActiveOrganization,
    user,
  } = useAuth();

  const [showOrgDialog, setShowOrgDialog] = useState(false);
  const [showAdminDialog, setShowAdminDialog] = useState(false);
  const [orgName, setOrgName] = useState("");
  const [orgSlug, setOrgSlug] = useState("");
  const [orgAdminName, setOrgAdminName] = useState("");
  const [orgAdminEmail, setOrgAdminEmail] = useState("");
  const [orgAdminPassword, setOrgAdminPassword] = useState("");
  const [adminName, setAdminName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [adminRole, setAdminRole] = useState<AdminRole>("admin");
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null);
  const [apiKeyName, setApiKeyName] = useState("");
  const [revealedApiKey, setRevealedApiKey] = useState<{ rawKey: string; name: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const { data: organizations = [], isLoading: orgLoading } = useQuery({
    queryKey: ["organizations"],
    queryFn: listOrganizations,
  });

  const { data: admins = [], isLoading: adminsLoading } = useQuery({
    queryKey: ["admin-list", activeOrganizationId],
    queryFn: listAdmins,
    enabled: !!activeOrganizationId,
  });

  const { data: apiKeys = [], isLoading: apiKeysLoading } = useQuery({
    queryKey: ["organization-api-keys", activeOrganizationId],
    queryFn: listOrganizationApiKeys,
    enabled: !!activeOrganizationId,
  });

  useEffect(() => {
    if (!activeOrganizationId && organizations.length > 0) {
      const fallback = organizations.find((item) => item.id === user?.organization_id) ?? organizations[0];
      setActiveOrganization({
        id: fallback.id,
        name: fallback.name,
        slug: fallback.slug,
      });
    }
  }, [activeOrganizationId, organizations, setActiveOrganization, user?.organization_id]);

  const createOrganizationMutation = useMutation({
    mutationFn: async () => {
      return createOrganization({
        name: orgName.trim(),
        slug: orgSlug.trim(),
        adminDisplayName: orgAdminName.trim(),
        adminEmail: orgAdminEmail.trim(),
        adminPassword: orgAdminPassword,
      });
    },
    onSuccess: async (organization) => {
      await queryClient.invalidateQueries({ queryKey: ["organizations"] });
      setActiveOrganization({
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
      });
      setShowOrgDialog(false);
      setOrgName("");
      setOrgSlug("");
      setOrgAdminName("");
      setOrgAdminEmail("");
      setOrgAdminPassword("");
      queryClient.clear();
    },
  });

  const createAdminMutation = useMutation({
    mutationFn: async () => {
      return createAdmin({
        email: adminEmail.trim(),
        password: adminPassword,
        displayName: adminName.trim(),
        role: adminRole,
        organizationId: activeOrganizationId,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin-list", activeOrganizationId] });
      setShowAdminDialog(false);
      setAdminName("");
      setAdminEmail("");
      setAdminPassword("");
      setAdminRole("admin");
    },
  });

  const deleteAdminMutation = useMutation({
    mutationFn: async (adminId: string) => deleteAdmin(adminId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin-list", activeOrganizationId] });
      setDeleteTarget(null);
    },
  });

  const createApiKeyMutation = useMutation({
    mutationFn: async () => createOrganizationApiKey(apiKeyName.trim()),
    onSuccess: async ({ apiKey, rawKey }) => {
      await queryClient.invalidateQueries({ queryKey: ["organization-api-keys", activeOrganizationId] });
      setRevealedApiKey({ rawKey, name: apiKey.name });
      setApiKeyName("");
    },
  });

  function handleSwitchOrganization(organization: Organization) {
    setActiveOrganization({
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
    });
    queryClient.clear();
  }

  async function handleCopyApiKey() {
    if (!revealedApiKey) return;
    await navigator.clipboard.writeText(revealedApiKey.rawKey);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tenant Management"
        description="Run one shared dashboard, create client organizations, and generate API keys for Mattecraft or other internal apps"
        icon={<UserCog className="w-5 h-5 sm:w-6 sm:h-6" />}
        actions={
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => setShowOrgDialog(true)}
            className="min-h-[44px] px-4 sm:px-6 rounded-xl bg-primary hover:bg-[hsl(var(--primary-hover))] text-primary-foreground font-semibold text-body flex items-center gap-2 transition-colors focus-ring"
          >
            <Plus className="w-4 h-4" />
            Create Organization
          </motion.button>
        }
      />

      <section className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3 border-b border-border bg-muted/30">
          <div>
            <h2 className="font-display font-semibold text-section-title text-foreground">Organizations</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Super admin controls which client dataset the dashboard is currently pointing at
            </p>
          </div>
          <span className="text-caption font-medium text-muted-foreground px-2.5 py-1 rounded-md bg-background/80">
            {organizations.length} tenants
          </span>
        </div>

        {orgLoading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground gap-3">
            <Loader2 className="w-5 h-5 animate-spin" />
            Loading organizations...
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 p-4">
            {organizations.map((organization) => {
              const isActive = organization.id === activeOrganizationId;
              return (
                <div
                  key={organization.id}
                  className={`rounded-xl border p-4 transition-colors ${
                    isActive
                      ? "border-primary/30 bg-primary/5"
                      : "border-border bg-background"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary font-bold flex items-center justify-center shrink-0">
                        {getInitials(organization.name)}
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-semibold text-foreground truncate">{organization.name}</h3>
                        <p className="text-xs text-muted-foreground truncate">Slug: {organization.slug}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Created {format(new Date(organization.created_at), "dd MMM yyyy")}
                        </p>
                      </div>
                    </div>
                    {isActive && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold bg-primary/15 text-primary">
                        Active
                      </span>
                    )}
                  </div>
                  <div className="mt-4 flex items-center justify-end">
                    <button
                      onClick={() => handleSwitchOrganization(organization)}
                      className={`h-9 px-4 rounded-lg text-sm font-medium transition-colors ${
                        isActive
                          ? "bg-muted text-muted-foreground"
                          : "bg-primary text-primary-foreground hover:bg-[hsl(var(--primary-hover))]"
                      }`}
                      disabled={isActive}
                    >
                      {isActive ? "Viewing in Dashboard" : "Switch Dashboard"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-[1.4fr,1fr] gap-6">
        <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
          <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3 border-b border-border bg-muted/30">
            <div>
              <h2 className="font-display font-semibold text-section-title text-foreground">
                Organization Admins
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {activeOrganizationName ? `Logins for ${activeOrganizationName}` : "Select an organization first"}
              </p>
            </div>
            <button
              onClick={() => setShowAdminDialog(true)}
              disabled={!activeOrganizationId}
              className="h-10 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50"
            >
              Add Login
            </button>
          </div>

          {adminsLoading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground gap-3">
              <Loader2 className="w-5 h-5 animate-spin" />
              Loading admin accounts...
            </div>
          ) : (
            <div className="divide-y divide-border/10">
              {admins.map((admin) => {
                const isYou = admin.id === user?.id;
                return (
                  <div key={admin.id} className="p-4 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium text-foreground truncate">
                        {admin.display_name}
                        {isYou && <span className="ml-2 text-xs text-muted-foreground">(you)</span>}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">{admin.email}</div>
                      <div className="text-[11px] text-muted-foreground mt-1">
                        {admin.role === "super_admin" ? "Super Admin" : "Organization Admin"}
                      </div>
                    </div>
                    {!isYou && (
                      <button
                        onClick={() => setDeleteTarget(admin)}
                        className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                );
              })}
              {admins.length === 0 && (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  No organization logins yet.
                </div>
              )}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
          <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3 border-b border-border bg-muted/30">
            <div>
              <h2 className="font-display font-semibold text-section-title text-foreground">Organization API Keys</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Use these keys from Mattecraft or internal tools to read and write data for the active organization only
              </p>
            </div>
          </div>

          <div className="p-4 space-y-4">
            <div className="flex gap-2">
              <input
                value={apiKeyName}
                onChange={(event) => setApiKeyName(event.target.value)}
                placeholder="Key label, e.g. Suhas House Mattecraft"
                disabled={!activeOrganizationId}
                className="glass-input w-full"
              />
              <button
                onClick={() => createApiKeyMutation.mutate()}
                disabled={!activeOrganizationId || apiKeyName.trim().length < 3 || createApiKeyMutation.isPending}
                className="h-10 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50 flex items-center gap-2"
              >
                {createApiKeyMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
                Generate
              </button>
            </div>

            {apiKeysLoading ? (
              <div className="text-sm text-muted-foreground flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading API keys...
              </div>
            ) : (
              <div className="space-y-2">
                {apiKeys.map((apiKey: OrganizationApiKey) => (
                  <div key={apiKey.id} className="rounded-lg border border-border p-3">
                    <div className="font-medium text-foreground">{apiKey.name}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Ends with {apiKey.last_four} • Created {format(new Date(apiKey.created_at), "dd MMM yyyy")}
                    </div>
                  </div>
                ))}
                {apiKeys.length === 0 && (
                  <div className="text-sm text-muted-foreground">
                    No ingestion keys for this organization yet.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </section>

      <AnimatePresence>
        {showOrgDialog && (
          <DialogShell title="Create Organization" onClose={() => setShowOrgDialog(false)}>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                createOrganizationMutation.mutate();
              }}
              className="space-y-4"
            >
              <FormField label="Organization Name">
                <input
                  value={orgName}
                  onChange={(event) => {
                    const value = event.target.value;
                    setOrgName(value);
                    setOrgSlug(slugify(value));
                  }}
                  required
                  className="glass-input w-full"
                />
              </FormField>
              <FormField label="Slug">
                <input
                  value={orgSlug}
                  onChange={(event) => setOrgSlug(slugify(event.target.value))}
                  required
                  className="glass-input w-full"
                />
              </FormField>
              <FormField label="First Admin Name">
                <input value={orgAdminName} onChange={(event) => setOrgAdminName(event.target.value)} required className="glass-input w-full" />
              </FormField>
              <FormField label="First Admin Email">
                <input value={orgAdminEmail} onChange={(event) => setOrgAdminEmail(event.target.value)} type="email" required className="glass-input w-full" />
              </FormField>
              <FormField label="First Admin Password">
                <input value={orgAdminPassword} onChange={(event) => setOrgAdminPassword(event.target.value)} type="password" minLength={8} required className="glass-input w-full" />
              </FormField>
              <DialogActions
                pending={createOrganizationMutation.isPending}
                submitLabel="Create Organization"
                onClose={() => setShowOrgDialog(false)}
              />
            </form>
          </DialogShell>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showAdminDialog && (
          <DialogShell title="Create Organization Login" onClose={() => setShowAdminDialog(false)}>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                createAdminMutation.mutate();
              }}
              className="space-y-4"
            >
              <FormField label="Display Name">
                <input value={adminName} onChange={(event) => setAdminName(event.target.value)} required className="glass-input w-full" />
              </FormField>
              <FormField label="Email">
                <input value={adminEmail} onChange={(event) => setAdminEmail(event.target.value)} type="email" required className="glass-input w-full" />
              </FormField>
              <FormField label="Password">
                <input value={adminPassword} onChange={(event) => setAdminPassword(event.target.value)} type="password" minLength={8} required className="glass-input w-full" />
              </FormField>
              <FormField label="Role">
                <select value={adminRole} onChange={(event) => setAdminRole(event.target.value as AdminRole)} className="glass-input w-full">
                  <option value="admin">Organization Admin</option>
                  <option value="super_admin">Super Admin</option>
                </select>
              </FormField>
              <DialogActions
                pending={createAdminMutation.isPending}
                submitLabel="Create Login"
                onClose={() => setShowAdminDialog(false)}
              />
            </form>
          </DialogShell>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {deleteTarget && (
          <DialogShell title="Delete Login" onClose={() => setDeleteTarget(null)}>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Remove <strong>{deleteTarget.display_name}</strong> from this organization?
              </p>
              <div className="flex items-center justify-end gap-3">
                <button onClick={() => setDeleteTarget(null)} className="h-10 px-5 rounded-xl text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors">
                  Cancel
                </button>
                <button
                  onClick={() => deleteAdminMutation.mutate(deleteTarget.id)}
                  disabled={deleteAdminMutation.isPending}
                  className="h-10 px-6 rounded-xl bg-gradient-to-r from-destructive to-destructive/80 text-destructive-foreground font-semibold text-sm flex items-center gap-2 disabled:opacity-50"
                >
                  {deleteAdminMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                  Delete
                </button>
              </div>
            </div>
          </DialogShell>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {revealedApiKey && (
          <DialogShell title="New API Key" onClose={() => setRevealedApiKey(null)}>
            <div className="space-y-4">
              <div className="rounded-xl border border-border bg-muted/20 p-4">
                <p className="text-xs text-muted-foreground mb-2">
                  Copy this now. It will not be shown again.
                </p>
                <code className="block break-all text-sm text-foreground">{revealedApiKey.rawKey}</code>
              </div>
              <div className="rounded-xl border border-border bg-background p-4">
                <p className="text-xs text-muted-foreground mb-2">Example Mattecraft write request</p>
                <pre className="text-xs whitespace-pre-wrap text-foreground">{`curl -X POST /api/external/mutate/access_control_zones \\
-H "x-navme-api-key: ${revealedApiKey.rawKey}" \\
-H "Content-Type: application/json" \\
-d '{"operation":"upsert","rows":[{"zone_id":"vip-east","label":"VIP East","x":42,"y":20,"w":120,"h":80,"floor":"ground","zone_type":"vip","is_blocked":false}],"onConflict":"zone_id","select":"*"}'`}</pre>
              </div>
              <div className="flex items-center justify-end gap-3">
                <button onClick={() => setRevealedApiKey(null)} className="h-10 px-5 rounded-xl text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors">
                  Close
                </button>
                <button onClick={handleCopyApiKey} className="h-10 px-6 rounded-xl bg-primary text-primary-foreground font-semibold text-sm flex items-center gap-2">
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  {copied ? "Copied" : "Copy Key"}
                </button>
              </div>
            </div>
          </DialogShell>
        )}
      </AnimatePresence>
    </div>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">{label}</span>
      {children}
    </label>
  );
}

function DialogShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={(event) => event.target === event.currentTarget && onClose()}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 40 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 40 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        className="glass-panel w-full max-w-lg max-h-[90vh] overflow-y-auto scrollbar-glass shadow-2xl bg-background/80"
      >
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 sm:py-5 border-b border-border/20">
          <h2 className="text-lg font-bold text-foreground">{title}</h2>
          <button onClick={onClose} className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-4 sm:p-6">{children}</div>
      </motion.div>
    </motion.div>
  );
}

function DialogActions({
  pending,
  submitLabel,
  onClose,
}: {
  pending: boolean;
  submitLabel: string;
  onClose: () => void;
}) {
  return (
    <div className="flex items-center justify-end gap-3 pt-3 border-t border-border/10">
      <button type="button" onClick={onClose} className="h-10 px-5 rounded-xl text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors">
        Cancel
      </button>
      <button type="submit" disabled={pending} className="h-10 px-6 rounded-xl bg-primary text-primary-foreground font-semibold text-sm flex items-center gap-2 disabled:opacity-50">
        {pending && <Loader2 className="w-4 h-4 animate-spin" />}
        {submitLabel}
      </button>
    </div>
  );
}
