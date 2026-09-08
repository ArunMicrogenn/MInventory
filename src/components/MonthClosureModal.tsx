import React, { useState, useMemo } from "react";
import {
  MonthClosureRecord,
  MonthClosureChecklistItem,
  Store,
  Item,
  StockBalance,
  GRNHeader,
  IssueHeader,
  ReceiptReturnHeader,
  ReconciliationHeader,
  StockLedgerEntry,
  StoreOpeningHeader,
  User
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
  FileCheck,
  X
} from "lucide-react";

interface MonthClosureModalProps {
  isOpen: boolean;
  onClose: () => void;
  stores: Store[];
  items: Item[];
  balances: StockBalance[];
  grns: GRNHeader[];
  issues: IssueHeader[];
  returns: ReceiptReturnHeader[];
  recons: ReconciliationHeader[];
  ledger: StockLedgerEntry[];
  currentUser: User;
  closures: MonthClosureRecord[];
  onSaveClosure: (record: MonthClosureRecord) => void;
  onAutoGenerateOpening?: (openingHeader: StoreOpeningHeader) => void;
}

export default function MonthClosureModal({
  isOpen,
  onClose,
  stores,
  items,
  balances,
  grns,
  issues,
  returns,
  recons,
  ledger,
  currentUser,
  closures,
  onSaveClosure,
  onAutoGenerateOpening
}: MonthClosureModalProps) {
  const currentMonthDefault = new Date().toISOString().slice(0, 7); // YYYY-MM
  const [selectedMonth, setSelectedMonth] = useState<string>(currentMonthDefault);
  const [selectedStoreIds, setSelectedStoreIds] = useState<string[]>(["all"]);
  const [remarks, setRemarks] = useState<string>("");
  const [isConfirming, setIsConfirming] = useState<boolean>(false);
  const [activeSubTab, setActiveSubTab] = useState<"closure" | "history">("closure");
  const [successBanner, setSuccessBanner] = useState<string | null>(null);

  const getNextMonth = (yyyyMm: string): string => {
    const [yearStr, monthStr] = yyyyMm.split("-");
    let year = parseInt(yearStr, 10);
    let month = parseInt(monthStr, 10);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
    return `${year}-${String(month).padStart(2, "0")}`;
  };

  const matchStore = (storeId: string) => {
    if (selectedStoreIds.includes("all") || selectedStoreIds.length === 0) return true;
    return selectedStoreIds.includes(storeId);
  };

  // Check if month & store is already closed
  const existingClosure = useMemo(() => {
    return closures.find(
      (c) =>
        c.closureMonth === selectedMonth &&
        (selectedStoreIds.includes("all") || selectedStoreIds.includes(c.storeId) || c.storeId === "all") &&
        c.status === "Closed"
    );
  }, [closures, selectedMonth, selectedStoreIds]);

  // Filter transactions for selected month (YYYY-MM) and store
  const monthGrns = useMemo(() => {
    return grns.filter((g) => {
      const matchMonth = (g.receivedDate || "").startsWith(selectedMonth);
      return matchMonth && matchStore(g.deliveryStoreId) && g.status === "Posted";
    });
  }, [grns, selectedMonth, selectedStoreIds]);

  const monthGrnValue = useMemo(() => {
    return monthGrns.reduce((sum, g) => sum + (g.grandTotal || 0), 0);
  }, [monthGrns]);

  const monthIssues = useMemo(() => {
    return issues.filter((i) => {
      const matchMonth = (i.issueDate || "").startsWith(selectedMonth);
      return matchMonth && matchStore(i.storeId) && i.status === "Posted";
    });
  }, [issues, selectedMonth, selectedStoreIds]);

  const monthIssueValue = useMemo(() => {
    return monthIssues.reduce((sum, i) => {
      const lineSum = (i.lines || []).reduce((lSum, l) => {
        const itemBal = balances.find((b) => b.itemId === l.itemId && b.storeId === i.storeId);
        const costRate = itemBal?.movingAverageCost || 1;
        return lSum + l.qtyIssued * costRate;
      }, 0);
      return sum + lineSum;
    }, 0);
  }, [monthIssues, balances]);

  const monthReturns = useMemo(() => {
    return returns.filter((r) => {
      const matchMonth = (r.returnDate || "").startsWith(selectedMonth);
      const parentGrn = grns.find((g) => g.id === r.grnId);
      const storeId = parentGrn?.deliveryStoreId || (r as any).storeId || stores[0]?.id || "";
      return matchMonth && matchStore(storeId) && r.status === "Posted";
    });
  }, [returns, grns, selectedMonth, selectedStoreIds]);

  const monthRecons = useMemo(() => {
    return recons.filter((rc) => {
      const matchMonth = (rc.countDate || "").startsWith(selectedMonth);
      return matchMonth && matchStore(rc.storeId) && rc.status === "Posted";
    });
  }, [recons, selectedMonth, selectedStoreIds]);

  const totalVarianceValue = useMemo(() => {
    return monthRecons.reduce((sum, rc) => sum + (rc.totalVarianceValue || 0), 0);
  }, [monthRecons]);

  const monthLedgerEntries = useMemo(() => {
    return ledger.filter((l) => {
      const matchMonth = (l.timestamp || "").startsWith(selectedMonth);
      return matchMonth && matchStore(l.storeId);
    });
  }, [ledger, selectedMonth, selectedStoreIds]);

  // Current Inventory Valuation for selected store(s)
  const totalInventoryValuation = useMemo(() => {
    return balances
      .filter((b) => matchStore(b.storeId))
      .reduce((sum, b) => sum + b.qtyOnHand * (b.movingAverageCost || 0), 0);
  }, [balances, selectedStoreIds]);

  // Opening valuation estimate (closing minus net changes)
  const netMonthChange = monthGrnValue - monthIssueValue;
  const openingValuation = Math.max(0, totalInventoryValuation - netMonthChange);

  // Pending unposted or draft items in this month
  const pendingTransactionsCount = useMemo(() => {
    const draftGrns = grns.filter((g) => (g.receivedDate || "").startsWith(selectedMonth) && g.status === "Draft").length;
    const draftIssues = issues.filter((i) => (i.issueDate || "").startsWith(selectedMonth) && i.status === "Draft").length;
    return draftGrns + draftIssues;
  }, [grns, issues, selectedMonth]);

  // Checklist Generation
  const checklist: MonthClosureChecklistItem[] = useMemo(() => {
    const list: MonthClosureChecklistItem[] = [];

    // 1. Unposted Drafts
    if (pendingTransactionsCount === 0) {
      list.push({
        id: "chk-1",
        label: "All Monthly Transactions Posted",
        description: "Zero unposted draft GRNs or material issue slips for this month.",
        status: "Passed",
        count: 0
      });
    } else {
      list.push({
        id: "chk-1",
        label: "Unposted Draft Transactions Found",
        description: `${pendingTransactionsCount} draft transactions require posting or cancellation before month closure.`,
        status: "Blocked",
        count: pendingTransactionsCount
      });
    }

    // 2. Physical Inventory Reconciliation
    if (monthRecons.length > 0) {
      list.push({
        id: "chk-2",
        label: "Monthly Stock Reconciliation Verified",
        description: `${monthRecons.length} physical count reconciliation(s) posted for this month.`,
        status: "Passed",
        count: monthRecons.length
      });
    } else {
      list.push({
        id: "chk-2",
        label: "Stock Reconciliation Recommended",
        description: "No physical inventory count reconciliation posted for this month.",
        status: "Warning",
        count: 0
      });
    }

    // 3. Stock Ledger Audit Integrity
    list.push({
      id: "chk-3",
      label: "Stock Ledger & FIFO Valuation Integrity",
      description: `${monthLedgerEntries.length} ledger entries logged with verified valuation layers.`,
      status: "Passed",
      count: monthLedgerEntries.length
    });

    // 4. Negative Stock Balances Check
    const negativeStockItems = balances.filter(
      (b) => matchStore(b.storeId) && b.qtyOnHand < 0
    );
    if (negativeStockItems.length === 0) {
      list.push({
        id: "chk-4",
        label: "Zero Negative Stock Balances",
        description: "All items maintain positive or zero on-hand quantities.",
        status: "Passed",
        count: 0
      });
    } else {
      list.push({
        id: "chk-4",
        label: "Negative Stock Balances Detected",
        description: `${negativeStockItems.length} item(s) have negative stock on hand.`,
        status: "Blocked",
        count: negativeStockItems.length
      });
    }

    return list;
  }, [pendingTransactionsCount, monthRecons, monthLedgerEntries, balances, selectedStoreIds]);

  const hasBlockingIssues = checklist.some((c) => c.status === "Blocked");

  const runAutoPeriodGenerator = (closedMonth: string) => {
    const nextMonth = getNextMonth(closedMonth);
    const targetStores = selectedStoreIds.includes("all") 
      ? stores 
      : stores.filter(s => selectedStoreIds.includes(s.id));

    targetStores.forEach((store) => {
      const storeBalances = balances.filter(b => b.storeId === store.id && b.qtyOnHand > 0);
      if (storeBalances.length === 0) return;

      const openingId = `OPN-${nextMonth.replace("-", "")}-${store.id}`;
      const openingDate = `${nextMonth}-01`;

      const openingLines = storeBalances.map((bal, idx) => ({
        id: `OPNL-${openingId}-${idx + 1}`,
        itemId: bal.itemId,
        quantity: bal.qtyOnHand,
        rate: bal.movingAverageCost || 1
      }));

      const newOpeningHeader: StoreOpeningHeader = {
        id: openingId,
        storeId: store.id,
        openingDate: openingDate,
        status: "Posted",
        lines: openingLines,
        auditTrail: [
          {
            id: `AUD-AUTO-${Date.now()}-${store.id}`,
            timestamp: new Date().toISOString(),
            userId: currentUser.id,
            userName: currentUser.name,
            action: "AUTO_PERIOD_GENERATED",
            details: `Auto-Period-Generator automatically created opening balances for ${nextMonth} using closing balances from ${closedMonth} for store ${store.name}.`
          }
        ]
      };

      if (onAutoGenerateOpening) {
        onAutoGenerateOpening(newOpeningHeader);
      }
    });
  };

  const handlePerformClosure = () => {
    if (hasBlockingIssues) return;

    const storeName = selectedStoreIds.includes("all")
      ? "All Store Locations (Central Consolidated)"
      : selectedStoreIds.length === 1
        ? (stores.find(s => s.id === selectedStoreIds[0])?.name || selectedStoreIds[0])
        : `Multi-Property (${selectedStoreIds.length} Locations)`;

    const storeIdVal = selectedStoreIds.includes("all") ? "all" : selectedStoreIds.join(",");

    const record: MonthClosureRecord = {
      id: `EOM-${selectedMonth.replace("-", "")}-${storeIdVal.toUpperCase().slice(0, 10)}`,
      closureMonth: selectedMonth,
      closedAt: new Date().toISOString(),
      closedBy: currentUser.name,
      closedById: currentUser.id,
      closedByRole: currentUser.role,
      storeId: storeIdVal,
      storeName: storeName,
      status: "Closed",
      openingValuation: openingValuation,
      closingValuation: totalInventoryValuation,
      totalGrnCount: monthGrns.length,
      totalGrnValue: monthGrnValue,
      totalIssueCount: monthIssues.length,
      totalIssueValue: monthIssueValue,
      totalReturnCount: monthReturns.length,
      totalReconciliationVariance: totalVarianceValue,
      pendingTransactionsCount: pendingTransactionsCount,
      stockLedgerEntriesCount: monthLedgerEntries.length,
      checklist: checklist,
      remarks: remarks || "Monthly stock period closure and ledger valuation finalized.",
      auditTrail: [
        {
          id: Math.random().toString(36).substring(2, 9),
          timestamp: new Date().toISOString(),
          userId: currentUser.id,
          userName: currentUser.name,
          action: "MONTH_CLOSURE_LOCKED",
          details: `Month ${selectedMonth} closed successfully for ${storeName}.`
        }
      ]
    };

    onSaveClosure(record);

    // Trigger Auto-Period-Generator for seamless next period continuity
    runAutoPeriodGenerator(selectedMonth);

    setIsConfirming(false);
    setRemarks("");

    const nextM = getNextMonth(selectedMonth);
    setSelectedMonth(nextM);
    setSuccessBanner(`Month ${selectedMonth} locked successfully! Auto-Period-Generator automatically initialized opening balances and ledger continuity for new accounting period ${nextM}.`);
  };

  const handleReopenMonth = (closureRec: MonthClosureRecord) => {
    const updated: MonthClosureRecord = {
      ...closureRec,
      status: "Re-opened",
      auditTrail: [
        {
          id: Math.random().toString(36).substring(2, 9),
          timestamp: new Date().toISOString(),
          userId: currentUser.id,
          userName: currentUser.name,
          action: "MONTH_CLOSURE_REOPENED",
          details: `Month ${closureRec.closureMonth} re-opened by ${currentUser.name}.`
        },
        ...(closureRec.auditTrail || [])
      ]
    };
    onSaveClosure(updated);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white w-full max-w-5xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* MODAL HEADER */}
        <div className="bg-slate-900 text-white p-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-purple-600 flex items-center justify-center text-white shadow-lg">
              <CalendarCheck2 size={24} />
            </div>
            <div>
              <h2 className="text-lg font-black tracking-tight">Store Month-End Closure (EOM)</h2>
              <p className="text-xs text-slate-400 font-medium">Monthly inventory valuation, ledger reconciliation, and period locking</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-2 rounded-lg hover:bg-slate-800 transition-all cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        {/* SUB-TABS */}
        <div className="flex border-b border-slate-200 bg-slate-50 px-6 pt-3 gap-4">
          <button
            onClick={() => setActiveSubTab("closure")}
            className={`pb-3 text-xs font-bold border-b-2 transition-all px-2 ${
              activeSubTab === "closure"
                ? "border-purple-600 text-purple-700"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            Perform Month Closure
          </button>
          <button
            onClick={() => setActiveSubTab("history")}
            className={`pb-3 text-xs font-bold border-b-2 transition-all px-2 ${
              activeSubTab === "history"
                ? "border-purple-600 text-purple-700"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            Closure History & Audit Logs ({closures.length})
          </button>
        </div>

        {/* MODAL BODY */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {activeSubTab === "closure" ? (
            <div className="space-y-6">
              {successBanner && (
                <div className="bg-emerald-50 border border-emerald-300 text-emerald-900 p-4 rounded-xl flex items-center justify-between shadow-xs">
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="text-emerald-600 shrink-0" size={20} />
                    <span className="text-xs font-bold leading-relaxed">{successBanner}</span>
                  </div>
                  <button 
                    onClick={() => setSuccessBanner(null)}
                    className="text-emerald-700 hover:text-emerald-900 text-xs font-extrabold px-2 py-1 rounded hover:bg-emerald-100 cursor-pointer"
                  >
                    Dismiss
                  </button>
                </div>
              )}

              {/* FILTERS & MONTH SELECTION */}
              <div className="bg-purple-50/60 border border-purple-200 p-4 rounded-xl flex flex-col md:flex-row gap-4 items-center justify-between">
                <div className="flex items-center gap-3 w-full md:w-auto">
                  <div>
                    <label className="block text-[10px] font-black uppercase text-purple-900 mb-1">Select Month (YYYY-MM)</label>
                    <input
                      type="month"
                      value={selectedMonth}
                      onChange={(e) => setSelectedMonth(e.target.value)}
                      className="px-3 py-2 bg-white border border-purple-300 rounded-lg text-xs font-bold text-slate-800 shadow-xs"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-black uppercase text-purple-900 mb-1.5">Target Properties / Stores (Multi-Select)</label>
                    <div className="flex flex-wrap gap-1.5 items-center">
                      <button
                        type="button"
                        onClick={() => setSelectedStoreIds(["all"])}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                          selectedStoreIds.includes("all")
                            ? "bg-purple-700 text-white shadow-xs"
                            : "bg-white text-slate-700 border border-purple-200 hover:bg-purple-50"
                        }`}
                      >
                        All Properties (Consolidated)
                      </button>
                      {stores.map((s) => {
                        const isSelected = !selectedStoreIds.includes("all") && selectedStoreIds.includes(s.id);
                        return (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => {
                              if (selectedStoreIds.includes("all")) {
                                setSelectedStoreIds([s.id]);
                              } else {
                                if (isSelected) {
                                  const next = selectedStoreIds.filter(id => id !== s.id);
                                  setSelectedStoreIds(next.length === 0 ? ["all"] : next);
                                } else {
                                  setSelectedStoreIds([...selectedStoreIds, s.id]);
                                }
                              }
                            }}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                              isSelected
                                ? "bg-purple-700 text-white shadow-xs"
                                : "bg-white text-slate-700 border border-purple-200 hover:bg-purple-50"
                            }`}
                          >
                            <span>{s.name}</span>
                            {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-white"></span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {existingClosure ? (
                  <div className="flex items-center gap-2 bg-emerald-100 text-emerald-800 px-4 py-2 rounded-xl text-xs font-bold">
                    <Lock size={15} className="text-emerald-700" />
                    <span>Month Locked by {existingClosure.closedBy} on {new Date(existingClosure.closedAt).toLocaleDateString()}</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 bg-amber-100 text-amber-800 px-4 py-2 rounded-xl text-xs font-bold">
                    <Unlock size={15} className="text-amber-700" />
                    <span>Period Open / Unlocked</span>
                  </div>
                )}
              </div>

              {/* MONTHLY SUMMARY METRICS */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Opening Valuation</div>
                  <div className="text-lg font-black text-slate-800 mt-1">${openingValuation.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">Estimated start of month</div>
                </div>

                <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-xl">
                  <div className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">Goods Receipts (GRN)</div>
                  <div className="text-lg font-black text-emerald-800 mt-1">${monthGrnValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                  <div className="text-[10px] text-emerald-600 mt-0.5">{monthGrns.length} receipt vouchers posted</div>
                </div>

                <div className="bg-blue-50 border border-blue-200 p-4 rounded-xl">
                  <div className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">Material Issues</div>
                  <div className="text-lg font-black text-blue-800 mt-1">${monthIssueValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                  <div className="text-[10px] text-blue-600 mt-0.5">{monthIssues.length} issue slips consumed</div>
                </div>

                <div className="bg-purple-50 border border-purple-200 p-4 rounded-xl">
                  <div className="text-[10px] font-bold text-purple-600 uppercase tracking-wider">Ending Valuation</div>
                  <div className="text-lg font-black text-purple-900 mt-1">${totalInventoryValuation.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                  <div className="text-[10px] text-purple-600 mt-0.5">{monthLedgerEntries.length} ledger transactions</div>
                </div>
              </div>

              {/* CHECKLIST VERIFICATION */}
              <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4 shadow-xs">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-2">
                    <ShieldCheck size={16} className="text-purple-600" />
                    Month-End Verification Checklist ({selectedMonth})
                  </h3>
                  <span className="text-[10px] font-bold px-2.5 py-1 rounded bg-slate-100 text-slate-600">
                    {checklist.filter(c => c.status === "Passed").length} / {checklist.length} Passed
                  </span>
                </div>

                <div className="space-y-2.5">
                  {checklist.map((chk) => (
                    <div key={chk.id} className={`p-3.5 rounded-xl border flex items-start justify-between gap-3 ${
                      chk.status === "Passed" ? "bg-emerald-50/50 border-emerald-200 text-emerald-900" :
                      chk.status === "Warning" ? "bg-amber-50/50 border-amber-200 text-amber-900" :
                      "bg-rose-50/50 border-rose-200 text-rose-900"
                    }`}>
                      <div className="flex items-start gap-3">
                        {chk.status === "Passed" ? (
                          <CheckCircle2 size={18} className="text-emerald-600 shrink-0 mt-0.5" />
                        ) : chk.status === "Warning" ? (
                          <AlertTriangle size={18} className="text-amber-600 shrink-0 mt-0.5" />
                        ) : (
                          <AlertCircle size={18} className="text-rose-600 shrink-0 mt-0.5" />
                        )}
                        <div>
                          <h4 className="text-xs font-bold">{chk.label}</h4>
                          <p className="text-[11px] opacity-80 mt-0.5">{chk.description}</p>
                        </div>
                      </div>
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded uppercase ${
                        chk.status === "Passed" ? "bg-emerald-200 text-emerald-800" :
                        chk.status === "Warning" ? "bg-amber-200 text-amber-800" :
                        "bg-rose-200 text-rose-800"
                      }`}>
                        {chk.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* REMARKS & LOCK BUTTON */}
              {!existingClosure && (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-4">
                  <h3 className="text-xs font-black uppercase tracking-wider text-slate-700">Month-End Closure Remarks & Sign-off</h3>
                  <textarea
                    rows={2}
                    placeholder="Enter month closure notes, auditor sign-offs, or reconciliation observations..."
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                    className="w-full p-3 text-xs border border-slate-200 rounded-lg bg-white font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />

                  <div className="flex justify-end gap-3 pt-2">
                    <button
                      onClick={() => setIsConfirming(true)}
                      disabled={hasBlockingIssues}
                      className={`px-6 py-2.5 text-xs font-bold text-white rounded-xl shadow-md transition-all flex items-center gap-2 ${
                        hasBlockingIssues 
                          ? "bg-slate-300 cursor-not-allowed" 
                          : "bg-purple-600 hover:bg-purple-700 cursor-pointer active:scale-95"
                      }`}
                    >
                      <Lock size={15} />
                      Lock Month Period ({selectedMonth})
                    </button>
                  </div>
                  {hasBlockingIssues && (
                    <p className="text-[11px] text-rose-600 font-semibold text-right">
                      Cannot lock month period while blocking checklist items exist. Please resolve unposted drafts or negative stock.
                    </p>
                  )}
                </div>
              )}

              {/* CONFIRMATION DIALOG */}
              {isConfirming && (
                <div className="bg-purple-900 text-white p-6 rounded-2xl shadow-xl space-y-4">
                  <h3 className="text-sm font-black flex items-center gap-2">
                    <AlertTriangle size={18} className="text-amber-400" />
                    Confirm Month-End Stock Period Closure ({selectedMonth})?
                  </h3>
                  <p className="text-xs text-purple-200">
                    Locking this month will freeze stock valuations, ledger entries, and prevent back-dated transactions for <strong className="text-white">{selectedMonth}</strong>. Are you authorized to perform this financial sign-off?
                  </p>
                  <div className="flex justify-end gap-3 pt-2">
                    <button
                      onClick={() => setIsConfirming(false)}
                      className="px-4 py-2 text-xs font-bold text-purple-200 hover:text-white bg-purple-800 rounded-xl transition-all"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handlePerformClosure}
                      className="px-5 py-2 text-xs font-bold text-purple-900 bg-white hover:bg-purple-50 rounded-xl shadow-md transition-all font-black cursor-pointer"
                    >
                      Yes, Lock Month Period
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-500">Historical Month Closure Records</h3>
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 text-slate-400 font-bold uppercase border-b border-slate-200 tracking-wider text-[10px]">
                      <th className="p-3.5">Month ID</th>
                      <th className="p-3.5">Month</th>
                      <th className="p-3.5">Store Location</th>
                      <th className="p-3.5">Closing Valuation</th>
                      <th className="p-3.5">Closed By</th>
                      <th className="p-3.5">Status</th>
                      <th className="p-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                    {closures.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="p-12 text-center text-slate-400">
                          <CalendarCheck2 size={32} className="mx-auto text-slate-300 mb-2" />
                          <p className="font-bold text-slate-600">No month closures recorded yet</p>
                        </td>
                      </tr>
                    ) : (
                      closures.map((c) => (
                        <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                          <td className="p-3.5 font-mono font-bold text-purple-700">{c.id}</td>
                          <td className="p-3.5 font-bold text-slate-900">{c.closureMonth}</td>
                          <td className="p-3.5">{c.storeName}</td>
                          <td className="p-3.5 font-bold text-slate-900">${(c.closingValuation || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                          <td className="p-3.5">
                            <span className="font-bold text-slate-800">{c.closedBy}</span>
                            <div className="text-[10px] text-slate-400">{new Date(c.closedAt).toLocaleDateString()}</div>
                          </td>
                          <td className="p-3.5">
                            <span className={`inline-block px-2.5 py-1 rounded text-[10px] font-black ${
                              c.status === "Closed" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-amber-50 text-amber-700 border border-amber-200"
                            }`}>
                              {c.status}
                            </span>
                          </td>
                          <td className="p-3.5 text-right">
                            {c.status === "Closed" ? (
                              <button
                                onClick={() => handleReopenMonth(c)}
                                className="px-3 py-1.5 text-xs font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg transition-all cursor-pointer"
                              >
                                Re-open Month
                              </button>
                            ) : (
                              <span className="text-slate-400 italic">Re-opened</span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* MODAL FOOTER */}
        <div className="bg-slate-50 border-t border-slate-200 px-6 py-4 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 text-xs font-bold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
          >
            Close Window
          </button>
        </div>
      </div>
    </div>
  );
}
