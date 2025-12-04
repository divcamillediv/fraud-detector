# 🛡️ FraudGuard - Backend API

Ce dossier contient le moteur d'intelligence artificielle et l'API de la plateforme FraudGuard. Il est construit avec **Python** et **FastAPI**, et utilise **XGBoost** pour la détection de fraudes ainsi que **Supabase** pour la base de données.

## 📋 Prérequis

* Python 3.8 ou supérieur
* Pip (gestionnaire de paquets Python)
* Accès à une instance Supabase (URL et Clé API)

## 🛠️ Installation et Configuration

Suivez ces étapes pour configurer votre environnement de développement local.

### 1. Créer un environnement virtuel (venv)

Il est recommandé d'utiliser un environnement virtuel pour isoler les dépendances du projet.

**Windows :**
```bash
python -m venv venv
````

**MacOS / Linux :**

```bash
python3 -m venv venv
```

### 2\. Activer l'environnement virtuel

C'est l'étape cruciale pour que les librairies s'installent au bon endroit.

**Windows (PowerShell) :**

```powershell
.\venv\Scripts\activate
```

*(Si vous avez une erreur de script, tapez d'abord : `Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser`)*

**Windows (CMD) :**

```cmd
venv\Scripts\activate.bat
```

**macOS / Linux :**

```bash
source venv/bin/activate
```

*Une fois activé, vous devriez voir `(venv)` apparaître au début de votre ligne de commande.*

### 3\. Installer les dépendances

Assurez-vous que le fichier `requirements.txt` est présent dans le dossier.

```bash
pip install -r requirements.txt
```

### 4\. Configuration des variables d'environnement

Créez un fichier nommé `.env` à la racine du dossier `backend/` et ajoutez vos clés Supabase (utilisez la clé `service_role` pour permettre au backend d'écrire sans restriction) :

```ini
SUPABASE_URL="votre_url_supabase"
SUPABASE_KEY="votre_clé_service_role_supabase"
```

## 🚀 Lancer le Serveur (Uvicorn)

Pour démarrer l'API en mode développement (avec rechargement automatique lors des modifications de code) :

```bash
uvicorn main:app --reload
```

Le serveur sera accessible à l'adresse : `http://127.0.0.1:8000`

## 🧪 Scripts Utilitaires

Le backend inclut des scripts pour tester et simuler l'activité.

### Lancer la simulation de trafic (Démo)

Ce script génère des transactions aléatoires (légitimes et frauduleuses) et les envoie à l'API en temps réel. Idéal pour voir le Dashboard Frontend s'animer.

```bash
python simulation.py
```

### Tester une transaction unique

Pour envoyer une requête de test spécifique (ex: tentative de fraude massive) :

```bash
python test.py
```

## 🏗️ Structure des fichiers

  * `main.py` : Point d'entrée de l'application FastAPI. Contient la logique des endpoints (`/analyze`, `/metrics`, `/config`) et le moteur de règles.
  * `simulation.py` : Générateur de trafic pour les démonstrations.
  * `requirements.txt` : Liste des librairies Python requises.

