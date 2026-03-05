export const config = { runtime: "edge" };

export default async function handler(req: Request): Promise<Response> {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const clientId = crypto.randomUUID();

  return Response.json({
    client_id: clientId,
    client_name: body.client_name ?? "mcp-client",
    redirect_uris: body.redirect_uris ?? [],
    grant_types: ["authorization_code"],
    response_types: ["code"],
    token_endpoint_auth_method: "none",
  }, { status: 201, headers: cors });
}
