# Lanceur DarkOrbit

Le lanceur démarre le serveur local en arrière-plan puis ouvre le jeu dans le navigateur par défaut de l’utilisateur.

Pour reconstruire l’exécutable depuis la racine du projet :

```powershell
dotnet publish launcher/DarkOrbitLauncher.csproj -c Release -r win-x64 --self-contained false -p:PublishSingleFile=true -o launcher/dist
```

Conservez le dossier `launcher/dist` dans le projet. Le lanceur retrouve automatiquement la racine du jeu.
