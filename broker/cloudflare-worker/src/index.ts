import { ClusterDO, Env } from './cluster_do';

export { ClusterDO };

function resolveUid(url: URL): string | null {
  const q = url.searchParams.get('uid');
  if (q && q.trim()) return q.trim();
  const parts = url.pathname.split('/').filter(Boolean);
  if (parts.length >= 2 && (parts[0] === 'ws' || parts[0] === 'state')) {
    return decodeURIComponent(parts[1]);
  }
  return null;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
      });
    }
    if (url.pathname === '/health') {
      return Response.json({ ok: true, service: 'dayrhythm-spirc-broker' });
    }

    if (env.AUTH_TOKEN) {
      const token =
        request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') ||
        url.searchParams.get('token') ||
        '';
      if (token !== env.AUTH_TOKEN) {
        return new Response('Unauthorized', { status: 401 });
      }
    }

    const uid = resolveUid(url);
    if (!uid) {
      return new Response('Missing uid query parameter', { status: 400 });
    }

    const id = env.CLUSTER_DO.idFromName(uid);
    const stub = env.CLUSTER_DO.get(id);
    const resp = await stub.fetch(request);
    if (resp.status === 101) return resp;
    const out = new Response(resp.body, resp);
    out.headers.set('Access-Control-Allow-Origin', '*');
    return out;
  },
};
