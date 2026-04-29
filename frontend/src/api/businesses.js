import { http } from "./http";

export function listBusinesses(params) {
  return http.get("/api/businesses", { params });
}

/**
 * Public discover / book page — no auth.
 * @param {Record<string, string|number|undefined>} [params] — e.g. priceMin, priceMax, availableOn (YYYY-MM-DD), clientNowMinutes (0–1439)
 */
export function listPublicBusinesses(params) {
  return http.get("/api/businesses/public", { params: params || {} });
}

const formDataTransform = {
  transformRequest: [
    (data, headers) => {
      if (data instanceof FormData) {
        delete headers["Content-Type"];
      }
      return data;
    },
  ],
};

/**
 * Create business. Pass a plain object (JSON) or FormData with optional `logo` / `cover` files.
 */
export function createBusiness(body) {
  if (body instanceof FormData) {
    return http.post("/api/businesses", body, formDataTransform);
  }
  return http.post("/api/businesses", body);
}

export function getBusiness(id) {
  return http.get(`/api/businesses/${id}`);
}

/** Customers who booked this business — tenant/admin; aggregated reservation stats. */
export function getBusinessCustomers(businessId) {
  return http.get(`/api/businesses/${businessId}/customers`);
}

/** Per-customer booking timeline (services, staff, notes) for CRM — tenant/admin. */
export function getBusinessCustomerServiceHistory(businessId, customerId) {
  return http.get(
    `/api/businesses/${businessId}/customers/${customerId}/service-history`,
  );
}

/** Tenant/admin — periods when the business does not accept new bookings. */
export function listClosingDays(businessId) {
  return http.get(`/api/businesses/${businessId}/closing-days`);
}

export function createClosingDay(businessId, body) {
  return http.post(`/api/businesses/${businessId}/closing-days`, body);
}

export function updateClosingDay(businessId, closingId, body) {
  return http.put(
    `/api/businesses/${businessId}/closing-days/${closingId}`,
    body,
  );
}

export function deleteClosingDay(businessId, closingId) {
  return http.delete(
    `/api/businesses/${businessId}/closing-days/${closingId}`,
  );
}

/** Tenant/admin — past customer email broadcasts (read-only history). */
export function listCustomerEmailBroadcasts(businessId) {
  return http.get(`/api/businesses/${businessId}/customer-email-broadcasts`);
}

/** Send one email blast to all customers who have booked this business. */
export function sendCustomerEmailBroadcast(businessId, body) {
  return http.post(
    `/api/businesses/${businessId}/customer-email-broadcasts`,
    body,
  );
}

export function updateBusiness(id, body) {
  return http.put(`/api/businesses/${id}`, body);
}

export function deleteBusiness(id) {
  return http.delete(`/api/businesses/${id}`);
}

/** Admin — count of businesses awaiting approval. */
export function getPendingBusinessCount() {
  return http.get("/api/businesses/admin/pending-count");
}

/** Admin — approve or revoke public listing on Find & Book. */
export function setBusinessApproval(id, approved) {
  return http.put(`/api/businesses/${id}/approval`, { approved });
}

/** Public booking page — no auth. */
export function getBusinessBySlugPublic(slug) {
  return http.get(
    `/api/businesses/slug/${encodeURIComponent(slug)}`,
  );
}

/** Optional: change logo/cover from settings (single file). */
export function uploadBusinessImage(file) {
  const fd = new FormData();
  fd.append("file", file);
  return http.post("/api/upload/business-image", fd, formDataTransform);
}

export function listServices(businessId) {
  return http.get(`/api/businesses/${businessId}/services`);
}

export function createService(businessId, body) {
  return http.post(`/api/businesses/${businessId}/services`, body);
}

export function updateService(businessId, serviceId, body) {
  return http.put(
    `/api/businesses/${businessId}/services/${serviceId}`,
    body,
  );
}

/** Same % off every service for the given inclusive date range, or { clear: true } to remove all. */
export function applyPromotionBulk(businessId, body) {
  return http.post(
    `/api/businesses/${businessId}/services/promotion-bulk`,
    body,
  );
}

export function deleteServiceApi(businessId, serviceId) {
  return http.delete(
    `/api/businesses/${businessId}/services/${serviceId}`,
  );
}

export function listStaff(businessId) {
  return http.get(`/api/businesses/${businessId}/staff`);
}

/** Per-staff booking counts (today, this week, this month) — business managers only. */
export function getStaffBookingStats(businessId) {
  return http.get(`/api/businesses/${businessId}/staff/booking-stats`);
}

/** Tenant — smart staff ranking preview for “Anyone available”. */
export function getStaffSmartRanking(businessId) {
  return http.get(`/api/businesses/${businessId}/staff/smart-ranking`);
}

/** Tenant — all review texts for one staff (smart ranking modal). */
export function getStaffSmartRankingFeedback(businessId, staffId) {
  return http.get(
    `/api/businesses/${businessId}/staff/${staffId}/smart-ranking-feedback`,
  );
}

export function createStaff(businessId, body) {
  return http.post(`/api/businesses/${businessId}/staff`, body);
}

export function updateStaff(businessId, staffId, body) {
  return http.put(`/api/businesses/${businessId}/staff/${staffId}`, body);
}

export function deleteStaffApi(businessId, staffId) {
  return http.delete(`/api/businesses/${businessId}/staff/${staffId}`);
}

export function inviteStaffDashboard(businessId, staffId, body) {
  return http.post(
    `/api/businesses/${businessId}/staff/${staffId}/invite-dashboard`,
    body || {},
  );
}

export function revokeStaffDashboard(businessId, staffId) {
  return http.post(
    `/api/businesses/${businessId}/staff/${staffId}/revoke-dashboard`,
    {},
  );
}

/** Public — validate coupon for booking modal (no per-customer check). */
export function validateBusinessCoupon(businessId, body) {
  return http.post(`/api/businesses/${businessId}/coupons/validate`, body);
}

export function listCoupons(businessId) {
  return http.get(`/api/businesses/${businessId}/coupons`);
}

export function createCoupon(businessId, body) {
  return http.post(`/api/businesses/${businessId}/coupons`, body);
}

export function updateCoupon(businessId, couponId, body) {
  return http.put(`/api/businesses/${businessId}/coupons/${couponId}`, body);
}

export function deleteCouponApi(businessId, couponId) {
  return http.delete(`/api/businesses/${businessId}/coupons/${couponId}`);
}

export function sendCouponEmailApi(businessId, couponId, body) {
  return http.post(
    `/api/businesses/${businessId}/coupons/${couponId}/send-email`,
    body,
  );
}
