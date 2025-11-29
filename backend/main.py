import os
import json
import hashlib
from dotenv import load_dotenv
from datetime import datetime

load_dotenv()
from typing import Optional, Dict, Any

from fastapi import FastAPI, HTTPException, BackgroundTasks
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
app = FastAPI(title="Fraud Detection AI Engine")

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
    def predict(self, amount, category):
        # Logique simple pour simuler l'IA : 
        # Si montant > 2000 ou catégorie 'Electronics', le risque augmente
        base_score = 0.02
        if amount > 2000: base_score += 0.4
        if category == "Electronics": base_score += 0.3
        if amount > 8000: base_score += 0.5 # Fraude quasi sûre
        
        # Ajout d'un peu d'aléatoire (bruit)
        noise = np.random.normal(0, 0.05)
        final_score = min(max(base_score + noise, 0), 1) # Clamp entre 0 et 1
        return float(final_score)

model = MockXGBoost()

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

    # 3. Inférence IA (Machine Learning)
    # Préparation des features pour le modèle
    fraud_score = model.predict(tx.amount, tx.category)
    
    # Sauvegarde de la prédiction
    pred_payload = {
        "transaction_id": transaction_id,
        "score": fraud_score,
        "model_version": "mock_xgb_v1",
        "features_snapshot": {"amount": tx.amount, "category": tx.category}
    }
    pred_res = supabase.table("fraud_predictions").insert(pred_payload).execute()
    prediction_id = pred_res.data[0]['id']

    # 4. Moteur de Règles & Décision
    thresholds = get_config_thresholds()
    
    decision = "ALLOW"
    severity = "BASSE"
    create_alert = False
    
    if fraud_score >= thresholds['critical']:
        decision = "BLOCK"
        severity = "CRITIQUE"
        create_alert = True
    elif fraud_score >= thresholds['medium']:
        decision = "REVIEW" # Demande de vérification (ex: 3DSecure)
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
    return {"status": "online", "system": "Fraud Detection AI"}
