"use strict";

const integerFormatter = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });

export function formatInteger(value) {
  const number = Math.floor(Number(value) || 0);
  return integerFormatter
    .format(number)
    .replace(/[\u00a0\u202f]/g, " ");
}
