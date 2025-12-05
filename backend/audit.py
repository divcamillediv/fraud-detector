import pandas as pd
import random
import uuid
from datetime import datetime, timedelta
from faker import Faker

# Installation requise : pip install pandas faker
fake = Faker('fr_FR')

# --- CONFIGURATION ---
NUM_LOGS = 100  # Nombre de lignes à générer
OUTPUT_FILE = "journal_audit_actions.csv"

# Données fictives pour la simulation
ANALYSTS = ['camille.admin', 'lina.analyste', 'rayan.lead', 'system_bot']
STATUS_FLOW = ['NOUVEAU', 'EN_COURS', 'RESOLU_FRAUDE', 'FAUX_POSITIF']
SEVERITIES = ['BASSE', 'MOYENNE', 'HAUTE', 'CRITIQUE']

def generate_logs():
    logs = []
    print(f"🔄 Génération de {NUM_LOGS} entrées d'audit...")

    for _ in range(NUM_LOGS):
        # 1. Contexte de l'action
        action_date = fake.date_time_between(start_date='-30d', end_date='now')
        alert_id = str(uuid.uuid4())
        user = random.choice(ANALYSTS)
        
        # 2. Déterminer le type d'action
        action_type = random.choices(
            ['CHANGE_STATUS', 'ADD_NOTE', 'CHANGE_SEVERITY', 'AUTO_BLOCK'],
            weights=[50, 30, 10, 10], # Probabilités
            k=1
        )[0]

        old_val = ""
        new_val = ""

        # 3. Logique métier pour old_value / new_value
        if action_type == 'CHANGE_STATUS':
            old_val = random.choice(STATUS_FLOW[:-1]) # Prend un statut de début
            # Prend un statut différent pour la nouvelle valeur
            possibles = [s for s in STATUS_FLOW if s != old_val]
            new_val = random.choice(possibles)
            
        elif action_type == 'ADD_NOTE':
            old_val = "NULL"
            new_val = fake.sentence(nb_words=10)
            
        elif action_type == 'CHANGE_SEVERITY':
            old_val = random.choice(SEVERITIES)
            possibles = [s for s in SEVERITIES if s != old_val]
            new_val = random.choice(possibles)
            
        elif action_type == 'AUTO_BLOCK':
            user = 'system_bot'
            old_val = "ACTIF"
            new_val = "BLOQUE_IP"

        # 4. Construction de la ligne
        log_entry = {
            'log_id': str(uuid.uuid4()),
            'timestamp': action_date.isoformat(),
            'user_id': user,
            'alert_id': alert_id,
            'action_type': action_type,
            'old_value': old_val,
            'new_value': new_val,
            'ip_source': fake.ipv4() if user != 'system_bot' else '127.0.0.1'
        }
        logs.append(log_entry)

    # 5. Création du DataFrame et Export CSV
    df = pd.DataFrame(logs)
    
    # Tri par date (le plus récent en haut)
    df = df.sort_values(by='timestamp', ascending=False)
    
    df.to_csv(OUTPUT_FILE, index=False, encoding='utf-8-sig') # utf-8-sig pour Excel
    print(f"✅ Fichier généré avec succès : {OUTPUT_FILE}")
    print(df.head())

if __name__ == "__main__":
    generate_logs()
