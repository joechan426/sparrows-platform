import { Edit } from "@refinedev/mui";
import { useForm } from "@refinedev/react-hook-form";
import { Box, TextField } from "@mui/material";

export const TeamEdit = () => {
  const {
    saveButtonProps,
    register,
    formState: { errors },
    refineCore: { queryResult },
  } = useForm({
    refineCoreProps: {
      redirect: "list",
    },
  });

  const record = (queryResult?.data as any)?.data ?? queryResult?.data;

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
