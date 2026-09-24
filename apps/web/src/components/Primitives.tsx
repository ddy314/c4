import * as Tooltip from "@radix-ui/react-tooltip";
import { ArrowUpRight, Check, Copy } from "lucide-react";
import { useState, type ReactNode } from "react";
import evidence from "../generated/evidence.json";

export const github = "https://github.com/ddy314/c4";
export function SourceLink({
  path,
  children = "View source",
}: {
  path: string;
  children?: ReactNode;
}) {
  return (
    <a
      className="source-link"
      href={`${evidence.sourceBase}${path}`}
      target="_blank"
      rel="noreferrer"
    >
      {children}
      <ArrowUpRight size={13} />
    </a>
  );
}
export function Hint({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content className="tooltip" sideOffset={8}>
          {label}
          <Tooltip.Arrow />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
export function CopyButton({
  text,
  label = "Copy",
}: {
  text: string;
  label?: string;
}) {
  const [status, setStatus] = useState("");
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setStatus("Copied");
    } catch {
      setStatus("Select text to copy");
    }
  };
  return (
    <button
      className="copy-button"
      onClick={copy}
      aria-label={`${label}${status ? `: ${status}` : ""}`}
    >
      {status === "Copied" ? <Check size={14} /> : <Copy size={14} />}
      <span aria-live="polite">{status || label}</span>
    </button>
  );
}
export function Brand({ inverse = false }: { inverse?: boolean }) {
  return (
    <span className={`brand ${inverse ? "inverse" : ""}`}>
      <img
        src={`${import.meta.env.BASE_URL}brand/c4-logo.png`}
        width="40"
        height="40"
        alt=""
        aria-hidden="true"
      />
      <span>
        C4<span className="brand-period">+</span>
      </span>
    </span>
  );
}
export function SectionLabel({
  number,
  children,
}: {
  number: string;
  children: ReactNode;
}) {
  return (
    <div className="section-label">
      <span>{number} /</span>
      {children}
    </div>
  );
}
