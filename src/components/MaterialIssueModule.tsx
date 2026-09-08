import React, { useState } from "react";
import { MRHeader, IssueHeader as MaterialIssueHeader, IssueLine as MaterialIssueLine, IssueReturnHeader, Item, Store, Department, User, StockBalance } from "../types";
import { Plus, X, Eye, ShieldAlert, ArrowRightLeft, CheckCircle2, AlertTriangle } from "lucide-react";
import PrintButton from "./PrintButton";
import PrintDocumentModal from "./PrintDocumentModal";

interface MaterialIssueProps {
  issues: MaterialIssueHeader[];
  setIssues: (issues: MaterialIssueHeader[]) => void;
  issueReturns: IssueReturnHeader[];
  setIssueReturns: (ret: IssueReturnHeader[]) => void;
  mrs: MRHeader[];
  setMrs: (mrs: MRHeader[]) => void;
  items: Item[];
  stores: Store[];
  departments: Department[];
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

export default function MaterialIssueModule({
  issues,
  setIssues,
  issueReturns,
  setIssueReturns,
  mrs,
  setMrs,
  items,
  stores,
  departments,
  balances,
  currentUser,
  onPostStockLedger
}: MaterialIssueProps) {
  const [activeTab, setActiveTab] = useState<"issues" | "returns">("issues");
  const [selectedDoc, setSelectedDoc] = useState<{ type: "Issue" | "Return"; doc: any } | null>(null);
  const [printDoc, setPrintDoc] = useState<{ type: "ISSUE" | "ISSUE_RETURN"; doc: any } | null>(null);

  // Issue form states
  const [isCreatingIssue, setIsCreatingIssue] = useState(false);
  const [issueType, setIssueType] = useState<"MR" | "Direct">("MR");
  const [selectedMRId, setSelectedMRId] = useState("");
  const [issueStore, setIssueStore] = useState(stores[0]?.id || "");
  const [issueDept, setIssueDept] = useState(departments[0]?.id || "");
  const [directReason, setDirectReason] = useState("");

  // MR based quantities
  const [mrIssueQtys, setMrIssueQtys] = useState<Record<string, number>>({});
  const [mrIssueBatches, setMrIssueBatches] = useState<Record<string, string>>({});

  // Direct Issue lists
  const [directLines, setDirectLines] = useState<{ itemId: string; qty: number; batch: string }[]>([]);
  const [tempItem, setTempItem] = useState(items[0]?.id || "");
  const [tempQty, setTempQty] = useState(1);
  const [tempBatch, setTempBatch] = useState("");

  // Issue Return Form states
  const [isCreatingReturn, setIsCreatingReturn] = useState(false);
  const [selectedIssueId, setSelectedIssueId] = useState("");
  const [returnQtys, setReturnQtys] = useState<Record<string, number>>({}); // issueLineId -> qty
  const [returnSpoiled, setReturnSpoiled] = useState<Record<string, boolean>>({}); // issueLineId -> isSpoiled/Expired

  const handleMRSelect = (mrId: string) => {
    setSelectedMRId(mrId);
    const mr = mrs.find(m => m.id === mrId);
    if (!mr) return;

    const qtys: Record<string, number> = {};
    const batches: Record<string, string> = {};

    mr.lines.forEach(line => {
      const open = line.quantity - line.issuedQty;
      qtys[line.id] = Math.max(0, open);
      
      // Auto assign default batch
      const bal = balances.find(b => b.storeId === mr.fromStoreId && b.itemId === line.itemId);
      batches[line.id] = bal?.fifoQueue[0]?.batch || "FIFO-AUTO";
    });

    setMrIssueQtys(qtys);
    setMrIssueBatches(batches);
  };

  const handleAddDirectLine = () => {
    if (tempQty <= 0) return;
    setDirectLines([...directLines, {
      itemId: tempItem,
      qty: tempQty,
      batch: tempBatch || "FIFO-AUTO"
    }]);
    setTempQty(1);
    setTempBatch("");
  };

  // Confirm Material Issue
  const handlePostIssue = () => {
    const issueId = `ISS-2026-000${issues.length + 1}`;

    if (issueType === "MR") {
      const mrObj = mrs.find(m => m.id === selectedMRId);
      if (!mrObj) return;

      let hasError = false;
      const issueLines: MaterialIssueLine[] = [];

      mrObj.lines.forEach(line => {
        const reqQty = mrIssueQtys[line.id] ?? 0;
        if (reqQty <= 0) return;

        // Rule 1: Cannot issue more than open MR quantity
        const open = line.quantity - line.issuedQty;
        if (reqQty > open) {
          alert(`Issue Blocked: Issue qty ${reqQty} exceeds open request qty ${open} on line ${line.id}.`);
          hasError = true;
          return;
        }

        // Rule 2: NO NEGATIVE STOCK ALLOWED! Check physical availability in source store
        const balObj = balances.find(b => b.storeId === mrObj.fromStoreId && b.itemId === line.itemId);
        const onHand = balObj ? balObj.qtyOnHand : 0;
        if (reqQty > onHand) {
          alert(`Issue Blocked: Insufficient physical stock in store ${stores.find(s => s.id === mrObj.fromStoreId)?.name}. Required: ${reqQty}, On-Hand: ${onHand}. No negative stock allowed!`);
          hasError = true;
          return;
        }

        // Get standard rate for valuation from master
        const itemObj = items.find(i => i.id === line.itemId);
        const rate = itemObj ? (itemObj.lastPurchaseRate || itemObj.standardRate) : 0;

        issueLines.push({
          id: `ISSL-${issueId}-${line.id.slice(-1)}`,
          itemId: line.itemId,
          qtyIssued: reqQty,
          batchLotNumber: mrIssueBatches[line.id] || "FIFO-AUTO",
          sourceMRLineId: line.id
        });
      });

      if (hasError || issueLines.length === 0) return;

      const deptObj = departments.find(d => d.id === mrObj.requestingDeptId);

      const newIssue: MaterialIssueHeader = {
        id: issueId,
        sourceMRId: mrObj.id,
        storeId: mrObj.fromStoreId,
        requestingDeptId: mrObj.requestingDeptId,
        costCenter: deptObj?.costCenter || "CC-GEN",
        issueDate: new Date().toISOString().split("T")[0],
        isDirect: false,
        status: "Posted",
        lines: issueLines
      };

      // 1. Post stock reductions to ledger (negative quantities)
      issueLines.forEach(line => {
        const itemObj = items.find(i => i.id === line.itemId);
        const rate = itemObj ? (itemObj.lastPurchaseRate || itemObj.standardRate) : 0;
        onPostStockLedger(
          mrObj.fromStoreId,
          line.itemId,
          -line.qtyIssued, // reduction
          rate,
          "Material Issue",
          issueId,
          line.batchLotNumber
        );
      });

      // 2. Update MR line issued-quantities
      const updatedMRLines = mrObj.lines.map(line => {
        const issueMatch = issueLines.find(il => il.sourceMRLineId === line.id);
        if (issueMatch) {
          return { ...line, issuedQty: line.issuedQty + issueMatch.qtyIssued };
        }
        return line;
      });

      const allFulfilled = updatedMRLines.every(l => l.issuedQty >= l.quantity || l.isShortClosed);
      const nextMRStatus = allFulfilled ? "Closed" : "Partially Fulfilled";

      const updatedMRs = mrs.map(m => {
        if (m.id === mrObj.id) {
          return { ...m, status: nextMRStatus as any, lines: updatedMRLines };
        }
        return m;
      });

      setMrs(updatedMRs);
      setIssues([...issues, newIssue]);
      setIsCreatingIssue(false);
      setMrIssueQtys({});
    } else {
      // Direct Issue Exception
      if (directLines.length === 0 || !directReason) {
        alert("Please add lines and provide a reason code for direct issue exceptions.");
        return;
      }

      let hasError = false;
      const issueLines: MaterialIssueLine[] = [];

      directLines.forEach((line, idx) => {
        // Validation: NO NEGATIVE STOCK
        const balObj = balances.find(b => b.storeId === issueStore && b.itemId === line.itemId);
        const onHand = balObj ? balObj.qtyOnHand : 0;
        if (line.qty > onHand) {
          alert(`Issue Blocked: Insufficient stock for ${items.find(i => i.id === line.itemId)?.name} in direct store. Requested: ${line.qty}, On Hand: ${onHand}.`);
          hasError = true;
          return;
        }

        const itemObj = items.find(i => i.id === line.itemId);
        const rate = itemObj ? (itemObj.lastPurchaseRate || itemObj.standardRate) : 0;

        issueLines.push({
          id: `ISSL-${issueId}-${idx + 1}`,
          itemId: line.itemId,
          qtyIssued: line.qty,
          batchLotNumber: line.batch
        });
      });

      if (hasError || issueLines.length === 0) return;

      const deptObj = departments.find(d => d.id === issueDept);

      const newIssue: MaterialIssueHeader = {
        id: issueId,
        storeId: issueStore,
        requestingDeptId: issueDept,
        costCenter: deptObj?.costCenter || "CC-GEN",
        issueDate: new Date().toISOString().split("T")[0],
        isDirect: true,
        reasonCode: directReason,
        status: "Posted",
        lines: issueLines
      };

      // Post stock-out ledger reductions
      issueLines.forEach(line => {
        const itemObj = items.find(i => i.id === line.itemId);
        const rate = itemObj ? (itemObj.lastPurchaseRate || itemObj.standardRate) : 0;
        onPostStockLedger(
          issueStore,
          line.itemId,
          -line.qtyIssued,
          rate,
          "Material Issue",
          issueId,
          line.batchLotNumber
        );
      });

      setIssues([...issues, newIssue]);
      setIsCreatingIssue(false);
      setDirectLines([]);
      setDirectReason("");
    }
  };

  // Post Issue Return (Department returning excess back to store)
  const handlePostReturn = () => {
    const issueObj = issues.find(i => i.id === selectedIssueId);
    if (!issueObj) return;

    const returnId = `IR-2026-000${issueReturns.length + 1}`;
    const newLines: any[] = [];
    let hasError = false;

    issueObj.lines.forEach(line => {
      const retQty = returnQtys[line.id] ?? 0;
      const spoiled = returnSpoiled[line.id] ?? false;

      if (retQty <= 0) return;

      // Validate returns don't exceed original issue quantities
      if (retQty > line.qtyIssued) {
        alert(`Return Blocked: Return qty ${retQty} exceeds originally issued quantity ${line.qtyIssued}.`);
        hasError = true;
        return;
      }

      newLines.push({
        id: `IRL-${returnId}-${line.id.slice(-1)}`,
        itemId: line.itemId,
        issueLineId: line.id,
        returnQty: retQty,
        isSpoiledOrExpired: spoiled
      });
    });

    if (hasError || newLines.length === 0) return;

    const newReturn: IssueReturnHeader = {
      id: returnId,
      issueId: issueObj.id,
      storeId: issueObj.storeId,
      departmentId: issueObj.requestingDeptId,
      returnDate: new Date().toISOString().split("T")[0],
      status: "Posted",
      lines: newLines
    };

    // Post stock adjustments back to Store ledger (positive values)
    newLines.forEach(line => {
      const origLine = issueObj.lines.find(il => il.id === line.issueLineId)!;
      const itemObj = items.find(i => i.id === line.itemId);
      const rate = itemObj ? (itemObj.lastPurchaseRate || itemObj.standardRate) : 0;
      // Perishable/Spoiled items get quarantined/written-off or simple flag
      onPostStockLedger(
        issueObj.storeId,
        line.itemId,
        line.returnQty, // stock goes back up!
        rate,
        "Issue Return",
        returnId,
        line.isSpoiledOrExpired ? "QUARANTINE" : origLine.batchLotNumber
      );
    });

    setIssueReturns([...issueReturns, newReturn]);
    setIsCreatingReturn(false);
  };

  return (
    <div className="space-y-6" id="material-issue-layout">
      {/* Tab select */}
      <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-xs flex justify-between items-center">
        <div className="flex gap-2 bg-slate-100 p-1 rounded-lg">
          <button
            onClick={() => { setActiveTab("issues"); setSelectedDoc(null); }}
            className={`px-4 py-1.5 text-xs font-bold rounded-md transition-colors ${
              activeTab === "issues" ? "bg-white text-purple-700 shadow-xs" : "text-slate-500 hover:text-slate-800"
            }`}
          >
            Material Issues
          </button>
          <button
            onClick={() => { setActiveTab("returns"); setSelectedDoc(null); }}
            className={`px-4 py-1.5 text-xs font-bold rounded-md transition-colors ${
              activeTab === "returns" ? "bg-white text-emerald-800 shadow-xs" : "text-slate-500 hover:text-slate-800"
            }`}
          >
            Issue Returns (Cost Recovery)
          </button>
        </div>

        {activeTab === "issues" ? (
          <button
            onClick={() => setIsCreatingIssue(true)}
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors shadow-xs"
            id="btn-trigger-issue"
          >
            <Plus size={14} />
            Post Material Issue
          </button>
        ) : (
          <button
            onClick={() => setIsCreatingReturn(true)}
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors shadow-xs"
            id="btn-trigger-issue-return"
          >
            <Plus size={14} />
            Raise Issue Return
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main List */}
        <div className="lg:col-span-2 bg-white p-6 rounded-xl border border-slate-100 shadow-xs space-y-4">
          {activeTab === "issues" ? (
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-slate-700">Posted Material Consumption Issues</h3>
              <div className="overflow-x-auto rounded-lg border border-slate-100">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 text-slate-400 font-bold uppercase border-b border-slate-100">
                      <th className="p-3">Issue ID</th>
                      <th className="p-3">Linked MR Req</th>
                      <th className="p-3">Source Store</th>
                      <th className="p-3">Receiving Dept</th>
                      <th className="p-3">Issued Date</th>
                      <th className="p-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-600 font-medium">
                    {issues.map(iss => {
                      const storeObj = stores.find(s => s.id === iss.storeId);
                      const deptObj = departments.find(d => d.id === iss.requestingDeptId);
                      return (
                        <tr key={iss.id} className="hover:bg-slate-50/50">
                          <td className="p-3 font-mono font-bold text-purple-700">{iss.id}</td>
                          <td className="p-3 font-mono text-slate-500">{iss.sourceMRId || "DIRECT"}</td>
                          <td className="p-3 font-semibold text-slate-700">{storeObj?.name}</td>
                          <td className="p-3">{deptObj?.name}</td>
                          <td className="p-3">{iss.issueDate}</td>
                          <td className="p-3 text-right flex items-center justify-end gap-1.5">
                            <PrintButton
                              variant="table-action"
                              size="xs"
                              title="Print / Reprint Issue Slip"
                              onClick={() => setPrintDoc({ type: "ISSUE", doc: iss })}
                            />
                            <button 
                              onClick={() => setSelectedDoc({ type: "Issue", doc: iss })}
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
              <h3 className="text-sm font-bold text-slate-700">Department Issue Return Documents</h3>
              <div className="overflow-x-auto rounded-lg border border-slate-100">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 text-slate-400 font-bold uppercase border-b border-slate-100">
                      <th className="p-3">Return ID</th>
                      <th className="p-3">Original Issue ID</th>
                      <th className="p-3">Target Store</th>
                      <th className="p-3">Date Returned</th>
                      <th className="p-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-600 font-medium">
                    {issueReturns.map(ret => {
                      const storeObj = stores.find(s => s.id === ret.storeId);
                      return (
                        <tr key={ret.id} className="hover:bg-slate-50/50">
                          <td className="p-3 font-mono font-bold text-emerald-700">{ret.id}</td>
                          <td className="p-3 font-mono text-slate-500">{ret.issueId}</td>
                          <td className="p-3 font-semibold text-slate-700">{storeObj?.name}</td>
                          <td className="p-3">{ret.returnDate}</td>
                          <td className="p-3 text-right flex items-center justify-end gap-1.5">
                            <PrintButton
                              variant="table-action"
                              size="xs"
                              title="Print / Reprint Return Voucher"
                              onClick={() => setPrintDoc({ type: "ISSUE_RETURN", doc: ret })}
                            />
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
          )}
        </div>

        {/* Right Side inspector */}
        <div className="bg-white p-6 rounded-xl border border-slate-100 shadow-xs">
          {selectedDoc ? (
            <div className="space-y-5" id="detail-pane">
              <div className="flex justify-between items-start pb-3 border-b border-slate-100">
                <div>
                  <span className="text-[10px] font-bold tracking-wider uppercase text-slate-400 font-mono">Detail Inspector</span>
                  <h3 className="text-sm font-bold text-slate-800">{selectedDoc.doc.id} Details</h3>
                </div>
                <div className="flex items-center gap-1.5">
                  <PrintButton
                    variant="secondary"
                    size="xs"
                    label={selectedDoc.type === "Issue" ? "Print Issue" : "Print Return"}
                    title="Print / Reprint Formal Voucher"
                    onClick={() => setPrintDoc({ type: selectedDoc.type === "Issue" ? "ISSUE" : "ISSUE_RETURN", doc: selectedDoc.doc })}
                  />
                  <button onClick={() => setSelectedDoc(null)} className="text-slate-400 hover:text-slate-600 p-0.5">
                    <X size={16} />
                  </button>
                </div>
              </div>

              {selectedDoc.type === "Issue" ? (
                <div className="space-y-4">
                  <div className="p-3 bg-purple-50 border border-blue-100 rounded-lg space-y-1 text-xs">
                    <div className="flex justify-between font-bold text-purple-800">
                      <span>Ledger Status:</span>
                      <span>CONSUMED-POSTED</span>
                    </div>
                    <div className="flex justify-between text-slate-600 pt-1 border-t border-purple-200/30">
                      <span>Debited CC:</span>
                      <span className="font-bold text-slate-800">{departments.find(d => d.id === selectedDoc.doc.requestingDeptId)?.costCenter}</span>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block">Issued Quantities</span>
                    <div className="space-y-2">
                      {selectedDoc.doc.lines.map((line: any) => {
                        const itemObj = items.find(i => i.id === line.itemId);
                        const rate = itemObj ? (itemObj.lastPurchaseRate || itemObj.standardRate || 0) : 0;
                        return (
                          <div key={line.id} className="p-3 bg-slate-50 border border-slate-200/40 rounded-lg text-xs space-y-1">
                            <div className="flex justify-between font-bold text-slate-800">
                              <span>{itemObj?.name}</span>
                              <span className="text-rose-600">-{line.qtyIssued} {itemObj?.unit}</span>
                            </div>
                            <div className="flex justify-between text-[10px] text-slate-400 pt-1 border-t border-slate-100">
                              <span>Batch: <span className="font-mono font-bold text-slate-500">{line.batchLotNumber}</span></span>
                              <span>Est Cost: ${(line.qtyIssued * rate).toFixed(2)}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-lg space-y-1 text-xs">
                    <div className="flex justify-between font-bold text-emerald-800">
                      <span>Ledger Status:</span>
                      <span>RESTOCKED-POSTED</span>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block">Returned Stock Lines</span>
                    <div className="space-y-2">
                      {selectedDoc.doc.lines.map((line: any) => {
                        const itemObj = items.find(i => i.id === line.itemId);
                        return (
                          <div key={line.id} className="p-3 bg-slate-50 border border-slate-200/40 rounded-lg text-xs space-y-1">
                            <div className="flex justify-between font-bold text-slate-800">
                              <span>{itemObj?.name}</span>
                              <span className="text-emerald-600 font-bold">+{line.returnQty} {itemObj?.unit}</span>
                            </div>
                            {line.isSpoiledOrExpired && (
                              <span className="inline-block text-[9px] font-bold bg-rose-100 text-rose-800 px-1.5 py-0.2 rounded mt-1">
                                QUARANTINED (SPOILED/EXPIRED)
                              </span>
                            )}
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
              <p className="text-xs text-slate-400 max-w-[200px] mt-0.5">Select any material issue or department return from the list to audit physical ledger debits/credits.</p>
            </div>
          )}
        </div>
      </div>

      {/* CREATE MATERIAL ISSUE MODAL */}
      {isCreatingIssue && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4" id="create-issue-modal">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="text-sm font-bold text-slate-800">Dispatch Physical Material Issue</h3>
                <p className="text-[10px] text-slate-400 mt-0.5 font-medium">Reconciles against physical stock. Strictly blocks if requested qty creates negative stock.</p>
              </div>
              <button onClick={() => setIsCreatingIssue(false)} className="text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-200">
                <X size={16} />
              </button>
            </div>

            <div className="p-6 space-y-5 overflow-y-auto flex-1">
              <div className="flex gap-4 p-1 bg-slate-100 rounded-lg w-max mb-2">
                <button
                  type="button"
                  onClick={() => setIssueType("MR")}
                  className={`px-4 py-1.5 text-xs font-bold rounded-md transition-colors ${
                    issueType === "MR" ? "bg-white text-purple-600 shadow-xs" : "text-slate-500"
                  }`}
                >
                  Fulfill Approved Requisition (MR)
                </button>
                <button
                  type="button"
                  onClick={() => setIssueType("Direct")}
                  className={`px-4 py-1.5 text-xs font-bold rounded-md transition-colors ${
                    issueType === "Direct" ? "bg-white text-purple-600 shadow-xs" : "text-slate-500"
                  }`}
                >
                  Direct Consumption Issue
                </button>
              </div>

              {issueType === "MR" ? (
                <div className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700">Select Active Approved Store Requisition (MR)</label>
                    <select
                      value={selectedMRId}
                      onChange={(e) => handleMRSelect(e.target.value)}
                      className="w-full p-2 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 bg-white"
                    >
                      <option value="">-- Choose MR --</option>
                      {mrs.filter(m => m.status === "Approved" || m.status === "Partially Fulfilled").map(m => (
                        <option key={m.id} value={m.id}>{m.id} - Dept: {departments.find(d => d.id === m.requestingDeptId)?.name} (Source Store: {stores.find(s => s.id === m.fromStoreId)?.code})</option>
                      ))}
                    </select>
                  </div>

                  {selectedMRId && (
                    <div className="space-y-3 pt-3 border-t border-slate-100">
                      <span className="text-xs font-bold text-slate-700 block">Dispatch Lines & FIFO Batch Allocation</span>
                      
                      {mrs.find(m => m.id === selectedMRId)?.lines.map(line => {
                        const itemObj = items.find(i => i.id === line.itemId);
                        const open = line.quantity - line.issuedQty;
                        if (open <= 0 && !line.isShortClosed) return null;

                        // Check current balance for warning
                        const mrObj = mrs.find(m => m.id === selectedMRId)!;
                        const balObj = balances.find(b => b.storeId === mrObj.fromStoreId && b.itemId === line.itemId);
                        const onHand = balObj ? balObj.qtyOnHand : 0;

                        return (
                          <div key={line.id} className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                            <div className="flex justify-between">
                              <h4 className="text-xs font-extrabold text-slate-800">{itemObj?.name}</h4>
                              <div className="flex gap-2 text-[10px] font-bold">
                                <span className="bg-purple-50 text-purple-700 px-2 py-0.5 rounded">Requested Open: {open}</span>
                                <span className={`px-2 py-0.5 rounded ${onHand < open ? "bg-rose-100 text-rose-800" : "bg-emerald-100 text-emerald-800"}`}>
                                  Available On Hand: {onHand}
                                </span>
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3 items-end">
                              <div className="space-y-1">
                                <label className="text-[10px] font-bold text-slate-500 uppercase">Quantity to Issue</label>
                                <input
                                  type="number"
                                  min="0"
                                  max={Math.min(open, onHand)}
                                  value={mrIssueQtys[line.id] ?? 0}
                                  onChange={(e) => setMrIssueQtys({ ...mrIssueQtys, [line.id]: Math.min(open, Math.max(0, parseInt(e.target.value) || 0)) })}
                                  className="w-full p-1.5 border border-slate-200 rounded bg-white text-xs font-bold text-slate-800"
                                />
                              </div>

                              <div className="space-y-1">
                                <label className="text-[10px] font-bold text-slate-500 uppercase">Batch queue allocation</label>
                                <select
                                  value={mrIssueBatches[line.id] ?? "FIFO-AUTO"}
                                  onChange={(e) => setMrIssueBatches({ ...mrIssueBatches, [line.id]: e.target.value })}
                                  className="w-full p-1.5 border border-slate-200 rounded bg-white text-xs text-slate-700 font-medium"
                                >
                                  <option value="FIFO-AUTO">-- Automatic FIFO --</option>
                                  {balObj?.fifoQueue.map((bb, idx) => (
                                    <option key={bb.batch || idx} value={bb.batch || `FIFO-${idx}`}>{bb.batch || `FIFO Lot #${idx + 1}`} (OnHand: {bb.qty})</option>
                                  ))}
                                </select>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : (
                // Direct Issue Exception
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-700">Source Store (Debit stock)</label>
                      <select
                        value={issueStore}
                        onChange={(e) => setIssueStore(e.target.value)}
                        className="w-full p-2 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 bg-white"
                      >
                        {stores.map(s => <option key={s.id} value={s.id}>{s.name} ({s.code})</option>)}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-700">Receiving CC Department</label>
                      <select
                        value={issueDept}
                        onChange={(e) => setIssueDept(e.target.value)}
                        className="w-full p-2 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 bg-white"
                      >
                        {departments.map(d => <option key={d.id} value={d.id}>{d.name} ({d.costCenter})</option>)}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-700">Mandatory Reason Code</label>
                      <select
                        value={directReason}
                        onChange={(e) => setDirectReason(e.target.value)}
                        className="w-full p-2 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 bg-white"
                        required
                      >
                        <option value="">-- Choose Reason --</option>
                        <option value="immediate breakage">Immediate Breakage replacement</option>
                        <option value="guest amenity">VIP guest room amenity write-off</option>
                        <option value="emergency kitchen use">Kitchen emergency consumption</option>
                      </select>
                    </div>
                  </div>

                  {/* Direct Line builder */}
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl grid grid-cols-1 sm:grid-cols-4 gap-2 items-end">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase">Select Item</label>
                      <select
                        value={tempItem}
                        onChange={(e) => setTempItem(e.target.value)}
                        className="w-full p-1.5 border border-slate-200 rounded bg-white text-xs text-slate-700"
                      >
                        {items.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase">Qty Issue</label>
                      <input
                        type="number"
                        min="1"
                        value={tempQty}
                        onChange={(e) => setTempQty(parseInt(e.target.value) || 1)}
                        className="w-full p-1 border border-slate-200 rounded text-xs bg-white text-slate-700"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase">Batch queue</label>
                      <input
                        type="text"
                        placeholder="FIFO-AUTO"
                        value={tempBatch}
                        onChange={(e) => setTempBatch(e.target.value)}
                        className="w-full p-1 border border-slate-200 rounded text-xs bg-white text-slate-700"
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

                  {/* Direct issues lines built list */}
                  <div className="border border-slate-150 rounded-lg max-h-[140px] overflow-y-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-50 font-bold border-b border-slate-150 text-slate-500">
                          <th className="p-2">Item Name</th>
                          <th className="p-2">Qty</th>
                          <th className="p-2">Batch</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                        {directLines.length === 0 ? (
                          <tr>
                            <td colSpan={3} className="p-3 text-center text-slate-400 font-medium">No direct lines added yet.</td>
                          </tr>
                        ) : (
                          directLines.map((line, idx) => {
                            const itemObj = items.find(i => i.id === line.itemId);
                            return (
                              <tr key={idx} className="hover:bg-slate-50/50">
                                <td className="p-2">{itemObj?.name}</td>
                                <td className="p-2 font-bold">{line.qty} {itemObj?.unit}</td>
                                <td className="p-2 font-mono text-slate-500">{line.batch}</td>
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

            <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-2">
              <button
                onClick={() => setIsCreatingIssue(false)}
                className="px-3.5 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-200 rounded-lg"
              >
                Discard
              </button>
              <button
                onClick={handlePostIssue}
                className="px-4 py-1.5 text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-lg shadow-xs"
              >
                Post Issue & Reduce Stock
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CREATE ISSUE RETURN MODAL */}
      {isCreatingReturn && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4" id="issue-return-modal">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="text-sm font-bold text-slate-800">Raise Department Material Return</h3>
                <p className="text-[10px] text-slate-400 mt-0.5">Returns unused materials back into store. Quarantines spoiled/perished units.</p>
              </div>
              <button onClick={() => setIsCreatingReturn(false)} className="text-slate-400 hover:text-slate-600 p-1 rounded-full">
                <X size={16} />
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[55vh] overflow-y-auto">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">Select Original Posted Issue Document</label>
                <select
                  value={selectedIssueId}
                  onChange={(e) => {
                    setSelectedIssueId(e.target.value);
                    const iss = issues.find(i => i.id === e.target.value);
                    if (!iss) return;
                    const qtys: Record<string, number> = {};
                    const spoiled: Record<string, boolean> = {};
                    iss.lines.forEach(l => {
                      qtys[l.id] = 0;
                      spoiled[l.id] = false;
                    });
                    setReturnQtys(qtys);
                    setReturnSpoiled(spoiled);
                  }}
                  className="w-full p-2 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 bg-white"
                >
                  <option value="">-- Choose Issue --</option>
                  {issues.map(i => (
                    <option key={i.id} value={i.id}>{i.id} (Store: {stores.find(s => s.id === i.storeId)?.code} - Dept: {departments.find(d => d.id === i.requestingDeptId)?.costCenter})</option>
                  ))}
                </select>
              </div>

              {selectedIssueId && (
                <div className="space-y-3 pt-3 border-t border-slate-100">
                  <span className="text-xs font-bold text-slate-700 block">Configure Return Quantities</span>
                  
                  {issues.find(i => i.id === selectedIssueId)?.lines.map(line => {
                    const itemObj = items.find(itm => itm.id === line.itemId);
                    return (
                      <div key={line.id} className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                        <div className="flex justify-between text-xs font-bold text-slate-800">
                          <span>{itemObj?.name}</span>
                          <span className="text-purple-600 bg-purple-50 px-2 py-0.5 rounded">Originally Issued: {line.qtyIssued}</span>
                        </div>

                        <div className="grid grid-cols-2 gap-3 items-end">
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-500 uppercase">Return Quantity</label>
                            <input
                              type="number"
                              min="0"
                              max={line.qtyIssued}
                              value={returnQtys[line.id] ?? 0}
                              onChange={(e) => setReturnQtys({ ...returnQtys, [line.id]: Math.min(line.qtyIssued, Math.max(0, parseInt(e.target.value) || 0)) })}
                              className="w-full p-1.5 border border-slate-200 rounded bg-white text-xs font-bold text-slate-800"
                            />
                          </div>

                          <div className="flex items-center gap-2 pb-1 bg-amber-50/50 p-1.5 border border-amber-200/30 rounded">
                            <input
                              type="checkbox"
                              id={`spoiled-${line.id}`}
                              checked={returnSpoiled[line.id] ?? false}
                              onChange={(e) => setReturnSpoiled({ ...returnSpoiled, [line.id]: e.target.checked })}
                              className="w-4 h-4 text-rose-600 border-slate-300 rounded cursor-pointer"
                            />
                            <label htmlFor={`spoiled-${line.id}`} className="text-[10px] font-bold text-rose-800 cursor-pointer">
                              Spoiled / Expired? (Quarantine)
                            </label>
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
                disabled={!selectedIssueId}
                className="px-4 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-xs disabled:opacity-40"
              >
                Post Issue Return
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PRINT / REPRINT ISSUE OR RETURN MODAL */}
      <PrintDocumentModal
        isOpen={!!printDoc}
        onClose={() => setPrintDoc(null)}
        documentData={printDoc ? { type: printDoc.type, rawDoc: printDoc.doc } : null}
        items={items}
        stores={stores}
        departments={departments}
        currentUser={currentUser}
      />
    </div>
  );
}
