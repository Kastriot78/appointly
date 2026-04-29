import { http } from "./http";

export function getMe() {
  return http.get("/api/users/me");
}

export function updateProfile(body) {
  return http.put("/api/users/me", body);
}

export function changePassword(body) {
  return http.put("/api/users/me/password", body);
}

export function confirmEmailChange(body) {
  return http.post("/api/users/me/confirm-email", body);
}

export function cancelPendingEmail() {
  return http.delete("/api/users/me/pending-email");
}

export function resendEmailChange() {
  return http.post("/api/users/me/resend-email-change");
}

export function startTwoFactor(action) {
  return http.post("/api/users/me/2fa/start", { action });
}

export function confirmTwoFactor(action, code) {
  return http.post("/api/users/me/2fa/confirm", { action, code });
}

export function deleteAccount(confirmEmail) {
  return http.delete("/api/users/me", { data: { confirmEmail } });
}

/** Admin-only: create pending admin and send verification code email. */
export function createAdminUser(body) {
  return http.post("/api/users/admin/accounts", body);
}

/** Admin-only: list managed platform accounts. */
export function listManagedUsers(params) {
  return http.get("/api/users/admin/accounts", { params: params || {} });
}

/** Admin-only: remove one managed platform account. */
export function deleteManagedUser(id) {
  return http.delete(`/api/users/admin/accounts/${encodeURIComponent(id)}`);
}

/** Admin-only: change managed account role (admin/tenant/customer). */
export function updateManagedUserRole(id, role) {
  return http.put(`/api/users/admin/accounts/${encodeURIComponent(id)}/role`, {
    role,
  });
}
