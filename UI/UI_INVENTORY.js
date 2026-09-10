// Slice quantities without allocating one object for every owned unit.
export function inventoryPage(sections, requestedPage = 0, pageSize = 120) {
  const size = Math.max(1, Math.floor(pageSize) || 120);
  const count = (section, entry) => section.id === "equipment"
    ? Math.max(0, Math.floor(Number(entry.quantity) || 0)) : 1;
  const total = sections.reduce((sum, section) => sum + section.items.reduce((n, entry) => n + count(section, entry), 0), 0);
  const pages = Math.max(1, Math.ceil(total / size));
  const page = Math.max(0, Math.min(pages - 1, Math.floor(requestedPage) || 0));
  const start = page * size;
  const end = start + size;
  const slots = [];
  let offset = 0;
  for (const section of sections) {
    for (const entry of section.items) {
      const length = count(section, entry);
      for (let i = Math.max(0, start - offset); i < Math.min(length, end - offset); i++) {
        slots.push(section.id === "equipment"
          ? { ...entry, slotId: `${entry.id}-${i}`, quantity: 1, stacked: false }
          : entry);
      }
      offset += length;
      if (offset >= end) return { slots, total, page, pages };
    }
  }
  return { slots, total, page, pages };
}
