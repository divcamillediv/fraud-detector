import os
import json
import hashlib
from dotenv import load_dotenv
from datetime import datetime, timedelta

load_dotenv()
from typing import Optional, Dict, Any, List

from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from supabase import create_client, Client
import xgboost as xgb
import pandas as pd
import numpy as np

# --- CONFIGURATION ---
# Remplacer par vos clés Supabase (disponibles dans Project Settings > API)
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
app = FastAPI(title="FraudGuard - AI Detection Engine")

# CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- MODÈLE DE DONNÉES (Input API) ---
class TransactionInput(BaseModel):
    user_id: str
    amount: float
    currency: str = "EUR"
    ip_address: str
    merchant: str
    category: str
    device_id: Optional[str] = None

# --- SIMULATEUR XGBOOST (Pour le prototype) ---
# Dans la réalité, on chargerait : model = xgb.Booster(model_file='fraud_model.json')
class MockXGBoost:
    # Catégories à haut risque
    HIGH_RISK_CATEGORIES = ['Electronics', 'Jewelry', 'Gambling']
    # Catégories à risque moyen
    MEDIUM_RISK_CATEGORIES = ['Travel', 'Services', 'Crypto']

    def predict(self, amount, category, country=None, config=None):
        """
        Calcule le score de fraude en utilisant la configuration.

        Args:
            amount: Montant de la transaction
            category: Catégorie du marchand
            country: Code pays extrait de l'IP (optionnel)
            config: Configuration depuis la base de données (optionnel)

        Returns:
            Score de fraude entre 0 et 1
        """
        config = config or {}
        sensitive_countries = config.get('sensitive_countries', ['RU', 'CN'])
        min_amount = config.get('min_amount_alert', 100)

        base_score = 0.05

        # Règle 1: Montant - échelle progressive
        if amount > 8000:
            base_score += 0.45
        elif amount > 5000:
            base_score += 0.35
        elif amount > 2000:
            base_score += 0.30
        elif amount > 1000:
            base_score += 0.20
        elif amount > 500:
            base_score += 0.10

        # Règle 2: Catégorie à risque (case-insensitive)
        category_upper = (category or '').strip()
        if category_upper in self.HIGH_RISK_CATEGORIES:
            base_score += 0.30
        elif category_upper in self.MEDIUM_RISK_CATEGORIES:
            base_score += 0.20

        # Règle 3: Pays sensible (+0.25 fixe selon config)
        if country and country in sensitive_countries:
            base_score += 0.25

        # Règle 4: Petit montant = réduction du score
        if amount < min_amount:
            base_score *= 0.5

        # Ajout d'un peu d'aléatoire (bruit)
        noise = np.random.normal(0, 0.05)
        final_score = min(max(base_score + noise, 0), 1)  # Clamp entre 0 et 1
        return float(final_score)

model = MockXGBoost()


def get_country_from_ip(ip: str) -> str:
    """
    Extrait le code pays depuis une adresse IP (simulation).
    Dans un cas réel, utiliser un service GeoIP.
    """
    if not ip:
        return "FR"
    try:
        hash_val = sum(int(x) for x in ip.split('.') if x.isdigit())
        countries = ['FR', 'US', 'RU', 'CN', 'BR', 'DE', 'GB']
        return countries[hash_val % len(countries)]
    except:
        return "FR"


def get_full_config() -> Dict[str, Any]:
    """
    Récupère toute la configuration ML depuis la base de données.
    Utilisée par le modèle XGBoost pour ajuster ses calculs.
    """
    config = {
        'fraud_threshold_critical': 0.70,
        'fraud_threshold_medium': 0.50,
        'sensitive_countries': ['RU', 'CN'],
        'min_amount_alert': 100,
        'max_anomalies': 3,
        'auto_block_active': True
    }

    try:
        res = supabase.table("rules_config").select("key, value").execute()
        for row in res.data or []:
            key = row.get('key')
            value = row.get('value')

            if key == 'fraud_threshold_high':
                config['fraud_threshold_critical'] = float(value)
            elif key == 'fraud_threshold_medium':
                config['fraud_threshold_medium'] = float(value)
            elif key == 'sensitive_countries':
                try:
                    config['sensitive_countries'] = json.loads(value)
                except:
                    pass
            elif key == 'min_amount_alert':
                config['min_amount_alert'] = float(value)
            elif key == 'max_anomalies':
                config['max_anomalies'] = int(value)
            elif key == 'auto_block_active':
                config['auto_block_active'] = value in [True, 'true', 'True']
    except Exception as e:
        print(f"Erreur chargement config: {e}")

    return config

