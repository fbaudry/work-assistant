# Work Assistant

Projet personnel indépendant. Utiliser uniquement le dépôt et les comptes personnels explicitement autorisés pour développer et distribuer l’application. Ne pas utiliser de compte, certificat ou secret d’une entreprise pour cette infrastructure.

Florian peut demander explicitement de réunir le contexte de ses projets professionnels. Ces lectures sont alors limitées au projet demandé. Les données collectées restent dans `.work-assistant/`, exclu de Git, du serveur de fichiers Vite et du packaging. Ne jamais ajouter de contenu interne, d’identifiant de projet ou de lien privé au code, aux fixtures, aux commits ou aux issues publics.

Priorité actuelle : développer la version web locale et améliorer son interface à partir des retours de l’utilisateur. `npm run dev` lance cette version sur `http://127.0.0.1:5173`. Garder cette origine stable pour conserver les notes du navigateur.

Réutiliser l’interface React existante. Garder les changements petits et concrets ; ne pas ajouter d’abstraction ni de fonctionnalité sans usage identifié. Distinguer les données importées depuis la conversation, les accès réellement disponibles dans l’app et une synchronisation autonome. La présence d’un snapshot ne prouve pas une connexion active. L’agent de projet produit de vrais points IA à partir du contexte local et des notes, via la session OpenAI dédiée, sans outils ni actions externes. La collecte continue des sources reste à implémenter. Ses états et son historique privés restent dans `.work-assistant/` ; ne jamais fabriquer d’activité ou de compte rendu dans l’interface.

Le socle Electron est conservé pour une étape ultérieure. Ne pas engager de travail de certificat, de notarisation ou de publication Mac tant que le travail porte sur l’interface web.

Vérifier la compilation et le parcours concerné dans le navigateur. Les projets de test doivent être clairement identifiés et ne contenir aucune donnée réelle.
