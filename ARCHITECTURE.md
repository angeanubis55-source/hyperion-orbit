# Architecture du jeu

Le jeu reste une application navigateur rendue avec Canvas. `OrbitEngine.js` coordonne encore la partie, mais les règles, la persistance et les principaux rendus sont progressivement déplacés vers des modules indépendants et testables.

## Modules principaux

- `src/core/OrbitEngine.js` : orchestration de la partie, état du joueur et boucle principale.
- `src/core/input.js` : clavier, pointeur et raccourcis.
- `src/core/combat.js` et `src/core/projectiles.js` : dégâts, bouclier, munitions et projectiles.
- `src/core/npcFactory.js`, `npcAI.js`, `npcSensors.js` et `npcActivity.js` : création et simulation des NPC.
- `src/core/collision.js` et `spatialIndex.js` : collisions et recherche spatiale.
- `src/core/radiationSystem.js` : avertissement, temporisation et dégâts de radiation.
- `src/core/gateSystem.js` et `portalSystem.js` : Galaxy Gates, portails et animations de saut.
- `src/core/questPresentation.js` : HTML du journal et du terminal de quêtes.
- `src/data/quests.js` : définitions et règles métier des quêtes.
- `src/core/canvasHudRenderer.js` : informations Canvas du joueur, des NPC et des cibles.
- `src/core/minimapRenderer.js` : rendu complet de la mini-carte.
- `src/core/worldLayerRenderer.js` : arrière-plans, parallaxe et murs texturés.
- `src/core/frameSystems.js` : déplacement inertiel, durées de vie, textes flottants et attraction des récompenses.
- `src/core/progression.js` : courbe de niveaux, attribution d’expérience et barèmes configurables des NPC et quêtes.

Les insignes sont stockés dans `assets/grades/` : `0.png` pour Paria, `1.png` à `21.png` pour les grades standards et `admin.png` pour le grade Administrateur.
- `src/core/ImageLoader.js` : chargement et cache des ressources graphiques.

## Principes de maintenance

1. Les fichiers de `src/data` décrivent le contenu et ne manipulent pas le DOM ou Canvas.
2. Les systèmes de `src/core` reçoivent leurs dépendances explicitement et évitent les variables globales.
3. `OrbitEngine.js` coordonne les systèmes mais ne doit plus contenir de gros blocs de présentation.
4. Chaque extraction conserve le comportement existant et ajoute un test unitaire ciblé.
5. Les cartes normales et les Galaxy Gates sont validées avec les tests navigateur avant un push.

## Sauvegarde et futur multijoueur

`localStorage` reste une sauvegarde locale pratique, mais ne protège pas contre la triche. Pour une version multijoueur compétitive, le serveur devra être autoritaire sur l’authentification, les crédits, l’inventaire, les dégâts et les récompenses. Le client devra envoyer des intentions plutôt que modifier directement les soldes.

## Chargement des ressources

Le démarrage prépare uniquement le secteur courant : vaisseau équipé et son effet,
fonds, NPC du secteur, portails, collectables autorisés et effets communs de jeu.
Les images de bases et de balises sont sélectionnées via `getZoneSafeModules` :
seuls les sprites référencés par le secteur sont préparés, au démarrage comme avant
une transition. Une balise sans sprite reconnu conserve le repli vers BEACON_MMO.
La progression de l'écran de départ provient de `ImageLoader.onProgress`.
`assets-manifest.json` reste un inventaire, mais n'est plus téléchargé ni parcouru
pour précharger tout le jeu. L'ancien indicateur de session `orbit_assets_preloaded_v1`
n'est plus utilisé : un rafraîchissement prépare toujours les ressources nécessaires.

Les ressources de la destination sont préparées avant le changement interne de carte,
y compris ses collectables. Les autres vaisseaux et NPC sont chargés lorsqu'ils sont
demandés. Le cache d'images du moteur réutilise les ressources déjà chargées.
Le préchargement des modules de destination existant dans `src/main.js` est conservé ;
il ne déclenche pas le téléchargement des images de toutes les cartes voisines.

`scripts/game-server.js` fournit des ETag et répond 304 aux validations de ressources
inchangées. `Cache-Control: no-cache` autorise leur stockage mais impose une validation,
afin de rendre immédiatement visibles les modifications locales. Ces en-têtes devront
également être configurés sur le futur hébergement si un autre serveur est utilisé.

`npm run test:loading` contrôle le démarrage à froid, le rafraîchissement avec l'ancien
indicateur de cache, les passages 1-1 → 1-8 → 1-1 et la réponse HTTP 304. Le rapport
est enregistré dans `reports/sector-loading/results.json`. Les sprites optionnels de
roquettes absents, documentés dans `src/data/rockets.js`, sont signalés séparément.

## Prochaines extractions

- effets Canvas restants : lasers, explosions, collecte et traînées de réacteur ;
- découpage progressif de la mise à jour spéciale du Cubikon et des comportements NPC ;
- extraction des collisions de projectiles quand leurs callbacks de combat seront stabilisés ;
- mesures de performances comparables avant et après refactor.
