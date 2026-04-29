import { http } from "./http";

export function listWebhooks(businessId) {
  return http.get("/api/webhooks", { params: { businessId } });
}

export function createWebhook(body) {
  return http.post("/api/webhooks", body);
}

export function updateWebhook(webhookId, body) {
  return http.put(`/api/webhooks/${webhookId}`, body);
}

export function testWebhook(webhookId) {
  return http.post(`/api/webhooks/${webhookId}/test`);
}

export function deleteWebhook(webhookId) {
  return http.delete(`/api/webhooks/${webhookId}`);
}
