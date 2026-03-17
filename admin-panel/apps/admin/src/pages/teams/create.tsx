import { Create } from "@refinedev/mui";
import { useForm } from "@refinedev/react-hook-form";
import { Box, TextField } from "@mui/material";

export const TeamCreate = () => {
  const {
    saveButtonProps,
    register,
    formState: { errors },
  } = useForm({
    refineCoreProps: {
      redirect: "list",
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
          label="Team Name"
          {...register("name", { required: "Required" })}
          error={!!errors?.name}
          helperText={errors?.name?.message as string}
          fullWidth
        />
      </Box>
    </Create>
  );
};
