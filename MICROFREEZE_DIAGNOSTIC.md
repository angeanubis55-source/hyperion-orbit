# Micro-freezes : diagnostic du 9 octobre 2026

Deux surcoûts sont confirmés même au repos : les recherches du catalogue pour des emplacements vides du PET et la double actualisation de la barre d'actions à chaque image. Une session isolée sur la carte pirate présente aussi des pauses de nettoyage mémoire. Cela fournit des corrections ciblées à préparer, sans prouver que ces tâches expliquent tous les blocages du S23 FE.

Aucun fichier de fonctionnement du jeu, réglage réel, compte réel ou serveur en cours n'a été modifié pendant cette recherche. Les variantes ci-dessous ont été injectées uniquement dans les réponses HTTP d'un navigateur de test. Ce document est le seul fichier ajouté au projet.

## Vidéo et contexte

- Fichier examiné : `C:\Users\dilan\Desktop\bug bug bug.mp4`, durée 41,73 s, 608 × 1000 pixels, environ 30 images/s.
- Le centre pirate et les Interceptors correspondent à 5-2. Le compteur du jeu affiche souvent 100–120 FPS, avec notamment environ 39 FPS vers 22 s et 48 FPS vers 26 s. Le ping reste voisin de 31–36 ms pendant ces passages.
- Bandicam est utilisé du côté de l'utilisateur. Son ami indique ressentir les mêmes blocages sans enregistrer : l'enregistrement n'est pas retenu comme explication du problème vécu.
- Les images peu différentes ne sont pas comptées automatiquement comme des freezes : un vaisseau immobile peut continuer à changer d'orientation ou à recevoir des dégâts. La vidéo ne démontre pas un arrêt exactement chaque seconde.
- Le centre pirate n'a pas de terminal de missions. `hasQuestTerminalAccess()` reste faux dans la reproduction. Le problème de reconstruction du terminal fermé documenté dans l'audit précédent ne s'applique donc pas à cette scène.

## Méthode

Chrome sans interface, viewport mobile 384 × 700, DPR 3, ralentissement CPU ×4. Le moteur limite le DPR du canvas à 2 ; le viewport de mise en page observé produit un bitmap 1376 × 2510. Cela ne reproduit pas le GPU, les températures ou la fréquence d'écran du téléphone.

Un serveur multijoueur et un compte SQLite temporaires ont été créés pour chaque session, avec un Zephyr et un PET possédé mais inactif. La carte contient 101 NPC. Les dégâts entrants ont été neutralisés uniquement dans le processus de test pour conserver le scénario. Carte, position, démarrage du moteur et absence d'erreurs JavaScript ont été contrôlés. Les premières tentatives de préparation incomplètes ont été exclues.

Première session : repos au centre, déplacement hors de la station, puis repos. Deux autres sessions comparent au centre les chemins existants et des variantes de diagnostic, avec les effets désactivés dans ce navigateur isolé comme comparaison avec les réglages montrés dans la vidéo.

Les captures demandent 12 s d'attente par scénario. Les opérations de collecte ajoutent un délai : les profils CPU durent environ 12,7 à 13,7 s. Les moyennes par image et les compteurs sont ceux de toute la fenêtre instrumentée. Les temps sont inclusifs ; il ne faut pas additionner une fonction à ses sous-fonctions.

## 1. Catalogue : recherches répétées pour des cases vides du PET

Sources : [CATALOG.js](SRC/CORE/CATALOG.js), `findCatalogItem` ; [PET_VITALS.js](PET/PET_VITALS.js), `getPetVitalLimits` ; [ORBIT_ENGINE.js](SRC/CORE/ORBIT_ENGINE.js), `updatePetHud`, `petMaxHpWithHeat`, `petShieldMaxForHud` et l'envoi réseau.

Le calcul des maxima du PET parcourt ses générateurs et protocoles. Pour une case vide, il appelle malgré tout `findCatalogItem(null)`. Cette recherche parcourt les catégories et leurs éléments, sans garde pour une clé absente. Elle crée également des tableaux et fonctions temporaires.

Dans la première capture de comparaison : **16 426 recherches**, dont **15 552 pour des clés nulles**, soit environ **95 %**. Les 2 592 calculs de vitalité du PET expliquent exactement ces 15 552 recherches vides : six par calcul dans ce fit. Le PET est inactif ; son HUD et les informations réseau continuent de demander ses maxima.

Une variante de diagnostic remplace uniquement la recherche par un index des mêmes objets du catalogue. Dans une séquence original / index / original, le coût moyen du HUD passe de **2,10 ms à 1,65 ms**, puis remonte à **2,06 ms**. L'envoi réseau passe de **1,81 ms à 0,85 ms**, puis remonte à **1,69 ms**. Les calculs et paramètres graphiques restent identiques entre ces trois segments.

Correction à préparer : éviter les recherches pour les cases vides ; indexer le catalogue avec une politique adaptée à ses éventuelles mutations ; partager les maxima du PET lorsque son équipement, son niveau et son vaisseau n'ont pas changé. La variante mesurée est un outil de diagnostic, pas une implémentation livrée.

