import React, { useEffect } from "react";
import { Edit } from "../../components/SaasRefineMui";
import { useForm } from "@refinedev/react-hook-form";
import { useParams, useNavigate } from "react-router-dom";
import {
  Box,
  TextField,
  FormGroup,
  FormControlLabel,
  Checkbox,
  FormControl,
  InputLabel,
  Typography,
  Select,
  MenuItem,
} from "@mui/material";
import { getStoredAdmin, setAuth, getToken } from "../../lib/admin-auth";
import { validateAdminPassword } from "../../lib/password-rules";
import {
  ADMIN_SELECTABLE_NAV_RESOURCES,
  normalizeAdminHiddenNavList,
} from "../../lib/adminNavVisibility";
import { getFirstAccessiblePath } from "../../lib/authProvider";

const MODULES = [
  { value: "TOURNAMENTS", label: "Tournaments" },
  { value: "TEAMS", label: "Teams" },
  { value: "CALENDAR_EVENTS", label: "Events" },
  { value: "MEMBERS", label: "Members" },
  { value: "ANNOUNCEMENTS", label: "Announcements" },
  { value: "PAYMENT_PROFILES", label: "Payment profiles" },
  { value: "PAYMENTS", label: "Payments" },
  { value: "CREDITS", label: "Credits" },
  { value: "CREDIT_LOGS", label: "Credit log" },
] as const;

type AdminUserRecord = {
  id: string;
  userName: string;
  role: "ADMIN" | "SUPER_MANAGER" | "MANAGER" | "COACH";
  isActive: boolean;
  permissions?: string[];
  hiddenNavResources?: unknown;
};

