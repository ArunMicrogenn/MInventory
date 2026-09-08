import React, { useState } from "react";
import { POHeader, POLine, Item, Store, Supplier, User, TransactionStatus, AuditLog } from "../types";
import { Plus, X, Eye, FileEdit, Trash2, ShieldAlert, BadgeX, Settings, CornerDownRight, ArrowRight, Clock } from "lucide-react";

interface POModuleProps {
  pos: POHeader[];
  setPos: (pos: POHeader[]) => void;
  items: Item[];
  stores: Store[];
  suppliers: Supplier[];
  currentUser: User;
  onViewAudit?: (id: string, type: string, trail: any[]) => void;
}

export default function POModule({
  pos,
  setPos,
  items,
  stores,
  suppliers,
  currentUser,
  onViewAudit
}: POModuleProps) {
  const [selectedPO, setSelectedPO] = useState<POHeader | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isAmending, setIsAmending] = useState<POHeader | null>(null);

  // Creation form states
  const [targetSupplier, setTargetSupplier] = useState(suppliers[0]?.id || "");
  const [purchaseType, setPurchaseType] = useState<"Capex" | "Opex" | "Emergency" | "Regular">("Regular");
  const [deliveryStore, setDeliveryStore] = useState(stores[0]?.id || "");
  const [paymentTerms, setPaymentTerms] = useState(suppliers[0]?.paymentTerms || "");
  const [deliveryDate, setDeliveryDate] = useState(new Date().toISOString().split("T")[0]);
  const [poLines, setPoLines] = useState<{ itemId: string; quantity: number; rate: number; taxPct: number; discountPct: number }[]>([]);

  // Creation line builder states
  const [tempItem, setTempItem] = useState(items[0]?.id || "");
  const [tempQty, setTempQty] = useState(1);
  const [tempRate, setTempRate] = useState(0);
  const [tempTax, setTempTax] = useState(5);
  const [tempDiscount, setTempDiscount] = useState(0);

  // Short Close & Cancellation Form states
  const [showCancelModal, setShowCancelModal] = useState<string | null>(null); // PO ID
  const [cancelReason, setCancelReason] = useState("");
  
  const [showShortCloseModal, setShowShortCloseModal] = useState<POHeader | null>(null);
  const [shortCloseLineId, setShortCloseLineId] = useState("");
  const [shortCloseReason, setShortCloseReason] = useState("");

  const handleItemSelect = (itemId: string) => {
    setTempItem(itemId);
    const itemObj = items.find(i => i.id === itemId);
    if (itemObj) {
      setTempRate(itemObj.lastPurchaseRate || itemObj.standardRate);
    }
  };

  const addPoLine = () => {
    if (tempQty <= 0 || tempRate <= 0) return;
    setPoLines([...poLines, {
      itemId: tempItem,
      quantity: tempQty,
      rate: tempRate,
      taxPct: tempTax,
      discountPct: tempDiscount
    }]);
    setTempQty(1);
  };

  const removePoLine = (index: number) => {
    setPoLines(poLines.filter((_, i) => i !== index));
  };

  // Submit direct PO
  const handleSavePO = (status: "Draft" | "Submitted") => {
    if (poLines.length === 0) {
      alert("Please add at least one line item.");
      return;
    }

    const poId = `PO-2026-000${pos.length + 1}`;
    
    // Compute totals
    let subTotal = 0;
    let taxTotal = 0;
    let discountTotal = 0;

    poLines.forEach(line => {
      const lineSub = line.quantity * line.rate;
      const disc = lineSub * (line.discountPct / 100);
      const tax = (lineSub - disc) * (line.taxPct / 100);
      subTotal += lineSub;
      discountTotal += disc;
      taxTotal += tax;
    });

    const grandTotal = subTotal - discountTotal + taxTotal;

    const newPO: POHeader = {
      id: poId,
      supplierId: targetSupplier,
      purchaseType,
      deliveryStoreId: deliveryStore,
      paymentTerms,
      deliveryDate,
      status: status === "Submitted" ? "Pending Approval" : "Draft",
      lines: poLines.map((line, idx) => ({
        id: `POL-${poId}-${idx + 1}`,
        itemId: line.itemId,
        quantity: line.quantity,
        rate: line.rate,
        taxPct: line.taxPct,
        discountPct: line.discountPct,
        receivedQty: 0,
        isShortClosed: false
      })),
      subTotal,
      taxTotal,
      discountTotal,
      grandTotal,
      amendmentNumber: 0,
      auditTrail: [
        {
          id: `AUD-${Date.now()}`,
          timestamp: new Date().toISOString(),
          userId: currentUser.id,
          userName: currentUser.name,
          action: status === "Submitted" ? "Submitted" : "Created Draft",
          details: `Direct PO created with grand total of $${grandTotal.toFixed(2)}. routed to authorization engine.`
        }
      ]
    };

    setPos([...pos, newPO]);
    setIsCreating(false);
    setPoLines([]);
  };

  // Submit PO Amendment
  const handleAmendSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAmending) return;

    // Compute new totals
    let subTotal = 0;
    let taxTotal = 0;
    let discountTotal = 0;

    isAmending.lines.forEach(line => {
      const lineSub = line.quantity * line.rate;
      const disc = lineSub * (line.discountPct / 100);
      const tax = (lineSub - disc) * (line.taxPct / 100);
      subTotal += lineSub;
      discountTotal += disc;
      taxTotal += tax;
    });

    const grandTotal = subTotal - discountTotal + taxTotal;
    const oldTotal = pos.find(p => p.id === isAmending.id)?.grandTotal || 0;

    // Check if re-approval is triggered (rate increases, or grand total increases)
    const oldPO = pos.find(p => p.id === isAmending.id);
    let reapprovalTriggered = grandTotal > oldTotal;
    
    // Check if rate increased on any line
    if (oldPO) {
      oldPO.lines.forEach(oldL => {
        const newL = isAmending.lines.find(l => l.id === oldL.id);
        if (newL && newL.rate > oldL.rate) {
          reapprovalTriggered = true;
        }
      });
    }

    const newStatus: TransactionStatus = reapprovalTriggered ? "Pending Approval" : "Approved";
    const nextAmendmentNum = isAmending.amendmentNumber + 1;
    const amdSuffix = `-AMD-${nextAmendmentNum.toString().padStart(2, "0")}`;

    const newAudit: AuditLog = {
      id: `AUD-${Date.now()}`,
      timestamp: new Date().toISOString(),
      userId: currentUser.id,
      userName: currentUser.name,
      action: `Amended (${isAmending.id}${amdSuffix})`,
      details: `Amended contract terms. Total shifted from $${oldTotal.toFixed(2)} to $${grandTotal.toFixed(2)}. ${
        reapprovalTriggered ? "Value/rate increases triggered. Re-approval requested." : "Kept status as Approved."
      }`
    };

    const updated = pos.map(p => {
      if (p.id === isAmending.id) {
        return {
          ...isAmending,
          status: newStatus,
          subTotal,
          taxTotal,
          discountTotal,
          grandTotal,
          amendmentNumber: nextAmendmentNum,
          auditTrail: [...isAmending.auditTrail, newAudit]
        };
      }
      return p;
    });

    setPos(updated);
    setIsAmending(null);
    setSelectedPO(null);
  };

  // Cancel PO
  const handleCancelPO = () => {
    if (!showCancelModal || !cancelReason) return;

    const target = pos.find(p => p.id === showCancelModal);
    if (!target) return;

    // Validation: block if any receipt exists
    const hasGRN = target.lines.some(l => l.receivedQty > 0);
    if (hasGRN) {
      alert("Cancellation Blocked: Receipts exist against this PO. You must use 'Short Close' instead.");
      setShowCancelModal(null);
      return;
    }

    const updated = pos.map(p => {
      if (p.id === showCancelModal) {
        return {
          ...p,
          status: "Cancelled" as TransactionStatus,
          reasonCode: cancelReason,
          auditTrail: [
            ...p.auditTrail,
            {
              id: `AUD-${Date.now()}`,
              timestamp: new Date().toISOString(),
              userId: currentUser.id,
              userName: currentUser.name,
              action: "Cancelled",
              details: `PO Cancelled. Reason: "${cancelReason}"`
            }
          ]
        };
      }
      return p;
    });

    setPos(updated);
    setShowCancelModal(null);
    setCancelReason("");
    setSelectedPO(null);
  };

  // Executing Line Level Short Close
  const handleShortCloseSubmit = () => {
    if (!showShortCloseModal || !shortCloseLineId || !shortCloseReason) return;

    const targetPO = pos.find(p => p.id === showShortCloseModal.id);
    if (!targetPO) return;

    const updatedLines = targetPO.lines.map(line => {
      if (line.id === shortCloseLineId) {
        return { ...line, isShortClosed: true };
      }
      return line;
    });

    // Check if ALL lines are either received or short closed
    const allLinesClosed = updatedLines.every(l => l.isShortClosed || l.receivedQty >= l.quantity);
    const nextStatus: TransactionStatus = allLinesClosed ? "Short Closed" : "Partially Received";

    const closeAudit: AuditLog = {
      id: `AUD-${Date.now()}`,
      timestamp: new Date().toISOString(),
      userId: currentUser.id,
      userName: currentUser.name,
      action: "Short Closed Line",
      details: `Short closed line ${shortCloseLineId}. Reason code: "${shortCloseReason}"`
    };

    const updatedPOs = pos.map(p => {
      if (p.id === showShortCloseModal.id) {
        return {
          ...p,
          status: nextStatus,
          lines: updatedLines,
          auditTrail: [...p.auditTrail, closeAudit]
        };
      }
      return p;
    });

    setPos(updatedPOs);
    setShowShortCloseModal(null);
    setShortCloseLineId("");
    setShortCloseReason("");
    setSelectedPO(null);
  };

  return (
    <div className="space-y-6" id="po-module-layout">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Side PO Table List */}
        <div className="lg:col-span-2 bg-white p-6 rounded-xl border border-slate-100 shadow-xs space-y-4">
          <div className="flex justify-between items-center pb-3 border-b border-slate-100">
            <div>
              <h2 className="text-base font-bold text-slate-800">Formal Purchase Orders (PO)</h2>
              <p className="text-xs text-slate-400 mt-0.5">Supplier contracts, payment terms, and delivery milestones.</p>
            </div>
            <button
              onClick={() => setIsCreating(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors shadow-xs"
              id="btn-raise-direct-po"
            >
              <Plus size={14} />
              Raise Direct PO
            </button>
          </div>

          <div className="overflow-x-auto rounded-lg border border-slate-100">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-400 font-bold uppercase border-b border-slate-100">
                  <th className="p-3">Doc ID</th>
                  <th className="p-3">Supplier Vendor</th>
                  <th className="p-3">Category Type</th>
                  <th className="p-3">Delivery Date</th>
                  <th className="p-3">Contract Value</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-600 font-medium">
                {pos.map(po => {
                  const supplierObj = suppliers.find(s => s.id === po.supplierId);
                  return (
                    <tr key={po.id} className="hover:bg-slate-50/50">
                      <td className="p-3 font-mono font-bold text-slate-800 flex items-center gap-1">
                        {po.id}
                        {po.amendmentNumber > 0 && (
                          <span className="text-[9px] px-1 bg-amber-50 text-amber-700 border border-amber-200 rounded font-bold">
                            AMD-{po.amendmentNumber}
                          </span>
                        )}
                      </td>
                      <td className="p-3">
                        <div className="font-bold text-slate-700">{supplierObj?.name}</div>
                        <div className="text-[10px] text-slate-400">Terms: {po.paymentTerms}</div>
                      </td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          po.purchaseType === "Capex" ? "bg-amber-100 text-amber-800" :
                          po.purchaseType === "Emergency" ? "bg-rose-100 text-rose-800" :
                          "bg-slate-100 text-slate-600"
                        }`}>
                          {po.purchaseType}
                        </span>
                      </td>
                      <td className="p-3">{po.deliveryDate}</td>
                      <td className="p-3 font-bold text-slate-700">${po.grandTotal.toFixed(2)}</td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          po.status === "Draft" ? "bg-slate-100 text-slate-600" :
                          po.status === "Pending Approval" ? "bg-amber-100 text-amber-800" :
                          po.status === "Approved" ? "bg-emerald-100 text-emerald-800" :
                          po.status === "Partially Received" ? "bg-blue-100 text-purple-800" :
                          po.status === "Closed" ? "bg-slate-200 text-slate-700" :
                          "bg-rose-100 text-rose-800"
                        }`}>
                          {po.status}
                        </span>
                      </td>
                      <td className="p-3 text-right flex items-center justify-end gap-1.5">
                        <button 
                          onClick={() => setSelectedPO(po)}
                          className="p-1 hover:bg-slate-100 text-slate-500 hover:text-slate-800 rounded transition-colors"
                          title="View PO Details"
                        >
                          <Eye size={14} />
                        </button>
                        {po.status === "Approved" && (
                          <button 
                            onClick={() => setIsAmending(po)}
                            className="p-1 hover:bg-slate-100 text-amber-600 hover:text-amber-800 rounded transition-colors"
                            title="Amend PO"
                          >
                            <FileEdit size={14} />
                          </button>
                        )}
                        {(po.status === "Approved" || po.status === "Partially Received") && (
                          <button 
                            onClick={() => setShowShortCloseModal(po)}
                            className="p-1 hover:bg-slate-100 text-purple-600 hover:text-purple-800 rounded transition-colors"
                            title="Short Close Lines"
                          >
                            <BadgeX size={14} />
                          </button>
                        )}
                        {po.status !== "Closed" && po.status !== "Cancelled" && po.status !== "Short Closed" && (
                          <button 
                            onClick={() => setShowCancelModal(po.id)}
                            className="p-1 hover:bg-slate-100 text-rose-500 hover:text-rose-700 rounded transition-colors"
                            title="Cancel PO"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
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
          {selectedPO ? (
            <div className="space-y-5" id="po-detail-pane">
              <div className="flex justify-between items-start pb-3 border-b border-slate-100">
                <div>
                  <span className="text-[10px] font-bold tracking-wider uppercase text-slate-400 font-mono">Detail Inspector</span>
                  <h3 className="text-sm font-bold text-slate-800">{selectedPO.id} Details</h3>
                </div>
                <button onClick={() => setSelectedPO(null)} className="text-slate-400 hover:text-slate-600 p-0.5">
                  <X size={16} />
                </button>
              </div>

              {/* Status Banner */}
              <div className="p-3 bg-slate-50 border border-slate-100 rounded-lg space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="font-bold text-slate-500">PO Status:</span>
                  <span className="font-bold text-slate-800">{selectedPO.status}</span>
                </div>
                <div className="flex justify-between pt-1 border-t border-slate-200/40">
                  <span className="text-slate-500 font-medium">Subtotal:</span>
                  <span className="font-semibold">${selectedPO.subTotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-medium">Discount Total:</span>
                  <span className="font-semibold text-rose-500">-${selectedPO.discountTotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-medium">Taxes (incl):</span>
                  <span className="font-semibold">${selectedPO.taxTotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between pt-1.5 border-t border-slate-200/60 text-sm font-extrabold text-slate-800">
                  <span>Grand Total:</span>
                  <span>${selectedPO.grandTotal.toFixed(2)}</span>
                </div>
                {selectedPO.reasonCode && (
                  <div className="text-[11px] text-rose-600 font-bold mt-1.5 pt-1.5 border-t border-slate-200/40">
                    Reason: {selectedPO.reasonCode}
                  </div>
                )}
                {selectedPO.approverRemarks && (
                  <div className="text-[11px] text-amber-700 bg-amber-50 p-1.5 rounded mt-1 border border-amber-200/50">
                    <span className="font-bold">Approver Remark:</span> "{selectedPO.approverRemarks}"
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block">Contract Lines & Receipts</span>
                <div className="space-y-2 max-h-[180px] overflow-y-auto pr-1">
                  {selectedPO.lines.map(line => {
                    const itemObj = items.find(i => i.id === line.itemId);
                    return (
                      <div key={line.id} className="p-3 bg-slate-50/70 border border-slate-200/40 rounded-lg flex justify-between items-start">
                        <div>
                          <p className="text-xs font-bold text-slate-800">{itemObj?.name}</p>
                          <p className="text-[10px] text-slate-400">Rate: ${line.rate.toFixed(2)} • Tax: {line.taxPct}% • Disc: {line.discountPct}%</p>
                          {line.isShortClosed && (
                            <span className="mt-1 px-1.5 py-0.2 bg-rose-100 text-rose-800 font-bold text-[9px] rounded block w-max">
                              SHORT CLOSED
                            </span>
                          )}
                        </div>
                        <div className="text-right">
                          <p className="text-xs font-bold text-slate-700">{line.quantity} {itemObj?.unit}</p>
                          <p className="text-[10px] text-emerald-600 bg-emerald-50 px-1 py-0.2 rounded inline-block font-bold">Received: {line.receivedQty}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Audit Trail */}
              <div className="space-y-3 border-t border-slate-100 pt-4">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block">Workflow Logs</span>
                  {onViewAudit && (
                    <button
                      onClick={() => onViewAudit(selectedPO.id, "Purchase Order (PO)", selectedPO.auditTrail)}
                      className="px-2.5 py-1 text-[10px] font-extrabold text-purple-600 hover:text-white bg-purple-50 hover:bg-purple-600 border border-purple-100 hover:border-purple-600 rounded-sm transition-all cursor-pointer flex items-center gap-1"
                    >
                      <Clock size={10} /> View Visual Timeline
                    </button>
                  )}
                </div>
                <div className="space-y-2 max-h-[160px] overflow-y-auto pr-1 text-[11px] text-slate-600">
                  {selectedPO.auditTrail.map((log, idx) => (
                    <div key={log.id || idx} className="flex gap-2 items-start">
                      <div className="w-1.5 h-1.5 rounded-full bg-slate-300 mt-1" />
                      <div className="flex-1">
                        <div className="flex justify-between font-bold text-slate-700">
                          <span>{log.userName} ({log.action})</span>
                          <span className="text-[10px] text-slate-400">{new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                        <p className="text-slate-500 mt-0.5 leading-relaxed">{log.details}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-center" id="empty-pane">
              <Eye size={28} className="text-slate-300" />
              <p className="text-sm font-semibold text-slate-600 mt-2">No Order Inspected</p>
              <p className="text-xs text-slate-400 max-w-[200px] mt-0.5">Select any PO contract from the catalog list to audit its items and receipts tracking.</p>
            </div>
          )}
        </div>
      </div>

      {/* CREATE DIRECT PO MODAL */}
      {isCreating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4" id="create-po-modal">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <h3 className="text-sm font-bold text-slate-800">Raise Direct Supplier Contract (PO)</h3>
              <button onClick={() => setIsCreating(false)} className="text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-200">
                <X size={16} />
              </button>
            </div>

            <div className="p-6 space-y-5 overflow-y-auto flex-1">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Target Vendor Supplier</label>
                  <select
                    value={targetSupplier}
                    onChange={(e) => {
                      setTargetSupplier(e.target.value);
                      const s = suppliers.find(sup => sup.id === e.target.value);
                      if (s) setPaymentTerms(s.paymentTerms);
                    }}
                    className="w-full p-2 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 bg-white"
                  >
                    {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Property Delivery Store</label>
                  <select
                    value={deliveryStore}
                    onChange={(e) => setDeliveryStore(e.target.value)}
                    className="w-full p-2 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 bg-white"
                  >
                    {stores.map(s => <option key={s.id} value={s.id}>{s.name} ({s.code})</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Budget Classification Type</label>
                  <select
                    value={purchaseType}
                    onChange={(e) => setPurchaseType(e.target.value as any)}
                    className="w-full p-2 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 bg-white"
                  >
                    <option value="Regular">Regular Opex</option>
                    <option value="Capex">Capex (Finance Routing)</option>
                    <option value="Emergency">Emergency (Immediate Dispatch)</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Delivery Contract Date</label>
                  <input
                    type="date"
                    value={deliveryDate}
                    onChange={(e) => setDeliveryDate(e.target.value)}
                    className="w-full p-2 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 bg-white"
                  />
                </div>
                <div className="md:col-span-2 space-y-1">
                  <label className="text-xs font-bold text-slate-700">Contract Payment Terms</label>
                  <input
                    type="text"
                    value={paymentTerms}
                    onChange={(e) => setPaymentTerms(e.target.value)}
                    className="w-full p-2 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 bg-white"
                  />
                </div>
              </div>

              {/* Line item Builder */}
              <div className="border-t border-slate-100 pt-4 space-y-3">
                <span className="text-xs font-bold text-slate-700 block">Line item Editor</span>
                
                <div className="p-3 bg-slate-50 border border-slate-200/65 rounded-xl grid grid-cols-1 sm:grid-cols-5 gap-2 items-end">
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold text-slate-500 uppercase">Item</label>
                    <select
                      value={tempItem}
                      onChange={(e) => handleItemSelect(e.target.value)}
                      className="w-full p-1.5 border border-slate-200 rounded text-xs bg-white text-slate-700"
                    >
                      {items.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold text-slate-500 uppercase">Qty</label>
                    <input
                      type="number"
                      min="1"
                      value={tempQty}
                      onChange={(e) => setTempQty(parseInt(e.target.value) || 1)}
                      className="w-full p-1 border border-slate-200 rounded text-xs bg-white"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold text-slate-500 uppercase">Supplier Rate ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={tempRate}
                      onChange={(e) => setTempRate(parseFloat(e.target.value) || 0)}
                      className="w-full p-1 border border-slate-200 rounded text-xs bg-white text-slate-800 font-bold"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold text-slate-500 uppercase">Taxes %</label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={tempTax}
                      onChange={(e) => setTempTax(parseFloat(e.target.value) || 0)}
                      className="w-full p-1 border border-slate-200 rounded text-xs bg-white text-slate-600"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={addPoLine}
                    className="py-1.5 px-3 text-xs font-bold text-white bg-slate-800 hover:bg-slate-950 rounded transition-colors"
                  >
                    Add
                  </button>
                </div>

                {/* Built Lines Table */}
                <div className="max-h-[160px] overflow-y-auto border border-slate-150 rounded-lg">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-150 font-bold text-slate-500">
                        <th className="p-2">Item</th>
                        <th className="p-2">Qty</th>
                        <th className="p-2">Rate</th>
                        <th className="p-2">Tax</th>
                        <th className="p-2">Total ($)</th>
                        <th className="p-2 text-right">Delete</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {poLines.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="p-3 text-center text-slate-400 font-medium">No lines added to direct order yet.</td>
                        </tr>
                      ) : (
                        poLines.map((line, idx) => {
                          const itemObj = items.find(i => i.id === line.itemId);
                          const total = line.quantity * line.rate * (1 + line.taxPct / 100);
                          return (
                            <tr key={idx} className="hover:bg-slate-50/50 font-medium text-slate-700">
                              <td className="p-2">{itemObj?.name}</td>
                              <td className="p-2 font-bold">{line.quantity}</td>
                              <td className="p-2">${line.rate.toFixed(2)}</td>
                              <td className="p-2 text-slate-400">{line.taxPct}%</td>
                              <td className="p-2 font-bold text-slate-800">${total.toFixed(2)}</td>
                              <td className="p-2 text-right">
                                <button type="button" onClick={() => removePoLine(idx)} className="text-rose-500 hover:text-rose-700">
                                  <Trash2 size={13} />
                                </button>
                              </td>
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
                onClick={() => setIsCreating(false)}
                className="px-3.5 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-200 rounded-lg"
              >
                Discard
              </button>
              <button
                onClick={() => handleSavePO("Draft")}
                className="px-3.5 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 rounded-lg transition-all"
              >
                Save as Draft
              </button>
              <button
                onClick={() => handleSavePO("Submitted")}
                className="px-4 py-1.5 text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors shadow-xs"
              >
                Submit for Approval
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AMEND APPROVED PO MODAL */}
      {isAmending && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4" id="amend-po-modal">
          <form onSubmit={handleAmendSubmit} className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="text-sm font-bold text-slate-800">Amend Approved PO {isAmending.id}</h3>
                <p className="text-[10px] text-slate-400 mt-0.5">Edit rate, quantity (not below received), delivery date, or payment terms.</p>
              </div>
              <button type="button" onClick={() => setIsAmending(null)} className="text-slate-400 hover:text-slate-600">
                <X size={16} />
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-3 pb-3 border-b border-slate-150">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Delivery Date</label>
                  <input
                    type="date"
                    required
                    value={isAmending.deliveryDate}
                    onChange={(e) => setIsAmending({ ...isAmending, deliveryDate: e.target.value })}
                    className="w-full p-2 text-xs border border-slate-200 rounded-lg bg-white"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Payment Terms</label>
                  <input
                    type="text"
                    required
                    value={isAmending.paymentTerms}
                    onChange={(e) => setIsAmending({ ...isAmending, paymentTerms: e.target.value })}
                    className="w-full p-2 text-xs border border-slate-200 rounded-lg bg-white"
                  />
                </div>
              </div>

              {isAmending.lines.map((line, idx) => {
                const itemObj = items.find(i => i.id === line.itemId);
                return (
                  <div key={line.id} className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                    <p className="text-xs font-extrabold text-slate-800 flex items-center gap-1">
                      <CornerDownRight size={12} className="text-purple-500" />
                      Line {idx + 1}: {itemObj?.name}
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[11px] font-bold text-slate-500">Amend Qty (Min: {line.receivedQty})</label>
                        <input
                          type="number"
                          min={line.receivedQty}
                          required
                          value={line.quantity}
                          onChange={(e) => {
                            const newQty = Math.max(line.receivedQty, parseInt(e.target.value) || 0);
                            const updated = [...isAmending.lines];
                            updated[idx] = { ...line, quantity: newQty };
                            setIsAmending({ ...isAmending, lines: updated });
                          }}
                          className="w-full p-2 text-xs border border-slate-200 rounded-lg bg-white"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[11px] font-bold text-slate-500">Amend Supplier Rate ($)</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          required
                          value={line.rate}
                          onChange={(e) => {
                            const newRate = parseFloat(e.target.value) || 0;
                            const updated = [...isAmending.lines];
                            updated[idx] = { ...line, rate: newRate };
                            setIsAmending({ ...isAmending, lines: updated });
                          }}
                          className="w-full p-2 text-xs border border-slate-200 rounded-lg bg-white font-bold text-slate-800"
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsAmending(null)}
                className="px-3.5 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-200 rounded-lg"
              >
                Discard
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-lg shadow-xs"
              >
                Submit Amendment
              </button>
            </div>
          </form>
        </div>
      )}

      {/* SHORT CLOSE MODAL */}
      {showShortCloseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4" id="short-close-modal">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-sm w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <h3 className="text-sm font-bold text-slate-800">Short Close PO {showShortCloseModal.id} Line</h3>
              <button onClick={() => setShowShortCloseModal(null)} className="text-slate-400 hover:text-slate-600">
                <X size={16} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <p className="text-xs text-slate-500">Closes the remaining unreceived quantities on this contract line. No further GRN will be allowed.</p>
              
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-600">Select Line item to Close</label>
                <select
                  value={shortCloseLineId}
                  onChange={(e) => setShortCloseLineId(e.target.value)}
                  className="w-full p-2 text-xs border border-slate-200 rounded-lg bg-white text-slate-700 font-medium"
                  required
                >
                  <option value="">-- Choose Line --</option>
                  {showShortCloseModal.lines.filter(l => !l.isShortClosed && l.quantity - l.receivedQty > 0).map(l => {
                    const itemObj = items.find(i => i.id === l.itemId);
                    return <option key={l.id} value={l.id}>{itemObj?.name} (Open: {l.quantity - l.receivedQty})</option>;
                  })}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-600">Mandatory Reason Code</label>
                <select
                  value={shortCloseReason}
                  onChange={(e) => setShortCloseReason(e.target.value)}
                  className="w-full p-2 text-xs border border-slate-200 rounded-lg bg-white text-slate-700 font-medium"
                  required
                >
                  <option value="">-- Choose Reason --</option>
                  <option value="discontinued item">Discontinued item by supplier</option>
                  <option value="partial shipment accepted">Partial shipment accepted as final</option>
                  <option value="delivery delayed indefinitely">Delivery delayed indefinitely</option>
                </select>
              </div>
            </div>

            <div className="p-3.5 bg-slate-50 border-t border-slate-100 flex justify-end gap-2">
              <button
                onClick={() => setShowShortCloseModal(null)}
                className="px-3 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-200 rounded-lg"
              >
                Exit
              </button>
              <button
                onClick={handleShortCloseSubmit}
                disabled={!shortCloseLineId || !shortCloseReason}
                className="px-4 py-1.5 text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-lg shadow-xs disabled:opacity-40"
              >
                Short Close Line
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CANCELLATION MODAL */}
      {showCancelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4" id="cancel-po-modal">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-sm w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <h3 className="text-sm font-bold text-slate-800">Cancel Contract Order</h3>
              <button onClick={() => setShowCancelModal(null)} className="text-slate-400 hover:text-slate-600">
                <X size={16} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <p className="text-xs text-slate-500">This will permanently cancel order {showCancelModal}. Allowed only if zero material receipts have been posted against it.</p>
              
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-600">Mandatory Reason Code</label>
                <select
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  className="w-full p-2 text-xs border border-slate-200 rounded-lg bg-white font-medium text-slate-700"
                  required
                >
                  <option value="">-- Choose Reason --</option>
                  <option value="no longer required">No longer required</option>
                  <option value="pricing mismatch">Supplier pricing dispute</option>
                  <option value="duplicate order">Duplicate contract</option>
                </select>
              </div>
            </div>

            <div className="p-3.5 bg-slate-50 border-t border-slate-100 flex justify-end gap-2">
              <button
                onClick={() => setShowCancelModal(null)}
                className="px-3 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-200 rounded-lg"
              >
                Exit
              </button>
              <button
                onClick={handleCancelPO}
                disabled={!cancelReason}
                className="px-4 py-1.5 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg shadow-xs disabled:opacity-40"
              >
                Confirm Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
