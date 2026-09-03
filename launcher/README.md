# Lanceur DarkOrbit

Le lanceur est un exécutable Windows autonome (single-file, self-contained) qui :

1. démarre un petit serveur HTTP local intégré (aucun besoin de Node.js),
2. ouvre le jeu dans le navigateur par défaut de l’utilisateur.

Il fonctionne sans rien installer : placez l’exécutable à la racine du dossier du jeu et double-cliquez dessus. Le dossier du jeu est détecté automatiquement (il suffit qu’il contienne `index.html`).

## Reconstruire l’exécutable

Depuis la racine du projet :

```powershell
dotnet publish launcher/DarkOrbitLauncher.csproj -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true -p:DebugType=None -p:DebugSymbols=false -o launcher/dist
```

Copiez ensuite `launcher/dist/DarkOrbit Launcher.exe` à la racine du dossier du jeu.
