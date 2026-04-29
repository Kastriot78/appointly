const KEY_PREFIX = "appointly_booking_draft_v1:";
const DRAFT_VERSION = 1;
/** Keep drafts long enough to resume later in the week, but not forever. */
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function storageKey(businessId) {
  return `${KEY_PREFIX}${String(businessId)}`;
}

/**
 * @param {string|number|null|undefined} businessId
 * @returns {object|null}
 */
export function loadBookingDraft(businessId) {
  if (businessId == null || String(businessId).length === 0) return null;
  try {
    const raw = localStorage.getItem(storageKey(businessId));
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.v !== DRAFT_VERSION) return null;
    if (String(data.businessId) !== String(businessId)) return null;
    const savedAt = Number(data.savedAt);
    if (!Number.isFinite(savedAt) || Date.now() - savedAt > MAX_AGE_MS) {
      localStorage.removeItem(storageKey(businessId));
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

/**
 * @param {string|number|null|undefined} businessId
 * @param {object} payload
 */
export function saveBookingDraft(businessId, payload) {
  if (businessId == null || String(businessId).length === 0) return;
  try {
    const merged = {
      v: DRAFT_VERSION,
      ...payload,
      businessId: String(businessId),
      savedAt: Date.now(),
    };
    localStorage.setItem(storageKey(businessId), JSON.stringify(merged));
  } catch {
    /* quota / private mode */
  }
}

/**
 * @param {string|number|null|undefined} businessId
 */
export function clearBookingDraft(businessId) {
  if (businessId == null || String(businessId).length === 0) return;
  try {
    localStorage.removeItem(storageKey(businessId));
  } catch {
    /* ignore */
  }
}
