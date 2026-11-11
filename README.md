# Work Assistant

Espace de travail personnel, construit progressivement autour du travail avec l’IA.

La priorité actuelle est une **app web locale** pour essayer l’interface dans le navigateur et l’améliorer à partir des retours. Elle permet de créer des projets, conserver leurs notes, consulter un contexte collecté depuis plusieurs sources et obtenir des points d’un agent IA propre à chaque projet. La collecte autonome des sources reste à construire.

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

La version web conserve les projets dans le stockage local du navigateur. Garder la même adresse et le même navigateur pour retrouver les notes. Elles ne sont pas synchronisées avec l’app Mac. Lorsqu’un projet est ouvert avec son agent actif, son contexte ou ses notes sont transmis à OpenAI via le compte connecté pour produire un point. Une copie des notes analysées et les comptes rendus sont conservés dans le dossier privé de l’app ; effacer les données du navigateur ne supprime pas cet historique local.

## Connexion OpenAI

L’accueil web propose **Connecter mon compte OpenAI**. Le bouton ouvre la connexion officielle ChatGPT via Codex dans une autre fenêtre. Choisir son compte et son espace personnels, terminer la connexion chez OpenAI, puis revenir à Work Assistant. Les projets et leurs agents utilisent cette session après confirmation par Codex, sans clé API supplémentaire.

