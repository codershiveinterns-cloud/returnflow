import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import clsx from "clsx";

const control =
  "w-full bg-surface border border-line-strong rounded-lg px-3 text-[14px] text-ink placeholder:text-faint transition-[border,box-shadow] outline-none hover:border-faint focus:border-ink focus:shadow-[0_0_0_3px_rgb(21_23_26/0.08)] disabled:bg-paper disabled:text-muted";

type FieldShell = { label?: ReactNode; hint?: ReactNode; error?: string; className?: string; trailing?: ReactNode };

function Shell({ id, label, hint, error, className, children }: FieldShell & { id: string; children: ReactNode }) {
  return (
    <div className={clsx("flex flex-col gap-1.5", className)}>
      {label && (
        <label htmlFor={id} className="text-[13px] font-medium text-ink-2">
          {label}
        </label>
      )}
      {children}
      {error ? <p className="text-[12.5px] text-danger">{error}</p> : hint ? <p className="text-[12.5px] text-muted">{hint}</p> : null}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & FieldShell & { inputClassName?: string }>(function Input(
  { label, hint, error, className, inputClassName, trailing, id, ...rest },
  ref,
) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <Shell id={fid} label={label} hint={hint} error={error} className={className}>
      <div className="relative">
        <input ref={ref} id={fid} aria-invalid={!!error} className={clsx(control, "h-10", error && "border-danger", trailing && "pr-10", inputClassName)} {...rest} />
        {trailing && <div className="absolute inset-y-0 right-2 flex items-center">{trailing}</div>}
      </div>
    </Shell>
  );
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & FieldShell>(function Textarea(
  { label, hint, error, className, id, ...rest },
  ref,
) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <Shell id={fid} label={label} hint={hint} error={error} className={className}>
      <textarea ref={ref} id={fid} aria-invalid={!!error} className={clsx(control, "py-2.5 min-h-[88px] resize-y", error && "border-danger")} {...rest} />
    </Shell>
  );
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & FieldShell>(function Select(
  { label, hint, error, className, id, children, ...rest },
  ref,
) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <Shell id={fid} label={label} hint={hint} error={error} className={className}>
      <select
        ref={ref}
        id={fid}
        className={clsx(control, "h-10 appearance-none pr-8 bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 20 20%22 fill=%22%236b6860%22><path d=%22M5.5 7.5 10 12l4.5-4.5%22 stroke=%22%236b6860%22 stroke-width=%221.6%22 fill=%22none%22 stroke-linecap=%22round%22/></svg>')] bg-no-repeat bg-[right_0.6rem_center] bg-[length:16px]")}
        {...rest}
      >
        {children}
      </select>
    </Shell>
  );
});
