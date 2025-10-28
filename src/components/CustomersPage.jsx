import React, { useEffect, useState } from "react";
import api from "../services/api";
import { usePermission } from "../hooks/usePermission";

/**
 * CustomersPage
 * - Lists customers (search + pagination)
 * - Add customer
 * - Edit customer inline (top form)
 * - Delete customer (MD only) — calls DELETE /customers/{id}
 *
 * This component is independent so we can wire it into App.js without
 * modifying the large existing Customers() in App.js.
 */

export default function CustomersPage() {
  const [customers, setCustomers] = useState([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [limit] = useState(10);

  // Filter states
  const [filterStartDate, setFilterStartDate] = useState("");
  const [filterEndDate, setFilterEndDate] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  const [addForm, setAddForm] = useState({ name: "", phone: "", email: "", address: "" });
  const [editId, setEditId] = useState(null);
  const [editForm, setEditForm] = useState({ name: "", phone: "", email: "", address: "" });

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [downloading, setDownloading] = useState(false);

  const role = (localStorage.getItem("role") || "user").toLowerCase();
  
  // Permission checks
  const { hasPermission: canEditCustomers } = usePermission('customers.edit.access');
  const { hasPermission: canDeleteCustomers } = usePermission('customers.delete.access');
  const { hasPermission: canExportCustomers } = usePermission('customers.export.access');

  const fetchCustomers = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api.get("/customers", { params: { search, page, limit } });
      setCustomers(res.data || []);
    } catch (e) {
      setError("Failed to fetch customers");
    } finally {
      setLoading(false);
    }
  };

  const fetchMetrics = async () => {
    try {
      const res = await api.get("/customers/metrics");
      setTotal(res?.data?.total_customers || 0);
    } catch {}
  };

  useEffect(() => {
    fetchCustomers();
    fetchMetrics();
    // eslint-disable-next-line
  }, [search, page]);

  const handleAdd = async (e) => {
    e?.preventDefault?.();
    setError(""); setMsg("");
    if (!addForm.name || !addForm.phone) { setError("Name and phone are required"); return; }
    try {
      setSaving(true);
      await api.post("/customers", addForm);
      setMsg("Customer added");
      setAddForm({ name: "", phone: "", email: "", address: "" });
      fetchCustomers(); fetchMetrics();
    } catch (err) {
      setError(err?.response?.data?.detail || "Failed to add customer");
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (c) => {
    if (!canEditCustomers) { alert("You do not have permission to edit customers"); return; }
    setEditId(c.customer_id);
    setEditForm({ name: c.name || "", phone: c.phone || "", email: c.email || "", address: c.address || "" });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const cancelEdit = () => {
    setEditId(null);
    setEditForm({ name: "", phone: "", email: "", address: "" });
    setError(""); setMsg("");
  };

  const submitEdit = async (e) => {
    e?.preventDefault?.();
    setError(""); setMsg("");
    if (!editForm.name || !editForm.phone) { setError("Name and phone are required"); return; }
    try {
      setSaving(true);
      await api.put(`/customers/${editId}`, editForm);
      setMsg("Customer updated");
      cancelEdit();
      fetchCustomers(); fetchMetrics();
    } catch (err) {
      setError(err?.response?.data?.detail || "Failed to update customer");
    } finally {
      setSaving(false);
    }
  };

  const deleteCustomer = async (id) => {
    if (!canDeleteCustomers) { alert("You do not have permission to delete customers"); return; }
    if (!window.confirm("Delete customer? This cannot be undone.")) return;
    try {
      await api.delete(`/customers/${id}`);
      alert("Customer deleted");
      fetchCustomers(); fetchMetrics();
    } catch (err) {
      alert(err?.response?.data?.detail || "Failed to delete customer");
    }
  };

  const handleDownload = async () => {
    if (!canExportCustomers) { alert("You do not have permission to export customer data"); return; }
    setDownloading(true);
    try {
      const params = { search };
      const res = await api.get("/customers/export", { params, responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'customer_list.csv');
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert(err?.response?.data?.detail || "Failed to download customer data");
    } finally {
      setDownloading(false);
    }
  };

  const clearFilters = () => {
    setFilterStartDate("");
    setFilterEndDate("");
    setSearch("");
  };

  return (
    <div className="p-6 space-y-6">
      <div className="bg-white rounded-xl shadow p-6">
        <h2 className="text-xl font-semibold mb-4">{editId ? "Edit Customer" : "Add Customer"}</h2>

        {error && <div className="bg-red-100 text-red-700 p-2 rounded mb-3">{error}</div>}
        {msg && <div className="bg-emerald-100 text-emerald-700 p-2 rounded mb-3">{msg}</div>}

        {editId ? (
          <form onSubmit={submitEdit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-slate-700">Name</label>
              <input className="mt-1 w-full border rounded p-2" value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} />
            </div>
            <div>
              <label className="text-sm text-slate-700">Phone</label>
              <input className="mt-1 w-full border rounded p-2" value={editForm.phone} onChange={e => setEditForm({ ...editForm, phone: e.target.value })} />
            </div>
            <div>
              <label className="text-sm text-slate-700">Email</label>
              <input className="mt-1 w-full border rounded p-2" value={editForm.email} onChange={e => setEditForm({ ...editForm, email: e.target.value })} />
            </div>
            <div>
              <label className="text-sm text-slate-700">Address</label>
              <input className="mt-1 w-full border rounded p-2" value={editForm.address} onChange={e => setEditForm({ ...editForm, address: e.target.value })} />
            </div>
            <div className="md:col-span-2 flex gap-3">
              <button type="button" onClick={cancelEdit} className="px-4 py-2 text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300">Cancel</button>
              <button type="submit" disabled={saving} className="bg-emerald-600 text-white px-4 py-2 rounded hover:bg-emerald-700">
                {saving ? "Saving..." : "Update Customer"}
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleAdd} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-slate-700">Name</label>
              <input className="mt-1 w-full border rounded p-2" value={addForm.name} onChange={e => setAddForm({ ...addForm, name: e.target.value })} />
            </div>
            <div>
              <label className="text-sm text-slate-700">Phone</label>
              <input className="mt-1 w-full border rounded p-2" value={addForm.phone} onChange={e => setAddForm({ ...addForm, phone: e.target.value })} />
            </div>
            <div>
              <label className="text-sm text-slate-700">Email</label>
              <input className="mt-1 w-full border rounded p-2" value={addForm.email} onChange={e => setAddForm({ ...addForm, email: e.target.value })} />
            </div>
            <div>
              <label className="text-sm text-slate-700">Address</label>
              <input className="mt-1 w-full border rounded p-2" value={addForm.address} onChange={e => setAddForm({ ...addForm, address: e.target.value })} />
            </div>
            <div className="md:col-span-2">
              <button disabled={saving} className="bg-emerald-600 text-white px-4 py-2 rounded hover:bg-emerald-700">
                {saving ? "Saving..." : "Save Customer"}
              </button>
            </div>
          </form>
        )}
      </div>

      <div className="bg-white rounded-xl shadow p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Customer List</h2>
          <div className="flex items-center gap-3">
            <div className="text-slate-600">Total: {total}</div>
            {role === "md" && (
              <button
                onClick={handleDownload}
                disabled={downloading}
                className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 disabled:opacity-50 text-sm"
              >
                {downloading ? "Downloading..." : "Download CSV"}
              </button>
            )}
          </div>
        </div>

        <div className="mb-4 space-y-3">
          <div className="flex gap-2 items-center">
            <input placeholder="Search by name or phone" className="flex-1 md:w-80 border rounded p-2"
              value={search} onChange={(e) => setSearch(e.target.value)} />
            <button 
              onClick={() => setShowFilters(!showFilters)}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
            >
              {showFilters ? "Hide Filters" : "Show Filters"}
            </button>
            {(search || filterStartDate || filterEndDate) && (
              <button 
                onClick={clearFilters}
                className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 text-sm"
              >
                Clear
              </button>
            )}
          </div>
          
          {showFilters && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-4 bg-gray-50 rounded border">
              <div>
                <label className="text-sm text-slate-700 block mb-1">Start Date</label>
                <input 
                  type="date" 
                  className="w-full border rounded p-2"
                  value={filterStartDate} 
                  onChange={(e) => setFilterStartDate(e.target.value)} 
                />
              </div>
              <div>
                <label className="text-sm text-slate-700 block mb-1">End Date</label>
                <input 
                  type="date" 
                  className="w-full border rounded p-2"
                  value={filterEndDate} 
                  onChange={(e) => setFilterEndDate(e.target.value)} 
                />
              </div>
            </div>
          )}
        </div>

        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left">
                <th>ID</th><th>Name</th><th>Phone</th><th>Email</th><th>Address</th><th>Created</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="7" className="py-4 text-center text-slate-500">Loading...</td></tr>
              ) : (customers || []).length ? (
                customers.map(c => (
                  <tr key={c.customer_id} className="border-t">
                    <td className="py-1">{c.customer_id}</td>
                    <td className="py-1">{c.name}</td>
                    <td className="py-1">{c.phone}</td>
                    <td className="py-1">{c.email}</td>
                    <td className="py-1">{c.address}</td>
                    <td className="py-1">{c.created_at}</td>
                    <td className="py-1">
                      <div className="flex items-center gap-2">
                        {role === "md" && (
                          <>
                            <button onClick={() => startEdit(c)} className="text-indigo-600 hover:underline">Edit</button>
                            <button onClick={() => deleteCustomer(c.customer_id)} className="text-red-600 hover:underline">Delete</button>
                          </>
                        )}
                        {role !== "md" && (
                          <span className="text-gray-400 text-sm">View only</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan="7" className="py-4 text-center text-slate-500">No records</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center gap-2 mt-3">
          <button className="px-3 py-1 bg-slate-200 rounded disabled:opacity-50" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}>Prev</button>
          <div>Page {page}</div>
          <button className="px-3 py-1 bg-slate-200 rounded" onClick={() => setPage(p => p + 1)}>Next</button>
        </div>
      </div>
    </div>
  );
}