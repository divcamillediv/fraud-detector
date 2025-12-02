"use client";

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { ShieldAlert, CheckCircle, Activity, Ban, Search, Settings, Clock, TrendingUp, Download, X } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import Link from 'next/link';

// Types
type Alert = {
  id: string;
  created_at: string;
  status: string;
  severity: string;
  transaction_id: string;
  analyst_notes: string;
  transactions?: {
    id: string;
    amount: number;
    currency: string;
    external_user_id: string;
    merchant_info: { name: string; category: string };
    ip_address: string;
    created_at: string;
  };
  fraud_predictions?: {
    score: number;
    model_version: string;
  };
};

type Metrics = {
  alerts24h: number;
  fraudRate: number;
  inProgress: number;
  avgAnalysisTime: number;
  highRisk: number;
  mediumRisk: number;
  lowRisk: number;
};

type Filters = {
  riskLevel: string;
  sector: string;
  period: string;
};

// Country mapping for display
const countryFromIP = (ip: string): string => {
  // Simulated - in real app, use GeoIP
  const hash = ip.split('.').reduce((a, b) => a + parseInt(b), 0);
  const countries = ['FR', 'US', 'RU', 'CN', 'BR', 'DE', 'GB'];
  return countries[hash % countries.length];
};

// Risk level from score
const getRiskLevel = (score: number): { label: string; class: string } => {
  if (score >= 0.7) return { label: 'Élevé', class: 'risk-high' };
  if (score >= 0.4) return { label: 'Moyen', class: 'risk-medium' };
  return { label: 'Faible', class: 'risk-low' };
};

// Status badge
const getStatusBadge = (status: string) => {
  switch (status) {
    case 'NOUVEAU':
      return { label: 'NOUVELLE', class: 'badge-new' };
    case 'RESOLU_FRAUDE':
      return { label: 'FRAUDE CONFIRMÉE', class: 'badge-new' };
    case 'FAUX_POSITIF':
      return { label: 'FAUSSE ALERTE', class: 'badge-false' };
    default:
      return { label: 'EN COURS', class: 'badge-progress' };
  }
};

