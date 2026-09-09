import { useState } from "react";
import { GRNHeader, GRNLine, POHeader, POLine, Item, Store, Supplier, User, SystemConfig } from "../types";
import { Plus, X, Eye, ShieldAlert, CheckCircle2, TrendingUp, AlertCircle, ShoppingCart } from "lucide-react";
import PrintButton from "./PrintButton";
import PrintDocumentModal from "./PrintDocumentModal";

interface GRNModuleProps {
  grns: GRNHeader[];
  setGrns: (grns: GRNHeader[]) => void;
  pos: POHeader[];
  setPos: (pos: POHeader[]) => void;
  items: Item[];
  stores: Store[];
  suppliers: Supplier[];
  currentUser: User;
  config: SystemConfig;
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

export default function GRNModule({
  grns,
  setGrns,
  pos,
  setPos,
  items,
  stores,
  suppliers,
  currentUser,
  config,
  onPostStockLedger
}: GRNModuleProps) {
  const [selectedGRN, setSelectedGRN] = useState<GRNHeader | null>(null);
  const [printGRN, setPrintGRN] = useState<GRNHeader | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  // Form states
  const [grnType, setGrnType] = useState<"PO" | "Direct">("PO");
  const [selectedPOId, setSelectedPOId] = useState("");
  const [directStore, setDirectStore] = useState(stores[0]?.id || "");
  const [directSupplier, setDirectSupplier] = useState(suppliers[0]?.id || "");
  const [directReason, setDirectReason] = useState("");

  // Receipt lines draft
  // mapped by PO line ID or a unique ID for direct
  const [receiptQtys, setReceiptQtys] = useState<Record<string, number>>({});
  const [receiptRates, setReceiptRates] = useState<Record<string, number>>({});
  const [receiptBatches, setReceiptBatches] = useState<Record<string, string>>({});
  const [receiptExpiries, setReceiptExpiries] = useState<Record<string, string>>({});
  const [receiptQCPass, setReceiptQCPass] = useState<Record<string, boolean>>({});

  // Direct receipt item list
  const [directLines, setDirectLines] = useState<{ itemId: string; qty: number; rate: number; batch: string; expiry?: string; qcPassed: boolean }[]>([]);
  const [tempItem, setTempItem] = useState(items[0]?.id || "");
  const [tempQty, setTempQty] = useState(1);
  const [tempRate, setTempRate] = useState(0);
  const [tempBatch, setTempBatch] = useState("");
  const [tempExpiry, setTempExpiry] = useState("");

  const handlePOSelect = (poId: string) => {
    setSelectedPOId(poId);
    const po = pos.find(p => p.id === poId);
    if (!po) return;

    // Initialize inputs based on PO lines
    const qtys: Record<string, number> = {};
    const rates: Record<string, number> = {};
    const batches: Record<string, string> = {};
    const expiries: Record<string, string> = {};
    const qc: Record<string, boolean> = {};

    po.lines.forEach(line => {
      const remaining = line.quantity - line.receivedQty;
      qtys[line.id] = Math.max(0, remaining);
      rates[line.id] = line.rate;
      batches[line.id] = `LOT-${poId.slice(-4)}-${line.id.slice(-1)}`;
      expiries[line.id] = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]; // +30 days
      
      const itemObj = items.find(i => i.id === line.itemId);
      qc[line.id] = itemObj?.qcRequired ? false : true; // default false (needs checking) if item mandates QC
    });

    setReceiptQtys(qtys);
    setReceiptRates(rates);
    setReceiptBatches(batches);
    setReceiptExpiries(expiries);
    setReceiptQCPass(qc);
  };

  const handleAddDirectLine = () => {
    if (tempQty <= 0 || tempRate <= 0) return;
    setDirectLines([...directLines, {
      itemId: tempItem,
      qty: tempQty,
      rate: tempRate,
      batch: tempBatch || `LOT-DIR-${Date.now().toString().slice(-4)}`,
      expiry: tempExpiry || undefined,
      qcPassed: true
    }]);
    setTempQty(1);
    setTempBatch("");
  };

