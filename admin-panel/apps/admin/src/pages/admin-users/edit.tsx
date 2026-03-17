import { Edit } from "@refinedev/mui";
import { useForm } from "@refinedev/react-hook-form";
import { Box, TextField, FormGroup, FormControlLabel, Checkbox, FormControl, InputLabel } from "@mui/material";
import { getStoredAdmin } from "../../lib/admin-auth";
import { validateAdminPassword } from "../../lib/password-rules";

const MODULES = [
  { value: "TOURNAMENTS", label: "Tournaments" },
  { value: "TEAMS", label: "Teams" },
  { value: "CALENDAR_EVENTS", label: "Calendar Events" },
  { value: "MEMBERS", label: "Members" },
] as const;

export const AdminUserEdit: React.FC = () => {
  const currentAdmin = getStoredAdmin();
  const isAdmin = currentAdmin?.role === "ADMIN";
  const {
    saveButtonProps,
    register,
    setValue,
    watch,
    refineCore: { query },
    formState: { errors },
  } = useForm({
    refineCoreProps: {
      redirect: "list",
      onFinish: (values) => {
        const next = { ...values };
        if (typeof (next as any).newPassword === "string" && (next as any).newPassword.trim() === "")
          (next as any).newPassword = undefined;
        return next;
      },
    },
  });

  const record = query?.data?.data;
  const role = watch("role") ?? record?.role;
  const permissions = watch("permissions") ?? record?.permissions ?? [];
  const isActive = watch("isActive");
  const activeValue = typeof isActive === "boolean" ? isActive : (record?.isActive ?? false);
  const newPassword = watch("newPassword");

  const handlePermissionToggle = (module: string) => {
    const next = permissions.includes(module)
      ? permissions.filter((p) => p !== module)
      : [...permissions, module];
    setValue("permissions", next, { shouldDirty: true });
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
          {...register("userName", { required: "Required" })}
          disabled={!isAdmin}
          fullWidth
          error={!!errors?.userName}
          helperText={(errors?.userName?.message as string) ?? (isAdmin ? "You can change this user's name" : "Only Admin can change")}
        />
        <FormControlLabel
          control={
            <Checkbox
              checked={activeValue}
              onChange={(e) => setValue("isActive", e.target.checked, { shouldDirty: true })}
            />
          }
          label="Active (can log in)"
        />
        <TextField
          label="New password (leave blank to keep current)"
          type="password"
          {...register("newPassword")}
          fullWidth
          error={!!passwordError}
          helperText={
            passwordError ??
            "At least 8 characters with letter, number and special symbol. Leave blank to keep current."
          }
        />
        {role === "MANAGER" && (
          <FormControl component="fieldset">
            <InputLabel shrink>Page permissions</InputLabel>
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
          </FormControl>
        )}
      </Box>
    </Edit>
  );
};
