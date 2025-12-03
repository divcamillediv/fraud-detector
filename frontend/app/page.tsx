"use client";

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { ShieldAlert, Activity, Download, X } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';

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

// Type for transaction history (from full_history_view - flattened structure)
type TransactionHistory = {
  transaction_id: string;
  created_at: string;
  amount: number;
  currency: string;
  external_user_id: string;
  merchant_info: { name: string; category: string };
  ip_address: string;
  // Flattened from fraud_predictions
  score: number | null;
  // Flattened from alerts
  alert_id: string | null;
  alert_status: string | null;
  alert_severity: string | null;
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
    avgAnalysisTime: 1.44,
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
  const [historyData, setHistoryData] = useState<TransactionHistory[]>([]);
  const [analystComment, setAnalystComment] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Settings state
  const [highThreshold, setHighThreshold] = useState(0.70);
  const [mediumThreshold, setMediumThreshold] = useState(0.50);
  const [minAmount, setMinAmount] = useState(100);
  const [sensitiveCountries, setSensitiveCountries] = useState<string[]>(['RU', 'CN']);
  const [maxAnomalies, setMaxAnomalies] = useState(3);
  const [autoBlock, setAutoBlock] = useState(true);
  const [savingConfig, setSavingConfig] = useState(false);
  const [configLoaded, setConfigLoaded] = useState(false);
  const [historyLimit, setHistoryLimit] = useState(50);

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
    fetchConfig();

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

    // On prépare la requête de base
    let query = supabase
      .from('full_history_view')
      .select('*')
      .order('created_at', { ascending: false });

    // Si historyLimit est défini (donc pas "toutes"), on applique la limite
    // Astuce : Si vous voulez "Toutes", vous pouvez passer 10000 ou gérer un cas null
    if (historyLimit > 0) {
      query = query.limit(historyLimit);
    }

    const { data, error } = await query; // On exécute la requête construite

    if (error) {
      console.error("Erreur history", error);
    } else {
      setHistoryData(data || []);
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
      avgAnalysisTime: metrics.avgAnalysisTime,
      highRisk,
      mediumRisk,
      lowRisk
    });
  };

  const handleAction = async (id: string, action: 'BAN' | 'IGNORE' | 'IN_PROGRESS', notes?: string) => {
    let newStatus: string;
    switch (action) {
      case 'BAN':
        newStatus = 'RESOLU_FRAUDE';
        break;
      case 'IGNORE':
        newStatus = 'FAUX_POSITIF';
        break;
      case 'IN_PROGRESS':
        newStatus = 'EN_COURS';
        break;
      default:
        newStatus = 'EN_COURS';
    }

    setIsSaving(true);

    // Update local state
    const updatedList = alerts.map(a =>
      a.id === id ? { ...a, status: newStatus, analyst_notes: notes || a.analyst_notes } : a
    );
    setAlerts(updatedList);
    updateMetrics(updatedList);

    // Update selected alert if it's the one being modified
    if (selectedAlert && selectedAlert.id === id) {
      setSelectedAlert({ ...selectedAlert, status: newStatus, analyst_notes: notes || selectedAlert.analyst_notes });
    }

    // Save to database
    const updateData: Record<string, unknown> = {
      status: newStatus,
      confirmed_fraud: action === 'BAN',
      updated_at: new Date().toISOString()
    };

    if (notes !== undefined) {
      updateData.analyst_notes = notes;
    }

    const { error } = await supabase
      .from('alerts')
      .update(updateData)
      .eq('id', id);

    if (error) {
      console.error('Erreur lors de la sauvegarde:', error);
    }

    setIsSaving(false);
  };

  const handleSaveComment = async () => {
    if (!selectedAlert) return;

    setIsSaving(true);

    // Update local state
    const updatedList = alerts.map(a =>
      a.id === selectedAlert.id ? { ...a, analyst_notes: analystComment } : a
    );
    setAlerts(updatedList);
    setSelectedAlert({ ...selectedAlert, analyst_notes: analystComment });

    // Save to database
    const { error } = await supabase
      .from('alerts')
      .update({
        analyst_notes: analystComment,
        updated_at: new Date().toISOString()
      })
      .eq('id', selectedAlert.id);

    if (error) {
      console.error('Erreur lors de la sauvegarde du commentaire:', error);
    }

    setIsSaving(false);
    setShowModal(false);
  };

  const openAlertDetails = (alert: Alert) => {
    setSelectedAlert(alert);
    setAnalystComment(alert.analyst_notes || '');
    setShowModal(true);
  };

  // Fetch config from database
  const fetchConfig = async () => {
    try {
      const { data, error } = await supabase
        .from('rules_config')
        .select('key, value');

      if (error) {
        console.error('Erreur chargement config:', error);
        return;
      }

      if (data) {
        for (const row of data) {
          const { key, value } = row;
          switch (key) {
            case 'fraud_threshold_high':
              setHighThreshold(parseFloat(value));
              break;
            case 'fraud_threshold_medium':
              setMediumThreshold(parseFloat(value));
              break;
            case 'min_amount_alert':
              setMinAmount(parseFloat(value));
              break;
            case 'sensitive_countries':
              try {
                setSensitiveCountries(JSON.parse(value));
              } catch {
                setSensitiveCountries(value.split(',').map((s: string) => s.trim()));
              }
              break;
            case 'max_anomalies':
              setMaxAnomalies(parseInt(value));
              break;
            case 'auto_block_active':
              setAutoBlock(value === 'true' || value === 'True');
              break;
          }
        }
        setConfigLoaded(true);
      }
    } catch (err) {
      console.error('Erreur fetchConfig:', err);
    }
  };

  // Save config to database
  const handleSaveConfig = async () => {
    setSavingConfig(true);

    const configItems = [
      { key: 'fraud_threshold_high', value: highThreshold.toString() },
      { key: 'fraud_threshold_medium', value: mediumThreshold.toString() },
      { key: 'min_amount_alert', value: minAmount.toString() },
      { key: 'sensitive_countries', value: JSON.stringify(sensitiveCountries) },
      { key: 'max_anomalies', value: maxAnomalies.toString() },
      { key: 'auto_block_active', value: autoBlock.toString() }
    ];

    try {
      for (const item of configItems) {
        const { error } = await supabase
          .from('rules_config')
          .upsert(
            { key: item.key, value: item.value, updated_at: new Date().toISOString() },
            { onConflict: 'key' }
          );

        if (error) {
          console.error(`Erreur sauvegarde ${item.key}:`, error);
        }
      }
    } catch (err) {
      console.error('Erreur handleSaveConfig:', err);
    }

    setSavingConfig(false);
  };

  // Toggle country in sensitive list
  const toggleCountry = (country: string) => {
    if (sensitiveCountries.includes(country)) {
      setSensitiveCountries(sensitiveCountries.filter(c => c !== country));
    } else {
      setSensitiveCountries([...sensitiveCountries, country]);
    }
  };

  const filteredAlerts = alerts.filter(alert => {
    const score = alert.fraud_predictions?.score || 0;

    // Risk level filter
    if (filters.riskLevel === 'high' && score < 0.7) return false;
    if (filters.riskLevel === 'medium_high' && score < 0.4) return false;
    if (filters.riskLevel === 'low' && score >= 0.4) return false;

    // Sector filter
    if (filters.sector !== 'all') {
      const category = (alert.transactions?.merchant_info?.category || '').toLowerCase();
      
      if (filters.sector === 'banque') {
        // Mappage : Les services financiers, crypto et jeux d'argent concernent souvent la banque
        const bankKeywords = ['gambling', 'services', 'crypto', 'bank', 'finance'];
        if (!bankKeywords.some(kw => category.includes(kw))) return false;
      }
      
      if (filters.sector === 'assurance') {
        // Mappage : Voyages et transports concernent l'assurance
        const insuranceKeywords = ['travel', 'transport', 'health', 'insurance'];
        if (!insuranceKeywords.some(kw => category.includes(kw))) return false;
      }
      
      if (filters.sector === 'ecommerce') {
        // Mappage : Tous les biens de consommation
        const ecomKeywords = ['electronics', 'jewelry', 'food', 'books', 'clothing', 'retail'];
        if (!ecomKeywords.some(kw => category.includes(kw))) return false;
      }
    }

    return true;
  });

  // Donut chart data for alerts tab
  const riskDistribution = [
    { name: 'Élevé', value: metrics.highRisk, color: '#ef4444' },
    { name: 'Moyen', value: metrics.mediumRisk, color: '#f59e0b' },
    { name: 'Faible', value: metrics.lowRisk, color: '#22c55e' },
  ];

  // Donut chart data for history tab (based on historyData - flattened view)
  const historyRiskDistribution = (() => {
    const highRisk = historyData.filter(tx => (tx.score || 0) >= 0.7).length;
    const mediumRisk = historyData.filter(tx => {
      const score = tx.score || 0;
      return score >= 0.4 && score < 0.7;
    }).length;
    const lowRisk = historyData.filter(tx => (tx.score || 0) < 0.4).length;

    return [
      { name: 'Élevé', value: highRisk, color: '#ef4444' },
      { name: 'Moyen', value: mediumRisk, color: '#f59e0b' },
      { name: 'Faible', value: lowRisk, color: '#22c55e' },
    ];
  })();

  // Fonction générique pour convertir et télécharger en CSV
  const exportToCSV = (data: any[], filenamePrefix: string) => {
    if (!data || data.length === 0) {
      alert("Aucune donnée à exporter.");
      return;
    }

    // 1. Définition des colonnes (En-têtes)
    const headers = [
      "ID",
      "Date",
      "Utilisateur",
      "Montant",
      "Devise",
      "Marchand",
      "Catégorie",
      "Pays (IP)",
      "Score IA",
      "Statut",
      "Severité"
    ];

    // 2. Transformation des données pour le CSV
    const csvRows = data.map(item => {
      // Gestion de la structure différente entre 'Alert' et 'TransactionHistory'
      // Si c'est une Alerte, la transaction est dans item.transactions
      // Si c'est l'Historique, item EST la transaction
      const isAlert = 'transactions' in item;
      
      const tx = isAlert ? item.transactions : item;
      const pred = isAlert ? item.fraud_predictions : { score: item.score };
      const alertInfo = isAlert ? item : { status: item.alert_status, severity: item.alert_severity };
      
      // Fonction utilitaire pour nettoyer les champs (échapper les guillemets)
      const clean = (val: any) => `"${String(val || '').replace(/"/g, '""')}"`;

      return [
        clean(tx?.transaction_id),
        clean(new Date(item.created_at).toLocaleString('fr-FR')),
        clean(tx?.external_user_id),
        clean(tx?.amount),
        clean(tx?.currency || 'EUR'),
        clean(tx?.merchant_info?.name),
        clean(tx?.merchant_info?.category),
        clean(tx?.ip_address ? countryFromIP(tx.ip_address) : 'N/A'),
        clean(pred?.score?.toFixed(4) || '0'),
        clean(alertInfo?.status || 'N/A'),
        clean(alertInfo?.severity || 'N/A')
      ].join(",");
    });

    // 3. Assemblage avec le BOM pour Excel (\uFEFF)
    const csvContent = "\uFEFF" + [headers.join(","), ...csvRows].join("\n");

    // 4. Création du lien de téléchargement
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const dateStr = new Date().toISOString().split('T')[0];
    
    link.setAttribute("href", url);
    link.setAttribute("download", `${filenamePrefix}_${dateStr}.csv`);
    link.style.visibility = "hidden";
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

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
                  <button 
                    onClick={() => exportToCSV(filteredAlerts, "export_alertes")} 
                    className="flex items-center gap-2 px-3 py-2 text-sm text-gray-400 border border-slate-600 rounded hover:bg-slate-800 transition-colors"
                  >
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
                <div className="text-3xl font-bold text-gray-100">{historyData.length}</div>
                <div className="text-sm text-gray-400">Transactions totales</div>
              </div>
              <div className="metric-card shadow-soft">
                <div className="text-3xl font-bold text-gray-100">
                  {historyData.filter(tx => tx.alert_id).length}
                </div>
                <div className="text-sm text-gray-400">Avec alertes</div>
              </div>
              <div className="metric-card shadow-soft">
                <div className="text-3xl font-bold text-gray-100">{metrics.fraudRate}%</div>
                <div className="text-sm text-gray-400">Taux de fraude estimé</div>
              </div>
              <div className="metric-card shadow-soft">
                <div className="text-3xl font-bold text-gray-100">{metrics.avgAnalysisTime} min</div>
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
                        data={historyRiskDistribution}
                        cx="50%"
                        cy="50%"
                        innerRadius={40}
                        outerRadius={70}
                        paddingAngle={2}
                        dataKey="value"
                      >
                        {historyRiskDistribution.map((entry, index) => (
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
                      {historyData.filter(tx => (tx.score || 0) >= 0.7).length} risque élevé
                    </span>
                    <span className="px-2 py-1 rounded text-xs font-medium risk-badge-medium">
                      {historyData.filter(tx => {
                        const score = tx.score || 0;
                        return score >= 0.4 && score < 0.7;
                      }).length} risque moyen
                    </span>
                    <span className="px-2 py-1 rounded text-xs font-medium risk-badge-low">
                      {historyData.filter(tx => (tx.score || 0) < 0.4).length} risque faible
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
                      ) : historyData.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="p-8 text-center text-gray-500">
                            Aucune transaction trouvée.
                          </td>
                        </tr>
                      ) : (
                        historyData.map((tx) => {
                          const score = tx.score || 0;
                          const risk = getRiskLevel(score);
                          const status = tx.alert_status ? getStatusBadge(tx.alert_status) : { label: 'TRAITÉE', class: 'badge-false' };
                          const country = tx.ip_address ? countryFromIP(tx.ip_address) : 'N/A';

                          return (
                            <tr key={tx.transaction_id} className="hover:bg-slate-800/30 transition-colors">
                              <td className="p-3 text-gray-300">
                                {new Date(tx.created_at).toLocaleString('fr-FR', {
                                  day: '2-digit',
                                  month: '2-digit',
                                  year: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}
                              </td>
                              <td className="p-3 text-gray-300 font-mono text-xs">
                                {tx.external_user_id?.slice(0, 10) || 'N/A'}
                              </td>
                              <td className="p-3 text-gray-200 font-medium">
                                {tx.amount?.toLocaleString('fr-FR', { style: 'currency', currency: tx.currency || 'EUR' }) || 'N/A'}
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
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="p-4 border-t border-slate-700 flex justify-end">
                  <button 
                    onClick={() => exportToCSV(historyData, "export_historique")}
                    className="flex items-center gap-2 px-3 py-2 text-sm text-gray-400 border border-slate-600 rounded hover:bg-slate-800 transition-colors"
                  >
                    <Download size={16} /> Exporter les transactions
                  </button>
                </div>
              </div>

              {/* Sidebar */}
              <div className="space-y-4">
                {/* Summary */}
                <div className="card shadow-soft p-4">
                  <h3 className="text-lg font-semibold text-gray-200 mb-4">Statistiques</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-xs text-gray-500">Transactions</div>
                      <div className="text-xl font-semibold text-gray-200">{historyData.length}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500">Avec alertes</div>
                      <div className="text-xl font-semibold text-gray-200">
                        {historyData.filter(tx => tx.alert_id).length}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500">Risque élevé</div>
                      <div className="text-xl font-semibold text-red-400">
                        {historyData.filter(tx => (tx.score || 0) >= 0.7).length}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500">Risque faible</div>
                      <div className="text-xl font-semibold text-green-400">
                        {historyData.filter(tx => (tx.score || 0) < 0.4).length}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Filters */}
                {/* Dans la Sidebar de l'onglet History */}
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Limite d'affichage</label>
                    <select
                      className="form-select w-full text-sm"
                      value={historyLimit} // 1. On lie la valeur au State
                      onChange={(e) => {
                        const newVal = parseInt(e.target.value);
                        setHistoryLimit(newVal); // 2. On met à jour le State
                        // Optionnel : Vous pouvez recharger immédiatement si vous voulez
                        // fetchAllHistory(); 
                        // Mais comme vous avez un bouton "Actualiser" juste en dessous, 
                        // l'utilisateur cliquera dessus pour valider.
                      }}
                    >
                      <option value="25">25 transactions</option>
                      <option value="50">50 transactions</option>
                      <option value="100">100 transactions</option>
                      {/* Pour l'option "Toutes", on met une valeur très haute ou 0 si géré */}
                      <option value="10000">Toutes (Max 10k)</option> 
                    </select>
                  </div>
                    
                  <button
                    className="btn-primary w-full text-sm mt-2" // Ajout d'un petit margin-top
                    onClick={() => fetchAllHistory()} // Ce clic va maintenant utiliser la nouvelle valeur de historyLimit
                  >
                    Actualiser la liste
                  </button>
              </div>
            </div>
          </>
        )}

        {activeTab === 'settings' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Main Settings Panel */}
            <div className="lg:col-span-2 space-y-6">
              {/* Detection Thresholds */}
              <div className="card shadow-soft p-6">
                <h2 className="text-lg font-semibold text-gray-200 mb-4">Seuils de détection</h2>
                <p className="text-sm text-gray-500 mb-6">
                  Configurez les seuils de score pour classifier les transactions.
                </p>

                <div className="space-y-6">
                  {/* High Threshold */}
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <label className="text-sm text-gray-300">Seuil critique (BLOCK)</label>
                      <span className="text-sm font-mono text-red-400">{highThreshold.toFixed(2)}</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={highThreshold}
                      onChange={(e) => setHighThreshold(parseFloat(e.target.value))}
                      className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-red-500"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Score ≥ {highThreshold.toFixed(2)} → Transaction bloquée automatiquement
                    </p>
                  </div>

                  {/* Medium Threshold */}
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <label className="text-sm text-gray-300">Seuil moyen (REVIEW)</label>
                      <span className="text-sm font-mono text-yellow-400">{mediumThreshold.toFixed(2)}</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={mediumThreshold}
                      onChange={(e) => setMediumThreshold(parseFloat(e.target.value))}
                      className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-yellow-500"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Score ≥ {mediumThreshold.toFixed(2)} → Transaction mise en révision manuelle
                    </p>
                  </div>
                </div>
              </div>

              {/* Amount & Anomalies */}
              <div className="card shadow-soft p-6">
                <h2 className="text-lg font-semibold text-gray-200 mb-4">Règles de montant</h2>
                <p className="text-sm text-gray-500 mb-6">
                  Les transactions sous ce montant reçoivent un score réduit de 50%.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm text-gray-300 mb-2">Montant minimum d'alerte (€)</label>
                    <input
                      type="number"
                      min="0"
                      step="10"
                      value={minAmount}
                      onChange={(e) => setMinAmount(parseFloat(e.target.value) || 0)}
                      className="form-control w-full"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Transactions &lt; {minAmount}€ → score × 0.5
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm text-gray-300 mb-2">Max anomalies avant escalade</label>
                    <input
                      type="number"
                      min="1"
                      max="10"
                      value={maxAnomalies}
                      onChange={(e) => setMaxAnomalies(parseInt(e.target.value) || 1)}
                      className="form-control w-full"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Escalade après {maxAnomalies} transactions suspectes
                    </p>
                  </div>
                </div>
              </div>

              {/* Sensitive Countries */}
              <div className="card shadow-soft p-6">
                <h2 className="text-lg font-semibold text-gray-200 mb-4">Pays sensibles</h2>
                <p className="text-sm text-gray-500 mb-4">
                  Les transactions provenant de ces pays reçoivent un bonus de +0.25 au score de fraude.
                </p>

                <div className="flex flex-wrap gap-2 mb-4">
                  {['RU', 'CN', 'NG', 'BR', 'IN', 'PK', 'UA', 'BY', 'KZ', 'VN'].map((country) => (
                    <button
                      key={country}
                      onClick={() => toggleCountry(country)}
                      className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                        sensitiveCountries.includes(country)
                          ? 'bg-red-900/50 text-red-300 border border-red-600'
                          : 'bg-slate-800 text-gray-400 border border-slate-600 hover:border-slate-500'
                      }`}
                    >
                      {country}
                    </button>
                  ))}
                </div>

                <p className="text-xs text-gray-500">
                  Pays actifs : {sensitiveCountries.length > 0 ? sensitiveCountries.join(', ') : 'Aucun'}
                </p>
              </div>

              {/* Auto Block Toggle */}
              <div className="card shadow-soft p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-200">Blocage automatique</h2>
                    <p className="text-sm text-gray-500 mt-1">
                      Bloquer automatiquement les transactions dépassant le seuil critique
                    </p>
                  </div>
                  <button
                    onClick={() => setAutoBlock(!autoBlock)}
                    className={`relative w-14 h-7 rounded-full transition-colors ${
                      autoBlock ? 'bg-blue-600' : 'bg-slate-700'
                    }`}
                  >
                    <span
                      className={`absolute top-1 w-5 h-5 rounded-full bg-white transition-transform ${
                        autoBlock ? 'left-8' : 'left-1'
                      }`}
                    />
                  </button>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-4">
                <button
                  onClick={() => {
                    setHighThreshold(0.70);
                    setMediumThreshold(0.50);
                    setMinAmount(100);
                    setSensitiveCountries(['RU', 'CN']);
                    setMaxAnomalies(3);
                    setAutoBlock(true);
                  }}
                  className="px-4 py-2 text-sm border border-slate-600 text-gray-400 rounded hover:bg-slate-800 transition-colors"
                >
                  Réinitialiser par défaut
                </button>
                <button
                  onClick={handleSaveConfig}
                  disabled={savingConfig}
                  className="btn-primary px-6 py-2 disabled:opacity-50"
                >
                  {savingConfig ? 'Sauvegarde...' : 'Enregistrer les paramètres'}
                </button>
              </div>
            </div>

            {/* Summary Sidebar */}
            <div className="space-y-4">
              <div className="card shadow-soft p-4">
                <h3 className="text-lg font-semibold text-gray-200 mb-4">Résumé de la configuration</h3>
                <div className="space-y-3">
                  <div className="flex justify-between items-center py-2 border-b border-slate-700">
                    <span className="text-sm text-gray-400">Seuil BLOCK</span>
                    <span className="text-sm font-mono text-red-400">≥ {highThreshold.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-slate-700">
                    <span className="text-sm text-gray-400">Seuil REVIEW</span>
                    <span className="text-sm font-mono text-yellow-400">≥ {mediumThreshold.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-slate-700">
                    <span className="text-sm text-gray-400">Seuil ALLOW</span>
                    <span className="text-sm font-mono text-green-400">&lt; {mediumThreshold.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-slate-700">
                    <span className="text-sm text-gray-400">Min. montant</span>
                    <span className="text-sm font-mono text-gray-200">{minAmount}€</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-slate-700">
                    <span className="text-sm text-gray-400">Pays sensibles</span>
                    <span className="text-sm font-mono text-gray-200">{sensitiveCountries.length}</span>
                  </div>
                  <div className="flex justify-between items-center py-2">
                    <span className="text-sm text-gray-400">Auto-block</span>
                    <span className={`text-sm font-medium ${autoBlock ? 'text-green-400' : 'text-gray-500'}`}>
                      {autoBlock ? 'Actif' : 'Inactif'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="card shadow-soft p-4">
                <h3 className="text-lg font-semibold text-gray-200 mb-4">Impact sur le scoring</h3>
                <div className="space-y-3 text-sm">
                  <div className="p-3 bg-slate-800/50 rounded-lg">
                    <p className="text-gray-300 font-medium mb-1">Pays sensibles</p>
                    <p className="text-gray-500">+0.25 fixe au score si pays = {sensitiveCountries.join(', ') || 'N/A'}</p>
                  </div>
                  <div className="p-3 bg-slate-800/50 rounded-lg">
                    <p className="text-gray-300 font-medium mb-1">Petit montant</p>
                    <p className="text-gray-500">Score × 0.5 si montant &lt; {minAmount}€</p>
                  </div>
                  <div className="p-3 bg-slate-800/50 rounded-lg">
                    <p className="text-gray-300 font-medium mb-1">Catégorie Electronics</p>
                    <p className="text-gray-500">+0.30 au score de base</p>
                  </div>
                  <div className="p-3 bg-slate-800/50 rounded-lg">
                    <p className="text-gray-300 font-medium mb-1">Montant élevé</p>
                    <p className="text-gray-500">&gt;2000€: +0.40 | &gt;8000€: +0.50</p>
                  </div>
                </div>
              </div>

              {configLoaded && (
                <div className="p-3 bg-green-900/20 border border-green-800 rounded-lg">
                  <p className="text-sm text-green-400">Configuration chargée depuis la base de données</p>
                </div>
              )}
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
                    onClick={async () => {
                      await handleAction(selectedAlert.id, 'BAN', analystComment);
                      setShowModal(false);
                    }}
                    disabled={isSaving}
                    className="px-4 py-2 text-sm border border-red-600 text-red-400 rounded hover:bg-red-900/30 transition-colors disabled:opacity-50"
                  >
                    {isSaving ? 'Sauvegarde...' : 'Fraude confirmée'}
                  </button>
                  <button
                    onClick={async () => {
                      await handleAction(selectedAlert.id, 'IGNORE', analystComment);
                      setShowModal(false);
                    }}
                    disabled={isSaving}
                    className="px-4 py-2 text-sm border border-slate-600 text-gray-400 rounded hover:bg-slate-800 transition-colors disabled:opacity-50"
                  >
                    {isSaving ? 'Sauvegarde...' : 'Fausse alerte'}
                  </button>
                  <button
                    onClick={async () => {
                      await handleAction(selectedAlert.id, 'IN_PROGRESS', analystComment);
                      setShowModal(false);
                    }}
                    disabled={isSaving}
                    className="px-4 py-2 text-sm border border-yellow-600 text-yellow-400 rounded hover:bg-yellow-900/30 transition-colors disabled:opacity-50"
                  >
                    {isSaving ? 'Sauvegarde...' : 'En cours d\'analyse'}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm text-gray-500 mb-2">Commentaire analyste</label>
                <textarea
                  className="form-control w-full h-24 text-sm"
                  placeholder="Ajouter une note (ex : contacter le client, vérifier la localisation...)"
                  value={analystComment}
                  onChange={(e) => setAnalystComment(e.target.value)}
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
                <button
                  onClick={handleSaveComment}
                  disabled={isSaving}
                  className="btn-primary text-sm disabled:opacity-50"
                >
                  {isSaving ? 'Sauvegarde...' : 'Enregistrer'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
