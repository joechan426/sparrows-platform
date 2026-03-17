/**
 * Axios instance that adds Authorization: Bearer <token> for /api requests (except login).
 * Refine simple-rest dataProvider uses axios, not fetch, so we must use this with the dataProvider.
 */

import axios from "axios";
import type { HttpError } from "@refinedev/core";
import { getToken } from "./admin-auth";
import { getApiBase } from "./api-base";

const instance = axios.create({ baseURL: getApiBase() });

instance.interceptors.request.use((config) => {
  const url = config.url ?? "";
  const isLogin = url.includes("admin-auth/login");
  if (!isLogin) {
    const token = getToken();
    if (token) {
      config.headers = config.headers ?? {};
      config.headers["Authorization"] = `Bearer ${token}`;
    }
  }
  return config;
});

instance.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const customError: HttpError = {
      ...error,
      message: error.response?.data?.message,
      status,
      statusCode: status,
    };
    return Promise.reject(customError);
  }
);

export { instance as axiosWithAuth };
