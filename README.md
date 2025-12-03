# FraudGuard AI
Détecteur de fraudes de transactions en ligne en temps réel.

## Besoins fonctionnels

Un utilisateur doit:
- Visualiser les alertes récentes en live
- Voir les détails d'une alerte
- Modifier les paramètres du logiciel
- Marquer une nouvelle alerte comme "Fraude" ou "Faux positif", ajouter des commentaires
- Visualiser l'historique, les chiffres et les graphes.
- Exporter les alertes ainsi que l'historique des transactions en CSV. 

## Installer le projet

### Front End

La partie Front End utilise node et npm. 

`npm install`

### Back End

Le partie Back End utilise python et pip.

`pip install -r requirements.txt`


## Exécuter le projet

### Front End

`npm run dev`

### Back End

`uvicorn main:app --reload`
