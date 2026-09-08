# Test de connexion limitée

Essais du 8 septembre 2026, Edge 152 automatisé, serveur local HTTP du projet.
Une exécution par profil, sans limitation CPU. Ce sont des mesures exploratoires,
pas des moyennes ni une mesure des FPS ou du futur serveur multijoueur.

| Étape | Local sans limitation | 5 Mbit/s, latence simulée 80 ms |
|---|---:|---:|
| Première arrivée en 1-1, cache vide, jusqu'à DÉPART | 15,1 s | 100,4 s |
| Rafraîchissement avec cache, jusqu'à DÉPART | 13,6 s | 27,3 s |
| Transition 1-1 → 1-8 | 1,56 s | 11,75 s |
| Retour 1-8 → 1-1 | 0,34 s | 0,55 s |

Profil limité : téléchargement 5 000 000 bit/s, envoi 1 000 000 bit/s,
latence CDP 80 ms. Le cache navigateur est conservé entre les étapes et le serveur
utilise des ETag avec revalidation. Chaque profil commence avec un contexte vide.
Le rafraîchissement est fait après l'affichage du jeu, sans attendre la fin de tous
les chargements audio déclenchés par DÉPART. Les transitions sont chronométrées
jusqu'à la résolution de la préparation de la destination.

## Résultats fonctionnels

- 626 requêtes au démarrage, dont 523 PNG ; aucun téléchargement du manifeste global.
- Les sprites NPC de 1-8 restent différés jusqu'au changement de carte.
- Aucun sprite NPC rechargé au retour en 1-1.
- Validation HTTP 304 vérifiée ; aucune erreur JavaScript ni ressource inattendue absente.
- Les 12 sprites optionnels de roquettes déjà absents sont consignés séparément dans les JSON.

## Poids restant

La somme des tailles sur disque des ressources uniques demandées avant DÉPART est
57 809 920 octets, soit 57,8 Mo décimaux. Ce n'est pas une mesure des octets réseau
transférés : cela exclut notamment les en-têtes et ne déduit pas les réponses en cache.

Les plus gros fichiers demandés :

| Fichier | Taille |
|---|---:|
| assets/PIRATES/Centre.png | 7 243 565 octets |
| Backgrounds/map1-1.png | 2 382 317 octets |
| assets/items/ammo_x1.png | 2 091 127 octets |
| assets/items/ammo_x6.png | 1 705 436 octets |
| assets/items/ammo_x4.png | 1 689 080 octets |
| assets/items/ammo_x3.png | 1 676 080 octets |
| assets/items/ammo_x2.png | 1 668 754 octets |
| assets/ui/Logo.png | 1 247 622 octets |

Le chargement sélectif évite le téléchargement global, mais le démarrage reste long
sur cette connexion. Les prochaines investigations doivent cibler les chargements
encore inutiles pour le secteur et les images lourdes de l'interface. Regrouper les
sprites ne garantit pas à lui seul une réduction suffisante de ce volume.

## Reproduire

```powershell
npm run test:loading -- --network=limited
npm run test:loading -- --network=local
```

Le profil optionnel `--network=slow` simule 1,5 Mbit/s et 150 ms ; il n'a pas été
exécuté pour ce rapport. Les mesures brutes sont dans `limited.json` et `results.json`.
Le moteur et les sprites n'ont pas été modifiés pendant ces essais.
