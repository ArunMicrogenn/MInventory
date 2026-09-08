import React, { useState, useEffect } from "react";
import { 
  Printer, 
  X, 
  FileText, 
  CheckCircle2, 
  Building2, 
  ShieldCheck, 
  Clock, 
  RotateCw, 
  Copy,
  Calendar,
  Layers,
  Sparkles
} from "lucide-react";
import { Item, Store, Department, Supplier, User, MRHeader, GRNHeader, IssueHeader, IssueReturnHeader, AuditLog } from "../types";

export type PrintableDocType = "MR" | "GRN" | "ISSUE" | "ISSUE_RETURN";

export interface PrintableDocumentData {
  type: PrintableDocType;
  rawDoc: MRHeader | GRNHeader | IssueHeader | IssueReturnHeader | any;
}

interface PrintDocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  documentData: PrintableDocumentData | null;
  items: Item[];
  stores: Store[];
  departments: Department[];
  suppliers?: Supplier[];
  currentUser?: User;
}

export default function PrintDocumentModal({
  isOpen,
  onClose,
  documentData,
  items,
  stores,
  departments,
  suppliers = [],
  currentUser
}: PrintDocumentModalProps) {
  const [isReprint, setIsReprint] = useState<boolean>(false);
  const [showSignatures, setShowSignatures] = useState<boolean>(true);
  const [showAuditTrail, setShowAuditTrail] = useState<boolean>(true);
  const [printTimestamp, setPrintTimestamp] = useState<string>("");

  useEffect(() => {
    if (isOpen) {
      setPrintTimestamp(new Date().toLocaleString());
      // Check if doc was already printed / closed or if user requested reprint
      const docId = documentData?.rawDoc?.id || "";
      const isHistorical = localStorage.getItem(`printed_${docId}`);
      if (isHistorical) {
        setIsReprint(true);
      } else {
        setIsReprint(false);
      }
    }
  }, [isOpen, documentData]);

  if (!isOpen || !documentData || !documentData.rawDoc) return null;

  const { type, rawDoc } = documentData;

  const handlePrint = () => {
    if (rawDoc?.id) {
      try {
        localStorage.setItem(`printed_${rawDoc.id}`, "true");
      } catch (e) {
        console.error(e);
      }
    }
    window.print();
  };

  // Helper to find lookup entities
  const getItem = (itemId: string) => items.find(i => i.id === itemId);
  const getStore = (storeId: string) => stores.find(s => s.id === storeId);
  const getDept = (deptId: string) => departments.find(d => d.id === deptId);
  const getSupplier = (supplierId?: string) => suppliers.find(s => s.id === supplierId);

  // Derive Document Specific Details
  const getDocTitle = () => {
    switch (type) {
      case "MR": return "MATERIAL REQUISITION VOUCHER";
      case "GRN": return "GOODS RECEIPT NOTE (GRN)";
      case "ISSUE": return "MATERIAL ISSUE SLIP";
      case "ISSUE_RETURN": return "DEPARTMENT MATERIAL RETURN VOUCHER";
      default: return "INVENTORY TRANSACTION VOUCHER";
    }
  };

  const getDocSubtitle = () => {
    switch (type) {
      case "MR": return "Internal Sub-Store & Department Stock Requisition";
      case "GRN": return "Inward Receiving & Quality Acceptance Document";
      case "ISSUE": return "Store Inventory Consumption & Department Issuance";
      case "ISSUE_RETURN": return "Excess / Unused Material Restock Voucher";
      default: return "Official Property Management Inventory Record";
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-2 sm:p-4 overflow-y-auto print:p-0 print:bg-white print:static">
      <div 
        className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-auto flex flex-col max-h-[92vh] print:max-h-none print:shadow-none print:border-none print:rounded-none print:w-full"
        id="print-modal-container"
      >
        {/* MODAL CONTROL HEADER - HIDDEN IN PRINT */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/80 shrink-0 print:hidden">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-purple-600 text-white flex items-center justify-center shadow-xs">
              <Printer size={18} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                Print Document Voucher
                {isReprint && (
                  <span className="px-2 py-0.5 text-[10px] font-extrabold bg-amber-100 text-amber-800 rounded-full border border-amber-300">
                    REPRINT / DUPLICATE
                  </span>
                )}
              </h3>
              <p className="text-xs text-slate-400 font-medium">Standard formatted official voucher ready for print & physical sign-off</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <label className="hidden sm:flex items-center gap-1.5 text-xs text-slate-600 font-semibold cursor-pointer mr-2 select-none">
              <input 
                type="checkbox" 
                checked={isReprint} 
                onChange={(e) => setIsReprint(e.target.checked)}
                className="w-3.5 h-3.5 accent-purple-600 rounded"
              />
              <span>Mark as Duplicate / Reprint</span>
            </label>

            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-xl transition-all shadow-sm shadow-purple-600/20 active:scale-95 cursor-pointer"
              id="btn-trigger-browser-print"
            >
              <Printer size={15} />
              Print Document
            </button>

            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
              title="Close Preview"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* PRINTABLE DOCUMENT BODY */}
        <div className="flex-1 overflow-y-auto p-6 sm:p-8 space-y-6 print:p-0 print:overflow-visible print:space-y-4" id="printable-document-voucher">
          
          {/* VOUCHER HEADER */}
          <div className="border-b-2 border-slate-900 pb-4">
            <div className="flex justify-between items-start">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black tracking-widest text-purple-700 uppercase">GRAND REGENCY HOTEL & RESORTS</span>
                </div>
                <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight mt-0.5">{getDocTitle()}</h1>
                <p className="text-xs text-slate-500 font-medium">{getDocSubtitle()}</p>
                <p className="text-[11px] text-slate-400 mt-0.5">Central Inventory Control & Materials Management Department</p>
              </div>

              <div className="text-right">
                <div className="inline-block border-2 border-slate-900 px-3 py-1.5 rounded-lg bg-slate-50 text-right">
                  <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Voucher No.</div>
                  <div className="text-base font-black font-mono text-slate-900">{rawDoc.id}</div>
                </div>
                <div className="mt-2 text-right">
                  {isReprint ? (
                    <span className="inline-block px-2.5 py-0.5 bg-amber-100 text-amber-900 border border-amber-400 rounded text-[10px] font-extrabold uppercase tracking-wider">
                      ★ DUPLICATE COPY / REPRINT ★
                    </span>
                  ) : (
                    <span className="inline-block px-2.5 py-0.5 bg-slate-100 text-slate-700 border border-slate-300 rounded text-[10px] font-extrabold uppercase tracking-wider">
                      ORIGINAL COPY
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* HEADER METADATA GRID */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-3 border-t border-slate-200 text-xs">
              {/* Type = MR */}
              {type === "MR" && (
                <>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Target Store</span>
                    <span className="font-bold text-slate-800">{getStore(rawDoc.fromStoreId)?.name || "Central Store"}</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Requesting Dept</span>
                    <span className="font-bold text-slate-800">{getDept(rawDoc.requestingDeptId)?.name || "Kitchen"}</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Required By Date</span>
                    <span className="font-mono font-bold text-slate-800">{rawDoc.requiredDate}</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Document Status</span>
                    <span className="font-bold text-purple-700 uppercase">{rawDoc.status}</span>
                  </div>
                </>
              )}

              {/* Type = GRN */}
              {type === "GRN" && (
                <>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Receiving Store</span>
                    <span className="font-bold text-slate-800">{getStore(rawDoc.deliveryStoreId)?.name || "Main Inward Store"}</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Supplier / Vendor</span>
                    <span className="font-bold text-slate-800">{getSupplier(rawDoc.supplierId)?.name || "Direct Supplier"}</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Received Date</span>
                    <span className="font-mono font-bold text-slate-800">{rawDoc.receivedDate}</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">PO Reference</span>
                    <span className="font-mono font-bold text-purple-700">{rawDoc.sourcePOId || "DIRECT INWARD"}</span>
                  </div>
                </>
              )}

              {/* Type = ISSUE */}
              {type === "ISSUE" && (
                <>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Issuing Store</span>
                    <span className="font-bold text-slate-800">{getStore(rawDoc.storeId)?.name || "Main Store"}</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Receiving Dept</span>
                    <span className="font-bold text-slate-800">{getDept(rawDoc.requestingDeptId)?.name || "F&B Production"}</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Issue Date</span>
                    <span className="font-mono font-bold text-slate-800">{rawDoc.issueDate}</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Linked MR No</span>
                    <span className="font-mono font-bold text-purple-700">{rawDoc.sourceMRId || "DIRECT CONSUMPTION"}</span>
                  </div>
                </>
              )}

              {/* Type = ISSUE_RETURN */}
              {type === "ISSUE_RETURN" && (
                <>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Receiving Store</span>
                    <span className="font-bold text-slate-800">{getStore(rawDoc.storeId)?.name || "Main Store"}</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Original Issue ID</span>
                    <span className="font-mono font-bold text-purple-700">{rawDoc.issueId}</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Return Date</span>
                    <span className="font-mono font-bold text-slate-800">{rawDoc.returnDate}</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Status</span>
                    <span className="font-bold text-emerald-700 uppercase">RESTOCKED-POSTED</span>
                  </div>
                </>
              )}
            </div>

            {/* Additional Remarks / Purpose */}
            {(rawDoc.purpose || rawDoc.remarks || rawDoc.reasonCode || rawDoc.approverRemarks) && (
              <div className="mt-3 p-2 bg-slate-50 rounded border border-slate-200 text-xs flex flex-wrap gap-x-6 gap-y-1 text-slate-600">
                {rawDoc.purpose && <div><span className="font-bold text-slate-700">Purpose:</span> {rawDoc.purpose}</div>}
                {rawDoc.reasonCode && <div><span className="font-bold text-slate-700">Reason Code:</span> {rawDoc.reasonCode}</div>}
                {rawDoc.remarks && <div><span className="font-bold text-slate-700">Notes:</span> {rawDoc.remarks}</div>}
                {rawDoc.approverRemarks && <div><span className="font-bold text-purple-700">Approver Notes:</span> {rawDoc.approverRemarks}</div>}
              </div>
            )}
          </div>

          {/* LINE ITEMS TABLE */}
          <div>
            <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider mb-2">Item Details & Quantities</h4>
            <div className="border border-slate-900 rounded overflow-hidden">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-900 text-white font-bold uppercase text-[10px]">
                    <th className="p-2.5 w-10 text-center">#</th>
                    <th className="p-2.5">Item Code / SKU</th>
                    <th className="p-2.5">Item Description & Specifications</th>
                    <th className="p-2.5 text-center">UOM</th>
                    
                    {type === "MR" && (
                      <>
                        <th className="p-2.5 text-right">Req Qty</th>
                        <th className="p-2.5 text-right">Issued Qty</th>
                        <th className="p-2.5 text-right">Est Rate ($)</th>
                        <th className="p-2.5 text-right">Est Total ($)</th>
                      </>
                    )}

                    {type === "GRN" && (
                      <>
                        <th className="p-2.5 text-right">Ordered</th>
                        <th className="p-2.5 text-right">Received</th>
                        <th className="p-2.5 text-center">Batch / Lot</th>
                        <th className="p-2.5 text-right">Unit Rate ($)</th>
                        <th className="p-2.5 text-right">Tax/Disc</th>
                        <th className="p-2.5 text-right">Line Total ($)</th>
                      </>
                    )}

                    {type === "ISSUE" && (
                      <>
                        <th className="p-2.5 text-right">Qty Issued</th>
                        <th className="p-2.5 text-center">Batch Lot No</th>
                        <th className="p-2.5 text-right">Cost Rate ($)</th>
                        <th className="p-2.5 text-right">Total Valuation ($)</th>
                      </>
                    )}

                    {type === "ISSUE_RETURN" && (
                      <>
                        <th className="p-2.5 text-right">Qty Returned</th>
                        <th className="p-2.5 text-center">Reason</th>
                        <th className="p-2.5 text-center">Condition</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-slate-800 font-medium">
                  {rawDoc.lines && rawDoc.lines.map((line: any, index: number) => {
                    const itemObj = getItem(line.itemId);
                    const rate = line.rate || (itemObj?.lastPurchaseRate || itemObj?.standardRate || 0);

                    return (
                      <tr key={line.id || index} className={index % 2 === 1 ? "bg-slate-50/60" : "bg-white"}>
                        <td className="p-2.5 text-center text-slate-500 font-bold">{index + 1}</td>
                        <td className="p-2.5 font-mono font-bold text-slate-900">{itemObj?.sku || line.itemId}</td>
                        <td className="p-2.5">
                          <span className="font-bold text-slate-900 block">{itemObj?.name || "Inventory Material"}</span>
                          <span className="text-[10px] text-slate-500">{itemObj?.group || "General Stores"}</span>
                          {line.isShortClosed && (
                            <span className="inline-block text-[9px] font-black text-rose-700 bg-rose-50 border border-rose-200 px-1 rounded ml-1">
                              [SHORT CLOSED]
                            </span>
                          )}
                        </td>
                        <td className="p-2.5 text-center font-bold text-slate-600">{itemObj?.unit || "Unit"}</td>

                        {/* MR Lines */}
                        {type === "MR" && (
                          <>
                            <td className="p-2.5 text-right font-black text-slate-900">{line.quantity}</td>
                            <td className="p-2.5 text-right font-bold text-purple-700">{line.issuedQty || 0}</td>
                            <td className="p-2.5 text-right font-mono">${rate.toFixed(2)}</td>
                            <td className="p-2.5 text-right font-mono font-bold">${(line.quantity * rate).toFixed(2)}</td>
                          </>
                        )}

                        {/* GRN Lines */}
                        {type === "GRN" && (
                          <>
                            <td className="p-2.5 text-right text-slate-500">{line.orderedQty ?? "--"}</td>
                            <td className="p-2.5 text-right font-black text-slate-900">{line.receivedQty}</td>
                            <td className="p-2.5 text-center font-mono text-[11px] font-bold text-slate-700">{line.batchLotNumber || "--"}</td>
                            <td className="p-2.5 text-right font-mono">${(line.rate || 0).toFixed(2)}</td>
                            <td className="p-2.5 text-right text-[11px] text-slate-500">+{line.taxPct || 0}% / -{line.discountPct || 0}%</td>
                            <td className="p-2.5 text-right font-mono font-bold">
                              ${((line.receivedQty || 0) * (line.rate || 0) * (1 + (line.taxPct || 0)/100 - (line.discountPct || 0)/100)).toFixed(2)}
                            </td>
                          </>
                        )}

                        {/* Issue Lines */}
                        {type === "ISSUE" && (
                          <>
                            <td className="p-2.5 text-right font-black text-rose-700">-{line.qtyIssued}</td>
                            <td className="p-2.5 text-center font-mono text-[11px] font-bold text-slate-700">{line.batchLotNumber || "--"}</td>
                            <td className="p-2.5 text-right font-mono">${rate.toFixed(2)}</td>
                            <td className="p-2.5 text-right font-mono font-bold">${(line.qtyIssued * rate).toFixed(2)}</td>
                          </>
                        )}

                        {/* Issue Return Lines */}
                        {type === "ISSUE_RETURN" && (
                          <>
                            <td className="p-2.5 text-right font-black text-emerald-700">+{line.returnQty}</td>
                            <td className="p-2.5 text-center text-[11px] text-slate-600">{line.reasonCode || "Excess returned"}</td>
                            <td className="p-2.5 text-center">
                              {line.isSpoiledOrExpired ? (
                                <span className="text-[9px] font-bold text-rose-700 bg-rose-50 px-1 py-0.5 rounded border border-rose-200">
                                  SPOILED / QUARANTINE
                                </span>
                              ) : (
                                <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 px-1 py-0.5 rounded border border-emerald-200">
                                  GOOD CONDITION
                                </span>
                              )}
                            </td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* VOUCHER FINANCIAL SUMMARY */}
            <div className="flex justify-between items-start mt-3 text-xs">
              <div className="text-slate-500 text-[11px] space-y-0.5 max-w-sm">
                <p>• Goods received/issued are subject to physical verification and store audit terms.</p>
                <p>• Any discrepancy must be registered in the system within 24 hours of posting.</p>
              </div>

              <div className="w-64 border border-slate-900 rounded p-2.5 bg-slate-50 space-y-1 text-xs">
                {type === "MR" && (
                  <div className="flex justify-between font-black text-slate-900 text-sm pt-1">
                    <span>Est Total Valuation:</span>
                    <span className="font-mono font-bold">${(rawDoc.estimatedValue || 0).toFixed(2)}</span>
                  </div>
                )}

                {type === "GRN" && (
                  <>
                    <div className="flex justify-between text-slate-600">
                      <span>Subtotal:</span>
                      <span className="font-mono">${(rawDoc.subTotal || 0).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span>Total Taxes:</span>
                      <span className="font-mono">+${(rawDoc.taxTotal || 0).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span>Discounts:</span>
                      <span className="font-mono">-${(rawDoc.discountTotal || 0).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between font-black text-slate-900 text-sm pt-1 border-t border-slate-300">
                      <span>Grand Total:</span>
                      <span className="font-mono text-purple-700 font-extrabold">${(rawDoc.grandTotal || 0).toFixed(2)}</span>
                    </div>
                  </>
                )}

                {type === "ISSUE" && (
                  <div className="flex justify-between font-black text-slate-900 text-sm pt-1">
                    <span>Total Cost Charged:</span>
                    <span className="font-mono font-bold text-slate-900">
                      $
                      {rawDoc.lines.reduce((sum: number, l: any) => {
                        const itemObj = getItem(l.itemId);
                        const rate = itemObj ? (itemObj.lastPurchaseRate || itemObj.standardRate || 0) : 0;
                        return sum + (l.qtyIssued * rate);
                      }, 0).toFixed(2)}
                    </span>
                  </div>
                )}

                {type === "ISSUE_RETURN" && (
                  <div className="flex justify-between font-black text-slate-900 text-xs">
                    <span>Total Line Items:</span>
                    <span className="font-mono">{rawDoc.lines?.length || 0}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* AUDIT TIMELINE SNAPSHOT - OPTIONAL */}
          {showAuditTrail && rawDoc.auditTrail && rawDoc.auditTrail.length > 0 && (
            <div className="pt-2 border-t border-slate-200">
              <h5 className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1.5">System Audit Trail Sign-offs</h5>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[10px] text-slate-600">
                {rawDoc.auditTrail.map((log: AuditLog, idx: number) => (
                  <div key={log.id || idx} className="p-1.5 bg-slate-50 rounded border border-slate-200">
                    <div className="font-bold text-slate-800">{log.action}</div>
                    <div className="text-slate-500">{log.userName}</div>
                    <div className="font-mono text-[9px] text-slate-400">{new Date(log.timestamp).toLocaleString()}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* FORMAL SIGNATURE BOXES */}
          {showSignatures && (
            <div className="pt-6 border-t-2 border-slate-900">
              <div className="grid grid-cols-4 gap-4 text-center text-xs">
                <div className="border-t border-slate-900 pt-2">
                  <span className="font-bold text-slate-900 block">PREPARED BY</span>
                  <span className="text-[10px] text-slate-500 font-medium">{currentUser?.name || "Store Assistant"}</span>
                  <span className="text-[9px] text-slate-400 block">Sign & Date</span>
                </div>

                <div className="border-t border-slate-900 pt-2">
                  <span className="font-bold text-slate-900 block">STORE IN-CHARGE</span>
                  <span className="text-[10px] text-slate-500 font-medium">David Miller</span>
                  <span className="text-[9px] text-slate-400 block">Inventory Verified</span>
                </div>

                <div className="border-t border-slate-900 pt-2">
                  <span className="font-bold text-slate-900 block">RECEIVED / ISSUED BY</span>
                  <span className="text-[10px] text-slate-500 font-medium">Department Rep</span>
                  <span className="text-[9px] text-slate-400 block">Physical Goods Handover</span>
                </div>

                <div className="border-t border-slate-900 pt-2">
                  <span className="font-bold text-slate-900 block">AUTHORIZED APPROVER</span>
                  <span className="text-[10px] text-slate-500 font-medium">Financial Controller</span>
                  <span className="text-[9px] text-slate-400 block">Executive Approval</span>
                </div>
              </div>
            </div>
          )}

          {/* PRINT FOOTER */}
          <div className="pt-3 border-t border-slate-200 flex justify-between items-center text-[10px] text-slate-400 font-mono">
            <div>
              <span>System: InvenTrack Hotel ERP</span>
              <span className="mx-2">•</span>
              <span>Doc Ref: {rawDoc.id}</span>
            </div>
            <div>
              <span>Printed: {printTimestamp || new Date().toLocaleString()}</span>
              {currentUser && (
                <>
                  <span className="mx-1">•</span>
                  <span>User: {currentUser.name}</span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
