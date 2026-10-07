# Audit des ralentissements — 7 octobre 2026

Le blocage le plus net identifié vient du terminal de missions : il reconstruit son interface même fermé, notamment quand le déplacement change l'accès à une station. Plusieurs autres dépenses répétées augmentent la charge pendant le mouvement et le combat. Ces résultats ne prouvent pas encore la cause exacte des chutes de FPS sur le téléphone de ton ami.

Aucune modification du fonctionnement du jeu pendant cet audit. Les changements précédents du raffinage commun toutes les trois secondes sont conservés.

## Méthode et limites

- Lecture des boucles de simulation et de rendu, HUD et menus, effets, chargement des images, sauvegardes et échanges avec le serveur.
- Profils dans Edge sans interface, processeur ralenti par un facteur 4 : cartes 1-1, 1-8, 1-BL et qz sur ordinateur ; 1-1 et 1-BL avec viewport mobile 844 × 390 et DPR 3.
- Pour chaque session : repos, déplacement avec attaque, puis morts de NPC avec une surcharge volontaire d'effets (quatre explosions et vingt textes supplémentaires toutes les 500 ms). Compte et stockage isolés, serveur simulé avec horloge ; les NPC sont simulés localement dans ces profils.
- Vérification distincte avec le vrai serveur multijoueur et son test existant `SCRIPTS/BL_PERFORMANCE_BROWSER_TEST.js`, comprenant 101 NPC. Test réussi, sans erreur JavaScript.
- Mesures ciblées supplémentaires du terminal fermé, des sauvegardes avec plusieurs tailles d'inventaire et du rendu des textes. Aucun compte réel modifié.

L'émulation mobile et le ralentissement du processeur ne reproduisent pas le GPU, la chauffe ou le navigateur du téléphone. Les durées ci-dessous servent à comparer les tâches dans ce test, pas à annoncer ses FPS réels. Aucun blocage universel toutes les secondes n'a été isolé.

## Priorités

### 1. Terminal de missions fermé : blocage confirmé

Sources : [ORBIT_ENGINE.js](SRC/CORE/ORBIT_ENGINE.js), `drawUI` vers la ligne 37248 et `renderQuestTerminal` vers 14824 ; [QUEST_PRESENTATION.js](QUEST/QUEST_PRESENTATION.js), `buildQuestTerminalView` vers 237.

À chaque image, le HUD vérifie l'accès au terminal. Un changement d'accès appelle directement sa reconstruction, sans vérifier si la fenêtre est visible. Le code recalcule et trie les missions, remplace le HTML de l'arbre et du détail, puis remet à jour sa présentation. Les niveaux nécessaires sont recalculés plusieurs fois pendant le tri.

Mesure ciblée, fenêtre effectivement fermée : **239,5 / 272,8 / 286,7 ms** pour trois reconstructions. Pendant le déplacement sur 1-1, le profil identifie cette fonction et les calculs de niveaux de missions dans un blocage ; la plus longue tâche observée atteint 373 ms avec le viewport mobile.

Correction proposée : mémoriser que le terminal doit être actualisé lorsqu'il est fermé, puis reconstruire à l'ouverture. Conserver les contrôles d'accès et mettre en cache les niveaux des missions jusqu'à un changement de contexte. Ce problème concerne surtout les déplacements qui changent l'accès au terminal ; il n'explique pas à lui seul toutes les cartes.

### 2. Effets de combat : coût mesuré, à optimiser en conservant l'apparence

Source : [COMBAT_TEXT_RENDERER.js](SRC/CORE/COMBAT_TEXT_RENDERER.js), lignes 14–29 ; rendu des lasers et explosions dans `ORBIT_ENGINE.js`.

Chaque chiffre de dégâts redessine son contour, son remplissage et son halo flouté à chaque image. Les effets s'accumulent lors des attaques et des morts de NPC. Les lasers comprennent également deux passages de dessin en composition additive.

Comparaison ciblée de vingt textes : environ **18,6 ms avec les effets contre 10,3 ms avec le mode simple existant**, dans le viewport mobile sur 1-1. Ce microtest force une lecture des pixels : il inclut le coût de cette lecture et ne représente pas directement une image du jeu.

Correction proposée : tester une mise en cache des textes et des halos, ainsi que des lasers précomposés. Le test du mode simple sert de comparaison ; aucun réglage graphique n'a été changé. Le coût d'une explosion seule n'a pas été isolé de celui des autres effets.

### 3. HUD et informations d'équipement recalculés à chaque image

Source : `ORBIT_ENGINE.js`, `drawUI` vers 37248, `syncActionDockState` vers 18802, `drawPlayerBars` vers 32654, `getSpeedBreakdown` vers 15507.

Les gardes évitent déjà beaucoup d'écritures DOM identiques. Cependant, les valeurs, états des boutons et informations d'équipement sont encore recalculés à la fréquence du rendu. Certains calculs parcourent les modules ou les équipements ; l'envoi réseau recalcule aussi une partie de ces informations.

Le temps CPU moyen de `frame.ui` au repos est **1,7 à 1,9 ms par image** dans ces profils, fenêtres principales fermées. Les pics du terminal de missions sont un coût supplémentaire.

Correction proposée : mettre en cache les données d'équipement jusqu'à leur modification et rafraîchir les informations textuelles à une cadence adaptée. Garder les animations, déplacements et indicateurs de combat à leur cadence nécessaire.

### 4. Réacteurs des joueurs distants : temps fixe utilisé pendant le dessin

Source : `ORBIT_ENGINE.js`, `drawNetplayRemotes` vers 30910, mise à jour du réacteur et émission de traînée vers 31065 ; problème similaire pour le P.E.T distant.

