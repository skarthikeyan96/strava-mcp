export const config = { runtime: "edge" };

export default function handler(req: Request): Response {
  const url = new URL(req.url);
  const redirectUri = url.searchParams.get("redirect_uri");
  const state = url.searchParams.get("state");

  if (!redirectUri) {
    return new Response("Missing redirect_uri", { status: 400 });
  }

  const callback = new URL(redirectUri);
  callback.searchParams.set("code", crypto.randomUUID());
  if (state) callback.searchParams.set("state", state);

  return Response.redirect(callback.toString(), 302);
}
