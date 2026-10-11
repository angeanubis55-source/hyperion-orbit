# Aptitudes : revue du multijoueur

Revue du code et tests du 11 octobre 2026. Le registre contient 82 aptitudes ; la nouvelle campagne reprend aussi les familles déjà corrigées.

## Corrections communes

- Annonce réseau depuis les activations réussies, après les contrôles locaux de cible et de recharge.
- Refus des aptitudes offensives en ZNA, côté lanceur et côté cible, à l'activation et à l'impact.
- Validation des impacts d'aptitude avec leur cible, leur portée, leur durée, leur cadence et leur montant. Les dégâts fixes ne reprennent pas les critiques aléatoires d'un laser.
- Application des défenses et transferts dans le calcul serveur des dégâts NPC et PvP, avec protection contre les boucles de renvoi.
- Diffusion des soins réels et des `+0`, en vert pour les PV et en bleu pour le bouclier. Les anciennes positions réseau ne doivent pas annuler un soin serveur.
- Réception des annulations et refus serveur, arrêt des files de tirs concernées, purge des droits de tir gratuits sous JAMX, à la mort et au changement de carte/vaisseau.
- Rendu des effets ciblés sur les joueurs, y compris pour leur lanceur ; les effets sur une cible peuvent être dessinés lorsque le lanceur est hors écran.

## Familles revues

| Famille | Points traités ou relus dans le code |
| --- | --- |
| Basilisk | Valeur exaltée, annonce du nuage, position de la zone, montant et progression des dégâts, refus ZNA. |
| Berserker | Berserk, ralentissement de Représailles, renvoi à l'attaquant, lien de bouclier sur NPC et joueurs, transfert unique et coupure hors portée. |
| Citadel / Plus | Attraction sur NPC et verrouillage des joueurs ennemis proches, partage Protection, Fortification, vitesse plafonnée et saut refusé, Endurance prismatique et Voyage. |
| Cyborg / Venom | Dégâts progressifs directs en coque, absence de rupture de portée, exécution sous le seuil en fin d'effet, visuel sur joueur ciblé. |
| Diminisher | Supplément de dégâts sur le bouclier, pénalité de bouclier en fin naturelle, durée Centurion, visuel sur joueur ciblé. |
| Goliath X | Droit serveur pour la R-IC3 gratuite, gel et visuel de gel, refus ZNA ; passifs dégâts/XP relus. |
| Hammerclaw / Plus | Soins personnels serveur et soins au joueur verrouillé au lancement, toute firme, portée 1000. Trait vert/bleu partagé ; déverrouillage ou sortie de portée coupe définitivement le lien de ce lancement. `+X` et `+0` pour le bénéficiaire et les observateurs qui le verrouillent. Pods réservés au groupe, réallocation des dégâts réellement infligés. Plus : 450k cible / 225k soi sur 6 s pour la coque, pod 200k sur 8 s. |
| Hecate / Plus | Faisceau progressif en coque, ralentissement personnel, contrôle de portée, variants indépendants, charges Stockpile à partir des kills NPC serveur, consommation et protection. |
| Holo / Pusat Plus | Inversion, supplément de dégâts, boost de vitesse et ralentissements appliqués au cast serveur ; effets ciblés visibles. |
| Keres | Contagion serveur entre NPC et joueurs, jusqu'à dix cibles, ralentissement de 20 %, durée par infection et contours transmis ; Sleight relu avec les règles de mouvement. |
| Mimesis | Brouillage et esquive, sortie de phase, durée de charge de l'hologramme, rupture des verrous, positions interpolées des quatre clones avec coque, drones et plaque, explosion initiale et disparition des clones distantes. |
| Orcus / Plus | Assimilation dans les dégâts NPC et PvP, soins réels transmis ; variante Plus, durée et marqueur. |
| Paladin | Protection d'Éventreur et impacts de zone, Dernier rempart déclenché sur la mort serveur avec recharge, aura disponible et animation de déclenchement distantes. |
| Retiarus / Plus | Supercharge, ralentissement pendant la charge, cible et durée du tir chargé, droit d'impact unique, recharge après tir, rayon visible seulement au tir. |
| Sentinel | Croissance du bouclier serveur, maximum partagé, scintillement, ralentissement, coupure au changement de configuration, durée Centurion. |
| Solace / Plus | Soin instantané serveur, pourcentage Centurion, aura distante, boost de vitesse Plus. |
| Solaris / Plus | Brûlure de zone et burst final fixes, maintien en orbite et interruption des attaques NPC, éjection finale, zones ZNA ; passif des modules relu. |
| Spectrum / Plus | Réductions de dégâts serveur, renvoi Plus sans boucle, diffusion et interruption du visuel. |
| Tartarus / Plus | Droits de rafale gratuite, limite de roquettes lancées et touchées, interruption des files, boost de vitesse et effets distants. |
| Centurion / designs / Police | Héritage des aptitudes et variantes, durées réduites Centurion, refus de capacité étrangère au vaisseau actif. |

