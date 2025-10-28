import React, { useState, useEffect } from 'react';
import api from '../services/api';

const B2BTransfer = () => {
  const [warehouses, setWarehouses] = useState([]);
  const [fromWarehouse, setFromWarehouse] = useState('');
  const [toWarehouse, setToWarehouse] = useState('');
  const [fromItems, setFromItems] = useState([]);
  const [toItems, setToItems] = useState([]);
  const [selectedFromItem, setSelectedFromItem] = useState('');
  const [selectedToItem, setSelectedToItem] = useState('');
  const [qtyOut, setQtyOut] = useState(0);
  const [qtyIn, setQtyIn] = useState(0);
  const [issuedBy, setIssuedBy] = useState('');
  const [receivedBy, setReceivedBy] = useState('');
  const [details, setDetails] = useState('');
  const [logDate, setLogDate] = useState(new Date().toISOString().split('T')[0]);
  const [b2bInventory, setB2bInventory] = useState([]);
  const [pendingRequisitions, setPendingRequisitions] = useState([]);
  const [stockMovements, setStockMovements] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  // Auto-set quantities to match when one is changed
  useEffect(() => { if (qtyOut > 0 && qtyIn === 0) setQtyIn(qtyOut); }, [qtyOut]);

  const loadWarehouses = async () => {
    try {
      const role = localStorage.getItem('role') || 'md';
      const res = await api.get('/sales/warehouses', { params: { role } });
      const list = res.data || [];
      setWarehouses(list);
      if (list.length) setFromWarehouse(list[0]);
      if (list.length > 1) setToWarehouse(list[1]);
    } catch (e) {
      setError('Failed to load warehouses');
    }
  };

  const loadItemsForWarehouse = async (warehouse, setItems) => {
    if (!warehouse) return setItems([]);
    try {
      const res = await api.get('/sales/inventory-items', { params: { warehouse_name: warehouse } });
      const map = res.data || {};
      const arr = Object.entries(map).map(([name, v]) => ({ item_name: name, item_id: v.item_id, price: v.price }));
      setItems(arr);
    } catch (e) {
      setItems([]);
    }
  };

  useEffect(() => { loadWarehouses(); }, []);
  useEffect(() => { loadItemsForWarehouse(fromWarehouse, setFromItems); }, [fromWarehouse]);
  useEffect(() => { loadItemsForWarehouse(toWarehouse, setToItems); }, [toWarehouse]);

  const handleTransfer = async (e) => {
    e.preventDefault();
    if (!fromWarehouse || !toWarehouse || !selectedFromItem || qtyOut <= 0 || !issuedBy || !receivedBy) {
      setError('Please fill all required fields');
      return;
    }
    if (qtyIn !== qtyOut) {
      setError('IN and OUT quantities must match');
      return;
    }
    setLoading(true); setError('');
    try {
      await api.post('/b2b/transfer', {
        from_warehouse: fromWarehouse,
        to_warehouse: toWarehouse,
        item_name: selectedFromItem,
        qty_out: qtyOut,
        qty_in: qtyIn,
        issued_by: issuedBy,
        received_by: receivedBy,
        details,
        log_date: logDate
      });
      alert('Transfer successful');
      fetchB2BInventory();
      fetchStockMovements();
    } catch (err) {
      setError(err.response?.data?.detail || 'Transfer failed');
    } finally { setLoading(false); }
  };

  const fetchB2BInventory = async () => {
    try { const response = await api.get('/b2b/inventory'); setB2bInventory(response.data || []); } catch { /* ignore */ }
  };
  const fetchPendingRequisitions = async () => {
    try { const response = await api.get('/b2b/requisitions/pending'); setPendingRequisitions(response.data || []); } catch { /* ignore */ }
  };
  const fetchStockMovements = async () => {
    try { const response = await api.get('/b2b/movements'); setStockMovements(response.data || []); } catch { /* ignore */ }
  };
  const handleUpdateRequisition = async (reqId, status) => {
    try { await api.post(`/b2b/requisitions/${reqId}/update`, { status }); fetchPendingRequisitions(); } catch { /* ignore */ }
  };
  useEffect(() => { fetchB2BInventory(); fetchPendingRequisitions(); fetchStockMovements(); }, []);

  return (
    <div className="space-y-6 p-6">
      <div className="bg-white rounded shadow p-6">
        <h2 className="text-lg font-semibold mb-4">Stock Transfer</h2>
        {error && <div className="bg-red-50 text-red-700 border border-red-200 px-3 py-2 rounded mb-3">{error}</div>}
        <form onSubmit={handleTransfer} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-700 mb-1">From Warehouse</label>
              <select value={fromWarehouse} onChange={e=>setFromWarehouse(e.target.value)} className="border rounded px-3 py-2 w-full">
                {warehouses.map(w=> <option key={w} value={w}>{w}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-700 mb-1">To Warehouse</label>
              <select value={toWarehouse} onChange={e=>setToWarehouse(e.target.value)} className="border rounded px-3 py-2 w-full">
                {warehouses.map(w=> <option key={w} value={w}>{w}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-700 mb-1">From Item</label>
              <select value={selectedFromItem} onChange={e=>setSelectedFromItem(e.target.value)} className="border rounded px-3 py-2 w-full">
                <option value="">Select item</option>
                {fromItems.map(i => <option key={i.item_id} value={i.item_name}>{i.item_name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-700 mb-1">To Item (or same)</label>
              <select value={selectedToItem} onChange={e=>setSelectedToItem(e.target.value)} className="border rounded px-3 py-2 w-full">
                <option value="">Same as from</option>
                {toItems.map(i => <option key={i.item_id} value={i.item_name}>{i.item_name}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-700 mb-1">Qty Out</label>
              <input type="number" min={0} value={qtyOut} onChange={e=>setQtyOut(parseInt(e.target.value||'0'))} className="border rounded px-3 py-2 w-full" />
            </div>
            <div>
              <label className="block text-sm text-gray-700 mb-1">Qty In</label>
              <input type="number" min={0} value={qtyIn} onChange={e=>setQtyIn(parseInt(e.target.value||'0'))} className="border rounded px-3 py-2 w-full" />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-700 mb-1">Issued By</label>
              <input value={issuedBy} onChange={e=>setIssuedBy(e.target.value)} className="border rounded px-3 py-2 w-full" />
            </div>
            <div>
              <label className="block text-sm text-gray-700 mb-1">Received By</label>
              <input value={receivedBy} onChange={e=>setReceivedBy(e.target.value)} className="border rounded px-3 py-2 w-full" />
            </div>
          </div>

          <div>
            <label className="block text-sm text-gray-700 mb-1">Details</label>
            <input value={details} onChange={e=>setDetails(e.target.value)} className="border rounded px-3 py-2 w-full" />
          </div>
          <div>
            <label className="block text-sm text-gray-700 mb-1">Date</label>
            <input type="date" value={logDate} onChange={e=>setLogDate(e.target.value)} className="border rounded px-3 py-2 w-full" />
          </div>
          <button type="submit" disabled={loading} className="px-4 py-2 rounded bg-blue-600 text-white disabled:opacity-50">
            {loading ? 'Transferring...' : 'Transfer Stock'}
          </button>
        </form>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white rounded shadow p-4 overflow-auto">
          <h3 className="font-semibold mb-2">B2B Inventory</h3>
          <table className="min-w-full text-sm">
            <thead><tr className="text-left border-b">
              <th className="py-2 px-3">Warehouse</th>
              <th className="py-2 px-3">Item</th>
              <th className="py-2 px-3">Open</th>
              <th className="py-2 px-3">Supplied</th>
              <th className="py-2 px-3">Out</th>
              <th className="py-2 px-3">Date</th>
            </tr></thead>
            <tbody>
              {b2bInventory.slice(0, 10).map((log) => (
                <tr key={log.id} className="border-b">
                  <td className="py-2 px-3">{log.warehouse_name}</td>
                  <td className="py-2 px-3">{log.item_name}</td>
                  <td className="py-2 px-3">{log.open_balance}</td>
                  <td className="py-2 px-3">{log.supplied_quantity}</td>
                  <td className="py-2 px-3">{log.stock_out}</td>
                  <td className="py-2 px-3">{log.log_date}</td>
                </tr>
              ))}
              {b2bInventory.length === 0 && (
                <tr><td colSpan="6" className="py-4 text-center text-gray-500">No records</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="bg-white rounded shadow p-4 overflow-auto">
          <h3 className="font-semibold mb-2">Pending Requisitions</h3>
          <table className="min-w-full text-sm">
            <thead><tr className="text-left border-b">
              <th className="py-2 px-3">Employee</th>
              <th className="py-2 px-3">Item</th>
              <th className="py-2 px-3">Qty</th>
              <th className="py-2 px-3">Reason</th>
              <th className="py-2 px-3">Warehouse</th>
              <th className="py-2 px-3">Actions</th>
            </tr></thead>
            <tbody>
              {pendingRequisitions.map((req) => (
                <tr key={req.requisition_id} className="border-b">
                  <td className="py-2 px-3">{req.employee_name}</td>
                  <td className="py-2 px-3">{req.item}</td>
                  <td className="py-2 px-3">{req.quantity}</td>
                  <td className="py-2 px-3">{req.reason}</td>
                  <td className="py-2 px-3">{req.warehouse_name}</td>
                  <td className="py-2 px-3">
                    <div className="flex gap-2">
                      <button onClick={() => handleUpdateRequisition(req.requisition_id, 'Approved')} className="px-3 py-1 rounded bg-green-600 text-white text-xs">Approve</button>
                      <button onClick={() => handleUpdateRequisition(req.requisition_id, 'Rejected')} className="px-3 py-1 rounded bg-red-600 text-white text-xs">Reject</button>
                    </div>
                  </td>
                </tr>
              ))}
              {pendingRequisitions.length === 0 && (
                <tr><td colSpan="6" className="py-4 text-center text-gray-500">No requisitions</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="bg-white rounded shadow p-4 overflow-auto">
          <h3 className="font-semibold mb-2">Stock Movements</h3>
          <table className="min-w-full text-sm">
            <thead><tr className="text-left border-b">
              <th className="py-2 px-3">From</th>
              <th className="py-2 px-3">To</th>
              <th className="py-2 px-3">Item</th>
              <th className="py-2 px-3">Qty</th>
              <th className="py-2 px-3">Date</th>
            </tr></thead>
            <tbody>
              {stockMovements.slice(0, 10).map((m) => (
                <tr key={m.id} className="border-b">
                  <td className="py-2 px-3">{m.from_store}</td>
                  <td className="py-2 px-3">{m.to_store}</td>
                  <td className="py-2 px-3">{m.item_name}</td>
                  <td className="py-2 px-3">{m.quantity}</td>
                  <td className="py-2 px-3">{m.movement_date}</td>
                </tr>
              ))}
              {stockMovements.length === 0 && (
                <tr><td colSpan="5" className="py-4 text-center text-gray-500">No movements</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default B2BTransfer;
