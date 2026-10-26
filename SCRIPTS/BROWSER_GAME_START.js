// Entrée en jeu pour les tests navigateur. Le jeu démarre seul (autoStart) :
// on attend la fin du chargement et on ne clique DÉPART que s'il est proposé
// (ancien flux, ou « RÉESSAYER » après un serveur injoignable).
export async function enterGame(page, timeout = 90000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const state = await page.evaluate(() => {
      const overlay = document.getElementById("loadingOverlay"), btn = document.getElementById("loadingStartBtn");
      const hidden = !overlay || getComputedStyle(overlay).display === "none";
      return {
        inGame: hidden && !document.documentElement.classList.contains("orbitBooting")
          && getComputedStyle(document.getElementById("game")).display !== "none",
        canStart: !!btn && !btn.disabled && btn.offsetParent !== null && !/CONNEXION/.test(btn.textContent),
      };
    }).catch(() => ({}));
    if (state.inGame) return;
    if (state.canStart) await page.click("#loadingStartBtn").catch(() => {});
    await page.waitForTimeout(250);
  }
  throw new Error(`Jeu non démarré après ${timeout} ms`);
}
