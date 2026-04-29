import { http } from "./http";

/** Public — saves newsletter email on the server. */
export function subscribeNewsletter(body) {
  return http.post("/api/newsletter/subscribe", body);
}

/** Admin — list newsletter subscribers (emails). */
export function getNewsletterSubscribers() {
  return http.get("/api/newsletter/subscribers");
}
