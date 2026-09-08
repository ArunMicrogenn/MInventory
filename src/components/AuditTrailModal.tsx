import React from "react";
import { AuditLog } from "../types";
import { X, Clock, User, MessageSquare, HelpCircle, Activity } from "lucide-react";

interface AuditTrailModalProps {
  isOpen: boolean;
  onClose: () => void;
  transactionId: string;
  transactionType: string;
  auditTrail: AuditLog[];
}

export default function AuditTrailModal({
  isOpen,
  onClose,
  transactionId,
  transactionType,
  auditTrail,
}: AuditTrailModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/65 backdrop-blur-xs">
      <div className="bg-white w-full max-w-2xl rounded-xl border border-slate-100 shadow-xl overflow-hidden flex flex-col max-h-[85vh]">
        
        {/* Header */}
        <div className="bg-slate-50 border-b border-slate-200/60 p-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-purple-50 text-purple-600 rounded-lg">
              <Clock size={18} />
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-slate-800 uppercase tracking-wider">
                Transaction Lifecycle Timeline
              </h3>
              <p className="text-[11px] text-slate-400 font-medium">
                Comprehensive audit trail for <span className="font-bold text-slate-600">{transactionType}</span> • <span className="font-mono font-bold text-purple-600">{transactionId}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-slate-200/60 rounded-full text-slate-400 hover:text-slate-600 transition-colors focus:outline-none"
            aria-label="Close modal"
          >
            <X size={16} />
          </button>
        </div>

        {/* Audit Content / Vertical Timeline */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {auditTrail && auditTrail.length > 0 ? (
            <div className="relative border-l-2 border-purple-100 pl-6 ml-3 space-y-6">
              {auditTrail.map((log, index) => {
                // Determine action badge styling
                let actionColor = "bg-slate-100 text-slate-700";
                const actLower = log.action.toLowerCase();
                
                if (actLower.includes("approve") || actLower.includes("post") || actLower.includes("confirm")) {
                  actionColor = "bg-emerald-50 text-emerald-700 border border-emerald-100";
                } else if (actLower.includes("reject") || actLower.includes("cancel") || actLower.includes("reverse")) {
                  actionColor = "bg-rose-50 text-rose-700 border border-rose-100";
                } else if (actLower.includes("create") || actLower.includes("raise") || actLower.includes("draft")) {
                  actionColor = "bg-blue-50 text-blue-700 border border-blue-100";
                } else if (actLower.includes("amend") || actLower.includes("correction") || actLower.includes("modify")) {
                  actionColor = "bg-amber-50 text-amber-700 border border-amber-100";
                }

                // Format friendly time
                let friendlyTime = log.timestamp;
                try {
                  const date = new Date(log.timestamp);
                  if (!isNaN(date.getTime())) {
                    friendlyTime = date.toLocaleString(undefined, {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit"
                    });
                  }
                } catch (_) {}

                return (
                  <div key={log.id || index} className="relative group">
                    {/* Glowing Timeline Indicator Node */}
                    <div className="absolute -left-[31px] top-1 w-4 h-4 bg-white border-2 border-purple-500 rounded-full group-hover:bg-purple-500 group-hover:scale-110 transition-all flex items-center justify-center">
                      <div className="w-1.5 h-1.5 bg-purple-500 group-hover:bg-white rounded-full" />
                    </div>

                    <div className="bg-slate-50 hover:bg-slate-100/60 transition-all rounded-lg p-4 border border-slate-200/50 space-y-2">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 text-[9px] font-extrabold uppercase rounded-sm tracking-wider ${actionColor}`}>
                            {log.action}
                          </span>
                          <div className="flex items-center gap-1 text-[11px] font-bold text-slate-700">
                            <User size={12} className="text-slate-400" />
                            <span>{log.userName}</span>
                          </div>
                        </div>
                        <span className="text-[10px] font-mono text-slate-400 font-semibold sm:text-right">
                          {friendlyTime}
                        </span>
                      </div>

                      {/* Change / Operation Details */}
                      {log.details && (
                        <div className="flex items-start gap-1.5 bg-white p-2.5 rounded border border-slate-200/40 text-[11px] font-medium text-slate-600">
                          <Activity size={12} className="text-slate-400 mt-0.5 shrink-0" />
                          <span className="leading-relaxed whitespace-pre-line">{log.details}</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 space-y-3">
              <div className="p-3 bg-slate-100 text-slate-400 rounded-full">
                <HelpCircle size={28} />
              </div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">No Historic Logs Available</p>
              <p className="text-[11px] text-slate-400 text-center max-w-xs">
                This transaction was initialized without a structural audit record. New approvals will record history.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-slate-50 border-t border-slate-200/60 px-6 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-semibold">
            <MessageSquare size={12} />
            <span>Encrypted Ledger Security Active</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 text-white hover:bg-slate-700 rounded-lg text-xs font-bold transition-colors cursor-pointer"
          >
            Close Timeline
          </button>
        </div>

      </div>
    </div>
  );
}
