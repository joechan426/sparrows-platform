import { Edit } from "../../components/SaasRefineMui";
import { useForm } from "@refinedev/react-hook-form";
import { Box, TextField, MenuItem } from "@mui/material";

export const TournamentEdit = () => {
  const {
    saveButtonProps,
    register,
    formState: { errors },
    refineCore: { query },
  } = useForm({
    refineCoreProps: {
      redirect: "show",
    },
  });

  const record = (query?.data as any)?.data ?? query?.data;

  return (
    <Edit saveButtonProps={saveButtonProps}>
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

        <TextField
          label="Type"
          select
          defaultValue={record?.type ?? ""}
          {...register("type")}
          fullWidth
        >
          <MenuItem value="CUP">CUP</MenuItem>
          <MenuItem value="LEAGUE">LEAGUE</MenuItem>
        </TextField>

        <TextField label="Location" {...register("location")} fullWidth />

        <TextField
          label="Notes"
          {...register("notes")}
          multiline
          minRows={3}
          fullWidth
        />
      </Box>
    </Edit>
  );
};