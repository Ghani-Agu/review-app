// Redirect the proxy *root* (/api/proxy or /api/proxy/) to our endpoint
export async function loader({ request }: { request: Request }) {
  const url = new URL(request.url);
  url.pathname = "/api/proxy/reviews";
  return Response.redirect(url.toString(), 307); // keep method/body for POST
}
export const action = loader;
