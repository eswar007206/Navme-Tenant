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
import { toast } from "sonner";
import {
  DEFAULT_ORGANIZATION_FEATURES,
  createAdmin,
  createOrganization,
  createOrganizationApiKey,
  deleteAdmin,
  deleteOrganization,
  getOrganizationFeatures,
  listAdmins,
  listOrganizationApiKeys,
  listOrganizations,
  upsertOrganizationFeatures,
} from "@/lib/api-client";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Switch } from "@/components/ui/switch";
import type {
  AdminUser,
  CreateAdminInput,
  CreateOrganizationInput,
  OrganizationFeatures,
  Organization,
  OrganizationApiKey,
} from "@/lib/auth-types";

type FeatureToggleKey = keyof typeof DEFAULT_ORGANIZATION_FEATURES;

const featureToggleSections: Array<{
  title: string;
  description: string;
  items: Array<{
    key: FeatureToggleKey;
    label: string;
    detail: string;
  }>;
}> = [
  {
    title: "Search Panel",
    description: "These toggles control the three categories inside the Mattercraft search panel.",
    items: [
      {
        key: "search_people_enabled",
        label: "People",
        detail: "Shows or hides the People category in search.",
      },
      {
        key: "search_explore_enabled",
        label: "Explore",
        detail: "Shows or hides the Explore category in search.",
      },
      {
        key: "search_places_enabled",
        label: "Places",
        detail: "Shows or hides the Places category in search.",
      },
    ],
  },
  {
    title: "FAB Menu",
    description: "These toggles control the five actions inside the Mattercraft floating action menu.",
    items: [
      {
        key: "fab_snapshot_enabled",
        label: "Snapshot",
        detail: "Shows or hides the Snapshot action.",
      },
      {
        key: "fab_logout_enabled",
        label: "Logout",
        detail: "Shows or hides the Logout action.",
      },
      {
        key: "fab_complaint_enabled",
        label: "Report Issue",
        detail: "Shows or hides the Complaint or Report Issue action.",
      },
      {
        key: "fab_whatsapp_enabled",
        label: "WhatsApp",
        detail: "Shows or hides the WhatsApp action.",
      },
      {
        key: "fab_feedback_enabled",
        label: "Feedback",
        detail: "Shows or hides the Feedback action.",
      },
    ],
  },
  {
    title: "Assistant",
    description: "This toggle controls the Mattercraft chatbot launcher.",
    items: [
      {
        key: "chatbot_enabled",
        label: "Chatbot",
        detail: "Shows or hides the chatbot button.",
      },
    ],
  },
];

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
  const [organizationDeleteTarget, setOrganizationDeleteTarget] = useState<Organization | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null);
  const [apiKeyName, setApiKeyName] = useState("");
  const [revealedApiKey, setRevealedApiKey] = useState<{ rawKey: string; name: string } | null>(null);
  const [revealedLoginCredentials, setRevealedLoginCredentials] = useState<{
    organizationName: string;
    displayName: string;
    email: string;
    password: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  const { data: organizations = [], isLoading: orgLoading } = useQuery({
    queryKey: ["organizations"],
    queryFn: listOrganizations,
  });

  const activeOrganization =
    organizations.find((organization) => organization.id === activeOrganizationId) ?? null;

  const { data: admins = [], isLoading: adminsLoading } = useQuery({
    queryKey: ["admin-list", activeOrganizationId ?? "none"],
    queryFn: () => (activeOrganizationId ? listAdmins({ scope: "active" }) : Promise.resolve([])),
    enabled: !!activeOrganizationId,
  });

  const { data: apiKeys = [], isLoading: apiKeysLoading } = useQuery({
    queryKey: ["organization-api-keys", activeOrganizationId],
    queryFn: listOrganizationApiKeys,
    enabled: !!activeOrganizationId,
  });

  const { data: organizationFeatures, isLoading: featuresLoading } = useQuery({
    queryKey: ["organization-features", activeOrganizationId],
    queryFn: getOrganizationFeatures,
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
    mutationFn: async (input: CreateOrganizationInput) => {
      return createOrganization(input);
    },
    onSuccess: async (organization, variables) => {
      await queryClient.invalidateQueries({ queryKey: ["organizations"] });
      setActiveOrganization({
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
      });
      setRevealedLoginCredentials({
        organizationName: organization.name,
        displayName: variables.adminDisplayName,
        email: variables.adminEmail,
        password: variables.adminPassword,
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
    mutationFn: async (input: CreateAdminInput) => {
      return createAdmin(input);
    },
    onSuccess: async (_createdAdmin, variables) => {
      await queryClient.invalidateQueries({
        queryKey: ["admin-list", variables.organizationId ?? "none"],
      });
      setShowAdminDialog(false);
      setAdminName("");
      setAdminEmail("");
      setAdminPassword("");
      setRevealedLoginCredentials({
        organizationName:
          activeOrganization?.name ?? activeOrganizationName ?? "Selected client",
        displayName: variables.displayName,
        email: variables.email,
        password: variables.password,
      });
      toast.success("Client login created.");
    },
  });

  const deleteAdminMutation = useMutation({
    mutationFn: async (adminId: string) => deleteAdmin(adminId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin-list", activeOrganizationId] });
      setDeleteTarget(null);
    },
  });

  const deleteOrganizationMutation = useMutation({
    mutationFn: async (organization: Organization) => deleteOrganization(organization.id),
    onSuccess: async (deletedOrganization) => {
      const previousOrganizations =
        queryClient.getQueryData<Organization[]>(["organizations"]) ?? organizations;
      const remainingOrganizations = previousOrganizations.filter(
        (organization) => organization.id !== deletedOrganization.id,
      );

      if (activeOrganizationId === deletedOrganization.id) {
        const fallback =
          remainingOrganizations.find((organization) => organization.id === user?.organization_id) ??
          remainingOrganizations[0] ??
          null;

        setActiveOrganization(
          fallback
            ? {
                id: fallback.id,
                name: fallback.name,
                slug: fallback.slug,
              }
            : null,
        );
      }

      queryClient.removeQueries({ queryKey: ["admin-list", deletedOrganization.id] });
      queryClient.removeQueries({ queryKey: ["organization-api-keys", deletedOrganization.id] });
      queryClient.removeQueries({ queryKey: ["organization-features", deletedOrganization.id] });

      await queryClient.invalidateQueries({ queryKey: ["organizations"] });
      await queryClient.invalidateQueries({ queryKey: ["admin-list"] });
      await queryClient.invalidateQueries({ queryKey: ["organization-api-keys"] });
      await queryClient.invalidateQueries({ queryKey: ["organization-features"] });

      setOrganizationDeleteTarget(null);
      toast.success(`Deleted ${deletedOrganization.name}.`);
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "Unable to delete client.";
      toast.error(message);
    },
  });

  const createApiKeyMutation = useMutation({
    mutationFn: async () => createOrganizationApiKey(apiKeyName.trim()),
    onSuccess: async ({ apiKey, rawKey }) => {
      await queryClient.invalidateQueries({ queryKey: ["organization-api-keys", activeOrganizationId] });
      setCopied(false);
      setRevealedApiKey({ rawKey, name: apiKey.name });
      setApiKeyName("");
    },
  });

  const updateFeaturesMutation = useMutation({
    mutationFn: async (payload: Partial<Omit<OrganizationFeatures, "id" | "organization_id" | "created_at" | "updated_at">>) =>
      upsertOrganizationFeatures(payload),
    onMutate: async (payload) => {
      if (!activeOrganizationId) return { previous: null as OrganizationFeatures | null };

      await queryClient.cancelQueries({ queryKey: ["organization-features", activeOrganizationId] });
      const previous =
        queryClient.getQueryData<OrganizationFeatures | null>([
          "organization-features",
          activeOrganizationId,
        ]) ?? null;

      queryClient.setQueryData<OrganizationFeatures>(
        ["organization-features", activeOrganizationId],
        {
          id: previous?.id ?? "pending",
          organization_id: previous?.organization_id ?? activeOrganizationId,
          created_at: previous?.created_at ?? new Date().toISOString(),
          updated_at: new Date().toISOString(),
          ...DEFAULT_ORGANIZATION_FEATURES,
          ...previous,
          ...payload,
        },
      );

      return { previous };
    },
    onError: async (_error, _payload, context) => {
      if (!activeOrganizationId) return;
      queryClient.setQueryData(
        ["organization-features", activeOrganizationId],
        context?.previous ?? null,
      );
      toast.error("We couldn't update the Mattercraft feature right now.");
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["organization-features", activeOrganizationId] });
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

  function scrollToFeatureSection() {
    document
      .getElementById("organization-features-section")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function handleManageOrganization(organization: Organization) {
    handleSwitchOrganization(organization);
    window.setTimeout(() => {
      scrollToFeatureSection();
    }, 120);
  }

  async function handleCopyApiKey() {
    if (!revealedApiKey) return;
    await navigator.clipboard.writeText(revealedApiKey.rawKey);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  async function handleCopyAnyValue(value: string, successMessage: string) {
    await navigator.clipboard.writeText(value);
    toast.success(successMessage);
  }

  async function handleCopyCredentials(details: {
    organizationName: string;
    displayName: string;
    email: string;
    password: string;
  }) {
    await navigator.clipboard.writeText(
      [
        `Organization: ${details.organizationName}`,
        `Display Name: ${details.displayName}`,
        `Email: ${details.email}`,
        `Password: ${details.password}`,
      ].join("\n"),
    );
    toast.success("Login details copied.");
  }

  async function handleToggleFeature(key: FeatureToggleKey, enabled: boolean) {
    await updateFeaturesMutation.mutateAsync({
      [key]: enabled,
    });
  }

  const resolvedFeatures = activeOrganizationId
    ? {
        id: organizationFeatures?.id ?? "pending",
        organization_id: organizationFeatures?.organization_id ?? activeOrganizationId,
        created_at: organizationFeatures?.created_at ?? new Date().toISOString(),
        updated_at: organizationFeatures?.updated_at ?? new Date().toISOString(),
        ...DEFAULT_ORGANIZATION_FEATURES,
        ...organizationFeatures,
      }
    : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Client Management"
        description="Sign in as super admin, create client logins, and generate copyable API keys for each client"
        icon={<UserCog className="w-5 h-5 sm:w-6 sm:h-6" />}
        actions={
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => setShowOrgDialog(true)}
            className="min-h-[44px] px-4 sm:px-6 rounded-xl bg-primary hover:bg-[hsl(var(--primary-hover))] text-primary-foreground font-semibold text-body flex items-center gap-2 transition-colors focus-ring"
          >
            <Plus className="w-4 h-4" />
            Create Client
          </motion.button>
        }
      />

      <section className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3 border-b border-border bg-muted/30">
          <div>
            <h2 className="font-display font-semibold text-section-title text-foreground">Clients</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Each client gets its own API keys, feature controls, and organization-scoped logins.
            </p>
          </div>
          <span className="text-caption font-medium text-muted-foreground px-2.5 py-1 rounded-md bg-background/80">
            {organizations.length} clients
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
                        Active Client
                      </span>
                    )}
                  </div>
                  <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
                    <button
                      onClick={() => setOrganizationDeleteTarget(organization)}
                      disabled={deleteOrganizationMutation.isPending}
                      className="h-9 px-4 rounded-lg border border-destructive/30 text-destructive hover:bg-destructive/10 text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
                    >
                      {deleteOrganizationMutation.isPending &&
                      organizationDeleteTarget?.id === organization.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                      Delete
                    </button>
                    <button
                      onClick={() => handleManageOrganization(organization)}
                      className="h-9 px-4 rounded-lg bg-primary text-primary-foreground hover:bg-[hsl(var(--primary-hover))] text-sm font-medium transition-colors"
                    >
                      {isActive ? "Manage Client" : "Select Client"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section
        id="organization-features-section"
        className="rounded-xl border border-border bg-card shadow-sm overflow-hidden"
      >
        <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3 border-b border-border bg-muted/30">
          <div>
            <h2 className="font-display font-semibold text-section-title text-foreground">
              Mattercraft Features
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Turn the 9 Mattercraft buttons on or off for the selected client.
            </p>
          </div>
          {activeOrganizationId && (
            <span className="text-caption font-medium text-muted-foreground px-2.5 py-1 rounded-md bg-background/80">
              {user?.role === "super_admin" ? "Tenant scoped" : "Client scoped"}
            </span>
          )}
        </div>

        {!activeOrganizationId ? (
          <div className="p-8 text-sm text-muted-foreground">
            Select a client card above to manage its Mattercraft button visibility.
          </div>
        ) : featuresLoading && !resolvedFeatures ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground gap-3">
            <Loader2 className="w-5 h-5 animate-spin" />
            Loading Mattercraft features...
          </div>
        ) : (
          <div className="p-4 sm:p-5 space-y-5">
            <div className="rounded-xl border border-border/70 bg-muted/20 px-4 py-3">
              <div className="text-sm font-semibold text-foreground">
                {activeOrganizationName ?? "Selected client"}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                These toggles update the Mattercraft feature settings for this client only.
              </div>
            </div>

            {featureToggleSections.map((section) => (
              <div key={section.title} className="rounded-xl border border-border/70 bg-background">
                <div className="px-4 py-3 border-b border-border/70">
                  <h3 className="font-semibold text-foreground">{section.title}</h3>
                  <p className="text-xs text-muted-foreground mt-1">{section.description}</p>
                </div>
                <div className="divide-y divide-border/50">
                  {section.items.map((item) => (
                    <label
                      key={item.key}
                      className="flex items-center justify-between gap-4 px-4 py-3 cursor-pointer"
                    >
                      <div className="min-w-0">
                        <div className="font-medium text-foreground">{item.label}</div>
                        <p className="text-xs text-muted-foreground mt-1">{item.detail}</p>
                      </div>
                      <Switch
                        checked={Boolean(resolvedFeatures?.[item.key])}
                        disabled={updateFeaturesMutation.isPending}
                        onCheckedChange={(checked) => {
                          void handleToggleFeature(item.key, checked);
                        }}
                      />
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-[1.4fr,1fr] gap-6">
        <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
          <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3 border-b border-border bg-muted/30">
            <div>
              <h2 className="font-display font-semibold text-section-title text-foreground">
                Client Logins
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                The selected client controls which dashboard login and API key you create next.
              </p>
            </div>
            <button
              onClick={() => setShowAdminDialog(true)}
              disabled={!activeOrganizationId}
              className="h-10 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50"
            >
              Add Client Login
            </button>
          </div>

          {adminsLoading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground gap-3">
              <Loader2 className="w-5 h-5 animate-spin" />
              Loading admin accounts...
            </div>
          ) : !activeOrganizationId ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Select a client to view or create its dashboard logins.
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
                      <div className="text-[11px] text-muted-foreground">
                        {admin.organization_name ?? "Global super admin access"}
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
                  No dashboard logins yet.
                </div>
              )}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
          <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3 border-b border-border bg-muted/30">
            <div>
              <h2 className="font-display font-semibold text-section-title text-foreground">Client API Keys</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Use these keys from Mattecraft or internal tools to read and write data for the active client only
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
                Generate API
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
                    {apiKey.raw_key ? (
                      <>
                        <div className="mt-3 rounded-lg border border-border/70 bg-muted/20 p-3">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                            Full API Key
                          </div>
                          <code className="mt-2 block break-all text-xs text-foreground">
                            {apiKey.raw_key}
                          </code>
                        </div>
                        <div className="mt-3 flex items-center justify-between gap-2">
                          <div className="text-[11px] text-muted-foreground">
                            {apiKey.last_used_at
                              ? `Last used ${format(new Date(apiKey.last_used_at), "dd MMM yyyy, hh:mm a")}`
                              : "Not used yet"}
                          </div>
                          <button
                            onClick={() => handleCopyAnyValue(apiKey.raw_key, "API key copied.")}
                            className="h-8 px-3 rounded-lg border border-border text-xs font-semibold text-foreground hover:bg-secondary/50 transition-colors flex items-center gap-2 shrink-0"
                          >
                            <Copy className="w-3.5 h-3.5" />
                            Copy
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-muted-foreground">
                        This is a legacy key. Only the last 4 digits were stored, so the full value cannot be recovered.
                        Generate a new key if you want permanent full-key visibility and copy access from the dashboard.
                      </div>
                    )}
                    <div className="text-xs text-muted-foreground mt-1">
                      Ends with {apiKey.last_four} • Created {format(new Date(apiKey.created_at), "dd MMM yyyy")}
                    </div>
                  </div>
                ))}
                {apiKeys.length === 0 && (
                  <div className="text-sm text-muted-foreground">
                    No client API keys for this organization yet.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </section>

      <AnimatePresence>
        {organizationDeleteTarget && (
          <DialogShell title="Delete Client" onClose={() => setOrganizationDeleteTarget(null)}>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Delete <strong>{organizationDeleteTarget.name}</strong>?
              </p>
              <p className="text-sm text-muted-foreground">
                This removes the client logins, API keys, feature settings, and client-scoped dashboard data for this tenant. This cannot be undone.
              </p>
              <div className="flex items-center justify-end gap-3">
                <button
                  onClick={() => setOrganizationDeleteTarget(null)}
                  className="h-10 px-5 rounded-xl text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => deleteOrganizationMutation.mutate(organizationDeleteTarget)}
                  disabled={deleteOrganizationMutation.isPending}
                  className="h-10 px-6 rounded-xl bg-gradient-to-r from-destructive to-destructive/80 text-destructive-foreground font-semibold text-sm flex items-center gap-2 disabled:opacity-50"
                >
                  {deleteOrganizationMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                  Delete Client
                </button>
              </div>
            </div>
          </DialogShell>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showOrgDialog && (
          <DialogShell title="Create Client" onClose={() => setShowOrgDialog(false)}>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                createOrganizationMutation.mutate({
                  name: orgName.trim(),
                  slug: orgSlug.trim(),
                  adminDisplayName: orgAdminName.trim(),
                  adminEmail: orgAdminEmail.trim(),
                  adminPassword: orgAdminPassword,
                });
              }}
              className="space-y-4"
            >
              <FormField label="Client Name">
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
              <FormField label="Client Slug">
                <input
                  value={orgSlug}
                  onChange={(event) => setOrgSlug(slugify(event.target.value))}
                  required
                  className="glass-input w-full"
                />
              </FormField>
              <FormField label="Client Admin Name">
                <input value={orgAdminName} onChange={(event) => setOrgAdminName(event.target.value)} required className="glass-input w-full" />
              </FormField>
              <FormField label="Client Admin Email">
                <input value={orgAdminEmail} onChange={(event) => setOrgAdminEmail(event.target.value)} type="email" required className="glass-input w-full" />
              </FormField>
              <FormField label="Client Admin Password">
                <input value={orgAdminPassword} onChange={(event) => setOrgAdminPassword(event.target.value)} type="password" minLength={8} required className="glass-input w-full" />
              </FormField>
              <DialogActions
                pending={createOrganizationMutation.isPending}
                submitLabel="Create Client"
                onClose={() => setShowOrgDialog(false)}
              />
            </form>
          </DialogShell>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showAdminDialog && (
          <DialogShell title="Create Client Login" onClose={() => setShowAdminDialog(false)}>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                createAdminMutation.mutate({
                  email: adminEmail.trim(),
                  password: adminPassword,
                  displayName: adminName.trim(),
                  role: "admin",
                  organizationId: activeOrganizationId,
                });
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
              <DialogActions
                pending={createAdminMutation.isPending}
                submitLabel="Create Client Login"
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
                <p className="text-xs text-muted-foreground mb-2">Example client write request</p>
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

      <AnimatePresence>
        {revealedLoginCredentials && (
          <DialogShell title="New Client Login" onClose={() => setRevealedLoginCredentials(null)}>
            <div className="space-y-4">
              <div className="rounded-xl border border-border bg-muted/20 p-4">
                <p className="text-xs text-muted-foreground mb-2">
                  Use these details to sign in to the {revealedLoginCredentials.organizationName} dashboard.
                </p>
                <div className="space-y-1 text-sm text-foreground">
                  <div>Name: {revealedLoginCredentials.displayName}</div>
                  <div>Email: {revealedLoginCredentials.email}</div>
                  <div>Password: {revealedLoginCredentials.password}</div>
                </div>
              </div>
              <div className="flex items-center justify-end gap-3">
                <button onClick={() => setRevealedLoginCredentials(null)} className="h-10 px-5 rounded-xl text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors">
                  Close
                </button>
                <button
                  onClick={() => handleCopyCredentials(revealedLoginCredentials)}
                  className="h-10 px-6 rounded-xl bg-primary text-primary-foreground font-semibold text-sm flex items-center gap-2"
                >
                  <Copy className="w-4 h-4" />
                  Copy Login
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
