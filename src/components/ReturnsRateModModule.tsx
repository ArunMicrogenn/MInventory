import { useState } from "react";
import { GRNHeader, GRNLine, ReceiptReturnHeader, RateModHeader, Item, Store, Supplier, User, StockBalance, StockLedgerEntry } from "../types";
import { Plus, X, Eye, ShieldAlert, ArrowLeftRight, CheckCircle2, AlertTriangle, FileSpreadsheet } from "lucide-react";

interface ReturnsRateModProps {
  returns: ReceiptReturnHeader[];
  setReturns: (ret: ReceiptReturnHeader[]) => void;
  rateMods: RateModHeader[];
  setRateMods: (mods: RateModHeader[]) => void;
  grns: GRNHeader[];
  setGrns: (grns: GRNHeader[]) => void;
  items: Item[];
  stores: Store[];
  suppliers: Supplier[];
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

export default function ReturnsRateModModule({
  returns,
  setReturns,
  rateMods,
  setRateMods,
  grns,
  setGrns,
  items,
  stores,
  suppliers,
  balances,
  currentUser,
  onPostStockLedger
}: ReturnsRateModProps) {
  const [activeTab, setActiveTab] = useState<"returns" | "ratemods">("returns");
  const [selectedDoc, setSelectedDoc] = useState<{ type: "Return" | "RateMod"; doc: any } | null>(null);

  // Return Form states
  const [isCreatingReturn, setIsCreatingReturn] = useState(false);
  const [selectedGRNId, setSelectedGRNId] = useState("");
  const [returnLines, setReturnLines] = useState<Record<string, number>>({}); // grnLineId -> returnQty
  const [returnReasons, setReturnReasons] = useState<Record<string, string>>({}); // grnLineId -> reasonCode

  // Rate Mod Form states
  const [isCreatingRateMod, setIsCreatingRateMod] = useState(false);
  const [modGRNId, setModGRNId] = useState("");
  const [modRates, setModRates] = useState<Record<string, number>>({}); // grnLineId -> newRate
  const [modReasons, setModReasons] = useState<Record<string, string>>({}); // grnLineId -> reasonCode

  const handleGRNSelectForReturn = (grnId: string) => {
    setSelectedGRNId(grnId);
    const grn = grns.find(g => g.id === grnId);
    if (!grn) return;

    const qtys: Record<string, number> = {};
    const reasons: Record<string, string> = {};
    grn.lines.forEach(line => {
      qtys[line.id] = 0;
      reasons[line.id] = "damaged";
    });
    setReturnLines(qtys);
    setReturnReasons(reasons);
  };

  const handleGRNSelectForMod = (grnId: string) => {
    setModGRNId(grnId);
    const grn = grns.find(g => g.id === grnId);
    if (!grn) return;

    const rates: Record<string, number> = {};
    const reasons: Record<string, string> = {};
    grn.lines.forEach(line => {
      rates[line.id] = line.rate;
      reasons[line.id] = "invoice rate mismatch";
    });
    setModRates(rates);
    setModReasons(reasons);
  };

  // Post Supplier Return
  const handlePostReturn = () => {
    const grnObj = grns.find(g => g.id === selectedGRNId);
    if (!grnObj) return;

    const returnId = `RET-2026-000${returns.length + 1}`;
    const newLines: any[] = [];
    let hasError = false;

    grnObj.lines.forEach(line => {
      const retQty = returnLines[line.id] ?? 0;
      if (retQty <= 0) return;

      // Rule 1: Cannot return more than net received qty
      const netReceived = line.receivedQty - line.returnedQty;
      if (retQty > netReceived) {
        alert(`Return Blocked: Return qty ${retQty} exceeds net-received quantity ${netReceived} for item ${items.find(i => i.id === line.itemId)?.name}.`);
        hasError = true;
        return;
      }

      // Rule 2: Cannot return if there is insufficient stock on hand in the store!
      const currentStockObj = balances.find(b => b.storeId === grnObj.deliveryStoreId && b.itemId === line.itemId);
      const onHand = currentStockObj ? currentStockObj.qtyOnHand : 0;
      if (retQty > onHand) {
        alert(`Return Blocked: Insufficient stock available in ${stores.find(s => s.id === grnObj.deliveryStoreId)?.name} to return ${retQty} units. Current stock on hand is ${onHand}.`);
        hasError = true;
        return;
      }

      newLines.push({
        id: `RETL-${returnId}-${line.id.slice(-1)}`,
        itemId: line.itemId,
        grnLineId: line.id,
        returnQty: retQty,
        reasonCode: returnReasons[line.id] || "damaged"
      });
    });

    if (hasError || newLines.length === 0) return;

    const newReturnDoc: ReceiptReturnHeader = {
      id: returnId,
      grnId: grnObj.id,
      supplierId: grnObj.supplierId || "",
      status: "Posted", // Auto posts since it reduces on-hand physical stock
      debitNoteRef: `DN-${Math.floor(1000 + Math.random() * 9000)}`,
      returnDate: new Date().toISOString().split("T")[0],
      lines: newLines,
      auditTrail: [
        {
          id: `AUD-RET-${Date.now()}`,
          timestamp: new Date().toISOString(),
          userId: currentUser.id,
          userName: currentUser.name,
          action: "Posted",
          details: `Supplier return submitted and posted. Debit note reference: DN-${Math.floor(1000 + Math.random() * 9000)}`
        }
      ]
    };

    // 1. Post stock-out ledger reversing entries immediately
    newLines.forEach(line => {
      const origLine = grnObj.lines.find(gl => gl.id === line.grnLineId)!;
      onPostStockLedger(
        grnObj.deliveryStoreId,
        line.itemId,
        -line.returnQty, // negative qty for stock reversal
        origLine.rate, // returns are credited at original receipt cost!
        "Receipt Return",
        returnId,
        origLine.batchLotNumber
      );
    });

    // 2. Update GRN net received quantities
    const updatedGRNLines = grnObj.lines.map(gl => {
      const match = newLines.find(r => r.grnLineId === gl.id);
      if (match) {
        return { ...gl, returnedQty: gl.returnedQty + match.returnQty };
      }
      return gl;
    });

    // Recalculate GRN status
    const allReturned = updatedGRNLines.every(gl => gl.returnedQty >= gl.receivedQty);
    const nextGRNStatus = allReturned ? "Reversed" : "Posted";

    const updatedGRNs = grns.map(g => {
      if (g.id === grnObj.id) {
        return { ...g, status: nextGRNStatus as any, lines: updatedGRNLines };
      }
      return g;
    });

    setGrns(updatedGRNs);
    setReturns([...returns, newReturnDoc]);
    setIsCreatingReturn(false);
  };

  // Submit Rate Mod for approval
  const handleProposeRateMod = () => {
    const grnObj = grns.find(g => g.id === modGRNId);
    if (!grnObj) return;

    const modId = `MOD-2026-000${rateMods.length + 1}`;
    const modLines: any[] = [];
    let totalImpact = 0;

    grnObj.lines.forEach(line => {
      const newRate = modRates[line.id] ?? line.rate;
      if (newRate === line.rate) return; // skip lines without adjustments

      const impact = (newRate - line.rate) * line.receivedQty;
      totalImpact += impact;

      modLines.push({
        id: `MODL-${modId}-${line.id.slice(-1)}`,
        grnLineId: line.id,
        itemId: line.itemId,
        oldRate: line.rate,
        newRate: newRate,
        receivedQty: line.receivedQty,
        valueImpact: impact,
        reasonCode: modReasons[line.id] || "invoice rate mismatch"
      });
    });

    if (modLines.length === 0) {
      alert("No rates were adjusted.");
      return;
    }

    const newModDoc: RateModHeader = {
      id: modId,
      grnId: grnObj.id,
      status: "Pending Approval", // Mandatory approval before posting
      initiatedDate: new Date().toISOString().split("T")[0],
      lines: modLines,
      totalValueImpact: totalImpact,
      auditTrail: [
        {
          id: `AUD-${Date.now()}`,
          timestamp: new Date().toISOString(),
          userId: currentUser.id,
          userName: currentUser.name,
          action: "Proposed Rate Adjustment",
          details: `Discovered supplier billing mismatch. Proposing retroactive rate modifications with total asset value impact of $${totalImpact.toFixed(2)}.`
        }
      ]
    };

    setRateMods([...rateMods, newModDoc]);
    setIsCreatingRateMod(false);
  };

  return (
    <div className="space-y-6" id="returns-ratemod-layout">
      {/* Tab Selectors */}
      <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-xs flex justify-between items-center" id="module-header">
        <div className="flex gap-2 bg-slate-100 p-1 rounded-lg" id="module-tabs">
          <button
            onClick={() => { setActiveTab("returns"); setSelectedDoc(null); }}
            className={`px-4 py-1.5 text-xs font-bold rounded-md transition-colors ${
              activeTab === "returns" ? "bg-white text-rose-700 shadow-xs" : "text-slate-500 hover:text-slate-800"
            }`}
          >
            Supplier Returns (Debit Notes)
          </button>
          <button
            onClick={() => { setActiveTab("ratemods"); setSelectedDoc(null); }}
            className={`px-4 py-1.5 text-xs font-bold rounded-md transition-colors ${
              activeTab === "ratemods" ? "bg-white text-teal-800 shadow-xs" : "text-slate-500 hover:text-slate-800"
            }`}
          >
            Receipt Rate Modifications
          </button>
        </div>

        {activeTab === "returns" ? (
          <button
            onClick={() => setIsCreatingReturn(true)}
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg transition-colors shadow-xs"
            id="btn-trigger-return"
          >
            <Plus size={14} />
            Raise Supplier Return
          </button>
        ) : (
          <button
            onClick={() => setIsCreatingRateMod(true)}
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-lg transition-colors shadow-xs"
            id="btn-trigger-ratemod"
          >
            <Plus size={14} />
            Adjust Receipt Rates
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Records List */}
        <div className="lg:col-span-2 bg-white p-6 rounded-xl border border-slate-100 shadow-xs space-y-4">
          {activeTab === "returns" ? (
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-slate-700">Receipt Return Documents</h3>
              <div className="overflow-x-auto rounded-lg border border-slate-100">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 text-slate-400 font-bold uppercase border-b border-slate-100">
                      <th className="p-3">Return ID</th>
                      <th className="p-3">Source Receipt</th>
                      <th className="p-3">Supplier Destination</th>
                      <th className="p-3">Debit Note Link</th>
                      <th className="p-3">Date Sent</th>
                      <th className="p-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-600 font-medium">
                    {returns.map(ret => {
                      const supObj = suppliers.find(s => s.id === ret.supplierId);
                      return (
                        <tr key={ret.id} className="hover:bg-slate-50/50">
                          <td className="p-3 font-mono font-bold text-rose-700">{ret.id}</td>
                          <td className="p-3 font-mono text-slate-600">{ret.grnId}</td>
                          <td className="p-3 font-bold text-slate-700">{supObj?.name}</td>
                          <td className="p-3 font-mono font-bold text-purple-600">{ret.debitNoteRef || "Under Approval"}</td>
                          <td className="p-3">{ret.returnDate}</td>
                          <td className="p-3 text-right">
                            <button 
                              onClick={() => setSelectedDoc({ type: "Return", doc: ret })}
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
              <h3 className="text-sm font-bold text-slate-700">Receipt Rate Audit Adjustments</h3>
              <div className="overflow-x-auto rounded-lg border border-slate-100">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 text-slate-400 font-bold uppercase border-b border-slate-100">
                      <th className="p-3">Adjustment ID</th>
                      <th className="p-3">Source Receipt</th>
                      <th className="p-3">Date Initiated</th>
                      <th className="p-3">Financial Impact</th>
                      <th className="p-3">Workflow State</th>
                      <th className="p-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-600 font-medium">
                    {rateMods.map(mod => (
                      <tr key={mod.id} className="hover:bg-slate-50/50">
                        <td className="p-3 font-mono font-bold text-teal-800">{mod.id}</td>
                        <td className="p-3 font-mono text-slate-600">{mod.grnId}</td>
                        <td className="p-3">{mod.initiatedDate}</td>
                        <td className="p-3 font-bold">
                          <span className={mod.totalValueImpact >= 0 ? "text-emerald-600" : "text-rose-500"}>
                            ${mod.totalValueImpact.toFixed(2)}
                          </span>
                        </td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            mod.status === "Pending Approval" ? "bg-amber-100 text-amber-800" :
                            mod.status === "Posted" ? "bg-emerald-100 text-emerald-800" :
                            "bg-rose-100 text-rose-800"
                          }`}>
                            {mod.status}
                          </span>
                        </td>
                        <td className="p-3 text-right">
                          <button 
                            onClick={() => setSelectedDoc({ type: "RateMod", doc: mod })}
                            className="p-1 hover:bg-slate-100 text-slate-500 rounded"
                          >
                            <Eye size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
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

              {selectedDoc.type === "Return" ? (
                <div className="space-y-4">
                  <div className="p-3 bg-rose-50 border border-rose-100 rounded-lg space-y-1 text-xs">
                    <div className="flex justify-between font-bold text-rose-800">
                      <span>Status:</span>
                      <span>LEDGER-POSTED</span>
                    </div>
                    <div className="flex justify-between text-slate-600 pt-1 border-t border-rose-200/30">
                      <span>Debit Note Ref:</span>
                      <span className="font-bold text-slate-800">{selectedDoc.doc.debitNoteRef}</span>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block">Returned Items</span>
                    <div className="space-y-2">
                      {selectedDoc.doc.lines.map((line: any) => {
                        const itemObj = items.find(i => i.id === line.itemId);
                        return (
                          <div key={line.id} className="p-3 bg-slate-50 border border-slate-200/40 rounded-lg flex justify-between items-center text-xs">
                            <div>
                              <p className="font-bold text-slate-800">{itemObj?.name}</p>
                              <p className="text-[10px] text-slate-400 capitalize">Reason: {line.reasonCode}</p>
                            </div>
                            <span className="font-bold text-rose-600">-{line.returnQty} {itemObj?.unit}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="p-3 bg-teal-50 border border-teal-100 rounded-lg space-y-1 text-xs">
                    <div className="flex justify-between font-bold text-teal-800">
                      <span>Workflow Status:</span>
                      <span>{selectedDoc.doc.status}</span>
                    </div>
                    <div className="flex justify-between text-slate-600 pt-1 border-t border-teal-200/30">
                      <span>Total Value Impact:</span>
                      <span className={`font-bold ${selectedDoc.doc.totalValueImpact >= 0 ? "text-emerald-700" : "text-rose-600"}`}>
                        ${selectedDoc.doc.totalValueImpact.toFixed(2)}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block">Rate Adjustments</span>
                    <div className="space-y-2">
                      {selectedDoc.doc.lines.map((line: any) => {
                        const itemObj = items.find(i => i.id === line.itemId);
                        return (
                          <div key={line.id} className="p-3 bg-slate-50 border border-slate-200/40 rounded-lg space-y-2 text-xs">
                            <div className="flex justify-between font-bold text-slate-800">
                              <span>{itemObj?.name}</span>
                              <span>{line.receivedQty} {itemObj?.unit}</span>
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-[10px] text-slate-500 pt-1 border-t border-slate-100">
                              <div>Old Rate: <span className="font-bold text-slate-700">${line.oldRate.toFixed(2)}</span></div>
                              <div>New Rate: <span className="font-bold text-teal-700">${line.newRate.toFixed(2)}</span></div>
                              <div className="col-span-2 text-slate-400">Reason: "{line.reasonCode}"</div>
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
              <p className="text-sm font-semibold text-slate-600 mt-2">No Document Inspected</p>
              <p className="text-xs text-slate-400 max-w-[200px] mt-0.5">Select any Supplier Return or Rate Modification from the catalog list to inspect its line balances.</p>
            </div>
          )}
        </div>
      </div>

      {/* RAISE SUPPLIER RETURN MODAL */}
      {isCreatingReturn && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4" id="supplier-return-modal">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="text-sm font-bold text-slate-800">Raise Supplier Goods Return</h3>
                <p className="text-[10px] text-slate-400 mt-0.5">Physical supplier returns, debit notes indexing, and stock reversals.</p>
              </div>
              <button onClick={() => setIsCreatingReturn(false)} className="text-slate-400 hover:text-slate-600 p-1 rounded-full">
                <X size={16} />
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[55vh] overflow-y-auto">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">Select Original Posted GRN Receipt</label>
                <select
                  value={selectedGRNId}
                  onChange={(e) => handleGRNSelectForReturn(e.target.value)}
                  className="w-full p-2 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 bg-white"
                >
                  <option value="">-- Choose GRN --</option>
                  {grns.filter(g => g.status === "Posted").map(g => (
                    <option key={g.id} value={g.id}>{g.id} (Store: {stores.find(s => s.id === g.deliveryStoreId)?.code} - Value: ${g.grandTotal.toFixed(2)})</option>
                  ))}
                </select>
              </div>

              {selectedGRNId && (
                <div className="space-y-3 pt-3 border-t border-slate-100">
                  <span className="text-xs font-bold text-slate-700 block">Select Quantities & Reason Codes</span>
                  
                  {grns.find(g => g.id === selectedGRNId)?.lines.map(line => {
                    const itemObj = items.find(i => i.id === line.itemId);
                    const netReceived = line.receivedQty - line.returnedQty;
                    if (netReceived <= 0) return null;

                    return (
                      <div key={line.id} className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                        <div className="flex justify-between text-xs font-bold text-slate-800">
                          <span>{itemObj?.name}</span>
                          <span className="text-purple-600 bg-purple-50 px-2 py-0.5 rounded">Net Receipt Open: {netReceived} {itemObj?.unit}</span>
                        </div>

                        <div className="grid grid-cols-2 gap-3 items-end">
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-500 uppercase">Return Qty</label>
                            <input
                              type="number"
                              min="0"
                              max={netReceived}
                              value={returnLines[line.id] ?? 0}
                              onChange={(e) => setReturnLines({ ...returnLines, [line.id]: Math.min(netReceived, Math.max(0, parseInt(e.target.value) || 0)) })}
                              className="w-full p-1.5 border border-slate-200 rounded bg-white text-xs font-bold"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-500 uppercase">Return Reason</label>
                            <select
                              value={returnReasons[line.id] ?? "damaged"}
                              onChange={(e) => setReturnReasons({ ...returnReasons, [line.id]: e.target.value })}
                              className="w-full p-1.5 border border-slate-200 rounded bg-white text-xs text-slate-700"
                            >
                              <option value="damaged">Damaged Goods</option>
                              <option value="wrong item">Wrong item delivered</option>
                              <option value="quality rejection">Quality assurance rejection</option>
                              <option value="excess supply">Excess Supply</option>
                            </select>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-2">
              <button
                onClick={() => setIsCreatingReturn(false)}
                className="px-3.5 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-200 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handlePostReturn}
                disabled={!selectedGRNId}
                className="px-4 py-1.5 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg shadow-xs disabled:opacity-40"
              >
                Post Return & Reverse Stock
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ADJUST RECEIPT RATES MODAL */}
      {isCreatingRateMod && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4" id="rate-modification-modal">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="text-sm font-bold text-slate-800">Propose Receipt Rate Correction</h3>
                <p className="text-[10px] text-slate-400 mt-0.5">Triggers retroactive financial stock revaluation across posted receipts.</p>
              </div>
              <button onClick={() => setIsCreatingRateMod(false)} className="text-slate-400 hover:text-slate-600 p-1 rounded-full">
                <X size={16} />
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[55vh] overflow-y-auto">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">Select Posted GRN Receipt for Audit</label>
                <select
                  value={modGRNId}
                  onChange={(e) => handleGRNSelectForMod(e.target.value)}
                  className="w-full p-2 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 bg-white"
                >
                  <option value="">-- Choose GRN --</option>
                  {grns.filter(g => g.status === "Posted").map(g => (
                    <option key={g.id} value={g.id}>{g.id} (Store: {stores.find(s => s.id === g.deliveryStoreId)?.code})</option>
                  ))}
                </select>
              </div>

              {modGRNId && (
                <div className="space-y-3 pt-3 border-t border-slate-100">
                  <span className="text-xs font-bold text-slate-700 block">Propose Rates Discrepancies</span>
                  
                  {grns.find(g => g.id === modGRNId)?.lines.map(line => {
                    const itemObj = items.find(i => i.id === line.itemId);
                    const currentValImpact = ((modRates[line.id] ?? line.rate) - line.rate) * line.receivedQty;

                    return (
                      <div key={line.id} className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                        <div className="flex justify-between text-xs font-bold text-slate-800">
                          <span>{itemObj?.name}</span>
                          <span className="text-slate-500 font-mono">Original: ${line.rate.toFixed(2)} • Qty: {line.receivedQty}</span>
                        </div>

                        <div className="grid grid-cols-2 gap-3 items-end">
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-500 uppercase">Corrected Rate ($)</label>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={modRates[line.id] ?? line.rate}
                              onChange={(e) => setModRates({ ...modRates, [line.id]: parseFloat(e.target.value) || 0 })}
                              className="w-full p-1.5 border border-slate-200 rounded bg-white text-xs font-bold"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-500 uppercase">Audit Reason Code</label>
                            <select
                              value={modReasons[line.id] ?? "invoice rate mismatch"}
                              onChange={(e) => setModReasons({ ...modReasons, [line.id]: e.target.value })}
                              className="w-full p-1.5 border border-slate-200 rounded bg-white text-xs text-slate-700"
                            >
                              <option value="invoice rate mismatch">Invoice Rate Mismatch</option>
                              <option value="freight adjustment">Freight/Duty Adjustment</option>
                              <option value="rebate adjustment">Rebate adjustment</option>
                            </select>
                          </div>
                        </div>

                        {currentValImpact !== 0 && (
                          <div className="text-[11px] font-semibold flex justify-between pt-1 border-t border-slate-200/50">
                            <span className="text-slate-400">Adjusted Valuation Impact:</span>
                            <span className={currentValImpact >= 0 ? "text-emerald-600" : "text-rose-500"}>
                              {currentValImpact >= 0 ? "+" : ""}${currentValImpact.toFixed(2)}
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-2">
              <button
                onClick={() => setIsCreatingRateMod(false)}
                className="px-3.5 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-200 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleProposeRateMod}
                disabled={!modGRNId}
                className="px-4 py-1.5 text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-lg shadow-xs disabled:opacity-40"
              >
                Propose Rate Modification
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
