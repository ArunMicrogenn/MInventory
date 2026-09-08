import React from "react";
import { Printer } from "lucide-react";

interface PrintButtonProps {
  onClick: (e?: React.MouseEvent) => void;
  label?: string;
  variant?: "primary" | "secondary" | "icon" | "table-action";
  size?: "sm" | "md" | "xs";
  title?: string;
  isReprint?: boolean;
  className?: string;
  id?: string;
}

export default function PrintButton({
  onClick,
  label = "Print Voucher",
  variant = "secondary",
  size = "sm",
  title = "Print / Reprint Official Document Voucher",
  isReprint = false,
  className = "",
  id
}: PrintButtonProps) {
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onClick(e);
  };

  if (variant === "table-action" || variant === "icon") {
    return (
      <button
        id={id}
        onClick={handleClick}
        title={title}
        className={`p-1.5 rounded-lg text-slate-500 hover:text-purple-700 hover:bg-purple-50 border border-transparent hover:border-purple-200 transition-all cursor-pointer ${className}`}
      >
        <Printer size={size === "xs" ? 13 : 15} />
      </button>
    );
  }

  if (variant === "primary") {
    return (
      <button
        id={id}
        onClick={handleClick}
        title={title}
        className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-lg transition-all shadow-xs active:scale-95 cursor-pointer ${className}`}
      >
        <Printer size={14} />
        <span>{label}</span>
      </button>
    );
  }

  return (
    <button
      id={id}
      onClick={handleClick}
      title={title}
      className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold text-purple-700 bg-purple-50 hover:bg-purple-600 hover:text-white border border-purple-200 hover:border-purple-600 rounded-lg transition-all active:scale-95 cursor-pointer ${className}`}
    >
      <Printer size={13} />
      <span>{isReprint ? "Reprint Voucher" : label}</span>
    </button>
  );
}
