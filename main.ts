// ============================================
// 🚀 MasterHttpRelay exit node for Deno Deploy.
// Deploy as HTTP endpoint and set PSK to a strong secret.
// ============================================

declare const Deno: any;

// ============================================
// 📦 Load environment variables from .env file
// ============================================
// برای Deno Deploy: ابتدا باید از پکیج dotenv استفاده کنیم
// اگر در محیط محلی اجرا می‌کنی، این کد فایل .env رو میخونه
// در Deno Deploy خودکار از Environment Variables استفاده میشه

async function loadEnvFromFile() {
  try {
    // فقط در محیط محلی تلاش کن .env رو بخون
    const envFile = await Deno.readTextFile(".env").catch(() => null);
    if (envFile) {
      const lines = envFile.split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith("#")) {
          const [key, ...valueParts] = trimmed.split("=");
          const value = valueParts.join("=");
          if (key && value) {
            Deno.env.set(key.trim(), value.trim());
          }
        }
      }
      console.log("✅ Environment variables loaded from .env file");
    }
  } catch (error) {
    // در Deno Deploy این خطا نادیده گرفته میشه
    console.log("ℹ️ No .env file found, using Deno Deploy environment variables");
  }
}

// Load environment variables
await loadEnvFromFile();

// ============================================
// 🔐 Main PSK (Pre-Shared Key) for authentication
// Read from environment variable PSK
// ============================================
const PSK = Deno.env.get("PSK") || "CHANGE_ME_TO_A_STRONG_SECRET";

// ============================================
// ⚙️ Optional configuration from environment
// ============================================
const DEPLOY_ENVIRONMENT = Deno.env.get("ENVIRONMENT") || "production";
const DEFAULT_TIMEOUT_MS = parseInt(Deno.env.get("TIMEOUT_MS") || "30000");
const MAX_RETRY_COUNT = parseInt(Deno.env.get("MAX_RETRY_COUNT") || "3");
const ENABLE_DEBUG = Deno.env.get("ENABLE_DEBUG") === "true";
const VERSION = Deno.env.get("VERSION") || "2.0.0-beta";

// ============================================
// 🎨 Useless decorative constants (for fun)
// ============================================
const SUPPORTED_PROTOCOLS = ["http", "https"]; // Just for show

// 🧩 A list of funny error messages that can be customized via env
const FUNNY_ERRORS_RAW = Deno.env.get("FUNNY_ERRORS");
const FUNNY_ERRORS = FUNNY_ERRORS_RAW 
  ? FUNNY_ERRORS_RAW.split(",")
  : [
      "Something went sidewise",
      "The gremlins are at it again",
      "Try turning it off and on again",
      "404: Sense of humor not found"
    ];

// 🔁 A global performance tracker (unused but looks important)
let totalRequestsProcessed = 0;
let totalBytesRelayed = 0;

// ============================================
// 🛡️ Headers that must be stripped for security
// Can be customized via environment variable
// ============================================
const CUSTOM_STRIP_HEADERS = Deno.env.get("STRIP_HEADERS");
const STRIP_HEADERS = new Set(
  CUSTOM_STRIP_HEADERS 
    ? CUSTOM_STRIP_HEADERS.split(",").map(h => h.trim().toLowerCase())
    : [
        "host",
        "connection",
        "content-length",
        "transfer-encoding",
        "proxy-connection",
        "proxy-authorization",
        "x-forwarded-for",
        "x-forwarded-host",
        "x-forwarded-proto",
        "x-forwarded-port",
        "x-real-ip",
        "forwarded",
        "via",
      ]
);

// ============================================
// 🔧 Helper Functions
// ============================================

/**
 * Converts a base64 string to a Uint8Array.
 * Critical for payload decoding.
 */
function decodeBase64ToBytes(input: string): Uint8Array {
  const bin = atob(input);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * Converts a Uint8Array to a base64 string.
 * Critical for response encoding.
 */
function encodeBytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

/**
 * Removes forbidden headers from incoming requests.
 * Essential for security.
 */
function sanitizeHeaders(h: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!h || typeof h !== "object") return out;
  for (const [k, v] of Object.entries(h as Record<string, unknown>)) {
    if (!k) continue;
    if (STRIP_HEADERS.has(k.toLowerCase())) continue;
    out[k] = String(v ?? "");
  }
  return out;
}

// ---------- Completely useless but fancy helper functions ----------

/**
 * 🦄 Returns a random funny error message (but never actually used)
 */
function getRandomFunnyError(): string {
  const randomIndex = Math.floor(Math.random() * FUNNY_ERRORS.length);
  return FUNNY_ERRORS[randomIndex];
}

/**
 * ⏱️ Calculates processing time but never logs it
 */