export default function Dashboard() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [metrics, setMetrics] = useState<Metrics>({
    alerts24h: 0,
    fraudRate: 0,
    inProgress: 0,
    avgAnalysisTime: 12,
    highRisk: 0,
    mediumRisk: 0,
    lowRisk: 0
  });
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'alerts' | 'history' | 'settings'>('alerts');
  const [filters, setFilters] = useState<Filters>({
    riskLevel: 'all',
    sector: 'all',
    period: '24h'
  });
  const [selectedAlert, setSelectedAlert] = useState<Alert | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [historyData, setHistoryData] = useState<Alert[]>([]);

  // Chart data
  const [chartData, setChartData] = useState([
    { name: '00h', frauds: 2 },
    { name: '03h', frauds: 5 },
    { name: '06h', frauds: 3 },
    { name: '09h', frauds: 9 },
    { name: '12h', frauds: 6 },
    { name: '15h', frauds: 7 },
    { name: '18h', frauds: 4 },
    { name: '21h', frauds: 8 },
  ]);

  useEffect(() => {
    fetchAlerts();
    fetchAllHistory();

    const channel = supabase
      .channel('realtime-alerts')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'alerts' }, (payload) => {
        if (payload.eventType === 'INSERT') {
          fetchAlerts(); // Refetch to get joined data
        } else if (payload.eventType === 'UPDATE') {
          const updatedAlert = payload.new as Alert;
          setAlerts((prev) => {
            const newList = prev.map(alert =>
              alert.id === updatedAlert.id ? { ...alert, ...updatedAlert } : alert
            );
            updateMetrics(newList);
            return newList;
          });
        }
      })
      .subscribe();

    const onFocus = () => fetchAlerts();
    window.addEventListener('focus', onFocus);

    return () => {
      supabase.removeChannel(channel);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  const fetchAllHistory = async () => {
  setLoading(true);
  
  // On part des transactions pour tout avoir (même ce qui n'est pas une alerte)
  const { data, error } = await supabase
    .from('transactions')
    .select(`
      *,
      fraud_predictions (score),
      alerts (id, status, severity)
    `)
    .order('created_at', { ascending: false })
    .limit(50); // Limite pour la performance

  if (error) {
    console.error("Erreur history", error);
  } else {
    setHistoryData(data); // Utilisez un state dédié ou le même que filteredAlerts
  }
  setLoading(false);
};

  const fetchAlerts = async () => {
    const { data, error } = await supabase
      .from('alerts')
      .select(`
        *,
        transactions (*),
        fraud_predictions (*)
      `)
      .order('created_at', { ascending: false })
      .limit(50);

    if (!error && data) {
      setAlerts(data);
      updateMetrics(data);
    }
    setLoading(false);
  };

  const updateMetrics = (currentAlerts: Alert[]) => {
    const now = new Date();
    const last24h = currentAlerts.filter(a => {
      const created = new Date(a.created_at);
      return (now.getTime() - created.getTime()) < 24 * 60 * 60 * 1000;
    });

    const highRisk = currentAlerts.filter(a => (a.fraud_predictions?.score || 0) >= 0.7).length;
    const mediumRisk = currentAlerts.filter(a => {
      const score = a.fraud_predictions?.score || 0;
      return score >= 0.4 && score < 0.7;
    }).length;
    const lowRisk = currentAlerts.filter(a => (a.fraud_predictions?.score || 0) < 0.4).length;
    const inProgress = currentAlerts.filter(a => a.status === 'NOUVEAU' || a.status === 'EN_COURS').length;
    const confirmed = currentAlerts.filter(a => a.status === 'RESOLU_FRAUDE').length;
    const fraudRate = currentAlerts.length > 0 ? (confirmed / currentAlerts.length) * 100 : 0;

    setMetrics({
      alerts24h: last24h.length,
      fraudRate: parseFloat(fraudRate.toFixed(1)),
      inProgress,
      avgAnalysisTime: 12,
      highRisk,
      mediumRisk,
      lowRisk
    });
  };

  const handleAction = async (id: string, action: 'BAN' | 'IGNORE') => {
    const newStatus = action === 'BAN' ? 'RESOLU_FRAUDE' : 'FAUX_POSITIF';

    const updatedList = alerts.map(a =>
      a.id === id ? { ...a, status: newStatus } : a
    );
    setAlerts(updatedList);
    updateMetrics(updatedList);

    await supabase
      .from('alerts')
      .update({
        status: newStatus,
        updated_at: new Date()
      })
      .eq('id', id);
  };

  const openAlertDetails = (alert: Alert) => {
    setSelectedAlert(alert);
    setShowModal(true);
  };

  const filteredAlerts = alerts.filter(alert => {
    const score = alert.fraud_predictions?.score || 0;

    // Risk level filter
    if (filters.riskLevel === 'high' && score < 0.7) return false;
    if (filters.riskLevel === 'medium_high' && score < 0.4) return false;
    if (filters.riskLevel === 'low' && score >= 0.4) return false;

    // Sector filter
    if (filters.sector !== 'all') {
      const category = alert.transactions?.merchant_info?.category?.toLowerCase() || '';
      if (filters.sector === 'banque' && !category.includes('bank')) return false;
      if (filters.sector === 'assurance' && !category.includes('insurance')) return false;
      if (filters.sector === 'ecommerce' && !category.includes('electronics') && !category.includes('retail')) return false;
    }

    return true;
  });

  // Donut chart data
  const riskDistribution = [
    { name: 'Élevé', value: metrics.highRisk, color: '#ef4444' },
    { name: 'Moyen', value: metrics.mediumRisk, color: '#f59e0b' },
    { name: 'Faible', value: metrics.lowRisk, color: '#22c55e' },
  ];

  return (
    <div className="min-h-screen bg-[#0f172a]">
      {/* Navbar */}
      <nav className="navbar px-4 py-3 border-b border-slate-800">
        <div className="flex justify-between items-center">
          <a className="navbar-brand text-gray-200 text-lg flex items-center gap-2" href="#">
            <ShieldAlert className="text-blue-500" size={24} />
            FraudGuard • Console IA
          </a>
          <div className="flex items-center gap-3">
            <span className="px-3 py-1 bg-green-900/30 text-green-400 rounded-full text-sm font-medium flex items-center gap-1 border border-green-800">
              <Activity size={14} /> Système Actif
            </span>
            <Link href="/settings" className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-full transition-colors" title="Configuration">
              <Settings size={20} />
            </Link>
          </div>
        </div>
      </nav>

      <div className="container mx-auto px-4 py-6">
        {/* Title */}
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-gray-100 mb-1">Tableau de bord de détection de fraudes</h1>
          <p className="text-gray-500">
            Visualisation en temps réel des transactions suspectes, des scores de risque et de la configuration du moteur de détection.
          </p>
        </div>

        {/* Tabs */}
        <div className="nav-tabs mb-6 pb-2">
          <button
            className={`nav-tab ${activeTab === 'alerts' ? 'active' : ''}`}
            onClick={() => setActiveTab('alerts')}
          >
            Alertes & transactions
          </button>
          <button
            className={`nav-tab ${activeTab === 'history' ? 'active' : ''}`}
            onClick={() => setActiveTab('history')}
          >
            Historique des transactions
          </button>
          <button
            className={`nav-tab ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => setActiveTab('settings')}
          >
            Paramètres de l'application
          </button>
        </div>

        {activeTab === 'alerts' && (
          <>
            {/* Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <div className="metric-card shadow-soft">
                <div className="text-3xl font-bold text-gray-100">{metrics.alerts24h}</div>
                <div className="text-sm text-gray-400">Alertes sur 24h</div>
              </div>
              <div className="metric-card shadow-soft">
                <div className="text-3xl font-bold text-gray-100">{metrics.fraudRate}%</div>
                <div className="text-sm text-gray-400">Taux de fraude estimé</div>
              </div>
              <div className="metric-card shadow-soft">
                <div className="text-3xl font-bold text-gray-100">{metrics.inProgress}</div>
                <div className="text-sm text-gray-400">Alertes en cours</div>
              </div>
              <div className="metric-card shadow-soft">
                <div className="text-3xl font-bold text-gray-100">{metrics.avgAnalysisTime} min</div>
                <div className="text-sm text-gray-400">Temps moyen d'analyse</div>
              </div>
            </div>

            {/* Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
              <div className="lg:col-span-2 card shadow-soft p-4">
                <h3 className="text-gray-200 font-semibold mb-4">Fraudes détectées sur 24h</h3>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(55,65,81,0.5)" />
                      <XAxis dataKey="name" tick={{ fill: '#9ca3af', fontSize: 12 }} />
                      <YAxis tick={{ fill: '#9ca3af', fontSize: 12 }} />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#020617', border: '1px solid #374151', borderRadius: '8px' }}
                        labelStyle={{ color: '#e5e7eb' }}
                      />
                      <Line
                        type="monotone"
                        dataKey="frauds"
                        stroke="#60a5fa"
                        strokeWidth={2}
                        fill="rgba(37,99,235,0.18)"
                        dot={{ fill: '#93c5fd', r: 3 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="card shadow-soft p-4">
                <h3 className="text-gray-200 font-semibold mb-4">Répartition des niveaux de risque</h3>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={riskDistribution}
                        cx="50%"
                        cy="50%"
                        innerRadius={40}
                        outerRadius={70}
                        paddingAngle={2}
                        dataKey="value"
                      >
                        {riskDistribution.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Legend
                        verticalAlign="bottom"
                        height={36}
                        formatter={(value) => <span className="text-gray-300 text-sm">{value}</span>}
                      />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#020617', border: '1px solid #374151', borderRadius: '8px' }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Table + Sidebar */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Alerts Table */}
              <div className="lg:col-span-2 card shadow-soft overflow-hidden">
                <div className="p-4 border-b border-slate-700 flex justify-between items-center">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-200">Transactions suspectes</h2>
                    <p className="text-sm text-gray-500">
                      Dernières alertes générées par le moteur XGBoost et les règles métier.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <span className="px-2 py-1 rounded text-xs font-medium risk-badge-high">
                      {metrics.highRisk} alertes élevées
                    </span>
                    <span className="px-2 py-1 rounded text-xs font-medium risk-badge-medium">
                      {metrics.inProgress} en cours
                    </span>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-800/50 text-xs uppercase text-gray-400">
                      <tr>
                        <th className="p-3">Date</th>
                        <th className="p-3">Client</th>
                        <th className="p-3">Montant</th>
                        <th className="p-3">Pays</th>
                        <th className="p-3">Score</th>
                        <th className="p-3">Risque</th>
                        <th className="p-3">Statut</th>
                        <th className="p-3"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700">
                      {loading ? (
                        <tr>
                          <td colSpan={8} className="p-8 text-center text-gray-500">
                            Chargement...
                          </td>
                        </tr>
                      ) : filteredAlerts.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="p-8 text-center text-gray-500">
                            Aucune alerte récente.
                          </td>
                        </tr>
                      ) : (
                        filteredAlerts.slice(0, 10).map((alert) => {
                          const score = alert.fraud_predictions?.score || 0;
                          const risk = getRiskLevel(score);
                          const status = getStatusBadge(alert.status);
                          const tx = alert.transactions;
                          const country = tx?.ip_address ? countryFromIP(tx.ip_address) : 'N/A';

                          return (
                            <tr key={alert.id} className="hover:bg-slate-800/30 transition-colors">
                              <td className="p-3 text-gray-300">
                                {new Date(alert.created_at).toLocaleString('fr-FR', {
                                  day: '2-digit',
                                  month: '2-digit',
                                  year: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}
                              </td>
                              <td className="p-3 text-gray-300 font-mono text-xs">
                                {tx?.external_user_id?.slice(0, 10) || 'N/A'}
                              </td>
                              <td className="p-3 text-gray-200 font-medium">
                                {tx?.amount?.toLocaleString('fr-FR', { style: 'currency', currency: tx?.currency || 'EUR' }) || 'N/A'}
                              </td>
                              <td className="p-3 text-gray-300">{country}</td>
                              <td className="p-3 text-gray-300">{score.toFixed(2)}</td>
                              <td className="p-3">
                                <span className={risk.class}>{risk.label}</span>
                              </td>
                              <td className="p-3">
                                <span className={`status-badge ${status.class}`}>
                                  {status.label}
                                </span>
                              </td>
                              <td className="p-3">
                                <button
                                  onClick={() => openAlertDetails(alert)}
                                  className="btn-outline-primary text-xs px-3 py-1"
                                >
                                  Voir détails
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="p-4 border-t border-slate-700 flex justify-end">
                  <button className="flex items-center gap-2 px-3 py-2 text-sm text-gray-400 border border-slate-600 rounded hover:bg-slate-800 transition-colors">
                    <Download size={16} /> Exporter les alertes
                  </button>
                </div>
              </div>

              {/* Sidebar */}
              <div className="space-y-4">
                {/* Summary */}
                <div className="card shadow-soft p-4">
                  <h3 className="text-lg font-semibold text-gray-200 mb-4">Vue synthétique</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-xs text-gray-500">Alertes (24h)</div>
                      <div className="text-xl font-semibold text-gray-200">{metrics.alerts24h}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500">Taux de fraude</div>
                      <div className="text-xl font-semibold text-gray-200">{metrics.fraudRate} %</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500">En cours</div>
                      <div className="text-xl font-semibold text-gray-200">{metrics.inProgress}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500">Temps moyen</div>
                      <div className="text-xl font-semibold text-gray-200">{metrics.avgAnalysisTime} min</div>
                    </div>
                  </div>
                </div>

                {/* Filters */}
                <div className="card shadow-soft p-4">
                  <h3 className="text-lg font-semibold text-gray-200 mb-4">Filtres rapides</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm text-gray-400 mb-1">Niveau de risque</label>
                      <select
                        className="form-select w-full text-sm"
                        value={filters.riskLevel}
                        onChange={(e) => setFilters({ ...filters, riskLevel: e.target.value })}
                      >
                        <option value="all">Tous</option>
                        <option value="high">Élevé uniquement</option>
                        <option value="medium_high">Moyen et élevé</option>
                        <option value="low">Faible uniquement</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm text-gray-400 mb-1">Secteur</label>
                      <select
                        className="form-select w-full text-sm"
                        value={filters.sector}
                        onChange={(e) => setFilters({ ...filters, sector: e.target.value })}
                      >
                        <option value="all">Tous</option>
                        <option value="banque">Banque</option>
                        <option value="assurance">Assurance</option>
                        <option value="ecommerce">E-commerce</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm text-gray-400 mb-1">Période</label>
                      <select
                        className="form-select w-full text-sm"
                        value={filters.period}
                        onChange={(e) => setFilters({ ...filters, period: e.target.value })}
                      >
                        <option value="24h">Dernières 24h</option>
                        <option value="7d">7 derniers jours</option>
                        <option value="30d">30 derniers jours</option>
                      </select>
                    </div>
                    <button
                      className="btn-primary w-full text-sm"
                      onClick={() => fetchAlerts()}
                    >
                      Appliquer les filtres
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {activeTab === 'history' && (
          <>
            {/* Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <div className="metric-card shadow-soft">
                <div className="text-3xl font-bold text-gray-100">{metrics.alerts24h}</div>
                <div className="text-sm text-gray-400">Alertes totales</div>
              </div>
              <div className="metric-card shadow-soft">
                <div className="text-3xl font-bold text-gray-100">{metrics.fraudRate}%</div>
                <div className="text-sm text-gray-400">Taux de fraude estimé</div>
              </div>
              <div className="metric-card shadow-soft">
                <div className="text-3xl font-bold text-gray-100">19 min 55s</div>
                <div className="text-sm text-gray-400">Temps moyen d'analyse</div>
              </div>
            </div>

            {/* Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
              <div className="lg:col-span-2 card shadow-soft p-4">
                <h3 className="text-gray-200 font-semibold mb-4">Fraudes détectées au total</h3>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(55,65,81,0.5)" />
                      <XAxis dataKey="name" tick={{ fill: '#9ca3af', fontSize: 12 }} />
                      <YAxis tick={{ fill: '#9ca3af', fontSize: 12 }} />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#020617', border: '1px solid #374151', borderRadius: '8px' }}
                        labelStyle={{ color: '#e5e7eb' }}
                      />
                      <Line
                        type="monotone"
                        dataKey="frauds"
                        stroke="#60a5fa"
                        strokeWidth={2}
                        fill="rgba(37,99,235,0.18)"
                        dot={{ fill: '#93c5fd', r: 3 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="card shadow-soft p-4">
                <h3 className="text-gray-200 font-semibold mb-4">Répartition des niveaux de risque</h3>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={riskDistribution}
                        cx="50%"
                        cy="50%"
                        innerRadius={40}
                        outerRadius={70}
                        paddingAngle={2}
                        dataKey="value"
                      >
                        {riskDistribution.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Legend
                        verticalAlign="bottom"
                        height={36}
                        formatter={(value) => <span className="text-gray-300 text-sm">{value}</span>}
                      />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#020617', border: '1px solid #374151', borderRadius: '8px' }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Table + Sidebar */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Alerts Table */}
              <div className="lg:col-span-2 card shadow-soft overflow-hidden">
                <div className="p-4 border-b border-slate-700 flex justify-between items-center">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-200">Toutes les transactions</h2>
                    <p className="text-sm text-gray-500">
                      Toutes les données générées par le moteur XGBoost et les règles métier.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <span className="px-2 py-1 rounded text-xs font-medium risk-badge-high">
                      {metrics.highRisk} alertes élevées
                    </span>
                    <span className="px-2 py-1 rounded text-xs font-medium risk-badge-medium">
                      {metrics.mediumRisk} alertes moyennes
                    </span>
                    <span className="px-2 py-1 rounded text-xs font-medium risk-badge-low">
                      {metrics.lowRisk} alertes faibles
                    </span>
                    <span className="px-2 py-1 rounded text-xs font-medium risk-badge-medium">
                      {metrics.inProgress} en cours
                    </span>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-800/50 text-xs uppercase text-gray-400">
                      <tr>
                        <th className="p-3">Date</th>
                        <th className="p-3">Client</th>
                        <th className="p-3">Montant</th>
                        <th className="p-3">Pays</th>
                        <th className="p-3">Score</th>
                        <th className="p-3">Risque</th>
                        <th className="p-3">Statut</th>
                        <th className="p-3"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700">
                      {loading ? (
                        <tr>
                          <td colSpan={8} className="p-8 text-center text-gray-500">
                            Chargement...
                          </td>
                        </tr>
                      ) : filteredAlerts.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="p-8 text-center text-gray-500">
                            Aucune alerte correspond aux filtres.
                          </td>
                        </tr>
                      ) : (
                        filteredAlerts.slice(0, 10).map((alert) => {
                          const score = alert.fraud_predictions?.score || 0;
                          const risk = getRiskLevel(score);
                          const status = getStatusBadge(alert.status);
                          const tx = alert.transactions;
                          const country = tx?.ip_address ? countryFromIP(tx.ip_address) : 'N/A';

                          return (
                            <tr key={alert.id} className="hover:bg-slate-800/30 transition-colors">
                              <td className="p-3 text-gray-300">
                                {new Date(alert.created_at).toLocaleString('fr-FR', {
                                  day: '2-digit',
                                  month: '2-digit',
                                  year: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}
                              </td>
                              <td className="p-3 text-gray-300 font-mono text-xs">
                                {tx?.external_user_id?.slice(0, 10) || 'N/A'}
                              </td>
                              <td className="p-3 text-gray-200 font-medium">
                                {tx?.amount?.toLocaleString('fr-FR', { style: 'currency', currency: tx?.currency || 'EUR' }) || 'N/A'}
                              </td>
                              <td className="p-3 text-gray-300">{country}</td>
                              <td className="p-3 text-gray-300">{score.toFixed(2)}</td>
                              <td className="p-3">
                                <span className={risk.class}>{risk.label}</span>
                              </td>
                              <td className="p-3">
                                <span className={`status-badge ${status.class}`}>
                                  {status.label}
                                </span>
                              </td>
                              <td className="p-3">
                                <button
                                  onClick={() => openAlertDetails(alert)}
                                  className="btn-outline-primary text-xs px-3 py-1"
                                >
                                  Voir détails
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="p-4 border-t border-slate-700 flex justify-end">
                  <button className="flex items-center gap-2 px-3 py-2 text-sm text-gray-400 border border-slate-600 rounded hover:bg-slate-800 transition-colors">
                    <Download size={16} /> Exporter les alertes
                  </button>
                </div>
              </div>

              {/* Sidebar */}
              <div className="space-y-4">
                {/* Summary */}
                <div className="card shadow-soft p-4">
                  <h3 className="text-lg font-semibold text-gray-200 mb-4">Vue synthétique</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-xs text-gray-500">Alertes (24h)</div>
                      <div className="text-xl font-semibold text-gray-200">{metrics.alerts24h}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500">Taux de fraude</div>
                      <div className="text-xl font-semibold text-gray-200">{metrics.fraudRate} %</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500">En cours</div>
                      <div className="text-xl font-semibold text-gray-200">{metrics.inProgress}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500">Temps moyen</div>
                      <div className="text-xl font-semibold text-gray-200">{metrics.avgAnalysisTime} min</div>
                    </div>
                  </div>
                </div>

                {/* Filters */}
                <div className="card shadow-soft p-4">
                  <h3 className="text-lg font-semibold text-gray-200 mb-4">Filtres rapides</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm text-gray-400 mb-1">Niveau de risque</label>
                      <select
                        className="form-select w-full text-sm"
                        value={filters.riskLevel}
                        onChange={(e) => setFilters({ ...filters, riskLevel: e.target.value })}
                      >
                        <option value="all">Tous</option>
                        <option value="high">Élevé uniquement</option>
                        <option value="medium_high">Moyen et élevé</option>
                        <option value="low">Faible uniquement</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm text-gray-400 mb-1">Secteur</label>
                      <select
                        className="form-select w-full text-sm"
                        value={filters.sector}
                        onChange={(e) => setFilters({ ...filters, sector: e.target.value })}
                      >
                        <option value="all">Tous</option>
                        <option value="banque">Banque</option>
                        <option value="assurance">Assurance</option>
                        <option value="ecommerce">E-commerce</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm text-gray-400 mb-1">Période</label>
                      <select
                        className="form-select w-full text-sm"
                        value={filters.period}
                        onChange={(e) => setFilters({ ...filters, period: e.target.value })}
                      >
                        <option value="24h">Dernières 24h</option>
                        <option value="7d">7 derniers jours</option>
                        <option value="30d">30 derniers jours</option>
                      </select>
                    </div>
                    <button
                      className="btn-primary w-full text-sm"
                      onClick={() => fetchAlerts()}
                    >
                      Appliquer les filtres
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {activeTab === 'settings' && (
          <div className="max-w-2xl">
            <div className="card shadow-soft p-6">
              <h2 className="text-lg font-semibold text-gray-200 mb-4">Paramètres de détection</h2>
              <p className="text-sm text-gray-500 mb-6">
                Configurez les seuils et règles du moteur de détection.
              </p>
              <Link href="/settings" className="btn-primary inline-block">
                Accéder aux paramètres complets
              </Link>
            </div>
          </div>
        )}
      </div>

      {/* Alert Details Modal */}
      {showModal && selectedAlert && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="modal-content w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-4 border-b border-slate-700 flex justify-between items-center">
              <h2 className="text-lg font-semibold text-gray-200">Détails de l'alerte</h2>
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-400 hover:text-gray-200"
              >
                <X size={24} />
              </button>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-2 gap-6 mb-6">
                <div>
                  <p className="text-sm text-gray-500 mb-1">ID alerte</p>
                  <p className="text-gray-200 font-mono">{selectedAlert.id.slice(0, 16)}...</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500 mb-1">Client</p>
                  <p className="text-gray-200">{selectedAlert.transactions?.external_user_id || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500 mb-1">Montant</p>
                  <p className="text-gray-200">
                    {selectedAlert.transactions?.amount?.toLocaleString('fr-FR', {
                      style: 'currency',
                      currency: selectedAlert.transactions?.currency || 'EUR'
                    }) || 'N/A'}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500 mb-1">Pays</p>
                  <p className="text-gray-200">
                    {selectedAlert.transactions?.ip_address ? countryFromIP(selectedAlert.transactions.ip_address) : 'N/A'}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500 mb-1">Score modèle</p>
                  <p className="text-gray-200">{(selectedAlert.fraud_predictions?.score || 0).toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500 mb-1">Niveau de risque</p>
                  <p className={getRiskLevel(selectedAlert.fraud_predictions?.score || 0).class}>
                    {getRiskLevel(selectedAlert.fraud_predictions?.score || 0).label}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500 mb-1">Statut</p>
                  <span className={`status-badge ${getStatusBadge(selectedAlert.status).class}`}>
                    {getStatusBadge(selectedAlert.status).label}
                  </span>
                </div>
                <div>
                  <p className="text-sm text-gray-500 mb-1">Canal</p>
                  <p className="text-gray-200">
                    {selectedAlert.transactions?.merchant_info?.category || 'N/A'}
                  </p>
                </div>
              </div>

              <hr className="border-slate-700 my-4" />

              <div className="mb-6">
                <p className="text-sm text-gray-500 mb-2">Analyse automatique</p>
                <p className="text-gray-300 text-sm">
                  {selectedAlert.analyst_notes || 'Aucune note automatique disponible.'}
                </p>
              </div>

              <hr className="border-slate-700 my-4" />

              <div className="mb-6">
                <p className="text-sm text-gray-500 mb-2">Qualifier l'alerte</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => {
                      handleAction(selectedAlert.id, 'BAN');
                      setShowModal(false);
                    }}
                    className="px-4 py-2 text-sm border border-red-600 text-red-400 rounded hover:bg-red-900/30 transition-colors"
                  >
                    Fraude confirmée
                  </button>
                  <button
                    onClick={() => {
                      handleAction(selectedAlert.id, 'IGNORE');
                      setShowModal(false);
                    }}
                    className="px-4 py-2 text-sm border border-slate-600 text-gray-400 rounded hover:bg-slate-800 transition-colors"
                  >
                    Fausse alerte
                  </button>
                  <button
                    className="px-4 py-2 text-sm border border-yellow-600 text-yellow-400 rounded hover:bg-yellow-900/30 transition-colors"
                  >
                    En cours d'analyse
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm text-gray-500 mb-2">Commentaire analyste</label>
                <textarea
                  className="form-control w-full h-24 text-sm"
                  placeholder="Ajouter une note (ex : contacter le client, vérifier la localisation...)"
                />
              </div>
            </div>

            <div className="p-4 border-t border-slate-700 flex justify-between items-center">
              <p className="text-xs text-gray-500">
                Plateforme IA multi-agents de détection de fraudes.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-sm border border-slate-600 text-gray-400 rounded hover:bg-slate-800 transition-colors"
                >
                  Fermer
                </button>
                <button className="btn-primary text-sm">
                  Enregistrer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
