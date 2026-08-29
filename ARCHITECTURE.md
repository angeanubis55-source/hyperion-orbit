# Architecture et prochaines étapes

Le navigateur reste la plateforme actuelle et `localStorage` reste une sauvegarde locale. La version de schéma permet maintenant de faire évoluer les données, mais elle ne constitue pas une protection contre la triche.

## Découpage progressif du moteur

Extraire dans cet ordre, en conservant une suite de tests verte après chaque étape :

1. `input.js` : clavier, souris et raccourcis ;
2. `combat.js` : dégâts, munitions, projectiles et récompenses ;
3. `npc.js` : création, IA et vagues ;
4. `collision.js` : murs, cercles et index spatial ;
5. `renderer.js` : monde, sprites et effets ;
6. `hud.js` : DOM et affichage des statistiques.

## Atlas d’images

Ne pas supprimer les PNG sources. Générer des atlas pendant un build, avec un manifeste JSON par vaisseau/NPC. Vérifier visuellement les animations avant de basculer le chargeur, puis servir les fichiers avec compression et cache HTTP.

## Serveur multijoueur

Pour une publication compétitive, le serveur doit être autoritaire sur l’authentification, les crédits, l’inventaire, les dégâts et les récompenses. Le client envoie des intentions, jamais un nouveau solde. Une API HTTP convient au compte/hangar ; WebSocket convient au combat temps réel. Les mots de passe doivent être hachés côté serveur avec Argon2id ou bcrypt.
