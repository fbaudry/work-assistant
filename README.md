# Work Assistant

Espace de travail personnel, construit progressivement autour du travail avec l’IA.

La priorité actuelle est une **app web locale** pour essayer l’interface dans le navigateur et l’améliorer à partir des retours. Elle permet de créer des projets et conserver leurs notes. Les connecteurs aux outils de travail et les agents IA seront ajoutés dans les prochaines itérations.

## Développement

Node.js 22.12 ou plus récent sur la branche 22 et npm.

```sh
npm ci
npm run dev
```

Ouvrir **http://127.0.0.1:5173/**. Le serveur écoute uniquement sur le poste local. L’interface se recharge pendant les modifications du code ; aucune installation d’application n’est nécessaire.

```sh
npm run check         # Tests, vérification TypeScript et compilation
npm run dev:desktop   # Ouvrir le socle Electron (macOS)
npm run package:local # Compiler le socle Mac dans release/mac-arm64/
```

La version web conserve les projets dans le stockage local du navigateur. Garder la même adresse et le même navigateur pour retrouver les notes. Elles ne sont pas synchronisées avec l’app Mac ; effacer les données du site les supprime. Aucun outil de travail, compte ou modèle IA n’est connecté et aucun contenu local n’est envoyé automatiquement.

## Vérification et distribution

Chaque push lance les tests, la vérification TypeScript et la compilation web dans GitHub Actions. Pendant le développement, le serveur local reflète les fichiers de ce checkout, pas les commits distants : un changement fait ailleurs doit d’abord être récupéré dans ce checkout.

Le socle Electron est conservé pour une étape ultérieure. Les jobs Mac s’exécutent uniquement par déclenchement manuel du workflow avec `build_mac`. Aucune signature ni publication Mac n’est activée.

La [documentation des releases Mac](docs/releases.md) décrit la configuration initialement préparée ; elle reste en attente. L’usage visé est personnel, avec une installation directe hors des stores.

## Contribuer à l’itération

Les retours sur la version web se donnent dans la conversation de développement : décrire la page, ce qu’on voulait faire, ce qui gêne et le résultat attendu. Les modifications suivantes peuvent être examinées dans le même onglet.

Le dépôt et les issues sont publics. Les données des projets restent dans le navigateur et ne font pas partie du dépôt. Le projet est personnel et indépendant de toute organisation.

## Distribution

React, TypeScript et Vite pour le web ; Electron, electron-builder v26 et electron-updater pour le socle Mac en attente. Versions verrouillées dans `package-lock.json`. Le packaging Mac existant cible Apple Silicon.

Le code est public. Aucune licence de réutilisation n’est accordée à ce stade.
