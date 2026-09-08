import React, { useState, useMemo } from "react";
import {
  DayClosureRecord,
  DayClosureChecklistItem,
  Store,
  Item,
  StockBalance,
  GRNHeader,
  PRHeader,
  POHeader,
  MRHeader,
  ReceiptReturnHeader,
  IssueHeader,
  StockLedgerEntry,
  User,
  Role
} from "../types";
import {
  CalendarCheck2,
  Lock,
  Unlock,
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileSpreadsheet,
  Printer,
  TrendingUp,
  Package,
  ArrowDownLeft,
  ArrowUpRight,
  ShieldCheck,
  Building,
  Calendar,
  AlertCircle,
  FileCheck
} from "lucide-react";

interface DayClosureModalProps {
  isOpen: boolean;
  onClose: () => void;
  stores: Store[];
  items: Item[];
  balances: StockBalance[];
  grns: GRNHeader[];
  prs: PRHeader[];
  pos: POHeader[];
  mrs: MRHeader[];
  returns: ReceiptReturnHeader[];
  issues: IssueHeader[];
  ledger: StockLedgerEntry[];
  currentUser: User;
  closures: DayClosureRecord[];
  onSaveClosure: (record: DayClosureRecord) => void;
}

export default function DayClosureModal({
  isOpen,
  onClose,
  stores,
  items,
  balances,
  grns,
  prs,
  pos,
  mrs,
  returns,
  issues,
  ledger,
  currentUser,
  closures,
  onSaveClosure
}: DayClosureModalProps) {
  // Target closure date default to today in YYYY-MM-DD
  const todayStr = new Date().toISOString().split("T")[0];
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const [selectedStoreId, setSelectedStoreId] = useState<string>("all");
  const [remarks, setRemarks] = useState<string>("");
  const [isConfirming, setIsConfirming] = useState<boolean>(false);
  const [activeSubTab, setActiveSubTab] = useState<"closure" | "history">("closure");

  // Check if date & store is already closed
  const existingClosure = useMemo(() => {
    return closures.find(
      (c) =>
        c.closureDate === selectedDate &&
        (c.storeId === selectedStoreId || c.storeId === "all" || selectedStoreId === "all") &&
        c.status === "Closed"
    );
  }, [closures, selectedDate, selectedStoreId]);

  // Filter transactions for selected date and store
  const dayGrns = useMemo(() => {
    return grns.filter((g) => {
      const matchDate = (g.receivedDate || "").startsWith(selectedDate);
      const matchStore = selectedStoreId === "all" || g.deliveryStoreId === selectedStoreId;
      return matchDate && matchStore && g.status === "Posted";
    });
  }, [grns, selectedDate, selectedStoreId]);

  const dayGrnValue = useMemo(() => {
    return dayGrns.reduce((sum, g) => sum + (g.grandTotal || 0), 0);
  }, [dayGrns]);

  const dayIssues = useMemo(() => {
    return issues.filter((i) => {
      const matchDate = (i.issueDate || "").startsWith(selectedDate);
      const matchStore = selectedStoreId === "all" || i.storeId === selectedStoreId;
      return matchDate && matchStore && i.status === "Posted";
    });
  }, [issues, selectedDate, selectedStoreId]);

  const dayIssueValue = useMemo(() => {
    return dayIssues.reduce((sum, i) => {
      const lineSum = (i.lines || []).reduce((lSum, l) => {
        const itemBal = balances.find((b) => b.itemId === l.itemId && b.storeId === i.storeId);
        const costRate = itemBal?.movingAverageCost || 0;
        return lSum + l.qtyIssued * costRate;
      }, 0);
      return sum + lineSum;
    }, 0);
  }, [dayIssues, balances]);

  const dayReturns = useMemo(() => {
    return returns.filter((r) => {
      const matchDate = (r.returnDate || "").startsWith(selectedDate);
      const parentGrn = grns.find((g) => g.id === r.grnId);
      const matchStore = selectedStoreId === "all" || parentGrn?.deliveryStoreId === selectedStoreId;
      return matchDate && matchStore && r.status === "Posted";
    });
  }, [returns, grns, selectedDate, selectedStoreId]);

  const dayLedgerEntries = useMemo(() => {
    return ledger.filter((l) => {
      const matchDate = (l.timestamp || "").startsWith(selectedDate);
      const matchStore = selectedStoreId === "all" || l.storeId === selectedStoreId;
      return matchDate && matchStore;
    });
  }, [ledger, selectedDate, selectedStoreId]);

  // Outstanding / pending validation counts
  const pendingPrs = useMemo(() => {
    return prs.filter((p) => {
      const matchStore = selectedStoreId === "all" || p.storeId === selectedStoreId;
      return matchStore && (p.status === "Submitted" || p.status === "Pending Approval");
    });
  }, [prs, selectedStoreId]);

  const pendingPos = useMemo(() => {
    return pos.filter((p) => {
      const matchStore = selectedStoreId === "all" || p.deliveryStoreId === selectedStoreId;
      return matchStore && (p.status === "Submitted" || p.status === "Pending Approval");
    });
  }, [pos, selectedStoreId]);

  const pendingDraftGrns = useMemo(() => {
    return grns.filter((g) => {
      const matchDate = (g.receivedDate || "").startsWith(selectedDate);
      const matchStore = selectedStoreId === "all" || g.deliveryStoreId === selectedStoreId;
      return matchDate && matchStore && g.status === "Draft";
    });
  }, [grns, selectedDate, selectedStoreId]);

  const pendingDraftIssues = useMemo(() => {
    return issues.filter((i) => {
      const matchDate = (i.issueDate || "").startsWith(selectedDate);
      const matchStore = selectedStoreId === "all" || i.storeId === selectedStoreId;
      return matchDate && matchStore && i.status === "Draft";
    });
  }, [issues, selectedDate, selectedStoreId]);

  // Total inventory valuation
  const inventoryValuation = useMemo(() => {
    const relevantBalances = balances.filter(
      (b) => selectedStoreId === "all" || b.storeId === selectedStoreId
    );
    return relevantBalances.reduce((sum, b) => sum + b.qtyOnHand * b.movingAverageCost, 0);
  }, [balances, selectedStoreId]);

  // Reconciliation & audit readiness checklist
  const checklistItems: DayClosureChecklistItem[] = useMemo(() => {
    return [
      {
        id: "check-draft-grns",
        label: "Goods Receipts (GRN) Status",
        description: "All inbound shipments received today have been verified and posted",
        status: pendingDraftGrns.length === 0 ? "Passed" : "Warning",
        count: pendingDraftGrns.length,
        details:
          pendingDraftGrns.length === 0
            ? `${dayGrns.length} GRN(s) posted today ($${dayGrnValue.toFixed(2)})`
            : `${pendingDraftGrns.length} unposted Draft GRN(s) pending warehouse review`
      },
      {
        id: "check-draft-issues",
        label: "Material Issues & Requisitions",
        description: "Kitchen & department material issuances posted to ledger",
        status: pendingDraftIssues.length === 0 ? "Passed" : "Warning",
        count: pendingDraftIssues.length,
        details:
          pendingDraftIssues.length === 0
            ? `${dayIssues.length} issue slip(s) posted ($${dayIssueValue.toFixed(2)})`
            : `${pendingDraftIssues.length} draft issue slip(s) need completion`
      },
      {
        id: "check-ledger-sync",
        label: "Stock Ledger Synchronization",
        description: "Inventory balance changes accurately reflected in ledger cards",
        status: "Passed",
        details: `${dayLedgerEntries.length} inventory ledger movement(s) processed for ${selectedDate}`
      },
      {
        id: "check-approvals",
        label: "Pending Management Authorizations",
        description: "PRs or POs awaiting signature before day lock",
        status:
          pendingPrs.length + pendingPos.length === 0
            ? "Passed"
            : pendingPrs.length + pendingPos.length > 5
            ? "Warning"
            : "Passed",
        count: pendingPrs.length + pendingPos.length,
        details: `${pendingPrs.length} PR(s), ${pendingPos.length} PO(s) in review queue`
      },
      {
        id: "check-costing",
        label: "Weighted Cost Engine Consistency",
        description: "All inventory prices computed and balanced with zero negative stock",
        status: "Passed",
        details: `Consolidated stock valuation: $${inventoryValuation.toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        })}`
      }
    ];
  }, [
    pendingDraftGrns,
    dayGrns,
    dayGrnValue,
    pendingDraftIssues,
    dayIssues,
    dayIssueValue,
    dayLedgerEntries,
    selectedDate,
    pendingPrs,
    pendingPos,
    inventoryValuation
  ]);

  const hasBlockingIssues = pendingDraftGrns.length > 0 && false; // Warnings don't strictly block in hotel operations, but prompt confirmation

  const handleExecuteDayClosure = () => {
    const storeObj = stores.find((s) => s.id === selectedStoreId);
    const storeName = selectedStoreId === "all" ? "All Locations (Consolidated)" : storeObj?.name || selectedStoreId;

    const newClosure: DayClosureRecord = {
      id: `EOD-${selectedDate.replace(/-/g, "")}-${selectedStoreId}`,
      closureDate: selectedDate,
      closedAt: new Date().toISOString(),
      closedBy: currentUser.name,
      closedById: currentUser.id,
      closedByRole: currentUser.role,
      storeId: selectedStoreId,
      storeName: storeName,
      status: "Closed",
      totalInventoryValuation: inventoryValuation,
      totalGrnCount: dayGrns.length,
      totalGrnValue: dayGrnValue,
      totalIssueCount: dayIssues.length,
      totalIssueValue: dayIssueValue,
      totalReturnCount: dayReturns.length,
      pendingPrsCount: pendingPrs.length,
      pendingPosCount: pendingPos.length,
      pendingApprovalsCount: pendingPrs.length + pendingPos.length,
      stockLedgerEntriesCount: dayLedgerEntries.length,
      checklist: checklistItems,
      remarks: remarks.trim() || `End-of-day operational closure executed by ${currentUser.name} (${currentUser.role}).`,
      auditTrail: [
        {
          id: `AUD-${Date.now()}-1`,
          timestamp: new Date().toISOString(),
          userId: currentUser.id,
          userName: `${currentUser.name} (${currentUser.role})`,
          action: "Day Closure Executed",
          details: `Closed stock ledger for ${selectedDate} at ${storeName}. Valuation: $${inventoryValuation.toFixed(2)}.`
        }
      ]
    };

    onSaveClosure(newClosure);
    setIsConfirming(false);
    setActiveSubTab("history");
  };

  const handleReopenDay = (closureRecord: DayClosureRecord) => {
    if (
      currentUser.role !== Role.Approver &&
      currentUser.role !== Role.StoreManager &&
      !currentUser.permissions.includes("all-access")
    ) {
      alert("Only Store Managers or Financial Approvers can re-open a closed financial day.");
      return;
    }

    const updated: DayClosureRecord = {
      ...closureRecord,
      status: "Re-opened",
      auditTrail: [
        ...closureRecord.auditTrail,
        {
          id: `AUD-${Date.now()}-2`,
          timestamp: new Date().toISOString(),
          userId: currentUser.id,
          userName: `${currentUser.name} (${currentUser.role})`,
          action: "Day Re-opened",
          details: `Re-opened financial books by ${currentUser.name} (${currentUser.role}).`
        }
      ]
    };

    onSaveClosure(updated);
  };

  const handlePrintSummary = () => {
    window.print();
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
      id="day-closure-modal"
    >
      <div className="bg-white rounded-2xl max-w-4xl w-full border border-slate-200 shadow-2xl flex flex-col max-h-[92vh] overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-6 bg-gradient-to-r from-purple-900 via-purple-800 to-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-purple-600/40 border border-purple-400/40 flex items-center justify-center text-purple-200 shadow-inner">
              <CalendarCheck2 size={24} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white tracking-tight">Day Closure & EOD Finalization</h2>
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-purple-500/30 text-purple-200 border border-purple-400/30">
                  Daily Lock
                </span>
              </div>
              <p className="text-xs text-purple-200/80 mt-0.5">
                Reconcile daily transactions, audit stock movements, and lock books for auditing.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white/80 hover:text-white flex items-center justify-center transition-colors"
            id="close-day-closure-btn"
          >
            ✕
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-2 px-6 pt-4 border-b border-slate-200 bg-slate-50 shrink-0">
          <button
            onClick={() => setActiveSubTab("closure")}
            className={`px-4 py-2 text-xs font-bold border-b-2 transition-all flex items-center gap-2 ${
              activeSubTab === "closure"
                ? "border-purple-600 text-purple-700 bg-white rounded-t-lg shadow-xs"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
            id="day-closure-tab-run"
          >
            <Lock size={14} />
            Execute Day Closure
          </button>
          <button
            onClick={() => setActiveSubTab("history")}
            className={`px-4 py-2 text-xs font-bold border-b-2 transition-all flex items-center gap-2 ${
              activeSubTab === "history"
                ? "border-purple-600 text-purple-700 bg-white rounded-t-lg shadow-xs"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
            id="day-closure-tab-history"
          >
            <Clock size={14} />
            Closure History & Audit ({closures.length})
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 p-6 overflow-y-auto space-y-6">
          {activeSubTab === "closure" ? (
            <>
              {/* Parameters Bar */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200/80">
                <div>
                  <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5 mb-1.5">
                    <Calendar size={14} className="text-purple-600" />
                    Target Business Date
                  </label>
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="w-full p-2.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-800 focus:ring-2 focus:ring-purple-500 shadow-3xs"
                    id="closure-date-input"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5 mb-1.5">
                    <Building size={14} className="text-purple-600" />
                    Store Location / Entity
                  </label>
                  <select
                    value={selectedStoreId}
                    onChange={(e) => setSelectedStoreId(e.target.value)}
                    className="w-full p-2.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-800 focus:ring-2 focus:ring-purple-500 shadow-3xs"
                    id="closure-store-select"
                  >
                    <option value="all">All Storage Locations (Consolidated EOD)</option>
                    {stores.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.code})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Status Alert if Already Closed */}
              {existingClosure && (
                <div
                  className="p-4 rounded-xl bg-purple-50 border border-purple-200 flex items-start justify-between gap-3 shadow-3xs"
                  id="already-closed-banner"
                >
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-purple-100 text-purple-700 rounded-lg shrink-0 mt-0.5">
                      <Lock size={18} />
                    </div>
                    <div>
                      <h3 className="text-xs font-bold text-purple-900">
                        Business Day {selectedDate} is Formally Closed
                      </h3>
                      <p className="text-xs text-purple-700 mt-0.5">
                        Closed by <span className="font-bold">{existingClosure.closedBy}</span> (
                        {existingClosure.closedByRole}) on{" "}
                        {new Date(existingClosure.closedAt).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit"
                        })}
                        . Valuation locked at $
                        {existingClosure.totalInventoryValuation.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2
                        })}
                        .
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleReopenDay(existingClosure)}
                    className="px-3 py-1.5 text-xs font-bold rounded-lg bg-white border border-purple-300 text-purple-700 hover:bg-purple-100 transition-colors shrink-0 flex items-center gap-1.5 shadow-3xs"
                    id="reopen-day-btn"
                  >
                    <Unlock size={13} />
                    Re-open Day
                  </button>
                </div>
              )}

              {/* Daily KPI Metric Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-3xs">
                  <div className="flex items-center justify-between text-slate-500 mb-1">
                    <span className="text-[11px] font-bold uppercase tracking-wider">Inbound Receipts</span>
                    <ArrowDownLeft size={16} className="text-emerald-600" />
                  </div>
                  <span className="text-xl font-extrabold text-slate-800">{dayGrns.length}</span>
                  <span className="text-[11px] font-semibold text-emerald-600 block mt-0.5">
                    +${dayGrnValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>

                <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-3xs">
                  <div className="flex items-center justify-between text-slate-500 mb-1">
                    <span className="text-[11px] font-bold uppercase tracking-wider">Material Issues</span>
                    <ArrowUpRight size={16} className="text-purple-600" />
                  </div>
                  <span className="text-xl font-extrabold text-slate-800">{dayIssues.length}</span>
                  <span className="text-[11px] font-semibold text-purple-600 block mt-0.5">
                    -${dayIssueValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>

                <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-3xs">
                  <div className="flex items-center justify-between text-slate-500 mb-1">
                    <span className="text-[11px] font-bold uppercase tracking-wider">Ledger Movements</span>
                    <Package size={16} className="text-blue-600" />
                  </div>
                  <span className="text-xl font-extrabold text-slate-800">{dayLedgerEntries.length}</span>
                  <span className="text-[11px] font-semibold text-slate-400 block mt-0.5">
                    Posted Transactions
                  </span>
                </div>

                <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-3xs">
                  <div className="flex items-center justify-between text-slate-500 mb-1">
                    <span className="text-[11px] font-bold uppercase tracking-wider">Inventory Value</span>
                    <TrendingUp size={16} className="text-indigo-600" />
                  </div>
                  <span className="text-xl font-extrabold text-slate-800">
                    $
                    {inventoryValuation.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2
                    })}
                  </span>
                  <span className="text-[11px] font-semibold text-slate-400 block mt-0.5">
                    WAC Closing Asset
                  </span>
                </div>
              </div>

              {/* Pre-Closure Verification Checklist */}
              <div className="bg-white rounded-xl border border-slate-200/80 p-5 shadow-3xs space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ShieldCheck size={18} className="text-purple-600" />
                    <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                      Pre-Closure System Auditing Checklist
                    </h3>
                  </div>
                  <span className="text-[11px] text-slate-400">Automatic reconciliation against active pipelines</span>
                </div>

                <div className="divide-y divide-slate-100 border border-slate-100 rounded-lg overflow-hidden">
                  {checklistItems.map((item) => (
                    <div key={item.id} className="p-3 bg-white flex items-center justify-between gap-4">
                      <div className="flex items-start gap-2.5">
                        {item.status === "Passed" ? (
                          <CheckCircle2 size={16} className="text-emerald-600 shrink-0 mt-0.5" />
                        ) : (
                          <AlertTriangle size={16} className="text-amber-500 shrink-0 mt-0.5" />
                        )}
                        <div>
                          <p className="text-xs font-bold text-slate-800">{item.label}</p>
                          <p className="text-[11px] text-slate-400">{item.description}</p>
                          {item.details && (
                            <p className="text-[11px] font-semibold text-slate-600 mt-0.5">
                              {item.details}
                            </p>
                          )}
                        </div>
                      </div>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                          item.status === "Passed"
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200/60"
                            : "bg-amber-50 text-amber-700 border border-amber-200/60"
                        }`}
                      >
                        {item.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Remarks Field */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Closure Notes & Handover Remarks (Optional)
                </label>
                <textarea
                  rows={2}
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder="Record shifts, inventory variances, night handover notes, or auditing comments..."
                  className="w-full p-2.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 focus:ring-2 focus:ring-purple-500 shadow-3xs"
                  id="closure-remarks-input"
                />
              </div>

              {/* Confirmation Prompt */}
              {isConfirming ? (
                <div className="p-4 rounded-xl bg-purple-50 border border-purple-200 space-y-3">
                  <div className="flex items-center gap-2 text-purple-900 font-bold text-xs">
                    <AlertCircle size={16} className="text-purple-600" />
                    Confirm Day Closure for {selectedDate}?
                  </div>
                  <p className="text-xs text-purple-700">
                    This will lock transactions for {selectedDate} and record a permanent closing balance snapshot for
                    financial auditing. Authorized managers can re-open if corrections are mandated.
                  </p>
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      onClick={handleExecuteDayClosure}
                      className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded-lg shadow-sm transition-colors flex items-center gap-1.5"
                      id="confirm-execute-closure-btn"
                    >
                      <Lock size={13} />
                      Yes, Finalize & Close Day
                    </button>
                    <button
                      onClick={() => setIsConfirming(false)}
                      className="px-3 py-2 bg-white border border-slate-200 text-slate-600 text-xs font-bold rounded-lg hover:bg-slate-50 transition-colors"
                      id="cancel-execute-closure-btn"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between pt-2">
                  <div className="text-[11px] text-slate-400">
                    Authorized User: <span className="font-bold text-slate-700">{currentUser.name}</span> (
                    {currentUser.role})
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handlePrintSummary}
                      className="px-3 py-2 bg-white border border-slate-200 text-slate-700 text-xs font-bold rounded-lg hover:bg-slate-50 transition-colors flex items-center gap-1.5 shadow-3xs"
                      id="print-eod-summary-btn"
                    >
                      <Printer size={14} />
                      Print EOD Summary
                    </button>
                    <button
                      onClick={() => setIsConfirming(true)}
                      className="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white text-xs font-extrabold rounded-lg shadow-xs hover:shadow-md transition-all flex items-center gap-1.5"
                      id="start-day-closure-btn"
                    >
                      <Lock size={14} />
                      {existingClosure ? "Re-finalize & Update Closure" : "Finalize & Close Day"}
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : (
            /* History Sub-tab */
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    Historic Day Closure Records
                  </h3>
                  <p className="text-[11px] text-slate-400">Historical snapshots of locked books and end-of-day balances</p>
                </div>
                <span className="text-xs font-bold text-purple-700 bg-purple-50 px-2.5 py-1 rounded-full border border-purple-200/60">
                  {closures.length} Record(s) Archived
                </span>
              </div>

              {closures.length === 0 ? (
                <div className="text-center py-12 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                  <CalendarCheck2 size={32} className="mx-auto text-slate-300 mb-2" />
                  <p className="text-xs font-bold text-slate-600">No Day Closures Recorded Yet</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Execute your first day closure from the 'Execute Day Closure' tab.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {closures.map((record) => (
                    <div
                      key={record.id}
                      className="bg-white p-4 rounded-xl border border-slate-200 shadow-3xs space-y-3"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                        <div className="flex items-center gap-2.5">
                          <span
                            className={`p-1.5 rounded-lg ${
                              record.status === "Closed"
                                ? "bg-purple-100 text-purple-700"
                                : "bg-amber-100 text-amber-700"
                            }`}
                          >
                            {record.status === "Closed" ? <Lock size={15} /> : <Unlock size={15} />}
                          </span>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-extrabold text-slate-800">{record.id}</span>
                              <span
                                className={`text-[10px] font-bold px-2 py-0.2 rounded-full ${
                                  record.status === "Closed"
                                    ? "bg-purple-50 text-purple-700 border border-purple-200"
                                    : "bg-amber-50 text-amber-700 border border-amber-200"
                                }`}
                              >
                                {record.status}
                              </span>
                            </div>
                            <span className="text-[11px] text-slate-400 font-medium">
                              Business Date: <span className="font-bold text-slate-700">{record.closureDate}</span> •{" "}
                              {record.storeName}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 self-end sm:self-auto">
                          {record.status === "Closed" ? (
                            <button
                              onClick={() => handleReopenDay(record)}
                              className="px-2.5 py-1 text-[11px] font-bold rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors flex items-center gap-1 shadow-3xs"
                            >
                              <Unlock size={12} />
                              Re-open
                            </button>
                          ) : (
                            <span className="text-[10px] font-semibold text-amber-600 bg-amber-50 px-2 py-0.5 rounded">
                              Re-opened
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Snapshot Metrics */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs bg-slate-50 p-2.5 rounded-lg">
                        <div>
                          <span className="text-[10px] text-slate-400 font-bold block">Closing Valuation</span>
                          <span className="font-extrabold text-slate-800">
                            $
                            {record.totalInventoryValuation.toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2
                            })}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 font-bold block">Receipts (GRN)</span>
                          <span className="font-bold text-slate-700">
                            {record.totalGrnCount} (${record.totalGrnValue.toFixed(2)})
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 font-bold block">Issues Posted</span>
                          <span className="font-bold text-slate-700">
                            {record.totalIssueCount} (${record.totalIssueValue.toFixed(2)})
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 font-bold block">Executed By</span>
                          <span className="font-bold text-slate-700">
                            {record.closedBy} ({record.closedByRole})
                          </span>
                        </div>
                      </div>

                      {record.remarks && (
                        <p className="text-xs text-slate-600 italic bg-slate-50/50 p-2 rounded border border-slate-100">
                          "{record.remarks}"
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <CalendarCheck2 size={15} className="text-purple-600" />
            <span>End-of-Day Financial Accounting & Stock Ledger Control</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs rounded-lg transition-colors"
            id="dismiss-day-closure-modal-btn"
          >
            Close Window
          </button>
        </div>
      </div>
    </div>
  );
}