export const AdminUserEdit: React.FC = () => {
  type AdminUserEditForm = {
    userName: string;
    isActive: boolean;
    role: "ADMIN" | "SUPER_MANAGER" | "MANAGER" | "COACH";
    permissions: string[];
    newPassword?: string;
    hiddenNavResources: string[];
  };

  const { id: editId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const currentAdmin = getStoredAdmin();
  const isAdmin = currentAdmin?.role === "ADMIN";
  const isSuperManagerViewer = currentAdmin?.role === "SUPER_MANAGER";

  const {
    saveButtonProps,
    register,
    setValue,
    watch,
    reset,
    refineCore: { query },
    formState: { errors },
  } = useForm<AdminUserEditForm>({
    defaultValues: {
      hiddenNavResources: [],
      permissions: [],
    },
    refineCoreProps: {
      redirect: false,
      onMutationSuccess: (data) => {
        const d = data?.data as Record<string, unknown> | undefined;
        const token = getToken();
        if (currentAdmin && editId === currentAdmin.id && token && d) {
          setAuth(token, {
            ...currentAdmin,
            userName: typeof d.userName === "string" ? d.userName : currentAdmin.userName,
            role:
              d.role === "ADMIN" || d.role === "SUPER_MANAGER" || d.role === "MANAGER" || d.role === "COACH"
                ? d.role
                : currentAdmin.role,
            permissions: Array.isArray(d.permissions)
              ? (d.permissions as string[])
              : currentAdmin.permissions,
            hiddenNavResources:
              currentAdmin.role === "ADMIN" && Array.isArray(d.hiddenNavResources)
                ? normalizeAdminHiddenNavList(d.hiddenNavResources)
                : currentAdmin.hiddenNavResources,
          });
        }
        if (currentAdmin && editId === currentAdmin.id) {
          navigate(getFirstAccessiblePath(), { replace: true });
        } else {
          navigate("/admin-users", { replace: true });
        }
      },
    },
  });

  const record = query?.data?.data as AdminUserRecord | undefined;
  const role = watch("role") ?? record?.role;
  const permissions = watch("permissions") ?? record?.permissions ?? [];
  const hiddenNavResources = watch("hiddenNavResources") ?? [];
  const isActive = watch("isActive");
  const activeValue = typeof isActive === "boolean" ? isActive : (record?.isActive ?? false);
  const newPassword = watch("newPassword");

  useEffect(() => {
    if (!record) return;
    reset({
      userName: record.userName,
      isActive: record.isActive,
      role: record.role,
      permissions: record.permissions ?? [],
      newPassword: "",
      hiddenNavResources: normalizeAdminHiddenNavList(record.hiddenNavResources),
    });
  }, [record, reset]);

  const showSelfNavPrefs =
    Boolean(isAdmin && currentAdmin?.role === "ADMIN" && editId === currentAdmin.id && record?.role === "ADMIN");

  const handlePermissionToggle = (module: string) => {
    const next = permissions.includes(module)
      ? permissions.filter((p: string) => p !== module)
      : [...permissions, module];
    setValue("permissions", next, { shouldDirty: true });
  };

  const setPageVisibleInMenu = (resource: string, visible: boolean) => {
    const set = new Set(hiddenNavResources);
    if (visible) set.delete(resource);
    else set.add(resource);
    setValue("hiddenNavResources", [...set], { shouldDirty: true });
  };

  const passwordValidation =
    typeof newPassword === "string" && newPassword.trim().length > 0
      ? validateAdminPassword(newPassword)
      : null;
  const passwordError = passwordValidation && !passwordValidation.ok ? passwordValidation.message : undefined;

  return (
    <Edit saveButtonProps={{ ...saveButtonProps, disabled: saveButtonProps.disabled || !!passwordError }}>
      <Box component="form" sx={{ display: "flex", flexDirection: "column", gap: 2 }} autoComplete="off">
        <TextField
          label="User name"
          {...register("userName", { required: isSuperManagerViewer ? false : "Required" })}
          disabled={!isAdmin || isSuperManagerViewer}
          fullWidth
          error={!!errors?.userName}
          helperText={(errors?.userName?.message as string) ?? (isAdmin ? "You can change this user's name" : "Only Admin can change")}
        />
        <FormControlLabel
          control={
            <Checkbox
              checked={activeValue}
              onChange={(e) => setValue("isActive", e.target.checked, { shouldDirty: true })}
              disabled={isSuperManagerViewer}
            />
          }
          label="Active (can log in)"
        />
        {isAdmin && !isSuperManagerViewer && (
          <FormControl fullWidth>
            <InputLabel id="admin-role-label">Role</InputLabel>
            <Select
              labelId="admin-role-label"
              label="Role"
              value={role ?? "MANAGER"}
              onChange={(e) =>
                setValue("role", e.target.value as AdminUserEditForm["role"], { shouldDirty: true })
              }
            >
              <MenuItem value="MANAGER">Manager</MenuItem>
              <MenuItem value="SUPER_MANAGER">Super Manager</MenuItem>
              <MenuItem value="COACH">Coach</MenuItem>
              <MenuItem value="ADMIN">Admin</MenuItem>
            </Select>
          </FormControl>
        )}
        <TextField
          label="New password (leave blank to keep current)"
          type="password"
          {...register("newPassword")}
          disabled={isSuperManagerViewer}
          fullWidth
          error={!!passwordError}
          helperText={
            passwordError ??
            "At least 8 characters with letter, number and special symbol. Leave blank to keep current."
          }
        />
        {(role === "MANAGER" || role === "SUPER_MANAGER" || role === "COACH") &&
          (isAdmin || (isSuperManagerViewer && (record?.role === "MANAGER" || record?.role === "COACH"))) && (
          <FormControl component="fieldset">
            <InputLabel shrink>Page permissions (Manager / Super Manager)</InputLabel>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
              Choose which sections this user can access (including Payment profiles and Payments).{" "}
              {isSuperManagerViewer ? "Super Managers can edit Managers/Coaches only." : "Only Admins can edit roles."}
            </Typography>
            <FormGroup row sx={{ pt: 1 }}>
              {MODULES.map((m) => (
                <FormControlLabel
                  key={m.value}
                  control={
                    <Checkbox
                      checked={permissions.includes(m.value)}
                      onChange={() => handlePermissionToggle(m.value)}
                    />
                  }
                  label={m.label}
                />
              ))}
            </FormGroup>
            {isAdmin && !isSuperManagerViewer && (
              <Box sx={{ pt: 1.5, mt: 1, borderTop: 1, borderColor: "divider" }}>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                  Admin-only modules — only an Admin can grant or remove these.
                </Typography>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={permissions.includes("ADMIN_USERS")}
                      onChange={() => handlePermissionToggle("ADMIN_USERS")}
                    />
                  }
                  label="Admin users"
                />
              </Box>
            )}
          </FormControl>
        )}
        {showSelfNavPrefs && (
          <FormControl component="fieldset" sx={{ border: 1, borderColor: "divider", borderRadius: 1, p: 2 }}>
            <InputLabel shrink sx={{ px: 0.5, bgcolor: "background.paper" }}>
              Pages I see in the menu
            </InputLabel>
            <Typography variant="body2" color="text.secondary" sx={{ pt: 1, mb: 1 }}>
              Only you can change this for your own account. It does not affect other admins or any manager&apos;s
              permissions. Uncheck a page to hide it from your sidebar and mobile tabs (you can still open this screen
              via Profile to bring pages back).
            </Typography>
            <FormGroup>
              {ADMIN_SELECTABLE_NAV_RESOURCES.map((m) => {
                const visible = !hiddenNavResources.includes(m.resource);
                return (
                  <FormControlLabel
                    key={m.resource}
                    control={
                      <Checkbox
                        checked={visible}
                        onChange={(e) => setPageVisibleInMenu(m.resource, e.target.checked)}
                      />
                    }
                    label={m.label}
                  />
                );
              })}
            </FormGroup>
          </FormControl>
        )}
      </Box>
    </Edit>
  );
};
