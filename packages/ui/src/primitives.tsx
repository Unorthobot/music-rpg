import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  HTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  TextareaHTMLAttributes,
} from "react";
import { cn } from "./cn";

/**
 * Primitives.
 *
 * Everything here is presentational and framework-neutral — no data fetching,
 * no hooks, no client-only APIs — so both server and client components can use
 * them. Interaction handlers are passed in by the consumer.
 */

/* --------------------------------------------------------------- Surface */

export type SurfaceProps = HTMLAttributes<HTMLDivElement> & {
  /** 1 = quietest panel, 3 = most raised. */
  level?: 1 | 2 | 3;
  bordered?: boolean;
  padded?: boolean | "sm" | "lg";
};

const surfaceLevels: Record<1 | 2 | 3, string> = {
  1: "bg-surface-1",
  2: "bg-surface-2",
  3: "bg-surface-3",
};

export function Surface({
  level = 1,
  bordered = true,
  padded = true,
  className,
  ...props
}: SurfaceProps) {
  return (
    <div
      className={cn(
        surfaceLevels[level],
        bordered && "border border-line-subtle",
        "rounded-lg",
        padded === true && "p-5",
        padded === "sm" && "p-4",
        padded === "lg" && "p-6 md:p-8",
        className,
      )}
      {...props}
    />
  );
}

/* ---------------------------------------------------------------- Button */

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

const buttonBase =
  "inline-flex items-center justify-center gap-2 font-medium rounded-md " +
  "transition-colors duration-fast ease-out select-none " +
  "disabled:opacity-40 disabled:cursor-not-allowed " +
  // 44px minimum touch target on every interactive control.
  "min-h-[44px]";

const buttonVariants: Record<ButtonVariant, string> = {
  primary: "bg-ember text-[#1a0a05] hover:bg-[#f0653d] active:bg-[#c9451f] font-semibold",
  secondary: "bg-surface-3 text-ink hover:bg-surface-raised border border-line",
  ghost: "bg-transparent text-ink-muted hover:text-ink hover:bg-surface-2",
  danger: "bg-transparent text-danger border border-danger/40 hover:bg-danger/10",
};

const buttonSizes: Record<ButtonSize, string> = {
  sm: "text-sm px-3 py-2",
  md: "text-base px-4 py-2.5",
  lg: "text-lg px-6 py-3.5 min-h-[52px]",
};

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  loading?: boolean;
};

export function Button({
  variant = "primary",
  size = "md",
  fullWidth,
  loading,
  className,
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        buttonBase,
        buttonVariants[variant],
        buttonSizes[size],
        fullWidth && "w-full",
        className,
      )}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Spinner label="Working" /> : null}
      {children}
    </button>
  );
}

export type LinkButtonProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
};

export function LinkButton({
  variant = "primary",
  size = "md",
  fullWidth,
  className,
  ...props
}: LinkButtonProps) {
  return (
    <a
      className={cn(
        buttonBase,
        buttonVariants[variant],
        buttonSizes[size],
        fullWidth && "w-full",
        className,
      )}
      {...props}
    />
  );
}

/* ------------------------------------------------------------ Typography */

export function PageTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h1 className={cn("text-2xl md:text-3xl font-semibold", className)} {...props} />;
}

export function SectionTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn("text-lg md:text-xl font-semibold", className)} {...props} />;
}

/** Small uppercase label. Used for section eyebrows and metric names. */
export function Label({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "text-2xs uppercase tracking-label text-ink-subtle font-medium",
        className,
      )}
      {...props}
    />
  );
}

export function Muted({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-sm text-ink-muted", className)} {...props} />;
}

/* ------------------------------------------------------------------- Tag */

export type TagProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: "neutral" | "ember" | "fame" | "respect" | "heat" | "legacy";
};

const tagTones: Record<NonNullable<TagProps["tone"]>, string> = {
  neutral: "border-line text-ink-muted",
  ember: "border-ember-line text-ember bg-ember-soft",
  fame: "border-fame/40 text-fame",
  respect: "border-respect/40 text-respect",
  heat: "border-heat/40 text-heat",
  legacy: "border-legacy/40 text-legacy",
};

export function Tag({ tone = "neutral", className, ...props }: TagProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-pill border px-2.5 py-1 text-2xs uppercase tracking-label",
        tagTones[tone],
        className,
      )}
      {...props}
    />
  );
}

/* ----------------------------------------------------------------- Forms */

export type FieldProps = {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string | null;
  required?: boolean;
  children: ReactNode;
};

/** Labels are always real `<label>` elements; errors are announced politely. */
export function Field({ label, htmlFor, hint, error, required, children }: FieldProps) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={htmlFor} className="text-sm font-medium text-ink">
        {label}
        {required ? <span className="text-ember"> *</span> : null}
      </label>
      {children}
      {hint && !error ? (
        <p id={`${htmlFor}-hint`} className="text-xs text-ink-subtle">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${htmlFor}-error`} role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

const inputBase =
  "w-full bg-surface-inset border border-line rounded-md px-4 py-3 text-base text-ink " +
  "placeholder:text-ink-subtle transition-colors duration-fast " +
  "focus:border-ember-line min-h-[48px]";

export function TextInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(inputBase, className)} {...props} />;
}

export function TextArea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(inputBase, "min-h-[120px] resize-y", className)} {...props} />;
}

/* ----------------------------------------------------------------- Meter */

export type MeterProps = {
  /** 0–100. */
  value: number;
  label: string;
  tone?: "ember" | "fame" | "respect" | "heat" | "legacy" | "neutral";
  /** Renders the number. Off by default: the player reads words, not stats. */
  showValue?: boolean;
};

const meterTones: Record<NonNullable<MeterProps["tone"]>, string> = {
  ember: "bg-ember",
  fame: "bg-fame",
  respect: "bg-respect",
  heat: "bg-heat",
  legacy: "bg-legacy",
  neutral: "bg-ink-subtle",
};

export function Meter({ value, label, tone = "ember", showValue }: MeterProps) {
  const clamped = Math.max(0, Math.min(100, value));

  return (
    <div
      role="meter"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className="flex flex-col gap-1.5"
    >
      <div className="flex items-baseline justify-between gap-3">
        <Label>{label}</Label>
        {showValue ? <span className="text-xs text-ink-muted tabular-nums">{clamped}</span> : null}
      </div>
      <div className="h-1.5 w-full rounded-pill bg-surface-3 overflow-hidden">
        <div
          className={cn("h-full rounded-pill transition-all duration-slow ease-out", meterTones[tone])}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- Feedback */

export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <span
      className="inline-block h-4 w-4 shrink-0 rounded-full border-2 border-current border-r-transparent animate-spin motion-reduce:animate-none"
      role="status"
      aria-label={label}
    />
  );
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn("rounded-md bg-surface-3 animate-pulse motion-reduce:animate-none", className)}
    />
  );
}

export function VisuallyHidden({ children }: { children: ReactNode }) {
  return <span className="sr-only">{children}</span>;
}

export function Divider({ className }: { className?: string }) {
  return <hr className={cn("border-0 border-t border-line-subtle my-6", className)} />;
}
