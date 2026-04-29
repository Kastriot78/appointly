import { http } from "./http";

export function getApiErrorMessage(err) {
  const d = err?.response?.data;
  if (d?.message && typeof d.message === "string") return d.message;
  if (Array.isArray(d?.errors) && d.errors[0]) return String(d.errors[0]);
  if (typeof err?.message === "string") return err.message;
  return "Something went wrong";
}

export function register(body) {
  return http.post("/api/auth/register", body);
}

export function verifyEmail(body) {
  return http.post("/api/auth/verify-email", body);
}

export function resendVerification(body) {
  return http.post("/api/auth/resend-verification", body);
}

export function login(body) {
  return http.post("/api/auth/login", body);
}

export function verifyTwoFactor(body) {
  return http.post("/api/auth/verify-2fa", body);
}

export function resendTwoFactor(body) {
  return http.post("/api/auth/resend-2fa", body);
}

export function forgotPassword(body) {
  return http.post("/api/auth/forgot-password", body);
}

export function resetPassword(body) {
  return http.post("/api/auth/reset-password", body);
}

export function getStaffInvitePreview(token) {
  return http.get(
    `/api/auth/staff-invite/${encodeURIComponent(token)}`,
  );
}

export function acceptStaffInvite(body) {
  return http.post("/api/auth/staff-invite/accept", body);
}
