import React, { useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import { usePermission } from '../hooks/usePermission';
const REACT_APP_API_URL = process.env.REACT_APP_API_URL;
import { toast } from 'react-toastify';
import { Download } from 'lucide-react';

const formatDate = (d) => {
  if (!d) return '';
  if (typeof d === 'string') return d;
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const TabButton = ({ active, onClick, children }) => (
  <button onClick={onClick} className={`px-4 py-2 rounded-md text-sm font-medium ${active ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>{children}</button>
);

const Inventory = () => {
  const [tab, setTab] = useState('Home');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  // Permission checks
  const { hasPermission: canEditInventory } = usePermission('inventory.edit_button.access');
  const { hasPermission: canDeleteInventory } = usePermission('inventory.delete_button.access');

  // Home state
  const today = useMemo(() => new Date(), []);
  const [selectedDate, setSelectedDate] = useState(formatDate(today));
  const role = (localStorage.getItem('role') || 'user').toLowerCase();
  const [lowStock, setLowStock] = useState([]);
  const [dailyLogs, setDailyLogs] = useState([]);
  const [itemsMap, setItemsMap] = useState({});

  // Return item state
  const [accessCode, setAccessCode] = useState('');
  const [returnItemId, setReturnItemId] = useState('');
  const [returnQty, setReturnQty] = useState(1);
  const [actionMsg, setActionMsg] = useState('');

  // Filter state
  const [filterStart, setFilterStart] = useState(formatDate(today));
  const [filterEnd, setFilterEnd] = useState(formatDate(today));
  const [filterItem, setFilterItem] = useState('');
  const [filterKeyword, setFilterKeyword] = useState('');
  const [filterRows, setFilterRows] = useState([]);

  // Reports state
  const [period, setPeriod] = useState('Monthly');
  const [reportStart, setReportStart] = useState(formatDate(today));
  const [reportEnd, setReportEnd] = useState(formatDate(today));
  const [reportRows, setReportRows] = useState([]);
  const [reportSearch, setReportSearch] = useState('');

  // Pagination state
  const [dailyPage, setDailyPage] = useState(1);
  const [filterPage, setFilterPage] = useState(1);
  const [lowPage, setLowPage] = useState(1);

  // Delete state
  const [deleteItemId, setDeleteItemId] = useState('');
  const [deleteMsg, setDeleteMsg] = useState('');

  // Manual adjustment state
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [adjustItemId, setAdjustItemId] = useState('');
  const [adjustWarehouse, setAdjustWarehouse] = useState('');
  const [adjustAction, setAdjustAction] = useState('supply');
  const [adjustQty, setAdjustQty] = useState('');
  const [adjustNotes, setAdjustNotes] = useState('');
  const [adjustDate, setAdjustDate] = useState('');
  const [warehouses, setWarehouses] = useState([]);
  const [itemHistory, setItemHistory] = useState([]);
  const [availableDates, setAvailableDates] = useState([]);
  const [currentRecord, setCurrentRecord] = useState(null);
  const [adjustMsg, setAdjustMsg] = useState('');
  const [filteredItemsMap, setFilteredItemsMap] = useState({});
  // Date range filters for edit inventory
  const [adjustStartDate, setAdjustStartDate] = useState('');
  const [adjustEndDate, setAdjustEndDate] = useState('');
// Pagination for history table in modal
  const [historyPage, setHistoryPage] = useState(1);
  const historyPageSize = 5;
  // Download inventory state
  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const [downloadWarehouse, setDownloadWarehouse] = useState('');


  const refreshHomeData = React.useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [lowRes, itemsRes, logsRes, warehouseRes] = await Promise.all([
        api.get('/inventory/low-stock'),
        api.get('/inventory/items-map'),
        api.get('/inventory/daily-logs', { params: { selected_date: selectedDate } }),
        api.get('/warehouses'),
      ]);
      setLowStock(lowRes.data || []);
      setItemsMap(itemsRes.data || {});
      setDailyLogs(logsRes.data || []);
      setWarehouses(warehouseRes.data || []);
    } catch (e) {
      setError('Failed to load inventory data');
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  const fetchItemsByWarehouse = async (warehouse) => {
    try {
      const res = await api.get('/inventory/items-map', {
        params: warehouse ? { warehouse_name: warehouse } : {},
      });
      setFilteredItemsMap(res.data || {});
    } catch (e) {
      setFilteredItemsMap({});
    }
  };

  useEffect(() => { if (tab === 'Home') refreshHomeData(); }, [tab, selectedDate]);

  // Auto-refresh inventory data while on Home tab (no manual update needed)
  useEffect(() => {
    if (tab !== 'Home') return;
    const id = setInterval(() => { refreshHomeData(); }, 8000);
    return () => clearInterval(id);
  }, [tab, selectedDate]);
  
 



  const handleReturnItem = async () => {
    setActionMsg(''); setError(''); setLoading(true);
    try {
      if (!returnItemId) throw new Error('Select an item');
      const res = await api.post('/inventory/return-item', {
        item_id: Number(returnItemId),
        return_quantity: Number(returnQty) || 1,
        selected_date: selectedDate,
        access_code: accessCode,
      });
      setActionMsg(`Return recorded (qty: ${res.data?.return_quantity})`);
      await refreshHomeData();
    } catch (e) {
      setError(e?.response?.data?.detail || 'Failed to return item');
    } finally { setLoading(false); }
  };

  const [filterLastCount, setFilterLastCount] = useState(0);

  const handleApplyFilter = async (pageArg = 1) => {
    setLoading(true); setError('');
    try {
      const res = await api.get('/inventory/filter', {
        params: {
          start_date: filterStart, end_date: filterEnd,
          item_name: filterItem || undefined,
          keyword: filterKeyword || undefined,
          page: pageArg,
        },
      });
      setFilterRows(res.data || []);
      setFilterPage(pageArg);
      setFilterLastCount((res.data || []).length);
    } catch (e) {
      setError('Failed to filter');
    } finally { setLoading(false); }
  };

  const pageSize = 20;
  const visibleDailyLogs = useMemo(() => {
    const start = (dailyPage - 1) * pageSize;
    return dailyLogs.slice(start, start + pageSize);
  }, [dailyLogs, dailyPage]);

  const lowPageSize = 5;
  const visibleLowStock = useMemo(() => {
    const start = (lowPage - 1) * lowPageSize;
    return lowStock.slice(start, start + lowPageSize);
  }, [lowStock, lowPage]);

  const filteredReportRows = useMemo(() => {
    if (!reportSearch) return reportRows;
    const s = reportSearch.toLowerCase();
    return (reportRows || []).filter(r =>
      String(r.item_name || '').toLowerCase().includes(s) ||
      String(r.period || '').toLowerCase().includes(s)
    );
  }, [reportRows, reportSearch]);

  useEffect(() => { setDailyPage(1); }, [selectedDate]);
  useEffect(() => { setLowPage(1); }, [lowStock]);

  const exportCsv = (filename, rows, columns) => {
    const escape = (v) => {
      if (v === null || v === undefined) return '';
      const s = String(v).replace(/"/g, '""');
      return /[",\n]/.test(s) ? `"${s}"` : s;
    };
    const header = columns.map(c => escape(c.header)).join(',');
    const body = rows.map(r => columns.map(c => escape(typeof c.value === 'function' ? c.value(r) : r[c.key])).join(',')).join('\n');
    const csv = header + '\n' + body;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadDaily = () => {
    const cols = [
      { header: 'Date', value: (r) => r.log_date || selectedDate },
      { header: 'Item', key: 'item_name' },
      { header: 'Open', key: 'open_balance' },
      { header: 'In', key: 'supplied_quantity' },
      { header: 'Returned', key: 'return_quantity' },
      { header: 'Out', key: 'stock_out' },
      { header: 'Closing', key: 'closing_balance' },
    ];
    exportCsv(`inventory_daily_${selectedDate}.csv`, dailyLogs, cols);
  };

  const handleDownloadReport = () => {
    const cols = [
      { header: 'Period', key: 'period' },
      { header: 'Item', key: 'item_name' },
      { header: 'Open', key: 'total_open_stock' },
      { header: 'In', key: 'total_stock_in' },
      { header: 'Returned', key: 'total_returned' },
      { header: 'Out', key: 'total_stock_out' },
      { header: 'Closing', key: 'total_closing_stock' },
    ];
    exportCsv(`inventory_report_${reportStart}_to_${reportEnd}.csv`, filteredReportRows, cols);
  };

  const handleGenerateReport = async () => {
    setLoading(true); setError('');
    try {
      const res = await api.get('/inventory/reports/summary', { params: { period, start_date: reportStart, end_date: reportEnd } });
      setReportRows(res.data || []);
    } catch (e) {
      setError('Failed to generate report');
    } finally { setLoading(false); }
  };

  const handleDeleteItem = async () => {
    setDeleteMsg(''); setError(''); setLoading(true);
    try {
      if (!deleteItemId) throw new Error('Select an item');
      const res = await api.delete(`/inventory/item/${deleteItemId}`);
      setDeleteMsg(res.data?.msg || 'Item deleted');
      await refreshHomeData();
    } catch (e) {
      setError(e?.response?.data?.detail || 'Failed to delete item');
    } finally { setLoading(false); }
  };

   const fetchItemHistory = React.useCallback(async (itemId, startDate = null, endDate = null) => {
    if (!itemId) {
      setItemHistory([]);
      setAvailableDates([]);
      setAdjustDate('');
      setCurrentRecord(null);
      setHistoryPage(1);
      return;
    }
     console.log('='.repeat(80));
    console.log('FETCH ITEM HISTORY DEBUG');
    console.log('Item ID:', itemId);
    console.log('Start Date (param):', startDate);
    console.log('End Date (param):', endDate);
    console.log('='.repeat(80));
    
    
    
    try {
      // Default to wide date range if not provided
      let start = startDate || formatDate(new Date(new Date().setFullYear(new Date().getFullYear() - 20)));
      let end = endDate || formatDate(today);
      
      console.log('Computed date range:', start, 'to', end);
      console.log('Today:', formatDate(today));
      
      // Fetch ALL pages like the Filter tab does - this is critical!
      let allData = [];
      let page = 1;
      let hasMore = true;
      
      while (hasMore) {
        console.log('Fetching page', page);
        const res = await api.get('/inventory/filter', {
          params: {
            start_date: start,
            end_date: end,
            page: page,
          },
        });
        
        const pageData = res.data || [];
        console.log(`Page ${page} returned ${pageData.length} records`);
        
        if (pageData.length === 0) {
          hasMore = false;
        } else {
          allData = allData.concat(pageData);
          // Backend returns 20 items per page
          if (pageData.length < 20) {
            hasMore = false;
          } else {
            page++;
          }
        }
      }
      
      console.log('Total records fetched from all pages:', allData.length);
      console.log('Sample of all data (first 3):', allData.slice(0, 3));
      // Filter by item_id on frontend
      const filtered = allData.filter(r => r.item_id === Number(itemId));
      console.log('Records matching item_id', itemId, ':', filtered.length);
      console.log('Filtered records:', filtered);
      
      // Sort by date descending (most recent first)
      filtered.sort((a, b) => {
        const dateA = new Date(a.log_date || '');
        const dateB = new Date(b.log_date || '');
        return dateB - dateA;
      });
      
      setItemHistory(filtered);
      
      // Extract available dates from history
      const dates = filtered.map(r => r.log_date).filter(d => d);
      setAvailableDates(dates);
      console.log('Available dates:', dates);
      
      // Set the most recent date as default
      if (dates.length > 0) {
        const mostRecentDate = dates[0];
        const record = filtered.find(r => r.log_date === mostRecentDate);
        console.log('Setting most recent date:', mostRecentDate);
        console.log('Found record for date:', record);
        
        setAdjustDate(mostRecentDate);
        setCurrentRecord(record);
        
        if (record) {
          // Pre-fill quantity based on current action
          if (adjustAction === 'supply') {
            setAdjustQty(record.supplied_quantity || 0);
          } else if (adjustAction === 'stockout') {
            setAdjustQty(record.stock_out || 0);
          } else if (adjustAction === 'return') {
            setAdjustQty(record.return_quantity || 0);
          }
          console.log('Pre-filled quantity:', record.supplied_quantity || 0);
        }
      } else {
        console.log('No history found for this item in date range');
        setAdjustDate('');
        setCurrentRecord(null);
        setAdjustQty('');
      }
    } catch (e) {
      console.error('Error fetching item history:', e);
      setItemHistory([]);
      setAvailableDates([]);
      setAdjustDate('');
      setCurrentRecord(null);
    }
   }, [today, adjustStartDate, adjustEndDate]);
   
 // Re-fetch item history when date range changes
  useEffect(() => {
    if (adjustItemId && showAdjustModal) {
      fetchItemHistory(adjustItemId, adjustStartDate || null, adjustEndDate || null);
    }
  }, [adjustStartDate, adjustEndDate, adjustItemId, showAdjustModal, fetchItemHistory]);

  const handleManualAdjustment = async () => {
    setAdjustMsg(''); 
    setError(''); 
    setLoading(true);
    
    console.log('=== Starting manual adjustment ===');
    console.log('Selected item ID:', adjustItemId);
    console.log('Selected action:', adjustAction);
    console.log('Quantity:', adjustQty);
    console.log('Date:', adjustDate);
    
    try {
      if (!adjustItemId) {
        const errorMsg = 'Please select an item';
        console.error('No item selected');
        setError(errorMsg);
        toast.error(errorMsg);
        setLoading(false);
        return;
      }
      
      if (!adjustDate) {
        const errorMsg = 'Item has no history. Please select an item with existing records.';
        console.error('No date selected');
        setError(errorMsg);
        toast.error(errorMsg);
        setLoading(false);
        return;
      }
      
      // Allow 0 as a valid value - only reject if truly empty/invalid
      if (adjustQty === '' || adjustQty === null || adjustQty === undefined) {
        console.error('Invalid quantity:', adjustQty);
        setError('Please enter a quantity (0 or greater)');
        toast.error('Please enter a quantity (0 or greater)');
        setLoading(false);
        return;
      }
      
      const qtyNum = Number(adjustQty);
      // Check if it's a valid number and >= 0 (allow 0)
      if (isNaN(qtyNum) || qtyNum < 0) {
        console.error('Invalid quantity:', adjustQty);
        setError('Please enter a valid quantity (0 or greater)');
        toast.error('Please enter a valid quantity (0 or greater)');
        setLoading(false);
        return;
      }
      
      
      const payload = {
        log_date: adjustDate,
        notes: adjustNotes || undefined,
      };

      if (adjustAction === 'supply') {
        payload.supplied_quantity = Number(adjustQty);
      } else if (adjustAction === 'stockout') {
        payload.stock_out = Number(adjustQty);
      } else if (adjustAction === 'return') {
        payload.return_quantity = Number(adjustQty);
      }

      console.log('Sending PATCH request to:', `/inventory/update/${adjustItemId}`);
      console.log('Full URL:', `${REACT_APP_API_URL}/inventory/update/${adjustItemId}`);
      console.log('Payload:', JSON.stringify(payload, null, 2));
      console.log('Request headers:', api.defaults.headers);
      
      const res = await api.patch(`/inventory/update/${adjustItemId}`, payload);
      
      console.log('SUCCESS! Response:', res.data);
      console.log('Response status:', res.status);
      
      const successMessage = `Inventory updated successfully! ${adjustAction === 'supply' ? 'Supplied Quantity' : adjustAction === 'stockout' ? 'Stock Out' : 'Return Quantity'} changed to ${adjustQty} for ${adjustDate}`;
      setAdjustMsg(successMessage);
      toast.success(successMessage);
      setLoading(false);
      
      // Wait a moment to show the success message in modal
      setTimeout(async () => {
        console.log('Closing modal and refreshing data...');
        setShowAdjustModal(false);
        
        // Keep success message on main page
        setActionMsg(successMessage);
        
        // Update main page to show the adjusted date
        setSelectedDate(adjustDate);
        
        // Fetch the updated data for the adjusted date
        try {
          console.log('Fetching updated inventory data for date:', adjustDate);
          const [lowRes, itemsRes, logsRes] = await Promise.all([
            api.get('/inventory/low-stock'),
            api.get('/inventory/items-map'),
            api.get('/inventory/daily-logs', { params: { selected_date: adjustDate } }),
          ]);
          console.log('Daily logs after update:', logsRes.data);
          setLowStock(lowRes.data || []);
          setItemsMap(itemsRes.data || {});
          setDailyLogs(logsRes.data || []);
        } catch (e) {
          console.error('Failed to refresh data:', e);
        }
        
        // Clear form
        setAdjustItemId('');
        setAdjustWarehouse('');
        setAdjustAction('supply');
        setAdjustQty('');
        setAdjustNotes('');
        setAdjustDate('');
        setItemHistory([]);
        setAvailableDates([]);
        setCurrentRecord(null);
        setFilteredItemsMap({});
        setAdjustMsg('');
        
        // Clear main page success message after 5 seconds
        setTimeout(() => {
          setActionMsg('');
        }, 5000);
        
        console.log('=== Adjustment complete ===');
      }, 2000);
    } catch (e) {
      console.error('=== ADJUSTMENT FAILED ===');
      console.error('Error object:', e);
      console.error('Error message:', e?.message);
      console.error('Response:', e?.response);
      console.error('Response data:', e?.response?.data);
      console.error('Response status:', e?.response?.status);
      console.error('Request:', e?.request);
      console.error('Config:', e?.config);
      
      let errorMessage = 'Failed to adjust inventory';
      
      
      if (e?.response) {
        // Server responded with error
        errorMessage = e.response.data?.detail || `Server error: ${e.response.status}`;
      } else if (e?.request) {
        // Request made but no response
        errorMessage = 'Network error: Cannot reach server. Is the backend running on ${REACT_APP_API_URL}?';
      } else {
        // Something else happened
        errorMessage = e?.message || 'Unknown error occurred';
      }
      
      setError(errorMessage);
      toast.error(errorMessage);
      // Also show error on main page
      setTimeout(() => {
        setShowAdjustModal(false);
        setError('');
      }, 4000);
      setLoading(false);
    }
  };
  const handleDownloadInventory = async () => {
    if (!downloadWarehouse) {
      toast.error('Please select a warehouse');
      return;
    }
    
    try {
      setLoading(true);
      const response = await api.get('/inventory/items-map', {
        params: { warehouse_name: downloadWarehouse }
      });
      
      const items = response.data || {};
      
      if (Object.keys(items).length === 0) {
        toast.error('No inventory items found for this warehouse');
        return;
      }
      
      // Create CSV content
      const csvRows = [
        ['Item Name', 'Item ID', 'Price', 'Warehouse'].join(',')
      ];
      
      Object.entries(items).forEach(([itemName, itemData]) => {
        const row = [
          `"${itemName.replace(/"/g, '""')}"`,
          itemData.item_id || '',
          itemData.price || 0,
          `"${downloadWarehouse.replace(/"/g, '""')}"`
        ].join(',');
        csvRows.push(row);
      });
      
      const csvContent = csvRows.join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `inventory_${downloadWarehouse}_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      toast.success(`Downloaded ${Object.keys(items).length} items from ${downloadWarehouse}`);
      setShowDownloadModal(false);
      setDownloadWarehouse('');
    } catch (error) {
      console.error('Download error:', error);
      toast.error('Failed to download inventory');
    } finally {
      setLoading(false);
    }
  };


  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Inventory</h1>
        <div className="flex gap-2">
          {['Home','Filter','Reports','Delete'].map(t => (
            <TabButton key={t} active={tab===t} onClick={() => setTab(t)}>{t}</TabButton>
          ))}
        </div>
      </div>

      {error && <div className="bg-red-50 text-red-700 border border-red-200 px-3 py-2 rounded">{error}</div>}
      {actionMsg && <div className="bg-green-50 text-green-700 border border-green-200 px-3 py-2 rounded">{actionMsg}</div>}

      {tab === 'Home' && (
        <div className="space-y-6">
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="block text-sm text-gray-600">Selected date</label>
              <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="border rounded px-3 py-2" min={role==='employee' ? formatDate(today) : undefined} max={role==='employee' ? formatDate(today) : undefined} />
            </div>
            <button onClick={refreshHomeData} className="px-4 py-2 rounded bg-gray-100 hover:bg-gray-200">Refresh</button>
            {canEditInventory && (
              <button onClick={() => setShowAdjustModal(true)} className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700">Edit Inventory</button>
            )}
          </div>
          {adjustMsg && <div className="bg-green-50 text-green-700 border border-green-200 px-3 py-2 rounded">{adjustMsg}</div>}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white rounded shadow p-4 border-2 border-red-500">
              <div className="flex items-center gap-2 mb-2">
                <h3 className="font-semibold">Low Stock</h3>
                {lowStock.length > 0 && (
                  <span className="bg-red-600 text-white text-xs font-bold px-2 py-1 rounded-full animate-pulse">
                    {lowStock.length}
                  </span>
                )}
              </div>
              <ul className="space-y-1 max-h-64 overflow-auto">
                {lowStock.length === 0 && <li className="text-gray-500">All items sufficiently stocked.</li>}
                {visibleLowStock.map((it, i) => (
                  <li key={i} className="flex justify-between items-center border-b py-2 bg-red-50 px-2 rounded mb-1">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 bg-red-600 rounded-full animate-pulse"></span>
                      <span className="font-medium">{it.item_name}</span>
                    </div>
                    <span className="text-sm font-semibold text-red-700">{it.closing_balance} / RL {it.reorder_level}</span>
                  </li>
                ))}
              </ul>
              <div className="flex items-center justify-between mt-2">
                <div className="text-sm text-gray-600">Page {lowPage} of {Math.max(1, Math.ceil((lowStock?.length || 0) / lowPageSize))}</div>
                <div className="flex gap-2">
                  <button className="px-3 py-1 rounded bg-gray-100 hover:bg-gray-200 disabled:opacity-50" onClick={() => setLowPage(p => Math.max(1, p - 1))} disabled={lowPage <= 1}>Prev</button>
                  <button className="px-3 py-1 rounded bg-gray-100 hover:bg-gray-200 disabled:opacity-50" onClick={() => setLowPage(p => p + 1)} disabled={lowPage >= Math.ceil((lowStock?.length || 0) / lowPageSize)}>Next</button>
                </div>
              </div>
            </div>
            <div className="bg-white rounded shadow p-4">
              <h3 className="font-semibold mb-2">Return item</h3>
              <div className="space-y-2">
                <input type="password" placeholder="Access code" value={accessCode} onChange={e=>setAccessCode(e.target.value)} className="w-full border rounded px-3 py-2" />
                <select value={returnItemId} onChange={e=>setReturnItemId(e.target.value)} className="w-full border rounded px-3 py-2">
                  <option value="">Select item</option>
                  {Object.entries(itemsMap).map(([name, obj]) => (
                    <option key={obj.item_id} value={obj.item_id}>{name}</option>
                  ))}
                </select>
                <input type="number" min={1} value={returnQty} onChange={e=>setReturnQty(e.target.value)} className="w-full border rounded px-3 py-2" />
                <button onClick={handleReturnItem} className="px-4 py-2 rounded bg-emerald-600 text-white disabled:opacity-50" disabled={loading}>Submit</button>
              </div>
            </div>
          </div>

          <div className="bg-white rounded shadow p-4 overflow-auto">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold">Daily logs · {selectedDate}</h3>
              <button onClick={handleDownloadDaily} className="px-3 py-1 rounded bg-gray-100 hover:bg-gray-200">Download CSV</button>
            </div>
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left border-b">
                  <th className="py-2 px-3">Item</th>
                  <th className="py-2 px-3">Open</th>
                  <th className="py-2 px-3">In</th>
                  <th className="py-2 px-3">Returned</th>
                  <th className="py-2 px-3">Out</th>
                  <th className="py-2 px-3">Closing</th>
                </tr>
              </thead>
              <tbody>
                {visibleDailyLogs.map((r, i) => (
                  <tr key={i} className="border-b hover:bg-gray-50">
                    <td className="py-2 px-3">{r.item_name}</td>
                    <td className="py-2 px-3">{r.open_balance ?? 0}</td>
                    <td className="py-2 px-3 text-green-600 font-medium">{r.supplied_quantity ?? 0}</td>
                    <td className="py-2 px-3">{r.return_quantity ?? 0}</td>
                    <td className="py-2 px-3 text-red-600 font-medium">{r.stock_out ?? 0}</td>
                    <td className="py-2 px-3">{r.closing_balance ?? 0}</td>
                  </tr>
                ))}
                {dailyLogs.length === 0 && (
                  <tr><td colSpan="6" className="text-center py-3 text-gray-500">No logs</td></tr>
                )}
              </tbody>
            </table>
            <div className="flex items-center justify-between mt-3">
              <div className="text-sm text-gray-600">Page {dailyPage} of {Math.max(1, Math.ceil(dailyLogs.length / pageSize))}</div>
              <div className="flex gap-2">
                <button className="px-3 py-1 rounded bg-gray-100 hover:bg-gray-200 disabled:opacity-50" onClick={() => setDailyPage(p => Math.max(1, p - 1))} disabled={dailyPage <= 1}>Prev</button>
                <button className="px-3 py-1 rounded bg-gray-100 hover:bg-gray-200 disabled:opacity-50" onClick={() => setDailyPage(p => p + 1)} disabled={dailyPage >= Math.ceil(dailyLogs.length / pageSize)}>Next</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'Filter' && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="block text-sm text-gray-600">Start date</label>
              <input type="date" value={filterStart} onChange={e=>setFilterStart(e.target.value)} className="border rounded px-3 py-2" />
            </div>
            <div>
              <label className="block text-sm text-gray-600">End date</label>
              <input type="date" value={filterEnd} onChange={e=>setFilterEnd(e.target.value)} className="border rounded px-3 py-2" />
            </div>
            <div>
              <label className="block text-sm text-gray-600">Item (type to search)</label>
              <input
                list="item-names-list"
                value={filterItem}
                onChange={e=>setFilterItem(e.target.value)}
                className="border rounded px-3 py-2 min-w-[200px]"
                placeholder="Type or select item..."
              />
              <datalist id="item-names-list">
                <option value="">All</option>
                {[...new Set(Object.keys(itemsMap))].sort().map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </datalist>
            </div>
            <div>
              <label className="block text-sm text-gray-600">Keyword</label>
              <input value={filterKeyword} onChange={e=>setFilterKeyword(e.target.value)} className="border rounded px-3 py-2" placeholder="e.g. makeup" />
            </div>
            <button onClick={() => handleApplyFilter(1)} className="px-4 py-2 rounded bg-blue-600 text-white disabled:opacity-50" disabled={loading}>Apply</button>
          </div>

          <div className="bg-white rounded shadow p-4 overflow-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left border-b">
                  <th className="py-2 px-3">Date</th>
                  <th className="py-2 px-3">Item</th>
                  <th className="py-2 px-3">Open</th>
                  <th className="py-2 px-3">In</th>
                  <th className="py-2 px-3">Returned</th>
                  <th className="py-2 px-3">Out</th>
                  <th className="py-2 px-3">Closing</th>
                </tr>
              </thead>
              <tbody>
                {filterRows.map((r,i)=> (
                  <tr key={i} className="border-b hover:bg-gray-50">
                    <td className="py-2 px-3">{r.log_date}</td>
                    <td className="py-2 px-3">{r.item_name}</td>
                    <td className="py-2 px-3">{r.open_balance ?? 0}</td>
                    <td className="py-2 px-3 text-green-600 font-medium">{r.supplied_quantity ?? 0}</td>
                    <td className="py-2 px-3">{r.return_quantity ?? 0}</td>
                    <td className="py-2 px-3 text-red-600 font-medium">{r.stock_out ?? 0}</td>
                    <td className="py-2 px-3">{r.closing_balance ?? 0}</td>
                  </tr>
                ))}
                {filterRows.length === 0 && (
                  <tr><td colSpan="7" className="text-center py-3 text-gray-500">No results</td></tr>
                )}
              </tbody>
            </table>
            <div className="flex items-center justify-between mt-3">
              <div className="text-sm text-gray-600">Page {filterPage}</div>
              <div className="flex gap-2">
                <button className="px-3 py-1 rounded bg-gray-100 hover:bg-gray-200 disabled:opacity-50" onClick={() => handleApplyFilter(filterPage - 1)} disabled={filterPage <= 1}>Prev</button>
                <button className="px-3 py-1 rounded bg-gray-100 hover:bg-gray-200 disabled:opacity-50" onClick={() => handleApplyFilter(filterPage + 1)} disabled={filterLastCount < pageSize}>Next</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'Reports' && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="block text-sm text-gray-600">Period</label>
              <select value={period} onChange={e=>setPeriod(e.target.value)} className="border rounded px-3 py-2">
                {['Weekly','Monthly','Yearly'].map(p=> <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-600">Start date</label>
              <input type="date" value={reportStart} onChange={e=>setReportStart(e.target.value)} className="border rounded px-3 py-2" />
            </div>
            <div>
              <label className="block text-sm text-gray-600">End date</label>
              <input type="date" value={reportEnd} onChange={e=>setReportEnd(e.target.value)} className="border rounded px-3 py-2" />
            </div>
            <div>
              <label className="block text-sm text-gray-600">Search</label>
              <input value={reportSearch} onChange={e=>setReportSearch(e.target.value)} className="border rounded px-3 py-2" placeholder="Find by period or item" />
            </div>
            <button onClick={handleGenerateReport} className="px-4 py-2 rounded bg-blue-600 text-white disabled:opacity-50" disabled={loading}>Generate</button>
            <button onClick={handleDownloadReport} className="px-4 py-2 rounded bg-gray-100 hover:bg-gray-200 disabled:opacity-50" disabled={!filteredReportRows.length}>Download CSV</button>
          </div>
          <div className="bg-white rounded shadow p-4 overflow-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left border-b">
                  <th className="py-2 px-3">Period</th>
                  <th className="py-2 px-3">Item</th>
                  <th className="py-2 px-3">Open</th>
                  <th className="py-2 px-3">In</th>
                  <th className="py-2 px-3">Returned</th>
                  <th className="py-2 px-3">Out</th>
                  <th className="py-2 px-3">Closing</th>
                </tr>
              </thead>
              <tbody>
                {filteredReportRows.map((r,i)=> (
                  <tr key={i} className="border-b hover:bg-gray-50">
                    <td className="py-2 px-3">{r.period}</td>
                    <td className="py-2 px-3">{r.item_name}</td>
                    <td className="py-2 px-3">{r.total_open_stock ?? 0}</td>
                    <td className="py-2 px-3">{r.total_stock_in ?? 0}</td>
                    <td className="py-2 px-3">{r.total_returned ?? 0}</td>
                    <td className="py-2 px-3">{r.total_stock_out ?? 0}</td>
                    <td className="py-2 px-3">{r.total_closing_stock ?? 0}</td>
                  </tr>
                ))}
                {reportRows.length === 0 && (
                  <tr><td colSpan="7" className="text-center py-3 text-gray-500">No report data</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'Delete' && (
        <div className="space-y-3">
          {!canDeleteInventory && (
            <div className="bg-yellow-50 text-yellow-800 border border-yellow-200 px-3 py-2 rounded">You do not have permission to delete inventory items.</div>
          )}
          <div className="flex gap-3 items-end">
            <div>
              <label className="block text-sm text-gray-600">Item</label>
              <select value={deleteItemId} onChange={e=>setDeleteItemId(e.target.value)} className="border rounded px-3 py-2 min-w-[240px]" disabled={!canDeleteInventory}>
                <option value="">Select</option>
                {Object.entries(itemsMap).map(([name, obj]) => (
                  <option key={obj.item_id} value={obj.item_id}>{name}</option>
                ))}
              </select>
            </div>
            <button onClick={handleDeleteItem} className="px-4 py-2 rounded bg-red-600 text-white disabled:opacity-50" disabled={!canDeleteInventory || !deleteItemId || loading}>Delete</button>
          </div>
          {deleteMsg && <div className="bg-green-50 text-green-700 border border-green-200 px-3 py-2 rounded">{deleteMsg}</div>}
        </div>
      )}

      {/* Manual Adjustment Modal */}
      {showAdjustModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-semibold">Edit Inventory</h3>
              <button onClick={() => setShowAdjustModal(false)} className="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
            </div>
            
            {/* Error and Success Messages in Modal */}
            {error && <div className="bg-red-50 text-red-700 border border-red-200 px-3 py-2 rounded mb-4">{error}</div>}
            {adjustMsg && <div className="bg-green-50 text-green-700 border border-green-200 px-3 py-2 rounded mb-4">{adjustMsg}</div>}
            
            <div className="space-y-4">
              
              {/* Date Range Filter */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Start Date</label>
                  <input
                    type="date"
                    value={adjustStartDate}
                    onChange={e => setAdjustStartDate(e.target.value)}
                    className="w-full border rounded px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">End Date</label>
                  <input
                    type="date"
                    value={adjustEndDate}
                    onChange={e => setAdjustEndDate(e.target.value)}
                    className="w-full border rounded px-3 py-2"
                  />
                </div>
              </div>

              {/* Warehouse Filter */}
              <div>
                <label className="block text-sm text-gray-600 mb-1">Filter by warehouse (optional)</label>
                <select
                  value={adjustWarehouse}
                  onChange={async (e) => {
                    const warehouse = e.target.value;
                    setAdjustWarehouse(warehouse);
                    setAdjustItemId(''); // Reset selected item when warehouse changes
                    setItemHistory([]); // Clear history when warehouse changes
                    setAvailableDates([]);
                    setAdjustDate('');
                    setCurrentRecord(null);
                    if (warehouse) {
                      await fetchItemsByWarehouse(warehouse);
                    } else {
                      setFilteredItemsMap(itemsMap); // Reset to all items
                    }
                  }}
                  className="w-full border rounded px-3 py-2"
                >
                  <option value="">All warehouses</option>
                  {warehouses.map(w => <option key={w} value={w}>{w}</option>)}
                </select>
              </div>

              {/* Item Selection */}
              <div>
                <label className="block text-sm text-gray-600 mb-1">Select item</label>
                <select
                  value={adjustItemId}
                  onChange={(e) => {
                    e.preventDefault();
                    const itemId = e.target.value;
                    setAdjustItemId(itemId);
                    if (itemId) {
                      fetchItemHistory(itemId, adjustStartDate || null, adjustEndDate || null);
                    } else {
                      setItemHistory([]);
                      setAvailableDates([]);
                      setAdjustDate('');
                      setCurrentRecord(null);
                    }
                  }}
                  className="w-full border rounded px-3 py-2"
                >
                  <option value="">Select item</option>
                  {Object.entries(adjustWarehouse ? filteredItemsMap : itemsMap).map(([name, obj]) => (
                    <option key={obj.item_id} value={obj.item_id}>{name}</option>
                  ))}
                </select>
              </div>

              {/* Date Selection - Only show if item has history */}
              {adjustItemId && (
                <div>
                  <label className="block text-sm text-gray-600 mb-1">
                    Select date to edit
                    {availableDates.length === 0 && <span className="text-red-600 ml-2">(No history available in selected range)</span>}
                  </label>
                  {availableDates.length > 0 ? (
                    <select 
                      value={adjustDate} 
                      onChange={e => {
                        const selectedDate = e.target.value;
                        setAdjustDate(selectedDate);
                        // Update current record based on selected date
                        const record = itemHistory.find(r => r.log_date === selectedDate);
                        setCurrentRecord(record);
                        // Pre-fill with current value based on action
                        if (record) {
                          if (adjustAction === 'supply') {
                            setAdjustQty(record.supplied_quantity || 0);
                          } else if (adjustAction === 'stockout') {
                            setAdjustQty(record.stock_out || 0);
                          } else if (adjustAction === 'return') {
                            setAdjustQty(record.return_quantity || 0);
                          }
                        }
                      }} 
                      className="w-full border rounded px-3 py-2"
                    >
                      <option value="">Choose a date</option>
                      {availableDates.map(date => (
                        <option key={date} value={date}>{date}</option>
                      ))}
                    </select>
                  ) : (
                    <div className="w-full border rounded px-3 py-2 bg-gray-50 text-gray-500">
                      This item has no history in the selected date range
                    </div>
                  )}
                </div>
              )}

              {/* Current Values Display */}
              {adjustDate && currentRecord && (
                <div className="bg-blue-50 p-3 rounded border border-blue-200">
                  <h4 className="font-medium text-sm mb-2 text-blue-900">Current values for {adjustDate}</h4>
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <div>
                      <span className="text-gray-600">Supply:</span>
                      <span className="font-bold ml-1 text-green-600">{currentRecord.supplied_quantity || 0}</span>
                    </div>
                    <div>
                      <span className="text-gray-600">Stock Out:</span>
                      <span className="font-bold ml-1 text-red-600">{currentRecord.stock_out || 0}</span>
                    </div>
                    <div>
                      <span className="text-gray-600">Return:</span>
                      <span className="font-bold ml-1 text-blue-600">{currentRecord.return_quantity || 0}</span>
                    </div>
                  </div>
                  <div className="mt-2 text-sm">
                    <span className="text-gray-600">Closing Balance:</span>
                    <span className="font-bold ml-1">{currentRecord.closing_balance || 0}</span>
                  </div>
                  <div className="mt-2 text-xs text-gray-500">
                    Item ID: {currentRecord.item_id} | Date: {currentRecord.log_date}
                  </div>
                </div>
              )}
              
              {/* Debug info - shows if data is loaded but not displaying */}
              {adjustItemId && itemHistory.length > 0 && !currentRecord && (
                <div className="bg-yellow-50 p-3 rounded border border-yellow-200">
                  <p className="text-sm text-yellow-800">
                    ⚠️ Debug: {itemHistory.length} records loaded but no current record selected.
                    {adjustDate ? `Selected date: ${adjustDate}` : 'No date selected yet.'}
                  </p>
                </div>
              )}

              {/* Current Balances & History */}
              {adjustItemId && availableDates.length > 0 && (
                <div className="bg-gray-50 p-3 rounded border">
                  <h4 className="font-medium text-sm mb-2">Recent Activity (Selected Range)</h4>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-xs">
                      <thead>
                        <tr className="text-left border-b">
                          <th className="py-1 px-2">Date</th>
                          <th className="py-1 px-2">Open</th>
                          <th className="py-1 px-2">In</th>
                          <th className="py-1 px-2">Out</th>
                          <th className="py-1 px-2">Return</th>
                          <th className="py-1 px-2">Closing</th>
                        </tr>
                      </thead>
                     <tbody>
                        {itemHistory.length === 0 && (
                          <tr><td colSpan="6" className="text-center py-2 text-gray-500">No recent activity</td></tr>
                        )}
                        {itemHistory.slice((historyPage - 1) * historyPageSize, historyPage * historyPageSize).map((h, i) => (
                          <tr key={i} className="border-b">
                            <td className="py-1 px-2">{h.log_date}</td>
                            <td className="py-1 px-2">{h.open_balance ?? 0}</td>
                            <td className="py-1 px-2 text-green-600">{h.supplied_quantity ?? 0}</td>
                            <td className="py-1 px-2 text-red-600">{h.stock_out ?? 0}</td>
                            <td className="py-1 px-2">{h.return_quantity ?? 0}</td>
                            <td className="py-1 px-2 font-medium">{h.closing_balance ?? 0}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {/* Pagination Controls */}
                  {itemHistory.length > historyPageSize && (
                    <div className="flex items-center justify-between mt-2 pt-2 border-t">
                      <div className="text-xs text-gray-600">
                        Page {historyPage} of {Math.ceil(itemHistory.length / historyPageSize)}
                        <span className="ml-2">({itemHistory.length} total records)</span>
                      </div>
                      <div className="flex gap-2">
                        <button
                          className="px-2 py-1 text-xs rounded bg-gray-100 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                          onClick={() => setHistoryPage(p => Math.max(1, p - 1))}
                          disabled={historyPage <= 1}
                        >
                          Prev
                        </button>
                        <button
                          className="px-2 py-1 text-xs rounded bg-gray-100 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                          onClick={() => setHistoryPage(p => p + 1)}
                          disabled={historyPage >= Math.ceil(itemHistory.length / historyPageSize)}
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}


              {/* Action Type */}
              <div>
                <label className="block text-sm text-gray-600 mb-1">Select field to edit</label>
                <select
                  value={adjustAction}
                  onChange={e => {
                    const newAction = e.target.value;
                    console.log('Action changed to:', newAction);
                    console.log('Current record:', currentRecord);
                    setAdjustAction(newAction);
                    // Update quantity field with current value for selected action
                    if (currentRecord) {
                      let newQty = 0;
                      if (newAction === 'supply') {
                        newQty = currentRecord.supplied_quantity || 0;
                      } else if (newAction === 'stockout') {
                        newQty = currentRecord.stock_out || 0;
                      } else if (newAction === 'return') {
                        newQty = currentRecord.return_quantity || 0;
                      }
                      console.log('Setting quantity to:', newQty);
                      setAdjustQty(newQty);
                    } else {
                      console.log('No current record available');
                      setAdjustQty('');
                    }
                  }}
                  className="w-full border rounded px-3 py-2"
                  disabled={!adjustDate || !currentRecord}
                >
                  <option value="supply">Supplied Quantity</option>
                  <option value="stockout">Stock Out</option>
                  <option value="return">Return Quantity</option>
                </select>
                {(!adjustDate || !currentRecord) && (
                  <p className="text-xs text-gray-500 mt-1">Select an item and date first</p>
                )}
              </div>

              {/* Quantity */}
              <div>
                <label className="block text-sm text-gray-600 mb-1">
                  New value 
                  {currentRecord && (
                    <span className="text-gray-500 text-xs ml-2">
                      (Current: {adjustAction === 'supply' ? currentRecord.supplied_quantity : adjustAction === 'stockout' ? currentRecord.stock_out : currentRecord.return_quantity || 0})
                    </span>
                  )}
                </label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={adjustQty}
                  onChange={e => setAdjustQty(e.target.value)}
                  className="w-full border rounded px-3 py-2"
                  placeholder="Enter new value (0 or greater)"
                />
              </div>
              {/* Notes */}
              <div>
                <label className="block text-sm text-gray-600 mb-1">Notes (optional)</label>
                <textarea 
                  value={adjustNotes} 
                  onChange={e => setAdjustNotes(e.target.value)} 
                  className="w-full border rounded px-3 py-2" 
                  rows="2"
                  placeholder="Reason for adjustment..."
                />
              </div>

              {/* Actions */}
              <div className="flex gap-3 justify-end pt-2">
                <button 
                  onClick={() => setShowAdjustModal(false)} 
                  className="px-4 py-2 rounded border hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleManualAdjustment} 
                  className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50" 
                  disabled={loading || !adjustItemId}
                >
                  Submit Adjustment
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Download Inventory Modal */}
      {showDownloadModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-semibold">Download Inventory</h3>
              <button onClick={() => {
                setShowDownloadModal(false);
                setDownloadWarehouse('');
              }} className="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-600 mb-1">Select Warehouse</label>
                <select
                  value={downloadWarehouse}
                  onChange={(e) => setDownloadWarehouse(e.target.value)}
                  className="w-full border rounded px-3 py-2"
                >
                  <option value="">Choose warehouse...</option>
                  {warehouses.map(w => <option key={w} value={w}>{w}</option>)}
                </select>
              </div>
              
              <div className="bg-blue-50 p-3 rounded border border-blue-200">
                <p className="text-sm text-blue-900">
                  This will download a CSV file containing all inventory item names for the selected warehouse.
                </p>
              </div>
              
              <div className="flex gap-3 justify-end pt-2">
                <button
                  onClick={() => {
                    setShowDownloadModal(false);
                    setDownloadWarehouse('');
                  }}
                  className="px-4 py-2 rounded border hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDownloadInventory}
                  className="px-4 py-2 rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
                  disabled={loading || !downloadWarehouse}
                >
                  <Download className="w-4 h-4" />
                  Download
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

   
    
  

export default Inventory;
