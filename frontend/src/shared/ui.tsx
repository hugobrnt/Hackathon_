import type { ButtonHTMLAttributes, ReactNode } from "react";
import { useState } from "react";
import { safeExternalUrl } from "./storage";
export function Icon({ name }: { name: string }) {
  return (
    <span className="icon" aria-hidden="true">
      <img src={"/assets/" + name + ".svg"} alt="" />
    </span>
  );
}
export function Button({
  children,
  primary,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { primary?: boolean }) {
  return (
    <button
      type="button"
      {...props}
      className={"btn " + (primary ? "btn--primary " : "") + className}
    >
      {children}
    </button>
  );
}
export function Metric({
  label,
  value,
  hint,
  accent,
  definition,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  accent?: boolean;
  definition?: string;
}) {
  return (
    <div className={"metric " + (accent ? "metric--accent" : "")}>
      <span className="metric-label">
        {label}
        {definition && (
          <span tabIndex={0} className="tooltip" aria-label={definition}>
            <Icon name="help" />
            <span role="tooltip">{definition}</span>
          </span>
        )}
      </span>
      <strong>{value}</strong>
      {hint && <small>{hint}</small>}
    </div>
  );
}
export function Heading({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children?: ReactNode;
}) {
  return (
    <header className="page-heading">
      <div>
        <h1>{title}</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
      </div>
      {children}
    </header>
  );
}
export function Empty({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <Icon name="insights" />
      <h2>{title}</h2>
      <p>{children}</p>
      {action}
    </div>
  );
}
export function PostVisual({
  picture,
  caption,
  variant = 0,
}: {
  picture: string | null;
  caption: string;
  variant?: number;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const url = picture?.startsWith("/assets/")
    ? picture
    : safeExternalUrl(picture);
  return (
    <div className={"post-visual visual-" + (variant % 4)}>
      {url && url !== failedUrl ? (
        <img src={url} alt={caption} onError={() => setFailedUrl(url)} />
      ) : (
        <>
          <span className="visual-brand">CONTENT / PREVIEW</span>
          <strong>{caption}</strong>
          <span className="visual-footer">
            Explore the source
            <br />
            behind the signal. ↗
          </span>
        </>
      )}
    </div>
  );
}
