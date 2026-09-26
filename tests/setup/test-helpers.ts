import { NextRequest } from "next/server";

export function createMockRequest(
  url: string,
  options?: {
    method?: string;
    body?: Record<string, unknown>;
    headers?: Record<string, string>;
  },
): NextRequest {
  const { method = "GET", body, headers = {} } = options ?? {};
  const init: RequestInit = {
    method,
    headers: { "Content-Type": "application/json", ...headers },
  };
  if (body && method !== "GET") {
    init.body = JSON.stringify(body);
  }
  return new NextRequest(new URL(url, "http://localhost:3000"), init);
}

export async function parseResponse<T = unknown>(
  response: Response,
): Promise<{ status: number; body: T }> {
  const body = await response.json();
  return { status: response.status, body: body as T };
}
