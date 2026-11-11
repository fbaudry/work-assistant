# Activer les mises à jour macOS

> Configuration initiale conservée, inactive. Le développement se concentre actuellement sur l’app web locale. Les jobs Mac ne sont exécutés que manuellement avec l’option `build_mac`. Cette configuration utilise encore la piste Developer ID ; l’alternative avec certificat personnel auto-signé a été étudiée mais n’a pas été implémentée ni validée de bout en bout.

## Configuration initiale

Utiliser exclusivement une identité personnelle pour cette application. Aucun compte, accès ou certificat d’une entreprise ne doit être associé au projet. Dans cette configuration initiale, le certificat requis est **Developer ID Application**. Un certificat « Apple Development » ou « Mac App Distribution » ne convient pas pour cette distribution hors App Store.

1. Créer le certificat dans [Apple Developer → Certificates](https://developer.apple.com/account/resources/certificates/list). Le portail décrit la création de la demande de certificat dans Trousseaux d’accès.
2. Installer le certificat sur le Mac qui a créé la demande. Dans Trousseaux d’accès, exporter le certificat avec sa clé privée au format `.p12`, protégé par mot de passe.
3. Créer un mot de passe d’application depuis [le compte Apple](https://account.apple.com/) pour la notarisation. Il ne s’agit pas du mot de passe du compte Apple.
4. Ajouter les secrets dans [GitHub Actions secrets](https://github.com/fbaudry/work-assistant/settings/secrets/actions).

| Secret | Valeur |
| --- | --- |
| `CSC_LINK` | Contenu du fichier `.p12` encodé en base64 |
| `CSC_KEY_PASSWORD` | Mot de passe de l’export `.p12` |
| `APPLE_ID` | Adresse du compte Apple Developer |
| `APPLE_APP_SPECIFIC_PASSWORD` | Mot de passe d’application Apple |
| `APPLE_TEAM_ID` | Identifiant de l’équipe Apple portant le certificat |

Pour encoder le certificat et le transmettre directement à GitHub sans afficher son contenu :

```sh
base64 -i /chemin/DeveloperID.p12 | gh secret set CSC_LINK --repo fbaudry/work-assistant
gh secret set CSC_KEY_PASSWORD --repo fbaudry/work-assistant
gh secret set APPLE_ID --repo fbaudry/work-assistant
gh secret set APPLE_APP_SPECIFIC_PASSWORD --repo fbaudry/work-assistant
gh secret set APPLE_TEAM_ID --repo fbaudry/work-assistant
```

Les commandes sans valeur ouvrent une saisie interactive. Ne jamais ajouter les clés ou mots de passe au dépôt, ni à une issue ou à une conversation.

5. Dans [Actions variables](https://github.com/fbaudry/work-assistant/settings/variables/actions), créer `MAC_RELEASES_ENABLED` avec la valeur `true`.
6. Lancer **Build and release → Run workflow** sur `main`, avec `build_mac` activé.

Le workflow vérifie les cinq secrets avant de construire. Il impose la signature, effectue la notarisation puis vérifie le bundle avec `codesign`, `spctl` et `stapler`. Il publie la release seulement après l’upload de tous les fichiers.

## Première installation et validation

1. Installer le DMG de la première alpha depuis [Releases](https://github.com/fbaudry/work-assistant/releases), puis déplacer Work Assistant dans Applications.
2. Créer un projet et une note.
3. Pousser une petite évolution sur `main`, lancer le workflow manuel avec `build_mac` puis attendre sa publication.
4. Dans l’app, ouvrir Réglages, rechercher la mise à jour et attendre son téléchargement.
5. Cliquer sur **Redémarrer et mettre à jour**.
6. Vérifier la nouvelle version et la présence du projet et de la note.

Ce test de deux versions signées est nécessaire pour valider la chaîne réelle. Les tests unitaires et l’app locale ne remplacent pas ce contrôle.

## Fonctionnement

- Version : `0.1.0-alpha.<numéro du run>.<tentative>` ; pas de commit de version automatique.
- Si plusieurs pushes se suivent pendant une compilation, une compilation déjà dépassée ne publie pas de version ; la publication vise le dernier état de `main`.
- Canal de test : `alpha`, prereleases acceptées, downgrade désactivé.
- DMG : première installation. ZIP, métadonnées `alpha-mac.yml` et blockmaps : mises à jour.
- Identifiant stable : `io.github.fbaudry.work-assistant`.
- Vérification au lancement, toutes les 30 minutes pendant l’exécution et au réveil du Mac.
- Le téléchargement ne force pas le redémarrage. La fermeture de l’app ne déclenche pas d’installation silencieuse.
- Si le réseau, la signature, la notarisation ou la compilation échoue, la version actuelle reste utilisable.
- Les données sont séparées du bundle de l’application. Les migrations de données devront préserver leur compatibilité à mesure que le produit évolue.
- Aucun token GitHub n’est embarqué dans l’app ; les releases sont publiques.
- Une modification qui rétablit un ancien comportement est publiée sous un nouveau numéro, plutôt que d’installer une version plus ancienne.

## Références

- [electron-builder v26 : auto-update](https://www.electron.build/v26/docs/features/auto-update/)
- [electron-builder v26 : notarisation](https://www.electron.build/v26/docs/features/code-signing/notarization/)
- [electron-builder v26 : publication](https://www.electron.build/v26/docs/publish/)