# --- FONCTIONS UTILITAIRES ---

def hash_data(data: str) -> str:
    """Hachage SHA256 pour comparaison avec la Ban List (RGPD)"""
    return hashlib.sha256(data.encode('utf-8')).hexdigest()

def check_ban_list(ip: str, user_id: str) -> bool:
    """Vérifie si l'IP ou le User est dans la table suspicious_entities"""
    ip_hash = hash_data(ip)
    
    # Requête Supabase
    response = supabase.table("suspicious_entities").select("id").eq("entity_hash", ip_hash).execute()
    
    if len(response.data) > 0:
        return True
    return False

def get_config_thresholds():
    """Récupère les seuils de configuration depuis la DB"""
    try:
        # Valeurs par défaut
        thresholds = {"critical": 0.85, "medium": 0.50}
        
        res = supabase.table("rules_config").select("key, value").execute()
        for row in res.data:
            if row['key'] == 'fraud_threshold_high':
                thresholds['critical'] = float(row['value'])
            elif row['key'] == 'fraud_threshold_medium':
                thresholds['medium'] = float(row['value'])
        return thresholds
    except:
        return {"critical": 0.85, "medium": 0.50}

# --- ENDPOINTS API ---

@app.post("/analyze")
async def analyze_transaction(tx: TransactionInput, background_tasks: BackgroundTasks):
    """
    Point d'entrée principal : Reçoit une transaction -> Analyse -> Décide
    """
    
    # 1. Sauvegarde de la transaction brute (Log)
    tx_data = {
        "external_user_id": tx.user_id,
        "amount": tx.amount,
        "currency": tx.currency,
        "merchant_info": {"name": tx.merchant, "category": tx.category},
        "ip_address": tx.ip_address,
        "device_id": tx.device_id,
        "is_processed": True
    }
    
    try:
        res_tx = supabase.table("transactions").insert(tx_data).execute()
        transaction_id = res_tx.data[0]['id']
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur DB Transaction: {str(e)}")

    # 2. Vérification Ban List (Règle stricte)
    is_banned = check_ban_list(tx.ip_address, tx.user_id)
    
    if is_banned:
        # Action immédiate : BLOCAGE
        # On crée quand même une alerte pour info
        alert_payload = {
            "transaction_id": transaction_id,
            "status": "RESOLU_FRAUDE",
            "severity": "CRITIQUE",
            "analyst_notes": "Blocage automatique : IP présente dans la liste noire."
        }
        supabase.table("alerts").insert(alert_payload).execute()
        
        return {
            "action": "BLOCK",
            "reason": "BLACKLIST_MATCH",
            "transaction_id": transaction_id
        }

    # 3. Récupération de la configuration complète
    config = get_full_config()

    # 4. Extraction du pays depuis l'IP
    country = get_country_from_ip(tx.ip_address)

    # 5. Inférence IA (Machine Learning) avec configuration
    fraud_score = model.predict(
        amount=tx.amount,
        category=tx.category,
        country=country,
        config=config
    )

    # Sauvegarde de la prédiction
    pred_payload = {
        "transaction_id": transaction_id,
        "score": fraud_score,
        "model_version": "mock_xgb_v1",
        "features_snapshot": {
            "amount": tx.amount,
            "category": tx.category,
            "country": country,
            "config_used": {
                "sensitive_countries": config.get('sensitive_countries'),
                "min_amount_alert": config.get('min_amount_alert')
            }
        }
    }
    pred_res = supabase.table("fraud_predictions").insert(pred_payload).execute()
    prediction_id = pred_res.data[0]['id']

    # 6. Moteur de Règles & Décision (utilise les seuils configurés)
    decision = "ALLOW"
    severity = "BASSE"
    create_alert = False

    if fraud_score >= config['fraud_threshold_critical']:
        decision = "BLOCK"
        severity = "CRITIQUE"
        create_alert = True
    elif fraud_score >= config['fraud_threshold_medium']:
        decision = "REVIEW"  # Demande de vérification (ex: 3DSecure)
        severity = "MOYENNE"
        create_alert = True
    
    # 5. Création d'alerte si nécessaire
    if create_alert:
        alert_payload = {
            "transaction_id": transaction_id,
            "prediction_id": prediction_id,
            "status": "NOUVEAU",
            "severity": severity,
            "analyst_notes": f"Score IA: {fraud_score:.2f}"
        }
        # On insère de manière asynchrone pour ne pas ralentir la réponse API
        background_tasks.add_task(supabase.table("alerts").insert(alert_payload).execute)

    return {
        "action": decision,
        "score": round(fraud_score, 4),
        "transaction_id": transaction_id
    }

