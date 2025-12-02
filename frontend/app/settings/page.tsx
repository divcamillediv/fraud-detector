"use client";

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { ArrowLeft, Save, Sliders, Shield, AlertTriangle, Info, Globe, Hash, RotateCcw } from 'lucide-react';
import Link from 'next/link';

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Detection thresholds
  const [highThreshold, setHighThreshold] = useState(0.70);
  const [mediumThreshold, setMediumThreshold] = useState(0.50);

  // Minimum amount for auto-alert
  const [minAmount, setMinAmount] = useState(100);

  // Sensitive countries
  const [sensitiveCountries, setSensitiveCountries] = useState<string[]>(['RU', 'CN']);
  const availableCountries = ['RU', 'CN', 'US', 'BR', 'NG', 'UA', 'IR'];

  // Consecutive anomalies before block
  const [maxAnomalies, setMaxAnomalies] = useState(3);

  // Auto-block mode
  const [autoBlock, setAutoBlock] = useState(true);

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    const { data, error } = await supabase.from('rules_config').select('*');

    if (data && !error) {
      data.forEach((rule: any) => {
        if (rule.key === 'fraud_threshold_high') setHighThreshold(parseFloat(rule.value));
        if (rule.key === 'fraud_threshold_medium') setMediumThreshold(parseFloat(rule.value));
        if (rule.key === 'auto_block_active') setAutoBlock(rule.value === true || rule.value === 'true');
        if (rule.key === 'min_amount_alert') setMinAmount(parseFloat(rule.value));
        if (rule.key === 'max_anomalies') setMaxAnomalies(parseInt(rule.value));
        if (rule.key === 'sensitive_countries') {
          try {
            setSensitiveCountries(JSON.parse(rule.value));
          } catch {
            setSensitiveCountries(['RU', 'CN']);
          }
        }
      });
    }
    setLoading(false);
  };

  const handleSave = async () => {
    setSaving(true);

    const updates = [
      { key: 'fraud_threshold_high', value: highThreshold.toString() },
      { key: 'fraud_threshold_medium', value: mediumThreshold.toString() },
      { key: 'auto_block_active', value: autoBlock.toString() },
      { key: 'min_amount_alert', value: minAmount.toString() },
      { key: 'max_anomalies', value: maxAnomalies.toString() },
      { key: 'sensitive_countries', value: JSON.stringify(sensitiveCountries) }
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

    setTimeout(() => setSaving(false), 800);
  };

  const handleReset = () => {
    setHighThreshold(0.70);
    setMediumThreshold(0.50);
    setMinAmount(100);
    setSensitiveCountries(['RU', 'CN']);
    setMaxAnomalies(3);
    setAutoBlock(true);
  };

  const toggleCountry = (country: string) => {
    if (sensitiveCountries.includes(country)) {
      setSensitiveCountries(sensitiveCountries.filter(c => c !== country));
    } else {
      setSensitiveCountries([...sensitiveCountries, country]);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0f172a] flex items-center justify-center">
        <div className="text-gray-400">Chargement de la configuration...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0f172a] p-8">
      {/* Header */}
      <div className="max-w-3xl mx-auto mb-8 flex items-center justify-between">
        <Link href="/" className="flex items-center text-gray-400 hover:text-gray-200 transition-colors">
          <ArrowLeft size={20} className="mr-2" /> Retour au Dashboard
        </Link>
        <h1 className="text-2xl font-bold text-gray-100 flex items-center gap-2">
          <Sliders className="text-blue-500" /> Configuration IA
        </h1>
      </div>

      <div className="max-w-3xl mx-auto space-y-6">
        {/* Detection Thresholds Card */}
        <div className="card shadow-soft overflow-hidden">
          <div className="p-6 border-b border-slate-700 bg-slate-800/30">
            <h2 className="font-semibold text-gray-200 flex items-center gap-2">
              <AlertTriangle size={18} className="text-orange-500" /> Seuils de Détection
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Ajustez la sensibilité de l'algorithme XGBoost. Un seuil plus bas détecte plus de fraudes mais augmente les faux positifs.
            </p>
          </div>

          <div className="p-8 space-y-10">
            {/* High Threshold Slider */}
            <div>
              <div className="flex justify-between mb-2">
                <label className="text-sm font-bold text-gray-300">Seuil de probabilité de fraude (score modèle)</label>
                <span className="text-sm font-mono font-bold text-red-400 bg-red-900/30 px-2 py-0.5 rounded">
                  Score &gt; {highThreshold.toFixed(2)}
                </span>
              </div>
              <input
                type="range"
                min="0.5"
                max="0.99"
                step="0.01"
                value={highThreshold}
                onChange={(e) => setHighThreshold(parseFloat(e.target.value))}
                className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-red-600"
              />
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>Tolérant (0.50)</span>
                <span>Strict (0.99)</span>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Au-dessus de ce seuil, une transaction est marquée comme suspecte.
              </p>
            </div>

            {/* Medium Threshold Slider */}
            <div>
              <div className="flex justify-between mb-2">
                <label className="text-sm font-bold text-gray-300">Seuil de Suspicion (Vérification)</label>
                <span className="text-sm font-mono font-bold text-orange-400 bg-orange-900/30 px-2 py-0.5 rounded">
                  Score &gt; {mediumThreshold.toFixed(2)}
                </span>
              </div>
              <input
                type="range"
                min="0.0"
                max="0.7"
                step="0.01"
                value={mediumThreshold}
                onChange={(e) => setMediumThreshold(parseFloat(e.target.value))}
                className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-orange-500"
              />
              <div className="p-3 mt-4 bg-blue-900/30 text-blue-300 text-xs rounded flex gap-2 items-start border border-blue-800">
                <Info size={14} className="mt-0.5 shrink-0" />
                <p>Les transactions ayant un score situé entre <strong>{mediumThreshold.toFixed(2)}</strong> et <strong>{highThreshold.toFixed(2)}</strong> déclencheront une alerte manuelle sans blocage immédiat.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Amount & Rules Card */}
        <div className="card shadow-soft overflow-hidden">
          <div className="p-6 border-b border-slate-700 bg-slate-800/30">
            <h2 className="font-semibold text-gray-200 flex items-center gap-2">
              <Hash size={18} className="text-blue-500" /> Règles Métier
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Configurez les seuils de montant et les règles de blocage automatique.
            </p>
          </div>

          <div className="p-6 space-y-6">
            {/* Minimum Amount */}
            <div>
              <label className="block text-sm font-bold text-gray-300 mb-2">
                Montant minimum pour alerte automatique
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={minAmount}
                  onChange={(e) => setMinAmount(parseFloat(e.target.value) || 0)}
                  className="form-control flex-1"
                />
                <span className="text-gray-400 px-3 py-2 bg-slate-800 rounded border border-slate-600">€</span>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                En-dessous de ce montant, seules les fraudes très probables déclenchent une alerte.
              </p>
            </div>

            {/* Consecutive Anomalies */}
            <div>
              <label className="block text-sm font-bold text-gray-300 mb-2">
                Nombre d'anomalies consécutives avant blocage simulé
              </label>
              <input
                type="number"
                value={maxAnomalies}
                onChange={(e) => setMaxAnomalies(parseInt(e.target.value) || 1)}
                min={1}
                max={10}
                className="form-control w-32"
              />
              <p className="text-xs text-gray-500 mt-2">
                Utilisé par l'agent Décisionnaire pour déclencher un blocage (sandbox).
              </p>
            </div>
          </div>
        </div>

        {/* Sensitive Countries Card */}
        <div className="card shadow-soft overflow-hidden">
          <div className="p-6 border-b border-slate-700 bg-slate-800/30">
            <h2 className="font-semibold text-gray-200 flex items-center gap-2">
              <Globe size={18} className="text-green-500" /> Pays Sensibles
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Les transactions vers ces pays augmentent le score de risque.
            </p>
          </div>

          <div className="p-6">
            <div className="flex flex-wrap gap-2">
              {availableCountries.map((country) => (
                <button
                  key={country}
                  onClick={() => toggleCountry(country)}
                  className={`px-4 py-2 rounded text-sm font-medium transition-all ${
                    sensitiveCountries.includes(country)
                      ? 'bg-red-900/40 text-red-300 border border-red-700'
                      : 'bg-slate-800 text-gray-400 border border-slate-600 hover:border-slate-500'
                  }`}
                >
                  {country}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-4">
              Cliquez pour sélectionner/désélectionner un pays.
            </p>
          </div>
        </div>

        {/* Auto-block Mode Card */}
        <div className="card shadow-soft p-6 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-gray-200 flex items-center gap-2">
              <Shield size={18} className="text-blue-500" /> Mode Semi-Automatique
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Si activé, le système proposera un blocage qui devra être validé par l'analyste.
            </p>
          </div>

          <button
            onClick={() => setAutoBlock(!autoBlock)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-slate-900 ${autoBlock ? 'bg-blue-600' : 'bg-slate-600'}`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${autoBlock ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
        </div>

        {/* Config Summary Card */}
        <div className="card shadow-soft p-6">
          <h2 className="text-lg font-semibold text-gray-200 mb-4">Résumé de la configuration</h2>
          <ul className="space-y-2 text-sm text-gray-400">
            <li>Score seuil critique : <span className="text-gray-200 font-medium">{highThreshold.toFixed(2)}</span></li>
            <li>Score seuil suspicion : <span className="text-gray-200 font-medium">{mediumThreshold.toFixed(2)}</span></li>
            <li>Montant minimum : <span className="text-gray-200 font-medium">{minAmount} €</span></li>
            <li>Blocage après : <span className="text-gray-200 font-medium">{maxAnomalies} anomalies</span> similaires</li>
            <li>Pays sensibles : <span className="text-gray-200 font-medium">{sensitiveCountries.join(', ') || 'Aucun'}</span></li>
            <li>Mode : <span className="text-gray-200 font-medium">{autoBlock ? 'Semi-automatique' : 'Manuel'}</span></li>
          </ul>
          <hr className="border-slate-700 my-4" />
          <p className="text-xs text-gray-500">
            Ces paramètres sont utilisés par le moteur de détection XGBoost et les agents IA décisionnaires.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end gap-3 pt-4">
          <button
            onClick={handleReset}
            className="flex items-center gap-2 px-4 py-2 text-sm text-gray-400 border border-slate-600 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <RotateCcw size={16} /> Réinitialiser
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className={`flex items-center gap-2 px-6 py-2 rounded-lg font-semibold text-white shadow-md transition-all
              ${saving ? 'bg-slate-600 cursor-wait' : 'btn-primary'}`}
          >
            <Save size={18} />
            {saving ? 'Sauvegarde...' : 'Enregistrer les paramètres'}
          </button>
        </div>
      </div>
    </div>
  );
}
