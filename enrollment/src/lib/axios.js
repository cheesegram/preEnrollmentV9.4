import axios from "axios";

// in production, there's no localhost so we have to make this dynamic
const BASE_URL = import.meta.env.VITE_API_BASE_URL ||
  (import.meta.env.MODE === "development" ? "http://localhost:5001/api" : "/api");

const api = axios.create({
  baseURL: BASE_URL,
});

// Existing routes are unchanged; send the session when Python auth is enabled.
api.interceptors.request.use((config) => {
  const token = window.localStorage.getItem("token");
  if (token && token !== "dev-bypass-token") {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && !error.config?.url?.includes("/auth/admin/login")) {
      window.localStorage.removeItem("token");
      window.localStorage.removeItem("adminUser");
      if (window.location.pathname !== "/login") window.location.assign("/login");
    }
    return Promise.reject(error);
  },
);

export default api;
