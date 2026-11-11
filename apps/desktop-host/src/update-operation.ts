interface UpdateConnection {
  createSharedFetchHandler(prefix: '/api'): { fetch(request: Request): Promise<Response> }
}

export async function dispatchDesktopUpdate(connection: UpdateConnection, request: unknown): Promise<unknown> {
  if (typeof request !== 'object' || request === null || !('action' in request)
    || !['plugins-install', 'plugins-status', 'desktop-prepare', 'desktop-cancel'].includes(String(request.action))) {
    return { ok: false, error: { code: 'invalid-request' } }
  }
  try {
    const response = await connection.createSharedFetchHandler('/api').fetch(new Request('http://desktop.internal/api/desktop/update', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(request),
    }))
    if (response.status === 404) return { ok: false, error: { code: 'route-missing' } }
    if (!response.ok) return { ok: false, error: { code: 'update-rejected' } }
    return await response.json()
  } catch {
    return { ok: false, error: { code: 'update-unavailable' } }
  }
}
