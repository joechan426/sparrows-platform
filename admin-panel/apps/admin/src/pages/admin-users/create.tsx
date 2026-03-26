import { Create } from "@refinedev/mui";
import { useForm } from "@refinedev/react-hook-form";
import {
  Box,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormGroup,
  FormControlLabel,
  Checkbox,
  Typography,
} from "@mui/material";
import { validateAdminPassword } from "../../lib/password-rules";

const MODULES = [
  { value: "TOURNAMENTS", label: "Tournaments" },
  { value: "TEAMS", label: "Teams" },
  { value: "CALENDAR_EVENTS", label: "Events" },
  { value: "MEMBERS", label: "Members" },
  { value: "PAYMENT_PROFILES", label: "Payment profiles" },
] as const;

export const AdminUserCreate: React.FC = () => {
  type AdminUserCreateForm = {
    userName: string;
    password: string;
    role: "ADMIN" | "SUPER_MANAGER" | "MANAGER";
    permissions: string[];
  };
  const {
    saveButtonProps,
    register,
    formState: { errors },
    setValue,
    watch,
  } = useForm<AdminUserCreateForm>({
    refineCoreProps: { redirect: "list" },
    defaultValues: { userName: "", password: "", role: "MANAGER", permissions: [] },
  });

  const role = watch("role");
  const permissions = watch("permissions") ?? [];
  const password = watch("password");
  const passwordValidation = typeof password === "string" && password.length > 0 ? validateAdminPassword(password) : null;
  const passwordError = passwordValidation && !passwordValidation.ok ? passwordValidation.message : (errors?.password?.message as string);

  const handlePermissionToggle = (module: string) => {
    const next = permissions.includes(module)
      ? permissions.filter((p: string) => p !== module)
      : [...permissions, module];
    setValue("permissions", next, { shouldDirty: true });
  };

  return (
    <Create saveButtonProps={{ ...saveButtonProps, disabled: saveButtonProps.disabled || !!(passwordValidation && !passwordValidation.ok) }}>
      <Box component="form" sx={{ display: "flex", flexDirection: "column", gap: 2 }} autoComplete="off">
        <TextField
          label="User name"
          {...register("userName", { required: "Required" })}
          error={!!errors?.userName}
          helperText={(errors?.userName?.message as string) ?? ""}
          fullWidth
        />
        <TextField
          label="Password"
          type="password"
          {...register("password", { required: "Required" })}
          error={!!errors?.password || !!(passwordValidation && !passwordValidation.ok)}
          helperText={passwordError ?? "At least 8 characters with letter, number and special symbol"}
          fullWidth
        />
        <FormControl fullWidth>
          <InputLabel>Role</InputLabel>
          <Select
            label="Role"
            value={role}
            onChange={(e) =>
              setValue("role", e.target.value as "ADMIN" | "SUPER_MANAGER" | "MANAGER", { shouldDirty: true })
            }
          >
            <MenuItem value="MANAGER">Manager</MenuItem>
            <MenuItem value="SUPER_MANAGER">Super Manager</MenuItem>
            <MenuItem value="ADMIN">Admin</MenuItem>
          </Select>
        </FormControl>
        {(role === "MANAGER" || role === "SUPER_MANAGER") && (
          <FormControl component="fieldset">
            <InputLabel shrink>Page permissions (Manager / Super Manager)</InputLabel>
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
            <Box sx={{ pt: 1.5, mt: 1, borderTop: 1, borderColor: "divider" }}>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                Admin users (user management) — only an Admin can grant or remove this when creating an account.
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
          </FormControl>
        )}
      </Box>
    </Create>
  );
};
