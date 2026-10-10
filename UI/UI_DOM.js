"use strict";

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

// Chiffres uniquement dans une zone de saisie (jamais de lettres) :
// nettoie en place, sans casser le caret en fin de champ.
export function stripNonDigits(input, maxLen = 12) {
  if (!input) return "";
  const clean = String(input.value || "").replace(/[^0-9]/g, "").slice(0, Math.max(1, maxLen));
  if (clean !== String(input.value || "")) {
    try { input.value = clean; } catch {}
  }
  return clean;
}

// Verrouille une zone à la frappe : seuls les chiffres passent
// (les touches de contrôle restent libres). Couplé à stripNonDigits
// en "input", aucune lettre ne peut rester affichée (y compris Firefox,
// qui affiche les lettres d'un type=number tout en gardant value vide).
export function wireDigitsOnly(input) {
  if (!input || input.dataset.digitsWired === "1") return;
  input.dataset.digitsWired = "1";
  try { input.setAttribute("inputmode", "numeric"); } catch {}
  input.addEventListener("keydown", (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const k = String(event.key ?? "");
    if (k.length !== 1) return;
    if (k >= "0" && k <= "9") return;
    try { event.preventDefault(); } catch {}
  });
  input.addEventListener("input", () => stripNonDigits(input));
}
