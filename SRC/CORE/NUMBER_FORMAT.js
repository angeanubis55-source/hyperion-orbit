"use strict";

const integerFormatter = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });

// Le HUD reformate les memes nombres a chaque frame (credits, PV, bouclier
// des NPC...) : Intl + regex coutent cher, le resultat ne change jamais.
const integerCache = new Map();
export function formatInteger(value) {
  const number = Math.floor(Number(value) || 0);
  let text = integerCache.get(number);
  if (text !== undefined) return text;
  text = integerFormatter
    .format(number)
    .replace(/[\u00a0\u202f]/g, " ");
  if (integerCache.size >= 2048) integerCache.clear();
  integerCache.set(number, text);
  return text;
}
