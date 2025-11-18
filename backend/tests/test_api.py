import requests
import random
import time

API_URL = "http://127.0.0.1:8000/analyze"

# Scénario 1 : Achat Normal
payload_safe = {
    "user_id": "jean_dupont",
    "amount": 45.00,
    "ip_address": "192.168.1.1",
    "merchant": "Uber Eats",
    "category": "Food"
}

# Scénario 2 : Fraude probable (Gros montant + Electronics)
payload_fraud = {
    "user_id": "hacker_123",
    "amount": 2500.00,
    "ip_address": "10.10.10.10",
    "merchant": "Apple Store",
    "category": "Electronics"
}

# Scénario 3 : IP Bannis (Utilisez le hash que vous avez mis en BDD si vous voulez tester)
# Pour tester, assurez-vous qu'une IP est dans la table suspicious_entities

def send_tx(data, name):
    print(f"--- Envoi transaction : {name} ---")
    try:
        start = time.time()
        response = requests.post(API_URL, json=data)
        elapsed = time.time() - start
        
        if response.status_code == 200:
            res_json = response.json()
            print(f"Réponse : {response.status_code}")
            print(f"Action recommandée : {res_json.get('action')}")
            print(f"Score IA : {res_json.get('score')}")
            print(f"Temps : {elapsed:.3f}s")
        else:
            print(f"Erreur : {response.text}")
    except Exception as e:
        print(f"Erreur de connexion : {e}")
    print("\n")

if __name__ == "__main__":
    send_tx(payload_safe, "Achat Sûr")
    time.sleep(1)
    send_tx(payload_fraud, "Tentative Fraude")
