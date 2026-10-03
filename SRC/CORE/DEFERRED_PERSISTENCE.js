// La fermeture/navigation force l'ecriture ; pendant le jeu on regroupe
// les demandes et on serialise l'etat le plus recent hors de la frame d'action.
export function createDeferredPersistence(write, {
  now = () => Date.now(),
  intervalMs = 5000,
  schedule = callback => {
    if (typeof requestIdleCallback === "function") requestIdleCallback(callback, { timeout: 2000 });
    else setTimeout(callback, 0);
  },
} = {}) {
  let lastWrite = -Infinity;
  let pending = false;
  let generation = 0;
  return function persist({ force = false } = {}) {
    if (force) {
      generation++;
      pending = false;
      write(true);
      lastWrite = now();
      return;
    }
    if (pending || now() - lastWrite < intervalMs) return;
    pending = true;
    const ticket = ++generation;
    schedule(() => {
      if (ticket !== generation) return;
      pending = false;
      write(false);
      lastWrite = now();
    });
  };
}
