// Every HTTP call goes through here. JSON in/out; API errors
// ({ error: { code, message, details } }) become thrown Error objects.
// With VITE_MOCK=1 the request is answered by the in-browser mock server instead.
export const isMock = import.meta.env.VITE_MOCK === '1';

export async function http(path, { method = 'GET', body, keepalive = false } = {}) {
  if (isMock) {
    const { mockRequest } = await import('./mock/server.js');
    return mockRequest(method, path, body);
  }

  let res;
  try {
    res = await fetch(`/api${path}`, {
      method,
      keepalive,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw Object.assign(new Error('Cannot reach the server'), { code: 'NETWORK' });
  }

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw Object.assign(new Error(data?.error?.message ?? `Request failed (${res.status})`), {
      code: data?.error?.code,
      status: res.status,
      details: data?.error?.details,
    });
  }
  return data;
}
