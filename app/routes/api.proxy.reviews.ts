// app/routes/api.proxy.reviews.ts
import { PrismaClient, ReviewStatus } from "@prisma/client";

const prisma = new PrismaClient();

/** Read JSON or form-encoded bodies */
async function readBody(request: Request) {
  const ct = request.headers.get("content-type") || "";
  if (ct.includes("application/json")) return request.json();
  if (ct.includes("application/x-www-form-urlencoded")) {
    const form = await request.formData();
    const obj: Record<string, any> = {};
    form.forEach((v, k) => (obj[k] = v));
    return obj;
  }
  try {
    return await request.json();
  } catch {
    return {};
  }
}

/** JSON that safely stringifies BigInt */
function safeJson<T>(data: T, init?: ResponseInit) {
  return new Response(
    JSON.stringify(data, (_k, v) => (typeof v === "bigint" ? v.toString() : v)),
    { headers: { "Content-Type": "application/json" }, ...init }
  );
}

/** Try to resolve the shop domain from header, query, or hostname */
function getShopFromRequest(request: Request): string | undefined {
  const hdr = request.headers.get("x-shopify-shop-domain");
  if (hdr) return hdr;

  const url = new URL(request.url);
  const q = url.searchParams.get("shop");
  if (q) return q;

  // Fallback: parse host like reviews-app-dev-3.myshopify.com
  const host =
    request.headers.get("x-forwarded-host") ||
    request.headers.get("host") ||
    url.host;

  // If it looks like a myshopify domain, accept it
  if (host && /\.myshopify\.com$/i.test(host)) return host;

  return undefined;
}

/**
 * GET /apps/<proxy>/reviews?product_id=...&status=approved
 */
export async function loader({ request }: { request: Request }) {
  try {
    const shop = getShopFromRequest(request);
    if (!shop) {
      return safeJson(
        { ok: false, error: "Missing shop. Ensure you call via the App Proxy (/apps/<subpath>) or add ?shop=<domain>." },
        { status: 401 }
      );
    }

    const url = new URL(request.url);
    const productIdRaw =
      url.searchParams.get("product_id") ?? url.searchParams.get("productId") ?? "";
    if (!productIdRaw) {
      return safeJson({ ok: false, error: "Missing product_id" }, { status: 400 });
    }

    let pid: bigint;
    try {
      pid = BigInt(String(productIdRaw));
    } catch {
      return safeJson({ ok: false, error: "Invalid product_id" }, { status: 400 });
    }

    const statusParam =
      (url.searchParams.get("status") ?? "approved") as keyof typeof ReviewStatus;

    const reviews = await prisma.review.findMany({
      where: {
        shopDomain: shop,
        productId: pid,
        status: ReviewStatus[statusParam] ?? ReviewStatus.approved,
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return safeJson({ ok: true, reviews }, { status: 200 });
  } catch (err) {
    console.error("GET /reviews error:", err);
    return safeJson({ ok: false, error: "Failed to load reviews" }, { status: 500 });
  }
}

/**
 * POST /apps/<proxy>/reviews
 * Accepts (JSON or form):
 * - product_id | productId : string (required, numeric ID)
 * - rating                 : number 1–5 (required)
 * - title                  : string (optional)
 * - body  | review         : string (required)
 * - author_name            : string (required)
 * - author_email           : string (optional)
 * - product_handle         : string (optional)
 */
export async function action({ request }: { request: Request }) {
  if (request.method !== "POST") {
    return safeJson({ ok: false, error: "Method not allowed" }, { status: 405 });
  }

  try {
    const shop = getShopFromRequest(request);
    if (!shop) {
      return safeJson(
        { ok: false, error: "Missing shop. Ensure you post to the App Proxy (/apps/<subpath>) or add ?shop=<domain>." },
        { status: 401 }
      );
    }

    const body = await readBody(request);

    // Normalize inputs
    const productIdRaw = body.productId ?? body.product_id;
    const ratingRaw = body.rating;
    const title = body.title ? String(body.title) : null;
    const text =
      body.body !== undefined
        ? String(body.body)
        : body.review !== undefined
        ? String(body.review)
        : "";
    const authorName = body.author_name ? String(body.author_name) : "";
    const authorEmail = body.author_email ? String(body.author_email) : null;
    const productHandle = body.product_handle ? String(body.product_handle) : null;

    // Validate
    if (!productIdRaw) {
      return safeJson({ ok: false, error: "product_id is required" }, { status: 400 });
    }
    let pid: bigint;
    try {
      pid = BigInt(String(productIdRaw));
    } catch {
      return safeJson({ ok: false, error: "Invalid product_id" }, { status: 400 });
    }

    const rating = Number(ratingRaw);
    if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
      return safeJson({ ok: false, error: "rating must be between 1 and 5" }, { status: 400 });
    }
    if (!authorName || !text) {
      return safeJson({ ok: false, error: "author_name and body are required" }, { status: 400 });
    }

    const created = await prisma.review.create({
      data: {
        shopDomain: shop,
        productId: pid,
        productHandle,
        rating,
        title,
        body: text,
        authorName,
        authorEmail,
        status: ReviewStatus.pending,
      },
    });

    return safeJson({ ok: true, review: created }, { status: 200 });
  } catch (err) {
    console.error("POST /reviews error:", err);
    return safeJson({ ok: false, error: "Failed to submit review" }, { status: 500 });
  }
}
