"use strict";

export function formatInteger(value) {
  const number = Math.floor(Number(value) || 0);
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 })
    .format(number)
    .replace(/[\u00a0\u202f]/g, " ");
}
