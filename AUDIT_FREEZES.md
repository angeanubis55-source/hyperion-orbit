# Audit des freezes — 7 septembre 2026

## Mesure du parcours de destruction des NPC

Commande ajoutée : `node scripts/profile-kills.js`. Résultats de la dernière exécution dans `audit-kills-results.json`.

Méthode : Edge sans interface, compte fictif avec 5 000 lasers et sans drones achetés, carte 1-8, deux répétitions par scénario. Profil fermé puis inventaire ouvert ; référence sans kill, StreuneR8, Cubikon avec 80 Protegit. Le serveur de test injecte des accès au moteur uniquement dans la réponse JavaScript du navigateur isolé. Aucune commande de destruction n'est ajoutée au jeu distribué.

Le test crée un NPC, applique des dégâts létaux via `damageEnemy`, puis laisse la vraie boucle exécuter morts, récompenses, caisses, effets et sauvegarde différée. Il vérifie un kill récompensé et zéro ennemi mort restant ; il attend la fin de la sauvegarde en mémoire (`dirty=false`, aucun callback en attente). Cela exerce le parcours de destruction, pas un combat manuel complet avec acquisition de cible, tirs et trajectoires. Le cas Cubikon prépare directement ses 80 minions avant le coup fatal.

Maximum observé sur les deux répétitions, en millisecondes (les colonnes sont des maxima indépendants, elles ne s'additionnent pas) :

| Profil | Scénario | Traitement des morts | Sauvegarde | Appel de rendu `draw` | Intervalle maximal entre images |
|---|---|---:|---:|---:|---:|
| Fermé | Sans kill | 0,1 | — | 58,8 | 75,1 |
| Fermé | StreuneR8 | 1,8 | 6,3 | 66,7 | 95,9 |
| Fermé | Cubikon + 80 Protegit | 1,6 | 5,7 | 76,3 | 171,0 |
| Inventaire | Sans kill | 0,0 | — | 67,8 | 104,3 |
| Inventaire | StreuneR8 | 0,7 | 6,3 | 66,1 | 104,3 |
| Inventaire | Cubikon + 80 Protegit | 1,3 | 7,6 | 114,9 | 187,7 |

Conclusion limitée à ce scénario : après les correctifs d'interface, la sauvegarde et la logique de mort ne constituent pas le coût dominant mesuré. Le rendu est déjà lent sans kill dans cet environnement ; les destructions groupées du Cubikon aggravent les intervalles entre images. Le temps CPU de `drawExplosions` ne représente pas à lui seul le coût différé du rendu/GPU. Les résultats ne permettent pas d'attribuer cette hausse à une fonction graphique précise, ni de garantir les mêmes chiffres sur le PC du joueur.

Les scénarios sont successifs dans la même session et ne constituent pas une comparaison aléatoire contrôlée des effets seuls : chargements, caisses et notifications peuvent varier. Il manque encore un compte représentatif avec drones/modules, un combat manuel et une trace détaillant les couches de rendu, la composition et les ressources graphiques. La prochaine investigation doit cibler le rendu général et le pic autour des destructions groupées ; alléger le stockage reste utile pour de gros comptes, mais n'est pas démontré prioritaire ici.

L'accès à l'équipement sur 1-8 a également été vérifié après positionnement au centre de la base : `canEquip=true`, ouverture de `fitCard` réussie. Cela complète la vérification d'accès, sans prétendre refaire sur 1-8 tout le parcours de montage/démontage déjà testé sur 1-1.

## Lot suivant : pagination de l'inventaire et de l'historique

Implémenté : 120 cases maximum par page, navigation précédent/suivant avec total, recherche sur tous les objets et retour à la première page lors d'une recherche. Le découpage intervient avant l'expansion des quantités : un million de lasers ne produit que les 120 objets de la page demandée. Les ressources empilées conservent leur quantité. Si une page disparaît après modification du contenu, la sélection est ramenée à la dernière page disponible.

L'historique de roulette affiche 30 entrées par page, les plus récentes en premier. Seule la tranche affichée est copiée/inversée ; un nouveau résultat ramène l'historique à la première page. Aucune donnée possédée ou historique n'est supprimé.

Mesures sur le scénario précédent, à 5 000 équipements : ouverture de l'inventaire modifié autour de 18–22 ms contre environ 424 ms après le premier lot, avec 120 cases au lieu de 5 001. Mesures instrumentées sur compte fictif, non garanties sur le matériel du joueur.

Validation : 91 tests unitaires réussis ; smoke navigateur 1-1 avec équipement/configurations/boutique réussi ; assertions navigateur 1-8 réussies pour achat, pagination inventaire, recherche d'un vaisseau situé après les équipements, conservation du DOM inchangé, historique de 65 entrées réparti en 30/30/5 et ordre chronologique inversé. Restent l'allègement de la persistance et le profilage des destructions réelles de NPC.

## Correctifs appliqués après l'audit : étapes 1 et 2

Les constats et chiffres d'origine ci-dessous décrivent la version avant correction.

- Mesure des FPS et des pauses avec le delta réel ; simulation toujours plafonnée à 33 ms.
- Mesures CPU agrégées de `processDeaths`, `saveProgressNow` et des trois panneaux via `window.HyperionPerformance.snapshot()` ; remise à zéro avec `.reset()`. Les durées sont synchrones, inclusives et ne mesurent pas le travail GPU.
- Ouverture et démarrage : seul le panneau actif est construit, si le profil est visible.
- Une seule notification de compte alimente le rafraîchissement de l'interface, regroupé sur une frame avec vérification de visibilité.
- Un inventaire dont les données affichées n'ont pas changé conserve ses nœuds.
- Sélection boutique : changement de sélection et d'aperçu uniquement. Changement de solde ou de stock : actualisation du texte et de l'état du bouton d'achat sans reconstruire la liste ni perdre la quantité saisie.
- Les mises à jour automatiques continuent de laisser la roulette gérer son animation.

Mesures après correction, même navigateur instrumenté et comptes synthétiques : à 1 000 équipements, sauvegarde profil ouvert autour de 4–5 ms contre 102 ms ; à 5 000, autour de 4 ms contre 513 ms. Aucune reconstruction d'inventaire pour une sauvegarde inchangée, contre deux auparavant. Ouverture avec la boutique sélectionnée et préalablement visitée : environ 5–7 ms, même à 5 000 équipements.

Limite importante : ouvrir directement l'inventaire après modification de ses données construit encore toutes les cases (environ 417 ms à 5 000 équipements dans une exécution). La virtualisation/pagination et l'allègement du stockage sont les étapes suivantes, non incluses dans ce lot. Une progression qui change l'XP des drones affichée dans l'inventaire peut encore entraîner sa reconstruction lorsqu'il est visible.

Validation : 89 tests unitaires réussis ; smoke navigateur `--map=1-1 --profile` réussi (équipement, configurations, boutique). Le smoke `--map=1-8 --profile` expire à l'ouverture de l'équipement ; ce scénario ne positionne pas explicitement le joueur dans la base exigée pour cette action. Les contrôles ciblés du script d'audit sur 1-8 couvrent conservation du DOM lors de la sélection et du changement de solde, absence de rendu des panneaux cachés, achat et actualisation de l'inventaire. Le script échoue désormais en cas d'erreur JavaScript ou d'assertion.

Audit du parcours mort NPC → récompenses → sauvegarde → interface, des panneaux boutique/hangars/inventaire, et des systèmes connexes (apparition, effets, images, journal, instrumentation). Aucun comportement du jeu modifié. Les modifications préexistantes de `src/data/version.js` et `src/data/patchNotes.js` sont conservées.

## Conclusion

Les blocages de l'interface sont reproductibles. Le principal multiplicateur est l'inventaire : une case DOM par exemplaire d'équipement, reconstruction intégrale même quand cet onglet est caché, et deux reconstructions par sauvegarde lorsque le profil est ouvert. Un kill déclenche une sauvegarde différée susceptible de provoquer ces mêmes blocages.

Cela ne prouve pas que tous les freezes après kill, notamment profil fermé, viennent de l'inventaire. Le compte réel du joueur et une capture de son combat n'ont pas été analysés. Les autres pistes ci-dessous sont distinguées des mesures confirmées.

## Mesures reproductibles

Commande : `node scripts/audit-freezes.js --map=1-8`.

Le script reprend le serveur et le navigateur Edge sans interface du profileur existant. Il utilise un contexte navigateur isolé et un compte fictif, puis ajoute 1, 100, 1 000 et 5 000 exemplaires de `laser_lf1`. Il mesure les appels synchrones et compte les remplacements de l'inventaire pendant une sauvegarde. Il ne touche pas au compte de la session habituelle.

| Équipements identiques | Ouverture profil | Onglet inventaire | Sauvegarde profil ouvert | Sauvegarde profil fermé | Reconstructions inventaire/sauvegarde ouverte |
|---:|---:|---:|---:|---:|---:|
| 1 | 34,8 ms | 4,4 ms | 17,5 ms | 4,4 ms | 2 |
| 100 | 31,4 ms | 13,1 ms | 27,0 ms | 4,5 ms | 2 |
| 1 000 | 113,7 ms | 90,7 ms | 102,1 ms | 4,9 ms | 2 |
| 5 000 | 526,0 ms | 500,0 ms | 513,2 ms | 4,3 ms | 2 |

Ce sont des observations d'une exécution, pas des moyennes statistiques ni des temps garantis sur le PC du joueur. Les durées synchrones excluent notamment la seconde reconstruction différée par requestAnimationFrame et une partie du rendu navigateur. À 60 FPS, le budget total d'une image est d'environ 16,7 ms.

Changer seulement la quantité d'un objet grossit très peu le JSON sauvegardé : la forte hausse mesurée profil ouvert isole surtout le coût de reconstruction des cases, plutôt que celui du stockage.

Le profileur existant a également été exécuté seul sur 1-8 : environ 19,6 FPS dans cet environnement instrumenté. Ce chiffre n'est pas représentatif du matériel du joueur. Son instrumentation Canvas ajoute du coût et ses statistiques de callbacks requestAnimationFrame ne correspondent pas exclusivement aux frames du moteur ; il ne faut pas lire son « JS par frame » comme un temps CPU exact du moteur.

## Constats prioritaires

### 1. Inventaire sans limite de rendu — confirmé, priorité haute

`public/profile.js:842` : `expandInventorySlots` utilise `Array.from({ length: quantity })` pour les équipements. `renderInventory`, ligne 872, produit ensuite l'intégralité du HTML, des infobulles et des images par `innerHTML`. Pas de pagination ni de virtualisation. 5 000 lasers identiques produisent 5 000 cases, plus les autres biens.

Effets : travail JavaScript, création/destruction de nœuds, calcul de style et pression mémoire. Les images de l'inventaire n'ont pas de chargement paresseux explicite.

Correction : virtualiser ou paginer les cases, ou empiler les équipements si le produit le permet ; mettre à jour les quantités et éléments modifiés sans reconstruire l'ensemble.

### 2. Tous les panneaux reconstruits à l'ouverture — confirmé, priorité haute

`public/profile.js:4282` : `openProfileOverlay` force d'abord une sauvegarde, relit le compte, puis appelle `renderHeader`, `renderStats`, `renderHangars`, `renderInventory` et `renderShop` avant `setTab`.

L'ouverture de la boutique paie donc aussi le coût de l'inventaire caché et des hangars. `boot`, ligne 4325 environ, applique le même principe au démarrage. Les clics d'onglets reconstruisent ensuite le panneau choisi.

Correction : rendre uniquement l'onglet actif ; conserver les panneaux déjà construits et invalider les parties dont les données ont changé.

### 3. Deux circuits de rafraîchissement après sauvegarde — confirmé, priorité haute

`src/core/OrbitEngine.js:2315` : `saveProgressNow` appelle `updateCurrentUserProgress`, puis émet `orbit:profile-progress`.

`src/core/account.js:422` : la sauvegarde émet aussi `orbit:user-updated`.

`public/profile.js:4398` : le premier événement reconstruit immédiatement les statistiques NPC et l'inventaire lorsque le profil est ouvert, quel que soit l'onglet actif.

`public/profile.js:4420` : le second programme un callback requestAnimationFrame qui relit le compte, calcule une signature JSON et reconstruit header, statistiques, hangars, inventaire et boutique, sauf la roulette. Les crédits, l'XP des drones et la position des hangars font partie de cette signature ; elle change lors d'actions ordinaires du jeu.

Deux reconstructions de l'inventaire par sauvegarde ont été observées. requestAnimationFrame n'exécute pas ce travail sur un autre thread : il l'ajoute avant une image.

Correction : un seul circuit de notification, avec domaines modifiés, mise à jour du panneau visible uniquement et regroupement des changements.

### 4. Sauvegarde différée mais toujours synchrone — structure confirmée, coût réel à mesurer

`src/core/OrbitEngine.js:6777` et `:6890` : la mort accorde les récompenses et marque la progression comme modifiée. La version actuelle ne sauvegarde plus directement dans `killRewards`.

`src/core/OrbitEngine.js:2044` : délai de 0,35 seconde ; `scheduleProgressSave` utilise requestIdleCallback avec timeout de 1 200 ms, ou setTimeout. Ce délai peut expliquer un à-coup légèrement après la destruction, sans garantir son instant exact.

`src/core/account.js:636`, `:662`, `:422` : lecture/parsing de tous les comptes, normalisation du compte courant, nouvelle normalisation de la progression, relecture de tous les comptes avant écriture, puis JSON.stringify et localStorage.setItem du tableau entier.

Le traitement reste monolithique sur le thread principal. La normalisation est répétée même lorsque le schéma est déjà à jour. Les lectures simples ne réécrivent cependant plus systématiquement le stockage : cette ancienne cause est déjà corrigée.

Correction : état en mémoire cohérent, migration uniquement à l'entrée, persistance par utilisateur et stockage asynchrone si nécessaire. Préserver la cohérence lors des achats, changements de configuration et synchronisations entre onglets.

### 5. Compteurs de performance masquant les freezes — confirmé

`src/core/OrbitEngine.js:11254` : `dt` est plafonné à 0,033 seconde avant `performanceMonitor.record(dt)` et le calcul FPS. Une pause de 500 ms est donc comptée comme 33 ms. Les statistiques visibles sous-estiment les blocages et peuvent surestimer les FPS.

Correction : mesurer le delta réel pour les métriques, garder un delta séparé plafonné pour la simulation. Ajouter des mesures de processDeaths, sauvegarde et panneaux, ainsi que les tâches longues navigateur.

## Autres points susceptibles de contribuer

### Apparition des NPC : scan camps × ennemis

`src/core/OrbitEngine.js:8031` : chaque camp parcourt tous les ennemis pour compter ses survivants. Le délai est réassigné par `camp.respawn ?? 1.5` ; un délai explicite de zéro reste zéro.

`maps/1-8/Spawns.js:6` et `:68` : 50 camps, délai zéro, donc environ 2 500 comparaisons par passage à population nominale et remplacement rapide après destruction. Plusieurs autres cartes utilisent également zéro. Ce n'est pas à lui seul une preuve de freeze, mais c'est du travail permanent évitable, croissant avec la population.

Correction : maintenir les effectifs par camp ou les compter en une seule passe ; distinguer le délai de respawn du rythme de vérification.

### Hangars et boutique

`public/profile.js:1187` : tous les hangars sont recréés ; pour chacun, filtrage des modules et construction des options de design. Le coût augmente avec hangars et modules. Le compte synthétique à un hangar ne mesure pas ce cas.

`public/profile.js:1363` : toute la liste boutique est recréée, y compris après un simple clic sur un article (`:1456` environ). Les images de liste sont déjà lazy ; cela ne limite pas la création du DOM.

`public/profile.js:1628` : historique de roulette copié, inversé et rendu entièrement. `src/core/account.js:1370` et `:1395` : historique enrichi sans borne à ces points. Il grossit aussi la sauvegarde et la signature d'interface.

Correction : sélection et aperçu boutique ciblés, pagination de l'historique, index des modules par famille pour les hangars.

### Effets de destruction et première utilisation

`src/core/OrbitEngine.js:6890` : explosion, six atténuations audio, son de mort, caisse, actions onKill, quêtes, récompenses et suppression. Un Cubikon marque ses Protegit pour destruction ; plusieurs explosions peuvent être traitées sur des images voisines. Les sons NPC sont plafonnés à 16 voix et les explosions utilisent une collection bornée.

Le chargeur d'images principal limite déjà la concurrence et demande le décodage asynchrone ; `spawnExplosion` utilise les images préparées ou un effet de secours. Aucun chargement synchrone d'explosion n'a été identifié dans cette fonction. Upload GPU, rendu de nombreuses explosions et démarrage audio restent à vérifier par capture réelle, sans les déclarer responsables.

`public/profile.js:2749` : l'aperçu d'équipement possède un cache d'images séparé et charge toutes les orientations à la fois. Risque de pic de chargement/mémoire lors des premières visites de nombreux vaisseaux ; coût non mesuré ici.

### Journal

`src/core/gameLogStore.js:36` et `:64` : tous les 100 ajouts, purge par parcours de tout l'historique utilisateur, même avant d'atteindre 100 000 entrées. La recherche textuelle peut aussi parcourir beaucoup de lignes. IndexedDB reste asynchrone : ce n'est pas un blocage synchrone égal à toute la durée de la transaction, mais beaucoup de callbacks et de travail peuvent concurrencer le jeu. Le journal visible se rafraîchit après chaque ajout.

Correction : purger uniquement l'excédent nécessaire et regrouper les rafraîchissements ; mesurer les sessions avec historique volumineux.

### Anomalie distincte sur 1-8

`maps/1-8/Spawns.js:107` environ : le portail vers 1-8.1 déclare deux propriétés `toMap`, la seconde écrase la première avec `p_18.1_to_18`. À corriger/valider avec le registre de cartes ; ce problème ne prouve rien sur les freezes de combat.

## Ordre de travail conseillé

1. Corriger les métriques et conserver les scénarios de reproduction.
2. Rendre seulement le panneau actif, supprimer le double rafraîchissement.
3. Borner le DOM inventaire et l'historique roulette ; mises à jour ciblées boutique/hangars.
4. Mesurer puis alléger sauvegarde et normalisation sur un compte volumineux représentatif.
5. Réduire le scan de respawn, puis profiler un kill isolé et un Cubikon, profil fermé/ouvert, ressources froides/chaudes.

La reproduction ajoutée mesure ouverture, onglets et sauvegarde ; elle ne tue pas réellement un NPC. La relation kill → sauvegarde est établie par lecture du code. Une trace de combat sur le compte réel reste nécessaire pour attribuer précisément les freezes résiduels profil fermé.
