import React, { useState } from "react";
import { PRHeader, PRLine, Item, Store, Department, User, TransactionStatus, AuditLog } from "../types";
import { Plus, X, Eye, FileEdit, Trash2, CheckCircle2, ShieldAlert, ArrowRight, CornerDownRight, Clock } from "lucide-react";

interface PRModuleProps {
  prs: PRHeader[];
  setPrs: (prs: PRHeader[]) => void;
  items: Item[];
  stores: Store[];
  departments: Department[];
  currentUser: User;
  onConvertToPO: (prHeader: PRHeader, selectedLines: { lineId: string; qty: number }[]) => void;
  onViewAudit?: (id: string, type: string, trail: any[]) => void;
}

export default function PRModule({
  prs,
  setPrs,
  items,
  stores,
  departments,
  currentUser,
  onConvertToPO,
  onViewAudit
}: PRModuleProps) {
  const [selectedPR, setSelectedPR] = useState<PRHeader | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isAmending, setIsAmending] = useState<PRHeader | null>(null);

  // Form Fields for Raising new PR
  const [targetStore, setTargetStore] = useState(stores[0]?.id || "");
  const [targetDept, setTargetDept] = useState(departments[0]?.id || "");
  const [purpose, setPurpose] = useState("");
  const [remarks, setRemarks] = useState("");
  const [prLines, setPrLines] = useState<{ itemId: string; quantity: number; requiredByDate: string; remarks: string }[]>([]);

  // Temp Line builder
  const [tempItem, setTempItem] = useState(items[0]?.id || "");
  const [tempQty, setTempQty] = useState(1);
  const [tempDate, setTempDate] = useState(new Date().toISOString().split("T")[0]);
  const [tempRemarks, setTempRemarks] = useState("");

  // Convert to PO Form fields
  const [showPOConvert, setShowPOConvert] = useState<PRHeader | null>(null);
  const [poLinesQty, setPoLinesQty] = useState<Record<string, number>>({});

  // Cancel Reason Form fields
  const [showCancelModal, setShowCancelModal] = useState<string | null>(null); // PR ID
  const [cancelReason, setCancelReason] = useState("");

  // Add line to the active list
  const addPrLine = () => {
    if (tempQty <= 0) return;
    setPrLines([...prLines, {
      itemId: tempItem,
      quantity: tempQty,
      requiredByDate: tempDate,
      remarks: tempRemarks
    }]);
    setTempQty(1);
    setTempRemarks("");
  };

  const removePrLine = (index: number) => {
    setPrLines(prLines.filter((_, i) => i !== index));
  };

  // Submit PR
  const handleSavePR = (status: "Draft" | "Submitted") => {
    if (prLines.length === 0) {
      alert("Please add at least one line item.");
      return;
    }

    // Validation: Date and qty check
    const today = new Date().toISOString().split("T")[0];
    const invalidLine = prLines.find(line => line.quantity <= 0 || line.requiredByDate < today);
    if (invalidLine) {
      alert("Invalid line item: Quantity must be > 0 and Required Date must be today or in the future.");
      return;
    }

    const prId = `PR-2026-000${prs.length + 1}`;
    
    // Estimate value
    const estimatedValue = prLines.reduce((sum, line) => {
      const itm = items.find(i => i.id === line.itemId);
      const rate = itm ? (itm.lastPurchaseRate || itm.standardRate) : 0;
      return sum + (line.quantity * rate);
    }, 0);

    const newHeader: PRHeader = {
      id: prId,
      property: "Grand Plaza Resort",
      storeId: targetStore,
      departmentId: targetDept,
      status: status === "Submitted" ? "Pending Approval" : "Draft",
      requesterId: currentUser.id,
      requiredByDate: prLines[0]?.requiredByDate || today,
      purpose,
      remarks,
      estimatedValue,
      amendmentNumber: 0,
      lines: prLines.map((line, idx) => ({
        id: `PRL-${prId}-${idx + 1}`,
        itemId: line.itemId,
        quantity: line.quantity,
        requiredByDate: line.requiredByDate,
        remarks: line.remarks,
        poConvertedQty: 0
      })),
      auditTrail: [
        {
          id: `AUD-${Date.now()}-1`,
          timestamp: new Date().toISOString(),
          userId: currentUser.id,
          userName: currentUser.name,
          action: status === "Submitted" ? "Submitted" : "Created Draft",
          details: `PR created with estimated total of $${estimatedValue.toFixed(2)}`
        }
      ]
    };

    setPrs([...prs, newHeader]);
    setIsCreating(false);
    // Reset Form
    setPurpose("");
    setRemarks("");
    setPrLines([]);
  };

  // Start Amendment
  const startAmending = (pr: PRHeader) => {
    setIsAmending(pr);
    // Deep clone lines into a separate state if editing, but let's edit directly inside a simpler container
  };

  const handleAmendSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAmending) return;

    // We can only amend quantity, remarks, and required-by date. Item cannot be changed.
    // Calculate new estimated value
    const newEstimatedValue = isAmending.lines.reduce((sum, line) => {
      const itm = items.find(i => i.id === line.itemId);
      const rate = itm ? (itm.lastPurchaseRate || itm.standardRate) : 0;
      return sum + (line.quantity * rate);
    }, 0);

    // Any increase triggers re-approval (back to Pending Approval) if exceeds tolerance (default 0%)
    const oldVal = isAmending.estimatedValue;
    const isIncrease = newEstimatedValue > oldVal;
    
    const newStatus: TransactionStatus = isIncrease ? "Pending Approval" : "Approved";
    const nextAmendmentNum = isAmending.amendmentNumber + 1;
    const amdSuffix = `-AMD-${nextAmendmentNum.toString().padStart(2, "0")}`;

    const newAudit: AuditLog = {
      id: `AUD-${Date.now()}`,
      timestamp: new Date().toISOString(),
      userId: currentUser.id,
      userName: currentUser.name,
      action: `Amended (${isAmending.id}${amdSuffix})`,
      details: `Amended lines. Value shifted from $${oldVal.toFixed(2)} to $${newEstimatedValue.toFixed(2)}. ${
        isIncrease ? "Value increased; re-approval requested." : "Value within tolerance; maintained approval state."
      }`
    };

    const updatedPRs = prs.map(p => {
      if (p.id === isAmending.id) {
        return {
          ...isAmending,
          status: newStatus,
          estimatedValue: newEstimatedValue,
          amendmentNumber: nextAmendmentNum,
          auditTrail: [...isAmending.auditTrail, newAudit]
        };
      }
      return p;
    });

    setPrs(updatedPRs);
    setIsAmending(null);
    setSelectedPR(null);
  };

  // Cancel PR
  const handleCancelPR = () => {
    if (!showCancelModal || !cancelReason) return;

    const updatedPRs = prs.map(p => {
      if (p.id === showCancelModal) {
        // Log Cancellation audit trail
        const cancelAudit: AuditLog = {
          id: `AUD-${Date.now()}`,
          timestamp: new Date().toISOString(),
          userId: currentUser.id,
          userName: currentUser.name,
          action: "Cancelled",
          details: `Cancelled. Reason code selected: "${cancelReason}"`
        };
        return {
          ...p,
          status: "Cancelled" as TransactionStatus,
          reasonCode: cancelReason,
          auditTrail: [...p.auditTrail, cancelAudit]
        };
      }
      return p;
    });

    setPrs(updatedPRs);
    setShowCancelModal(null);
    setCancelReason("");
    setSelectedPR(null);
  };

  // Convert Lines Action
  const triggerConversion = (pr: PRHeader) => {
    setShowPOConvert(pr);
    // Initialize PO Qty mapping to remaining unconverted qty
    const initialQtys: Record<string, number> = {};
    pr.lines.forEach(line => {
      const remaining = line.quantity - line.poConvertedQty;
      if (remaining > 0) {
        initialQtys[line.id] = remaining;
      }
    });
    setPoLinesQty(initialQtys);
  };

  const handleConvertSubmit = () => {
    if (!showPOConvert) return;
    const selectedLines = Object.entries(poLinesQty)
      .filter(([_, qty]) => (qty as number) > 0)
      .map(([lineId, qty]) => ({ lineId, qty: qty as number }));

    if (selectedLines.length === 0) {
      alert("Please select at least one line with quantity > 0");
      return;
    }

    onConvertToPO(showPOConvert, selectedLines);
    setShowPOConvert(null);
  };

  return (
    <div className="space-y-6" id="pr-module-layout">
      {/* List / Grid layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Left Side PR Records */}
        <div className="lg:col-span-2 bg-white p-6 rounded-xl border border-slate-100 shadow-xs space-y-4">
          <div className="flex justify-between items-center pb-3 border-b border-slate-100">
            <div>
              <h2 className="text-base font-bold text-slate-800">Internal Purchase Requisitions</h2>
              <p className="text-xs text-slate-400 mt-0.5">Track and authorize department material needs.</p>
            </div>
            <button
              onClick={() => setIsCreating(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors shadow-xs"
              id="btn-create-new-pr"
            >
              <Plus size={14} />
              Raise Requisition
            </button>
          </div>

          <div className="overflow-x-auto rounded-lg border border-slate-100">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-400 font-bold uppercase border-b border-slate-100">
                  <th className="p-3">Doc ID</th>
                  <th className="p-3">Department / Store</th>
                  <th className="p-3">Lines</th>
                  <th className="p-3">Required By</th>
                  <th className="p-3">Est. Value</th>
                  <th className="p-3">Workflow State</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-600 font-medium">
                {prs.map(pr => (
                  <tr key={pr.id} className="hover:bg-slate-50/50">
                    <td className="p-3 font-mono font-bold text-slate-800 flex items-center gap-1">
                      {pr.id}
                      {pr.amendmentNumber > 0 && (
                        <span className="text-[9px] px-1 bg-amber-50 text-amber-700 border border-amber-200 rounded">
                          AMD-{pr.amendmentNumber}
                        </span>
                      )}
                    </td>
                    <td className="p-3">
                      <div className="font-semibold text-slate-700">{departments.find(d => d.id === pr.departmentId)?.name}</div>
                      <div className="text-[10px] text-slate-400">Store: {stores.find(s => s.id === pr.storeId)?.name}</div>
                    </td>
                    <td className="p-3 font-semibold">{pr.lines.length} items</td>
                    <td className="p-3">{pr.requiredByDate}</td>
                    <td className="p-3 font-bold text-slate-700">${pr.estimatedValue.toFixed(2)}</td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        pr.status === "Draft" ? "bg-slate-100 text-slate-600" :
                        pr.status === "Pending Approval" ? "bg-amber-100 text-amber-800" :
                        pr.status === "Approved" ? "bg-emerald-100 text-emerald-800" :
                        pr.status === "Closed" ? "bg-blue-100 text-indigo-800" :
                        "bg-rose-100 text-rose-800"
                      }`}>
                        {pr.status}
                      </span>
                    </td>
                    <td className="p-3 text-right flex items-center justify-end gap-1.5">
                      <button 
                        onClick={() => setSelectedPR(pr)}
                        className="p-1 hover:bg-slate-100 text-slate-500 hover:text-slate-800 rounded transition-colors"
                        title="View PR Details"
                      >
                        <Eye size={14} />
                      </button>
                      {pr.status === "Approved" && pr.lines.some(l => l.quantity - l.poConvertedQty > 0) && (
                        <button 
                          onClick={() => triggerConversion(pr)}
                          className="px-2 py-0.5 text-[10px] font-bold bg-indigo-50 text-indigo-600 border border-indigo-200 hover:bg-indigo-600 hover:text-white rounded-md transition-colors flex items-center gap-0.5"
                          title="Convert to Supplier PO"
                        >
                          PO <ArrowRight size={10} />
                        </button>
                      )}
                      {pr.status === "Approved" && pr.lines.every(l => l.poConvertedQty === 0) && (
                        <button 
                          onClick={() => startAmending(pr)}
                          className="p-1 hover:bg-slate-100 text-amber-600 hover:text-amber-800 rounded transition-colors"
                          title="Amend Requisition"
                        >
                          <FileEdit size={14} />
                        </button>
                      )}
                      {pr.status !== "Closed" && pr.status !== "Cancelled" && (
                        <button 
                          onClick={() => setShowCancelModal(pr.id)}
                          className="p-1 hover:bg-slate-100 text-rose-500 hover:text-rose-700 rounded transition-colors"
                          title="Cancel PR"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Side Info Pane: Details, Audit, Conversion */}
        <div className="bg-white p-6 rounded-xl border border-slate-100 shadow-xs">
          {selectedPR ? (
            <div className="space-y-5" id="pr-detail-pane">
              <div className="flex justify-between items-start pb-3 border-b border-slate-100">
                <div>
                  <span className="text-[10px] font-bold tracking-wider uppercase text-slate-400 font-mono">Detail Inspector</span>
                  <h3 className="text-sm font-bold text-slate-800">{selectedPR.id} Details</h3>
                </div>
                <button onClick={() => setSelectedPR(null)} className="text-slate-400 hover:text-slate-600 p-0.5">
                  <X size={16} />
                </button>
              </div>

              {/* Status Banner */}
              <div className="p-3 bg-slate-50 border border-slate-100 rounded-lg space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="font-bold text-slate-500">Current Status:</span>
                  <span className="font-bold text-slate-800">{selectedPR.status}</span>
                </div>
                {selectedPR.reasonCode && (
                  <div className="text-[11px] text-rose-600 font-bold">
                    Reason: {selectedPR.reasonCode}
                  </div>
                )}
                {selectedPR.approverRemarks && (
                  <div className="text-[11px] text-amber-700 bg-amber-50 p-1.5 rounded mt-1 border border-amber-200/50">
                    <span className="font-bold">Approver Remark:</span> "{selectedPR.approverRemarks}"
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block">Requisition Items</span>
                <div className="space-y-2 max-h-[180px] overflow-y-auto pr-1">
                  {selectedPR.lines.map(line => {
                    const itemObj = items.find(i => i.id === line.itemId);
                    return (
                      <div key={line.id} className="p-3 bg-slate-50/70 border border-slate-200/40 rounded-lg flex justify-between items-start">
                        <div>
                          <p className="text-xs font-bold text-slate-800">{itemObj?.name}</p>
                          <p className="text-[10px] text-slate-400">Required: {line.requiredByDate} • SKU: {itemObj?.sku}</p>
                          {line.remarks && <p className="text-[10px] text-slate-500 italic mt-0.5">"{line.remarks}"</p>}
                        </div>
                        <div className="text-right">
                          <p className="text-xs font-bold text-slate-700">{line.quantity} {itemObj?.unit}</p>
                          <p className="text-[10px] text-indigo-600 bg-indigo-50 px-1 py-0.2 rounded inline-block font-bold">PO Converted: {line.poConvertedQty}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Audit trail */}
              <div className="space-y-3 border-t border-slate-100 pt-4">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block">Property Chain Audit Logs</span>
                  {onViewAudit && (
                    <button
                      onClick={() => onViewAudit(selectedPR.id, "Requisition (PR)", selectedPR.auditTrail)}
                      className="px-2.5 py-1 text-[10px] font-extrabold text-indigo-600 hover:text-white bg-indigo-50 hover:bg-indigo-600 border border-indigo-100 hover:border-indigo-600 rounded-sm transition-all cursor-pointer flex items-center gap-1"
                    >
                      <Clock size={10} /> View Visual Timeline
                    </button>
                  )}
                </div>
                <div className="space-y-2 max-h-[180px] overflow-y-auto pr-1 text-[11px] text-slate-600">
                  {selectedPR.auditTrail.map((log, index) => (
                    <div key={log.id || index} className="flex gap-2 items-start">
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
              <p className="text-sm font-semibold text-slate-600 mt-2">No Requisition Inspected</p>
              <p className="text-xs text-slate-400 max-w-[200px] mt-0.5">Select any PR from the catalog list to audit its items and workflow log steps.</p>
            </div>
          )}
        </div>
      </div>

      {/* CREATE REQUISITION DRAWER/MODAL */}
      {isCreating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4" id="create-pr-modal">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <h3 className="text-sm font-bold text-slate-800">Raise Material Requisition (PR)</h3>
              <button onClick={() => setIsCreating(false)} className="text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-200 transition-colors">
                <X size={16} />
              </button>
            </div>

            <div className="p-6 space-y-5 overflow-y-auto flex-1">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Property Delivery Store</label>
                  <select
                    value={targetStore}
                    onChange={(e) => setTargetStore(e.target.value)}
                    className="w-full p-2 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 bg-white"
                  >
                    {stores.map(s => <option key={s.id} value={s.id}>{s.name} ({s.code})</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Requesting Dept / Cost Center</label>
                  <select
                    value={targetDept}
                    onChange={(e) => setTargetDept(e.target.value)}
                    className="w-full p-2 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 bg-white"
                  >
                    {departments.map(d => <option key={d.id} value={d.id}>{d.name} ({d.costCenter})</option>)}
                  </select>
                </div>
                <div className="md:col-span-2 space-y-1">
                  <label className="text-xs font-bold text-slate-700">Purchase Purpose / Business Remarks</label>
                  <input
                    type="text"
                    placeholder="e.g. Replenishment for Winter menu preparation"
                    value={purpose}
                    onChange={(e) => setPurpose(e.target.value)}
                    className="w-full p-2 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 bg-white"
                  />
                </div>
              </div>

              {/* Line Builder */}
              <div className="border-t border-slate-100 pt-4 space-y-3">
                <span className="text-xs font-bold text-slate-700 block">Requisition Line Editor</span>
                
                <div className="p-3 bg-slate-50 border border-slate-200/60 rounded-xl grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Select Item</label>
                    <select
                      value={tempItem}
                      onChange={(e) => setTempItem(e.target.value)}
                      className="w-full p-1.5 border border-slate-200 rounded text-xs bg-white text-slate-700 font-medium"
                    >
                      {items.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Quantity Needed</label>
                    <input
                      type="number"
                      min="1"
                      value={tempQty}
                      onChange={(e) => setTempQty(parseInt(e.target.value) || 1)}
                      className="w-full p-1 border border-slate-200 rounded text-xs bg-white text-slate-700"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Required By Date</label>
                    <input
                      type="date"
                      value={tempDate}
                      onChange={(e) => setTempDate(e.target.value)}
                      className="w-full p-1 border border-slate-200 rounded text-xs bg-white text-slate-700"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={addPrLine}
                    className="py-1.5 px-3 text-xs font-bold text-white bg-slate-800 hover:bg-slate-950 rounded transition-colors"
                  >
                    Add Line
                  </button>
                </div>

                {/* Built Lines Table */}
                <div className="max-h-[160px] overflow-y-auto border border-slate-150 rounded-lg">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-150 font-bold text-slate-500">
                        <th className="p-2">Item</th>
                        <th className="p-2">Qty</th>
                        <th className="p-2">UOM</th>
                        <th className="p-2">Required Date</th>
                        <th className="p-2 text-right">Delete</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {prLines.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="p-3 text-center text-slate-400 font-medium">No items added to Requisition yet.</td>
                        </tr>
                      ) : (
                        prLines.map((line, idx) => {
                          const itemObj = items.find(i => i.id === line.itemId);
                          return (
                            <tr key={idx} className="hover:bg-slate-50/50 font-medium text-slate-700">
                              <td className="p-2">{itemObj?.name}</td>
                              <td className="p-2 font-bold">{line.quantity}</td>
                              <td className="p-2 text-slate-400">{itemObj?.unit}</td>
                              <td className="p-2">{line.requiredByDate}</td>
                              <td className="p-2 text-right">
                                <button type="button" onClick={() => removePrLine(idx)} className="text-rose-500 hover:text-rose-700">
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
                className="px-3.5 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-200 rounded-lg transition-colors"
              >
                Discard
              </button>
              <button
                onClick={() => handleSavePR("Draft")}
                className="px-3.5 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 rounded-lg transition-all"
              >
                Save as Draft
              </button>
              <button
                onClick={() => handleSavePR("Submitted")}
                className="px-4 py-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors shadow-xs"
              >
                Submit for Approval
              </button>
            </div>
          </div>
        </div>
      )}

      {/* POST-APPROVAL AMENDMENT MODAL */}
      {isAmending && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4" id="amend-pr-modal">
          <form onSubmit={handleAmendSubmit} className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="text-sm font-bold text-slate-800">Amend Approved {isAmending.id}</h3>
                <p className="text-[10px] text-slate-400 mt-0.5">Post-approval updates. Any value-increase re-triggers Approval.</p>
              </div>
              <button type="button" onClick={() => setIsAmending(null)} className="text-slate-400 hover:text-slate-600">
                <X size={16} />
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
              {isAmending.lines.map((line, idx) => {
                const itemObj = items.find(i => i.id === line.itemId);
                return (
                  <div key={line.id} className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                    <p className="text-xs font-extrabold text-slate-800 flex items-center gap-1">
                      <CornerDownRight size={12} className="text-indigo-500" />
                      Line {idx + 1}: {itemObj?.name}
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[11px] font-bold text-slate-500">Amend Qty</label>
                        <input
                          type="number"
                          min="1"
                          required
                          value={line.quantity}
                          onChange={(e) => {
                            const newQty = parseInt(e.target.value) || 1;
                            const updatedLines = [...isAmending.lines];
                            updatedLines[idx] = { ...line, quantity: newQty };
                            setIsAmending({ ...isAmending, lines: updatedLines });
                          }}
                          className="w-full p-2 text-xs border border-slate-200 rounded-lg bg-white"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[11px] font-bold text-slate-500">Amend Required By Date</label>
                        <input
                          type="date"
                          required
                          value={line.requiredByDate}
                          onChange={(e) => {
                            const newDate = e.target.value;
                            const updatedLines = [...isAmending.lines];
                            updatedLines[idx] = { ...line, requiredByDate: newDate };
                            setIsAmending({ ...isAmending, lines: updatedLines });
                          }}
                          className="w-full p-2 text-xs border border-slate-200 rounded-lg bg-white"
                        />
                      </div>
                      <div className="col-span-2 space-y-1">
                        <label className="text-[11px] font-bold text-slate-500">Line Specific Remarks</label>
                        <input
                          type="text"
                          value={line.remarks}
                          onChange={(e) => {
                            const newRem = e.target.value;
                            const updatedLines = [...isAmending.lines];
                            updatedLines[idx] = { ...line, remarks: newRem };
                            setIsAmending({ ...isAmending, lines: updatedLines });
                          }}
                          className="w-full p-2 text-xs border border-slate-200 rounded-lg bg-white"
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
                Discard Changes
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-xs"
              >
                Submit Amendment
              </button>
            </div>
          </form>
        </div>
      )}

      {/* CONVERT TO PO MODAL */}
      {showPOConvert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4" id="convert-pr-to-po-modal">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="text-sm font-bold text-slate-800">Convert Requisition lines to PO</h3>
                <p className="text-[10px] text-slate-400 mt-0.5">Select items and allocate quantities to purchase.</p>
              </div>
              <button onClick={() => setShowPOConvert(null)} className="text-slate-400 hover:text-slate-600">
                <X size={16} />
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[55vh] overflow-y-auto">
              <p className="text-xs text-slate-600">You are converting Approved Requisition <span className="font-bold text-slate-800">{showPOConvert.id}</span>. Unallocated quantities will remain open on the Requisition.</p>
              
              <div className="space-y-3">
                {showPOConvert.lines.map(line => {
                  const itemObj = items.find(i => i.id === line.itemId);
                  const maxQty = line.quantity - line.poConvertedQty;
                  if (maxQty <= 0) return null;

                  return (
                    <div key={line.id} className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex justify-between items-center">
                      <div className="space-y-0.5">
                        <p className="text-xs font-bold text-slate-800">{itemObj?.name}</p>
                        <p className="text-[10px] text-slate-400">Open Qty: {maxQty} {itemObj?.unit} (Ordered: {line.quantity})</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="text-[10px] font-bold text-slate-500">Alloc Qty:</label>
                        <input
                          type="number"
                          min="0"
                          max={maxQty}
                          value={poLinesQty[line.id] ?? 0}
                          onChange={(e) => {
                            const val = Math.min(maxQty, Math.max(0, parseInt(e.target.value) || 0));
                            setPoLinesQty({ ...poLinesQty, [line.id]: val });
                          }}
                          className="w-16 p-1 text-center border border-slate-200 rounded text-xs bg-white text-slate-800 font-bold"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-2">
              <button
                onClick={() => setShowPOConvert(null)}
                className="px-3.5 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-200 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleConvertSubmit}
                className="px-4 py-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-xs"
              >
                Proceed with Conversion
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CANCELLATION MODAL */}
      {showCancelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4" id="cancel-pr-modal">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-sm w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <h3 className="text-sm font-bold text-slate-800">Cancel Requisition {showCancelModal}</h3>
              <button onClick={() => setShowCancelModal(null)} className="text-slate-400 hover:text-slate-600">
                <X size={16} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <p className="text-xs text-slate-500">This will permanently cancel all open lines in requisition {showCancelModal}. Cancelled PR is retained for audits.</p>
              
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-600">Reason Code Code</label>
                <select
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  className="w-full p-2 text-xs border border-slate-200 rounded-lg bg-white font-medium text-slate-700"
                  required
                >
                  <option value="">-- Choose Reason --</option>
                  <option value="no longer required">No longer required</option>
                  <option value="duplicate">Duplicate document</option>
                  <option value="wrong item">Wrong item selected</option>
                  <option value="budget denied">Budget denied</option>
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
                onClick={handleCancelPR}
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
