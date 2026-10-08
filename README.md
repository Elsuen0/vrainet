# VraiNet

Ce virement, combien est vraiment à toi ? Calculateur pour micro-entrepreneurs français : à chaque virement reçu, répartition entre URSSAF, impôt, CFE, TVA, matelas de sécurité, investissement et budget pro.

- Site : https://vrainet.vercel.app
- Un seul fichier `index.html`, sans build ni dépendance. Les données restent dans le navigateur (localStorage).
- Taux 2026 vérifiés le 2 octobre 2026. Outil de pilotage, pas un conseil fiscal.

## Structure

```
index.html        page (structure et contenu)
assets/style.css  styles
js/core.js        calculs (fonctions pures : ventilation, impôt, échéances)
js/app.js         interface (rendu, stockage local, événements)
js/inscription.js inscription email (envoi de l'adresse via Web3Forms)
```

Aucun build : ouvrir `index.html` suffit. Pour modifier les taux de l'année, voir `DEFAUTS`, `SEUILS` et `BAREME` en tête de `js/core.js`.

## Inscription email

Le bloc « Les taux bougent tous les ans » envoie uniquement l'adresse saisie à Web3Forms, qui la transmet par mail. Colle la clé d'accès dans `CLE`, en tête de `js/inscription.js`. Tant que `CLE` est vide, le bloc reste masqué.
