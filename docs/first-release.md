# Première version de Work Assistant

> Historique du premier lot Mac. La priorité est désormais une app web locale : voir le README. Les mises à jour et le packaging Mac sont en attente, sans aucun accès Apple associé.

## Objectif

Installer une application macOS une fois, puis recevoir les évolutions depuis les versions publiques GitHub. Construire le produit et son interface par petits incréments à partir des retours de Florian.

## Périmètre

- Application Electron, interface React et TypeScript, Apple Silicon dans ce premier lot.
- Navigation familière : projets, tickets, documents ; état initial honnête sans connexion aux outils métier.
- Réglages avec version installée, état du téléchargement et bouton de redémarrage explicite.
- Lien de feedback vers la création d’une issue GitHub ; aucun contenu du poste n’est envoyé automatiquement.
- Dépôt public `fbaudry/work-assistant`, exemples neutres uniquement. Aucun document interne, conversation, jeton ou donnée d’entreprise dans le dépôt.
- Chaque push sur `main` déclenche les vérifications et la préparation d’une version alpha. Les branches de travail exécutent les vérifications seulement.
- Une release n’est publiée que si compilation, signature Developer ID et notarisation réussissent. Une version défectueuse ne remplace pas la version installée.
- Téléchargement automatique au démarrage et périodiquement pendant que l’app fonctionne ; installation après clic sur « Redémarrer et mettre à jour ». Pas de redémarrage imposé.

## Choix

Electron permet une itération rapide en TypeScript et l’intégration future de processus locaux. Tauri réduirait la taille de l’application mais ajouterait Rust à ce premier lot ; SwiftUI demanderait davantage de développement spécifique pour la même boucle de feedback. electron-builder v26 stable et electron-updater gèrent les fichiers de mise à jour sur GitHub Releases. Aucun serveur de distribution supplémentaire.

Le DMG sert à la première installation. Les mises à jour utilisent l’archive ZIP et les métadonnées générées par electron-builder. Une nouvelle version croissante est produite par GitHub Actions sans créer un commit de version dans la branche.

## Plan d’exécution

- [x] Créer le socle Electron isolé, le preload limité et la fenêtre macOS.
- [x] Créer les premières vues React et la page des mises à jour ; distinguer les fonctions disponibles des connexions futures.
- [x] Ajouter le contrôle, le téléchargement et le redémarrage ; tester les transitions importantes, l’échec réseau et l’absence de restart prématuré.
- [x] Ajouter la numérotation des versions, les workflows de vérification et de publication, la documentation des secrets Apple.
- [x] Compiler, lancer réellement l’app localement et vérifier son affichage.
- [ ] Relire les fichiers destinés au public, créer le dépôt, pousser et vérifier la CI.
- [ ] Brancher les certificats Apple, publier deux versions signées et vérifier la mise à jour de la première vers la seconde. Ce dernier contrôle dépend de la configuration du compte Apple.

## Limites de ce lot

Les connecteurs Notion, Linear, Slack, GitHub métier et les agents IA seront ajoutés progressivement. Une app locale compilée sans Developer ID permet de tester l’interface ; elle ne constitue pas une validation de la chaîne de mise à jour signée.
