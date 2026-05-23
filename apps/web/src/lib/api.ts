const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("underai_token");
}

export function setToken(token: string) {
  localStorage.setItem("underai_token", token);
}

export function clearToken() {
  localStorage.removeItem("underai_token");
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit & { token?: string | null } = {}
): Promise<T> {
  const { token = getToken(), ...init } = options;
  const headers = new Headers(init.headers);

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  if (!(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(`${API_URL}${path}`, { ...init, headers });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      body?.error?.message ?? `Request failed (${res.status})`
    );
  }

  return res.json() as Promise<T>;
}

export async function login(email: string, password: string) {
  return apiFetch<{ token: string; user: { id: string; email: string } }>(
    "/auth/login",
    {
      method: "POST",
      body: JSON.stringify({ email, password }),
      token: null,
    }
  );
}

export async function createSession(name?: string) {
  return apiFetch<{ session: { id: string } }>("/sessions", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export async function getSession(sessionId: string) {
  return apiFetch<{
    session: { id: string; name?: string };
    reference: {
      id: string;
      version: number;
      fileName: string;
      extracted?: boolean;
      normalizedData?: unknown;
    } | null;
    documents: Array<{
      id: string;
      fileName: string;
      status: string;
    }>;
  }>(`/sessions/${sessionId}`);
}

export async function retryReferenceExtract(sessionId: string) {
  return apiFetch<{ version: unknown; extracted: boolean }>(
    `/sessions/${sessionId}/reference/retry-extract`,
    { method: "POST" }
  );
}

export async function uploadReference(sessionId: string, file: File) {
  const form = new FormData();
  form.append("file", file);
  return apiFetch(`/sessions/${sessionId}/reference`, {
    method: "POST",
    body: form,
  });
}

export async function uploadPolicies(sessionId: string, files: File[]) {
  const form = new FormData();
  files.forEach((f) => form.append("files", f));
  return apiFetch(`/sessions/${sessionId}/documents`, {
    method: "POST",
    body: form,
  });
}

export async function startComparison(
  sessionId: string,
  documentIds: string[],
  idempotencyKey?: string
) {
  const headers: HeadersInit = {};
  if (idempotencyKey) {
    headers["Idempotency-Key"] = idempotencyKey;
  }
  return apiFetch<{
    jobId: string;
    status: string;
    reused: boolean;
  }>(`/sessions/${sessionId}/compare`, {
    method: "POST",
    body: JSON.stringify({ documentIds }),
    headers,
  });
}

export async function getJob(jobId: string) {
  return apiFetch<JobDetails>(`/jobs/${jobId}`);
}

export type JobDetails = {
  job: {
    id: string;
    status: string;
    progress?: { total: number; completed: number; failed: number };
    startedAt?: string;
    completedAt?: string;
    createdAt: string;
  };
  items: Array<{
    id: string;
    documentId: string;
    status: string;
    mismatches?: {
      mismatches: Mismatch[];
      summary: string;
      matchScore?: number;
    };
    errorMessage?: string;
    startedAt?: string;
    completedAt?: string;
  }>;
  documents: Array<{ id: string; fileName: string }>;
  events: Array<{
    id: string;
    eventType: string;
    payload?: unknown;
    createdAt: string;
  }>;
};

export type Mismatch = {
  field: string;
  label: string;
  severity: "critical" | "warning" | "info";
  expected: string | number | string[] | null;
  actual: string | number | string[] | null;
  note?: string;
};
