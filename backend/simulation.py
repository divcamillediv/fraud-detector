import requests
import time
import random
import uuid

# --- CONFIGURATION DE LA DÉMO ---
API_URL = "http://127.0.0.1:8000/analyze"
DEMO_DURATION_MINUTES = 10  # Durée du script
MIN_DELAY = 2  # Délai min entre 2 transactions (secondes)
MAX_DELAY = 6  # Délai max (pour varier le rythme)

# --- PROFILS DE COMPORTEMENT ---
# Ces profils sont calibrés pour déclencher vos règles backend (Mock XGBoost)
PROFILES = [
    {
        "type": "✅ SAFE",
        "weight": 70, # 70% de chance
        "amount_range": (5.00, 150.00),
        "categories": ["Food", "Books", "Clothing", "Transport"],
        "merchants": ["Uber", "Fnac", "Carrefour", "SNCF", "Amazon"],
        "color": "\033[92m" # Vert
    },
    {
        "type": "⚠️ SUSPECT",
        "weight": 20, # 20% de chance (Score moyen)
        "amount_range": (800.00, 1900.00), # Montant élevé mais pas critique
        "categories": ["Travel", "Services", "Gambling"],
        "merchants": ["Air France", "BetClic", "Western Union"],
        "color": "\033[93m" # Jaune/Orange
    },
    {
        "type": "🚨 FRAUD",
        "weight": 10, # 10% de chance (Score critique)
        "amount_range": (2500.00, 9000.00), # > 2000 déclenche souvent l'alerte
        "categories": ["Electronics", "Jewelry"], # Catégories à risque
        "merchants": ["Apple Store", "Rolex", "CryptoBinance"],
        "color": "\033[91m" # Rouge
    }
]

def generate_random_ip():
    return f"{random.randint(10, 200)}.{random.randint(0, 255)}.{random.randint(0, 255)}.{random.randint(0, 255)}"

def run_demo():
    start_time = time.time()
    end_time = start_time + (DEMO_DURATION_MINUTES * 60)
    tx_count = 0

    print(f"🎬 Démarrage de la simulation pour {DEMO_DURATION_MINUTES} minutes...")
    print("---------------------------------------------------------")

    while time.time() < end_time:
        # 1. Choisir un profil au hasard selon les probabilités (poids)
        profile = random.choices(PROFILES, weights=[p['weight'] for p in PROFILES], k=1)[0]
        
        # 2. Générer les données
        amount = round(random.uniform(*profile['amount_range']), 2)
        merchant = random.choice(profile['merchants'])
        category = random.choice(profile['categories'])
        
        payload = {
            "user_id": f"user_{random.randint(100, 999)}",
            "amount": amount,
            "currency": "EUR",
            "ip_address": generate_random_ip(),
            "merchant": merchant,
            "category": category,
            "device_id": f"device_{uuid.uuid4().hex[:8]}"
        }

        # 3. Envoyer à l'API
        try:
            response = requests.post(API_URL, json=payload)
            tx_count += 1
            
            # Affichage joli dans le terminal
            status_code = response.status_code
            action = "UNKNOWN"
            if status_code == 200:
                data = response.json()
                action = data.get('action', 'N/A')
                score = data.get('score', 0)
            
            print(f"{profile['color']}[{profile['type']}] {merchant} ({category}) - {amount}€ -> Action: {action} (Score: {score:.2f})\033[0m")

        except Exception as e:
            print(f"❌ Erreur de connexion : {e}")

        # 4. Pause aléatoire pour simuler le trafic naturel
        sleep_time = random.uniform(MIN_DELAY, MAX_DELAY)
        time.sleep(sleep_time)

    print("---------------------------------------------------------")
    print(f"🏁 Simulation terminée. {tx_count} transactions envoyées.")

if __name__ == "__main__":
    run_demo()