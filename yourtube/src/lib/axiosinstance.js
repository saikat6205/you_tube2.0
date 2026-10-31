import axios from "axios";
const axiosInstance = axios.create({
  baseURL: process.env.BACKEND_URL || "http://localhost:5000",
});

axiosInstance.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    // Developer-only simulation so new-city/new-state OTP can be exercised on
    // localhost. Disabled unless NEXT_PUBLIC_DEV_GEO=true, and the backend only
    // accepts the header over a loopback connection.
    if (
      process.env.NODE_ENV !== "production" &&
      process.env.NEXT_PUBLIC_DEV_GEO === "true"
    ) {
      const devGeoIp = localStorage.getItem("yourtube.devGeoIp");
      if (devGeoIp) {
        config.headers["X-Forwarded-For"] = devGeoIp;
      }
    }
  }
  return config;
});

export default axiosInstance;