import { useState } from "react";
import { Link } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import type { Session } from "@/lib/domain";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { AuthShell } from "./AuthShell";

export function LoginPage() {
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const session = await api<Session>("/auth/login", { method: "POST", body: { email, password } });
      qc.setQueryData(["session"], session);
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError(0, "Couldn't reach the server"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      title="Sign in"
      subtitle="Welcome back. Pick up the queue where you left it."
      footer={
        <>
          New to ReturnFlow?{" "}
          <Link to="/signup" className="font-medium text-ink underline underline-offset-4 decoration-line-strong hover:decoration-ink">
            Create a workspace
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        {error && !error.fields && <div className="rounded-lg bg-danger-bg text-danger text-[13.5px] px-3.5 py-2.5">{error.message}</div>}
        <Input label="Work email" type="email" autoComplete="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} error={error?.fieldError("email")} placeholder="you@company.com" />
        <Input
          label="Password"
          type={show ? "text" : "password"}
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={error?.fieldError("password")}
          trailing={
            <button type="button" onClick={() => setShow((s) => !s)} className="grid place-items-center size-7 rounded text-muted hover:text-ink" aria-label={show ? "Hide password" : "Show password"}>
              {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          }
        />
        <Button type="submit" size="lg" className="w-full !h-11" loading={loading}>
          Sign in
        </Button>
      </form>
    </AuthShell>
  );
}
