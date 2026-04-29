import { getApiOrigin } from "../api/http";

const STORAGE_KEY = "appointly_slot_hold_session_v1";

function deleteUrl(holdId, holderKey) {
  const origin = getApiOrigin();
  return `${origin}/api/bookings/slot-hold/${encodeURIComponent(holdId)}?holderKey=${encodeURIComponent(holderKey)}`;
}

/** Remember active hold so we can release it after refresh / tab close. */
export function persistActiveSlotHold(holdId, holderKey) {
  if (!holdId || !holderKey) return;
  try {
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        holdId: String(holdId),
        holderKey: String(holderKey),
      }),
    );
  } catch {
    /* private / blocked storage */
  }
}

export function clearActiveSlotHoldStorage() {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Best-effort release when the page is being unloaded (refresh, close tab).
 * Uses keepalive so the request is more likely to complete during teardown.
 */
export function tryReleaseActiveSlotHoldKeepalive() {
  let raw;
  try {
    raw = sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return;
  }
  if (!raw) return;
  let holdId;
  let holderKey;
  try {
    const p = JSON.parse(raw);
    holdId = p.holdId;
    holderKey = p.holderKey;
  } catch {
    clearActiveSlotHoldStorage();
    return;
  }
  if (!holdId || !holderKey) {
    clearActiveSlotHoldStorage();
    return;
  }
  clearActiveSlotHoldStorage();
  try {
    fetch(deleteUrl(holdId, holderKey), { method: "DELETE", keepalive: true });
  } catch {
    /* ignore */
  }
}

/** Release a hold left over from a previous load (e.g. pagehide did not run). */
export async function releaseActiveSlotHoldFromStorage() {
  let raw;
  try {
    raw = sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return;
  }
  if (!raw) return;
  let holdId;
  let holderKey;
  try {
    const p = JSON.parse(raw);
    holdId = p.holdId;
    holderKey = p.holderKey;
  } catch {
    clearActiveSlotHoldStorage();
    return;
  }
  if (!holdId || !holderKey) {
    clearActiveSlotHoldStorage();
    return;
  }
  clearActiveSlotHoldStorage();
  try {
    await fetch(deleteUrl(holdId, holderKey), { method: "DELETE" });
  } catch {
    /* hold may already be gone */
  }
}

export function registerSlotHoldUnloadRelease() {
  const onPageHide = () => tryReleaseActiveSlotHoldKeepalive();
  window.addEventListener("pagehide", onPageHide);
  return () => window.removeEventListener("pagehide", onPageHide);
}
