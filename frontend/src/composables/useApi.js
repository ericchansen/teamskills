/**
 * API fetch wrapper with automatic Bearer token injection.
 */
import { useAuth } from './useAuth';

export function useApi() {
  const { getToken } = useAuth();

  async function request(url, options = {}) {
    const token = await getToken();
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const res = await fetch(url, { ...options, headers });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`API ${options.method || 'GET'} ${url} failed (${res.status}): ${body}`);
    }

    return res.json();
  }

  function get(url) {
    return request(url);
  }

  function put(url, body) {
    return request(url, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  }

  function post(url, body) {
    return request(url, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  function del(url, body) {
    return request(url, {
      method: 'DELETE',
      body: JSON.stringify(body),
    });
  }

  return { get, put, post, del, request };
}
