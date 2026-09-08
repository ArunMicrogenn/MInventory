import React, { useState } from "react";
import { Item, Store, Department, Supplier, User } from "../types";
import { Plus, Users, LayoutGrid, Building2, UserCheck, Package, ShoppingCart } from "lucide-react";

interface MasterDataModuleProps {
  items: Item[];
  setItems: (items: Item[]) => void;
  stores: Store[];
  setStores: (stores: Store[]) => void;
  departments: Department[];
  suppliers: Supplier[];
  users: User[];
}

export default function MasterDataModule({
  items,
  setItems,
  stores,
  setStores,
  departments,
  suppliers,
  users
}: MasterDataModuleProps) {
  const [activeTab, setActiveTab] = useState<"items" | "stores" | "departments" | "suppliers" | "users">("items");
  
  // Forms states
  const [showItemForm, setShowItemForm] = useState(false);
  const [itemName, setItemName] = useState("");
  const [itemSku, setItemSku] = useState("");
  const [itemGroup, setItemGroup] = useState<"Perishables" | "Groceries" | "Housekeeping" | "Capex">("Groceries");
  const [itemRate, setItemRate] = useState(0);
  const [itemUnit, setItemUnit] = useState("KG");
  const [itemQc, setItemQc] = useState(false);

  const [showStoreForm, setShowStoreForm] = useState(false);
  const [storeName, setStoreName] = useState("");
  const [storeCode, setStoreCode] = useState("");

  const handleAddItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemName || !itemSku) return;
    const newItem: Item = {
      id: `I-0${items.length + 1}`,
      name: itemName,
      sku: itemSku,
      group: itemGroup,
      standardRate: itemRate,
      lastPurchaseRate: itemRate,
      unit: itemUnit,
      qcRequired: itemQc,
      isActive: true
    };
    setItems([...items, newItem]);
    setItemName("");
    setItemSku("");
    setItemRate(0);
    setShowItemForm(false);
  };

  const handleAddStore = (e: React.FormEvent) => {
    e.preventDefault();
    if (!storeName || !storeCode) return;
    const newStore: Store = {
      id: `S-0${stores.length + 1}`,
      name: storeName,
      code: storeCode.toUpperCase()
    };
    setStores([...stores, newStore]);
    setStoreName("");
    setStoreCode("");
    setShowStoreForm(false);
  };

  return (
    <div className="bg-white rounded-xl border border-slate-100 shadow-xs p-6" id="master-data-container">
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 border-b border-slate-100" id="master-data-header">
        <div>
          <h2 className="text-lg font-bold text-slate-800">Global Master Catalogs</h2>
          <p className="text-xs text-slate-400 mt-0.5">Unified records powering validation checks across procurement pipelines.</p>
        </div>

        {/* Tab Selection Row */}
        <div className="flex flex-wrap gap-1 mt-4 md:mt-0 bg-slate-50 p-1 rounded-lg border border-slate-200/60" id="master-tab-selectors">
          <button
            onClick={() => setActiveTab("items")}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-md transition-colors ${
              activeTab === "items" ? "bg-white text-purple-600 shadow-xs" : "text-slate-500 hover:text-slate-800"
            }`}
          >
            <Package size={14} />
            Items
          </button>
          <button
            onClick={() => setActiveTab("stores")}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-md transition-colors ${
              activeTab === "stores" ? "bg-white text-purple-600 shadow-xs" : "text-slate-500 hover:text-slate-800"
            }`}
          >
            <LayoutGrid size={14} />
            Stores
          </button>
          <button
            onClick={() => setActiveTab("departments")}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-md transition-colors ${
              activeTab === "departments" ? "bg-white text-purple-600 shadow-xs" : "text-slate-500 hover:text-slate-800"
            }`}
          >
            <Building2 size={14} />
            Departments
          </button>
          <button
            onClick={() => setActiveTab("suppliers")}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-md transition-colors ${
              activeTab === "suppliers" ? "bg-white text-purple-600 shadow-xs" : "text-slate-500 hover:text-slate-800"
            }`}
          >
            <ShoppingCart size={14} />
            Suppliers
          </button>
          <button
            onClick={() => setActiveTab("users")}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-md transition-colors ${
              activeTab === "users" ? "bg-white text-purple-600 shadow-xs" : "text-slate-500 hover:text-slate-800"
            }`}
          >
            <Users size={14} />
            Users & Roles
          </button>
        </div>
      </div>

      <div className="mt-6" id="master-tab-contents">
        {/* Items Master */}
        {activeTab === "items" && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-bold text-slate-700">Item Master Directory</h3>
              <button
                onClick={() => setShowItemForm(!showItemForm)}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors shadow-xs"
                id="btn-add-item"
              >
                <Plus size={14} />
                Register Item
              </button>
            </div>

            {showItemForm && (
              <form onSubmit={handleAddItem} className="p-4 bg-slate-50 border border-slate-200 rounded-lg grid grid-cols-1 md:grid-cols-3 gap-3 animate-in slide-in-from-top-4 duration-200">
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-500">Item Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Romaine Lettuce"
                    value={itemName}
                    onChange={(e) => setItemName(e.target.value)}
                    className="w-full p-2 text-xs border border-slate-200 rounded-lg bg-white"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-500">SKU Code</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. SKU-LET-01"
                    value={itemSku}
                    onChange={(e) => setItemSku(e.target.value)}
                    className="w-full p-2 text-xs border border-slate-200 rounded-lg bg-white"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-500">Inventory Group</label>
                  <select
                    value={itemGroup}
                    onChange={(e) => setItemGroup(e.target.value as any)}
                    className="w-full p-2 text-xs border border-slate-200 rounded-lg bg-white font-medium"
                  >
                    <option value="Perishables">Perishables (Requires QC)</option>
                    <option value="Groceries">Groceries</option>
                    <option value="Housekeeping">Housekeeping</option>
                    <option value="Capex">Capex</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-500">Standard Cost Rate ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={itemRate}
                    onChange={(e) => setItemRate(parseFloat(e.target.value) || 0)}
                    className="w-full p-2 text-xs border border-slate-200 rounded-lg bg-white"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-500">Unit of Measure (UOM)</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. KG, BAG, LITER, PCS"
                    value={itemUnit}
                    onChange={(e) => setItemUnit(e.target.value)}
                    className="w-full p-2 text-xs border border-slate-200 rounded-lg bg-white"
                  />
                </div>
                <div className="flex items-center gap-2 pt-5">
                  <input
                    type="checkbox"
                    id="qcRequiredCheckbox"
                    checked={itemQc}
                    onChange={(e) => setItemQc(e.target.checked)}
                    className="w-4 h-4 text-purple-600 border-slate-300 rounded focus:ring-blue-500 cursor-pointer"
                  />
                  <label htmlFor="qcRequiredCheckbox" className="text-xs font-bold text-slate-700 cursor-pointer">Mandate Quality Control (QC)</label>
                </div>
                <div className="md:col-span-3 flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowItemForm(false)}
                    className="px-3 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-200 rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 text-xs font-bold text-white bg-purple-600 rounded-lg hover:bg-purple-700"
                  >
                    Save Registration
                  </button>
                </div>
              </form>
            )}

            <div className="overflow-x-auto border border-slate-100 rounded-xl">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-slate-400 font-bold uppercase border-b border-slate-100">
                    <th className="p-3">UID</th>
                    <th className="p-3">Item Descriptor</th>
                    <th className="p-3">SKU</th>
                    <th className="p-3">Category Group</th>
                    <th className="p-3">Std Rate ($)</th>
                    <th className="p-3">Last Rate ($)</th>
                    <th className="p-3">UOM</th>
                    <th className="p-3">QC Status</th>
                    <th className="p-3 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-600 font-medium">
                  {items.map(item => (
                    <tr key={item.id} className="hover:bg-slate-50/50">
                      <td className="p-3 font-mono font-bold text-slate-800">{item.id}</td>
                      <td className="p-3 font-bold text-slate-700">{item.name}</td>
                      <td className="p-3 font-mono">{item.sku}</td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 text-[10px] rounded font-semibold ${
                          item.group === "Perishables" ? "bg-rose-50 text-rose-700" :
                          item.group === "Groceries" ? "bg-emerald-50 text-emerald-700" :
                          item.group === "Housekeeping" ? "bg-purple-50 text-purple-700" :
                          "bg-amber-50 text-amber-700"
                        }`}>
                          {item.group}
                        </span>
                      </td>
                      <td className="p-3">${item.standardRate.toFixed(2)}</td>
                      <td className="p-3">${item.lastPurchaseRate.toFixed(2)}</td>
                      <td className="p-3">{item.unit}</td>
                      <td className="p-3">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] ${item.qcRequired ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-400'}`}>
                          {item.qcRequired ? 'Mandatory QC' : 'Direct Post'}
                        </span>
                      </td>
                      <td className="p-3 text-right">
                        <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-100 text-emerald-800 font-bold">Active</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Stores Master */}
        {activeTab === "stores" && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-bold text-slate-700">Locations & Main/Sub Stores</h3>
              <button
                onClick={() => setShowStoreForm(!showStoreForm)}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors shadow-xs"
                id="btn-add-store"
              >
                <Plus size={14} />
                Register Store Location
              </button>
            </div>

            {showStoreForm && (
              <form onSubmit={handleAddStore} className="p-4 bg-slate-50 border border-slate-200 rounded-lg flex flex-col md:flex-row gap-3 items-end animate-in slide-in-from-top-4 duration-200">
                <div className="flex-1 space-y-1">
                  <label className="text-[11px] font-bold text-slate-500">Store Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Pastry Kitchen Store"
                    value={storeName}
                    onChange={(e) => setStoreName(e.target.value)}
                    className="w-full p-2 text-xs border border-slate-200 rounded-lg bg-white"
                  />
                </div>
                <div className="flex-1 space-y-1">
                  <label className="text-[11px] font-bold text-slate-500">Store Code</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. FB-PASTRY"
                    value={storeCode}
                    onChange={(e) => setStoreCode(e.target.value)}
                    className="w-full p-2 text-xs border border-slate-200 rounded-lg bg-white"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowStoreForm(false)}
                    className="px-3 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-200 rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 text-xs font-bold text-white bg-purple-600 rounded-lg hover:bg-purple-700"
                  >
                    Register Store
                  </button>
                </div>
              </form>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {stores.map(store => (
                <div key={store.id} className="p-4 border border-slate-100 rounded-xl bg-slate-50/50 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 font-mono tracking-wider uppercase">{store.code}</span>
                    <h4 className="text-sm font-bold text-slate-800 mt-0.5">{store.name}</h4>
                    <p className="text-[11px] text-slate-400 mt-1">Status Scope: Active Ledger</p>
                  </div>
                  <div className="p-2 bg-purple-50 text-purple-600 rounded-lg font-mono font-bold text-xs">{store.id}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Departments Master */}
        {activeTab === "departments" && (
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-slate-700">Authorized Charging Cost Centers</h3>
            <div className="overflow-x-auto border border-slate-100 rounded-xl">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-slate-400 font-bold uppercase border-b border-slate-100">
                    <th className="p-3">Cost Center Code</th>
                    <th className="p-3">Department Name</th>
                    <th className="p-3">Reference Index</th>
                    <th className="p-3 text-right">Ledger Routing Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-600 font-medium">
                  {departments.map(dept => (
                    <tr key={dept.id}>
                      <td className="p-3 font-mono font-bold text-purple-600 bg-slate-50/30">{dept.costCenter}</td>
                      <td className="p-3 font-bold text-slate-700">{dept.name}</td>
                      <td className="p-3 font-mono text-slate-400">{dept.id}</td>
                      <td className="p-3 text-right text-emerald-600 font-semibold">Active Pipeline</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Suppliers Master */}
        {activeTab === "suppliers" && (
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-slate-700">Registered Vendor Procurement Registry</h3>
            <div className="overflow-x-auto border border-slate-100 rounded-xl">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-slate-400 font-bold uppercase border-b border-slate-100">
                    <th className="p-3">Supplier Code</th>
                    <th className="p-3">Supplier Name</th>
                    <th className="p-3">Default Contract Payment Terms</th>
                    <th className="p-3">Reference ID</th>
                    <th className="p-3 text-right">Vendor Standard</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-600 font-medium">
                  {suppliers.map(sup => (
                    <tr key={sup.id}>
                      <td className="p-3 font-mono font-bold text-slate-700">{sup.code}</td>
                      <td className="p-3 font-bold text-slate-800">{sup.name}</td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 text-[11px] font-semibold bg-purple-50 text-purple-700 rounded-sm">
                          {sup.paymentTerms}
                        </span>
                      </td>
                      <td className="p-3 font-mono text-slate-400">{sup.id}</td>
                      <td className="p-3 text-right text-emerald-600 font-semibold">Pre-Qualified</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Users & Roles Master */}
        {activeTab === "users" && (
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-slate-700">Authority Matrix Profiles</h3>
            <p className="text-[11px] text-slate-400">These profiles regulate approval routings, requisition raises, and posting overrides based on active security definitions.</p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {users.map(u => (
                <div key={u.id} className="p-4 border border-slate-100 rounded-xl bg-slate-50/50 flex items-start gap-3">
                  <div className="p-2.5 bg-purple-50 text-purple-600 rounded-full">
                    <UserCheck size={18} />
                  </div>
                  <div className="space-y-1.5 flex-1">
                    <div className="flex justify-between items-start">
                      <h4 className="text-xs font-extrabold text-slate-800">{u.name}</h4>
                      <span className="font-mono text-[10px] text-slate-400">{u.id}</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      <span className="px-1.5 py-0.2 text-[10px] font-bold bg-slate-200 text-slate-700 rounded">{u.role}</span>
                      <span className="px-1.5 py-0.2 text-[10px] font-semibold bg-slate-100 text-slate-600 rounded">{u.department}</span>
                    </div>
                    <div className="pt-2 border-t border-slate-200/50">
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wide block">Assigned Permissions</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {u.permissions.map(p => (
                          <span key={p} className="text-[9px] px-1 py-0.1 bg-purple-50 text-purple-600 rounded border border-purple-100 font-semibold">{p}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
