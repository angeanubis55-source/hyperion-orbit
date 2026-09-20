// Un emplacement par entrée : les doublons sont déjà groupés en amont
// (quantité sur l'entrée), donc pas d'objet alloué par unité possédée.
export function inventoryPage(sections, requestedPage = 0, pageSize = 120) {
  const size = Math.max(1, Math.floor(pageSize) || 120);
  const total = sections.reduce((sum, section) => sum + section.items.length, 0);
  const pages = Math.max(1, Math.ceil(total / size));
  const page = Math.max(0, Math.min(pages - 1, Math.floor(requestedPage) || 0));
  const start = page * size;
  const slots = [];
  let offset = 0;
  for (const section of sections) {
    for (const entry of section.items) {
      if (offset >= start && slots.length < size) slots.push(entry);
      offset += 1;
      if (slots.length >= size) break;
    }
    if (slots.length >= size) break;
  }
  return { slots, total, page, pages };
}