Le dessin avance les effets avec un pas fixe de `0.016` seconde, quelle que soit la durée réelle de l'image. La vitesse visuelle utilise aussi une différence de position multipliée par 10. La progression et l'émission des effets dépendent donc de la fréquence de rendu. C'est confirmé dans le code ; son poids avec plusieurs joueurs n'a pas été mesuré ici.

Correction proposée : déplacer l'avancement de ces effets dans la mise à jour visuelle utilisant le vrai temps écoulé. Le dessin doit seulement afficher leur état.

### 5. Sauvegarde de position : coût croissant avec l'inventaire

Sources : `ORBIT_ENGINE.js`, `savePositionNow` vers 15444 et cadence de trois secondes vers 34132 ; [ACCOUNT.js](SRC/CORE/ACCOUNT.js), `saveHangarStateById` vers 3326 ; [ACCOUNT_NET.js](SRC/CORE/ACCOUNT_NET.js), `flushAccountCache` vers 215.

En mouvement, la sauvegarde de position passe par le compte complet et sa normalisation. Le cache réseau sérialise également le compte et ses données de synchronisation. Reporter ce travail avec `requestIdleCallback` ne le déplace pas hors du thread du navigateur.

Mesures locales ciblées, cinq sauvegardes par taille : médiane **2,5 ms sans module**, **4 ms avec 300 modules**, **8,2 ms avec 1 200 modules**, maximum 11,6 ms dans cette série. Un appel isolé sur BL a atteint 57,3 ms ; cette pointe n'a pas été reproduite dans la série ciblée. Le chemin réseau réel peut avoir d'autres coûts.

Correction proposée : éviter la normalisation complète lorsqu'une position seule change et réduire les copies du cache. Préserver la persistance et les règles de fusion des ressources du compte.

### 6. Menus fermés : actualisations périodiques inutiles possibles

Sources : [UI_CLAN.js](UI/UI_CLAN.js) vers 604, [UI_FRIENDS.js](UI/UI_FRIENDS.js) vers 160, [UI_GROUP.js](UI/UI_GROUP.js) vers 124.

Le clan recharge des données et reconstruit son interface toutes les cinq secondes sans garde de visibilité. Les amis vérifient leur état toutes les secondes et rechargent toutes les trente secondes. Le groupe vérifie son état toutes les 500 ms ; certaines listes sont réécrites même vides. Les reconstructions ne sont pas toutes conditionnées à une fenêtre ouverte.

Correction proposée : conserver les données et notifications nécessaires au jeu, mais reporter la reconstruction des fenêtres fermées. Ce travail périodique existe ; son coût avec un vrai compte chargé d'amis et de clans reste à mesurer. Il ne suffit pas à attribuer la saccade chaque seconde à ces menus.

### 7. Préchargement et cache d'images : risque surtout au démarrage et sur téléphone

Sources : `ORBIT_ENGINE.js`, `collectDroneSpriteJobs` vers 29945 et `preloadAllDroneSprites` vers 29961 ; [IMAGE_LOADER.js](SRC/CORE/IMAGE_LOADER.js).

Le jeu finit par précharger toutes les variantes de drones, soit 576 images. Le chargeur conserve ses images et promesses sans budget explicite d'éviction. La session ciblée a chargé 1 801 images, y compris les assets préparés pour le test ; ce nombre n'est pas une mesure de mémoire.

Correction proposée : donner la priorité aux variantes utilisées, étaler le préchargement facultatif et définir un budget de cache qui conserve les assets actifs. Une pression mémoire durable reste une hypothèse : aucune fuite mémoire n'a été démontrée.

### 8. Authentification serveur : pause possible pour tous les joueurs

Source : [ACCOUNT_SERVER.js](SCRIPTS/ACCOUNT_SERVER.js), `scryptSync` vers les lignes 55 et 64.

Les mots de passe sont traités de façon synchrone dans le processus qui héberge aussi la simulation multijoueur. Huit appels ciblés ont pris environ 39 à 98 ms chacun sur cette machine. Une connexion peut donc retarder les mises à jour réseau des autres joueurs. C'est une piste de latence serveur, distincte d'une baisse de FPS du rendu.

Correction proposée : utiliser le calcul asynchrone en conservant les paramètres et la compatibilité des mots de passe.

## Comparaison des scénarios chargés

Temps CPU moyen mesuré par `frame.total`, en millisecondes, processeur ralenti ×4. Le scénario d'explosions ajoute volontairement des effets ; il ne correspond pas à une seule mort de NPC.

| Profil | Repos | Déplacement + attaque | Morts + surcharge d'effets |
| --- | ---: | ---: | ---: |
| Ordinateur, 1-8 | 9,6 | 14,8 | 22,6 |
| Ordinateur, 1-BL | 12,9 | 22,7 | 30,7 |
| Viewport mobile, 1-BL | 15,2 | 25,0 | 38,0 |

Le test multijoueur séparé, sans ralentissement CPU, a mesuré environ **2,6 ms de CPU par image** en déplacement et attaque sur BL, avec un maximum de traitement de snapshot de **0,8 ms** pour ce scénario. Cela ne couvre pas une carte remplie de joueurs, ni le GPU du téléphone. Les profils chargés ci-dessus utilisent la simulation locale et ne sont pas directement comparables à ce test réseau.

Les limites existantes des effets, le recyclage des projectiles, le filtrage des objets hors écran, les caches de contours et la cadence réduite des snapshots de NPC éloignés sont déjà présents. L'audit ne justifie donc pas de réduire globalement les graphismes. La première correction à préparer est la reconstruction du terminal fermé, puis les calculs répétés du HUD et le rendu des effets de combat.
