import React from "react";
import { useLogin } from "@refinedev/core";
import { useForm } from "react-hook-form";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Container from "@mui/material/Container";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import FormControlLabel from "@mui/material/FormControlLabel";
import Checkbox from "@mui/material/Checkbox";

type FormValues = { userName: string; password: string; rememberMe: boolean };

export const LoginPage: React.FC<{
  title?: React.ReactNode;
}> = ({ title }) => {
  const { mutate: login, isPending, error: loginError } = useLogin<FormValues>();
  const { register, handleSubmit, formState: { errors }, watch } = useForm<FormValues>({
    defaultValues: { rememberMe: true },
  });
  const rememberMe = watch("rememberMe");

  const onSubmit = (data: FormValues) => {
    login(
      { userName: data.userName.trim(), password: data.password, rememberMe: data.rememberMe },
      {
        onError: () => {},
      }
    );
  };

  const errorMessage =
    loginError && (loginError as { message?: string })?.message
      ? (loginError as { message: string }).message
      : loginError
        ? "Login failed. Please check user name and password."
        : null;

  return (
    <Box
      component="main"
      sx={{
        backgroundColor: (theme) => theme.palette.background.default,
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Container maxWidth="sm">
        <Box sx={{ display: "flex", justifyContent: "center", marginBottom: 2 }}>
          {title}
        </Box>
        <Card>
          <CardContent sx={{ pt: 3, "&:last-child": { pb: 3 } }}>
            <Typography component="h1" variant="h5" align="center" gutterBottom>
              Sign in to your account
            </Typography>
            {errorMessage && (
              <Typography color="error" sx={{ textAlign: "center", mb: 1 }}>
                {errorMessage}
              </Typography>
            )}
            <Box component="form" onSubmit={handleSubmit(onSubmit)} sx={{ mt: 2, display: "flex", flexDirection: "column", gap: 2 }}>
              <TextField
                {...register("userName", { required: "User name is required" })}
                id="userName"
                label="User name"
                type="text"
                autoComplete="username"
                error={!!errors.userName}
                helperText={errors.userName?.message}
                fullWidth
                autoFocus
              />
              <TextField
                {...register("password", { required: "Password is required" })}
                id="password"
                label="Password"
                type="password"
                autoComplete="current-password"
                error={!!errors.password}
                helperText={errors.password?.message}
                fullWidth
              />
              <FormControlLabel
                control={<Checkbox {...register("rememberMe")} />}
                label="Remember me (skip login on this device next time)"
              />
              <Button type="submit" fullWidth variant="contained" size="large" disabled={isPending} sx={{ mt: 1 }}>
                {isPending ? "Signing in…" : "Sign in"}
              </Button>
            </Box>
          </CardContent>
        </Card>
      </Container>
    </Box>
  );
}
