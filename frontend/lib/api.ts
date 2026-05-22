const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

// ── Auth ─────────────────────────────────────────────────────────────────────

async function extractError(res: Response, fallback: string): Promise<string> {
  try { return (await res.json()).detail ?? fallback; } catch { return res.text().catch(() => fallback); }
}

export async function register(email: string, name: string, password: string) {
  const res = await fetch(`${BASE}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, name, password }),
  });
  if (!res.ok) throw new Error(await extractError(res, "Registration failed"));
  return res.json() as Promise<{
    status: "active" | "pending";
    role: string;
    access_token?: string;
    message?: string;
  }>;
}

export async function login(email: string, password: string) {
  const body = new URLSearchParams({ username: email, password });
  const res = await fetch(`${BASE}/api/auth/login`, { method: "POST", body });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail ?? "Login failed");
  }
  return res.json() as Promise<{ access_token: string; token_type: string; role: string }>;
}

// ── Resumes ───────────────────────────────────────────────────────────────────

export async function uploadResume(token: string, file: File) {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${BASE}/api/resumes/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!res.ok) throw new Error(await extractError(res, "Upload failed"));
  return res.json();
}

// ── Jobs ──────────────────────────────────────────────────────────────────────

export async function getJobs(token: string, page = 1, pageSize = 100) {
  const res = await fetch(`${BASE}/api/jobs/?page=${page}&page_size=${pageSize}`, {
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error("Failed to fetch jobs");
  return res.json();
}

export async function refreshJobs(token: string) {
  const res = await fetch(`${BASE}/api/jobs/refresh`, {
    method: "POST",
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error("Failed to trigger refresh");
  return res.json();
}

// ── Matches & Applications ────────────────────────────────────────────────────

export async function getMatches(token: string, minScore = 0) {
  const res = await fetch(`${BASE}/api/matches/?min_score=${minScore}`, {
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error("Failed to fetch matches");
  return res.json();
}

export async function applyMatch(token: string, matchId: string) {
  const res = await fetch(`${BASE}/api/matches/${matchId}/apply`, {
    method: "POST",
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error(await extractError(res, "Failed to apply"));
  return res.json();
}

export async function applyAllMatches(token: string, minScore = 50) {
  const res = await fetch(`${BASE}/api/matches/apply-all?min_score=${minScore}`, {
    method: "POST",
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error(await extractError(res, "Failed to apply all"));
  return res.json() as Promise<{ applied: number }>;
}

export async function getApplications(token: string) {
  const res = await fetch(`${BASE}/api/applications/`, {
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error("Failed to fetch applications");
  return res.json();
}

// ── Admin ─────────────────────────────────────────────────────────────────────

export async function adminGetUsers(token: string) {
  const res = await fetch(`${BASE}/api/admin/users`, { headers: authHeaders(token) });
  if (!res.ok) throw new Error("Failed to fetch users");
  return res.json() as Promise<{
    id: string; name: string; email: string;
    role: string; status: string; created_at: string;
  }[]>;
}

export async function adminGetStats(token: string) {
  const res = await fetch(`${BASE}/api/admin/stats`, { headers: authHeaders(token) });
  if (!res.ok) throw new Error("Failed to fetch stats");
  return res.json() as Promise<{
    total_employees: number; pending: number; active: number;
    revoked: number; total_jobs: number; total_applications: number;
  }>;
}

export async function adminApprove(token: string, userId: string) {
  const res = await fetch(`${BASE}/api/admin/users/${userId}/approve`, {
    method: "POST", headers: authHeaders(token),
  });
  if (!res.ok) throw new Error("Failed to approve user");
  return res.json();
}

export async function adminTaskStatus(token: string, taskId: string) {
  const res = await fetch(`${BASE}/api/admin/task/${taskId}`, { headers: authHeaders(token) });
  if (!res.ok) throw new Error("Failed to fetch task status");
  return res.json() as Promise<{
    task_id: string;
    state: "PENDING" | "STARTED" | "SUCCESS" | "FAILURE" | "RETRY";
    result?: { fetched: number; saved: number; source: string };
    error?: string;
  }>;
}

export async function adminRevoke(token: string, userId: string) {
  const res = await fetch(`${BASE}/api/admin/users/${userId}/revoke`, {
    method: "POST", headers: authHeaders(token),
  });
  if (!res.ok) throw new Error("Failed to revoke user");
  return res.json();
}
