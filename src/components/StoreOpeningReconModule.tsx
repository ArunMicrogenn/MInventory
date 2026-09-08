import { useState } from "react";
import { StoreOpeningHeader, StoreOpeningLine, ReconciliationHeader, ReconciliationLine, Item, Store, User, StockBalance, AuditLog, TransactionStatus } from "../types";
import { Plus, X, Eye, FileSpreadsheet, ArrowRightLeft, ShieldAlert, CheckCircle2, RefreshCw } from "lucide-react";

interface StoreOpeningReconProps {
  openings: StoreOpeningHeader[];
  setOpenings: (ops: StoreOpeningHeader[]) => void;
  recons: ReconciliationHeader[];
  setRecons: (recs: ReconciliationHeader[]) => void;
  items: Item[];
  stores: Store[];
  balances: StockBalance[];
  currentUser: User;
  onPostStockLedger: (
    storeId: string,
    itemId: string,
    qty: number,
    rate: number,
    type: "Material Receipt" | "Receipt Return" | "Store Opening" | "Material Issue" | "Issue Return" | "Physical Reconciliation",
    txId: string,
    batch?: string
  ) => void;
}

export default function StoreOpeningReconModule({
  openings,
  setOpenings,
  recons,
  setRecons,
  items,
  stores,
  balances,
  currentUser,
  onPostStockLedger
}: StoreOpeningReconProps) {
  const [activeTab, setActiveTab] = useState<"opening" | "recon">("opening");
  const [selectedDoc, setSelectedDoc] = useState<{ type: "Opening" | "Recon"; doc: any } | null>(null);

  // Opening form states
  const [isCreatingOpening, setIsCreatingOpening] = useState(false);
  const [openStore, setOpenStore] = useState(stores[0]?.id || "");
  const [openDate, setOpenDate] = useState(new Date().toISOString().split("T")[0]);
  const [openLines, setOpenLines] = useState<{ itemId: string; qty: number; rate: number; batch: string; expiry?: string }[]>([]);

  // Opening line builder
  const [tempItem, setTempItem] = useState(items[0]?.id || "");
  const [tempQty, setTempQty] = useState(1);
  const [tempRate, setTempRate] = useState(0);
  const [tempBatch, setTempBatch] = useState("");
  const [tempExpiry, setTempExpiry] = useState("");

  // Reconciliation form states
  const [isCreatingRecon, setIsCreatingRecon] = useState(false);
  const [reconStore, setReconStore] = useState(stores[0]?.id || "");
  const [reconDate, setReconDate] = useState(new Date().toISOString().split("T")[0]);
  
  // Physical count inputs
  const [reconCounts, setReconCounts] = useState<Record<string, number>>({}); // itemId -> countedQty
  const [reconReasons, setReconReasons] = useState<Record<string, string>>({}); // itemId -> reason

  const handleOpeningItemSelect = (itemId: string) => {
    setTempItem(itemId);
    const itemObj = items.find(i => i.id === itemId);
    if (itemObj) {
      setTempRate(itemObj.standardRate);
    }
  };

  const handleAddOpeningLine = () => {
    if (tempQty <= 0 || tempRate <= 0) return;
    setOpenLines([...openLines, {
      itemId: tempItem,
      qty: tempQty,
      rate: tempRate,
      batch: tempBatch || `LOT-OPN-${Date.now().toString().slice(-4)}`,
      expiry: tempExpiry || undefined
    }]);
    setTempQty(1);
    setTempBatch("");
  };

  const handlePostOpening = () => {
    if (openLines.length === 0) {
      alert("Please add at least one line item.");
      return;
    }

    const openingId = `OPN-2026-000${openings.length + 1}`;
    const newOpeningDoc: StoreOpeningHeader = {
      id: openingId,
      storeId: openStore,
      openingDate: openDate,
      status: "Posted",
      lines: openLines.map((line, idx) => ({
        id: `OPNL-${openingId}-${idx + 1}`,
        itemId: line.itemId,
        batchLotNumber: line.batch,
        expiryDate: line.expiry,
        openingQty: line.qty,
        openingRate: line.rate
      })),
      auditTrail: [
        {
          id: `AUD-OPN-${Date.now()}`,
          timestamp: new Date().toISOString(),
          userId: currentUser.id,
          userName: currentUser.name,
          action: "Posted",
          details: `Opening balance sheet posted and baseline ledger locked for Store: ${openStore}.`
        }
      ]
    };

    // 1. Post to Stock Ledger Engine (instantly posts as Stock-In)
    openLines.forEach(line => {
      onPostStockLedger(
        openStore,
        line.itemId,
        line.qty,
        line.rate,
        "Store Opening",
        openingId,
        line.batch
      );
    });

    setOpenings([...openings, newOpeningDoc]);
    setIsCreatingOpening(false);
    setOpenLines([]);
  };

  // Initiate Recon - freezes theoretical levels
  const handleInitiateRecon = () => {
    const counts: Record<string, number> = {};
    const reasons: Record<string, string> = {};

    items.forEach(item => {
      const balObj = balances.find(b => b.storeId === reconStore && b.itemId === item.id);
      const theoretical = balObj ? balObj.qtyOnHand : 0;
      counts[item.id] = theoretical; // default counted to theoretical
      reasons[item.id] = "reconciliation discrepancy";
    });

    setReconCounts(counts);
    setReconReasons(reasons);
  };

  // Submit Physical Recon for approvals
  const handlePostRecon = () => {
    const reconId = `REC-2026-000${recons.length + 1}`;
    const newLines: ReconciliationLine[] = [];
    let totalAbsoluteVarianceValue = 0;

    items.forEach(item => {
      const balObj = balances.find(b => b.storeId === reconStore && b.itemId === item.id);
      const theoretical = balObj ? balObj.qtyOnHand : 0;
      const counted = reconCounts[item.id] ?? theoretical;

      if (counted === theoretical) return; // skip lines with zero variance

      const varianceQty = counted - theoretical;
      const rate = item.standardRate;
      const varianceValue = varianceQty * rate;

      totalAbsoluteVarianceValue += Math.abs(varianceValue);

      newLines.push({
        id: `RECL-${reconId}-${item.id.slice(-2)}`,
        itemId: item.id,
        bookQty: theoretical,
        physicalQty: counted,
        qtyVariance: varianceQty,
        valueVariance: varianceValue,
        remarks: reconReasons[item.id] || "reconciliation discrepancy"
      });
    });

    if (newLines.length === 0) {
      alert("All counted physical stocks perfectly match theoretical ledger records. No reconciliation is required!");
      return;
    }

    const newReconDoc: ReconciliationHeader = {
      id: reconId,
      storeId: reconStore,
      countDate: reconDate,
      isBlind: false,
      status: "Pending Approval",
      lines: newLines,
      totalVarianceValue: totalAbsoluteVarianceValue,
      remarks: "Physical stock take count submission",
      auditTrail: [
        {
          id: `AUD-REC-${Date.now()}`,
          timestamp: new Date().toISOString(),
          userId: currentUser.id,
          userName: currentUser.name,
          action: "Submitted",
          details: `Physical inventory count initiated. Identified ${newLines.length} line item discrepancies with total absolute variance value of $${totalAbsoluteVarianceValue.toFixed(2)}.`
        }
      ]
    };

    setRecons([...recons, newReconDoc]);
    setIsCreatingRecon(false);
    setReconCounts({});
  };

  return (
    <div className="space-y-6" id="opening-recon-layout">
      {/* Tab select */}
      <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-xs flex justify-between items-center">
        <div className="flex gap-2 bg-slate-100 p-1 rounded-lg">
          <button
            onClick={() => { setActiveTab("opening"); setSelectedDoc(null); }}
            className={`px-4 py-1.5 text-xs font-bold rounded-md transition-colors ${
              activeTab === "opening" ? "bg-white text-purple-700 shadow-xs" : "text-slate-500 hover:text-slate-800"
            }`}
          >
            Store Opening Seeding
          </button>
          <button
            onClick={() => { setActiveTab("recon"); setSelectedDoc(null); }}
            className={`px-4 py-1.5 text-xs font-bold rounded-md transition-colors ${
              activeTab === "recon" ? "bg-white text-amber-800 shadow-xs" : "text-slate-500 hover:text-slate-800"
            }`}
          >
            Physical Stock Reconciliation
          </button>
        </div>

        {activeTab === "opening" ? (
          <button
            onClick={() => setIsCreatingOpening(true)}
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors shadow-xs"
            id="btn-trigger-opening"
          >
            <Plus size={14} />
            Post Opening Stock
          </button>
        ) : (
          <button
            onClick={() => setIsCreatingRecon(true)}
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-lg transition-colors shadow-xs"
            id="btn-trigger-stocktake"
          >
            <Plus size={14} />
            Initiate Stocktake Count
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Records List */}
        <div className="lg:col-span-2 bg-white p-6 rounded-xl border border-slate-100 shadow-xs space-y-4">
          {activeTab === "opening" ? (
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-slate-700">Store Opening Balance Records</h3>
              <div className="overflow-x-auto rounded-lg border border-slate-100">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 text-slate-400 font-bold uppercase border-b border-slate-100">
                      <th className="p-3">Opening ID</th>
                      <th className="p-3">Store Location</th>
                      <th className="p-3">Opening Date</th>
                      <th className="p-3">Status</th>
                      <th className="p-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-600 font-medium">
                    {openings.map(op => {
                      const storeObj = stores.find(s => s.id === op.storeId);
                      return (
                        <tr key={op.id} className="hover:bg-slate-50/50">
                          <td className="p-3 font-mono font-bold text-purple-700">{op.id}</td>
                          <td className="p-3 font-semibold text-slate-700">{storeObj?.name}</td>
                          <td className="p-3">{op.openingDate}</td>
                          <td className="p-3">
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                              {op.status}
                            </span>
                          </td>
                          <td className="p-3 text-right">
                            <button 
                              onClick={() => setSelectedDoc({ type: "Opening", doc: op })}
                              className="p-1 hover:bg-slate-100 text-slate-500 rounded"
                            >
                              <Eye size={14} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-slate-700">Posted Physical Stocktake Audits</h3>
              <div className="overflow-x-auto rounded-lg border border-slate-100">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 text-slate-400 font-bold uppercase border-b border-slate-100">
                      <th className="p-3">Stocktake ID</th>
                      <th className="p-3">Store Audited</th>
                      <th className="p-3">Audit Date</th>
                      <th className="p-3">Status</th>
                      <th className="p-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-600 font-medium">
                    {recons.map(rec => {
                      const storeObj = stores.find(s => s.id === rec.storeId);
                      return (
                        <tr key={rec.id} className="hover:bg-slate-50/50">
                          <td className="p-3 font-mono font-bold text-amber-700">{rec.id}</td>
                          <td className="p-3 font-semibold text-slate-700">{storeObj?.name}</td>
                          <td className="p-3">{rec.countDate}</td>
                          <td className="p-3">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              rec.status === "Pending Approval" ? "bg-amber-100 text-amber-800" :
                              rec.status === "Posted" ? "bg-emerald-100 text-emerald-800" :
                              "bg-rose-100 text-rose-800"
                            }`}>
                              {rec.status}
                            </span>
                          </td>
                          <td className="p-3 text-right">
                            <button 
                              onClick={() => setSelectedDoc({ type: "Recon", doc: rec })}
                              className="p-1 hover:bg-slate-100 text-slate-500 rounded"
                            >
                              <Eye size={14} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Right Side Inspector */}
        <div className="bg-white p-6 rounded-xl border border-slate-100 shadow-xs">
          {selectedDoc ? (
            <div className="space-y-5" id="detail-pane">
              <div className="flex justify-between items-start pb-3 border-b border-slate-100">
                <div>
                  <span className="text-[10px] font-bold tracking-wider uppercase text-slate-400 font-mono">Detail Inspector</span>
                  <h3 className="text-sm font-bold text-slate-800">{selectedDoc.doc.id} Details</h3>
                </div>
                <button onClick={() => setSelectedDoc(null)} className="text-slate-400 hover:text-slate-600 p-0.5">
                  <X size={16} />
                </button>
              </div>

              {selectedDoc.type === "Opening" ? (
                <div className="space-y-4">
                  <div className="p-3 bg-purple-50 border border-purple-100 rounded-lg space-y-1 text-xs">
                    <div className="flex justify-between font-bold text-purple-800">
                      <span>Ledger Status:</span>
                      <span>OPENING-POSTED</span>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block">Opening Items Seeding</span>
                    <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                      {selectedDoc.doc.lines.map((line: StoreOpeningLine) => {
                        const itemObj = items.find(i => i.id === line.itemId);
                        return (
                          <div key={line.id} className="p-3 bg-slate-50 border border-slate-200/40 rounded-lg text-xs space-y-1">
                            <div className="flex justify-between font-bold text-slate-800">
                              <span>{itemObj?.name}</span>
                              <span className="text-purple-600 font-extrabold">+{line.quantity} {itemObj?.unit}</span>
                            </div>
                            <div className="flex justify-between text-[10px] text-slate-400 pt-1 border-t border-slate-100">
                              <span>Rate: ${line.rate.toFixed(2)}</span>
                              <span>Total: ${(line.quantity * line.rate).toFixed(2)}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="p-3 bg-amber-50 border border-amber-100 rounded-lg space-y-1 text-xs">
                    <div className="flex justify-between font-bold text-amber-800">
                      <span>Workflow Status:</span>
                      <span>{selectedDoc.doc.status}</span>
                    </div>
                    {selectedDoc.doc.approverRemarks && (
                      <p className="text-[11px] text-amber-900 mt-1">Remark: "{selectedDoc.doc.approverRemarks}"</p>
                    )}
                  </div>

                  <div className="space-y-3">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block">Variance Adjustments</span>
                    <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                      {selectedDoc.doc.lines.map((line: ReconciliationLine) => {
                        const itemObj = items.find(i => i.id === line.itemId);
                        return (
                          <div key={line.id} className="p-3 bg-slate-50 border border-slate-200/40 rounded-lg text-xs space-y-2">
                            <div className="flex justify-between font-bold text-slate-800">
                              <span>{itemObj?.name}</span>
                              <span className={line.qtyVariance >= 0 ? "text-emerald-600 font-extrabold" : "text-rose-500 font-extrabold"}>
                                {line.qtyVariance >= 0 ? "+" : ""}{line.qtyVariance} {itemObj?.unit}
                              </span>
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-[10px] text-slate-400 pt-1 border-t border-slate-100">
                              <div>Ledger theoretical: {line.bookQty}</div>
                              <div>Physical Counted: {line.physicalQty}</div>
                              <div className="col-span-2 font-bold text-slate-500">Value Shift: ${line.valueVariance.toFixed(2)}</div>
                              <div className="col-span-2 italic">Reason: "{line.remarks}"</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-center" id="empty-pane">
              <Eye size={28} className="text-slate-300" />
              <p className="text-sm font-semibold text-slate-600 mt-2">No Record Inspected</p>
              <p className="text-xs text-slate-400 max-w-[200px] mt-0.5">Select any Seeding or Reconciliation record from the list to audit theoretical vs. counted variances.</p>
            </div>
          )}
        </div>
      </div>

      {/* POST OPENING MODAL */}
      {isCreatingOpening && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4" id="opening-stock-modal">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="text-sm font-bold text-slate-800">Post Store Opening Stock Seeding</h3>
                <p className="text-[10px] text-slate-400 mt-0.5 font-medium">Initial system bootstrapping. Directly adds positive stock to ledger without GRN contracts.</p>
              </div>
              <button onClick={() => setIsCreatingOpening(false)} className="text-slate-400 hover:text-slate-600 p-1 rounded-full">
                <X size={16} />
              </button>
            </div>

            <div className="p-6 space-y-5 overflow-y-auto flex-1">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Target Store (Balance credit)</label>
                  <select
                    value={openStore}
                    onChange={(e) => setOpenStore(e.target.value)}
                    className="w-full p-2 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 bg-white"
                  >
                    {stores.map(s => <option key={s.id} value={s.id}>{s.name} ({s.code})</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Opening Date</label>
                  <input
                    type="date"
                    value={openDate}
                    onChange={(e) => setOpenDate(e.target.value)}
                    className="w-full p-2 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 bg-white"
                  />
                </div>
              </div>

              {/* Line Builder */}
              <div className="border-t border-slate-100 pt-4 space-y-3">
                <span className="text-xs font-bold text-slate-700 block">Opening Line Seeding</span>
                
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl grid grid-cols-1 sm:grid-cols-4 gap-2 items-end">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Select Item</label>
                    <select
                      value={tempItem}
                      onChange={(e) => handleOpeningItemSelect(e.target.value)}
                      className="w-full p-1.5 border border-slate-200 rounded bg-white text-xs text-slate-700"
                    >
                      {items.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Opening Qty</label>
                    <input
                      type="number"
                      min="1"
                      value={tempQty}
                      onChange={(e) => setTempQty(parseInt(e.target.value) || 1)}
                      className="w-full p-1 border border-slate-200 rounded text-xs bg-white text-slate-700"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Opening Unit Rate ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={tempRate}
                      onChange={(e) => setTempRate(parseFloat(e.target.value) || 0)}
                      className="w-full p-1 border border-slate-200 rounded text-xs bg-white text-slate-700 font-bold"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleAddOpeningLine}
                    className="py-1.5 px-3 text-xs font-bold text-white bg-slate-800 hover:bg-slate-950 rounded transition-colors"
                  >
                    Add Line
                  </button>
                </div>

                {/* Built Lines list */}
                <div className="border border-slate-150 rounded-lg max-h-[140px] overflow-y-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50 font-bold border-b border-slate-150 text-slate-500">
                        <th className="p-2">Item Name</th>
                        <th className="p-2">Qty</th>
                        <th className="p-2">Opening Rate</th>
                        <th className="p-2">Total Seeding Value</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                      {openLines.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="p-3 text-center text-slate-400 font-medium">No opening seeding lines added yet.</td>
                        </tr>
                      ) : (
                        openLines.map((line, idx) => {
                          const itemObj = items.find(i => i.id === line.itemId);
                          return (
                            <tr key={idx} className="hover:bg-slate-50/50">
                              <td className="p-2">{itemObj?.name}</td>
                              <td className="p-2 font-bold">{line.qty} {itemObj?.unit}</td>
                              <td className="p-2">${line.rate.toFixed(2)}</td>
                              <td className="p-2 font-bold text-slate-800">${(line.qty * line.rate).toFixed(2)}</td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-2">
              <button
                onClick={() => setIsCreatingOpening(false)}
                className="px-3.5 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-200 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handlePostOpening}
                className="px-4 py-1.5 text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-lg shadow-xs"
              >
                Post Opening Stock
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CREATE PHYSICAL RECONCILIATION MODAL */}
      {isCreatingRecon && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4" id="physical-recon-modal">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="text-sm font-bold text-slate-800">Physical Stocktake Reconciliation Count</h3>
                <p className="text-[10px] text-slate-400 mt-0.5 font-medium">Compares physical counts against system balances and creates correction proposals.</p>
              </div>
              <button onClick={() => setIsCreatingRecon(false)} className="text-slate-400 hover:text-slate-600 p-1 rounded-full">
                <X size={16} />
              </button>
            </div>

            <div className="p-6 space-y-5 overflow-y-auto flex-1">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Select Audit Store</label>
                  <select
                    value={reconStore}
                    onChange={(e) => setReconStore(e.target.value)}
                    className="w-full p-2 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 bg-white"
                  >
                    {stores.map(s => <option key={s.id} value={s.id}>{s.name} ({s.code})</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Stocktake Date</label>
                  <input
                    type="date"
                    value={reconDate}
                    onChange={(e) => setReconDate(e.target.value)}
                    className="w-full p-2 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 bg-white"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleInitiateRecon}
                  className="flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors shadow-xs"
                >
                  <RefreshCw size={14} />
                  Snapshot System Balances
                </button>
              </div>

              {Object.keys(reconCounts).length > 0 && (
                <div className="space-y-3 pt-3 border-t border-slate-100">
                  <span className="text-xs font-bold text-slate-700 block">Input Counted Physical Inventory</span>

                  <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                    {items.map(item => {
                      const balObj = balances.find(b => b.storeId === reconStore && b.itemId === item.id);
                      const theoretical = balObj ? balObj.qtyOnHand : 0;
                      const counted = reconCounts[item.id] ?? theoretical;
                      const variance = counted - theoretical;

                      return (
                        <div key={item.id} className="p-4 bg-slate-50 border border-slate-200 rounded-xl grid grid-cols-1 md:grid-cols-3 gap-3 items-center">
                          <div>
                            <p className="text-xs font-extrabold text-slate-800">{item.name}</p>
                            <p className="text-[10px] text-slate-400">Theoretical Stock: {theoretical} {item.unit}</p>
                          </div>

                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-500 uppercase">Physical Counted Qty</label>
                            <input
                              type="number"
                              min="0"
                              value={counted}
                              onChange={(e) => setReconCounts({ ...reconCounts, [item.id]: Math.max(0, parseInt(e.target.value) || 0) })}
                              className="w-full p-1.5 border border-slate-200 rounded bg-white text-xs font-bold"
                            />
                          </div>

                          <div className="space-y-1 md:pl-2">
                            <div className="flex justify-between items-center text-xs">
                              <span className="text-[10px] font-bold text-slate-500 uppercase">Variance:</span>
                              <span className={`font-bold ${variance === 0 ? "text-slate-400" : variance > 0 ? "text-emerald-600" : "text-rose-500"}`}>
                                {variance === 0 ? "0" : variance > 0 ? `+${variance}` : variance} {item.unit}
                              </span>
                            </div>
                            {variance !== 0 && (
                              <select
                                value={reconReasons[item.id] ?? "reconciliation discrepancy"}
                                onChange={(e) => setReconReasons({ ...reconReasons, [item.id]: e.target.value })}
                                className="w-full p-1 border border-slate-250 rounded text-[10px] bg-white text-slate-600"
                                required
                              >
                                <option value="reconciliation discrepancy">Count Discrepancy</option>
                                <option value="theft/shrinkage">Theft / Unrecorded loss</option>
                                <option value="unrecorded receipt">Unrecorded over-receipt</option>
                                <option value="spoilage written-off">Unreported spoilage</option>
                              </select>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-2">
              <button
                onClick={() => setIsCreatingRecon(false)}
                className="px-3.5 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-200 rounded-lg"
              >
                Discard
              </button>
              <button
                onClick={handlePostRecon}
                disabled={Object.keys(reconCounts).length === 0}
                className="px-4 py-1.5 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-lg shadow-xs disabled:opacity-40"
              >
                Propose Reconciliation Adjustments
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
