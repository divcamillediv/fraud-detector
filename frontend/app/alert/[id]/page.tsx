"use client";

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { 
  ArrowLeft, ShieldAlert, CheckCircle, MapPin, 
  CreditCard, Smartphone, Clock, Ban, Activity 
} from 'lucide-react';
import Link from 'next/link';

export default function AlertDetail() {
  const { id } = useParams(); // Récupère l'ID depuis l'URL
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false); // Nouvel état pour bloquer le bouton

  useEffect(() => {
    if (id) fetchAlertDetails();
  }, [id]);

  const fetchAlertDetails = async () => {
    // Jointure : On récupère l'alerte + la transaction liée + la prédiction liée
    const { data, error } = await supabase
      .from('alerts')
      .select(`
        *,
        transactions (*),
        fraud_predictions (*)
      `)
      .eq('id', id)
      .single();

    if (error) console.error("Erreur fetch:", error);
    else setData(data);
    
    setLoading(false);
  };

  const handleResolution = async (status: string) => {
    setIsUpdating(true); // 1. On active le chargement pour éviter le double-clic

    try {
      // 2. On attend que Supabase finisse l'écriture (IMPORTANT : await)
      const { error } = await supabase
        .from('alerts')
        .update({ 
          status: status,
          confirmed_fraud: status === 'RESOLU_FRAUDE', // Logique métier
          updated_at: new Date()
        })
        .eq('id', id);

      if (error) throw error;

      // 3. LA CLÉ DU SUCCÈS : On invalide le cache Next.js
      router.refresh(); 

      // 4. On retourne à l'accueil
      router.push('/');
      
    } catch (e) {
      console.error("Erreur sauvegarde:", e);
      setIsUpdating(false); // On réactive les boutons en cas d'erreur
    }
  };

  if (loading) return <div className="p-10 text-center text-slate-500">Chargement du dossier...</div>;
  if (!data) return <div className="p-10 text-center text-red-500">Alerte introuvable.</div>;

  // Raccourcis pour la lisibilité
  const tx = data.transactions;
  const pred = data.fraud_predictions;
  const riskPercent = (pred?.score * 100).toFixed(1);

  return (
    <div className="min-h-screen bg-slate-50 p-8 font-sans">
      
      {/* --- HEADER DE NAVIGATION --- */}
      <div className="mb-8 flex items-center justify-between">
        <Link href="/" className="flex items-center text-slate-500 hover:text-slate-800 transition-colors">
          <ArrowLeft size={20} className="mr-2" /> Retour au Dashboard
        </Link>
        <div className="flex gap-3">
          <button 
            onClick={() => handleResolution('FAUX_POSITIF')}
            className="px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-lg hover:bg-green-50 hover:text-green-700 flex items-center gap-2 transition-all"
          >
            <CheckCircle size={18} /> Marquer Sûr
          </button>
          <button 
            onClick={() => handleResolution('RESOLU_FRAUDE')}
            disabled={isUpdating}
            className={`px-4 py-2 text-white rounded-lg flex items-center gap-2 transition-all shadow-sm
              ${isUpdating ? 'bg-slate-400 cursor-wait' : 'bg-red-600 hover:bg-red-700'}`}
          >
            <Ban size={18} /> 
            {isUpdating ? 'Sauvegarde...' : 'Confirmer Fraude & Bloquer'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

        {/* --- COLONNE GAUCHE : L'Analyse IA --- */}
        <div className="space-y-6">
          {/* Carte Score */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
            <h2 className="text-slate-500 text-sm font-bold uppercase mb-4 flex items-center gap-2">
              <Activity size={16} /> Analyse IA (XGBoost)
            </h2>
            
            <div className="flex items-center justify-center mb-6 relative">
              {/* Jauge Circulaire Simplifiée */}
              <div className={`w-32 h-32 rounded-full border-8 flex items-center justify-center
                ${pred?.score > 0.8 ? 'border-red-100 text-red-600' : 'border-orange-100 text-orange-600'}`}>
                <div className="text-center">
                  <span className="text-3xl font-bold">{riskPercent}%</span>
                  <p className="text-xs text-slate-400 font-medium">Risque</p>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-slate-700">Facteurs Déterminants :</h3>
              {pred?.features_snapshot ? (
                Object.entries(pred.features_snapshot).map(([key, val]: any) => (
                  <div key={key} className="flex justify-between text-sm p-2 bg-slate-50 rounded">
                    <span className="text-slate-500 capitalize">{key.replace('_', ' ')}</span>
                    <span className="font-mono font-semibold text-slate-700">{val}</span>
                  </div>
                ))
              ) : (
                <p className="text-xs text-slate-400 italic">Aucun détail de feature disponible.</p>
              )}
            </div>
          </div>

          {/* Carte Configuration */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
            <h2 className="text-slate-500 text-sm font-bold uppercase mb-2">Métadonnées Modèle</h2>
            <div className="text-sm text-slate-600 space-y-1">
              <p>Version : <span className="font-mono text-slate-800 bg-slate-100 px-1 rounded">{pred?.model_version}</span></p>
              <p>Détecté le : {new Date(data.created_at).toLocaleString('fr-FR')}</p>
            </div>
          </div>
        </div>

        {/* --- COLONNE DROITE : Détails de la Transaction --- */}
        <div className="lg:col-span-2 bg-white p-8 rounded-xl shadow-sm border border-slate-100">
          
          <div className="flex justify-between items-start border-b border-slate-100 pb-6 mb-6">
            <div>
              <h1 className="text-2xl font-bold text-slate-800 mb-1">Transaction {tx?.id.slice(0,8)}...</h1>
              <span className={`px-3 py-1 rounded-full text-xs font-bold inline-block
                ${data.severity === 'CRITIQUE' ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'}`}>
                ALERTE {data.severity}
              </span>
            </div>
            <div className="text-right">
              <p className="text-3xl font-bold text-slate-800">
                {tx?.amount.toFixed(2)} <span className="text-lg text-slate-400">{tx?.currency}</span>
              </p>
            </div>
          </div>

          {/* Grille d'infos */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            
            {/* Bloc Marchand */}
            <div>
              <h3 className="text-slate-400 text-xs font-bold uppercase mb-4 flex items-center gap-2">
                <CreditCard size={14} /> Détails Marchand
              </h3>
              <div className="space-y-3">
                <InfoRow label="Enseigne" value={tx?.merchant_info?.name} />
                <InfoRow label="Catégorie" value={tx?.merchant_info?.category} />
                <InfoRow label="Date/Heure" value={new Date(tx?.created_at).toLocaleString()} />
              </div>
            </div>

            {/* Bloc Utilisateur & Device */}
            <div>
              <h3 className="text-slate-400 text-xs font-bold uppercase mb-4 flex items-center gap-2">
                <Smartphone size={14} /> Empreinte Numérique
              </h3>
              <div className="space-y-3">
                <InfoRow label="User ID" value={tx?.external_user_id} mono />
                <InfoRow label="Adresse IP" value={tx?.ip_address} mono icon={<MapPin size={12} />} />
                <InfoRow label="Device ID" value={tx?.device_id || 'Non identifié'} mono />
              </div>
            </div>

          </div>

          {/* Zone Analyste */}
          <div className="mt-8 pt-6 border-t border-slate-100">
            <h3 className="text-slate-800 font-semibold mb-3">Notes du Système</h3>
            <div className="bg-yellow-50 border border-yellow-100 p-4 rounded text-sm text-yellow-800">
              {data.analyst_notes || "Aucune note automatique."}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

// Petit composant pour afficher une ligne d'info proprement
function InfoRow({ label, value, mono, icon }: any) {
  return (
    <div className="flex justify-between items-center group">
      <span className="text-slate-500 text-sm">{label}</span>
      <span className={`text-slate-800 text-sm flex items-center gap-2 ${mono ? 'font-mono' : 'font-medium'}`}>
        {value} {icon && <span className="text-slate-400">{icon}</span>}
      </span>
    </div>
  );
}