## Vérification et portée

Les tests sont désormais autorisés et exécutés. La commande `npm run test:abilities` relance les contrôles dédiés ; `npm test` les inclut dans la suite générale.

Résultat final : **658 tests réussis, 0 échec, 0 test ignoré** avec `npm.cmd test` (PowerShell Windows). Les contrôles de syntaxe et `git diff --check` passent également. Sous PowerShell avec scripts désactivés, utiliser `npm.cmd run test:abilities` pour la suite dédiée.

- `ABILITY_GAMEPLAY_TEST.js` : droits des 82 aptitudes, activation des capacités manuelles, voies spécifiques des passifs et de la téléportation, refus des offensives en ZNA côté lanceur et cible (joueurs et NPC), cadence et plafonds des dégâts, rafale QA de 125000, défenses, renvois, protection, lien de bouclier avec une vraie simulation NPC, soins Hammerclaw sur toute la durée, Sentinel, réallocation, stockpile, propagation SPR, marqueurs et JAMX.
- `ABILITY_VISUALS_TEST.js` : vrais chemins de dessin exécutés sur un Canvas instrumenté, exceptions collectées, existence des sprites demandés, phases de rendu, multiplicateurs de dégâts clients et décharge limitée aux canons du vaisseau. Serveurs et comptes temporaires avec deux ou trois clients WebSocket : activation et annulation des 76 aptitudes manuelles diffusées, soins liés à la cible initiale, destinataire incorrect refusé, `+X` / `+0`, déverrouillage définitif, groupe et rayon des pods, deux clones Triple barrage et quatre clones Hologramme, faux lasers des clones à zéro dégât.
- `ABILITY_FX_TEST.js` et `MOVEMENT_RULES_TEST.js` : registre, codes, paramètres de soin, assainissement réseau, ralentissements, mouvements, durées et recharges.

Oublis révélés et corrigés par cette campagne : les quatre réparations Hammerclaw étaient encore exclues des snapshots ; les effets Solace étaient exclus de diffusion et l'effet Solace de base n'était pas conservé pendant sa seconde d'animation ; les halos Solaris distants restaient au point du lancement au lieu de suivre le vaisseau.

Les anciens scénarios ont été actualisés pour les réparations verrouillées et les nouvelles dépendances du moteur. Les tests réseau utilisent des serveurs et bases temporaires, sans modifier les comptes du workspace.

Le contrôle du rendu vérifie les commandes Canvas et les sprites, sans comparaison de captures de deux navigateurs. La fluidité visuelle sous latence réelle et les combinaisons simultanées de toutes les aptitudes restent à constater en jeu ; les tests automatisés ne couvrent pas toutes ces combinaisons.

Les changements nécessitent de relancer le serveur multijoueur et de recharger les clients.
