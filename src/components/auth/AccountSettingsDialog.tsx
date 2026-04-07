import { useEffect, useState } from "react";
import {
  LuBuilding2 as Building2,
  LuLoaderCircle as Loader2,
  LuMail as Mail,
  LuShieldCheck as ShieldCheck,
} from "react-icons/lu";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { changePassword } from "@/lib/api-client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface AccountSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function getRoleLabel(role: "super_admin" | "admin") {
  return role === "super_admin" ? "Super Admin" : "Client Admin";
}

export function AccountSettingsDialog({
  open,
  onOpenChange,
}: AccountSettingsDialogProps) {
  const { user, activeOrganizationName } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setIsSubmitting(false);
    }
  }, [open]);

  if (!user) return null;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!currentPassword || !newPassword || !confirmPassword) {
      toast.error("Fill in all password fields.");
      return;
    }

    if (newPassword.length < 8) {
      toast.error("New password must be at least 8 characters.");
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error("New password and confirmation do not match.");
      return;
    }

    if (currentPassword === newPassword) {
      toast.error("Choose a new password different from the current one.");
      return;
    }

    setIsSubmitting(true);
    try {
      await changePassword(currentPassword, newPassword);
      toast.success("Password updated.");
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to update password.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-background/95 backdrop-blur">
        <DialogHeader>
          <DialogTitle>Account Settings</DialogTitle>
          <DialogDescription>
            Review your signed-in email and update your dashboard password.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              <Mail className="h-3.5 w-3.5" />
              Email
            </div>
            <div className="mt-2 text-sm font-medium text-foreground break-all">{user.email}</div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                <ShieldCheck className="h-3.5 w-3.5" />
                Role
              </div>
              <div className="mt-2 text-sm font-medium text-foreground">{getRoleLabel(user.role)}</div>
            </div>

            <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                <Building2 className="h-3.5 w-3.5" />
                Client
              </div>
              <div className="mt-2 text-sm font-medium text-foreground">
                {activeOrganizationName ?? user.organization_name ?? "Global access"}
              </div>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Current Password
            </span>
            <input
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              className="glass-input w-full"
              required
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              New Password
            </span>
            <input
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              minLength={8}
              className="glass-input w-full"
              required
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Confirm New Password
            </span>
            <input
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              minLength={8}
              className="glass-input w-full"
              required
            />
          </label>

          <DialogFooter className="gap-2 sm:gap-0">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="h-10 rounded-xl px-5 text-sm text-muted-foreground transition-colors hover:bg-secondary/50 hover:text-foreground"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="h-10 rounded-xl bg-primary px-6 text-sm font-semibold text-primary-foreground transition-colors hover:bg-[hsl(var(--primary-hover))] disabled:opacity-50"
            >
              <span className="inline-flex items-center gap-2">
                {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                Update Password
              </span>
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
