# Audit des planches PNG de sprites

**État actuel : le système de planche Streuner a été retiré à la demande de l'utilisateur.
Le moteur utilise les 32 PNG originaux. Les résultats ci-dessous sont historiques.**

Date : 2026-09-08T09:04:46.565Z. Navigateur : Microsoft Edge 152.0.4191.66, automatisé sans fenêtre.

## Portée

Inventaire de toutes les séries PNG à suffixe numérique trouvées dans le projet :
805 séries et 27869 fichiers. Certaines sont des
fonds ou des icônes numérotées, pas des animations ; les résultats ne signifient pas
qu'il faut les regrouper. 180 images isolées ou non
numérotées sont inventoriées séparément dans results.json, sans conversion.
Le contrôle d'intégrité des images isolées est consigné dans standalone-images.json.

Chaque candidat conserve les rectangles et pixels RGBA sources, avec deux pixels
de bord prolongé pour limiter les débordements du lissage. Pages limitées à 4096 × 4096.
Ces candidats ne sont pas installés dans le moteur et le manifeste du jeu n'est pas modifié.

## Fidélité

222912 comparaisons : toutes les images, quatre combinaisons
taille/position, chacune sans puis avec lissage. Tolérance : zéro sur chaque canal RGBA.
Contrôles PNG contre le même PNG : **0 écarts**.
Les contrôles ne détectent pas de différence entre les deux chemins de référence.

| Famille | Séries | Images | Exactes dans les 8 cas | Exactes dans les 4 cas sans lissage | Exactes à taille native, sans lissage | Erreur / exclusion / contrôle non concluant |
|---|---:|---:|---:|---:|---:|---:|
| Backgrounds | 4 | 30 | 0 | 0 | 3 | 1 |
| Munitions | 2 | 12 | 0 | 0 | 2 | 0 |
| Npc | 73 | 2671 | 0 | 24 | 73 | 0 |
| Raygun | 3 | 102 | 0 | 3 | 3 | 0 |
| Ship | 594 | 19080 | 0 | 238 | 594 | 0 |
| Ship_effet | 69 | 4469 | 0 | 10 | 69 | 0 |
| assets | 60 | 1505 | 8 | 32 | 60 | 0 |

| Cas | Comparaisons | Différences |
|---|---:|---:|
| nearest scale=1 offset=0 | 27864 | 0 |
| nearest scale=1 offset=0.25 | 27864 | 0 |
| nearest scale=0.5 offset=0.25 | 27864 | 0 |
| nearest scale=1.05 offset=0.25 | 27864 | 2261 |
| smooth scale=1 offset=0 | 27864 | 0 |
| smooth scale=1 offset=0.25 | 27864 | 13 |
| smooth scale=0.5 offset=0.25 | 27864 | 14 |
| smooth scale=1.05 offset=0.25 | 27864 | 13926 |

Ces différences ne sont pas toutes visibles à l'œil nu, mais elles ne satisfont pas
la contrainte de fidélité exacte. Les résultats s'appliquent aux candidats générés
et au navigateur testé, pas à toutes les dispositions possibles ni à tous les matériels.
Les dimensions d'affichage spécifiques, pivots, rotations, animations, modes de composition
et interfaces du moteur nécessitent encore une intégration et des tests par famille.

### Planche Streuner déjà utilisée

Un second essai porte sur la planche existante sans bord ajouté, et non sur le nouveau
candidat de l'audit. Résultat : 0 écarts
dans les quatre cas sans lissage ; 21 écarts au total dans les huit cas.
Le moteur dessine actuellement le corps du Streuner avec le lissage désactivé.
Ce résultat ne valide donc pas son utilisation future avec du lissage.
Le détail est dans ../current-streuner-audit/results.json.

## Poids et mémoire (séries testées uniquement)

- Sources : 1183666910 octets ; candidats PNG : 1024867333 octets (-13.4 %).
- Ressources : 27864 images sources → 844 pages candidates.
- Surface de pixels : 2091321544 → 2319991742 (10.9 %).
- Cette surface correspond à 7.79 → 8.64 Gio RGBA si tout était décodé simultanément. Ce n'est pas une mesure de la RAM du jeu.
- 99 séries ont un fichier regroupé plus lourd que leurs sources.
- 8 séries ont des tailles variables ; 10 contiennent des métadonnées colorimétriques ; 27 sont réparties sur plusieurs pages.

Aucune mesure de gain global de FPS, de saccades ou de durée de chargement du jeu
n'est déduite de ces chiffres. La compression utilisée pour l'audit est PNG niveau 6.

## Fichiers déclarés absents

Contrôle des configurations NPC, vaisseaux, effets de vaisseaux et collectables :
10 chemins manquants distincts. Ils existaient comme références avant l'audit.

- Ship_effet/ship_hitac_minion_frost_effet/11.png
- Ship_effet/ship_hitac_minion_frost_effet/12.png
- Ship_effet/ship_hitac_minion_frost_effet/13.png
- Ship_effet/ship_hitac_minion_frost_effet/14.png
- Ship_effet/ship_hitac_minion_frost_effet/15.png
- Ship_effet/ship_hitac_minion_frost_effet/16.png
- Ship_effet/ship_hitac_minion_frost_effet/17.png
- Ship_effet/ship_hitac_minion_frost_effet/18.png
- Ship_effet/ship_hitac_minion_frost_effet/19.png
- Ship_effet/ship_hitac_minion_frost_effet/20.png

## Reproduire

Avec Pillow, les dépendances Node du projet et Edge :

```powershell
python scripts/audit-sprite-atlases.py .tmp-atlas-audit
node scripts/audit-sprite-atlases.js .tmp-atlas-audit
node scripts/summarize-sprite-audit.js
```

Ne pas régénérer le manifeste pendant la présence des candidats temporaires.
Le fichier results.json conserve le détail par série, les exemples d'écarts et les exclusions.
