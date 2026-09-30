export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    public fields?: { path: string; message: string }[],
    public details?: unknown,
  ) {
    super(message);
  }
  fieldError(path: string) {
    return this.fields?.find((f) => f.path === path)?.message;
  }
}

type Options = Omit<RequestInit, "body"> & { body?: unknown; headers?: Record<string, string> };

export async function api<T = unknown>(path: string, opts: Options = {}): Promise<T> {
  const isForm = opts.body instanceof FormData;
  const res = await fetch(`/api${path}`, {
    ...opts,
    credentials: "include",
    headers: { Accept: "application/json", ...(opts.body !== undefined && !isForm ? { "Content-Type": "application/json" } : {}), ...opts.headers },
    body: opts.body === undefined ? undefined : isForm ? (opts.body as FormData) : JSON.stringify(opts.body),
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = data?.error ?? {};
    throw new ApiError(res.status, e.message ?? "Something went wrong", e.code, e.fields, e.details);
  }
  return data as T;
}

export const errorMessage = (err: unknown) => (err instanceof Error ? err.message : "Something went wrong");
