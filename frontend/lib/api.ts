const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

export async function register(email: string, name: string, password: string) {
  const res = await fetch(`${BASE}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, name, password }),
  });
  if (!res.ok) throw new Error((await res.json()).detail ?? "Registration failed");
  return res.json();
}

export async function login(email: string, password: string) {
  const body = new URLSearchParams({ username: email, password });
  const res = await fetch(`${BASE}/api/auth/login`, { method: "POST", body });
  if (!res.ok) throw new Error((await res.json()).detail ?? "Login failed");
  return res.json();
}

export async function uploadResume(token: string, file: File) {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${BASE}/api/resumes/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!res.ok) throw new Error((await res.json()).detail ?? "Upload failed");
  return res.json();
}

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

export async function getMatches(token: string, minScore = 0) {
  const res = await fetch(`${BASE}/api/matches/?min_score=${minScore}`, {
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error("Failed to fetch matches");
  return res.json();
}

export async function getApplications(token: string) {
  const res = await fetch(`${BASE}/api/applications/`, {
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error("Failed to fetch applications");
  return res.json();
}
