// Envoi transactionnel sans dépendance via l'API Resend.
// Variables requises en production :
// ORBIT_MAIL_API_KEY, ORBIT_MAIL_FROM, ORBIT_PUBLIC_URL.

const apiKey = String(process.env.ORBIT_MAIL_API_KEY || "").trim();
const from = String(process.env.ORBIT_MAIL_FROM || "").trim();
const publicUrl = String(process.env.ORBIT_PUBLIC_URL || "").trim().replace(/\/+$/, "");
const apiUrl = String(process.env.ORBIT_MAIL_API_URL || "https://api.resend.com/emails").trim();

export function emailServiceReady() {
  return !!(apiKey && from && /^https?:\/\//i.test(publicUrl));
}

export function authLink(params = {}) {
  if (!publicUrl) return "";
  const url = new URL("/PUBLIC/AUTH.html", publicUrl);
  for (const [key, value] of Object.entries(params)) if (value != null) url.searchParams.set(key, String(value));
  return url.href;
}

export async function sendAccountEmail({ to, subject, text, html }) {
  if (!emailServiceReady()) throw new Error("Service email non configuré");
  const response = await fetch(apiUrl, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({ from, to: [String(to)], subject: String(subject), text: String(text), html: String(html) }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Envoi email refusé (${response.status})`);
  return true;
}

export function emailTemplate(title, message, buttonLabel, href) {
  const safeHref = String(href || "").replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  return `<!doctype html><html lang="fr"><body style="margin:0;background:#050914;color:#e8f4ff;font-family:Arial,sans-serif">
    <div style="max-width:600px;margin:30px auto;padding:28px;background:#0b1427;border:1px solid #164465;border-radius:16px">
      <h1 style="color:#31d7ff">${title}</h1><p style="line-height:1.6">${message}</p>
      <p style="margin:28px 0"><a href="${safeHref}" style="padding:13px 20px;border-radius:9px;background:#00bde8;color:#001018;text-decoration:none;font-weight:bold">${buttonLabel}</a></p>
      <p style="font-size:12px;color:#93a9bd">Si tu n'es pas à l'origine de cette demande, ignore cet email.</p>
    </div></body></html>`;
}
