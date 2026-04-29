import { useId } from "react";
import OverlayTrigger from "react-bootstrap/OverlayTrigger";
import Tooltip from "react-bootstrap/Tooltip";

export default function AppTooltip({
  children,
  content,
  placement = "top",
  disabled = false,
}) {
  const uid = useId();
  const tooltipId = `app-tip-${uid.replace(/:/g, "")}`;

  if (content == null || content === "") {
    return children;
  }

  const overlay = (props) => (
    <Tooltip
      {...props}
      id={tooltipId}
      className={`app-tooltip ${props.className ?? ""}`.trim()}
    >
      {content}
    </Tooltip>
  );

  const trigger = disabled ? (
    <span className="app-tooltip-target--disabled">{children}</span>
  ) : (
    children
  );

  return (
    <OverlayTrigger
      placement={placement}
      delay={{ show: 220, hide: 60 }}
      overlay={overlay}
    >
      {trigger}
    </OverlayTrigger>
  );
}