  const handlePostGRN = (submitForApproval: boolean = false) => {
    const grnId = `GRN-2026-000${grns.length + 1}`;
    
    if (grnType === "PO") {
      const poObj = pos.find(p => p.id === selectedPOId);
      if (!poObj) return;

      // Validate tolerances & QC checks
      let hasError = false;
      const grnLines: GRNLine[] = [];

      poObj.lines.forEach(line => {
        const itemObj = items.find(i => i.id === line.itemId);
        const recQty = receiptQtys[line.id] ?? 0;
        const recRate = receiptRates[line.id] ?? 0;
        const qcPassed = receiptQCPass[line.id] ?? true;

        if (recQty <= 0) return; // skip zero lines

        // 1. Over-receipt check
        const openQty = line.quantity - line.receivedQty;
        const toleranceValue = openQty * (1 + config.overReceiptTolerancePct / 100);
        if (recQty > toleranceValue) {
          alert(`Over-receipt Blocked: Received qty ${recQty} exceeds ordered open qty ${openQty} beyond tolerance of ${config.overReceiptTolerancePct}%.`);
          hasError = true;
          return;
        }

        // 2. QC check block
        if (itemObj?.qcRequired && !qcPassed) {
          alert(`QC Check Blocked: Item ${itemObj.name} requires mandatory Quality Control verification before GRN receipt.`);
          hasError = true;
          return;
        }

        grnLines.push({
          id: `GRNL-${grnId}-${line.id.slice(-1)}`,
          itemId: line.itemId,
          orderedQty: line.quantity,
          receivedQty: recQty,
          rate: recRate,
          taxPct: line.taxPct,
          discountPct: line.discountPct,
          batchLotNumber: receiptBatches[line.id] || "LOT-DEFAULT",
          expiryDate: itemObj?.group === "Perishables" ? receiptExpiries[line.id] : undefined,
          qcPassed,
          returnedQty: 0,
          sourcePOLineId: line.id
        });
      });

      if (hasError || grnLines.length === 0) return;

      // Calculate totals
      let subTotal = 0;
      let taxTotal = 0;
      let discountTotal = 0;

      grnLines.forEach(line => {
        const lineSub = line.receivedQty * line.rate;
        const disc = lineSub * (line.discountPct / 100);
        const tax = (lineSub - disc) * (line.taxPct / 100);
        subTotal += lineSub;
        discountTotal += disc;
        taxTotal += tax;
      });

      const grandTotal = subTotal - discountTotal + taxTotal;

      const newGRN: GRNHeader = {
        id: grnId,
        propertyId: poObj.propertyId,
        sourcePOId: poObj.id,
        deliveryStoreId: poObj.deliveryStoreId,
        supplierId: poObj.supplierId,
        receivedDate: new Date().toISOString().split("T")[0],
        isDirect: false,
        status: submitForApproval ? "Pending Approval" : "Posted",
        lines: grnLines,
        subTotal,
        taxTotal,
        discountTotal,
        grandTotal,
        auditTrail: [
          {
            id: `AUD-${Date.now()}`,
            timestamp: new Date().toISOString(),
            userId: currentUser.id,
            userName: currentUser.name,
            action: submitForApproval ? "Submitted for Approval" : "Receipt Posted",
            details: submitForApproval
              ? `GRN ${grnId} submitted for Goods Inward Manager authorization.`
              : `GRN ${grnId} posted with physical arrival of materials. Stock accounts credited.`
          }
        ]
      };

      if (!submitForApproval) {
        // 1. Post to Stock Ledger Engine (instant post!)
        grnLines.forEach(line => {
          onPostStockLedger(
            poObj.deliveryStoreId,
            line.itemId,
            line.receivedQty,
            line.rate,
            "Material Receipt",
            grnId,
            line.batchLotNumber
          );
        });

        // 2. Update PO line quantities and status
        const updatedPOLines = poObj.lines.map(line => {
          const matchedRec = grnLines.find(gl => gl.sourcePOLineId === line.id);
          if (matchedRec) {
            return { ...line, receivedQty: line.receivedQty + matchedRec.receivedQty };
          }
          return line;
        });

        const allFulfilled = updatedPOLines.every(l => l.receivedQty >= l.quantity || l.isShortClosed);
        const updatedPOStatus = allFulfilled ? "Closed" : "Partially Received";

        const updatedPOs = pos.map(p => {
          if (p.id === poObj.id) {
            return {
              ...p,
              status: updatedPOStatus as any,
              lines: updatedPOLines,
              auditTrail: [
                ...p.auditTrail,
                {
                  id: `AUD-${Date.now()}`,
                  timestamp: new Date().toISOString(),
                  userId: currentUser.id,
                  userName: currentUser.name,
                  action: "Receipt Posted",
                  details: `GRN ${grnId} posted with physical arrival of materials. Stock accounts credited.`
                }
              ]
            };
          }
          return p;
        });

        setPos(updatedPOs);
      }

      setGrns([...grns, newGRN]);
      setIsCreating(false);
      setReceiptQtys({});
    } else {
      // Direct Receipt
      if (directLines.length === 0 || !directReason) {
        alert("Please add lines and provide a reason code for direct receipt exception.");
        return;
      }

      const grnLines: GRNLine[] = directLines.map((line, idx) => ({
        id: `GRNL-${grnId}-${idx + 1}`,
        itemId: line.itemId,
        receivedQty: line.qty,
        rate: line.rate,
        taxPct: 0,
        discountPct: 0,
        batchLotNumber: line.batch,
        expiryDate: line.expiry,
        qcPassed: line.qcPassed,
        returnedQty: 0
      }));

      // Calculate totals
      const subTotal = grnLines.reduce((sum, l) => sum + (l.receivedQty * l.rate), 0);
      const grandTotal = subTotal;

      const newGRN: GRNHeader = {
        id: grnId,
        deliveryStoreId: directStore,
        supplierId: directSupplier,
        receivedDate: new Date().toISOString().split("T")[0],
        isDirect: true,
        reasonCode: directReason,
        status: submitForApproval ? "Pending Approval" : "Posted",
        lines: grnLines,
        subTotal,
        taxTotal: 0,
        discountTotal: 0,
        grandTotal,
        auditTrail: [
          {
            id: `AUD-${Date.now()}`,
            timestamp: new Date().toISOString(),
            userId: currentUser.id,
            userName: currentUser.name,
            action: submitForApproval ? "Submitted for Approval" : "Direct Receipt Posted",
            details: submitForApproval
              ? `Direct GRN ${grnId} submitted for Goods Inward Manager authorization.`
              : `Direct GRN ${grnId} posted directly to ledger by ${currentUser.name}.`
          }
        ]
      };

      if (!submitForApproval) {
        // Post direct to Stock Ledger
        grnLines.forEach(line => {
          onPostStockLedger(
            directStore,
            line.itemId,
            line.receivedQty,
            line.rate,
            "Material Receipt",
            grnId,
            line.batchLotNumber
          );
        });
      }

      setGrns([...grns, newGRN]);
      setIsCreating(false);
      setDirectLines([]);
      setDirectReason("");
    }
  };

