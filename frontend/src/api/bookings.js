import { http } from "./http";

/**
 * Public — slot grid for booking modal.
 * @param {{ businessId: string, serviceId: string, staffId: string, date: string }} params
 *   date: YYYY-MM-DD; staffId: Mongo id or "any"
 */
export function getAvailability(params) {
  return http.get("/api/bookings/availability", { params });
}

/**
 * Public — per-day slot counts for calendar heatmap (busy vs free).
 * @param {{ businessId: string, serviceIds: string, staffId: string, from: string, to: string, clientTodayYmd?: string, clientNowMinutes?: number }} params
 */
export function getAvailabilitySummary(params) {
  return http.get("/api/bookings/availability-summary", { params });
}

/** Short-lived checkout hold (guests and signed-in customers). */
export function createSlotHold(body) {
  return http.post("/api/bookings/slot-hold", body);
}

export function releaseSlotHold(holdId, holderKey) {
  return http.delete(`/api/bookings/slot-hold/${holdId}`, {
    params: { holderKey },
  });
}

/**
 * Create booking (authenticated).
 */
export function createBooking(body) {
  return http.post("/api/bookings", body);
}

/** Join waitlist for a fully booked slot (optional auth — guests send name + email). */
export function joinWaitlist(body) {
  return http.post("/api/bookings/waitlist", body);
}

/** Resolve ?waitlist= token from email (public). */
export function getWaitlistOffer(token) {
  return http.get(
    `/api/bookings/waitlist-offer/${encodeURIComponent(String(token || "").trim())}`,
  );
}

/** Confirm a temporary hold after a conflict suggestion (pending_confirmation). */
export function confirmPendingBooking(bookingId) {
  return http.post(`/api/bookings/${bookingId}/confirm-pending`);
}

/** Release a temporary hold without booking. */
export function declinePendingBooking(bookingId) {
  return http.post(`/api/bookings/${bookingId}/decline-pending`);
}

/** Customer — bookings you made as a client. */
export function listMyBookings(params) {
  return http.get("/api/bookings/mine", { params });
}

/**
 * Smart “book again” suggestions from completed visits.
 * @param {{ businessId?: string }} params — omit for cross-business list (e.g. dashboard)
 */
export function getMyServiceSuggestions(params) {
  return http.get("/api/bookings/mine/service-suggestions", { params });
}

/** Visits eligible for a private staff review (signed-in customer, scoped business). */
export function getStaffReviewEligible(params) {
  return http.get("/api/bookings/mine/staff-review-eligible", { params });
}

/** Total spent per business (completed visits only) for the current user. */
export function getMySpendingByBusiness() {
  return http.get("/api/bookings/my-spending");
}

/** Tenant / admin — bookings for business(es) you manage. */
export function listManagedBookings(params) {
  return http.get("/api/bookings/managed", { params });
}

/**
 * Tenant/staff — email every distinct customer who has an active booking on a calendar day.
 * @param {{ date: string, subject: string, description: string, businessId?: string }} body — date YYYY-MM-DD
 */
export function notifyBookingsForDay(body) {
  return http.post("/api/bookings/managed/notify-day", body);
}

/**
 * Tenant/staff — email one booking’s customer (subject + message body).
 */
export function notifyBookingCustomer(bookingId, body) {
  return http.post(`/api/bookings/${bookingId}/notify-customer`, body);
}

export function cancelBooking(bookingId) {
  return http.put(`/api/bookings/${bookingId}`, { status: "cancelled" });
}

/** Restore a booking cancelled within the last 30 seconds (customer or same business). */
export function undoCancelBooking(bookingId) {
  return http.post(`/api/bookings/${bookingId}/undo-cancel`);
}

/** Tenant/admin — mark appointment outcome after the slot has ended. */
export function markBookingOutcome(bookingId, status) {
  return http.put(`/api/bookings/${bookingId}`, { status });
}

/**
 * Move booking to another slot (same service & staff).
 * @param {{ date: string, startTime: string }} body — date YYYY-MM-DD, startTime HH:mm
 */
export function rescheduleBooking(bookingId, body) {
  return http.put(`/api/bookings/${bookingId}/reschedule`, body);
}