## 2. Barre d'actions : double calcul confirmé par image

Source : [ORBIT_ENGINE.js](SRC/CORE/ORBIT_ENGINE.js), `updateRepairUI`, `updateSkillUI` et `syncActionDockState`.

`drawUI()` appelle les deux fonctions d'interface, et chacune appelle `syncActionDockState()`. La barre entière est donc parcourue deux fois, avec reconstruction de textes, infobulles et fonctions de mise à jour même lorsque ses valeurs sont identiques. Les gardes existantes évitent beaucoup d'écritures DOM, mais pas ces calculs préalables.

Mesure : **1 746 exécutions pour 873 images**. Une variante limitée au scénario immobile conserve un seul calcul par image : **1 031 exécutions pour 1 031 images**, contre 2 062 tentatives.

Avec l'index du catalogue actif dans les trois segments de cette seconde comparaison :

| Segment | HUD moyen par image | Exécutions de la barre par image |
| --- | ---: | ---: |
| Double calcul, avant | 1,72 ms | 2 |
| Calcul unique | 1,23 ms | 1 |
| Double calcul, après | 1,48 ms | 2 |

La variation entre les deux références montre aussi l'effet de l'échauffement. Le gain du calcul unique reste visible par rapport aux deux références ; il ne faut pas attribuer toute la différence entre captures à cette seule modification.

Correction à préparer : une actualisation commune dans le HUD, en conservant les actualisations immédiates nécessaires lors des actions utilisateur. Un simple verrou par timestamp, utilisé ici pour mesurer le doublon au repos, ne suffit pas à valider tous les cas interactifs.

## 3. Objets temporaires et pauses mémoire

Les traces de la première session identifient des nettoyages mémoire majeurs de **26 à 38 ms**, y compris immobile. Des pics de CPU d'une image atteignent environ **68 ms**. Ces durées sont celles du test ralenti ×4, pas des mesures du S23 FE. Les nettoyages mineurs reviennent aussi régulièrement, mais une pause majeure n'arrive pas à chaque seconde ni dans chaque capture.

Le profil d'allocations estime environ **116–120 Mio d'objets temporaires** sur les captures de référence avec effets désactivés. Il compte aussi des objets déjà libérés : ce chiffre n'est ni la mémoire conservée, ni une fuite, ni la mémoire graphique.

Les principales piles d'allocations comprennent :

- `syncNetNpcs` : création répétée d'un ensemble de présence et d'une table UID → NPC dans la boucle de simulation ;
- les reconstructions d'index d'entités et de l'index spatial, dont les tables et ensembles sont remplis à nouveau ;
- `syncActionDockState` et ses infobulles, exécutés deux fois par image ;
- les recherches du catalogue et les autres structures temporaires de la simulation et du réseau.

La pression d'allocation et les pauses mémoire constituent une piste étayée pour des micro-freezes communs à plusieurs cartes. Les recherches du catalogue ne représentent qu'une partie des allocations : les optimiser ne garantit pas la disparition de toutes les pauses.

## Ce qui n'est pas établi

Les vérifications sociales à une seconde n'ont pas produit un blocage lourd systématique dans ces comptes temporaires. Une pointe du poll groupe et quelques appels du clan existent, mais leurs coûts varient et peuvent eux-mêmes inclure une pause mémoire. Les sauvegardes d'univers et de collectables restent petites dans ces scénarios. Les snapshots n'ont pas produit de traitement massif régulier.

La station pirate est grande et son coût graphique réel sur le téléphone n'est pas isolé par ce test CPU. Il ne faut donc pas l'innocenter ni l'accuser à partir de cette seule capture. Le comportement avec un compte réel chargé, les autres joueurs et les effets de combat reste différent de celui du compte de diagnostic.

Les deux surcoûts du catalogue/PET et du HUD sont mesurés et peuvent être corrigés sans réduire l'apparence du jeu. La cause exacte de chaque chute dans la vidéo et la régression par rapport à la soirée où le jeu était fluide restent à confirmer sur l'appareil ou par une comparaison contrôlée des versions.

## Optimisations appliquées après autorisation

Le catalogue utilise maintenant un index construit une seule fois, conserve les objets d'origine et la priorité du premier ID, et rejette immédiatement les clés absentes. Cette optimisation profite à tous les utilisateurs du catalogue, avec ou sans PET.

Le HUD n'actualise plus la barre d'actions qu'une fois par passage. Les fonctions d'aptitudes et de réparation conservent leur actualisation immédiate lorsqu'elles sont appelées hors de ce passage ; aucun verrou global de frame ne bloque une action utilisateur.

Validation : 308 tests réussis, dont deux vérifications ajoutées pour la compatibilité du catalogue et l'actualisation du HUD. Le test navigateur multijoueur sur BL réussit aussi au repos, avec marquage, avec le localisateur PET, en combat, en déplacement et en déplacement avec combat ; aucune erreur JavaScript relevée. Les réglages graphiques livrés et la version déjà modifiée par l'utilisateur sont conservés. La disparition des micro-freezes sur le téléphone reste à vérifier après actualisation du jeu.
