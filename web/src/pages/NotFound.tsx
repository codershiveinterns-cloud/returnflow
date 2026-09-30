import { Link } from "react-router";
import { Logo } from "@/components/ui/misc";

export function NotFound() {
  return (
    <div className="min-h-dvh grid place-items-center bg-ruled px-4">
      <div className="text-center">
        <Logo className="mb-10" />
        <p className="font-mono text-[12px] text-faint mb-2">404 · RETURN TO SENDER</p>
        <h1 className="text-[24px] font-semibold">This page isn't here</h1>
        <p className="mt-1 text-muted">The link may be old, or the address has a typo.</p>
        <Link to="/" className="inline-block mt-6 text-[14px] font-medium underline underline-offset-4 decoration-line-strong hover:decoration-ink">
          Go to ReturnFlow
        </Link>
      </div>
    </div>
  );
}
