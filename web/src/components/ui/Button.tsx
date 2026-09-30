import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import clsx from "clsx";
import { Spinner } from "./Spinner";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "kraft";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  primary: "bg-ink text-white hover:bg-ink-2 shadow-[inset_0_1px_0_rgb(255_255_255/0.08)]",
  secondary: "bg-surface text-ink border border-line-strong hover:bg-paper hover:border-faint",
  ghost: "text-ink-2 hover:bg-paper-2",
  danger: "bg-surface text-danger border border-line-strong hover:bg-danger-bg hover:border-danger/30",
  kraft: "bg-kraft text-white hover:brightness-95",
};
const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-[13px] gap-1.5 rounded-md",
  md: "h-9 px-3.5 text-[13.5px] gap-2 rounded-lg",
  lg: "h-12 px-5 text-[15px] gap-2 rounded-xl",
};

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", loading, icon, className, children, disabled, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={clsx(
        "inline-flex items-center justify-center font-medium whitespace-nowrap select-none transition-[background,border,color,filter] duration-150 disabled:opacity-50 disabled:pointer-events-none",
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Spinner className="size-4" /> : icon}
      {children}
    </button>
  );
});
