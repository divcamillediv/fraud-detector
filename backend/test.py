import requests
import time

# L'URL de votre backend local
API_URL = "http://127.0.0.1:8000/analyze"

# Scénario : Achat massif d'électronique (déclencheur typique pour l'IA simulée)
transaction_suspecte = {
    "user_id": "hacker_russe_007",
    "amount": 9500.00,             # Montant très élevé (> seuil critique)
    "currency": "EUR",
    "ip_address": "45.12.19.99",
    "merchant": "Apple Store",
    "category": "Electronics",      # Catégorie à risque
    "device_id": "unknown_device_x"
}

print("🔫 Envoi de la transaction frauduleuse...")

try:
    response = requests.post(API_URL, json=transaction_suspecte)
    
    if response.status_code == 200:
        data = response.json()
        print(f"✅ Réponse API : {data}")
        print("👀 Regardez votre Dashboard Frontend maintenant !")
    else:
        print(f"❌ Erreur : {response.text}")

except Exception as e:
    print(f"Erreur de connexion : {e}")