  return (
    <div className="space-y-6" id="grn-module-layout">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Side GRN Catalog */}
        <div className="lg:col-span-2 bg-white p-6 rounded-xl border border-slate-100 shadow-xs space-y-4">
          <div className="flex justify-between items-center pb-3 border-b border-slate-100">
            <div>
              <h2 className="text-base font-bold text-slate-800">Goods Receipt Notes (GRN)</h2>
              <p className="text-xs text-slate-400 mt-0.5">Physical material arrival, batches logging, and instant ledger entry.</p>
            </div>
            <button
              onClick={() => setIsCreating(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors shadow-xs"
              id="btn-post-new-grn"
            >
              <Plus size={14} />
              Post Goods Receipt
            </button>
          </div>

          <div className="overflow-x-auto rounded-lg border border-slate-100">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-400 font-bold uppercase border-b border-slate-100">
                  <th className="p-3">GRN ID</th>
                  <th className="p-3">Linked Contract</th>
                  <th className="p-3">Store Location</th>
                  <th className="p-3">Supplier Origin</th>
                  <th className="p-3">Received Date</th>
                  <th className="p-3">Receipt Value</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-600 font-medium">
                {grns.map(grn => {
                  const storeObj = stores.find(s => s.id === grn.deliveryStoreId);
                  const supObj = suppliers.find(s => s.id === grn.supplierId);
                  return (
                    <tr key={grn.id} className="hover:bg-slate-50/50">
                      <td className="p-3 font-mono font-bold text-slate-800 flex items-center gap-1">
                        {grn.id}
                        {grn.isDirect && (
                          <span className="text-[9px] px-1 bg-amber-50 text-amber-700 border border-amber-200 rounded font-bold">
                            DIRECT
                          </span>
                        )}
                      </td>
                      <td className="p-3 font-mono font-semibold text-slate-600">{grn.sourcePOId || "N/A"}</td>
                      <td className="p-3">{storeObj?.name}</td>
                      <td className="p-3 font-bold text-slate-700">{supObj?.name || "N/A"}</td>
                      <td className="p-3">{grn.receivedDate}</td>
                      <td className="p-3 font-bold text-slate-700">${grn.grandTotal.toFixed(2)}</td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          grn.status === "Posted" || grn.status === "Approved"
                            ? "bg-emerald-100 text-emerald-800"
                            : grn.status === "Pending Approval"
                            ? "bg-amber-100 text-amber-800"
                            : grn.status === "Rejected"
                            ? "bg-rose-100 text-rose-800"
                            : "bg-slate-100 text-slate-700"
                        }`}>
                          {grn.status || "Posted"}
                        </span>
                      </td>
                      <td className="p-3 text-right flex items-center justify-end gap-1.5">
                        <PrintButton
                          variant="table-action"
                          size="xs"
                          title="Print / Reprint GRN Voucher"
                          onClick={() => setPrintGRN(grn)}
                        />
                        <button 
                          onClick={() => setSelectedGRN(grn)}
                          className="p-1 hover:bg-slate-100 text-slate-500 hover:text-slate-800 rounded transition-colors"
                          title="Inspect GRN Details"
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

        {/* Right Side Detail Pane */}
        <div className="bg-white p-6 rounded-xl border border-slate-100 shadow-xs">
          {selectedGRN ? (
            <div className="space-y-5" id="grn-detail-pane">
              <div className="flex justify-between items-start pb-3 border-b border-slate-100">
                <div>
                  <span className="text-[10px] font-bold tracking-wider uppercase text-slate-400 font-mono">Detail Inspector</span>
                  <h3 className="text-sm font-bold text-slate-800">{selectedGRN.id} Details</h3>
                </div>
                <div className="flex items-center gap-1.5">
                  <PrintButton
                    variant="secondary"
                    size="xs"
                    label="Print GRN"
                    title="Print / Reprint Formal GRN Voucher"
                    onClick={() => setPrintGRN(selectedGRN)}
                  />
                  <button onClick={() => setSelectedGRN(null)} className="text-slate-400 hover:text-slate-600 p-0.5">
                    <X size={16} />
                  </button>
                </div>
              </div>

              {/* Status Banner */}
              <div className="p-3 bg-emerald-50/50 border border-emerald-100 rounded-lg space-y-1 text-xs">
                <div className="flex justify-between font-bold text-emerald-800">
                  <span>Ledger Status:</span>
                  <span>STOCK-POSTED</span>
                </div>
                <div className="flex justify-between pt-1 border-t border-emerald-200/40 text-slate-600">
                  <span>Delivery Location:</span>
                  <span className="font-semibold">{stores.find(s => s.id === selectedGRN.deliveryStoreId)?.name}</span>
                </div>
                <div className="flex justify-between">
                  <span>Total Received Value:</span>
                  <span className="font-bold text-slate-800">${selectedGRN.grandTotal.toFixed(2)}</span>
                </div>
                {selectedGRN.reasonCode && (
                  <div className="text-[10px] text-amber-700 font-bold bg-amber-50 p-1 rounded mt-1">
                    Direct Receipt Reason: "{selectedGRN.reasonCode}"
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block">Received Batches & Costs</span>
                <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                  {selectedGRN.lines.map(line => {
                    const itemObj = items.find(i => i.id === line.itemId);
                    return (
                      <div key={line.id} className="p-3 bg-slate-50/70 border border-slate-200/40 rounded-lg space-y-1">
                        <div className="flex justify-between items-start">
                          <p className="text-xs font-bold text-slate-800">{itemObj?.name}</p>
                          <p className="text-xs font-bold text-slate-700">{line.receivedQty} {itemObj?.unit}</p>
                        </div>
                        <div className="flex justify-between text-[10px] text-slate-500 font-medium pt-1 border-t border-slate-100">
                          <span>Batch: <span className="font-mono font-bold text-slate-600">{line.batchLotNumber}</span></span>
                          <span>Cost Rate: <span className="font-bold text-slate-700">${line.rate.toFixed(2)}</span></span>
                        </div>
                        {line.expiryDate && (
                          <div className="text-[10px] text-rose-500 font-bold">
                            Expiry: {line.expiryDate}
                          </div>
                        )}
                        {line.qcPassed ? (
                          <span className="inline-block text-[9px] font-bold bg-emerald-100 text-emerald-800 px-1 py-0.2 rounded mt-1">QC PASSED</span>
                        ) : (
                          <span className="inline-block text-[9px] font-bold bg-amber-100 text-amber-800 px-1 py-0.2 rounded mt-1">Awaiting QC</span>
                        )}
                        {line.returnedQty > 0 && (
                          <span className="inline-block text-[9px] font-bold bg-rose-100 text-rose-800 px-1 py-0.2 rounded mt-1 ml-1">Returned: {line.returnedQty}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-center" id="empty-pane">
              <Eye size={28} className="text-slate-300" />
              <p className="text-sm font-semibold text-slate-600 mt-2">No Receipt Inspected</p>
              <p className="text-xs text-slate-400 max-w-[200px] mt-0.5">Select any Material Receipt (GRN) from the catalog list to audit its batches, QC statuses, and ledger value credits.</p>
            </div>
          )}
        </div>
      </div>

      {/* POST NEW GRN DRAWER/MODAL */}
      {isCreating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4" id="create-grn-modal">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="text-sm font-bold text-slate-800">Post Physical Material Receipt (GRN)</h3>
                <p className="text-[10px] text-slate-400 mt-0.5">Logs physical inventory arrival, seeds batch queues, and feeds Stock ledger.</p>
              </div>
              <button onClick={() => setIsCreating(false)} className="text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-200">
                <X size={16} />
              </button>
            </div>

            <div className="p-6 space-y-5 overflow-y-auto flex-1">
              {/* Receipt source selection */}
              <div className="flex gap-4 p-1 bg-slate-100 rounded-lg w-max mb-2">
                <button
                  type="button"
                  onClick={() => setGrnType("PO")}
                  className={`px-4 py-1.5 text-xs font-bold rounded-md transition-colors ${
                    grnType === "PO" ? "bg-white text-purple-600 shadow-xs" : "text-slate-500"
                  }`}
                >
                  Receive against PO Contract
                </button>
                <button
                  type="button"
                  onClick={() => setGrnType("Direct")}
                  className={`px-4 py-1.5 text-xs font-bold rounded-md transition-colors ${
                    grnType === "Direct" ? "bg-white text-purple-600 shadow-xs" : "text-slate-500"
                  }`}
                >
                  Direct Receipt Exception
                </button>
              </div>

              {grnType === "PO" ? (
                <div className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700">Select Approved supplier PO Contract</label>
                    <select
                      value={selectedPOId}
                      onChange={(e) => handlePOSelect(e.target.value)}
                      className="w-full p-2 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 bg-white"
                    >
                      <option value="">-- Choose PO --</option>
                      {pos.filter(p => p.status === "Approved" || p.status === "Partially Received").map(p => {
                        const sup = suppliers.find(s => s.id === p.supplierId);
                        return <option key={p.id} value={p.id}>{p.id} - {sup?.name} (Total: ${p.grandTotal.toFixed(2)})</option>;
                      })}
                    </select>
                  </div>

                  {selectedPOId && (
                    <div className="space-y-3 pt-3 border-t border-slate-100">
                      <span className="text-xs font-bold text-slate-700 block">Deliveries, Batches, and Rates details</span>
                      
                      {pos.find(p => p.id === selectedPOId)?.lines.map(line => {
                        const itemObj = items.find(i => i.id === line.itemId);
                        const openQty = line.quantity - line.receivedQty;
                        if (openQty <= 0 && !line.isShortClosed) return null;

                        return (
                          <div key={line.id} className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                            <div className="flex justify-between">
                              <h4 className="text-xs font-extrabold text-slate-800">{itemObj?.name}</h4>
                              <span className="text-[10px] bg-purple-50 text-purple-700 px-2 py-0.5 rounded font-bold">Contract Open: {openQty} {itemObj?.unit}</span>
                            </div>

                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 items-end">
                              <div className="space-y-1">
                                <label className="text-[10px] font-bold text-slate-500 uppercase">Received Qty</label>
                                <input
                                  type="number"
                                  min="0"
                                  max={openQty * 1.5}
                                  value={receiptQtys[line.id] ?? 0}
                                  onChange={(e) => setReceiptQtys({ ...receiptQtys, [line.id]: Math.max(0, parseInt(e.target.value) || 0) })}
                                  className="w-full p-1.5 border border-slate-200 rounded bg-white text-xs font-bold"
                                />
                              </div>

                              <div className="space-y-1">
                                <label className="text-[10px] font-bold text-slate-500 uppercase">Supplier Rate ($)</label>
                                <input
                                  type="number"
                                  step="0.01"
                                  value={receiptRates[line.id] ?? 0}
                                  onChange={(e) => setReceiptRates({ ...receiptRates, [line.id]: parseFloat(e.target.value) || 0 })}
                                  className="w-full p-1.5 border border-slate-200 rounded bg-white text-xs"
                                />
                              </div>

                              <div className="space-y-1">
                                <label className="text-[10px] font-bold text-slate-500 uppercase">Batch/Lot No</label>
                                <input
                                  type="text"
                                  value={receiptBatches[line.id] ?? ""}
                                  onChange={(e) => setReceiptBatches({ ...receiptBatches, [line.id]: e.target.value })}
                                  className="w-full p-1.5 border border-slate-200 rounded bg-white text-xs font-mono font-bold"
                                />
                              </div>

                              {itemObj?.group === "Perishables" && (
                                <div className="space-y-1">
                                  <label className="text-[10px] font-bold text-slate-500 uppercase">Expiry Date</label>
                                  <input
                                    type="date"
                                    value={receiptExpiries[line.id] ?? ""}
                                    onChange={(e) => setReceiptExpiries({ ...receiptExpiries, [line.id]: e.target.value })}
                                    className="w-full p-1.5 border border-slate-200 rounded bg-white text-xs"
                                  />
                                </div>
                              )}
                            </div>

                            {itemObj?.qcRequired && (
                              <div className="flex items-center gap-2 bg-amber-50 p-2 rounded border border-amber-200/50">
                                <input
                                  type="checkbox"
                                  id={`qcCheck-${line.id}`}
                                  checked={receiptQCPass[line.id] ?? false}
                                  onChange={(e) => setReceiptQCPass({ ...receiptQCPass, [line.id]: e.target.checked })}
                                  className="w-4 h-4 text-amber-600 border-slate-300 rounded cursor-pointer focus:ring-amber-500"
                                />
                                <label htmlFor={`qcCheck-${line.id}`} className="text-xs font-bold text-amber-900 cursor-pointer flex items-center gap-1">
                                  <AlertCircle size={14} />
                                  Confirm physical QA inspection passed successfully.
                                </label>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : (
                // Direct Receipt Form
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-700">Target Store (Ledger credit)</label>
                      <select
                        value={directStore}
                        onChange={(e) => setDirectStore(e.target.value)}
                        className="w-full p-2 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 bg-white"
                      >
                        {stores.map(s => <option key={s.id} value={s.id}>{s.name} ({s.code})</option>)}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-700">Associated Vendor Supplier</label>
                      <select
                        value={directSupplier}
                        onChange={(e) => setDirectSupplier(e.target.value)}
                        className="w-full p-2 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 bg-white"
                      >
                        {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-700">Mandatory Exception Reason</label>
                      <select
                        value={directReason}
                        onChange={(e) => setDirectReason(e.target.value)}
                        className="w-full p-2 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 bg-white"
                        required
                      >
                        <option value="">-- Select Reason --</option>
                        <option value="free sample">Free samples for trials</option>
                        <option value="donation">Donation / Sponsorship goods</option>
                        <option value="emergency purchase">Emergency off-market cash buy</option>
                      </select>
                    </div>
                  </div>

                  {/* Direct Line Builder */}
                  <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl grid grid-cols-1 sm:grid-cols-4 gap-2.5 items-end">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase">Select Item</label>
                      <select
                        value={tempItem}
                        onChange={(e) => setTempItem(e.target.value)}
                        className="w-full p-1.5 border border-slate-200 rounded bg-white text-xs text-slate-700 font-medium"
                      >
                        {items.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase">Qty Received</label>
                      <input
                        type="number"
                        min="1"
                        value={tempQty}
                        onChange={(e) => setTempQty(parseInt(e.target.value) || 1)}
                        className="w-full p-1 border border-slate-200 rounded text-xs bg-white text-slate-700"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase">Valuation Rate ($)</label>
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
                      onClick={handleAddDirectLine}
                      className="py-1.5 px-3 text-xs font-bold text-white bg-slate-800 hover:bg-slate-950 rounded transition-colors"
                    >
                      Add Line
                    </button>
                  </div>

                  {/* Direct Lines list */}
                  <div className="border border-slate-150 rounded-lg max-h-[140px] overflow-y-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-50 font-bold border-b border-slate-150 text-slate-500">
                          <th className="p-2">Item</th>
                          <th className="p-2">Qty</th>
                          <th className="p-2">Rate</th>
                          <th className="p-2">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                        {directLines.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="p-3 text-center text-slate-400">No lines added yet.</td>
                          </tr>
                        ) : (
                          directLines.map((line, idx) => {
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
              )}
            </div>

            <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between gap-2">
              <span className="text-[11px] text-slate-500 italic">
                * Submitting for approval routes this receipt to the Approval Center before stock ledger update.
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsCreating(false)}
                  className="px-3.5 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-200 rounded-lg cursor-pointer"
                >
                  Discard
                </button>
                <button
                  onClick={() => handlePostGRN(true)}
                  className="px-3.5 py-1.5 text-xs font-bold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-lg shadow-xs cursor-pointer"
                  id="btn-submit-grn-approval"
                >
                  Submit for Approval
                </button>
                <button
                  onClick={() => handlePostGRN(false)}
                  className="px-4 py-1.5 text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-lg shadow-xs cursor-pointer"
                  id="btn-post-grn-direct"
                >
                  Instant Post & Stock-In
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PRINT / REPRINT GRN MODAL */}
      <PrintDocumentModal
        isOpen={!!printGRN}
        onClose={() => setPrintGRN(null)}
        documentData={printGRN ? { type: "GRN", rawDoc: printGRN } : null}
        items={items}
        stores={stores}
        departments={[]}
        suppliers={suppliers}
        currentUser={currentUser}
      />
    </div>
  );
}
