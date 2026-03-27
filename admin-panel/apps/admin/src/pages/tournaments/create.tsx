import { Create } from "../../components/SaasRefineMui";
import { useForm } from "@refinedev/react-hook-form";
import { Box, TextField } from "@mui/material";

export const TournamentCreate = () => {
  const {
    saveButtonProps,
    register,
    formState: { errors },
  } = useForm({
    refineCoreProps: {
      redirect: "show", // 儲存後自動去 /tournaments/:id
    },
  });

  return (
    <Create saveButtonProps={saveButtonProps}>
      <Box
        component="form"
        sx={{ display: "flex", flexDirection: "column", gap: 2 }}
        autoComplete="off"
      >
        <TextField
          label="Tournament Name"
          {...register("name", { required: "Required" })}
          error={!!errors?.name}
          helperText={errors?.name?.message as string}
          fullWidth
        />

        <TextField label="Location" {...register("location")} fullWidth />

        <TextField
          label="Notes"
          {...register("notes")}
          multiline
          minRows={3}
          fullWidth
        />
      </Box>
    </Create>
  );
};
