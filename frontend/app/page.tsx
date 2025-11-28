"use client";

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { ShieldAlert, CheckCircle, Activity, Ban, Search } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Settings } from 'lucide-react'; // Ajoutez l'import
import Link from 'next/link'; // Ajoutez l'import

// Types basés sur votre DB
type Alert = {
  id: string;
  created_at: string;
  status: string;
  severity: string;
  transaction_id: string;
  analyst_notes: string;
};

export default function Dashboard() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [stats, setStats] = useState({ total: 0, critical: 0, blocked: 0 });
  const [loading, setLoading] = useState(true);

  // --- 1. CHARGEMENT INITIAL & REALTIME ---
  // Dans app/page.tsx

useEffect(() => {
  fetchAlerts();

  const channel = supabase
    .channel('realtime-alerts')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'alerts' }, (payload) => {
      
      if (payload.eventType === 'INSERT') {
        const newAlert = payload.new as Alert;
        setAlerts((prev) => {
          const newList = [newAlert, ...prev];
          updateStats(newList); // <--- Recalcul des stats ici
          return newList;
        });
      } 
      else if (payload.eventType === 'UPDATE') {
        const updatedAlert = payload.new as Alert;
        setAlerts((prev) => {
          const newList = prev.map(alert => 
            alert.id === updatedAlert.id ? updatedAlert : alert
          );
          updateStats(newList); // <--- ET recalcul des stats ici aussi !
          return newList;
        });
      }
    })
    .subscribe();

  const onFocus = () => {
    console.log("Retour sur le dashboard -> Refresh des données");
    fetchAlerts();
  };

  window.addEventListener('focus', onFocus);

  return () => {
    supabase.removeChannel(channel);
    window.removeEventListener('focus', onFocus); // Nettoyage
  };
}, []);

  // --- 2. RECUPERATION DES DONNÉES ---
  const fetchAlerts = async () => {
    const { data, error } = await supabase
      .from('alerts')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20); // On prend les 20 dernières

    if (!error && data) {
      setAlerts(data);
      updateStats(data);
    }
    setLoading(false);
  };

  const updateStats = (currentAlerts: Alert[]) => {
    const critical = currentAlerts.filter(a => a.severity === 'CRITIQUE').length;
    const blocked = currentAlerts.filter(a => a.status === 'RESOLU_FRAUDE').length; // Simplification
    setStats({
      total: currentAlerts.length,
      critical,
      blocked
    });
  };

  // --- 3. GESTION DES ACTIONS ---
  const handleAction = async (id: string, action: 'BAN' | 'IGNORE') => {
    const newStatus = action === 'BAN' ? 'RESOLU_FRAUDE' : 'FAUX_POSITIF';

    // 1. On calcule la NOUVELLE liste complète d'abord
    // On utilise 'alerts' (l'état actuel) pour créer la nouvelle version
    const updatedList = alerts.map(a => 
      a.id === id ? { ...a, status: newStatus } : a
    );

    // 2. On met à jour l'affichage du tableau
    setAlerts(updatedList);

    // 3. IMPORTANT : On force le recalcul des stats avec la NOUVELLE liste
    updateStats(updatedList); 

    // 4. Ensuite seulement, on envoie à la BDD (en arrière-plan)
    await supabase
      .from('alerts')
      .update({ 
        status: newStatus,
        updated_at: new Date() 
      })
      .eq('id', id);
  };

  
  // Données factices pour le graphique (à remplacer par une vraie query plus tard)
  const chartData = [
    { name: '10:00', risk: 12 }, { name: '11:00', risk: 19 },
    { name: '12:00', risk: 3 }, { name: '13:00', risk: 5 },
    { name: '14:00', risk: 25 }, { name: '15:00', risk: 8 },
  ];

  return (
    <div className="min-h-screen bg-slate-50 p-8 font-sans">
      {/* Header */}
      <header className="mb-8 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-slate-800 flex items-center gap-2">
            <ShieldAlert className="text-blue-600" /> FraudGuard AI
          </h1>
          <p className="text-slate-500">Supervision temps réel des flux transactionnels</p>
        </div>
        <div className="flex gap-2">
          <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-medium flex items-center gap-1">
            <Activity size={14} /> Système Actif
          </span>
        </div>
        <div className="flex gap-2 items-center">
          {/* Lien vers les settings */}
          <Link href="/settings" className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-full transition-colors" title="Configuration">
            <Settings size={20} />
          </Link>
        </div>
      </header>
  
  

      {/* KPIs Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <Card title="Alertes Récentes" value={stats.total} icon={<Search className="text-blue-500" />} color="bg-white" />
        <Card title="Risques Critiques" value={stats.critical} icon={<ShieldAlert className="text-red-500" />} color="bg-red-50 border-red-100" />
        <Card title="Bloqués Auto" value={stats.blocked} icon={<Ban className="text-orange-500" />} color="bg-white" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Section Gauche : Flux d'Alertes */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="p-6 border-b border-slate-100 flex justify-between items-center">
            <h2 className="text-lg font-semibold text-slate-800">Flux d'Alertes (Live)</h2>
            {loading && <span className="text-sm text-slate-400 animate-pulse">Connexion...</span>}
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="bg-slate-50 text-xs uppercase font-semibold text-slate-500">
                <tr>
                  <th className="p-4">Sévérité</th>
                  <th className="p-4">Transaction ID</th>
                  <th className="p-4">Statut</th>
                  <th className="p-4">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                
                {alerts.map((alert) => (
                  <tr key={alert.id} className="hover:bg-slate-50 transition-colors">
                    <td className="p-4">
                      <span className={`px-2 py-1 rounded text-xs font-bold 
                        ${alert.severity === 'CRITIQUE' ? 'bg-red-100 text-red-700' : 
                          alert.severity === 'MOYENNE' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'}`}>
                        {alert.severity}
                      </span>
                    </td>
                    <td className="p-4 font-mono text-xs text-blue-600 hover:underline cursor-pointer">
                      <Link href={`/alert/${alert.id}`}>
                        {alert.transaction_id.slice(0, 8)}...
                      </Link>
                    </td>
                    <td className="p-4">{alert.status}</td>
                    <td className="p-4 flex gap-2">
                      <button onClick={() => handleAction(alert.id, 'BAN')} className="p-1 hover:bg-red-100 text-red-600 rounded" title="Confirmer Fraude">
                        <Ban size={16} />
                      </button>
                      <button onClick={() => handleAction(alert.id, 'IGNORE')} className="p-1 hover:bg-green-100 text-green-600 rounded" title="Marquer Sûr">
                        <CheckCircle size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {alerts.length === 0 && !loading && (
              <div className="p-8 text-center text-slate-400">Aucune alerte récente.</div>
            )}
          </div>
        </div>

        {/* Section Droite : Stats Graphiques */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6">
          <h2 className="text-lg font-semibold text-slate-800 mb-6">Tendance Risque</h2>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis dataKey="name" fontSize={12} />
                <YAxis fontSize={12} />
                <Tooltip />
                <Line type="monotone" dataKey="risk" stroke="#ef4444" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-100">
            <h3 className="text-sm font-bold text-blue-800 mb-1">Note de l'IA</h3>
            <p className="text-xs text-blue-600">
              Le modèle XGBoost détecte une hausse de 15% des fraudes de type "Electronics" depuis 14h00.
            </p>
          </div>
        </div>

      </div>
    </div>
  );
}

// Petit composant pour les cartes KPI
function Card({ title, value, icon, color }: any) {
  return (
    <div className={`${color} p-6 rounded-xl shadow-sm border border-slate-100 flex items-center justify-between`}>
      <div>
        <p className="text-slate-500 text-sm font-medium mb-1">{title}</p>
        <h3 className="text-2xl font-bold text-slate-800">{value}</h3>
      </div>
      <div className="p-3 bg-white rounded-full shadow-sm">{icon}</div>
    </div>
  );
}