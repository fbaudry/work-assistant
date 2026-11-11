# Work Assistant

Application personnelle pour macOS, construite progressivement autour du travail avec l’IA.

Cette première version permet de créer des projets, conserver leurs notes localement et suivre les mises à jour de l’application. Les connecteurs aux outils de travail et les agents IA seront ajoutés dans les prochaines itérations.

## Développement

Node.js 22.12 ou plus récent sur la branche 22, npm et macOS 13+ sur Apple Silicon.

```sh
npm ci
npm run dev
```

```sh
npm run check         # Tests, vérification TypeScript et compilation
npm run package:local # App locale dans release/mac-arm64/
```

La version locale utilise un stockage propre à Work Assistant. Aucun outil de travail, compte ou modèle IA n’est connecté. Aucun contenu local n’est envoyé automatiquement. Le bouton de feedback ouvre une issue GitHub à compléter et à envoyer par l’utilisateur.

## Mises à jour

Chaque push sur `main` lance la vérification et la compilation. Un push contenant plusieurs commits produit une version pour son dernier commit. Les branches de travail sont vérifiées sans publier de mise à jour.

Après configuration Apple, les builds validés sont signés, notarisés et publiés en versions alpha dans GitHub Releases. Le premier lancement demande une installation depuis le DMG. Les suivants reçoivent les nouvelles versions dans l’application : téléchargement automatique, puis bouton **Redémarrer et mettre à jour**. Il n’est pas nécessaire de réinstaller le DMG à chaque évolution.

Tant que les secrets Apple ne sont pas configurés, la CI fournit uniquement une archive de développement dans ses artefacts. La publication signée reste inactive : voir [configuration des releases](docs/releases.md).

## Contribuer à l’itération

Les retours peuvent être donnés dans la conversation de développement ou via le bouton **Donner un feedback** de l’app. Décrire ce qu’on voulait faire, ce qui gêne et le résultat attendu. La version est préremplie dans le formulaire GitHub.

Le dépôt et les issues sont publics. Les données des projets restent sur le Mac et ne font pas partie du dépôt. Le stockage des notes est local dans cette première version ; aucune synchronisation entre Macs n’est prévue pour le moment.

## Distribution

Electron, React, TypeScript, Vite ; electron-builder v26 et electron-updater. Versions verrouillées dans `package-lock.json`. Apple Silicon uniquement dans le premier lot.

Le code est public. Aucune licence de réutilisation n’est accordée à ce stade.
