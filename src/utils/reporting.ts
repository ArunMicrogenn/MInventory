import { MRHeader, GRNHeader, IssueHeader, Department } from "../types";

export const ReportingService = {
  exportToCSV: (
    reportType: "mr" | "grn" | "issue",
    data: any[],
    departments: Department[]
  ) => {
    const headers = reportType === "mr" ? ["ID", "Date", "Department", "Status", "Total Items"] : 
                    reportType === "grn" ? ["ID", "Date", "Store", "Status", "Total Items"] :
                    ["ID", "Date", "Department", "Status", "Total Items"];
    const rows = data.map((item: any) => {
      if (reportType === "mr") return [item.id, item.requiredDate, departments.find(d => d.id === item.requestingDeptId)?.name || "", item.status, item.lines.length];
      if (reportType === "grn") return [item.id, item.date, item.deliveryStoreId, item.status, item.lines.length];
      return [item.id, item.date, item.departmentId, item.status, item.lines.length];
    });
    
    const csvContent = "data:text/csv;charset=utf-8," 
      + [headers.join(","), ...rows.map(e => e.map(val => `"${String(val).replace(/"/g, '""')}"`).join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `${reportType}_report_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
};
