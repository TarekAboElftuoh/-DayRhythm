import { ClusterDO, Env } from './cluster_do';

export { ClusterDO };

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
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

    const uid = url.searchParams.get('uid');
    if (!uid) {
      return new Response('Missing uid query parameter', { status: 400 });
    }

    const id = env.CLUSTER_DO.idFromName(uid);
    const stub = env.CLUSTER_DO.get(id);
    return stub.fetch(request);
  },
};
