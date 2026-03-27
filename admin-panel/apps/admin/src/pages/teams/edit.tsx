import { Edit } from "../../components/SaasRefineMui";
import { useForm } from "@refinedev/react-hook-form";
import { Box, TextField } from "@mui/material";

export const TeamEdit = () => {
  const {
    saveButtonProps,
    register,
    formState: { errors },
    refineCore: { query },
  } = useForm({
    refineCoreProps: {
      redirect: "list",
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
          label="Team Name"
          {...register("name", { required: "Required" })}
          error={!!errors?.name}
          helperText={errors?.name?.message as string}
          fullWidth
        />
      </Box>
    </Edit>
  );
};