Le serveur local utilise le [protocole officiel Codex app-server](https://learn.chatgpt.com/docs/app-server) pour l’authentification. Codex gère les jetons dans un dossier privé `.work-assistant/codex/`, exclu de Git et du packaging. Cette session est distincte de celle du CLI ou de l’application Codex : aucun compte déjà connecté n’est importé. Le navigateur ne reçoit aucun jeton et aucun mot de passe n’est saisi dans Work Assistant. Le dossier contient des identifiants et doit rester privé.

Le CLI `codex` doit être disponible dans le `PATH` du serveur. Si nécessaire, `WORK_ASSISTANT_CODEX_BIN` permet d’indiquer le chemin de son exécutable. La connexion nécessite Internet ; le serveur Work Assistant reste sur `127.0.0.1:5173`. Ce parcours est réservé à la version locale : un hébergement web public nécessitera une autre intégration d’authentification. Le build statique et le socle Electron ne fournissent pas ce serveur de connexion.

## Contexte d’un projet

Après connexion, l’app affiche les contextes présents dans le fichier privé `.work-assistant/context.json`. Ce fichier reste sur le poste et ne fait pas partie du dépôt : un clone neuf commence sans contexte importé. Son format est décrit par `ProjectContext` dans `src/SourceContext.tsx` et contrôlé côté serveur dans `server/project-context.mjs`.

La **Vue d’ensemble**, ouverte par défaut, met d’abord en évidence la phase en cours : **Kick-off → Cadrage tech → Développement**. Chaque étape conserve son explication et les sources qui l’étayent. Le cadrage initial peut être réalisé tout en laissant des précisions ouvertes. La partie développement se déplie en US et chantiers, puis en sous-tickets avec leur statut Linear et leur responsable. Le statut d’un parent reste distinct de celui de ses sous-tickets ; aucun pourcentage global ni état de déploiement n’est déduit des tickets terminés.

Le champ optionnel `progress` du contexte fournit ces trois étapes et les liens entre tickets. Ses références désignent des sources déjà collectées, sans contenu de projet dans le code. Les anciens contextes restent lisibles sans ce champ. La page conserve ensuite un point de situation court, les premiers sujets à éclaircir et jusqu’à trois documents repères. Cette sélection de lecture ne constitue pas une priorité métier ni une demande d’approbation.

La vue **Décisions** propose des lignes dépliables avec les nuances et les preuves. **Sources** reste une bibliothèque recherchable : les résumés se déplient et les détails de connexion, couverture et limites restent dans une section secondaire. Les dates d’édition sont conservées ; une contradiction entre documents reste une question, pas une décision déduite de la seule date. Le champ optionnel `referenceSourceIds` désigne au maximum trois sources existantes à mettre en avant ; aucun document ni lien de projet n’est codé en dur dans l’interface.

Cette organisation reprend le principe de la [vue projet de Linear](https://linear.app/docs/projects), avec un résumé et des ressources utiles, et la distinction entre accueil et catalogue des [wikis Notion](https://www.notion.com/help/wikis-and-verified-pages). Elle conserve les preuves à proximité des affirmations, sans inventer d’indicateur d’avancement à partir du volume collecté.

L’import initial est effectué explicitement depuis la conversation et porte la mention **Collecte ponctuelle**. Il ne s’actualise pas automatiquement. Les connexions disponibles dans la conversation ne sont pas copiées dans l’app : celle-ci consulte son propre catalogue OpenAI et ses outils disponibles. Si une source n’y apparaît pas ou si la vérification échoue, l’interface le signale. Un lien de connexion n’est proposé que si OpenAI le fournit.

L’API locale refuse les requêtes provenant d’un autre site. Les lectures du contexte et des accès nécessitent un compte connecté ; les fichiers privés sont interdits via le serveur de fichiers Vite. Aucune écriture n’est effectuée dans les sources externes.

## Agent de projet

Une carte **Agent du projet** reste visible avant les onglets. L’agent fait un premier point à l’ouverture, puis en produit un nouveau lorsque le contexte local change. **Faire un point** permet de relancer explicitement une analyse ; **Mettre en pause** interrompt l’analyse en cours et conserve le dernier résultat. Le statut affiché correspond à l’exécution réelle et un échec ne remplace pas le précédent compte rendu.

Les projets déjà ouverts sont vérifiés toutes les 30 secondes tant que Work Assistant envoie son signal de présence, y compris depuis la liste des projets ou les réglages. Après 90 secondes sans ce signal, aucune nouvelle analyse automatique n’est démarrée. Le Mac en veille ne fait pas tourner le serveur local. Une analyse déjà envoyée à OpenAI peut finir après fermeture de l’onglet. Aucun service distant de planification n’est créé.

Chaque point contient une synthèse, au plus trois observations avec leurs sources et une prochaine action proposée. Les cinq derniers points et l’état de pause sont conservés dans `.work-assistant/agents.json`. Le modèle par défaut du compte est utilisé avec un effort faible. Le [protocole Codex app-server](https://learn.chatgpt.com/docs/app-server) exécute un thread éphémère sans environnement ni outils ; les demandes d’action sont refusées. Seul le résultat structuré d’un tour terminé est accepté, avec des références vérifiées contre le contexte fourni.

L’agent analyse le **contexte déjà collecté** ou les notes locales. Il ne surveille pas encore directement Notion, Linear, Slack, GitHub ou les déploiements et ne leur apporte aucune modification. Ses analyses sont des propositions à relire. Le socle Mac ne dispose pas encore de ce serveur d’agents.

## Vérification et distribution

Chaque push lance les tests, la vérification TypeScript et la compilation web dans GitHub Actions. Pendant le développement, le serveur local reflète les fichiers de ce checkout, pas les commits distants : un changement fait ailleurs doit d’abord être récupéré dans ce checkout.

Le socle Electron est conservé pour une étape ultérieure. Les jobs Mac s’exécutent uniquement par déclenchement manuel du workflow avec `build_mac`. Aucune signature ni publication Mac n’est activée.

La [documentation des releases Mac](docs/releases.md) décrit la configuration initialement préparée ; elle reste en attente. L’usage visé est personnel, avec une installation directe hors des stores.

## Contribuer à l’itération

Les retours sur la version web se donnent dans la conversation de développement : décrire la page, ce qu’on voulait faire, ce qui gêne et le résultat attendu. Les modifications suivantes peuvent être examinées dans le même onglet.

Le dépôt et les issues sont publics. Les notes restent dans le navigateur ; le contexte collecté reste dans le dossier privé de l’app sur ce Mac. Ces données ne font pas partie du dépôt. Le projet est personnel et indépendant de toute organisation.

## Distribution

React, TypeScript et Vite pour le web ; Electron, electron-builder v26 et electron-updater pour le socle Mac en attente. Versions verrouillées dans `package-lock.json`. Le packaging Mac existant cible Apple Silicon.

Le code est public. Aucune licence de réutilisation n’est accordée à ce stade.
