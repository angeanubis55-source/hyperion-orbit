# Hyperion Orbit

Prototype de jeu spatial 2D jouable dans le navigateur, inspiré de DarkOrbit.

## Mettre à jour (Windows)

Double-clique sur `HyperionOrbit.bat`.

Le script supprime tout sauf lui-même, re-télécharge la dernière version depuis GitHub
et remet tout en place.
(Premier téléchargement lourd : ~1,3 Go d'images. Windows peut afficher un
avertissement SmartScreen : `Informations complémentaires` > `Exécuter quand même`.)

## Lancer le projet (développeurs)

Le projet utilise les modules JavaScript natifs et doit être servi par un serveur HTTP local.

```powershell
npm run server
```

Ouvrir ensuite l’adresse indiquée par le serveur.

## Tests

```powershell
npm test
```

Vérifier le démarrage réel de la carte 1-1 dans Edge en mode invisible :

```powershell
npm run test:browser
```

Mesurer l’index spatial utilisé pour les NPC :

```powershell
npm run benchmark
```

## État du projet

- cartes et portails dynamiques ;
- combat contre les NPC ;
- hangars, équipements et configurations ;
- sauvegarde locale versionnée ;
- interface de profil et boutique.

Le stockage actuel est prévu pour une expérience locale. Une version multijoueur devra utiliser un serveur autoritaire pour les comptes, l’économie et le combat.
