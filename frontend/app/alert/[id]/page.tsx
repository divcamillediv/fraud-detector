"use client";

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import {
  ArrowLeft, ShieldAlert, CheckCircle, MapPin,
  CreditCard, Smartphone, Clock, Ban, Activity
} from 'lucide-react';
import Link from 'next/link';

// Country mapping for display
const countryFromIP = (ip: string): string => {
  const hash = ip.split('.').reduce((a, b) => a + parseInt(b), 0);
  const countries = ['FR', 'US', 'RU', 'CN', 'BR', 'DE', 'GB'];
  return countries[hash % countries.length];
};

export default function AlertDetail() {
  const { id } = useParams();
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [analystComment, setAnalystComment] = useState('');

  useEffect(() => {
    if (id) fetchAlertDetails();
  }, [id]);

  const fetchAlertDetails = async () => {
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
    setIsUpdating(true);

    try {
      const { error } = await supabase
        .from('alerts')
        .update({
          status: status,
          confirmed_fraud: status === 'RESOLU_FRAUDE',
          analyst_notes: analystComment || data.analyst_notes,
          updated_at: new Date()
        })
        .eq('id', id);

      if (error) throw error;

      router.refresh();
      router.push('/');

    } catch (e) {
      console.error("Erreur sauvegarde:", e);
      setIsUpdating(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0f172a] flex items-center justify-center">
        <div className="text-gray-400">Chargement du dossier...</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-[#0f172a] flex items-center justify-center">
        <div className="text-red-400">Alerte introuvable.</div>
      </div>
    );
  }

  const tx = data.transactions;
  const pred = data.fraud_predictions;
  const riskPercent = ((pred?.score || 0) * 100).toFixed(1);
  const country = tx?.ip_address ? countryFromIP(tx.ip_address) : 'N/A';

  const getRiskColor = (score: number) => {
    if (score > 0.7) return { border: 'border-red-500/30', text: 'text-red-400', bg: 'bg-red-900/20' };
    if (score > 0.4) return { border: 'border-orange-500/30', text: 'text-orange-400', bg: 'bg-orange-900/20' };
    return { border: 'border-green-500/30', text: 'text-green-400', bg: 'bg-green-900/20' };
  };

  const riskColors = getRiskColor(pred?.score || 0);

  return (
    <div className="min-h-screen bg-[#0f172a] p-8">
      {/* Header Navigation */}
      <div className="mb-8 flex items-center justify-between">
        <Link href="/" className="flex items-center text-gray-400 hover:text-gray-200 transition-colors">
          <ArrowLeft size={20} className="mr-2" /> Retour au Dashboard
        </Link>
        <div className="flex gap-3">
          <button
            onClick={() => handleResolution('FAUX_POSITIF')}
            disabled={isUpdating}
            className="px-4 py-2 bg-slate-800 border border-slate-600 text-gray-300 rounded-lg hover:bg-green-900/30 hover:text-green-400 hover:border-green-700 flex items-center gap-2 transition-all"
          >
            <CheckCircle size={18} /> Marquer Sûr
          </button>
          <button
            onClick={() => handleResolution('RESOLU_FRAUDE')}
            disabled={isUpdating}
            className={`px-4 py-2 text-white rounded-lg flex items-center gap-2 transition-all shadow-sm
              ${isUpdating ? 'bg-slate-600 cursor-wait' : 'bg-red-600 hover:bg-red-700'}`}
          >
            <Ban size={18} />
            {isUpdating ? 'Sauvegarde...' : 'Confirmer Fraude & Bloquer'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

        {/* Left Column: AI Analysis */}
        <div className="space-y-6">
          {/* Score Card */}
          <div className="card shadow-soft p-6">
            <h2 className="text-gray-500 text-sm font-bold uppercase mb-4 flex items-center gap-2">
              <Activity size={16} /> Analyse IA (XGBoost)
            </h2>

            <div className="flex items-center justify-center mb-6 relative">
              <div className={`w-32 h-32 rounded-full border-8 flex items-center justify-center ${riskColors.border} ${riskColors.bg}`}>
                <div className="text-center">
                  <span className={`text-3xl font-bold ${riskColors.text}`}>{riskPercent}%</span>
                  <p className="text-xs text-gray-500 font-medium">Risque</p>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-gray-300">Facteurs Déterminants :</h3>
              {pred?.features_snapshot ? (
                Object.entries(pred.features_snapshot).map(([key, val]: any) => (
                  <div key={key} className="flex justify-between text-sm p-2 bg-slate-800/50 rounded">
                    <span className="text-gray-500 capitalize">{key.replace('_', ' ')}</span>
                    <span className="font-mono font-semibold text-gray-300">{val}</span>
                  </div>
                ))
              ) : (
                <p className="text-xs text-gray-500 italic">Aucun détail de feature disponible.</p>
              )}
            </div>
          </div>

          {/* Model Metadata */}
          <div className="card shadow-soft p-6">
            <h2 className="text-gray-500 text-sm font-bold uppercase mb-2">Métadonnées Modèle</h2>
            <div className="text-sm text-gray-400 space-y-1">
              <p>Version : <span className="font-mono text-gray-300 bg-slate-800 px-1 rounded">{pred?.model_version || 'N/A'}</span></p>
              <p>Détecté le : {new Date(data.created_at).toLocaleString('fr-FR')}</p>
            </div>
          </div>
        </div>

        {/* Right Column: Transaction Details */}
        <div className="lg:col-span-2 card shadow-soft p-8">
          <div className="flex justify-between items-start border-b border-slate-700 pb-6 mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-100 mb-1">Transaction {tx?.id?.slice(0, 8)}...</h1>
              <span className={`px-3 py-1 rounded-full text-xs font-bold inline-block
                ${data.severity === 'CRITIQUE' ? 'bg-red-900/30 text-red-400 border border-red-700' : 'bg-orange-900/30 text-orange-400 border border-orange-700'}`}>
                ALERTE {data.severity}
              </span>
            </div>
            <div className="text-right">
              <p className="text-3xl font-bold text-gray-100">
                {tx?.amount?.toFixed(2)} <span className="text-lg text-gray-500">{tx?.currency || 'EUR'}</span>
              </p>
            </div>
          </div>

          {/* Info Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Merchant Info */}
            <div>
              <h3 className="text-gray-500 text-xs font-bold uppercase mb-4 flex items-center gap-2">
                <CreditCard size={14} /> Détails Marchand
              </h3>
              <div className="space-y-3">
                <InfoRow label="Enseigne" value={tx?.merchant_info?.name || 'N/A'} />
                <InfoRow label="Catégorie" value={tx?.merchant_info?.category || 'N/A'} />
                <InfoRow label="Date/Heure" value={tx?.created_at ? new Date(tx.created_at).toLocaleString('fr-FR') : 'N/A'} />
              </div>
            </div>

            {/* Digital Fingerprint */}
            <div>
              <h3 className="text-gray-500 text-xs font-bold uppercase mb-4 flex items-center gap-2">
                <Smartphone size={14} /> Empreinte Numérique
              </h3>
              <div className="space-y-3">
                <InfoRow label="User ID" value={tx?.external_user_id || 'N/A'} mono />
                <InfoRow label="Adresse IP" value={tx?.ip_address || 'N/A'} mono icon={<MapPin size={12} />} />
                <InfoRow label="Pays" value={country} />
                <InfoRow label="Device ID" value={tx?.device_id || 'Non identifié'} mono />
              </div>
            </div>
          </div>

          {/* Analyst Zone */}
          <div className="mt-8 pt-6 border-t border-slate-700">
            <h3 className="text-gray-200 font-semibold mb-3">Notes du Système</h3>
            <div className="bg-yellow-900/20 border border-yellow-800 p-4 rounded text-sm text-yellow-200">
              {data.analyst_notes || "Aucune note automatique."}
            </div>
          </div>

          {/* Analyst Comment */}
          <div className="mt-6">
            <label className="block text-gray-300 font-semibold mb-2">Commentaire Analyste</label>
            <textarea
              value={analystComment}
              onChange={(e) => setAnalystComment(e.target.value)}
              className="form-control w-full h-24 text-sm"
              placeholder="Ajouter une note (ex : contacter le client, vérifier la localisation...)"
            />
          </div>

          {/* Quick Actions */}
          <div className="mt-6 pt-6 border-t border-slate-700">
            <h3 className="text-gray-300 font-semibold mb-3">Qualifier l'alerte</h3>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => handleResolution('RESOLU_FRAUDE')}
                disabled={isUpdating}
                className="px-4 py-2 text-sm border border-red-700 text-red-400 rounded hover:bg-red-900/30 transition-colors"
              >
                Fraude confirmée
              </button>
              <button
                onClick={() => handleResolution('FAUX_POSITIF')}
                disabled={isUpdating}
                className="px-4 py-2 text-sm border border-slate-600 text-gray-400 rounded hover:bg-slate-800 transition-colors"
              >
                Fausse alerte
              </button>
              <button
                onClick={() => handleResolution('EN_COURS')}
                disabled={isUpdating}
                className="px-4 py-2 text-sm border border-yellow-700 text-yellow-400 rounded hover:bg-yellow-900/30 transition-colors"
              >
                En cours d'analyse
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value, mono, icon }: any) {
  return (
    <div className="flex justify-between items-center group">
      <span className="text-gray-500 text-sm">{label}</span>
      <span className={`text-gray-300 text-sm flex items-center gap-2 ${mono ? 'font-mono' : 'font-medium'}`}>
        {value} {icon && <span className="text-gray-500">{icon}</span>}
      </span>
    </div>
  );
}
