# Work Assistant

Espace de travail personnel, construit progressivement autour du travail avec l’IA.

La priorité actuelle est une **app web locale** pour essayer l’interface dans le navigateur et l’améliorer à partir des retours. Elle permet de créer des projets, conserver leurs notes et consulter un contexte collecté depuis plusieurs sources. Les accès autonomes aux outils et les agents IA sont construits progressivement.

## Développement

Node.js 22.12 ou plus récent sur la branche 22, npm et [Codex CLI](https://developers.openai.com/codex/cli/) (parcours vérifié avec la version 0.153.2).

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

La version web conserve les projets dans le stockage local du navigateur. Garder la même adresse et le même navigateur pour retrouver les notes. Elles ne sont pas synchronisées avec l’app Mac ; effacer les données du site les supprime. Aucun contenu local n’est envoyé automatiquement à une IA.

## Connexion OpenAI

L’accueil web propose **Connecter mon compte OpenAI**. Le bouton ouvre la connexion officielle ChatGPT via Codex dans une autre fenêtre. Choisir son compte et son espace personnels, terminer la connexion chez OpenAI, puis revenir à Work Assistant. Les projets s’affichent après confirmation par Codex. La session prépare le travail avec l’IA ; les agents ne sont pas encore implémentés et aucun appel à un modèle n’est effectué.

Le serveur local utilise le [protocole officiel Codex app-server](https://learn.chatgpt.com/docs/app-server) pour l’authentification. Codex gère les jetons dans un dossier privé `.work-assistant/codex/`, exclu de Git et du packaging. Cette session est distincte de celle du CLI ou de l’application Codex : aucun compte déjà connecté n’est importé. Le navigateur ne reçoit aucun jeton et aucun mot de passe n’est saisi dans Work Assistant. Le dossier contient des identifiants et doit rester privé.

Le CLI `codex` doit être disponible dans le `PATH` du serveur. Si nécessaire, `WORK_ASSISTANT_CODEX_BIN` permet d’indiquer le chemin de son exécutable. La connexion nécessite Internet ; le serveur Work Assistant reste sur `127.0.0.1:5173`. Ce parcours est réservé à la version locale : un hébergement web public nécessitera une autre intégration d’authentification. Le build statique et le socle Electron ne fournissent pas ce serveur de connexion.

## Contexte d’un projet

Après connexion, l’app affiche les contextes présents dans le fichier privé `.work-assistant/context.json`. Ce fichier reste sur le poste et ne fait pas partie du dépôt : un clone neuf commence sans contexte importé. Son format est décrit par `ProjectContext` dans `src/SourceContext.tsx` et contrôlé côté serveur dans `server/project-context.mjs`.

La vue **Sources** présente la couverture de Notion, Linear et Slack, un catalogue recherchable et les accès vérifiés dans la session OpenAI de Work Assistant. La vue **Synthèse** regroupe les décisions et les questions ouvertes, avec des liens vers leurs preuves. Les dates d’édition sont conservées ; une contradiction entre documents reste une question, pas une décision déduite de la seule date.

L’import initial est effectué explicitement depuis la conversation et porte la mention **Collecte ponctuelle**. Il ne s’actualise pas automatiquement. Les connexions disponibles dans la conversation ne sont pas copiées dans l’app : celle-ci consulte son propre catalogue OpenAI et ses outils disponibles. Si une source n’y apparaît pas ou si la vérification échoue, l’interface le signale. Un lien de connexion n’est proposé que si OpenAI le fournit.

L’API locale refuse les requêtes provenant d’un autre site. Les lectures du contexte et des accès nécessitent un compte connecté ; les fichiers privés sont interdits via le serveur de fichiers Vite. Aucune écriture n’est effectuée dans les sources externes. La synchronisation continue et le travail des agents restent à implémenter.

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
