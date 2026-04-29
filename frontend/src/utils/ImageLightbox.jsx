import { useEffect, useState, useCallback, useRef } from "react";

/**
 * Accessible, responsive image lightbox with keyboard (←/→/Esc) + touch
 * swipe navigation. Shows a counter and an optional caption. Meant to be
 * dropped next to any image grid — give it the full array and the starting
 * index, and it takes over.
 *
 * @param {object} props
 * @param {Array<{url: string, caption?: string}>} props.images
 * @param {number} props.index — 0-based starting index
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 * @param {(nextIndex: number) => void} props.onIndexChange
 * @param {string} [props.alt] — fallback alt text
 */
const ImageLightbox = ({
  images,
  index,
  open,
  onClose,
  onIndexChange,
  alt = "",
}) => {
  const list = Array.isArray(images) ? images : [];
  const count = list.length;
  const safeIndex = Math.min(Math.max(0, index || 0), Math.max(0, count - 1));
  const current = list[safeIndex];

  const [loadedIndex, setLoadedIndex] = useState(null);
  const [pendingDir, setPendingDir] = useState(null);
  const touchStartXRef = useRef(null);
  const touchStartYRef = useRef(null);

  const go = useCallback(
    (dir) => {
      if (count <= 1) return;
      setPendingDir(dir > 0 ? "next" : "prev");
      const next = (safeIndex + dir + count) % count;
      onIndexChange?.(next);
    },
    [count, safeIndex, onIndexChange],
  );

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
      else if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, go, onClose]);

  if (!open || !current) return null;
  const loaded = loadedIndex === safeIndex;

  const handleTouchStart = (e) => {
    const t = e.changedTouches?.[0];
    if (!t) return;
    touchStartXRef.current = t.clientX;
    touchStartYRef.current = t.clientY;
  };

  const handleTouchEnd = (e) => {
    const startX = touchStartXRef.current;
    const startY = touchStartYRef.current;
    touchStartXRef.current = null;
    touchStartYRef.current = null;
    if (startX == null || startY == null) return;
    const t = e.changedTouches?.[0];
    if (!t) return;
    const dx = t.clientX - startX;
    const dy = t.clientY - startY;
    /** Ignore largely-vertical swipes (browser scroll feel). */
    if (Math.abs(dy) > Math.abs(dx)) return;
    if (Math.abs(dx) < 45) return;
    go(dx < 0 ? 1 : -1);
  };

  const slideClass = pendingDir
    ? `ilb-slide ilb-slide--${pendingDir}`
    : "ilb-slide";

  return (
    <div
      className="ilb-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Image viewer"
      onClick={onClose}
    >
      <button
        type="button"
        className="ilb-close"
        onClick={onClose}
        aria-label="Close image viewer"
      >
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
          <path
            d="M5 17L17 5M5 5L17 17"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </button>

      <div className="ilb-counter" aria-live="polite">
        {safeIndex + 1} / {count}
      </div>

      {count > 1 && (
        <button
          type="button"
          className="ilb-nav ilb-nav--prev"
          onClick={(e) => {
            e.stopPropagation();
            go(-1);
          }}
          aria-label="Previous image"
        >
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
            <path
              d="M14 4L7 11L14 18"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      )}

      <div
        className="ilb-stage"
        onClick={(e) => e.stopPropagation()}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div className={slideClass} key={`${current.url}-${safeIndex}`}>
          {!loaded && <div className="ilb-spinner" aria-hidden />}
          <img
            src={current.url}
            alt={current.caption || alt || `Image ${safeIndex + 1}`}
            className={`ilb-img ${loaded ? "ilb-img--loaded" : ""}`}
            onLoad={() => {
              setLoadedIndex(safeIndex);
              setPendingDir(null);
            }}
            draggable={false}
          />
        </div>
        {current.caption ? (
          <div className="ilb-caption">{current.caption}</div>
        ) : null}
      </div>

      {count > 1 && (
        <button
          type="button"
          className="ilb-nav ilb-nav--next"
          onClick={(e) => {
            e.stopPropagation();
            go(1);
          }}
          aria-label="Next image"
        >
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
            <path
              d="M8 4L15 11L8 18"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      )}
    </div>
  );
};

export default ImageLightbox;
