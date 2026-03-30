import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  fetchSessionUser,
  loginWithPassword,
  readStoredSession,
  writeStoredSession,
} from "@/lib/api-client";
import type { AdminUser, AuthSession } from "@/lib/auth-types";

interface AuthContextType {
  user: AdminUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isSuperAdmin: boolean;
  activeOrganizationId: string | null;
  activeOrganizationName: string | null;
  activeOrganizationSlug: string | null;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  refreshUser: () => Promise<void>;
  updateAvatar: (url: string) => void;
  setActiveOrganization: (organization: {
    id: string;
    name: string;
    slug: string;
  } | null) => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  isSuperAdmin: false,
  activeOrganizationId: null,
  activeOrganizationName: null,
  activeOrganizationSlug: null,
  login: async () => ({ success: false }),
  logout: () => {},
  refreshUser: async () => {},
  updateAvatar: () => {},
  setActiveOrganization: () => {},
});

function getDefaultOrganization(user: AdminUser, current?: AuthSession | null) {
  const activeOrganizationId = current?.activeOrganizationId ?? user.organization_id;
  const activeOrganizationName = current?.activeOrganizationName ?? user.organization_name;
  const activeOrganizationSlug = current?.activeOrganizationSlug ?? user.organization_slug;

  return {
    activeOrganizationId,
    activeOrganizationName,
    activeOrganizationSlug,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const initialSession = readStoredSession();
  const [user, setUser] = useState<AdminUser | null>(initialSession?.user ?? null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeOrganizationId, setActiveOrganizationId] = useState<string | null>(
    initialSession?.activeOrganizationId ?? initialSession?.user.organization_id ?? null,
  );
  const [activeOrganizationName, setActiveOrganizationName] = useState<string | null>(
    initialSession?.activeOrganizationName ?? initialSession?.user.organization_name ?? null,
  );
  const [activeOrganizationSlug, setActiveOrganizationSlug] = useState<string | null>(
    initialSession?.activeOrganizationSlug ?? initialSession?.user.organization_slug ?? null,
  );

  const clearSession = useCallback(() => {
    writeStoredSession(null);
    setUser(null);
    setActiveOrganizationId(null);
    setActiveOrganizationName(null);
    setActiveOrganizationSlug(null);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    try {
      const response = await loginWithPassword(email, password);
      const loginAt = Date.now();
      writeStoredSession({
        token: response.token,
        user: response.user,
        loginAt,
        activeOrganizationId: response.user.organization_id,
        activeOrganizationName: response.user.organization_name,
        activeOrganizationSlug: response.user.organization_slug,
      });
      setUser(response.user);
      setActiveOrganizationId(response.user.organization_id);
      setActiveOrganizationName(response.user.organization_name);
      setActiveOrganizationSlug(response.user.organization_slug);
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to sign in.";
      clearSession();
      return { success: false, error: message };
    }
  }, [clearSession]);

  const refreshUser = useCallback(async () => {
    const current = readStoredSession();
    if (!current?.token) {
      clearSession();
      return;
    }

    try {
      const nextUser = await fetchSessionUser();
      writeStoredSession({
        token: current.token,
        user: nextUser,
        loginAt: current.loginAt,
        ...getDefaultOrganization(nextUser, current),
      });
      setUser(nextUser);
      setActiveOrganizationId(current.activeOrganizationId ?? nextUser.organization_id);
      setActiveOrganizationName(current.activeOrganizationName ?? nextUser.organization_name);
      setActiveOrganizationSlug(current.activeOrganizationSlug ?? nextUser.organization_slug);
    } catch {
      clearSession();
    }
  }, [clearSession]);

  const logout = useCallback(() => {
    clearSession();
  }, [clearSession]);

  const updateAvatar = useCallback((url: string) => {
    setUser((previous) => {
      if (!previous) return previous;
      const updated = { ...previous, avatar_url: url };
      const stored = readStoredSession();
      if (stored) {
        writeStoredSession({
          ...stored,
          user: updated,
        });
      }
      return updated;
    });
  }, []);

  const setActiveOrganization = useCallback((organization: { id: string; name: string; slug: string } | null) => {
    const stored = readStoredSession();
    if (!stored) return;

    writeStoredSession({
      ...stored,
      activeOrganizationId: organization?.id ?? stored.user.organization_id,
      activeOrganizationName: organization?.name ?? stored.user.organization_name,
      activeOrganizationSlug: organization?.slug ?? stored.user.organization_slug,
    });

    setActiveOrganizationId(organization?.id ?? stored.user.organization_id);
    setActiveOrganizationName(organization?.name ?? stored.user.organization_name);
    setActiveOrganizationSlug(organization?.slug ?? stored.user.organization_slug);
  }, []);

  useEffect(() => {
    const stored = readStoredSession();
    if (!stored?.token) {
      setIsLoading(false);
      return;
    }

    void refreshUser().finally(() => {
      setIsLoading(false);
    });
  }, [refreshUser]);

  const value = useMemo<AuthContextType>(() => ({
    user,
    isAuthenticated: !!user,
    isLoading,
    isSuperAdmin: user?.role === "super_admin",
    activeOrganizationId,
    activeOrganizationName,
    activeOrganizationSlug,
    login,
    logout,
    refreshUser,
    updateAvatar,
    setActiveOrganization,
  }), [
    activeOrganizationId,
    activeOrganizationName,
    activeOrganizationSlug,
    isLoading,
    login,
    logout,
    refreshUser,
    setActiveOrganization,
    updateAvatar,
    user,
  ]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
