import { useState } from "react";
import { MRHeader, GRNHeader, IssueHeader, Department } from "../types";
import { FileDown, Search } from "lucide-react";
import { ReportingService } from "../utils/reporting";

interface ReportsModuleProps {
  mrs: MRHeader[];
  grns: GRNHeader[];
  issues: IssueHeader[];
  departments: Department[];
}

export default function ReportsModule({ mrs, grns, issues, departments }: ReportsModuleProps) {
  const [reportType, setReportType] = useState<"mr" | "grn" | "issue">("mr");
  const [filterDept, setFilterDept] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");

  const data = reportType === "mr" ? mrs : reportType === "grn" ? grns : issues;

  const filteredData = data.filter((item: any) => {
    // Assuming relevant fields exist: requestingDeptId, status, date (or requiredDate/createdAt)
    // Note: GRN and Issue might have different field names. 
    // Based on standard inventory app patterns:
    const deptId = item.requestingDeptId || item.deliveryStoreId || "all"; 
    const matchesDept = filterDept === "all" || deptId === filterDept;
    const matchesStatus = filterStatus === "all" || item.status === filterStatus;
    const itemDate = (item.requiredDate || item.date || item.createdAt || "").split('T')[0];
    const matchesStartDate = !startDate || itemDate >= startDate;
    const matchesEndDate = !endDate || itemDate <= endDate;
    return matchesDept && matchesStatus && matchesStartDate && matchesEndDate;
  });

  const exportCSV = () => {
    ReportingService.exportToCSV(reportType, filteredData, departments);
  };

  return (
    <div className="bg-white p-6 rounded-xl border border-slate-100 shadow-xs space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100">
        <div>
          <h2 className="text-base font-bold text-slate-800">Operational Reports</h2>
          <p className="text-xs text-slate-400 mt-0.5">Filter, view, and export historical material request data.</p>
        </div>
        <button
          onClick={exportCSV}
          className="flex items-center gap-2 px-4 py-2 text-xs font-bold bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-all cursor-pointer"
        >
          <FileDown size={14} /> Export {reportType.toUpperCase()} CSV
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 p-4 bg-slate-50 rounded-xl border border-slate-100">
        <div>
          <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Report Type</label>
          <select value={reportType} onChange={(e) => setReportType(e.target.value as any)} className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs font-medium">
            <option value="mr">Material Request (MR)</option>
            <option value="grn">Material Receipts (GRN)</option>
            <option value="issue">Material Issues</option>
          </select>
        </div>
        <div>
          <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Department/Store</label>
          <select value={filterDept} onChange={(e) => setFilterDept(e.target.value)} className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs font-medium">
            <option value="all">All</option>
            {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Status</label>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs font-medium">
            <option value="all">All Statuses</option>
            <option value="Submitted">Submitted</option>
            <option value="Pending Approval">Pending Approval</option>
            <option value="Approved">Approved</option>
            <option value="Posted">Posted</option>
          </select>
        </div>
        <div>
          <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Start Date</label>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs font-medium" />
        </div>
        <div>
          <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">End Date</label>
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs font-medium" />
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 border-b">
            <tr className="text-slate-400 font-bold uppercase">
              <th className="p-3">ID</th>
              <th className="p-3">Date</th>
              <th className="p-3">Department/Store</th>
              <th className="p-3">Status</th>
              <th className="p-3">Total Lines</th>
            </tr>
          </thead>
          <tbody className="divide-y text-slate-600">
            {filteredData.map((item: any) => (
              <tr key={item.id} className="hover:bg-slate-50">
                <td className="p-3 font-bold text-slate-800">{item.id}</td>
                <td className="p-3">{item.requiredDate || item.date || item.createdAt}</td>
                <td className="p-3">{departments.find(d => d.id === (item.requestingDeptId || item.deliveryStoreId || item.departmentId))?.name || "N/A"}</td>
                <td className="p-3">{item.status}</td>
                <td className="p-3">{item.lines.length}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