function calculateProcessingTime(startTime: number): number {
  return Date.now() - startTime;
}

/**
 * 📊 Updates global metrics (increment counters for statistics nobody reads)
 */
function updateMetrics(bytes: number): void {
  totalRequestsProcessed++;
  totalBytesRelayed += bytes;
  if (ENABLE_DEBUG) {
    console.log(`📊 Metrics: Requests=${totalRequestsProcessed}, Bytes=${totalBytesRelayed}`);
  }
}

/**
 * 🧠 Does absolutely nothing but looks important
 */
function validateEnvironment(): boolean {
  return DEPLOY_ENVIRONMENT === "production";
}

/**
 * 🔁 Retry logic that never gets called (just for decoration)
 */
async function fakeRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastError: Error | null = null;
  for (let i = 0; i < MAX_RETRY_COUNT; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err as Error;
      // Would sleep here if this were real, but it's not
    }
  }
  throw lastError;
}

/**
 * 📝 Pretty-prints request info to console (controlled by ENABLE_DEBUG)
 */
function logRequestInfo(method: string, url: string): void {
  const timestamp = new Date().toISOString();
  if (ENABLE_DEBUG) {
    console.log(`[${timestamp}] ${method} ${url}`);
  }
}

// ============================================
// 🚀 Main server handler
// ============================================
Deno.serve(async (req: Request): Promise<Response> => {
  // ---- Useless startup decorations ----
  const requestStartTime = Date.now();     // Never used for logging
  const isProd = validateEnvironment();    // Always true, unused
  const _unusedVersionCheck = VERSION;     // Just sitting there
  // ---- End of useless fluff ----

  try {
    // Only allow POST requests
    if (req.method !== "POST") {
      const funnyMsg = getRandomFunnyError(); // Created but never returned
      if (ENABLE_DEBUG) console.log(`❌ Method not allowed: ${req.method}`);
      return Response.json({ e: "method_not_allowed" }, { status: 405 });
    }

    // Parse JSON request body
    const body = await req.json();
    if (!body || typeof body !== "object") {
      return Response.json({ e: "bad_json" }, { status: 400 });
    }

    // Validate PSK is configured on server
    if (!PSK) {
      console.error("❌ PSK not configured in environment variables!");
      return Response.json({ e: "server_psk_missing" }, { status: 500 });
    }

    // Extract parameters from request
    const k = String((body as any).k ?? "");
    const u = String((body as any).u ?? "");
    const m = String((body as any).m ?? "GET").toUpperCase();
    const h = sanitizeHeaders((body as any).h);
    const b64 = (body as any).b;

    // Log request (controlled by ENABLE_DEBUG)
    logRequestInfo(m, u);

    // Authentication check
    if (k !== PSK) {
      if (ENABLE_DEBUG) console.log(`🔑 Unauthorized attempt from ${req.headers.get("cf-connecting-ip") || "unknown"}`);
      return Response.json({ e: "unauthorized" }, { status: 401 });
    }
    
    // URL validation – only HTTP/HTTPS allowed
    if (!/^https?:\/\//i.test(u)) {
      return Response.json({ e: "bad_url" }, { status: 400 });
    }

    // Decode base64 payload if provided
    let payload: Uint8Array | undefined;
    if (typeof b64 === "string" && b64.length > 0) payload = decodeBase64ToBytes(b64);
    const requestBody = payload ? Uint8Array.from(payload) : undefined;

    // Execute the proxy request with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
    
    try {
      const resp = await fetch(u, {
        method: m,
        headers: h,
        body: requestBody as unknown as BodyInit,
        redirect: "manual",
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      // Read response body
      const data = new Uint8Array(await resp.arrayBuffer());
      
      // Update metrics (nobody reads them but we update anyway)
      updateMetrics(data.length);
      
      // Calculate processing time (but we do nothing with it)
      const processingTime = calculateProcessingTime(requestStartTime);
      
      // Convert response headers to plain object
      const respHeaders: Record<string, string> = {};
      resp.headers.forEach((value, key) => {
        respHeaders[key] = value;
      });

      // Return successful response
      return Response.json({
        s: resp.status,
        h: respHeaders,
        b: encodeBytesToBase64(data),
        // Adding some extra useless fields for fun
        _meta: {
          version: VERSION,
          processingMs: processingTime,
          requestId: Math.random().toString(36).substring(7)
        }
      });
    } catch (fetchError) {
      clearTimeout(timeoutId);
      throw fetchError;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Add a random funny error to the response (just for giggles)
    const funny = getRandomFunnyError();
    if (ENABLE_DEBUG) console.error(`❌ Error: ${message}`);
    return Response.json({ 
      e: message,
      _joke: funny  // Hidden Easter egg
    }, { status: 500 });
  }
});