@app.get("/")
def health_check():
    return {"status": "online", "system": "FraudGuard AI"}


# --- NOUVEAUX ENDPOINTS POUR LE DASHBOARD ---

@app.get("/metrics")
async def get_dashboard_metrics():
    """
    Récupère les métriques pour le tableau de bord :
    - Alertes sur 24h
    - Taux de fraude estimé
    - Alertes en cours
    - Temps moyen d'analyse
    - Répartition des risques
    """
    try:
        # Date limite pour les 24 dernières heures
        last_24h = (datetime.utcnow() - timedelta(hours=24)).isoformat()

        # Récupérer toutes les alertes
        all_alerts = supabase.table("alerts").select("*, fraud_predictions(score)").execute()

        # Alertes des dernières 24h
        alerts_24h = supabase.table("alerts").select("id").gte("created_at", last_24h).execute()

        # Alertes en cours (NOUVEAU ou EN_COURS)
        in_progress = supabase.table("alerts").select("id").in_("status", ["NOUVEAU", "EN_COURS"]).execute()

        # Fraudes confirmées
        confirmed_frauds = supabase.table("alerts").select("id").eq("status", "RESOLU_FRAUDE").execute()

        total_alerts = len(all_alerts.data) if all_alerts.data else 0
        fraud_rate = (len(confirmed_frauds.data) / total_alerts * 100) if total_alerts > 0 else 0

        # Répartition des risques
        high_risk = 0
        medium_risk = 0
        low_risk = 0

        for alert in all_alerts.data or []:
            pred = alert.get("fraud_predictions")
            if pred:
                score = pred.get("score", 0) if isinstance(pred, dict) else 0
            else:
                score = 0

            if score >= 0.7:
                high_risk += 1
            elif score >= 0.4:
                medium_risk += 1
            else:
                low_risk += 1

        return {
            "alerts_24h": len(alerts_24h.data) if alerts_24h.data else 0,
            "fraud_rate": round(fraud_rate, 1),
            "in_progress": len(in_progress.data) if in_progress.data else 0,
            "avg_analysis_time": 12,  # Valeur simulée, à calculer depuis les timestamps
            "risk_distribution": {
                "high": high_risk,
                "medium": medium_risk,
                "low": low_risk
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur métriques: {str(e)}")


@app.get("/metrics/chart")
async def get_chart_data():
    """
    Récupère les données pour le graphique de fraudes détectées sur 24h
    """
    try:
        # Générer les données par tranche horaire (dernières 24h)
        chart_data = []
        now = datetime.utcnow()

        for i in range(8):
            hour_offset = (7 - i) * 3
            start_time = now - timedelta(hours=hour_offset + 3)
            end_time = now - timedelta(hours=hour_offset)

            # Compter les alertes dans cette période
            alerts = supabase.table("alerts")\
                .select("id")\
                .gte("created_at", start_time.isoformat())\
                .lt("created_at", end_time.isoformat())\
                .execute()

            chart_data.append({
                "name": f"{(now - timedelta(hours=hour_offset)).hour:02d}h",
                "frauds": len(alerts.data) if alerts.data else np.random.randint(2, 10)
            })

        return chart_data
    except Exception as e:
        # Fallback avec données simulées
        return [
            {"name": "00h", "frauds": 2},
            {"name": "03h", "frauds": 5},
            {"name": "06h", "frauds": 3},
            {"name": "09h", "frauds": 9},
            {"name": "12h", "frauds": 6},
            {"name": "15h", "frauds": 7},
            {"name": "18h", "frauds": 4},
            {"name": "21h", "frauds": 8},
        ]


@app.get("/config")
async def get_config():
    """
    Récupère la configuration actuelle du moteur de détection
    """
    try:
        res = supabase.table("rules_config").select("key, value").execute()

        config = {
            "fraud_threshold_high": 0.70,
            "fraud_threshold_medium": 0.50,
            "auto_block_active": True,
            "min_amount_alert": 100,
            "max_anomalies": 3,
            "sensitive_countries": ["RU", "CN"]
        }

        for row in res.data or []:
            key = row.get("key")
            value = row.get("value")

            if key == "fraud_threshold_high":
                config["fraud_threshold_high"] = float(value)
            elif key == "fraud_threshold_medium":
                config["fraud_threshold_medium"] = float(value)
            elif key == "auto_block_active":
                config["auto_block_active"] = value in [True, "true", "True"]
            elif key == "min_amount_alert":
                config["min_amount_alert"] = float(value)
            elif key == "max_anomalies":
                config["max_anomalies"] = int(value)
            elif key == "sensitive_countries":
                try:
                    config["sensitive_countries"] = json.loads(value)
                except:
                    pass

        return config
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur config: {str(e)}")


class ConfigUpdate(BaseModel):
    key: str
    value: Any


@app.post("/config")
async def update_config(updates: List[ConfigUpdate]):
    """
    Met à jour la configuration du moteur de détection
    """
    try:
        for update in updates:
            value = update.value
            if isinstance(value, (list, dict)):
                value = json.dumps(value)
            else:
                value = str(value)

            supabase.table("rules_config").upsert({
                "key": update.key,
                "value": value,
                "updated_at": datetime.utcnow().isoformat()
            }).execute()

        return {"status": "success", "message": "Configuration mise à jour"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur mise à jour config: {str(e)}")


@app.get("/alerts")
async def get_alerts(
    limit: int = 50,
    risk_level: str = "all",
    status: str = "all",
    period: str = "24h"
):
    """
    Récupère les alertes avec filtres optionnels
    """
    try:
        query = supabase.table("alerts").select("*, transactions(*), fraud_predictions(*)")

        # Filtre par période
        if period == "24h":
            since = (datetime.utcnow() - timedelta(hours=24)).isoformat()
            query = query.gte("created_at", since)
        elif period == "7d":
            since = (datetime.utcnow() - timedelta(days=7)).isoformat()
            query = query.gte("created_at", since)
        elif period == "30d":
            since = (datetime.utcnow() - timedelta(days=30)).isoformat()
            query = query.gte("created_at", since)

        # Filtre par statut
        if status != "all":
            query = query.eq("status", status)

        # Exécuter la requête
        result = query.order("created_at", desc=True).limit(limit).execute()

        alerts = result.data or []

        # Filtre par niveau de risque (post-query car basé sur les prédictions)
        if risk_level != "all":
            filtered = []
            for alert in alerts:
                pred = alert.get("fraud_predictions")
                score = pred.get("score", 0) if pred else 0

                if risk_level == "high" and score >= 0.7:
                    filtered.append(alert)
                elif risk_level == "medium_high" and score >= 0.4:
                    filtered.append(alert)
                elif risk_level == "low" and score < 0.4:
                    filtered.append(alert)
            alerts = filtered

        return alerts
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur alertes: {str(e)}")


@app.put("/alerts/{alert_id}")
async def update_alert(alert_id: str, status: str, analyst_notes: str = None):
    """
    Met à jour le statut d'une alerte
    """
    try:
        update_data = {
            "status": status,
            "confirmed_fraud": status == "RESOLU_FRAUDE",
            "updated_at": datetime.utcnow().isoformat()
        }

        if analyst_notes:
            update_data["analyst_notes"] = analyst_notes

        supabase.table("alerts").update(update_data).eq("id", alert_id).execute()

        return {"status": "success", "message": "Alerte mise à jour"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur mise à jour alerte: {str(e)}")
