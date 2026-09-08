import React, { useState } from "react";
import { 
  Printer, 
  Search, 
  Filter, 
  FileText, 
  CheckCircle2, 
  Building2, 
  Calendar, 
  ArrowRightLeft, 
  Layers, 
  ShoppingBag,
  Eye,
  RotateCw,
  SlidersHorizontal,
  X
} from "lucide-react";
import { Item, Store, Department, Supplier, User, MRHeader, GRNHeader, IssueHeader, IssueReturnHeader } from "../types";
import PrintDocumentModal, { PrintableDocumentData } from "./PrintDocumentModal";

interface ReprintCenterModuleProps {
  mrs: MRHeader[];
  grns: GRNHeader[];
  issues: IssueHeader[];
  issueReturns: IssueReturnHeader[];
  items: Item[];
  stores: Store[];
  departments: Department[];
  suppliers: Supplier[];
  currentUser: User;
}

export default function ReprintCenterModule({
  mrs,
  grns,
  issues,
  issueReturns,
  items,
  stores,
  departments,
  suppliers,
  currentUser
}: ReprintCenterModuleProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [activeSubTab, setActiveSubTab] = useState<"all" | "MR" | "GRN" | "ISSUE" | "ISSUE_RETURN">("all");
  const [storeFilter, setStoreFilter] = useState<string>("ALL");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [selectedPrintDoc, setSelectedPrintDoc] = useState<PrintableDocumentData | null>(null);

  // Normalize all documents into a unified list for the reprint center
  const allDocs = [
    ...mrs.map(m => ({
      id: m.id,
      type: "MR" as const,
      typeName: "Material Request (MR)",
      date: m.requiredDate || "2026-03-01",
      storeId: m.fromStoreId,
      departmentId: m.requestingDeptId,
      status: m.status,
      total: m.estimatedValue,
      raw: m
    })),
    ...grns.map(g => ({
      id: g.id,
      type: "GRN" as const,
      typeName: "Goods Receipt Note (GRN)",
      date: g.receivedDate || "2026-03-01",
      storeId: g.deliveryStoreId,
      departmentId: undefined,
      supplierId: g.supplierId,
      status: "STOCK-POSTED",
      total: g.grandTotal,
      raw: g
    })),
    ...issues.map(i => ({
      id: i.id,
      type: "ISSUE" as const,
      typeName: "Material Issue Slip",
      date: i.issueDate || "2026-03-01",
      storeId: i.storeId,
      departmentId: i.requestingDeptId,
      status: "CONSUMED-POSTED",
      total: i.lines.reduce((acc, l) => {
        const itemObj = items.find(it => it.id === l.itemId);
        return acc + (l.qtyIssued * (itemObj?.standardRate || 1));
      }, 0),
      raw: i
    })),
    ...issueReturns.map(r => ({
      id: r.id,
      type: "ISSUE_RETURN" as const,
      typeName: "Department Issue Return",
      date: r.returnDate || "2026-03-01",
      storeId: r.storeId,
      status: "RESTOCKED-POSTED",
      total: r.lines.length,
      raw: r
    }))
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // Filter list by sub-tab, search, store, and date range
  const filteredDocs = allDocs.filter(doc => {
    const matchesSearch = 
      doc.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      doc.typeName.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesSubTab = activeSubTab === "all" || doc.type === activeSubTab;
    const matchesStore = storeFilter === "ALL" || doc.storeId === storeFilter;

    // Date range filtering
    let matchesDateRange = true;
    if (startDate && doc.date < startDate) {
      matchesDateRange = false;
    }
    if (endDate && doc.date > endDate) {
      matchesDateRange = false;
    }

    return matchesSearch && matchesSubTab && matchesStore && matchesDateRange;
  });

  const getStoreName = (storeId?: string) => stores.find(s => s.id === storeId)?.name || "Central Store";
  const getDeptName = (deptId?: string) => departments.find(d => d.id === deptId)?.name || "General Department";
  const getSupplierName = (supId?: string) => suppliers.find(s => s.id === supId)?.name || "Direct Supplier";

  const clearFilters = () => {
    setSearchTerm("");
    setActiveSubTab("all");
    setStoreFilter("ALL");
    setStartDate("");
    setEndDate("");
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-50 overflow-y-auto p-6 space-y-6" id="reprint-center-module">
      {/* HEADER BANNER */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-purple-600 text-white flex items-center justify-center shadow-md">
            <Printer size={24} />
          </div>
          <div>
            <h1 className="text-lg font-black text-slate-900 tracking-tight">Voucher Reprint & Archive Center</h1>
            <p className="text-xs text-slate-500 font-medium mt-0.5">Filter, search, view, and print historical MR, GRN, Issue, and Return vouchers</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-600 bg-slate-100 px-3.5 py-2 rounded-xl">
            <RotateCw size={14} className="text-purple-600 animate-spin-slow" />
            <span>Matching Vouchers: <strong className="text-purple-700">{filteredDocs.length}</strong> / {allDocs.length}</span>
          </div>
        </div>
      </div>

      {/* SUB-MENU TYPE SELECTOR TABS */}
      <div className="flex flex-wrap items-center gap-2 bg-white p-2 rounded-xl border border-slate-200 shadow-xs">
        <button
          onClick={() => setActiveSubTab("all")}
          className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${
            activeSubTab === "all" ? "bg-purple-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          All Vouchers ({allDocs.length})
        </button>
        <button
          onClick={() => setActiveSubTab("MR")}
          className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${
            activeSubTab === "MR" ? "bg-purple-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          Material Requests (MR) ({mrs.length})
        </button>
        <button
          onClick={() => setActiveSubTab("GRN")}
          className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${
            activeSubTab === "GRN" ? "bg-purple-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          Goods Receipt Notes (GRN) ({grns.length})
        </button>
        <button
          onClick={() => setActiveSubTab("ISSUE")}
          className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${
            activeSubTab === "ISSUE" ? "bg-purple-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          Material Issue Slips ({issues.length})
        </button>
        <button
          onClick={() => setActiveSubTab("ISSUE_RETURN")}
          className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${
            activeSubTab === "ISSUE_RETURN" ? "bg-purple-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          Issue Returns ({issueReturns.length})
        </button>
      </div>

      {/* ADVANCED SEARCH, DATE RANGE, & STORE FILTERS TOOLBAR */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3">
        <div className="flex flex-col lg:flex-row gap-3 items-center justify-between">
          <div className="relative w-full lg:w-72">
            <Search size={15} className="absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search by Voucher ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-lg bg-slate-50/50 font-medium text-slate-800 placeholder-slate-400 focus:bg-white transition-all"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto">
            {/* Store Filter */}
            <select
              value={storeFilter}
              onChange={(e) => setStoreFilter(e.target.value)}
              className="px-3 py-2 text-xs font-semibold border border-slate-200 rounded-lg bg-white text-slate-700"
            >
              <option value="ALL">All Store Locations</option>
              {stores.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>

            {/* Date Range Filters */}
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg">
              <Calendar size={14} className="text-slate-400" />
              <span className="text-[10px] font-bold text-slate-500">From:</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="text-xs font-semibold bg-transparent text-slate-700 focus:outline-none"
              />
              <span className="text-[10px] font-bold text-slate-500 ml-1">To:</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="text-xs font-semibold bg-transparent text-slate-700 focus:outline-none"
              />
            </div>

            {(searchTerm || activeSubTab !== "all" || storeFilter !== "ALL" || startDate || endDate) && (
              <button
                onClick={clearFilters}
                className="inline-flex items-center gap-1 px-3 py-2 text-xs font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 rounded-lg transition-all"
                title="Reset all filters"
              >
                <X size={14} />
                Reset Filters
              </button>
            )}
          </div>
        </div>
      </div>

      {/* VOUCHERS CATALOG TABLE */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-400 font-bold uppercase border-b border-slate-200 tracking-wider text-[10px]">
                <th className="p-3.5">Document ID</th>
                <th className="p-3.5">Voucher Type</th>
                <th className="p-3.5">Store Location</th>
                <th className="p-3.5">Target Dept / Supplier</th>
                <th className="p-3.5">Transaction Date</th>
                <th className="p-3.5">Status / Valuation</th>
                <th className="p-3.5 text-right">Action / Reprint</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {filteredDocs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-16 text-center text-slate-400">
                    <FileText size={36} className="mx-auto text-slate-300 mb-2" />
                    <p className="font-bold text-slate-700 text-sm">No historical vouchers match your criteria</p>
                    <p className="text-xs text-slate-400 mt-1">Try expanding your date range or clearing filters.</p>
                  </td>
                </tr>
              ) : (
                filteredDocs.map((doc) => (
                  <tr key={doc.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="p-3.5 font-mono font-bold text-purple-700">{doc.id}</td>
                    <td className="p-3.5">
                      <span className={`inline-block px-2.5 py-1 rounded text-[10px] font-extrabold ${
                        doc.type === "MR" ? "bg-purple-50 text-purple-700 border border-purple-200" :
                        doc.type === "GRN" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" :
                        doc.type === "ISSUE" ? "bg-blue-50 text-blue-700 border border-blue-200" :
                        "bg-amber-50 text-amber-700 border border-amber-200"
                      }`}>
                        {doc.typeName}
                      </span>
                    </td>
                    <td className="p-3.5 font-semibold text-slate-800">{getStoreName(doc.storeId)}</td>
                    <td className="p-3.5 text-slate-600">
                      {doc.type === "MR" && getDeptName(doc.departmentId)}
                      {doc.type === "GRN" && getSupplierName(doc.supplierId)}
                      {doc.type === "ISSUE" && getDeptName(doc.departmentId)}
                      {doc.type === "ISSUE_RETURN" && "Department Restock"}
                    </td>
                    <td className="p-3.5 font-mono text-slate-600">{doc.date}</td>
                    <td className="p-3.5">
                      <div className="font-bold text-slate-900">${doc.total.toFixed(2)}</div>
                      <span className="text-[10px] text-slate-400 uppercase font-mono">{doc.status}</span>
                    </td>
                    <td className="p-3.5 text-right">
                      <button
                        onClick={() => setSelectedPrintDoc({ type: doc.type, rawDoc: doc.raw })}
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-lg shadow-xs transition-all cursor-pointer active:scale-95"
                      >
                        <Printer size={13} />
                        View & Reprint
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* PRINT / REPRINT VOUCHER MODAL */}
      <PrintDocumentModal
        isOpen={!!selectedPrintDoc}
        onClose={() => setSelectedPrintDoc(null)}
        documentData={selectedPrintDoc}
        items={items}
        stores={stores}
        departments={departments}
        suppliers={suppliers}
        currentUser={currentUser}
      />
    </div>
  );
}
