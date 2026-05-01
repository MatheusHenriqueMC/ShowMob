const BASE_URL =
  typeof window !== "undefined"
    ? process.env.NEXT_PUBLIC_API_URL ?? ""
    : process.env.NEXT_PUBLIC_API_URL ?? "";

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("ms_token");
}

export async function api<T = unknown>(
  path: string,
  method = "GET",
  body?: unknown
): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const opts: RequestInit = { method, headers };
  if (body !== undefined) opts.body = JSON.stringify(body);
  try {
    const res = await fetch(`${BASE_URL}/api${path}`, opts);
    if (res.status === 413) return { error: "Arquivo muito grande. Use um GIF menor que 7MB." } as T;
    return res.json() as T;
  } catch {
    return { error: "Erro ao comunicar com o servidor." } as T;
  }
}
