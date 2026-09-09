import { useState, useMemo } from "react";
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
  Sparkles,
  CalendarCheck2,
  Flame,
  Bell,
  Zap,
  Check,
  ListChecks
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
  onBulkApproveTransactions?: (items: { type: string; id: string }[], action: "Approve" | "Reject", remark: string) => void;
  onViewAudit?: (id: string, type: string, trail: any[]) => void;
  onOpenDayClosure?: () => void;
  onOpenApprovals?: () => void;
}

export default function Dashboard({
  prs,
  pos,
  mrs,
  grns,
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
  onBulkApproveTransactions,
  onViewAudit,
  onOpenDayClosure,
  onOpenApprovals
}: DashboardProps) {
  const [remarkText, setRemarkText] = useState("");
  const [selectedTx, setSelectedTx] = useState<{ type: string; id: string; title: string; desc: string } | null>(null);

  // Dashboard Bulk Approval State
  const [showDashboardBulkModal, setShowDashboardBulkModal] = useState(false);
  const [dashboardSelectedKeys, setDashboardSelectedKeys] = useState<string[]>([]);
  const [dashboardBulkRemark, setDashboardBulkRemark] = useState("Authorized via Executive Dashboard Batch Action");
  const [dashboardSuccessToast, setDashboardSuccessToast] = useState<string | null>(null);
  const [isExecutingDashboardBulk, setIsExecutingDashboardBulk] = useState(false);

  // Calculated Stats
  const totalStockValue = balances.reduce((sum, bal) => sum + (bal.qtyOnHand * bal.movingAverageCost), 0);
  
  const pendingPRs = prs.filter(p => p.status === "Pending Approval" || p.status === "Submitted");
  const pendingPOs = pos.filter(p => p.status === "Pending Approval" || p.status === "Submitted");
  const pendingMRs = mrs.filter(m => m.status === "Pending Approval" || m.status === "Submitted");
  const pendingGRNs = grns.filter(g => g.status === "Pending Approval");
  const pendingReturns = returns.filter(r => r.status === "Pending Approval");
  const pendingRateMods = rateMods.filter(r => r.status === "Pending Approval");
  const pendingOpenings = openings.filter(o => o.status === "Pending Approval");
  const pendingReconciliations = reconciliations.filter(r => r.status === "Pending Approval");

  const totalPendingApprovals = 
    pendingPRs.length + 
    pendingPOs.length + 
    pendingMRs.length + 
    pendingGRNs.length + 
    pendingReturns.length + 
    pendingRateMods.length + 
    pendingOpenings.length + 
    pendingReconciliations.length;

  // Escalation calculation: Pending > 48 hours SLA
  const calculatePendingHours = (trail?: any[], fallbackDate?: string): number => {
    if (!trail || trail.length === 0) {
      if (!fallbackDate) return 0;
      const parsed = Date.parse(fallbackDate);
      return isNaN(parsed) ? 0 : Math.max(0, Math.round((Date.now() - parsed) / (1000 * 60 * 60)));
    }
    const submissionEntry = [...trail].reverse().find(entry => {
      const act = (entry.action || "").toLowerCase();
      return act.includes("submit") || act.includes("creat") || act.includes("sent for approval") || act.includes("posted");
    }) || trail[0];

    const timestamp = submissionEntry?.timestamp ? Date.parse(submissionEntry.timestamp) : NaN;
    if (isNaN(timestamp)) {
      if (!fallbackDate) return 0;
      const parsed = Date.parse(fallbackDate);
      return isNaN(parsed) ? 0 : Math.max(0, Math.round((Date.now() - parsed) / (1000 * 60 * 60)));
    }
    return Math.max(0, Math.round((Date.now() - timestamp) / (1000 * 60 * 60)));
  };

  const escalatedPRs = pendingPRs.filter(p => calculatePendingHours(p.auditTrail, "2026-09-05T09:00:00Z") >= 48);
  const escalatedPOs = pendingPOs.filter(p => calculatePendingHours(p.auditTrail, "2026-09-05T09:00:00Z") >= 48);
  const escalatedMRs = pendingMRs.filter(m => calculatePendingHours(m.auditTrail, "2026-09-05T09:00:00Z") >= 48);
  const escalatedGRNs = pendingGRNs.filter(g => calculatePendingHours(g.auditTrail, "2026-09-05T09:00:00Z") >= 48);
  const totalEscalated = escalatedPRs.length + escalatedPOs.length + escalatedMRs.length + escalatedGRNs.length;

  // Unified list of pending approvals for dashboard batch processing
  const dashboardPendingList = useMemo(() => {
    const list: {
      key: string;
      type: string;
      id: string;
      title: string;
      detail: string;
      value: number;
      hoursPending: number;
      isEscalated: boolean;
    }[] = [];

    pendingPRs.forEach(pr => {
      const hours = calculatePendingHours(pr.auditTrail, "2026-09-05T09:00:00Z");
      const val = pr.estimatedValue || pr.lines.reduce((s, l) => {
        const item = items.find(i => i.id === l.itemId);
        return s + (l.quantity * (item?.standardRate || 10));
      }, 0);
      list.push({
        key: `PR:${pr.id}`,
        type: "PR",
        id: pr.id,
        title: `PR ${pr.id}`,
        detail: pr.purpose || "Requisition request",
        value: val,
        hoursPending: hours,
        isEscalated: hours >= 48
      });
    });

    pendingPOs.forEach(po => {
      const hours = calculatePendingHours(po.auditTrail, "2026-09-05T09:00:00Z");
      list.push({
        key: `PO:${po.id}`,
        type: "PO",
        id: po.id,
        title: `PO ${po.id}`,
        detail: po.paymentTerms || "Purchase Order",
        value: po.grandTotal,
        hoursPending: hours,
        isEscalated: hours >= 48
      });
    });

    pendingMRs.forEach(mr => {
      const hours = calculatePendingHours(mr.auditTrail, "2026-09-05T09:00:00Z");
      const val = mr.estimatedValue || mr.lines.reduce((s, l) => {
        const item = items.find(i => i.id === l.itemId);
        return s + (l.quantity * (item?.standardRate || 10));
      }, 0);
      list.push({
        key: `MR:${mr.id}`,
        type: "MR",
        id: mr.id,
        title: `MR ${mr.id}`,
        detail: mr.purpose || "Store transfer",
        value: val,
        hoursPending: hours,
        isEscalated: hours >= 48
      });
    });

    pendingGRNs.forEach(grn => {
      const hours = calculatePendingHours(grn.auditTrail, "2026-09-05T09:00:00Z");
      list.push({
        key: `GRN:${grn.id}`,
        type: "GRN",
        id: grn.id,
        title: `GRN ${grn.id}`,
        detail: `Store: ${grn.deliveryStoreId}${grn.sourcePOId ? ` • PO: ${grn.sourcePOId}` : ""}`,
        value: grn.grandTotal,
        hoursPending: hours,
        isEscalated: hours >= 48
      });
    });

    pendingReturns.forEach(ret => {
      const val = ret.lines.reduce((s, l) => {
        const item = items.find(i => i.id === l.itemId);
        return s + (l.returnQty * (item?.standardRate || 10));
      }, 0);
      list.push({
        key: `RETURN:${ret.id}`,
        type: "RETURN",
        id: ret.id,
        title: `Return ${ret.id}`,
        detail: `GRN ${ret.grnId} • Supplier ${ret.supplierId}`,
        value: val,
        hoursPending: 12,
        isEscalated: false
      });
    });

    pendingRateMods.forEach(rm => {
      list.push({
        key: `RATEMOD:${rm.id}`,
        type: "RATEMOD",
        id: rm.id,
        title: `Rate Mod ${rm.id}`,
        detail: `GRN ${rm.grnId} • ${rm.lines.length} items modified`,
        value: Math.abs(rm.totalValueImpact || 0),
        hoursPending: 10,
        isEscalated: false
      });
    });

    pendingOpenings.forEach(op => {
      list.push({
        key: `OPENING:${op.id}`,
        type: "OPENING",
        id: op.id,
        title: `Opening ${op.id}`,
        detail: `${op.lines.length} inventory lines in Store ${op.storeId}`,
        value: op.lines.reduce((s, l) => s + (l.quantity * l.rate), 0),
        hoursPending: 16,
        isEscalated: false
      });
    });

    pendingReconciliations.forEach(rec => {
      list.push({
        key: `RECON:${rec.id}`,
        type: "RECON",
        id: rec.id,
        title: `Reconciliation ${rec.id}`,
        detail: `Variance: ${rec.lines.length} lines`,
        value: rec.totalVarianceValue || 0,
        hoursPending: 24,
        isEscalated: false
      });
    });

    return list;
  }, [pendingPRs, pendingPOs, pendingMRs, pendingGRNs, pendingReturns, pendingRateMods, pendingOpenings, pendingReconciliations, items]);

  const dashboardSelectedItems = useMemo(() => {
    return dashboardPendingList.filter(item => dashboardSelectedKeys.includes(item.key));
  }, [dashboardPendingList, dashboardSelectedKeys]);

  const dashboardSelectedTotalValue = useMemo(() => {
    return dashboardSelectedItems.reduce((acc, curr) => acc + curr.value, 0);
  }, [dashboardSelectedItems]);

  const handleOpenDashboardBulk = () => {
    if (dashboardSelectedKeys.length === 0) {
      setDashboardSelectedKeys(dashboardPendingList.map(i => i.key));
    }
    setShowDashboardBulkModal(true);
  };

  const handleExecuteDashboardBulk = (action: "Approve" | "Reject") => {
    if (dashboardSelectedKeys.length === 0) return;

    setIsExecutingDashboardBulk(true);
    const itemsToProcess = dashboardPendingList.filter(item => dashboardSelectedKeys.includes(item.key));
    const remark = dashboardBulkRemark.trim() || `Bulk ${action} via Dashboard by ${currentUser.name} (${currentUser.role})`;

    if (onBulkApproveTransactions) {
      onBulkApproveTransactions(
        itemsToProcess.map(i => ({ type: i.type, id: i.id })),
        action,
        remark
      );
    } else {
      itemsToProcess.forEach(i => {
        onApproveTransaction(i.type, i.id, action, remark);
      });
    }

    setTimeout(() => {
      setIsExecutingDashboardBulk(false);
      setShowDashboardBulkModal(false);
      setDashboardSelectedKeys([]);
      setDashboardSuccessToast(`✓ Successfully ${action === "Approve" ? "Authorized" : "Rejected"} ${itemsToProcess.length} transaction(s).`);
      setTimeout(() => setDashboardSuccessToast(null), 4000);
    }, 400);
  };

  // Function that iterates through 'balances' state and cross-references them with 'Item' master data
  // to identify items where 'qtyOnHand' <= 'minOrderLevel'
  const getLowStockAlertItems = () => {
    // Calculate total quantity on hand per item from the balances state
    const itemBalanceMap: Record<string, number> = {};
    balances.forEach((bal) => {
      itemBalanceMap[bal.itemId] = (itemBalanceMap[bal.itemId] || 0) + (bal.qtyOnHand || 0);
    });

    // Cross-reference with the Item master data
    return items
      .map((item) => {
        const qtyOnHand = itemBalanceMap[item.id] ?? 0;
        const minOrderLevel = typeof item.minOrderLevel === "number" ? item.minOrderLevel : 0;
        const isBelowOrAtMin = qtyOnHand <= minOrderLevel;
        return {
          item,
          itemId: item.id,
          itemObj: item,
          qtyOnHand,
          minOrderLevel,
          minLvl: minOrderLevel,
          deficit: Math.max(0, minOrderLevel - qtyOnHand),
          isBelowOrAtMin,
        };
      })
      .filter((entry) => entry.isBelowOrAtMin);
  };

  const lowStockItems = getLowStockAlertItems();
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
      {/* Top Summary Card Section - System Health Overview */}
      <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-xs space-y-3" id="top-system-health-overview">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-pulse" />
            <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wider">System Health Overview</h2>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[11px] text-slate-400 font-medium hidden sm:inline">Real-time counts & valuation status</span>
            {onOpenDayClosure && (
              <button
                onClick={onOpenDayClosure}
                className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-bold transition-all shadow-xs hover:shadow-sm flex items-center gap-1.5 cursor-pointer"
                id="dashboard-day-closure-action-btn"
              >
                <CalendarCheck2 size={14} />
                <span>Day Closure (EOD)</span>
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4" id="health-overview-cards">
          {/* Card 1: Open PRs */}
          <div className="bg-slate-50/80 hover:bg-slate-50 p-4 rounded-xl border border-slate-200/60 shadow-3xs flex items-center justify-between transition-colors" id="health-open-prs">
            <div className="flex items-center gap-3.5">
              <div className="p-3 bg-purple-100 text-purple-700 rounded-xl shadow-xs">
                <FileText size={22} />
              </div>
              <div>
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Open PRs</span>
                <span className="text-2xl font-black text-slate-900 leading-tight block mt-0.5">{openPRs.length}</span>
              </div>
            </div>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200/60">
              Active Pipeline
            </span>
          </div>

          {/* Card 2: Pending Approvals */}
          <div className="bg-slate-50/80 hover:bg-slate-50 p-4 rounded-xl border border-slate-200/60 shadow-3xs flex items-center justify-between transition-colors" id="health-pending-approvals">
            <div className="flex items-center gap-3.5">
              <div className={`p-3 rounded-xl shadow-xs ${totalPendingApprovals > 0 ? 'bg-amber-100 text-amber-700 animate-pulse' : 'bg-slate-200/70 text-slate-600'}`}>
                <Inbox size={22} />
              </div>
              <div>
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Pending Approvals</span>
                <span className="text-2xl font-black text-slate-900 leading-tight block mt-0.5">{totalPendingApprovals}</span>
              </div>
            </div>
            {totalPendingApprovals > 0 ? (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200/60 animate-pulse">
                Action Required
              </span>
            ) : (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                All Cleared
              </span>
            )}
          </div>

          {/* Card 3: Total Inventory Value */}
          <div className="bg-slate-50/80 hover:bg-slate-50 p-4 rounded-xl border border-slate-200/60 shadow-3xs flex items-center justify-between transition-colors" id="health-inventory-value">
            <div className="flex items-center gap-3.5">
              <div className="p-3 bg-emerald-100 text-emerald-700 rounded-xl shadow-xs">
                <TrendingUp size={22} />
              </div>
              <div>
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Total Inventory Value</span>
                <span className="text-2xl font-black text-slate-900 leading-tight block mt-0.5">
                  ${totalStockValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/60">
              {config.costingMethod}
            </span>
          </div>
        </div>
      </div>

      {/* Welcome Bar */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between bg-white p-6 rounded-xl border border-slate-100 shadow-xs" id="welcome-bar">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="px-2 py-0.5 text-xs font-semibold uppercase bg-emerald-50 text-emerald-700 rounded-sm">PIM Live Platform</span>
            {lowStockItems.length > 0 && (
              <span className="px-2 py-0.5 text-xs font-bold uppercase bg-rose-600 text-white rounded-sm flex items-center gap-1 animate-pulse shadow-sm">
                <AlertTriangle size={12} /> {lowStockItems.length} Low Stock Alert
              </span>
            )}
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

      {/* Hero Analytics Ribbon */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" id="analytics-ribbon">
        <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-xs flex items-start justify-between" id="metric-stock-value">
          <div>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Aggregate Stock Value</span>
            <span className="text-3xl font-extrabold text-slate-800 mt-2 block">${totalStockValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            <span className="text-xs text-slate-400 mt-1 block">Based on <span className="font-semibold text-slate-600">{config.costingMethod}</span> formula</span>
          </div>
          <div className="p-3 bg-purple-50 text-purple-600 rounded-lg">
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
          <div className="p-3 bg-purple-50 text-purple-600 rounded-lg">
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
            <span className="px-2 py-1 text-[10px] font-bold bg-purple-50 text-purple-700 rounded border border-purple-100">
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
            <div className="flex items-center gap-2 flex-wrap justify-end">
              {totalEscalated > 0 && (
                <span className="px-2.5 py-1 text-xs font-black bg-rose-600 text-white rounded-full flex items-center gap-1 shadow-2xs animate-pulse">
                  <Flame size={12} />
                  {totalEscalated} High Priority (&gt;48h)
                </span>
              )}
              {totalPendingApprovals > 0 && (
                <button
                  type="button"
                  onClick={handleOpenDashboardBulk}
                  className="px-3 py-1 text-xs font-extrabold text-white bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 rounded-lg shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
                  id="btn-dashboard-bulk-approve"
                >
                  <Zap size={13} className="text-amber-300" />
                  Bulk Approve ({totalPendingApprovals})
                </button>
              )}
              {onOpenApprovals && (
                <button
                  onClick={onOpenApprovals}
                  className="px-2.5 py-1 text-xs font-bold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-lg transition-colors cursor-pointer flex items-center gap-1"
                  id="btn-goto-approval-screen"
                >
                  Dedicated Approval Screen &rarr;
                </button>
              )}
              <span className="px-2.5 py-1 text-xs font-bold bg-amber-100 text-amber-800 rounded-full">{totalPendingApprovals} Awaiting Action</span>
            </div>
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
                {pendingPRs.map(pr => {
                  const hoursPending = calculatePendingHours(pr.auditTrail, "2026-09-05T09:00:00Z");
                  const isEscalated = hoursPending >= 48;

                  return (
                    <div key={pr.id} className={`p-4 rounded-lg transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 border ${
                      isEscalated ? "bg-rose-50/40 border-rose-300 border-l-4 border-l-rose-600" : "bg-slate-50 hover:bg-slate-100/70 border-slate-200/50"
                    }`}>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 bg-blue-100 text-purple-700 rounded-sm">Requisition (PR)</span>
                          <span className="text-xs font-mono font-bold text-slate-700">{pr.id}</span>
                          {isEscalated && (
                            <span className="text-[9px] font-black px-2 py-0.5 bg-rose-600 text-white rounded-full flex items-center gap-1">
                              <Flame size={10} /> High Priority ({hoursPending}h &gt; 48h)
                            </span>
                          )}
                        </div>
                        <p className="text-xs font-semibold text-slate-600 mt-1.5">Est. Budget: <span className="text-slate-800">${pr.estimatedValue.toFixed(2)}</span> • Store: {pr.storeId}</p>
                        <p className="text-[11px] text-slate-500 italic mt-0.5">Purpose: "{pr.purpose || 'Not detailed'}"</p>
                      </div>
                      <div className="flex items-center gap-2 self-end sm:self-center">
                        {onViewAudit && (
                          <button 
                            onClick={() => onViewAudit(pr.id, "PR", pr.auditTrail || [])} 
                            className="p-2 text-slate-400 hover:text-purple-600 hover:bg-purple-50 border border-slate-200 hover:border-purple-100 rounded-lg transition-colors cursor-pointer"
                            title="View Full Lifecycle Audit Trail"
                          >
                            <Clock size={14} />
                          </button>
                        )}
                        <button 
                          onClick={() => setSelectedTx({ type: "PR", id: pr.id, title: `Authorize ${pr.id}`, desc: `Estimated Requisition Value: $${pr.estimatedValue.toFixed(2)}. Initiated by ${pr.requesterId}.` })}
                          className="px-3.5 py-1.5 text-xs font-bold text-purple-600 hover:text-white bg-purple-50 hover:bg-purple-600 border border-purple-200 hover:border-purple-600 rounded-lg transition-all"
                        >
                          Process Transaction
                        </button>
                      </div>
                    </div>
                  );
                })}

                {/* PO Queue */}
                {pendingPOs.map(po => {
                  const hoursPending = calculatePendingHours(po.auditTrail, "2026-09-05T09:00:00Z");
                  const isEscalated = hoursPending >= 48;

                  return (
                    <div key={po.id} className={`p-4 rounded-lg transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 border ${
                      isEscalated ? "bg-rose-50/40 border-rose-300 border-l-4 border-l-rose-600" : "bg-slate-50 hover:bg-slate-100/70 border-slate-200/50"
                    }`}>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 bg-purple-100 text-purple-700 rounded-sm">Purchase Order (PO)</span>
                          <span className="text-xs font-mono font-bold text-slate-700">{po.id}</span>
                          {isEscalated && (
                            <span className="text-[9px] font-black px-2 py-0.5 bg-rose-600 text-white rounded-full flex items-center gap-1">
                              <Flame size={10} /> High Priority ({hoursPending}h &gt; 48h)
                            </span>
                          )}
                        </div>
                        <p className="text-xs font-semibold text-slate-600 mt-1.5">Supplier Total: <span className="text-slate-800">${po.grandTotal.toFixed(2)}</span> • Type: {po.purchaseType}</p>
                        <p className="text-[11px] text-slate-500 mt-0.5">Store Delivery: {po.deliveryStoreId} • Terms: {po.paymentTerms}</p>
                      </div>
                      <div className="flex items-center gap-2 self-end sm:self-center">
                        {onViewAudit && (
                          <button 
                            onClick={() => onViewAudit(po.id, "PO", po.auditTrail || [])} 
                            className="p-2 text-slate-400 hover:text-purple-600 hover:bg-purple-50 border border-slate-200 hover:border-purple-100 rounded-lg transition-colors cursor-pointer"
                            title="View Full Lifecycle Audit Trail"
                          >
                            <Clock size={14} />
                          </button>
                        )}
                        <button 
                          onClick={() => setSelectedTx({ type: "PO", id: po.id, title: `Authorize ${po.id}`, desc: `Contract Sum: $${po.grandTotal.toFixed(2)} with Supplier. Budget Category: ${po.purchaseType}.` })}
                          className="px-3.5 py-1.5 text-xs font-bold text-purple-600 hover:text-white bg-purple-50 hover:bg-purple-600 border border-purple-200 hover:border-purple-600 rounded-lg transition-all"
                        >
                          Process Transaction
                        </button>
                      </div>
                    </div>
                  );
                })}

                {/* MR Queue */}
                {pendingMRs.map(mr => {
                  const hoursPending = calculatePendingHours(mr.auditTrail, "2026-09-05T09:00:00Z");
                  const isEscalated = hoursPending >= 48;

                  return (
                    <div key={mr.id} className={`p-4 rounded-lg transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 border ${
                      isEscalated ? "bg-rose-50/40 border-rose-300 border-l-4 border-l-rose-600" : "bg-slate-50 hover:bg-slate-100/70 border-slate-200/50"
                    }`}>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 bg-amber-100 text-amber-800 rounded-sm">Material Request (MR)</span>
                          <span className="text-xs font-mono font-bold text-slate-700">{mr.id}</span>
                          {isEscalated && (
                            <span className="text-[9px] font-black px-2 py-0.5 bg-rose-600 text-white rounded-full flex items-center gap-1">
                              <Flame size={10} /> High Priority ({hoursPending}h &gt; 48h)
                            </span>
                          )}
                        </div>
                        <p className="text-xs font-semibold text-slate-600 mt-1.5">Cost Center Charge: <span className="text-slate-800">{mr.requestingDeptId}</span> • Valued: ${mr.estimatedValue.toFixed(2)}</p>
                        <p className="text-[11px] text-slate-500 italic mt-0.5">Purpose: "{mr.purpose}"</p>
                      </div>
                      <div className="flex items-center gap-2 self-end sm:self-center">
                        {onViewAudit && (
                          <button 
                            onClick={() => onViewAudit(mr.id, "MR", mr.auditTrail || [])} 
                            className="p-2 text-slate-400 hover:text-purple-600 hover:bg-purple-50 border border-slate-200 hover:border-purple-100 rounded-lg transition-colors cursor-pointer"
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
                  );
                })}

                {/* GRN Queue */}
                {pendingGRNs.map(grn => {
                  const hoursPending = calculatePendingHours(grn.auditTrail, grn.receivedDate);
                  const isEscalated = hoursPending >= 48;

                  return (
                    <div key={grn.id} className={`p-4 rounded-lg transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 border ${
                      isEscalated ? "bg-rose-50/40 border-rose-300 border-l-4 border-l-rose-600" : "bg-slate-50 hover:bg-slate-100/70 border-slate-200/50"
                    }`}>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-sm">Goods Receipt (GRN)</span>
                          <span className="text-xs font-mono font-bold text-slate-700">{grn.id}</span>
                          {grn.isDirect && <span className="text-[9px] px-1 bg-amber-50 text-amber-700 border border-amber-200 rounded font-bold">DIRECT</span>}
                          {isEscalated && (
                            <span className="text-[9px] font-black px-2 py-0.5 bg-rose-600 text-white rounded-full flex items-center gap-1">
                              <Flame size={10} /> High Priority ({hoursPending}h &gt; 48h)
                            </span>
                          )}
                        </div>
                      <p className="text-xs font-semibold text-slate-600 mt-1.5">Receipt Total: <span className="text-slate-800">${grn.grandTotal.toFixed(2)}</span> • Store: {grn.deliveryStoreId}</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">{grn.sourcePOId ? `Linked PO: ${grn.sourcePOId}` : `Direct: ${grn.reasonCode || 'Manual'}`}</p>
                    </div>
                    <div className="flex items-center gap-2 self-end sm:self-center">
                      {onViewAudit && (
                        <button 
                          onClick={() => onViewAudit(grn.id, "GRN", grn.auditTrail || [])} 
                          className="p-2 text-slate-400 hover:text-purple-600 hover:bg-purple-50 border border-slate-200 hover:border-purple-100 rounded-lg transition-colors cursor-pointer"
                          title="View Full Lifecycle Audit Trail"
                        >
                          <Clock size={14} />
                        </button>
                      )}
                      <button 
                        onClick={() => setSelectedTx({ type: "GRN", id: grn.id, title: `Authorize Goods Receipt ${grn.id}`, desc: `Value: $${grn.grandTotal.toFixed(2)}. Approving will post all line quantities directly to stock ledger balance.` })}
                        className="px-3.5 py-1.5 text-xs font-bold text-emerald-700 hover:text-white bg-emerald-50 hover:bg-emerald-600 border border-emerald-200 hover:border-emerald-600 rounded-lg transition-all"
                      >
                        Process Transaction
                      </button>
                    </div>
                  </div>
                );
              })}

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
                          className="p-2 text-slate-400 hover:text-purple-600 hover:bg-purple-50 border border-slate-200 hover:border-purple-100 rounded-lg transition-colors cursor-pointer"
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
                          className="p-2 text-slate-400 hover:text-purple-600 hover:bg-purple-50 border border-slate-200 hover:border-purple-100 rounded-lg transition-colors cursor-pointer"
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
                          className="p-2 text-slate-400 hover:text-purple-600 hover:bg-purple-50 border border-slate-200 hover:border-purple-100 rounded-lg transition-colors cursor-pointer"
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
                          className="p-2 text-slate-400 hover:text-purple-600 hover:bg-purple-50 border border-slate-200 hover:border-purple-100 rounded-lg transition-colors cursor-pointer"
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
            <div className="p-4 bg-purple-50/50 border border-blue-100 rounded-xl" id="costing-formula-selector">
              <label className="text-xs font-bold text-purple-800 uppercase tracking-wide flex items-center gap-1.5">
                <Layers size={14} />
                Asset Costing Method
              </label>
              <p className="text-[11px] text-purple-600 mt-0.5">Governs materials issue valuation and rate correction re-calculations.</p>
              
              <div className="grid grid-cols-2 gap-2 mt-3">
                <button
                  type="button"
                  onClick={() => setConfig({ ...config, costingMethod: "Moving Average" })}
                  className={`py-2 px-3 text-xs font-bold rounded-lg border transition-all text-center ${
                    config.costingMethod === "Moving Average"
                      ? "bg-purple-600 text-white border-purple-600 shadow-xs"
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
                      ? "bg-purple-600 text-white border-purple-600 shadow-xs"
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
                <span className="text-xs font-bold text-purple-600 bg-purple-50 px-2 py-0.5 rounded">{config.overReceiptTolerancePct}%</span>
              </div>
              <p className="text-[11px] text-slate-400">Block receipts exceeding PO quantity by more than this limit.</p>
              <input 
                type="range" 
                min="0" 
                max="30" 
                step="5"
                value={config.overReceiptTolerancePct}
                onChange={(e) => setConfig({ ...config, overReceiptTolerancePct: parseInt(e.target.value) })}
                className="w-full accent-purple-600 mt-1 cursor-pointer"
                id="input-tolerance-overreceipt"
              />
            </div>

            {/* Re-approval Amendment Limit */}
            <div className="space-y-1" id="config-amendment">
              <div className="flex justify-between items-center">
                <label className="text-xs font-bold text-slate-700">Amendment Value Limit</label>
                <span className="text-xs font-bold text-purple-600 bg-purple-50 px-2 py-0.5 rounded">{config.amendmentTolerancePct}%</span>
              </div>
              <p className="text-[11px] text-slate-400">Triggers re-approval if amendment increases overall contract sum by this %.</p>
              <input 
                type="range" 
                min="0" 
                max="20" 
                step="5"
                value={config.amendmentTolerancePct}
                onChange={(e) => setConfig({ ...config, amendmentTolerancePct: parseInt(e.target.value) })}
                className="w-full accent-purple-600 mt-1 cursor-pointer"
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
                  className="w-full pl-7 pr-3 py-1.5 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 focus:outline-none focus:ring-1 focus:ring-purple-500"
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
                className="w-4 h-4 text-purple-600 border-slate-300 rounded focus:ring-purple-500 cursor-pointer"
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
                  className="w-full p-2.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-500 text-slate-700"
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

      {/* DASHBOARD TOAST NOTIFICATION */}
      {dashboardSuccessToast && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white px-4 py-3 rounded-xl shadow-2xl border border-slate-800 flex items-center gap-3 animate-in slide-in-from-bottom-5 duration-200">
          <CheckCircle2 size={18} className="text-emerald-400 shrink-0" />
          <span className="text-xs font-bold">{dashboardSuccessToast}</span>
          <button onClick={() => setDashboardSuccessToast(null)} className="text-slate-400 hover:text-white ml-2">
            <X size={14} />
          </button>
        </div>
      )}

      {/* DASHBOARD BATCH AUTHORIZATION MODAL */}
      {showDashboardBulkModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150" id="modal-dashboard-batch-approve">
          <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-purple-200 overflow-hidden">
            {/* Modal Header */}
            <div className="p-5 bg-gradient-to-r from-purple-950 via-slate-900 to-indigo-950 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-purple-600 rounded-xl text-white shadow-xs">
                  <Zap size={20} className="text-amber-300" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold tracking-tight">Dashboard Batch Workflow Authorization</h3>
                  <p className="text-xs text-purple-200/80 mt-0.5">
                    Authorized Signatory: <strong className="text-white">{currentUser.name}</strong> ({currentUser.role} • {currentUser.department})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowDashboardBulkModal(false)}
                className="p-2 text-purple-300 hover:text-white rounded-lg hover:bg-purple-800/80 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-4 text-xs flex-1">
              {/* Summary KPIs */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3 bg-purple-50 border border-purple-100 rounded-xl">
                  <span className="text-[11px] font-bold text-purple-600 uppercase tracking-wider block">Selected Items</span>
                  <span className="text-xl font-extrabold text-purple-950 mt-0.5 block">
                    {dashboardSelectedKeys.length} of {dashboardPendingList.length}
                  </span>
                </div>
                <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-xl">
                  <span className="text-[11px] font-bold text-emerald-600 uppercase tracking-wider block">Batch Total Value</span>
                  <span className="text-xl font-extrabold text-emerald-950 mt-0.5 block">
                    ${dashboardSelectedTotalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl">
                  <span className="text-[11px] font-bold text-rose-600 uppercase tracking-wider block">High Priority (&gt;48h)</span>
                  <span className="text-xl font-extrabold text-rose-950 mt-0.5 block flex items-center gap-1">
                    {dashboardSelectedItems.filter(i => i.isEscalated).length}
                    {dashboardSelectedItems.some(i => i.isEscalated) && (
                      <Flame size={15} className="text-rose-600 animate-pulse" />
                    )}
                  </span>
                </div>
              </div>

              {/* Selection Controls */}
              <div className="flex items-center justify-between pt-1">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setDashboardSelectedKeys(dashboardPendingList.map(i => i.key))}
                    className="px-2.5 py-1 rounded bg-purple-50 text-purple-700 font-bold border border-purple-200 hover:bg-purple-100 cursor-pointer"
                  >
                    Select All ({dashboardPendingList.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setDashboardSelectedKeys(dashboardPendingList.filter(i => i.isEscalated).map(i => i.key))}
                    className="px-2.5 py-1 rounded bg-rose-50 text-rose-700 font-bold border border-rose-200 hover:bg-rose-100 cursor-pointer flex items-center gap-1"
                  >
                    <Flame size={11} /> Overdue (&gt;48h)
                  </button>
                  <button
                    type="button"
                    onClick={() => setDashboardSelectedKeys([])}
                    className="px-2.5 py-1 rounded bg-slate-100 text-slate-600 font-semibold hover:bg-slate-200 cursor-pointer"
                  >
                    Clear
                  </button>
                </div>
                <span className="text-[11px] text-slate-400">Toggle items to customize batch</span>
              </div>

              {/* Transactions List */}
              <div className="border border-slate-200 rounded-xl overflow-hidden max-h-[220px] overflow-y-auto divide-y divide-slate-100">
                {dashboardPendingList.length === 0 ? (
                  <div className="p-8 text-center text-slate-400">
                    No pending approval transactions found.
                  </div>
                ) : (
                  dashboardPendingList.map(item => {
                    const isChecked = dashboardSelectedKeys.includes(item.key);
                    return (
                      <div
                        key={item.key}
                        onClick={() => {
                          if (isChecked) {
                            setDashboardSelectedKeys(dashboardSelectedKeys.filter(k => k !== item.key));
                          } else {
                            setDashboardSelectedKeys([...dashboardSelectedKeys, item.key]);
                          }
                        }}
                        className={`p-3 flex items-center justify-between gap-3 cursor-pointer transition-colors ${
                          isChecked ? "bg-purple-50/40 hover:bg-purple-50/70" : "bg-white hover:bg-slate-50 opacity-60"
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {}} // Handled by container onClick
                            className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500 cursor-pointer"
                          />
                          <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-purple-100 text-purple-700 shrink-0">
                            {item.type}
                          </span>
                          <div className="min-w-0">
                            <div className="font-extrabold text-slate-900 flex items-center gap-1.5">
                              <span>{item.title}</span>
                              {item.isEscalated && (
                                <span className="px-1.5 py-0.2 text-[9px] font-black bg-rose-600 text-white rounded flex items-center gap-0.5">
                                  <Flame size={10} /> &gt;48h Overdue
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-500 truncate">{item.detail}</div>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <div className="font-extrabold text-slate-900">
                            ${item.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </div>
                          <div className="text-[10px] text-slate-400">{item.hoursPending}h pending</div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Remarks */}
              <div className="space-y-1.5">
                <label className="font-bold text-slate-700 block">Signatory Batch Remarks:</label>
                <input
                  type="text"
                  value={dashboardBulkRemark}
                  onChange={(e) => setDashboardBulkRemark(e.target.value)}
                  placeholder="Enter audit approval remarks..."
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:bg-white"
                />
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
              <span className="text-xs text-slate-500 font-medium">
                {dashboardSelectedKeys.length} of {dashboardPendingList.length} items queued
              </span>
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowDashboardBulkModal(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={dashboardSelectedKeys.length === 0 || isExecutingDashboardBulk}
                  onClick={() => handleExecuteDashboardBulk("Reject")}
                  className="px-4 py-2 text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-xl transition-colors cursor-pointer disabled:opacity-50"
                  id="btn-dashboard-modal-bulk-reject"
                >
                  Reject Selected ({dashboardSelectedKeys.length})
                </button>
                <button
                  type="button"
                  disabled={dashboardSelectedKeys.length === 0 || isExecutingDashboardBulk}
                  onClick={() => handleExecuteDashboardBulk("Approve")}
                  className="px-5 py-2 text-xs font-extrabold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 rounded-xl transition-all shadow-xs cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                  id="btn-dashboard-modal-bulk-approve"
                >
                  <Check size={15} />
                  <span>
                    {isExecutingDashboardBulk
                      ? "Authorizing..."
                      : `Authorize Selected (${dashboardSelectedKeys.length})`}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
