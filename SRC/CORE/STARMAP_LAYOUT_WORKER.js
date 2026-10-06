import { createStarMapLayout } from './STARMAP_LAYOUT.js';

// Le routage des liaisons ne doit pas bloquer le jeu ni l'animation de la fenetre.
self.onmessage = ({ data }) => {
  try { self.postMessage({ layout: createStarMapLayout(data.nodes, data.unit, data.size, data.art, data.maps) }); }
  catch (error) { self.postMessage({ error: String(error?.message || error) }); }
};
