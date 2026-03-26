import React from "react";
import { Create } from "@refinedev/mui";
import { useForm } from "@refinedev/react-hook-form";
import Box from "@mui/material/Box";
import TextField from "@mui/material/TextField";
import Switch from "@mui/material/Switch";
import FormControlLabel from "@mui/material/FormControlLabel";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import InputLabel from "@mui/material/InputLabel";
import FormControl from "@mui/material/FormControl";
import CircularProgress from "@mui/material/CircularProgress";
import Typography from "@mui/material/Typography";
import { getToken, getStoredAdmin } from "../../lib/admin-auth";
import { apiUrl } from "../../lib/api-base";

function toDatetimeLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${day}T${h}:${min}`;
}

export const EventCreatePage: React.FC = () => {
  const selfAdmin = getStoredAdmin();
  const [isPaidUI, setIsPaidUI] = React.useState(false);
  const [paymentRecipients, setPaymentRecipients] = React.useState<{ id: string; userName: string }[]>(
    [],
  );
  const [recipientsLoading, setRecipientsLoading] = React.useState(false);

  const {
    saveButtonProps,
    register,
    setValue,
    formState: { errors },
  } = useForm({
    refineCoreProps: {
      resource: "calendar-events",
      redirect: "list",
    },
    defaultValues: {
      sourceType: "MANUAL",
      title: "",
      description: "",
      location: "",
      capacity: "",
      startAt: "",
      endAt: "",
      isPaid: false,
      priceCents: "",
      currency: "AUD",
      paymentAccountAdminId: "",
    },
  });

  React.useEffect(() => {
    const token = getToken();
    if (!token || !selfAdmin) return;
    if (selfAdmin.role !== "ADMIN") {
      // Non-ADMIN: default payment recipient to self (avoid needing /admin-users).
      setPaymentRecipients([{ id: selfAdmin.id, userName: selfAdmin.userName } as any]);
      setValue("paymentAccountAdminId", selfAdmin.id);
      return;
    }
    setRecipientsLoading(true);
    fetch(apiUrl("/admin-users"), {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => {
        const admins = Array.isArray(data) ? data : [];
        setPaymentRecipients(
          admins
            .filter((a: any) => Array.isArray(a.permissions) && a.permissions.includes("CALENDAR_EVENTS"))
            .map((a: any) => ({ id: String(a.id), userName: String(a.userName) })),
        );
      })
      .catch(() => setPaymentRecipients([]))
      .finally(() => setRecipientsLoading(false));
  }, []);

  const handleStartBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const v = e.target.value?.trim() ?? "";
    if (!v) return;
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return;
    const end = new Date(d.getTime() + 60 * 60 * 1000);
    setValue("endAt", toDatetimeLocal(end));
  };

  return (
    <Create saveButtonProps={saveButtonProps} title="Create event">
      <Box component="form" sx={{ display: "flex", flexDirection: "column", gap: 2 }} autoComplete="off">
        <input type="hidden" {...register("sourceType")} value="MANUAL" />
        <TextField
          label="Title"
          {...register("title", { required: "Required" })}
          error={!!errors?.title}
          helperText={errors?.title?.message as string}
          fullWidth
          required
        />
        <TextField label="Description" {...register("description")} multiline minRows={3} fullWidth />
        <TextField
          label="Start (date-time)"
          type="datetime-local"
          {...register("startAt", { required: "Required" })}
          onBlur={handleStartBlur}
          error={!!errors?.startAt}
          helperText={errors?.startAt?.message as string}
          fullWidth
          required
          InputLabelProps={{ shrink: true }}
        />
        <TextField
          label="End (date-time)"
          type="datetime-local"
          {...register("endAt", { required: "Required" })}
          error={!!errors?.endAt}
          helperText={errors?.endAt?.message as string}
          fullWidth
          required
          InputLabelProps={{ shrink: true }}
        />
        <TextField label="Location" {...register("location")} fullWidth />
        <TextField
          label="Capacity (optional)"
          type="number"
          inputProps={{ min: 0 }}
          {...register("capacity")}
          fullWidth
        />

        <Box sx={{ mt: 1 }}>
          <FormControlLabel
            control={
              <Switch
                checked={isPaidUI}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setIsPaidUI(checked);
                  setValue("isPaid", checked);
                  if (!checked) {
                    setValue("priceCents", "");
                    setValue("paymentAccountAdminId", "");
                  }
                }}
              />
            }
            label="Paid event (requires checkout before approval)"
          />
        </Box>

        {isPaidUI && (
          <>
            <TextField
              label="Price (AUD cents, e.g. 100 = $1)"
              type="number"
              inputProps={{ min: 0 }}
              {...register("priceCents")}
              fullWidth
              required
              error={!!errors?.priceCents}
              helperText={(errors?.priceCents as any)?.message}
            />

            <input type="hidden" {...register("currency")} value="AUD" />

            <FormControl fullWidth>
              <InputLabel id="paymentRecipientLabel">Payment recipient manager</InputLabel>
              <Select
                labelId="paymentRecipientLabel"
                label="Payment recipient manager"
                defaultValue=""
                {...register("paymentAccountAdminId", { required: "Payment recipient is required" })}
              >
                {recipientsLoading && (
                  <MenuItem value="">
                    <CircularProgress size={16} /> Loading…
                  </MenuItem>
                )}
                {paymentRecipients.map((m) => (
                  <MenuItem key={m.id} value={m.id}>
                    {m.userName}
                  </MenuItem>
                ))}
              </Select>
              {errors?.paymentAccountAdminId && (
                <Typography variant="caption" color="error">
                  {(errors?.paymentAccountAdminId as any)?.message}
                </Typography>
              )}
            </FormControl>
          </>
        )}
      </Box>
    </Create>
  );
};
