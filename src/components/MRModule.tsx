import React, { useState } from "react";
import { MRHeader, MRLine, Item, Store, Department, User, TransactionStatus, AuditLog } from "../types";
import { Plus, X, Eye, FileEdit, Trash2, BadgeX, CornerDownRight } from "lucide-react";

interface MRModuleProps {
  mrs: MRHeader[];
  setMrs: (mrs: MRHeader[]) => void;
  items: Item[];
  stores: Store[];
  departments: Department[];
  currentUser: User;
}

export default function MRModule({
  mrs,
  setMrs,
  items,
  stores,
  departments,
  currentUser
}: MRModuleProps) {
  const [selectedMR, setSelectedMR] = useState<MRHeader | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isAmending, setIsAmending] = useState<MRHeader | null>(null);

  // Creation form states
  const [fromStore, setFromStore] = useState(stores[0]?.id || "");
  const [requestDept, setRequestDept] = useState(departments[0]?.id || "");
  const [requiredDate, setRequiredDate] = useState(new Date().toISOString().split("T")[0]);
  const [purpose, setPurpose] = useState("");
  const [remarks, setRemarks] = useState("");
  const [mrLines, setMrLines] = useState<{ itemId: string; quantity: number }[]>([]);

  // Creation line builder
  const [tempItem, setTempItem] = useState(items[0]?.id || "");
  const [tempQty, setTempQty] = useState(1);

  // Cancellations & Short Close
  const [showCancelModal, setShowCancelModal] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("");

  const [showShortCloseModal, setShowShortCloseModal] = useState<MRHeader | null>(null);
  const [shortCloseLineId, setShortCloseLineId] = useState("");
  const [shortCloseReason, setShortCloseReason] = useState("");

  const addMrLine = () => {
    if (tempQty <= 0) return;
    setMrLines([...mrLines, { itemId: tempItem, quantity: tempQty }]);
    setTempQty(1);
  };

  const removeMrLine = (index: number) => {
    setMrLines(mrLines.filter((_, i) => i !== index));
  };

  // Submit MR
  const handleSaveMR = (status: "Draft" | "Submitted") => {
    if (mrLines.length === 0) {
      alert("Please add at least one line item.");
      return;
    }

    const mrId = `MR-2026-000${mrs.length + 1}`;

    // Estimate MR value based on standard costing rate
    const estimatedValue = mrLines.reduce((sum, l) => {
      const itm = items.find(i => i.id === l.itemId);
      const cost = itm ? (itm.lastPurchaseRate || itm.standardRate) : 0;
      return sum + (l.quantity * cost);
    }, 0);

    const newMR: MRHeader = {
      id: mrId,
      fromStoreId: fromStore,
      requestingDeptId: requestDept,
      status: status === "Submitted" ? "Pending Approval" : "Draft",
      requiredDate,
      purpose,
      remarks,
      lines: mrLines.map((line, idx) => ({
        id: `MRL-${mrId}-${idx + 1}`,
        itemId: line.itemId,
        quantity: line.quantity,
        issuedQty: 0,
        isShortClosed: false
      })),
      estimatedValue,
      amendmentNumber: 0,
      auditTrail: [
        {
          id: `AUD-${Date.now()}`,
          timestamp: new Date().toISOString(),
          userId: currentUser.id,
          userName: currentUser.name,
          action: status === "Submitted" ? "Submitted" : "Created Draft",
          details: `Internal Material Request raised. Est. value charged to CC is $${estimatedValue.toFixed(2)}.`
        }
      ]
    };

    setMrs([...mrs, newMR]);
    setIsCreating(false);
    setMrLines([]);
    setPurpose("");
    setRemarks("");
  };

  // Submit MR Amendment
  const handleAmendSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAmending) return;

    // Calculate new estimated value
    const newEstimatedValue = isAmending.lines.reduce((sum, line) => {
      const itm = items.find(i => i.id === line.itemId);
      const cost = itm ? (itm.lastPurchaseRate || itm.standardRate) : 0;
      return sum + (line.quantity * cost);
    }, 0);

    const oldVal = mrs.find(m => m.id === isAmending.id)?.estimatedValue || 0;
    const isIncrease = newEstimatedValue > oldVal;

    const newStatus: TransactionStatus = isIncrease ? "Pending Approval" : "Approved";
    const nextAmdNum = isAmending.amendmentNumber + 1;
    const amdSuffix = `-AMD-${nextAmdNum.toString().padStart(2, "0")}`;

    const newAudit: AuditLog = {
      id: `AUD-${Date.now()}`,
      timestamp: new Date().toISOString(),
      userId: currentUser.id,
      userName: currentUser.name,
      action: `Amended (${isAmending.id}${amdSuffix})`,
      details: `Amended requested quantities. Valuation adjusted from $${oldVal.toFixed(2)} to $${newEstimatedValue.toFixed(2)}. ${
        isIncrease ? "Increase triggers re-approval." : "Maintained Approved/Open state."
      }`
    };

    const updated = mrs.map(m => {
      if (m.id === isAmending.id) {
        return {
          ...isAmending,
          status: newStatus,
          estimatedValue: newEstimatedValue,
          amendmentNumber: nextAmdNum,
          auditTrail: [...isAmending.auditTrail, newAudit]
        };
      }
      return m;
    });

    setMrs(updated);
    setIsAmending(null);
    setSelectedMR(null);
  };

  // Cancel MR
  const handleCancelMR = () => {
    if (!showCancelModal || !cancelReason) return;

    const target = mrs.find(m => m.id === showCancelModal);
    if (!target) return;

    // Validation: block if any material issues exist
    const hasIssue = target.lines.some(l => l.issuedQty > 0);
    if (hasIssue) {
      alert("Cancellation Blocked: Issues have already been posted against this request. Use 'Short Close' instead.");
      setShowCancelModal(null);
      return;
    }

    const updated = mrs.map(m => {
      if (m.id === showCancelModal) {
        return {
          ...m,
          status: "Cancelled" as TransactionStatus,
          reasonCode: cancelReason,
          auditTrail: [
            ...m.auditTrail,
            {
              id: `AUD-${Date.now()}`,
              timestamp: new Date().toISOString(),
              userId: currentUser.id,
              userName: currentUser.name,
              action: "Cancelled",
              details: `Material Request Cancelled. Reason: "${cancelReason}"`
            }
          ]
        };
      }
      return m;
    });

    setMrs(updated);
    setShowCancelModal(null);
    setCancelReason("");
    setSelectedMR(null);
  };

  // Short Close MR line
  const handleShortCloseSubmit = () => {
    if (!showShortCloseModal || !shortCloseLineId || !shortCloseReason) return;

    const targetMR = mrs.find(m => m.id === showShortCloseModal.id);
    if (!targetMR) return;

    const updatedLines = targetMR.lines.map(line => {
      if (line.id === shortCloseLineId) {
        return { ...line, isShortClosed: true };
      }
      return line;
    });

    const allClosed = updatedLines.every(l => l.isShortClosed || l.issuedQty >= l.quantity);
    const nextStatus: TransactionStatus = allClosed ? "Closed" : "Partially Fulfilled";

    const closeAudit: AuditLog = {
      id: `AUD-${Date.now()}`,
      timestamp: new Date().toISOString(),
      userId: currentUser.id,
      userName: currentUser.name,
      action: "Short Closed Line",
      details: `Short closed line ${shortCloseLineId}. Reason code: "${shortCloseReason}"`
    };

    const updated = mrs.map(m => {
      if (m.id === showShortCloseModal.id) {
        return {
          ...m,
          status: nextStatus,
          lines: updatedLines,
          auditTrail: [...m.auditTrail, closeAudit]
        };
      }
      return m;
    });

    setMrs(updated);
    setShowShortCloseModal(null);
    setShortCloseLineId("");
    setShortCloseReason("");
    setSelectedMR(null);
  };

  return (
    <div className="space-y-6" id="mr-module-layout">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Side MR Catalog */}
        <div className="lg:col-span-2 bg-white p-6 rounded-xl border border-slate-100 shadow-xs space-y-4">
          <div className="flex justify-between items-center pb-3 border-b border-slate-100">
            <div>
              <h2 className="text-base font-bold text-slate-800">Internal Store Material Requests (MR)</h2>
              <p className="text-xs text-slate-400 mt-0.5">Kitchen, Housekeeping, and F&B sub-stores stock transfer pipelines.</p>
            </div>
            <button
              onClick={() => setIsCreating(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-xs"
              id="btn-raise-mr"
            >
              <Plus size={14} />
              Raise MR Request
            </button>
          </div>

          <div className="overflow-x-auto rounded-lg border border-slate-100">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-400 font-bold uppercase border-b border-slate-100">
                  <th className="p-3">Request ID</th>
                  <th className="p-3">Source Store</th>
                  <th className="p-3">Charging Cost Center</th>
                  <th className="p-3">Required Date</th>
                  <th className="p-3">Est. Value</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-600 font-medium">
                {mrs.map(mr => {
                  const storeObj = stores.find(s => s.id === mr.fromStoreId);
                  const deptObj = departments.find(d => d.id === mr.requestingDeptId);
                  return (
                    <tr key={mr.id} className="hover:bg-slate-50/50">
                      <td className="p-3 font-mono font-bold text-slate-800 flex items-center gap-1">
                        {mr.id}
                        {mr.amendmentNumber > 0 && (
                          <span className="text-[9px] px-1 bg-amber-50 text-amber-700 border border-amber-200 rounded font-bold">
                            AMD-{mr.amendmentNumber}
                          </span>
                        )}
                      </td>
                      <td className="p-3 font-bold text-slate-700">{storeObj?.name}</td>
                      <td className="p-3 font-mono text-indigo-600 font-bold">{deptObj?.costCenter} ({deptObj?.name})</td>
                      <td className="p-3">{mr.requiredDate}</td>
                      <td className="p-3 font-bold text-slate-700">${mr.estimatedValue.toFixed(2)}</td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          mr.status === "Draft" ? "bg-slate-100 text-slate-600" :
                          mr.status === "Pending Approval" ? "bg-amber-100 text-amber-800" :
                          mr.status === "Approved" ? "bg-emerald-100 text-emerald-800" :
                          mr.status === "Partially Fulfilled" ? "bg-blue-100 text-blue-800" :
                          mr.status === "Closed" ? "bg-slate-200 text-slate-700" :
                          "bg-rose-100 text-rose-800"
                        }`}>
                          {mr.status}
                        </span>
                      </td>
                      <td className="p-3 text-right flex items-center justify-end gap-1.5">
                        <button 
                          onClick={() => setSelectedMR(mr)}
                          className="p-1 hover:bg-slate-100 text-slate-500 hover:text-slate-800 rounded transition-colors"
                          title="View Details"
                        >
                          <Eye size={14} />
                        </button>
                        {mr.status === "Approved" && mr.lines.every(l => l.issuedQty === 0) && (
                          <button 
                            onClick={() => setIsAmending(mr)}
                            className="p-1 hover:bg-slate-100 text-amber-600 hover:text-amber-800 rounded transition-colors"
                            title="Amend MR"
                          >
                            <FileEdit size={14} />
                          </button>
                        )}
                        {(mr.status === "Approved" || mr.status === "Partially Fulfilled") && (
                          <button 
                            onClick={() => setShowShortCloseModal(mr)}
                            className="p-1 hover:bg-slate-100 text-indigo-600 hover:text-indigo-800 rounded transition-colors"
                            title="Short Close Line"
                          >
                            <BadgeX size={14} />
                          </button>
                        )}
                        {mr.status !== "Closed" && mr.status !== "Cancelled" && (
                          <button 
                            onClick={() => setShowCancelModal(mr.id)}
                            className="p-1 hover:bg-slate-100 text-rose-500 hover:text-rose-700 rounded transition-colors"
                            title="Cancel MR"
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

        {/* Right Side Inspector */}
        <div className="bg-white p-6 rounded-xl border border-slate-100 shadow-xs">
          {selectedMR ? (
            <div className="space-y-5" id="mr-detail-pane">
              <div className="flex justify-between items-start pb-3 border-b border-slate-100">
                <div>
                  <span className="text-[10px] font-bold tracking-wider uppercase text-slate-400 font-mono">Detail Inspector</span>
                  <h3 className="text-sm font-bold text-slate-800">{selectedMR.id} Details</h3>
                </div>
                <button onClick={() => setSelectedMR(null)} className="text-slate-400 hover:text-slate-600 p-0.5">
                  <X size={16} />
                </button>
              </div>

              {/* Status banner */}
              <div className="p-3 bg-slate-50 border border-slate-100 rounded-lg space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="font-bold text-slate-500">MR Status:</span>
                  <span className="font-bold text-slate-800">{selectedMR.status}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-semibold text-slate-500">Department:</span>
                  <span className="font-bold text-slate-800">{departments.find(d => d.id === selectedMR.requestingDeptId)?.name}</span>
                </div>
                <div className="flex justify-between border-t border-slate-200/40 pt-1 text-xs">
                  <span className="font-medium text-slate-400">Total Valuation:</span>
                  <span className="font-bold text-slate-700">${selectedMR.estimatedValue.toFixed(2)}</span>
                </div>
                {selectedMR.reasonCode && (
                  <div className="text-[11px] text-rose-600 font-bold mt-1">
                    Reason Code: {selectedMR.reasonCode}
                  </div>
                )}
                {selectedMR.approverRemarks && (
                  <div className="text-[11px] text-amber-700 bg-amber-50 p-1.5 rounded mt-1 border border-amber-200/50 font-medium">
                    <span className="font-bold">Approver Remark:</span> "{selectedMR.approverRemarks}"
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block">Material Request Lines</span>
                <div className="space-y-2 max-h-[180px] overflow-y-auto pr-1">
                  {selectedMR.lines.map(line => {
                    const itemObj = items.find(i => i.id === line.itemId);
                    return (
                      <div key={line.id} className="p-3 bg-slate-50/70 border border-slate-200/40 rounded-lg flex justify-between items-start">
                        <div>
                          <p className="text-xs font-bold text-slate-800">{itemObj?.name}</p>
                          <p className="text-[10px] text-slate-400">Standard Rate: ${itemObj?.standardRate.toFixed(2)}</p>
                          {line.isShortClosed && (
                            <span className="mt-1 px-1.5 py-0.2 bg-rose-100 text-rose-800 font-bold text-[9px] rounded block w-max">
                              SHORT CLOSED
                            </span>
                          )}
                        </div>
                        <div className="text-right">
                          <p className="text-xs font-bold text-slate-700">{line.quantity} {itemObj?.unit}</p>
                          <p className="text-[10px] text-blue-600 bg-blue-50 px-1 py-0.2 rounded inline-block font-bold">Issued: {line.issuedQty}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Audit trail */}
              <div className="space-y-2 border-t border-slate-100 pt-4">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block">Workflow Logs</span>
                <div className="space-y-2 max-h-[160px] overflow-y-auto pr-1 text-[11px] text-slate-600">
                  {selectedMR.auditTrail.map((log, idx) => (
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
              <p className="text-sm font-semibold text-slate-600 mt-2">No Request Inspected</p>
              <p className="text-xs text-slate-400 max-w-[200px] mt-0.5">Select any Material Request from the catalog list to audit its lines and issuing status.</p>
            </div>
          )}
        </div>
      </div>

      {/* CREATE MR REQUEST MODAL */}
      {isCreating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4" id="create-mr-modal">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <h3 className="text-sm font-bold text-slate-800">Raise Material Request (MR)</h3>
              <button onClick={() => setIsCreating(false)} className="text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-200">
                <X size={16} />
              </button>
            </div>

            <div className="p-6 space-y-5 overflow-y-auto flex-1">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Source Store (Request from)</label>
                  <select
                    value={fromStore}
                    onChange={(e) => setFromStore(e.target.value)}
                    className="w-full p-2 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 bg-white"
                  >
                    {stores.map(s => <option key={s.id} value={s.id}>{s.name} ({s.code})</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Charging Cost Center Department</label>
                  <select
                    value={requestDept}
                    onChange={(e) => setRequestDept(e.target.value)}
                    className="w-full p-2 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 bg-white"
                  >
                    {departments.map(d => <option key={d.id} value={d.id}>{d.name} ({d.costCenter})</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Required Date</label>
                  <input
                    type="date"
                    value={requiredDate}
                    onChange={(e) => setRequiredDate(e.target.value)}
                    className="w-full p-2 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 bg-white"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Purpose</label>
                  <input
                    type="text"
                    placeholder="e.g. Daily pastry replenishment"
                    value={purpose}
                    onChange={(e) => setPurpose(e.target.value)}
                    className="w-full p-2 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 bg-white"
                  />
                </div>
                <div className="md:col-span-2 space-y-1">
                  <label className="text-xs font-bold text-slate-700">Remarks</label>
                  <input
                    type="text"
                    placeholder="Additional details..."
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                    className="w-full p-2 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 bg-white"
                  />
                </div>
              </div>

              {/* Line Builder */}
              <div className="border-t border-slate-100 pt-4 space-y-3">
                <span className="text-xs font-bold text-slate-700 block">Requisition Line Editor</span>
                
                <div className="p-3 bg-slate-50 border border-slate-200/65 rounded-xl flex flex-col sm:flex-row gap-3 items-end">
                  <div className="flex-1 space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Select Item</label>
                    <select
                      value={tempItem}
                      onChange={(e) => setTempItem(e.target.value)}
                      className="w-full p-1.5 border border-slate-200 rounded text-xs bg-white text-slate-700"
                    >
                      {items.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
                    </select>
                  </div>
                  <div className="w-32 space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Quantity</label>
                    <input
                      type="number"
                      min="1"
                      value={tempQty}
                      onChange={(e) => setTempQty(parseInt(e.target.value) || 1)}
                      className="w-full p-1 border border-slate-200 rounded text-xs bg-white text-slate-700"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={addMrLine}
                    className="py-1.5 px-4 text-xs font-bold text-white bg-slate-800 hover:bg-slate-950 rounded transition-colors"
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
                        <th className="p-2">Qty Requested</th>
                        <th className="p-2">UOM</th>
                        <th className="p-2 text-right">Delete</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {mrLines.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="p-3 text-center text-slate-400 font-medium">No items added to MR yet.</td>
                        </tr>
                      ) : (
                        mrLines.map((line, idx) => {
                          const itemObj = items.find(i => i.id === line.itemId);
                          return (
                            <tr key={idx} className="hover:bg-slate-50/50 font-medium text-slate-700">
                              <td className="p-2">{itemObj?.name}</td>
                              <td className="p-2 font-bold">{line.quantity}</td>
                              <td className="p-2 text-slate-400">{itemObj?.unit}</td>
                              <td className="p-2 text-right">
                                <button type="button" onClick={() => removeMrLine(idx)} className="text-rose-500 hover:text-rose-700">
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
                onClick={() => handleSaveMR("Draft")}
                className="px-3.5 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 rounded-lg transition-all"
              >
                Save as Draft
              </button>
              <button
                onClick={() => handleSaveMR("Submitted")}
                className="px-4 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-xs"
              >
                Submit for Approval
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AMEND APPROVED MR MODAL */}
      {isAmending && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4" id="amend-mr-modal">
          <form onSubmit={handleAmendSubmit} className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="text-sm font-bold text-slate-800">Amend Material Request {isAmending.id}</h3>
                <p className="text-[10px] text-slate-400 mt-0.5">Edit requested quantities. Quantities cannot go below already-issued levels.</p>
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
                    <div className="grid grid-cols-1 gap-3">
                      <div className="space-y-1">
                        <label className="text-[11px] font-bold text-slate-500">Amend Qty (Min: {line.issuedQty})</label>
                        <input
                          type="number"
                          min={line.issuedQty}
                          required
                          value={line.quantity}
                          onChange={(e) => {
                            const newQty = Math.max(line.issuedQty, parseInt(e.target.value) || 0);
                            const updated = [...isAmending.lines];
                            updated[idx] = { ...line, quantity: newQty };
                            setIsAmending({ ...isAmending, lines: updated });
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
                Discard
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

      {/* SHORT CLOSE MODAL */}
      {showShortCloseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4" id="short-close-mr-modal">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-sm w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <h3 className="text-sm font-bold text-slate-800">Short Close MR {showShortCloseModal.id} Line</h3>
              <button onClick={() => setShowShortCloseModal(null)} className="text-slate-400 hover:text-slate-600">
                <X size={16} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <p className="text-xs text-slate-500">Closes the remaining un-issued quantities on this request. The department confirms these are no longer needed.</p>
              
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-600">Select Line item to Close</label>
                <select
                  value={shortCloseLineId}
                  onChange={(e) => setShortCloseLineId(e.target.value)}
                  className="w-full p-2 text-xs border border-slate-200 rounded-lg bg-white text-slate-700 font-medium"
                  required
                >
                  <option value="">-- Choose Line --</option>
                  {showShortCloseModal.lines.filter(l => !l.isShortClosed && l.quantity - l.issuedQty > 0).map(l => {
                    const itemObj = items.find(i => i.id === l.itemId);
                    return <option key={l.id} value={l.id}>{itemObj?.name} (Open: {l.quantity - l.issuedQty})</option>;
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
                  <option value="excess canceled">No longer needed by kitchen/dept</option>
                  <option value="item replaced">Alternative item issued instead</option>
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
                className="px-4 py-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-xs disabled:opacity-40"
              >
                Short Close Line
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CANCELLATION MODAL */}
      {showCancelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4" id="cancel-mr-modal">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-sm w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <h3 className="text-sm font-bold text-slate-800">Cancel Material Request</h3>
              <button onClick={() => setShowCancelModal(null)} className="text-slate-400 hover:text-slate-600">
                <X size={16} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <p className="text-xs text-slate-500">This will permanently cancel this material request. Allowed only if zero issues have been posted against it.</p>
              
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-600">Mandatory Reason Code</label>
                <select
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  className="w-full p-2 text-xs border border-slate-200 rounded-lg bg-white font-medium text-slate-700"
                  required
                >
                  <option value="">-- Choose Reason --</option>
                  <option value="duplicate request">Duplicate Request</option>
                  <option value="cancelled plan">Banquet plan cancelled</option>
                  <option value="item unavailable">Item completely out-of-stock</option>
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
                onClick={handleCancelMR}
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
