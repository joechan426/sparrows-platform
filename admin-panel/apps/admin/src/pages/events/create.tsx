import React from "react";
import { Create } from "@refinedev/mui";
import { useForm } from "@refinedev/react-hook-form";
import Box from "@mui/material/Box";
import TextField from "@mui/material/TextField";

function toDatetimeLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${day}T${h}:${min}`;
}

export const EventCreatePage: React.FC = () => {
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
    },
  });

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
      </Box>
    </Create>
  );
};
