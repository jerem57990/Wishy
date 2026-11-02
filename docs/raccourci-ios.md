# Raccourci iOS « Ajouter à Wishy »

Ajoute un article à ta wishlist depuis le bouton **Partager** de Safari ou d'une app de shopping (Zalando, Amazon…), sans ouvrir Wishy. Compte 2 minutes, une seule fois.

## 1. Copie ta clé

Dans Wishy sur l'iPhone : **Réglages → Raccourci « Ajouter à Wishy » → Copier**.

## 2. Crée le raccourci

1. Ouvre l'app **Raccourcis**, onglet **Raccourcis**, puis touche **+**.
2. Renomme-le **Ajouter à Wishy** (touche le nom en haut).
3. Touche l'icône **ⓘ** en bas, active **Afficher dans la feuille de partage**, puis **OK**.
   En haut, le bloc « Recevoir … de la feuille de partage » apparaît : touche le premier mot bleu et ne garde que **URL** et **Pages web Safari** (et **Texte** pour les apps qui partagent un message contenant le lien).
4. Ajoute l'action **Obtenir le contenu de l'URL** :
   - URL : `https://yoavmfamksljxswubxzm.supabase.co/functions/v1/quick-add`
   - Touche **Afficher plus** :
     - Méthode : **POST**
     - Corps de requête : **JSON**
     - Ajoute un champ **Texte** nommé `token` → colle ta clé
     - Ajoute un champ **Texte** nommé `url` → choisis la variable **Entrée du raccourci**
5. Ajoute l'action **Afficher la notification** et mets-y la variable **Contenu de l'URL**.

## 3. Utilisation

Sur la page d'un article : **Partager → Ajouter à Wishy**. Une notification confirme l'ajout (« ✨ Ajouté : … — 49,90 € »). L'article apparaît dans Wishy sur l'iPhone et sur le PC.

Si le site bloque la lecture automatique (Zalando, parfois Amazon), l'article est ajouté avec son lien et Wishy sur ton PC complète la fiche dès qu'il se synchronise.
