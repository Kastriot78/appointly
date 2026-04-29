import { getInitials } from "../utils/userInitials";

function hasPhotoUrl(src) {
  if (!src || typeof src !== "string") return false;
  const s = src.trim();
  if (!s) return false;
  return (
    /^https?:\/\//i.test(s) || s.startsWith("/") || s.startsWith("data:")
  );
}

export default function UserAvatar({
  name,
  src,
  className = "",
  alt,
  initialsClassName = "",
}) {
  const combined = [className, initialsClassName].filter(Boolean).join(" ");
  if (hasPhotoUrl(src)) {
    return (
      <img
        src={src.trim()}
        alt={alt ?? name ?? ""}
        className={className}
      />
    );
  }
  return (
    <div
      className={`${combined} user-avatar--initials`.trim()}
      role="img"
      aria-label={alt ?? name ?? "User"}
    >
      {getInitials(name)}
    </div>
  );
}
