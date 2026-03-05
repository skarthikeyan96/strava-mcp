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

  return Response.json({
    access_token: crypto.randomUUID(),
    token_type: "Bearer",
    expires_in: 86400,
  }, { headers: cors });
}
