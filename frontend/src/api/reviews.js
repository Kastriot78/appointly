import { http } from "./http";

/**
 * Create a review for a business (authenticated).
 * @param {{ businessId: string, rating: number, text: string }} body
 */
export function createReview(body) {
  return http.post("/api/reviews", body);
}

/** Reviews you wrote (customers). */
export function listMyReviews() {
  return http.get("/api/reviews/mine");
}

/** Reviews on your businesses (tenant / admin). */
export function listManagedReviews() {
  return http.get("/api/reviews/managed");
}

/** Owner reply to a review. */
export function replyToReview(reviewId, text) {
  return http.patch(`/api/reviews/${reviewId}/reply`, { text });
}
