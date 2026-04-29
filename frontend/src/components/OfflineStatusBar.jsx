import { useEffect, useState } from "react";
import {
  flushOfflineQueue,
  getOfflineQueueCount,
  getOfflineQueueItems,
  clearOfflineQueue,
} from "../api/http";

const OfflineStatusBar = () => {
  const [isOnline, setIsOnline] = useState(
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const [queuedCount, setQueuedCount] = useState(getOfflineQueueCount());
  const [queuedItems, setQueuedItems] = useState(getOfflineQueueItems());
  const [justSynced, setJustSynced] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const onQueueChanged = (evt) => {
      const n = Number(evt?.detail?.count);
      setQueuedCount(Number.isFinite(n) ? n : getOfflineQueueCount());
      setQueuedItems(getOfflineQueueItems());
    };
    const onOffline = () => {
      setIsOnline(false);
      setJustSynced(false);
    };
    const onOnline = async () => {
      setIsOnline(true);
      const result = await flushOfflineQueue().catch(() => null);
      setQueuedCount(getOfflineQueueCount());
      setQueuedItems(getOfflineQueueItems());
      if (result?.flushed > 0) {
        setJustSynced(true);
        setTimeout(() => setJustSynced(false), 3500);
      }
    };
    window.addEventListener("appointly:offline-queue-changed", onQueueChanged);
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    return () => {
      window.removeEventListener(
        "appointly:offline-queue-changed",
        onQueueChanged,
      );
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
    };
  }, []);

  if (isOnline && queuedCount === 0 && !justSynced) return null;

  const syncNow = async () => {
    const result = await flushOfflineQueue().catch(() => null);
    setQueuedCount(getOfflineQueueCount());
    setQueuedItems(getOfflineQueueItems());
    if (result?.flushed > 0) {
      setJustSynced(true);
      setTimeout(() => setJustSynced(false), 3500);
    }
  };

  return (
    <div className={`offline-bar-wrap ${isOnline ? "online" : "offline"}`}>
      <div className={`offline-bar ${isOnline ? "online" : "offline"}`}>
        {!isOnline ? (
          <span>
            Offline mode: changes will sync later
            {queuedCount > 0 ? ` (${queuedCount} queued)` : ""}.
          </span>
        ) : justSynced ? (
          <span>Back online: queued changes synced.</span>
        ) : (
          <span>
            Online: {queuedCount} queued change{queuedCount === 1 ? "" : "s"}{" "}
            waiting to sync.
          </span>
        )}
        {queuedCount > 0 ? (
          <button
            type="button"
            className="offline-bar-btn"
            onClick={() => setExpanded((x) => !x)}
          >
            {expanded ? "Hide queue" : "View queue"}
          </button>
        ) : null}
      </div>
      {expanded && queuedCount > 0 ? (
        <div className="offline-queue-panel">
          <div className="offline-queue-head">
            <strong>Queued actions</strong>
            <div className="offline-queue-actions">
              <button type="button" className="offline-bar-btn" onClick={syncNow}>
                Sync now
              </button>
              <button
                type="button"
                className="offline-bar-btn danger"
                onClick={() => {
                  clearOfflineQueue();
                  setQueuedCount(0);
                  setQueuedItems([]);
                  setExpanded(false);
                }}
              >
                Clear
              </button>
            </div>
          </div>
          <ul>
            {queuedItems.map((item) => (
              <li key={item.id}>
                <span>{String(item.method || "").toUpperCase()}</span>{" "}
                <code>{item.url}</code>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
};

export default OfflineStatusBar;
