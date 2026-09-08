import { useState } from "react";
import {
  PRHeader,
  POHeader,
  MRHeader,
  GRNHeader,
  ReceiptReturnHeader,
  RateModHeader,
  StoreOpeningHeader,
  ReconciliationHeader,
  StockBalance,
  SystemConfig,
  User,
  Role,
  Item,
  Store
} from "../types";
import { 
  TrendingUp, 
  AlertTriangle, 
  CheckCircle2, 
  Settings, 
  Inbox, 
  FileText, 
  ShieldCheck, 
  Clock, 
  X,
  Layers,
  Sparkles
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from "recharts";

interface DashboardProps {
  prs: PRHeader[];
  pos: POHeader[];
  mrs: MRHeader[];
  grns: GRNHeader[];
  returns: ReceiptReturnHeader[];
  rateMods: RateModHeader[];
  openings: StoreOpeningHeader[];
  reconciliations: ReconciliationHeader[];
  balances: StockBalance[];
  items: Item[];
  stores: Store[];
  config: SystemConfig;
  setConfig: (c: SystemConfig) => void;
  currentUser: User;
  setCurrentUser: (u: User) => void;
  users: User[];
  onApproveTransaction: (type: string, id: string, action: "Approve" | "Reject" | "Return-for-correction", remark: string) => void;
  onViewAudit?: (id: string, type: string, trail: any[]) => void;
}

export default function Dashboard({
  prs,
  pos,
  mrs,
  returns,
  rateMods,
  openings,
  reconciliations,
  balances,
  items,
  stores,
  config,
  setConfig,
  currentUser,
  setCurrentUser,
  users,
  onApproveTransaction,
  onViewAudit
}: DashboardProps) {
  const [remarkText, setRemarkText] = useState("");
  const [selectedTx, setSelectedTx] = useState<{ type: string; id: string; title: string; desc: string } | null>(null);

  // Calculated Stats
  const totalStockValue = balances.reduce((sum, bal) => sum + (bal.qtyOnHand * bal.movingAverageCost), 0);
  
  const pendingPRs = prs.filter(p => p.status === "Pending Approval" || p.status === "Submitted");
  const pendingPOs = pos.filter(p => p.status === "Pending Approval" || p.status === "Submitted");
  const pendingMRs = mrs.filter(m => m.status === "Pending Approval" || m.status === "Submitted");
  const pendingReturns = returns.filter(r => r.status === "Pending Approval");
  const pendingRateMods = rateMods.filter(r => r.status === "Pending Approval");
  const pendingOpenings = openings.filter(o => o.status === "Pending Approval");
  const pendingReconciliations = reconciliations.filter(r => r.status === "Pending Approval");

  const totalPendingApprovals = 
    pendingPRs.length + 
    pendingPOs.length + 
    pendingMRs.length + 
    pendingReturns.length + 
    pendingRateMods.length + 
    pendingOpenings.length + 
    pendingReconciliations.length;

  const lowStockItems = items.map(item => {
    const totalQty = balances
      .filter(b => b.itemId === item.id)
      .reduce((sum, b) => sum + b.qtyOnHand, 0);
    return {
      itemId: item.id,
      itemObj: item,
      qtyOnHand: totalQty,
      minLvl: item.minOrderLevel
    };
  }).filter(entry => entry.qtyOnHand <= entry.minLvl);
  const activePOs = pos.filter(p => p.status === "Approved" || p.status === "Partially Received");
  const openPRs = prs.filter(p => p.status === "Submitted" || p.status === "Pending Approval" || p.status === "Approved" || p.status === "Partially Fulfilled");

  // Aggregate Store Inventory Value for Recharts Visualization
  const storeValueData = stores.map(st => {
    const storeBalances = balances.filter(b => b.storeId === st.id);
    const value = storeBalances.reduce((sum, b) => sum + (b.qtyOnHand * b.movingAverageCost), 0);
    return {
      storeName: st.name,
      storeCode: st.code,
      value: parseFloat(value.toFixed(2))
    };
  });

  // Approval handler helper
  const handleApprovalSubmit = (action: "Approve" | "Reject" | "Return-for-correction") => {
    if (!selectedTx) return;
    onApproveTransaction(selectedTx.type, selectedTx.id, action, remarkText);
    setRemarkText("");
    setSelectedTx(null);
  };

  return (
    <div className="space-y-6" id="dashboard-container">
      {/* Top Welcome Bar */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between bg-white p-6 rounded-xl border border-slate-100 shadow-xs" id="welcome-bar">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 text-xs font-semibold uppercase bg-emerald-50 text-emerald-700 rounded-sm">PIM Live Platform</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-800 mt-1">Property Purchase & Inventory Console</h1>
          <p className="text-slate-500 text-sm mt-0.5">Real-time workflow enforcement, costing controls, and ledger updates.</p>
        </div>
        
        {/* User Switching Module (High Fidelity Roles Simulation) */}
        <div className="mt-4 md:mt-0 flex items-center gap-3 bg-slate-50 p-2.5 rounded-lg border border-slate-200/60" id="user-switcher">
          <div className="text-right">
            <p className="text-xs font-medium text-slate-400">Current Role Profile</p>
            <p className="text-sm font-bold text-slate-700">{currentUser.name}</p>
            <span className="text-[11px] px-1.5 py-0.2 bg-slate-200 text-slate-600 rounded font-semibold">{currentUser.role} ({currentUser.department})</span>
          </div>
          <select 
            className="text-xs border border-slate-200 rounded p-1 bg-white font-medium text-slate-700"
            value={currentUser.id}
            onChange={(e) => {
              const selected = users.find(u => u.id === e.target.value);
              if (selected) setCurrentUser(selected);
            }}
            id="user-select-dropdown"
          >
            {users.map(u => (
              <option key={u.id} value={u.id}>{u.role} - {u.name.split(" ")[0]}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Quick System Health Overview Section */}
      <div className="bg-slate-50 p-5 rounded-xl border border-slate-200/60 shadow-2xs space-y-3" id="system-health-overview">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
          <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">System Health Overview</span>
          <span className="text-[11px] text-slate-400 font-medium">Real-time status metrics of operational pipelines</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Card 1: Open PRs */}
          <div className="bg-white p-4 rounded-lg border border-slate-100 shadow-3xs flex items-center gap-4" id="health-open-prs">
            <div className="p-3 bg-indigo-50 text-indigo-600 rounded-lg">
              <FileText size={20} />
            </div>
            <div>
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">Open PRs</span>
              <div className="flex items-baseline gap-2 mt-0.5">
                <span className="text-2xl font-extrabold text-slate-800">{openPRs.length}</span>
                <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-indigo-50 text-indigo-700">Active</span>
              </div>
            </div>
          </div>

          {/* Card 2: Pending Approvals */}
          <div className="bg-white p-4 rounded-lg border border-slate-100 shadow-3xs flex items-center gap-4" id="health-pending-approvals">
            <div className={`p-3 rounded-lg ${totalPendingApprovals > 0 ? 'bg-amber-50 text-amber-600 animate-pulse' : 'bg-slate-50 text-slate-400'}`}>
              <Inbox size={20} />
            </div>
            <div>
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">Pending Approvals</span>
              <div className="flex items-baseline gap-2 mt-0.5">
                <span className="text-2xl font-extrabold text-slate-800">{totalPendingApprovals}</span>
                {totalPendingApprovals > 0 ? (
                  <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-amber-50 text-amber-700 animate-pulse">Action Req.</span>
                ) : (
                  <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-slate-100 text-slate-400">Clear</span>
                )}
              </div>
            </div>
          </div>

          {/* Card 3: Total Inventory Value */}
          <div className="bg-white p-4 rounded-lg border border-slate-100 shadow-3xs flex items-center gap-4" id="health-inventory-value">
            <div className="p-3 bg-emerald-50 text-emerald-600 rounded-lg">
              <TrendingUp size={20} />
            </div>
            <div>
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">Total Inventory Value</span>
              <div className="flex items-baseline gap-2 mt-0.5">
                <span className="text-2xl font-extrabold text-slate-800">${totalStockValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-emerald-50 text-emerald-700">FIFO/Avg</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Hero Analytics Ribbon */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" id="analytics-ribbon">
        <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-xs flex items-start justify-between" id="metric-stock-value">
          <div>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Aggregate Stock Value</span>
            <span className="text-3xl font-extrabold text-slate-800 mt-2 block">${totalStockValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            <span className="text-xs text-slate-400 mt-1 block">Based on <span className="font-semibold text-slate-600">{config.costingMethod}</span> formula</span>
          </div>
          <div className="p-3 bg-indigo-50 text-indigo-600 rounded-lg">
            <TrendingUp size={20} />
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-xs flex items-start justify-between" id="metric-pending-approvals">
          <div>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Pending Task Approvals</span>
            <span className="text-3xl font-extrabold text-slate-800 mt-2 block">{totalPendingApprovals}</span>
            <span className="text-xs text-slate-400 mt-1 block">Awaiting authority validation</span>
          </div>
          <div className={`p-3 rounded-lg ${totalPendingApprovals > 0 ? 'bg-amber-50 text-amber-600' : 'bg-slate-50 text-slate-400'}`}>
            <Inbox size={20} />
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-xs flex items-start justify-between" id="metric-low-stock">
          <div>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Low-OnHand Alerts</span>
            <span className="text-3xl font-extrabold text-slate-800 mt-2 block">{lowStockItems.length}</span>
            <span className="text-xs text-slate-400 mt-1 block">Under minimum order level</span>
          </div>
          <div className={`p-3 rounded-lg ${lowStockItems.length > 0 ? 'bg-rose-50 text-rose-500 animate-pulse' : 'bg-slate-50 text-slate-400'}`}>
            <AlertTriangle size={20} />
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-xs flex items-start justify-between" id="metric-active-pos">
          <div>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Active Suppliers POs</span>
            <span className="text-3xl font-extrabold text-slate-800 mt-2 block">{activePOs.length}</span>
            <span className="text-xs text-slate-400 mt-1 block">Approved contracts in-transit</span>
          </div>
          <div className="p-3 bg-indigo-50 text-indigo-600 rounded-lg">
            <CheckCircle2 size={20} />
          </div>
        </div>
      </div>

      {/* Low Stock Threshold Visual Alerts */}
      {lowStockItems.length > 0 && (
        <div className="bg-rose-50/60 border border-rose-200/60 rounded-xl p-5 space-y-3 shadow-xs" id="low-stock-alert-panel">
          <div className="flex items-center gap-2 text-rose-800">
            <AlertTriangle size={18} className="animate-pulse text-rose-600" />
            <span className="text-xs font-bold uppercase tracking-wider">Critical Stock Depletion Alert</span>
            <span className="ml-auto text-[10px] font-bold bg-rose-200 text-rose-800 px-2.5 py-0.5 rounded-full animate-bounce">
              {lowStockItems.length} SKUs At Risk
            </span>
          </div>
          <p className="text-xs text-rose-700 font-medium">
            The following physical supply items have fallen below or hit their critical safety replenishment parameters across hotel storage locations. Immediate purchase requests are advised.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
            {lowStockItems.map(b => {
              const pct = b.minLvl > 0 ? Math.min(100, Math.max(0, (b.qtyOnHand / b.minLvl) * 100)) : 0;
              return (
                <div key={b.itemId} className="bg-white p-3.5 rounded-lg border-2 border-rose-200 shadow-xs flex flex-col justify-between space-y-2 relative overflow-hidden">
                  {/* High Visibility Warning Badge */}
                  <div className="absolute top-0 right-0">
                    <span className="bg-rose-600 text-white text-[8px] font-extrabold px-1.5 py-0.5 rounded-bl uppercase tracking-wider animate-pulse block">
                      Reorder Alert
                    </span>
                  </div>

                  <div className="pr-16">
                    <div className="flex flex-col">
                      <span className="text-xs font-bold text-slate-800 truncate block" title={b.itemObj.name}>
                        {b.itemObj.name}
                      </span>
                      <span className="text-[9px] text-slate-400 font-mono font-semibold mt-0.5">
                        SKU: {b.itemObj.sku} • {b.itemObj.group}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px] font-semibold text-slate-600">
                      <span>Total On Hand: <span className="text-rose-600 font-extrabold">{b.qtyOnHand} {b.itemObj.unit}</span></span>
                      <span>Min Threshold: {b.minLvl}</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                      <div 
                        className="bg-rose-500 h-1.5 rounded-full" 
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Capital Distribution Analysis Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6" id="dashboard-chart-row">
        {/* Bar Chart Panel */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-100 shadow-xs p-6 flex flex-col" id="chart-panel-container">
          <div className="pb-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-800">Capital Allocation by Store Locations</h2>
              <p className="text-[11px] text-slate-400 mt-0.5">Visual representation of where aggregate capital budget is active in physical assets.</p>
            </div>
            <span className="px-2 py-1 text-[10px] font-bold bg-indigo-50 text-indigo-700 rounded border border-indigo-100">
              Live Assets
            </span>
          </div>

          <div className="mt-6 h-[260px] w-full" id="store-value-chart">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={storeValueData}
                margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis 
                  dataKey="storeName" 
                  tick={{ fill: '#64748b', fontSize: 10, fontWeight: 600 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis 
                  tickFormatter={(val) => `$${val}`}
                  tick={{ fill: '#64748b', fontSize: 10, fontWeight: 600 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip 
                  formatter={(value) => [`$${parseFloat(value as string).toLocaleString(undefined, { minimumFractionDigits: 2 })}`, 'Asset Value']}
                  contentStyle={{ background: '#ffffff', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '11px', fontWeight: 'bold', color: '#1e293b' }}
                />
                <Bar 
                  dataKey="value" 
                  fill="#4f46e5" 
                  radius={[4, 4, 0, 0]}
                  maxBarSize={48}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Audit list side card */}
        <div className="bg-white rounded-xl border border-slate-100 shadow-xs p-6 flex flex-col" id="chart-table-container">
          <div className="pb-4 border-b border-slate-100">
            <h2 className="text-sm font-bold text-slate-800">Asset Audit List</h2>
            <p className="text-[11px] text-slate-400 mt-0.5">Physical value breakdown for procurement ledgers.</p>
          </div>

          <div className="mt-4 flex-1 space-y-3">
            {storeValueData.map(data => {
              const totalVal = storeValueData.reduce((s, d) => s + d.value, 0);
              const pct = totalVal > 0 ? ((data.value / totalVal) * 100).toFixed(1) : "0.0";
              return (
                <div key={data.storeName} className="p-3 bg-slate-50 border border-slate-200/50 rounded-lg flex items-center justify-between gap-2">
                  <div>
                    <span className="text-xs font-bold text-slate-700 block">{data.storeName}</span>
                    <span className="text-[10px] text-slate-400 block font-semibold">Code: {data.storeCode} • {pct}% share</span>
                  </div>
                  <span className="text-xs font-extrabold text-slate-800">${data.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6" id="dashboard-split-layout">
        {/* Unified Approvals Queue */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-100 shadow-xs p-6 flex flex-col" id="approval-queue-container">
          <div className="flex items-center justify-between pb-4 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <ShieldCheck className="text-slate-700" size={20} />
              <h2 className="text-lg font-bold text-slate-800">Unified Workflow Authorization Inbox</h2>
            </div>
            <span className="px-2.5 py-1 text-xs font-bold bg-amber-100 text-amber-800 rounded-full">{totalPendingApprovals} Awaiting Action</span>
          </div>

          <div className="mt-4 flex-1 overflow-y-auto max-h-[360px] space-y-3 pr-1" id="approval-items-list">
            {totalPendingApprovals === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center" id="empty-approvals">
                <div className="w-12 h-12 bg-slate-50 text-slate-400 rounded-full flex items-center justify-center mb-2">
                  <CheckCircle2 size={24} />
                </div>
                <p className="text-sm font-semibold text-slate-600">All queues authorized</p>
                <p className="text-xs text-slate-400 max-w-[280px] mt-0.5">Every raised requisition, purchase order, and variance matches regulatory benchmarks.</p>
              </div>
            ) : (
              <>
                {/* PR Queue */}
                {pendingPRs.map(pr => (
                  <div key={pr.id} className="p-4 bg-slate-50 hover:bg-slate-100/70 border border-slate-200/50 rounded-lg transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 bg-blue-100 text-indigo-700 rounded-sm">Requisition (PR)</span>
                        <span className="text-xs font-mono font-bold text-slate-700">{pr.id}</span>
                      </div>
                      <p className="text-xs font-semibold text-slate-600 mt-1.5">Est. Budget: <span className="text-slate-800">${pr.estimatedValue.toFixed(2)}</span> • Store: {pr.storeId}</p>
                      <p className="text-[11px] text-slate-500 italic mt-0.5">Purpose: "{pr.purpose || 'Not detailed'}"</p>
                    </div>
                    <div className="flex items-center gap-2 self-end sm:self-center">
                      {onViewAudit && (
                        <button 
                          onClick={() => onViewAudit(pr.id, "PR", pr.auditTrail || [])} 
                          className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 border border-slate-200 hover:border-indigo-100 rounded-lg transition-colors cursor-pointer"
                          title="View Full Lifecycle Audit Trail"
                        >
                          <Clock size={14} />
                        </button>
                      )}
                      <button 
                        onClick={() => setSelectedTx({ type: "PR", id: pr.id, title: `Authorize ${pr.id}`, desc: `Estimated Requisition Value: $${pr.estimatedValue.toFixed(2)}. Initiated by ${pr.requesterId}.` })}
                        className="px-3.5 py-1.5 text-xs font-bold text-indigo-600 hover:text-white bg-indigo-50 hover:bg-indigo-600 border border-indigo-200 hover:border-indigo-600 rounded-lg transition-all"
                      >
                        Process Transaction
                      </button>
                    </div>
                  </div>
                ))}

                {/* PO Queue */}
                {pendingPOs.map(po => (
                  <div key={po.id} className="p-4 bg-slate-50 hover:bg-slate-100/70 border border-slate-200/50 rounded-lg transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded-sm">Purchase Order (PO)</span>
                        <span className="text-xs font-mono font-bold text-slate-700">{po.id}</span>
                      </div>
                      <p className="text-xs font-semibold text-slate-600 mt-1.5">Supplier Total: <span className="text-slate-800">${po.grandTotal.toFixed(2)}</span> • Type: {po.purchaseType}</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">Store Delivery: {po.deliveryStoreId} • Terms: {po.paymentTerms}</p>
                    </div>
                    <div className="flex items-center gap-2 self-end sm:self-center">
                      {onViewAudit && (
                        <button 
                          onClick={() => onViewAudit(po.id, "PO", po.auditTrail || [])} 
                          className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 border border-slate-200 hover:border-indigo-100 rounded-lg transition-colors cursor-pointer"
                          title="View Full Lifecycle Audit Trail"
                        >
                          <Clock size={14} />
                        </button>
                      )}
                      <button 
                        onClick={() => setSelectedTx({ type: "PO", id: po.id, title: `Authorize ${po.id}`, desc: `Contract Sum: $${po.grandTotal.toFixed(2)} with Supplier. Budget Category: ${po.purchaseType}.` })}
                        className="px-3.5 py-1.5 text-xs font-bold text-indigo-600 hover:text-white bg-indigo-50 hover:bg-indigo-600 border border-indigo-200 hover:border-indigo-600 rounded-lg transition-all"
                      >
                        Process Transaction
                      </button>
                    </div>
                  </div>
                ))}

                {/* MR Queue */}
                {pendingMRs.map(mr => (
                  <div key={mr.id} className="p-4 bg-slate-50 hover:bg-slate-100/70 border border-slate-200/50 rounded-lg transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 bg-amber-100 text-amber-800 rounded-sm">Material Request (MR)</span>
                        <span className="text-xs font-mono font-bold text-slate-700">{mr.id}</span>
                      </div>
                      <p className="text-xs font-semibold text-slate-600 mt-1.5">Cost Center Charge: <span className="text-slate-800">{mr.requestingDeptId}</span> • Valued: ${mr.estimatedValue.toFixed(2)}</p>
                      <p className="text-[11px] text-slate-500 italic mt-0.5">Purpose: "{mr.purpose}"</p>
                    </div>
                    <div className="flex items-center gap-2 self-end sm:self-center">
                      {onViewAudit && (
                        <button 
                          onClick={() => onViewAudit(mr.id, "MR", mr.auditTrail || [])} 
                          className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 border border-slate-200 hover:border-indigo-100 rounded-lg transition-colors cursor-pointer"
                          title="View Full Lifecycle Audit Trail"
                        >
                          <Clock size={14} />
                        </button>
                      )}
                      <button 
                        onClick={() => setSelectedTx({ type: "MR", id: mr.id, title: `Authorize ${mr.id}`, desc: `Departmental internal transfer. Cost Center: ${mr.requestingDeptId}. Value: $${mr.estimatedValue.toFixed(2)}` })}
                        className="px-3.5 py-1.5 text-xs font-bold text-amber-700 hover:text-white bg-amber-50 hover:bg-amber-600 border border-amber-200 hover:border-amber-600 rounded-lg transition-all"
                      >
                        Process Transaction
                      </button>
                    </div>
                  </div>
                ))}

                {/* Returns Queue */}
                {pendingReturns.map(ret => (
                  <div key={ret.id} className="p-4 bg-slate-50 hover:bg-slate-100/70 border border-slate-200/50 rounded-lg transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 bg-rose-100 text-rose-800 rounded-sm">Receipt Return</span>
                        <span className="text-xs font-mono font-bold text-slate-700">{ret.id}</span>
                      </div>
                      <p className="text-xs font-semibold text-slate-600 mt-1.5">Linked GRN: <span className="text-slate-800">{ret.grnId}</span></p>
                      <p className="text-[11px] text-slate-500 mt-0.5">Debit Note Ref: {ret.debitNoteRef || "Under Approval"}</p>
                    </div>
                    <div className="flex items-center gap-2 self-end sm:self-center">
                      {onViewAudit && (
                        <button 
                          onClick={() => onViewAudit(ret.id, "Receipt Return", ret.auditTrail || [])} 
                          className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 border border-slate-200 hover:border-indigo-100 rounded-lg transition-colors cursor-pointer"
                          title="View Full Lifecycle Audit Trail"
                        >
                          <Clock size={14} />
                        </button>
                      )}
                      <button 
                        onClick={() => setSelectedTx({ type: "Return", id: ret.id, title: `Authorize Return ${ret.id}`, desc: `Supplier Return document. Reverses physical stock and triggers Finance Debit Note. Linked to receipt ${ret.grnId}.` })}
                        className="px-3.5 py-1.5 text-xs font-bold text-rose-600 hover:text-white bg-rose-50 hover:bg-rose-600 border border-rose-200 hover:border-rose-600 rounded-lg transition-all"
                      >
                        Process Transaction
                      </button>
                    </div>
                  </div>
                ))}

                {/* Rate Mods Queue */}
                {pendingRateMods.map(rm => (
                  <div key={rm.id} className="p-4 bg-slate-50 hover:bg-slate-100/70 border border-slate-200/50 rounded-lg transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 bg-teal-100 text-teal-800 rounded-sm">Rate Modification</span>
                        <span className="text-xs font-mono font-bold text-slate-700">{rm.id}</span>
                      </div>
                      <p className="text-xs font-semibold text-slate-600 mt-1.5">Linked GRN: <span className="text-slate-800">{rm.grnId}</span></p>
                      <p className="text-[11px] text-slate-500 mt-0.5">Financial Impact: <span className={`font-bold ${rm.totalValueImpact >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>${rm.totalValueImpact.toFixed(2)}</span> (Retroactive valuation correction)</p>
                    </div>
                    <div className="flex items-center gap-2 self-end sm:self-center">
                      {onViewAudit && (
                        <button 
                          onClick={() => onViewAudit(rm.id, "Rate Modification", rm.auditTrail || [])} 
                          className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 border border-slate-200 hover:border-indigo-100 rounded-lg transition-colors cursor-pointer"
                          title="View Full Lifecycle Audit Trail"
                        >
                          <Clock size={14} />
                        </button>
                      )}
                      <button 
                        onClick={() => setSelectedTx({ type: "RateMod", id: rm.id, title: `Authorize Rate Modification ${rm.id}`, desc: `Retroactive stock revaluation. Total financial impact: $${rm.totalValueImpact.toFixed(2)} across receipt ${rm.grnId} lines.` })}
                        className="px-3.5 py-1.5 text-xs font-bold text-teal-600 hover:text-white bg-teal-50 hover:bg-teal-600 border border-teal-200 hover:border-teal-600 rounded-lg transition-all"
                      >
                        Process Transaction
                      </button>
                    </div>
                  </div>
                ))}

                {/* Opening Balance Queue */}
                {pendingOpenings.map(op => (
                  <div key={op.id} className="p-4 bg-slate-50 hover:bg-slate-100/70 border border-slate-200/50 rounded-lg transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 bg-slate-200 text-slate-800 rounded-sm">Store Opening Balance</span>
                        <span className="text-xs font-mono font-bold text-slate-700">{op.id}</span>
                      </div>
                      <p className="text-xs font-semibold text-slate-600 mt-1.5">Target Store ID: <span className="text-slate-800">{op.storeId}</span></p>
                      <p className="text-[11px] text-slate-500 mt-0.5">Seeds raw ledger balances for go-live launch. Date: {op.openingDate}</p>
                    </div>
                    <div className="flex items-center gap-2 self-end sm:self-center">
                      {onViewAudit && (
                        <button 
                          onClick={() => onViewAudit(op.id, "Opening Balance", op.auditTrail || [])} 
                          className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 border border-slate-200 hover:border-indigo-100 rounded-lg transition-colors cursor-pointer"
                          title="View Full Lifecycle Audit Trail"
                        >
                          <Clock size={14} />
                        </button>
                      )}
                      <button 
                        onClick={() => setSelectedTx({ type: "Opening", id: op.id, title: `Authorize Opening Balance ${op.id}`, desc: `High trust seed command. Initiates baseline ledger for Store: ${op.storeId}. Once authorized, opening balance is strictly locked.` })}
                        className="px-3.5 py-1.5 text-xs font-bold text-slate-700 hover:text-white bg-slate-100 hover:bg-slate-700 border border-slate-300 hover:border-slate-700 rounded-lg transition-all"
                      >
                        Process Transaction
                      </button>
                    </div>
                  </div>
                ))}

                {/* Reconciliation Queue */}
                {pendingReconciliations.map(rec => (
                  <div key={rec.id} className="p-4 bg-slate-50 hover:bg-slate-100/70 border border-slate-200/50 rounded-lg transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 bg-orange-100 text-orange-800 rounded-sm">Physical Reconciliation</span>
                        <span className="text-xs font-mono font-bold text-slate-700">{rec.id}</span>
                      </div>
                      <p className="text-xs font-semibold text-slate-600 mt-1.5">Store ID: <span className="text-slate-800">{rec.storeId}</span> • Variance Sum: <span className="font-bold text-rose-600">${rec.totalVarianceValue.toFixed(2)}</span></p>
                      <p className="text-[11px] text-slate-500 mt-0.5">Count Type: {rec.isBlind ? 'Blind (Hidden Books)' : 'Open count'}</p>
                    </div>
                    <div className="flex items-center gap-2 self-end sm:self-center">
                      {onViewAudit && (
                        <button 
                          onClick={() => onViewAudit(rec.id, "Reconciliation", rec.auditTrail || [])} 
                          className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 border border-slate-200 hover:border-indigo-100 rounded-lg transition-colors cursor-pointer"
                          title="View Full Lifecycle Audit Trail"
                        >
                          <Clock size={14} />
                        </button>
                      )}
                      <button 
                        onClick={() => setSelectedTx({ type: "Reconciliation", id: rec.id, title: `Authorize Reconciliation Variance ${rec.id}`, desc: `Adjust book stock to match physical counting on ${rec.countDate} in ${rec.storeId}. Total adjustment value impact: $${rec.totalVarianceValue.toFixed(2)}.` })}
                        className="px-3.5 py-1.5 text-xs font-bold text-orange-600 hover:text-white bg-orange-50 hover:bg-orange-600 border border-orange-200 hover:border-orange-600 rounded-lg transition-all"
                      >
                        Process Transaction
                      </button>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>

        {/* Global Controls & Costing Selector */}
        <div className="bg-white rounded-xl border border-slate-100 shadow-xs p-6 flex flex-col" id="global-controls-container">
          <div className="pb-4 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Settings className="text-slate-700" size={20} />
              <h2 className="text-lg font-bold text-slate-800">Operational Configuration</h2>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">Toggle live system rules, tolerances, and valuation engines.</p>
          </div>

          <div className="mt-5 space-y-5 flex-1" id="config-form-sections">
            {/* Costing Algorithm Toggle */}
            <div className="p-4 bg-indigo-50/50 border border-blue-100 rounded-xl" id="costing-formula-selector">
              <label className="text-xs font-bold text-indigo-800 uppercase tracking-wide flex items-center gap-1.5">
                <Layers size={14} />
                Asset Costing Method
              </label>
              <p className="text-[11px] text-indigo-600 mt-0.5">Governs materials issue valuation and rate correction re-calculations.</p>
              
              <div className="grid grid-cols-2 gap-2 mt-3">
                <button
                  type="button"
                  onClick={() => setConfig({ ...config, costingMethod: "Moving Average" })}
                  className={`py-2 px-3 text-xs font-bold rounded-lg border transition-all text-center ${
                    config.costingMethod === "Moving Average"
                      ? "bg-indigo-600 text-white border-indigo-600 shadow-xs"
                      : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                  }`}
                  id="btn-costing-moving-average"
                >
                  Moving Average
                </button>
                <button
                  type="button"
                  onClick={() => setConfig({ ...config, costingMethod: "FIFO" })}
                  className={`py-2 px-3 text-xs font-bold rounded-lg border transition-all text-center ${
                    config.costingMethod === "FIFO"
                      ? "bg-indigo-600 text-white border-indigo-600 shadow-xs"
                      : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                  }`}
                  id="btn-costing-fifo"
                >
                  FIFO Queue
                </button>
              </div>
            </div>

            {/* Over-receipt Tolerance Limits */}
            <div className="space-y-1" id="config-over-receipt">
              <div className="flex justify-between items-center">
                <label className="text-xs font-bold text-slate-700">GRN Over-receipt Tolerance</label>
                <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">{config.overReceiptTolerancePct}%</span>
              </div>
              <p className="text-[11px] text-slate-400">Block receipts exceeding PO quantity by more than this limit.</p>
              <input 
                type="range" 
                min="0" 
                max="30" 
                step="5"
                value={config.overReceiptTolerancePct}
                onChange={(e) => setConfig({ ...config, overReceiptTolerancePct: parseInt(e.target.value) })}
                className="w-full accent-indigo-600 mt-1 cursor-pointer"
                id="input-tolerance-overreceipt"
              />
            </div>

            {/* Re-approval Amendment Limit */}
            <div className="space-y-1" id="config-amendment">
              <div className="flex justify-between items-center">
                <label className="text-xs font-bold text-slate-700">Amendment Value Limit</label>
                <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">{config.amendmentTolerancePct}%</span>
              </div>
              <p className="text-[11px] text-slate-400">Triggers re-approval if amendment increases overall contract sum by this %.</p>
              <input 
                type="range" 
                min="0" 
                max="20" 
                step="5"
                value={config.amendmentTolerancePct}
                onChange={(e) => setConfig({ ...config, amendmentTolerancePct: parseInt(e.target.value) })}
                className="w-full accent-indigo-600 mt-1 cursor-pointer"
                id="input-tolerance-amendment"
              />
            </div>

            {/* Reconciliation Threshold */}
            <div className="space-y-1" id="config-reconcile-threshold">
              <label className="text-xs font-bold text-slate-700 block">Variance Approval Threshold</label>
              <p className="text-[11px] text-slate-400">Reconciliation values exceeding this trigger formal supervisor approval.</p>
              <div className="relative mt-1">
                <span className="absolute left-3 top-2 text-xs font-semibold text-slate-400">$</span>
                <input 
                  type="number"
                  value={config.reconciliationThresholdValue}
                  onChange={(e) => setConfig({ ...config, reconciliationThresholdValue: parseFloat(e.target.value) || 0 })}
                  className="w-full pl-7 pr-3 py-1.5 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  id="input-reconcile-threshold"
                />
              </div>
            </div>

            {/* Freeze Store Toggle */}
            <div className="flex items-center justify-between p-3.5 bg-slate-50 border border-slate-200/60 rounded-lg" id="config-freeze-store">
              <div>
                <label className="text-xs font-bold text-slate-700 block">Freeze Store Count Period</label>
                <p className="text-[10px] text-slate-400">Block GRN and issues during physical reconciliation counts.</p>
              </div>
              <input 
                type="checkbox" 
                checked={config.freezeStoreDuringReconciliation}
                onChange={(e) => setConfig({ ...config, freezeStoreDuringReconciliation: e.target.checked })}
                className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500 cursor-pointer"
                id="checkbox-freeze-store"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Modern Workflow Detail Modal Drawer */}
      {selectedTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4" id="approval-modal">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <Clock className="text-amber-500" size={18} />
                <h3 className="text-sm font-bold text-slate-800">{selectedTx.title}</h3>
              </div>
              <button 
                onClick={() => setSelectedTx(null)} 
                className="p-1 hover:bg-slate-200 rounded-full text-slate-400 hover:text-slate-600 transition-colors"
                id="btn-close-approval-modal"
              >
                <X size={16} />
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              <div className="p-4 bg-amber-50/40 border border-amber-200/40 rounded-lg">
                <p className="text-xs text-slate-700 leading-relaxed">{selectedTx.desc}</p>
                <p className="text-[11px] text-slate-400 mt-2">Required Authority Rule: Resolving sequence from department and total estimated value slab.</p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 block">Approver Review Comments / Corrections</label>
                <textarea
                  placeholder="Enter specific audit remarks or return instruction details here..."
                  rows={3}
                  value={remarkText}
                  onChange={(e) => setRemarkText(e.target.value)}
                  className="w-full p-2.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-700"
                  id="textarea-approval-comments"
                />
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-100 flex flex-wrap gap-2 justify-end">
              <button
                type="button"
                onClick={() => handleApprovalSubmit("Return-for-correction")}
                className="px-3.5 py-1.5 text-xs font-semibold text-amber-700 hover:text-white bg-amber-100 hover:bg-amber-600 rounded-lg transition-colors"
                id="btn-action-return"
              >
                Return for Correction
              </button>
              <button
                type="button"
                onClick={() => handleApprovalSubmit("Reject")}
                className="px-3.5 py-1.5 text-xs font-semibold text-rose-700 hover:text-white bg-rose-50 hover:bg-rose-600 rounded-lg transition-colors"
                id="btn-action-reject"
              >
                Reject Request
              </button>
              <button
                type="button"
                onClick={() => handleApprovalSubmit("Approve")}
                className="px-4 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors shadow-xs"
                id="btn-action-approve"
              >
                Approve Transaction
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
