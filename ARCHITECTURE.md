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
- `src/core/ImageLoader.js` : chargement et cache des ressources graphiques.

## Principes de maintenance

1. Les fichiers de `src/data` décrivent le contenu et ne manipulent pas le DOM ou Canvas.
2. Les systèmes de `src/core` reçoivent leurs dépendances explicitement et évitent les variables globales.
3. `OrbitEngine.js` coordonne les systèmes mais ne doit plus contenir de gros blocs de présentation.
4. Chaque extraction conserve le comportement existant et ajoute un test unitaire ciblé.
5. Les cartes normales et les Galaxy Gates sont validées avec les tests navigateur avant un push.

## Sauvegarde et futur multijoueur

`localStorage` reste une sauvegarde locale pratique, mais ne protège pas contre la triche. Pour une version multijoueur compétitive, le serveur devra être autoritaire sur l’authentification, les crédits, l’inventaire, les dégâts et les récompenses. Le client devra envoyer des intentions plutôt que modifier directement les soldes.

## Prochaines extractions

- effets Canvas restants : lasers, explosions, collecte et traînées de réacteur ;
- découpage progressif de la mise à jour spéciale du Cubikon et des comportements NPC ;
- extraction des collisions de projectiles quand leurs callbacks de combat seront stabilisés ;
- mesures de performances comparables avant et après refactor.
