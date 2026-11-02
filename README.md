# Wishy — ta wishlist sur le bureau

Widget Windows pour suivre ta wishlist (vêtements, jeux vidéo, tech…), être prévenu des promos, comparer les sites et suivre tes dépenses.

## Installer

Télécharge **Wishy-Setup-x.y.z.exe** dans la page [Releases](https://github.com/jerem57990/Wishy/releases/latest) du dépôt.

- **Wishy-Setup-1.0.0.exe** : installateur classique (raccourci bureau + menu Démarrer).
- **Wishy-portable-1.0.0.exe** : aucune installation, double-clic et c'est parti.

L'application n'est pas signée : au premier lancement, Windows SmartScreen peut afficher « Windows a protégé votre ordinateur ». Clique sur **Informations complémentaires → Exécuter quand même**.

## Ajouter un article

1. Sur n'importe quel site, copie le lien de l'article (Ctrl+C dans la barre d'adresse).
2. Appuie sur **Ctrl + Alt + W**, depuis n'importe où : l'article est ajouté avec son titre, sa photo, son prix et sa catégorie.

Tu peux aussi coller le lien dans la barre en haut du widget (l'ajout se lance tout seul quand tu colles).

Catégories : Vêtements, Jeux vidéo, Tech, Maison, Livres, Sport, **Parfums** (détectés sur Sephora, Nocibé, Marionnaud, Notino, Douglas, Scento… ou d'après le nom : eau de parfum, eau de toilette, extrait…) et Autre.

**Renommer un article :** ouvre sa fiche et clique sur son nom (le crayon apparaît au survol). Entrée valide, Échap annule. Le nouveau nom est aussi repris dans tes dépenses, et il n'est jamais écrasé par les vérifications de prix.

**Ctrl + Alt + Espace** affiche ou masque Wishy. La croix range Wishy dans la barre des tâches (près de l'horloge) ; il continue de surveiller les prix.

## Promos et autres sites

- Les prix sont vérifiés en arrière-plan (toutes les 6 h par défaut, modifiable dans les réglages). Une **notification Windows** s'affiche dès qu'un prix baisse ou que ton **prix cible** est atteint.
- Dans la fiche d'un article : des boutons de recherche sur des sites fiables adaptés à la catégorie (Idealo, Google Shopping, Amazon, Zalando, ASOS, Instant Gaming, Micromania, LDLC, Fnac…).
- Colle le lien du même article sur un autre site dans **« Le même ailleurs »** : Wishy suit aussi ce prix et t'indique le site le moins cher.

Certains sites bloquent la lecture automatique des prix (c'est parfois le cas d'Amazon ou de Zalando). Dans ce cas, Wishy te demande de saisir le prix une fois, puis réessaie à chaque vérification.

## Dépenses

Quand tu achètes un article, ouvre sa fiche puis touche **« Marquer comme acheté »** (prix payé, date, boutique). L'onglet **Dépenses** affiche alors :
- la jauge de ton budget mensuel (à régler dans les réglages) ;
- l'histogramme 3D des 12 derniers mois (fais-le tourner, clique sur un mois) ;
- la répartition par catégorie, et la liste des achats du mois.

## Cabine d'essayage (IA)

1. Ajoute une photo de toi : en pied, de face, bras le long du corps, fond simple, bonne lumière.
2. Choisis un haut et/ou un bas parmi les vêtements de ta wishlist.
3. Touche **Essayer la tenue** : l'IA (modèle gratuit Leffa sur Hugging Face) enfile le haut, puis le bas, sur ta photo. Compte 30 s à 1 min par vêtement.

Chaque tenue est enregistrée dans **Mes tenues**. Le bouton **Avant / après** (à maintenir) montre ta photo d'origine.

Bon à savoir :
- **Jeton gratuit conseillé.** Sans compte, le nombre d'essayages par jour est très limité. Crée un compte gratuit sur huggingface.co, puis un jeton « Read » (huggingface.co/settings/tokens), et colle-le dans Réglages.
- **Meilleure photo du vêtement.** L'IA marche mieux avec le vêtement seul sur fond blanc qu'avec une photo où un mannequin le porte. Dans la fiche d'un vêtement, le champ « Photo pour la cabine » accepte un autre lien d'image (clic droit sur l'image du site → Copier l'adresse de l'image).
- **Chaussures.** Elles s'affichent avec la tenue, mais l'IA ne les enfile pas encore.
- **Confidentialité.** Ta photo est envoyée au modèle sur Hugging Face le temps de l'essayage ; elle est stockée sur ton PC dans `%APPDATA%\Wishy\cabine`.

## Couleurs et combos Pantone

Pour chaque vêtement, Wishy lit la couleur sur la photo et l'associe à la référence **Pantone TCX** la plus proche (le nuancier textile, 2 300 teintes). Dans la fiche de l'article :
- **Couleur détectée** : si la photo contient plusieurs teintes, touche la bonne.
- **Combos** : ton sur ton, couleurs voisines, contraste complémentaire et neutres assortis, chacun avec 3 références Pantone.
- **Dans ta wishlist, ça va avec** : les autres vêtements de ta liste qui s'accordent avec celui-ci.

Dans la Cabine, le panneau **Harmonie des couleurs** juge la tenue choisie (« Bel accord », « Ça passe » ou « Risqué ») et propose des teintes pour la pièce manquante. Un petit cœur rose signale les vêtements assortis à ceux déjà choisis.

Touche une puce Pantone pour copier sa référence. Les teintes affichées sont des approximations écran. Données Pantone : paquet npm `pantone-tcx` (licence ISC).

## Données

Tout reste sur ton PC, dans `%APPDATA%\Wishy\wishy-data.json`. Réglages → Sauvegarde pour exporter ou restaurer.

## Mises à jour automatiques

La version installée (Wishy-Setup) vérifie les nouvelles versions sur les Releases GitHub au démarrage, puis toutes les 4 heures. Une nouvelle version se télécharge en arrière-plan ; un bandeau propose alors **Redémarrer et installer** (sinon elle s'installe à la prochaine fermeture de Wishy). La version portable ne se met pas à jour toute seule.

Le dépôt doit être **public** pour que Wishy puisse lire les Releases sans clé.

### Publier une nouvelle version

1. Augmente `version` dans `package.json` (ex. `1.4.0` → `1.5.0`).
2. Crée un jeton GitHub (Settings → Developer settings → Fine-grained tokens) avec l'accès **Contents : Read and write** sur ce dépôt.
3. Dans le terminal de VS Code :
   ```
   $env:GH_TOKEN="ton_jeton"
   npm run release
   ```
   Les .exe, `latest.yml` et le `.blockmap` sont envoyés dans une nouvelle Release GitHub ; tous les Wishy installés la récupèrent.

## Pour les développeurs

```
npm install
npm start          # lancer en mode développement
npm run dist       # reconstruire les .exe Windows
```

Electron 33, Three.js r170 (embarqué dans `src/vendor`), polices Bricolage Grotesque et DM Sans (embarquées). Ouvrir `src/index.html` via un petit serveur local affiche une démo avec des données fictives.
