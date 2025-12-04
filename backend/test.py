import requests
import time

'''
# Test d'intégration pour ajouter une transaction dans la base de données via l'API backend
# et vérifier que le frontend affiche correctement la nouvelle transaction.
'''

# L'URL de votre backend local
API_URL = "http://127.0.0.1:8000/analyze"

# Scénario : Achat massif d'électronique (déclencheur typique pour l'IA simulée)
transaction_suspecte = {
    "user_id": "hacker_123",
    "amount": 10000.00,             # Montant très élevé (> seuil critique)
    "currency": "EUR",
    "ip_address": "46.121.191.99",
    "merchant": "Apple Store",
    "category": "Electronics",      # Catégorie à risque
    "device_id": "unknown_device_x"
}

print("Envoi de la transaction frauduleuse...")

try:
    response = requests.post(API_URL, json=transaction_suspecte)
    
    if response.status_code == 200:
        data = response.json()
        print(f"Réponse API : {data}")
        print("La donnée est visible sur le Dashboard.")
    else:
        print(f"Erreur : {response.text}")

except Exception as e:
    print(f"Erreur de connexion : {e}")