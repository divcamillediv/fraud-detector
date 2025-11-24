"use client";

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { ArrowLeft, Save, Sliders, Shield, AlertTriangle, Info } from 'lucide-react';
import Link from 'next/link';

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // État local pour les seuils
  const [highThreshold, setHighThreshold] = useState(0.85);
  const [mediumThreshold, setMediumThreshold] = useState(0.50);
  const [autoBlock, setAutoBlock] = useState(true);

  // Chargement initial
  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    const { data, error } = await supabase.from('rules_config').select('*');
    
    if (data && !error) {
      // Mapping des données DB vers le State React
      data.forEach((rule: any) => {
        if (rule.key === 'fraud_threshold_high') setHighThreshold(parseFloat(rule.value));
        if (rule.key === 'fraud_threshold_medium') setMediumThreshold(parseFloat(rule.value));
        if (rule.key === 'auto_block_active') setAutoBlock(rule.value);
      });
    }
    setLoading(false);
  };

  const handleSave = async () => {
    setSaving(true);
    
    // Mise à jour en masse
    const updates = [
      { key: 'fraud_threshold_high', value: highThreshold },
      { key: 'fraud_threshold_medium', value: mediumThreshold },
      { key: 'auto_block_active', value: autoBlock }
    ];

    for (const update of updates) {
      await supabase
        .from('rules_config')
        .upsert({ 
          key: update.key, 
          value: update.value, 
          updated_at: new Date() 
        });
    }

    setTimeout(() => setSaving(false), 800); // Petit délai pour l'UX
  };

  if (loading) return <div className="p-10 text-center text-slate-500">Chargement de la configuration...</div>;

  return (
    <div className="min-h-screen bg-slate-50 p-8 font-sans">
      
      {/* Header */}
      <div className="max-w-3xl mx-auto mb-8 flex items-center justify-between">
        <Link href="/" className="flex items-center text-slate-500 hover:text-slate-800 transition-colors">
          <ArrowLeft size={20} className="mr-2" /> Retour au Dashboard
        </Link>
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <Sliders className="text-blue-600" /> Configuration IA
        </h1>
      </div>

      <div className="max-w-3xl mx-auto space-y-6">
        
        {/* Carte : Sensibilité du Modèle */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="p-6 border-b border-slate-50 bg-slate-50/50">
            <h2 className="font-semibold text-slate-800 flex items-center gap-2">
              <AlertTriangle size={18} className="text-orange-500" /> Seuils de Détection
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              Ajustez la sensibilité de l'algorithme XGBoost. Un seuil plus bas détecte plus de fraudes mais augmente les faux positifs.
            </p>
          </div>

          <div className="p-8 space-y-10">
            
            {/* Slider Haute Sévérité */}
            <div>
              <div className="flex justify-between mb-2">
                <label className="text-sm font-bold text-slate-700">Seuil Critique (Blocage)</label>
                <span className="text-sm font-mono font-bold text-red-600 bg-red-50 px-2 rounded">
                  Score &gt; {highThreshold}
                </span>
              </div>
              <input 
                type="range" min="0.0" max="1.0" step="0.01"
                value={highThreshold}
                onChange={(e) => setHighThreshold(parseFloat(e.target.value))}
                className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-red-600"
              />
              <div className="flex justify-between text-xs text-slate-400 mt-1">
                <span>Tolérant (0.0)</span>
                <span>Strict (1.0)</span>
              </div>
            </div>

            {/* Slider Moyenne Sévérité */}
            <div>
              <div className="flex justify-between mb-2">
                <label className="text-sm font-bold text-slate-700">Seuil de Suspicion (Vérification)</label>
                <span className="text-sm font-mono font-bold text-orange-600 bg-orange-50 px-2 rounded">
                  Score &gt; {mediumThreshold}
                </span>
              </div>
              <input 
                type="range" min="0.0" max="1.0" step="0.01"
                value={mediumThreshold}
                onChange={(e) => setMediumThreshold(parseFloat(e.target.value))}
                className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-orange-500"
              />
              <div className="p-3 mt-4 bg-blue-50 text-blue-800 text-xs rounded flex gap-2 items-start">
                <Info size={14} className="mt-0.5 shrink-0" />
                <p>Les transactions ayant un score situé entre <strong>{mediumThreshold}</strong> et <strong>{highThreshold}</strong> déclencheront une alerte manuelle sans blocage immédiat.</p>
              </div>
            </div>

          </div>
        </div>

        {/* Carte : Actions Automatiques */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-slate-800 flex items-center gap-2">
              <Shield size={18} className="text-blue-600" /> Blocage Automatique
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              Si activé, le système bloquera instantanément les transactions dépassant le seuil critique.
            </p>
          </div>
          
          <button 
            onClick={() => setAutoBlock(!autoBlock)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${autoBlock ? 'bg-blue-600' : 'bg-slate-200'}`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${autoBlock ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
        </div>

        {/* Bouton Sauvegarder */}
        <div className="flex justify-end pt-4">
          <button 
            onClick={handleSave}
            disabled={saving}
            className={`flex items-center gap-2 px-6 py-3 rounded-lg font-semibold text-white shadow-md transition-all
              ${saving ? 'bg-slate-400 cursor-wait' : 'bg-slate-800 hover:bg-slate-900 hover:shadow-lg'}`}
          >
            <Save size={18} />
            {saving ? 'Sauvegarde...' : 'Appliquer la Configuration'}
          </button>
        </div>

      </div>
    </div>
  );
}