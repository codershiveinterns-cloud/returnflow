import { useState } from "react";
import { Link } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import type { Session } from "@/lib/domain";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { AuthShell } from "./AuthShell";

export function SignupPage() {
  const qc = useQueryClient();
  const [form, setForm] = useState({ orgName: "", name: "", email: "", password: "" });
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const session = await api<Session>("/auth/signup", { method: "POST", body: form });
      qc.setQueryData(["session"], session);
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError(0, "Couldn't reach the server"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      title="Create your workspace"
      subtitle="Set up returns for your store. You'll be the workspace admin."
      footer={
        <>
          Already have an account?{" "}
          <Link to="/login" className="font-medium text-ink underline underline-offset-4 decoration-line-strong hover:decoration-ink">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        {error && !error.fields && <div className="rounded-lg bg-danger-bg text-danger text-[13.5px] px-3.5 py-2.5">{error.message}</div>}
        <Input label="Business name" autoFocus value={form.orgName} onChange={set("orgName")} error={error?.fieldError("orgName")} placeholder="Kaveri & Co." />
        <Input label="Your name" autoComplete="name" value={form.name} onChange={set("name")} error={error?.fieldError("name")} />
        <Input label="Work email" type="email" autoComplete="email" value={form.email} onChange={set("email")} error={error?.fieldError("email")} />
        <Input label="Password" type="password" autoComplete="new-password" value={form.password} onChange={set("password")} error={error?.fieldError("password")} hint="At least 8 characters" />
        <Button type="submit" size="lg" className="w-full !h-11" loading={loading}>
          Create workspace
        </Button>
      </form>
    </AuthShell>
  );
}
