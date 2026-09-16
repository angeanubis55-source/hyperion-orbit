"use strict";

// Wiki / Aide : onglets + recherche plein-texte (sans dépendance moteur).
export function wireWikiWindow() {
  const root = document.getElementById("wikiWindow");
  if (!root || root.__wikiWired) return;
  root.__wikiWired = true;

  const tabs = [...root.querySelectorAll("[data-wiki-tab]")];
  const pages = [...root.querySelectorAll("[data-wiki-page]")];
  const search = root.querySelector("#wikiSearch");
  const count = root.querySelector("#wikiCount");

  function showTab(name) {
    for (const tab of tabs) tab.classList.toggle("active", tab.dataset.wikiTab === name);
    for (const page of pages) page.classList.toggle("active", page.dataset.wikiPage === name);
    applySearch();
  }

  function applySearch() {
    const query = (search?.value || "").trim().toLowerCase();
    let visible = 0;
    let total = 0;
    for (const page of pages) {
      const articles = [...page.querySelectorAll(".wikiArticle")];
      let pageVisible = 0;
      for (const article of articles) {
        total += 1;
        const hit = !query || article.textContent.toLowerCase().includes(query);
        article.style.display = hit ? "" : "none";
        // En recherche : déplie les résultats, sinon laisse l'état utilisateur.
        if (query) article.open = hit && total < 40 ? true : article.open;
        if (hit) {
          visible += 1;
          pageVisible += 1;
        }
      }
      page.dataset.empty = pageVisible === 0 ? "1" : "";
      // En recherche, affiche les pages qui matchent même si l'onglet n'est pas actif.
      if (query) page.classList.toggle("searchHit", pageVisible > 0);
      else page.classList.remove("searchHit");
    }
    if (count) count.textContent = query ? `${visible} résultat${visible > 1 ? "s" : ""}` : "";
    // Si la page active est vide en recherche, bascule vers la première page avec un hit.
    if (query) {
      const active = pages.find((p) => p.classList.contains("active"));
      if (active && active.dataset.empty === "1") {
        const first = pages.find((p) => p.dataset.empty !== "1");
        if (first) showTabSilent(first.dataset.wikiPage);
      }
    }
  }

  function showTabSilent(name) {
    for (const tab of tabs) tab.classList.toggle("active", tab.dataset.wikiTab === name);
    for (const page of pages) page.classList.toggle("active", page.dataset.wikiPage === name);
  }

  tabs.forEach((tab) => tab.addEventListener("click", () => showTab(tab.dataset.wikiTab)));
  search?.addEventListener("input", applySearch);

  window.addEventListener("orbit:window-restored", (event) => {
    if (event.detail?.id === "wikiWindow") {
      search?.focus?.();
    }
  });
}
