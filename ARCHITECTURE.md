# Architecture du jeu

Le jeu reste une application navigateur rendue avec Canvas. `ORBIT_ENGINE.js` coordonne encore la partie, mais les règles, la persistance et les principaux rendus sont progressivement déplacés vers des modules indépendants et testables.

## Modules principaux

- `SRC/CORE/ORBIT_ENGINE.js` : orchestration de la partie, état du joueur et boucle principale.
- `SRC/CORE/INPUT.js` : clavier, pointeur et raccourcis.
- `COMBAT/COMBAT_RULES.js` et `COMBAT/PROJECTILES.js` : dégâts, bouclier, munitions et projectiles.
- `NPC/NPC_FACTORY.js`, `NPC_AI.js`, `NPC_SENSORS.js` et `NPC_ACTIVITY.js` : création et simulation des NPC.
- `NPC/NPC_ENGINE_RENDERER.js` : rendu des réacteurs NPC à partir des données de `NPC/NPC_ENGINE.js`.
- `NPC/NPC_COMBAT.js`, `NPC_PROJECTILES.js` et `NPC_MOVEMENT.js` : ciblage, règles de tir et déplacement des NPC.
- `NPC/NPC_RENDERER.js`, `NPC_SPAWNER.js` et `NPC_SPECIAL_BEHAVIORS.js` : choix des frames, préparation des apparitions et comportements particuliers.
- `PET/PET_TYPES.js` : niveaux, statistiques, modes et equipement du P.E.T.
- `PET/PET_MOTION.js` : suivi, positionnement et mouvement du P.E.T.
- `PET/PET_SPRITES/` : sprites et sons propres au P.E.T.
- `SHIP/` : catalogue, hangars, sprites, effets et reacteurs des vaisseaux.
- `SHIP/SHIP_ENGINE.js` : affectations et positions de réacteurs extraites de `main.swf`.
- `SHIP/SHIP_ENGINE_RENDERER.js` : animation des flammes et ancrage sur la frame exacte du vaisseau.
- `COMBAT/` : regles de degats, projectiles, munitions, rayons et roquettes.
- `UI/` : ressources graphiques, HUD, mini-carte, DOM et inventaire.
- `DRONE/` : types, formations et sprites des drones.
- `QUEST/` : definitions, localisation et presentation des quetes.
- `SRC/CORE/COLLISION.js` et `SPATIAL_INDEX.js` : collisions et recherche spatiale.
- `SRC/CORE/RADIATION_SYSTEM.js` : avertissement, temporisation et dégâts de radiation.
- `SRC/CORE/GATE_SYSTEM.js` et `PORTAL_SYSTEM.js` : Galaxy Gates, portails et animations de saut.
- `QUEST/QUEST_PRESENTATION.js` : HTML du journal et du terminal de quêtes.
- `QUEST/QUEST_TYPES.js` : définitions et règles métier des quêtes.
- `UI/UI_CANVAS_HUD.js` : informations Canvas du joueur, des NPC et des cibles.
- `UI/UI_MINIMAP.js` : rendu complet de la mini-carte.
- `SRC/CORE/WORLD_LAYER_RENDERER.js` : arrière-plans, parallaxe et murs texturés.
- `SRC/CORE/FRAME_SYSTEMS.js` : déplacement inertiel, durées de vie, textes flottants et attraction des récompenses.
- `SRC/CORE/ENGINE_TRAILS.js` : géométrie, simulation et rendu de la fumée des réacteurs.
- `SRC/CORE/PROGRESSION.js` : courbe de niveaux, attribution d’expérience et barèmes configurables des NPC et quêtes.
- `UI/UI_WINDOW_MANAGER.js` : déplacement, redimensionnement, réduction et restauration des fenêtres du HUD.

Les insignes sont stockés dans `ASSETS/RANKS/` : `0.png` pour Paria, `1.png` à `21.png` pour les grades standards et `ADMIN.png` pour le grade Administrateur.
- `SRC/CORE/IMAGE_LOADER.js` : chargement et cache des ressources graphiques.

## Principes de maintenance

1. Les fichiers de `SRC/DATA` décrivent le contenu et ne manipulent pas le DOM ou Canvas.
2. Les systèmes de `SRC/CORE` reçoivent leurs dépendances explicitement et évitent les variables globales.
3. `ORBIT_ENGINE.js` coordonne les systèmes mais ne doit plus contenir de gros blocs de présentation.
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
`ASSETS_MANIFEST.json` reste un inventaire, mais n'est plus téléchargé ni parcouru
pour précharger tout le jeu. L'ancien indicateur de session `orbit_assets_preloaded_v1`
n'est plus utilisé : un rafraîchissement prépare toujours les ressources nécessaires.

Les ressources de la destination sont préparées avant le changement interne de carte,
y compris ses collectables. Les autres vaisseaux et NPC sont chargés lorsqu'ils sont
demandés. Le cache d'images du moteur réutilise les ressources déjà chargées.
Le préchargement des modules de destination existant dans `SRC/MAIN.js` est conservé ;
il ne déclenche pas le téléchargement des images de toutes les cartes voisines.

`SCRIPTS/GAME_SERVER.js` fournit des ETag et répond 304 aux validations de ressources
inchangées. `Cache-Control: no-cache` autorise leur stockage mais impose une validation,
afin de rendre immédiatement visibles les modifications locales. Ces en-têtes devront
également être configurés sur le futur hébergement si un autre serveur est utilisé.

`npm run test:loading` contrôle le démarrage à froid, le rafraîchissement avec l'ancien
indicateur de cache, les passages 1-1 → 1-8 → 1-1 et la réponse HTTP 304. Le rapport
est enregistré dans `TEST/REPORTS/sector-loading/results.json`. Les sprites optionnels de
roquettes absents, documentés dans `COMBAT/ROCKET_TYPES.js`, sont signalés séparément.

## Prochaines extractions

- effets Canvas restants : lasers, explosions, collecte et traînées de réacteur ;
- découpage progressif de la mise à jour spéciale du Cubikon et des comportements NPC ;
- extraction des collisions de projectiles quand leurs callbacks de combat seront stabilisés ;
- mesures de performances comparables avant et après refactor.
