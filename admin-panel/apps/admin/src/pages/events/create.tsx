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
import { getToken } from "../../lib/admin-auth";
import { apiUrl } from "../../lib/api-base";

function toDatetimeLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${day}T${h}:${min}`;
}

type PaymentProfileOption = { id: string; nickname: string };

export const EventCreatePage: React.FC = () => {
  const [isPaidUI, setIsPaidUI] = React.useState(false);
  const [paymentProfiles, setPaymentProfiles] = React.useState<PaymentProfileOption[]>([]);
  const [profilesLoading, setProfilesLoading] = React.useState(false);

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
      priceDollars: "",
      currency: "AUD",
      paymentProfileId: "",
    },
  });

  React.useEffect(() => {
    const token = getToken();
    if (!token) return;
    setProfilesLoading(true);
    fetch(apiUrl("/payment-profiles?forEventPicker=1"), {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => {
        const list = Array.isArray(data) ? data : [];
        setPaymentProfiles(
          list.map((p: { id?: string; nickname?: string }) => ({
            id: String(p.id),
            nickname: String(p.nickname),
          })),
        );
      })
      .catch(() => setPaymentProfiles([]))
      .finally(() => setProfilesLoading(false));
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
                    setValue("priceDollars", "");
                    setValue("paymentProfileId", "");
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
              label="Price (AUD dollars, e.g. 25.00)"
              type="text"
              inputProps={{ inputMode: "decimal" }}
              {...register("priceDollars", { required: "Price is required for paid events" })}
              fullWidth
              required
              error={!!errors?.priceDollars}
              helperText={(errors?.priceDollars as { message?: string })?.message}
            />

            <input type="hidden" {...register("currency")} value="AUD" />

            <FormControl fullWidth>
              <InputLabel id="paymentProfileLabel">Payment account (nickname)</InputLabel>
              <Select
                labelId="paymentProfileLabel"
                label="Payment account (nickname)"
                defaultValue=""
                {...register("paymentProfileId", { required: "Payment account is required" })}
              >
                {profilesLoading && (
                  <MenuItem value="">
                    <CircularProgress size={16} /> Loading…
                  </MenuItem>
                )}
                {!profilesLoading && paymentProfiles.length === 0 && (
                  <MenuItem value="" disabled>
                    No payment profiles — ask a Super Manager to create one
                  </MenuItem>
                )}
                {paymentProfiles.map((p) => (
                  <MenuItem key={p.id} value={p.id}>
                    {p.nickname}
                  </MenuItem>
                ))}
              </Select>
              {errors?.paymentProfileId && (
                <Typography variant="caption" color="error">
                  {(errors?.paymentProfileId as { message?: string })?.message}
                </Typography>
              )}
            </FormControl>
          </>
        )}
      </Box>
    </Create>
  );
};
