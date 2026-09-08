import { readFile, writeFile } from 'node:fs/promises';
const file = 'reports/sprite-atlas-audit/results.json';
const report = JSON.parse(await readFile(file, 'utf8'));
if (!report.summary) throw Error('Audit is not complete');
const tested = report.groups.filter(g => g.comparisons);
const family = g => g.directory.startsWith('assets/') ? 'assets' : g.directory.split('/')[0];
const totals = new Map();
for (const g of report.groups) {
  const key = family(g);
  if (!totals.has(key)) totals.set(key, { groups: 0, frames: 0, exact: 0, nearestExact: 0, nativeExact: 0, issues: 0 });
  const row = totals.get(key); row.groups++; row.frames += g.count;
  if (g.comparisons && !g.failedComparisons && !g.baselineIssues && g.rawRgbaEqual) row.exact++;
  if (g.cases && !g.baselineIssues && g.rawRgbaEqual && Object.entries(g.cases).filter(([k]) => k.startsWith('nearest')).every(([,v]) => !v.failures)) row.nearestExact++;
  if (g.cases?.['nearest scale=1 offset=0']?.failures === 0 && !g.baselineIssues && g.rawRgbaEqual) row.nativeExact++;
  if (g.baselineIssues || g.error || g.skipped) row.issues++;
}
const cases = new Map();
for (const g of tested) for (const [key, counts] of Object.entries(g.cases)) {
  if (!cases.has(key)) cases.set(key, { comparisons: 0, failures: 0 });
  cases.get(key).comparisons += counts.comparisons; cases.get(key).failures += counts.failures;
}
const source = tested.reduce((sum,g) => sum+g.sourceBytes,0), atlas = tested.reduce((sum,g) => sum+g.atlasBytes,0);
const pixels = tested.reduce((sum,g) => sum+g.sourcePixels,0), atlasPixels = tested.reduce((sum,g) => sum+g.atlasPixels,0);
const baseline = tested.reduce((sum,g) => sum+g.baselineIssues,0);
const missing = [...new Set(report.missingConfiguredFrames.map(x => x.src))];
const current = JSON.parse(await readFile('reports/current-streuner-audit/results.json', 'utf8')).groups[0];
const text = `# Audit des planches PNG de sprites

État actuel : la planche Streuner a été retirée. Le moteur utilise les 32 PNG originaux.
Les résultats de cet audit sont historiques.

Date : ${report.date}. Navigateur : Microsoft Edge ${report.browser}, automatisé sans fenêtre.

## Portée

Inventaire de toutes les séries PNG à suffixe numérique trouvées dans le projet :
${report.summary.sequences} séries et ${report.summary.frames} fichiers. Certaines sont des
fonds ou des icônes numérotées, pas des animations ; les résultats ne signifient pas
qu'il faut les regrouper. ${report.inventory.standaloneImages.length} images isolées ou non
numérotées sont inventoriées séparément dans results.json, sans conversion.
Le contrôle d'intégrité des images isolées est consigné dans standalone-images.json.

Chaque candidat conserve les rectangles et pixels RGBA sources, avec deux pixels
de bord prolongé pour limiter les débordements du lissage. Pages limitées à 4096 × 4096.
Ces candidats ne sont pas installés dans le moteur et le manifeste du jeu n'est pas modifié.

## Fidélité

${report.summary.comparisons} comparaisons : toutes les images, quatre combinaisons
taille/position, chacune sans puis avec lissage. Tolérance : zéro sur chaque canal RGBA.
Contrôles PNG contre le même PNG : **${baseline} écarts**.
${baseline ? 'Les cas dont le contrôle échoue sont non concluants et ne valident pas une conversion.' : 'Les contrôles ne détectent pas de différence entre les deux chemins de référence.'}

| Famille | Séries | Images | Exactes dans les 8 cas | Exactes dans les 4 cas sans lissage | Exactes à taille native, sans lissage | Erreur / exclusion / contrôle non concluant |
|---|---:|---:|---:|---:|---:|---:|
${[...totals].map(([name,r]) => `| ${name} | ${r.groups} | ${r.frames} | ${r.exact} | ${r.nearestExact} | ${r.nativeExact} | ${r.issues} |`).join('\n')}

| Cas | Comparaisons | Différences |
|---|---:|---:|
${[...cases].map(([name,r]) => `| ${name} | ${r.comparisons} | ${r.failures} |`).join('\n')}

Ces différences ne sont pas toutes visibles à l'œil nu, mais elles ne satisfont pas
la contrainte de fidélité exacte. Les résultats s'appliquent aux candidats générés
et au navigateur testé, pas à toutes les dispositions possibles ni à tous les matériels.
Les dimensions d'affichage spécifiques, pivots, rotations, animations, modes de composition
et interfaces du moteur nécessitent encore une intégration et des tests par famille.

### Planche Streuner déjà utilisée

Un second essai porte sur la planche existante sans bord ajouté, et non sur le nouveau
candidat de l'audit. Résultat : ${Object.entries(current.cases).filter(([k]) => k.startsWith('nearest')).reduce((s,[,v]) => s+v.failures,0)} écarts
dans les quatre cas sans lissage ; ${current.failedComparisons} écarts au total dans les huit cas.
Le moteur dessine actuellement le corps du Streuner avec le lissage désactivé.
Ce résultat ne valide donc pas son utilisation future avec du lissage.
Le détail est dans ../current-streuner-audit/results.json.

## Poids et mémoire (séries testées uniquement)

- Sources : ${source} octets ; candidats PNG : ${atlas} octets (${((atlas/source-1)*100).toFixed(1)} %).
- Ressources : ${tested.reduce((s,g) => s+g.count,0)} images sources → ${tested.reduce((s,g) => s+g.atlasPages,0)} pages candidates.
- Surface de pixels : ${pixels} → ${atlasPixels} (${((atlasPixels/pixels-1)*100).toFixed(1)} %).
- Cette surface correspond à ${(pixels*4/1024**3).toFixed(2)} → ${(atlasPixels*4/1024**3).toFixed(2)} Gio RGBA si tout était décodé simultanément. Ce n'est pas une mesure de la RAM du jeu.
- ${tested.filter(g => g.atlasBytes > g.sourceBytes).length} séries ont un fichier regroupé plus lourd que leurs sources.
- ${report.groups.filter(g => g.variableDimensions).length} séries ont des tailles variables ; ${report.groups.filter(g => g.colorMetadata).length} contiennent des métadonnées colorimétriques ; ${tested.filter(g => g.atlasPages > 1).length} sont réparties sur plusieurs pages.

Aucune mesure de gain global de FPS, de saccades ou de durée de chargement du jeu
n'est déduite de ces chiffres. La compression utilisée pour l'audit est PNG niveau 6.

## Fichiers déclarés absents

Contrôle des configurations NPC, vaisseaux, effets de vaisseaux et collectables :
${missing.length} chemins manquants distincts. Ils existaient comme références avant l'audit.

${missing.map(path => '- '+path).join('\n') || 'Aucun.'}

## Reproduire

Avec Pillow, les dépendances Node du projet et Edge :

\`\`\`powershell
python scripts/audit-sprite-atlases.py .tmp-atlas-audit
node scripts/audit-sprite-atlases.js .tmp-atlas-audit
node scripts/summarize-sprite-audit.js
\`\`\`

Ne pas régénérer le manifeste pendant la présence des candidats temporaires.
Le fichier results.json conserve le détail par série, les exemples d'écarts et les exclusions.
`;
await writeFile('reports/sprite-atlas-audit/README.md', text);
console.log(JSON.stringify({ baselineIssues: baseline, families: Object.fromEntries(totals), sourceBytes: source, atlasBytes: atlas, missing }, null, 2));
