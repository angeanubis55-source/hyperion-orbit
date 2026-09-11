# Audit du hangar et contrôles du jeu — 11 septembre 2026

Audit centré sur l'application des équipements, les brouillons, les configurations 1/2, les drones, le P.E.T, la persistance et les statistiques en jeu. Les modifications locales préexistantes du profil ont été conservées.

## Problèmes corrigés

| Priorité | Problème constaté | Correction |
| --- | --- | --- |
| Haute | Appliquer enregistrait le vaisseau et les drones, puis échouait sur le P.E.T absent. | Une opération `saveHangarLoadout` valide toute la configuration avant une seule sauvegarde et notification. Le profil ne transmet un P.E.T que s'il est possédé. |
| Haute | Une erreur tardive laissait une partie de l'équipement déjà enregistrée. | Aucun changement d'équipement n'est publié si une validation échoue. Vérification des quantités sur le compte relu au moment de l'application. |
| Haute | Déplacer un objet entre deux slots du même drone conservait la source ; déplacer vers un autre drone occupé écrasait l'objet cible. | Déplacement avec échange, sans duplication ni perte de l'objet déplacé. |
| Haute | Une vente pouvait supprimer le dernier exemplaire d'un objet encore équipé dans une autre configuration. | La vente réserve le nombre maximal d'exemplaires nécessaires dans chaque couple hangar/configuration, vaisseau + drones + P.E.T. |
| Moyenne | Des objets réservés au P.E.T pouvaient être placés sur le vaisseau ou les drones et ne donner aucune statistique. | Refus dans les chemins de placement concernés et dans la validation finale. |
| Moyenne | Les pourcentages de vitesse ne s'appliquaient qu'aux générateurs. Un module de vitesse sans générateur n'avait aucun effet. | Le bonus inclut maintenant la vitesse de base du vaisseau. |
| Moyenne | Maj-clic après la sélection d'un seul objet pouvait annuler au lieu de sélectionner tous les exemplaires identiques. | Comparaison avec le nombre total d'exemplaires équipés sur les drones ou le P.E.T. |
| Faible | Deux gestionnaires exécutaient le changement de configuration du hangar. | Un seul gestionnaire conservé. |
| Faible | Le fond de repli référençait un fichier `STARS_TILE.webp` absent. | Utilisation du fond d'étoiles existant. |
| Faible | L'audit structurel signalait à tort les images de firmes de la page de connexion. | Résolution des chemins `../` depuis le fichier qui les référence. |

La progression du jeu est synchronisée avant l'application pour éviter de relire un état antérieur pendant l'enregistrement du hangar.

## Validation

- 122 tests unitaires réussis, dont 7 nouveaux tests de régression : absence de P.E.T, transferts d'équipement, absence de sauvegarde partielle, configuration inactive, vente d'un objet réservé, bonus de vitesse, déplacement et échange des slots de drones.
- 224 fichiers JavaScript vérifiés syntaxiquement (sources et scripts ; dépendances et outils temporaires exclus).
- Audit structurel : 640 imports et 812 références de ressources ; aucune référence cassée ni erreur de casse après correction. Les avertissements de conventions de nommage ne constituent pas des ressources absentes.
- Test navigateur du profil : équipement d'un laser, aller-retour configuration 1/2, application sans P.E.T, réouverture, annulation d'un retrait et navigation boutique.
- Test navigateur des transitions 1-1 → 1-8 → 1-1 réussi.
- Contrôle de démarrage de l'ensemble des cartes : en cours au moment de la rédaction.

## Limites et suites possibles

- Les tests de démarrage ne remplacent pas une partie complète sur chaque carte ou chaque combinaison d'équipements. L'audit ne certifie pas tout l'équilibrage ni toutes les statistiques de chaque arme.
- « Appliquer » enregistre la configuration affichée. Les brouillons de l'autre configuration ne sont pas appliqués automatiquement ; la configuration active du jeu reste indépendante.
- Les anciennes API de sauvegarde séparée restent disponibles pour compatibilité. Le bouton du hangar utilise exclusivement la nouvelle validation complète.
- Le moteur et le profil restent de gros fichiers : les extractions futures devraient préserver les tests de persistance et les scénarios du hangar.
- Les tests utilisent des comptes temporaires dans un navigateur isolé ; ils ne modifient pas la sauvegarde du pilote dans son navigateur habituel.
