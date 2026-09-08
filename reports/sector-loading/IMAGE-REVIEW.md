# Examen après retrait de la planche Streuner

Le Streuner utilise de nouveau ses 32 PNG originaux. La planche, son module de rendu
et ses scripts spécifiques ont été retirés. Le manifeste et son générateur ne contiennent
plus d'exception Streuner. Le chargement sélectif par secteur et le cache HTTP sont conservés.
Les rapports d'atlas précédents restent des archives de tests, pas une description du moteur actuel.

## Chargements évitables sans modifier les pixels

Dans `src/core/OrbitEngine.js`, la boucle sur `SAFE_MODULE_SPR` charge toutes les bases
MMO, EIC, VRU et pirate, quelle que soit la carte. Ces fichiers représentent
11 255 770 octets. `maps/1-1/Spawns.js` utilise uniquement CENTRE_MMO et BEACON_MMO.
Les huit autres images totalisent **10 147 184 octets inutiles au démarrage en 1-1**.
La seule base pirate pèse 7 243 565 octets (3000 × 1985 pixels).

La correction appliquée prépare les seules images référencées par les
modules et balises du secteur, également avant une transition vers un autre secteur.
Les fichiers sources restent strictement identiques. Le test de chargement vérifie
l'absence des bases EIC, VRU et pirate au démarrage en 1-1, la préparation de la base
pirate lors du passage en 5-2, puis la réutilisation des bases au retour en 1-1.

## Images lourdes mais réellement affichées

Les boutons du dock utilisent directement les PNG `assets/items/ammo_x*.png`
dans `style.css` (sélecteurs `.compactAmmoBtn[data-ammo]::before`). Les images X1,
X2, X3, X4 et X6 pèsent ensemble **8 830 477 octets**. X1 mesure 1351 × 1164 pixels,
les quatre autres 1024 × 1024. Leur surface d'affichage dans le dock est de 40 × 31
pixels CSS. Elles servent aussi dans l'interface de profil.
Il ne faut donc pas simplement empêcher leur téléchargement : elles sont utilisées.

Deux pistes distinctes : tester une recompression PNG sans perte avec égalité RGBA,
ou créer de petites variantes pour l'interface. La seconde change les pixels sources
et nécessite une validation visuelle ; elle ne répond pas automatiquement à une
exigence de zéro différence. Aucune image n'a été recompressée ou redimensionnée.

Le logo de chargement pèse 1 247 622 octets et mesure 1774 × 887 pixels, alors que
`.loadingLogo` est limité à 360 pixels CSS de large. Le fond de la carte 1-1 mesure
2100 × 1310 et pèse 2 382 317 octets : il occupe une grande partie de l'écran,
donc réduire arbitrairement sa résolution ne serait pas justifié.

## Vérification après retrait

`node scripts/verify-sector-loading.js` passe : les 32 PNG du Streuner sont demandés,
aucune sheet n'est chargée, le manifeste global n'est pas téléchargé, les passages
1-1 → 1-8 → 1-1 fonctionnent et aucun PNG NPC n'est rechargé au retour.
Avant cette correction : 656 requêtes jusqu'à DÉPART, dont 554 PNG. Les ressources uniques représentaient
57 809 699 octets sur disque. Ce volume n'est pas une mesure des octets transférés avec cache.
Les sprites optionnels de roquettes absents restent signalés séparément.

Les anciennes mesures réseau avec planche sont conservées dans NETWORK-TEST.md ;
results.json contient désormais la dernière exécution, sans planche.
