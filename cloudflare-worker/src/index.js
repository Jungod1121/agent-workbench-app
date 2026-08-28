/**
 * Agent Workbench Sync Worker
 *
 * 极简的个人同步后端：
 *   GET  /api/state  -> 读取当前所有项目数据
 *   PUT  /api/state  -> 用请求体整体覆盖保存
 *
 * 所有请求都需要带上请求头：X-Sync-Token: <你的密钥>
 * 数据整体存成一份 JSON，放在 Cloudflare KV 里，个人用完全够用，
 * 不需要数据库、不需要账号系统。
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }

    const token = request.headers.get("X-Sync-Token");
    if (!env.SYNC_TOKEN || token !== env.SYNC_TOKEN) {
      return json({ error: "unauthorized" }, 401);
    }

    if (url.pathname === "/api/state" && request.method === "GET") {
      const raw = await env.WORKBENCH_KV.get("state");
      const data = raw ? JSON.parse(raw) : { projects: [], updatedAt: null };
      return json(data);
    }

    if (url.pathname === "/api/state" && request.method === "PUT") {
      let body;
      try {
        body = await request.json();
      } catch (e) {
        return json({ error: "invalid json body" }, 400);
      }
      if (!Array.isArray(body.projects)) {
        return json({ error: "'projects' must be an array" }, 400);
      }
      const payload = {
        projects: body.projects,
        updatedAt: new Date().toISOString(),
      };
      await env.WORKBENCH_KV.put("state", JSON.stringify(payload));
      return json({ ok: true, updatedAt: payload.updatedAt });
    }

    return json({ error: "not found" }, 404);
  },
};

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,PUT,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,X-Sync-Token",
  };
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders() },
  });
}
