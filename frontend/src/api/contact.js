import { http } from "./http";

/** Public — submit contact form; persists on server. */
export function submitContactMessage(body) {
  return http.post("/api/contact/messages", body);
}

/** Admin — list contact form submissions. */
export function getContactMessages() {
  return http.get("/api/contact/messages");
}
