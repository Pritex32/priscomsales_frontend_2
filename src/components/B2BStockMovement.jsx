import React, { useState, useEffect } from 'react';
import api from '../services/api';
import {
  Package,
  Building2,
  Users,
  AlertTriangle,
  ArrowRightLeft,
  ShoppingCart,
  Trash2,
  CheckCircle,
  XCircle,
  Download,
  Filter,
  Calendar,
  Search,
  Plus,
  X,
  CheckSquare
} from 'lucide-react';
import { toast } from 'react-toastify';
import Tooltip from './Tooltip';

const B2BStockMovement = () => {
  // State for transfer types
  const [activeTab, setActiveTab] = useState('warehouse_transfer'); // warehouse_transfer, customer_sale, stockout
  
  // Common state
  const [warehouses, setWarehouses] = useState([]);
  const [movements, setMovements] = useState([]);
  const [loading, setLoading] = useState(false);
  
  // Multiple items state
  const [selectedItems, setSelectedItems] = useState([]); // Array of {item_id, item_name, item_name_to, quantity, stock}
  const [searchTerm, setSearchTerm] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  
  // Separate source and destination items for warehouse transfer
  const [selectedSourceItems, setSelectedSourceItems] = useState([]); // Source items
  const [selectedDestItems, setSelectedDestItems] = useState([]); // Destination items
  const [sourceSearchTerm, setSourceSearchTerm] = useState('');
  const [destSearchTerm, setDestSearchTerm] = useState('');
  const [showSourceDropdown, setShowSourceDropdown] = useState(false);
  const [showDestDropdown, setShowDestDropdown] = useState(false);
  
  // Warehouse Transfer state
  const [wtForm, setWtForm] = useState({
    source_warehouse: '',
    destination_warehouse: '',
    issued_by: '',
    received_by: '',
    notes: '',
    movement_date: new Date().toISOString().split('T')[0]
  });
  
  // Customer Sale state
  const [csForm, setCsForm] = useState({
    source_warehouse: '',
    issued_by: '',
    customer_name: '',
    notes: '',
    movement_date: new Date().toISOString().split('T')[0]
  });
  
  // Stockout state
  const [soForm, setSoForm] = useState({
    source_warehouse: '',
    issued_by: '',
    notes: '',
    movement_date: new Date().toISOString().split('T')[0]
  });
  
  // Inventory items for selected warehouse
  const [sourceInventoryItems, setSourceInventoryItems] = useState([]);
  const [destinationInventoryItems, setDestinationInventoryItems] = useState([]);
  const [inventoryItems, setInventoryItems] = useState([]); // For customer sale and stockout
  const [selectedWarehouseForItems, setSelectedWarehouseForItems] = useState('');
  const [loadingSourceItems, setLoadingSourceItems] = useState(false);
  const [loadingDestItems, setLoadingDestItems] = useState(false);
  const [loadingItems, setLoadingItems] = useState(false);
  
  // Filters
  const [filters, setFilters] = useState({
    transfer_type: '',
    warehouse: '',
    start_date: '',
    end_date: ''
  });
  
  // Pagination and Search
  const [searchKeyword, setSearchKeyword] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;
  
  // Stats
  const [stats, setStats] = useState({
    total_transfers: 0,
    total_sales: 0,
    total_writeoffs: 0
  });

  // Load warehouses on mount
  useEffect(() => {
    loadWarehouses();
    loadMovements();
  }, []);

  // Load inventory items when warehouse changes
  useEffect(() => {
    if (selectedWarehouseForItems) {
      loadInventoryItems(selectedWarehouseForItems);
    }
  }, [selectedWarehouseForItems]);

  // Load source warehouse items for warehouse transfer
  useEffect(() => {
    if (activeTab === 'warehouse_transfer' && wtForm.source_warehouse) {
      loadSourceInventoryItems(wtForm.source_warehouse);
    }
  }, [wtForm.source_warehouse, activeTab]);

  // Load destination warehouse items for warehouse transfer
  useEffect(() => {
    if (activeTab === 'warehouse_transfer' && wtForm.destination_warehouse) {
      loadDestinationInventoryItems(wtForm.destination_warehouse);
    }
  }, [wtForm.destination_warehouse, activeTab]);

  // Update selected warehouse when form changes
  useEffect(() => {
    if (activeTab === 'warehouse_transfer' && wtForm.source_warehouse) {
      setSelectedWarehouseForItems(wtForm.source_warehouse);
      // Force reload items when switching to warehouse transfer tab
      loadInventoryItems(wtForm.source_warehouse);
    } else if (activeTab === 'customer_sale' && csForm.source_warehouse) {
      setSelectedWarehouseForItems(csForm.source_warehouse);
      loadInventoryItems(csForm.source_warehouse);
    } else if (activeTab === 'stockout' && soForm.source_warehouse) {
      setSelectedWarehouseForItems(soForm.source_warehouse);
      loadInventoryItems(soForm.source_warehouse);
    }
  }, [activeTab, wtForm.source_warehouse, csForm.source_warehouse, soForm.source_warehouse]);

  // Auto-update destination warehouse when source changes
  useEffect(() => {
    if (warehouses.length > 0 && wtForm.source_warehouse) {
      const availableDestinations = warehouses.filter(w => w !== wtForm.source_warehouse);
      
      // If current destination is same as source or not in available list, pick first available
      if (!wtForm.destination_warehouse || 
          wtForm.destination_warehouse === wtForm.source_warehouse || 
          !availableDestinations.includes(wtForm.destination_warehouse)) {
        if (availableDestinations.length > 0) {
          setWtForm(prev => ({ ...prev, destination_warehouse: availableDestinations[0] }));
        }
      }
    }
  }, [wtForm.source_warehouse, warehouses]);

  const loadWarehouses = async () => {
    try {
      const res = await api.get('/b2b/warehouses');
      const warehouseList = res.data || [];
      setWarehouses(warehouseList);
      
      if (warehouseList.length > 0) {
        // Set source warehouse to first warehouse
        const sourceWh = warehouseList[0];
        setWtForm(prev => ({ ...prev, source_warehouse: sourceWh }));
        setCsForm(prev => ({ ...prev, source_warehouse: sourceWh }));
        setSoForm(prev => ({ ...prev, source_warehouse: sourceWh }));
        
        // Set destination warehouse to second warehouse if available, otherwise first
        if (warehouseList.length > 1) {
          setWtForm(prev => ({ ...prev, destination_warehouse: warehouseList[1] }));
        } else if (warehouseList.length === 1) {
          // If only one warehouse, still set it (validation will catch same source/dest)
          setWtForm(prev => ({ ...prev, destination_warehouse: warehouseList[0] }));
        }
      }
    } catch (error) {
      toast.error('Failed to load warehouses');
    }
  };

  const loadInventoryItems = async (warehouse) => {
    if (!warehouse) {
      setInventoryItems([]);
      return;
    }
    
    try {
      setLoadingItems(true);
      const res = await api.get(`/b2b/inventory/${warehouse}`);
      const items = res.data || [];
      setInventoryItems(items);
      
      if (items.length === 0) {
        toast.info(`No items found in ${warehouse}`);
      }
    } catch (error) {
      console.error('Failed to load inventory items:', error);
      toast.error(`Failed to load items from ${warehouse}`);
      setInventoryItems([]);
    } finally {
      setLoadingItems(false);
    }
  };

  const loadSourceInventoryItems = async (warehouse) => {
    if (!warehouse) {
      setSourceInventoryItems([]);
      return;
    }
    
    try {
      setLoadingSourceItems(true);
      const res = await api.get(`/b2b/inventory/${warehouse}`);
      const items = res.data || [];
      setSourceInventoryItems(items);
    } catch (error) {
      console.error('Failed to load source items:', error);
      toast.error(`Failed to load source items from ${warehouse}`);
      setSourceInventoryItems([]);
    } finally {
      setLoadingSourceItems(false);
    }
  };

  const loadDestinationInventoryItems = async (warehouse) => {
    if (!warehouse) {
      setDestinationInventoryItems([]);
      return;
    }
    
    try {
      setLoadingDestItems(true);
      const res = await api.get(`/b2b/inventory/${warehouse}`);
      const items = res.data || [];
      setDestinationInventoryItems(items);
    } catch (error) {
      console.error('Failed to load destination items:', error);
      toast.error(`Failed to load destination items from ${warehouse}`);
      setDestinationInventoryItems([]);
    } finally {
      setLoadingDestItems(false);
    }
  };

  const loadMovements = async () => {
    try {
      const params = {};
      if (filters.transfer_type) params.transfer_type = filters.transfer_type;
      if (filters.warehouse) params.warehouse = filters.warehouse;
      if (filters.start_date) params.start_date = filters.start_date;
      if (filters.end_date) params.end_date = filters.end_date;
      
      const res = await api.get('/b2b/movements', { params });
      const data = res.data || [];
      setMovements(data);
      
      // Calculate stats
      setStats({
        total_transfers: data.filter(m => m.transfer_type === 'warehouse_transfer').length,
        total_sales: data.filter(m => m.transfer_type === 'customer_sale').length,
        total_writeoffs: data.filter(m => m.transfer_type === 'stockout').length
      });
    } catch (error) {
      toast.error('Failed to load movements');
    }
  };

  const handleWarehouseTransfer = async (e) => {
    e.preventDefault();
    
    if (!wtForm.source_warehouse || !wtForm.destination_warehouse ||
        selectedSourceItems.length === 0 || selectedDestItems.length === 0 ||
        !wtForm.issued_by || !wtForm.received_by) {
      toast.error('Please fill all required fields and select source and destination items');
      return;
    }
    
    if (wtForm.source_warehouse === wtForm.destination_warehouse) {
      toast.error('Source and destination warehouses must be different');
      return;
    }
    
    if (selectedSourceItems.length !== selectedDestItems.length) {
      toast.error('Number of source items must match number of destination items');
      return;
    }
    
    setLoading(true);
    try {
      // Map source items to destination items
      const items = selectedSourceItems.map((sourceItem, index) => {
        const destItem = selectedDestItems[index];
        return {
          item_id: sourceItem.item_id,
          item_name: sourceItem.item_name,
          item_name_to: destItem ? destItem.item_name : sourceItem.item_name,
          quantity: sourceItem.quantity
        };
      });
      
      await api.post('/b2b/transfer/warehouse', {
        transfer_type: 'warehouse_transfer',
        source_warehouse: wtForm.source_warehouse,
        destination_warehouse: wtForm.destination_warehouse,
        items: items,
        issued_by: wtForm.issued_by,
        received_by: wtForm.received_by,
        notes: wtForm.notes,
        movement_date: wtForm.movement_date
      });
      
      const totalQty = items.reduce((sum, item) => sum + item.quantity, 0);
      toast.success(`Transferred ${items.length} item(s) (${totalQty} total units)`);
      loadMovements();
      loadSourceInventoryItems(wtForm.source_warehouse);
      loadDestinationInventoryItems(wtForm.destination_warehouse);
      setSelectedSourceItems([]);
      setSelectedDestItems([]);
      setSourceSearchTerm('');
      setDestSearchTerm('');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Transfer failed');
    } finally {
      setLoading(false);
    }
  };

  const handleCustomerSale = async (e) => {
    e.preventDefault();
    
    if (!csForm.source_warehouse || selectedItems.length === 0 || !csForm.issued_by) {
      toast.error('Please fill all required fields and select at least one item');
      return;
    }
    
    setLoading(true);
    try {
      const items = selectedItems.map(item => ({
        item_id: item.item_id,
        item_name: item.item_name,
        quantity: item.quantity
      }));
      
      await api.post('/b2b/transfer/customer', {
        transfer_type: 'customer_sale',
        source_warehouse: csForm.source_warehouse,
        items: items,
        issued_by: csForm.issued_by,
        customer_name: csForm.customer_name,
        notes: csForm.notes,
        movement_date: csForm.movement_date
      });
      
      const totalQty = items.reduce((sum, item) => sum + item.quantity, 0);
      toast.success(`Sold ${items.length} item(s) (${totalQty} total units)`);
      loadMovements();
      loadInventoryItems(csForm.source_warehouse);
      setSelectedItems([]);
      setSearchTerm('');
      setCsForm({
        ...csForm,
        customer_name: '',
        notes: ''
      });
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Sale failed');
    } finally {
      setLoading(false);
    }
  };

  const handleStockout = async (e) => {
    e.preventDefault();
    
    if (!soForm.source_warehouse || selectedItems.length === 0 ||
        !soForm.issued_by || !soForm.notes || soForm.notes.length < 5) {
      toast.error('Please fill all required fields and select at least one item (notes must be at least 5 characters)');
      return;
    }
    
    setLoading(true);
    try {
      const items = selectedItems.map(item => ({
        item_id: item.item_id,
        item_name: item.item_name,
        quantity: item.quantity
      }));
      
      await api.post('/b2b/transfer/stockout', {
        transfer_type: 'stockout',
        source_warehouse: soForm.source_warehouse,
        items: items,
        issued_by: soForm.issued_by,
        notes: soForm.notes,
        movement_date: soForm.movement_date
      });
      
      const totalQty = items.reduce((sum, item) => sum + item.quantity, 0);
      toast.success(`Written off ${items.length} item(s) (${totalQty} total units)`);
      loadMovements();
      loadInventoryItems(soForm.source_warehouse);
      setSelectedItems([]);
      setSearchTerm('');
      setSoForm({
        ...soForm,
        notes: ''
      });
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Write-off failed');
    } finally {
      setLoading(false);
    }
  };

  const handleExportCSV = async () => {
    try {
      const params = filters.transfer_type ? { transfer_type: filters.transfer_type } : {};
      const res = await api.get('/b2b/movements/export', {
        params,
        responseType: 'blob'
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `stock_movements_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success('Exported successfully');
    } catch (error) {
      toast.error('Export failed');
    }
  };

  // Helper functions for multiple item selection
  const handleAddItem = (item) => {
    // Check if item already selected
    if (selectedItems.find(i => i.item_id === item.item_id)) {
      toast.warning('Item already added');
      return;
    }
    
    setSelectedItems(prev => [...prev, {
      item_id: item.item_id,
      item_name: item.item_name,
      item_name_to: item.item_name, // Default to same name
      quantity: 1,
      stock: item.closing_balance
    }]);
    setSearchTerm('');
    setShowDropdown(false);
    toast.success(`Added ${item.item_name}`);
  };

  const handleRemoveItem = (itemId) => {
    setSelectedItems(prev => prev.filter(item => item.item_id !== itemId));
  };

  const handleUpdateItemQuantity = (itemId, quantity) => {
    setSelectedItems(prev => prev.map(item =>
      item.item_id === itemId ? { ...item, quantity: Math.max(1, parseInt(quantity) || 1) } : item
    ));
  };

  const handleUpdateItemNameTo = (itemId, nameTo) => {
    setSelectedItems(prev => prev.map(item =>
      item.item_id === itemId ? { ...item, item_name_to: nameTo } : item
    ));
  };

  const handleSelectAll = () => {
    const items = activeTab === 'warehouse_transfer' ? sourceInventoryItems : inventoryItems;
    const newItems = items.filter(item => !selectedItems.find(si => si.item_id === item.item_id))
      .map(item => ({
        item_id: item.item_id,
        item_name: item.item_name,
        item_name_to: item.item_name,
        quantity: 1,
        stock: item.closing_balance
      }));
    
    if (newItems.length > 0) {
      setSelectedItems(prev => [...prev, ...newItems]);
      toast.success(`Added ${newItems.length} item(s)`);
    } else {
      toast.info('All items already selected');
    }
  };

  const handleClearAll = () => {
    setSelectedItems([]);
    toast.info('Cleared all items');
  };

  // Helper functions for source items
  const handleAddSourceItem = (item) => {
    if (selectedSourceItems.find(i => i.item_id === item.item_id)) {
      toast.warning('Item already added to source');
      return;
    }
    setSelectedSourceItems(prev => [...prev, {
      item_id: item.item_id,
      item_name: item.item_name,
      quantity: 1,
      stock: item.closing_balance
    }]);
    setSourceSearchTerm('');
    setShowSourceDropdown(false);
    toast.success(`Added ${item.item_name} to source`);
  };

  const handleRemoveSourceItem = (itemId) => {
    setSelectedSourceItems(prev => prev.filter(item => item.item_id !== itemId));
  };

  const handleUpdateSourceQuantity = (itemId, quantity) => {
    setSelectedSourceItems(prev => prev.map(item =>
      item.item_id === itemId ? { ...item, quantity: Math.max(1, parseInt(quantity) || 1) } : item
    ));
  };

  const handleSelectAllSource = () => {
    const newItems = sourceInventoryItems.filter(item => !selectedSourceItems.find(si => si.item_id === item.item_id))
      .map(item => ({
        item_id: item.item_id,
        item_name: item.item_name,
        quantity: 1,
        stock: item.closing_balance
      }));
    
    if (newItems.length > 0) {
      setSelectedSourceItems(prev => [...prev, ...newItems]);
      toast.success(`Added ${newItems.length} source item(s)`);
    } else {
      toast.info('All source items already selected');
    }
  };

  const handleClearAllSource = () => {
    setSelectedSourceItems([]);
    toast.info('Cleared all source items');
  };

  // Helper functions for destination items
  const handleAddDestItem = (item) => {
    if (selectedDestItems.find(i => i.item_id === item.item_id)) {
      toast.warning('Item already added to destination');
      return;
    }
    setSelectedDestItems(prev => [...prev, {
      item_id: item.item_id,
      item_name: item.item_name,
      quantity: 1,
      stock: item.closing_balance
    }]);
    setDestSearchTerm('');
    setShowDestDropdown(false);
    toast.success(`Added ${item.item_name} to destination`);
  };

  const handleRemoveDestItem = (itemId) => {
    setSelectedDestItems(prev => prev.filter(item => item.item_id !== itemId));
  };

  const handleUpdateDestQuantity = (itemId, quantity) => {
    setSelectedDestItems(prev => prev.map(item =>
      item.item_id === itemId ? { ...item, quantity: Math.max(1, parseInt(quantity) || 1) } : item
    ));
  };

  const handleSelectAllDest = () => {
    const newItems = destinationInventoryItems.filter(item => !selectedDestItems.find(si => si.item_id === item.item_id))
      .map(item => ({
        item_id: item.item_id,
        item_name: item.item_name,
        quantity: 1,
        stock: item.closing_balance
      }));
    
    if (newItems.length > 0) {
      setSelectedDestItems(prev => [...prev, ...newItems]);
      toast.success(`Added ${newItems.length} destination item(s)`);
    } else {
      toast.info('All destination items already selected');
    }
  };

  const handleClearAllDest = () => {
    setSelectedDestItems([]);
    toast.info('Cleared all destination items');
  };

  // Filter items based on search term
  const getFilteredItems = () => {
    const items = activeTab === 'warehouse_transfer' ? sourceInventoryItems : inventoryItems;
    if (!searchTerm) return items;
    return items.filter(item =>
      item.item_name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  };

  const getFilteredSourceItems = () => {
    if (!sourceSearchTerm) return sourceInventoryItems;
    return sourceInventoryItems.filter(item =>
      item.item_name.toLowerCase().includes(sourceSearchTerm.toLowerCase())
    );
  };

  const getFilteredDestItems = () => {
    if (!destSearchTerm) return destinationInventoryItems;
    return destinationInventoryItems.filter(item =>
      item.item_name.toLowerCase().includes(destSearchTerm.toLowerCase())
    );
  };

  const getTransferTypeColor = (type) => {
    switch (type) {
      case 'warehouse_transfer': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'customer_sale': return 'bg-green-100 text-green-800 border-green-200';
      case 'stockout': return 'bg-red-100 text-red-800 border-red-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getTransferTypeIcon = (type) => {
    switch (type) {
      case 'warehouse_transfer': return <ArrowRightLeft className="w-4 h-4" />;
      case 'customer_sale': return <ShoppingCart className="w-4 h-4" />;
      case 'stockout': return <Trash2 className="w-4 h-4" />;
      default: return <Package className="w-4 h-4" />;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">B2B Stock Movement</h1>
        <p className="text-gray-600">Manage warehouse transfers, customer sales, and stock write-offs</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 mb-1">Warehouse Transfers</p>
              <p className="text-3xl font-bold text-blue-600">{stats.total_transfers}</p>
            </div>
            <div className="bg-blue-100 p-3 rounded-lg">
              <ArrowRightLeft className="w-8 h-8 text-blue-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 mb-1">Customer Sales</p>
              <p className="text-3xl font-bold text-green-600">{stats.total_sales}</p>
            </div>
            <div className="bg-green-100 p-3 rounded-lg">
              <ShoppingCart className="w-8 h-8 text-green-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 mb-1">Write-offs</p>
              <p className="text-3xl font-bold text-red-600">{stats.total_writeoffs}</p>
            </div>
            <div className="bg-red-100 p-3 rounded-lg">
              <Trash2 className="w-8 h-8 text-red-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Transfer Type Tabs */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 mb-8">
        <div className="border-b border-gray-200">
          <nav className="flex space-x-8 px-6" aria-label="Tabs">
            <button
              onClick={() => setActiveTab('warehouse_transfer')}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'warehouse_transfer'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center space-x-2">
                <ArrowRightLeft className="w-5 h-5" />
                <span>Warehouse Transfer</span>
              </div>
            </button>
            
            <button
              onClick={() => setActiveTab('customer_sale')}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'customer_sale'
                  ? 'border-green-500 text-green-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center space-x-2">
                <ShoppingCart className="w-5 h-5" />
                <span>B2B to Customer</span>
              </div>
            </button>
            
            <button
              onClick={() => setActiveTab('stockout')}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'stockout'
                  ? 'border-red-500 text-red-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center space-x-2">
                <Trash2 className="w-5 h-5" />
                <span>Stockout / Write-off</span>
              </div>
            </button>
          </nav>
        </div>

        {/* Tab Content */}
        <div className="p-6">
          {/* Warehouse Transfer Form */}
          {activeTab === 'warehouse_transfer' && (
            <form onSubmit={handleWarehouseTransfer} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Source Warehouse */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center">
                    Source Warehouse *
                    <Tooltip text="Warehouse from which items will be transferred" />
                  </label>
                  <div className="relative">
                    <Building2 className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                    <select
                      value={wtForm.source_warehouse}
                      onChange={(e) => setWtForm({ ...wtForm, source_warehouse: e.target.value })}
                      className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      required
                    >
                      {warehouses.map(w => (
                        <option key={w} value={w}>{w}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Destination Warehouse */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center">
                    Destination Warehouse *
                    <Tooltip text="Warehouse where items will be transferred to" />
                  </label>
                  <div className="relative">
                    <Building2 className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                    <select
                      value={wtForm.destination_warehouse || ''}
                      onChange={(e) => setWtForm({ ...wtForm, destination_warehouse: e.target.value })}
                      className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      required
                    >
                      {warehouses.filter(w => w !== wtForm.source_warehouse).length === 0 ? (
                        <option value="">No other warehouse available</option>
                      ) : (
                        warehouses.filter(w => w !== wtForm.source_warehouse).map(w => (
                          <option key={w} value={w}>{w}</option>
                        ))
                      )}
                    </select>
                  </div>
                  {warehouses.filter(w => w !== wtForm.source_warehouse).length === 0 && (
                    <p className="text-xs text-red-600 mt-1">Please create another warehouse to enable transfers</p>
                  )}
                </div>
              </div>

              {/* SOURCE AND DESTINATION ITEMS SELECTION - SIDE BY SIDE */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 border-t border-gray-200 pt-6 mt-6">
                
                {/* SOURCE ITEMS SELECTION */}
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-medium text-gray-900">Select Source Items</h3>
                    <div className="flex items-center space-x-2">
                      <span className="text-xs font-medium text-blue-600">
                        Qty: {selectedSourceItems.reduce((sum, item) => sum + item.quantity, 0)}
                      </span>
                      <span className="text-xs text-gray-600">
                        ({selectedSourceItems.length})
                      </span>
                      {selectedSourceItems.length > 0 && (
                        <button
                          type="button"
                          onClick={handleClearAllSource}
                          className="text-xs text-red-600 hover:text-red-700 font-medium"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="flex space-x-2 mb-4">
                    <div className="flex-1 relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                      <input
                        type="text"
                        value={sourceSearchTerm}
                        onChange={(e) => {
                          setSourceSearchTerm(e.target.value);
                          setShowSourceDropdown(e.target.value.length > 0);
                        }}
                        onFocus={() => setShowSourceDropdown(sourceSearchTerm.length > 0)}
                        placeholder="Search source..."
                        className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                      
                      {showSourceDropdown && getFilteredSourceItems().length > 0 && (
                        <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                          {getFilteredSourceItems().map(item => (
                            <button
                              key={item.item_id}
                              type="button"
                              onClick={() => handleAddSourceItem(item)}
                              className="w-full px-3 py-2 text-left hover:bg-gray-50 flex items-center justify-between"
                            >
                              <span className="text-sm text-gray-900">{item.item_name}</span>
                              <span className="text-xs text-gray-500">Stock: {item.closing_balance}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    
                    <button
                      type="button"
                      onClick={handleSelectAllSource}
                      disabled={loadingSourceItems || sourceInventoryItems.length === 0}
                      className="px-3 py-2 text-sm bg-blue-100 text-blue-700 font-medium rounded-lg hover:bg-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center space-x-1"
                    >
                      <CheckSquare className="w-4 h-4" />
                      <span>All</span>
                    </button>
                  </div>

                  {selectedSourceItems.length > 0 && (
                    <div className="border border-blue-200 rounded-lg overflow-hidden bg-blue-50">
                      <table className="w-full">
                        <thead className="bg-blue-100">
                          <tr>
                            <th className="px-3 py-2 text-left text-xs font-medium text-blue-900 uppercase">Item</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-blue-900 uppercase">Stock</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-blue-900 uppercase">Qty</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-blue-900 uppercase">Del</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {selectedSourceItems.map(item => (
                            <tr key={item.item_id}>
                              <td className="px-3 py-2 text-sm text-gray-900">{item.item_name}</td>
                              <td className="px-3 py-2 text-sm text-gray-600">{item.stock}</td>
                              <td className="px-3 py-2">
                                <input
                                  type="number"
                                  min="1"
                                  max={item.stock}
                                  value={item.quantity}
                                  onChange={(e) => handleUpdateSourceQuantity(item.item_id, e.target.value)}
                                  className="w-16 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
                                />
                              </td>
                              <td className="px-3 py-2">
                                <button
                                  type="button"
                                  onClick={() => handleRemoveSourceItem(item.item_id)}
                                  className="text-red-600 hover:text-red-700"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {selectedSourceItems.length === 0 && (
                    <div className="text-center py-6 text-gray-500 bg-gray-50 rounded-lg border border-gray-200">
                      <Package className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                      <p className="text-xs">No source items</p>
                    </div>
                  )}
                </div>

                {/* DESTINATION ITEMS SELECTION */}
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-medium text-gray-900">Select Destination Items</h3>
                    <div className="flex items-center space-x-2">
                      <span className="text-xs font-medium text-green-600">
                        Qty: {selectedDestItems.reduce((sum, item) => sum + item.quantity, 0)}
                      </span>
                      <span className="text-xs text-gray-600">
                        ({selectedDestItems.length})
                      </span>
                      {selectedDestItems.length > 0 && (
                        <button
                          type="button"
                          onClick={handleClearAllDest}
                          className="text-xs text-red-600 hover:text-red-700 font-medium"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="flex space-x-2 mb-4">
                    <div className="flex-1 relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                      <input
                        type="text"
                        value={destSearchTerm}
                        onChange={(e) => {
                          setDestSearchTerm(e.target.value);
                          setShowDestDropdown(e.target.value.length > 0);
                        }}
                        onFocus={() => setShowDestDropdown(destSearchTerm.length > 0)}
                        placeholder="Search destination..."
                        className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      />
                      
                      {showDestDropdown && getFilteredDestItems().length > 0 && (
                        <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                          {getFilteredDestItems().map(item => (
                            <button
                              key={item.item_id}
                              type="button"
                              onClick={() => handleAddDestItem(item)}
                              className="w-full px-3 py-2 text-left hover:bg-gray-50 flex items-center justify-between"
                            >
                              <span className="text-sm text-gray-900">{item.item_name}</span>
                              <span className="text-xs text-gray-500">Stock: {item.closing_balance}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    
                    <button
                      type="button"
                      onClick={handleSelectAllDest}
                      disabled={loadingDestItems || destinationInventoryItems.length === 0}
                      className="px-3 py-2 text-sm bg-green-100 text-green-700 font-medium rounded-lg hover:bg-green-200 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center space-x-1"
                    >
                      <CheckSquare className="w-4 h-4" />
                      <span>All</span>
                    </button>
                  </div>

                  {selectedDestItems.length > 0 && (
                    <div className="border border-green-200 rounded-lg overflow-hidden bg-green-50">
                      <table className="w-full">
                        <thead className="bg-green-100">
                          <tr>
                            <th className="px-3 py-2 text-left text-xs font-medium text-green-900 uppercase">Item</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-green-900 uppercase">Stock</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-green-900 uppercase">Qty</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-green-900 uppercase">Del</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {selectedDestItems.map(item => (
                            <tr key={item.item_id}>
                              <td className="px-3 py-2 text-sm text-gray-900">{item.item_name}</td>
                              <td className="px-3 py-2 text-sm text-gray-600">{item.stock}</td>
                              <td className="px-3 py-2">
                                <input
                                  type="number"
                                  min="1"
                                  value={item.quantity}
                                  onChange={(e) => handleUpdateDestQuantity(item.item_id, e.target.value)}
                                  className="w-16 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-green-500"
                                />
                              </td>
                              <td className="px-3 py-2">
                                <button
                                  type="button"
                                  onClick={() => handleRemoveDestItem(item.item_id)}
                                  className="text-red-600 hover:text-red-700"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {selectedDestItems.length === 0 && (
                    <div className="text-center py-6 text-gray-500 bg-gray-50 rounded-lg border border-gray-200">
                      <Package className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                      <p className="text-xs">No destination items</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Form Fields - MOVED BELOW Item Selection */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
                {/* Issued By */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center">
                    Issued By *
                    <Tooltip text="Employee authorizing and sending the stock" />
                  </label>
                  <div className="relative">
                    <Users className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                    <input
                      type="text"
                      value={wtForm.issued_by}
                      onChange={(e) => setWtForm({ ...wtForm, issued_by: e.target.value })}
                      className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Employee name"
                      required
                    />
                  </div>
                </div>

                {/* Received By */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center">
                    Received By *
                    <Tooltip text="Employee receiving the stock at destination" />
                  </label>
                  <div className="relative">
                    <Users className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                    <input
                      type="text"
                      value={wtForm.received_by}
                      onChange={(e) => setWtForm({ ...wtForm, received_by: e.target.value })}
                      className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Employee name"
                      required
                    />
                  </div>
                </div>

                {/* Movement Date */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Movement Date *
                  </label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                    <input
                      type="date"
                      value={wtForm.movement_date}
                      onChange={(e) => setWtForm({ ...wtForm, movement_date: e.target.value })}
                      className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      required
                    />
                  </div>
                </div>

                {/* Notes */}
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Notes (Optional)
                  </label>
                  <textarea
                    value={wtForm.notes}
                    onChange={(e) => setWtForm({ ...wtForm, notes: e.target.value })}
                    rows="3"
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Additional details about the transfer..."
                  />
                </div>
              </div>

              <div className="flex justify-end mt-6">
                <button
                  type="submit"
                  disabled={loading || selectedSourceItems.length === 0 || selectedDestItems.length === 0}
                  className="px-6 py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {loading ? 'Processing...' : `Transfer ${selectedSourceItems.length} Item(s)`}
                </button>
              </div>
            </form>
          )}

          {/* Customer Sale Form */}
          {activeTab === 'customer_sale' && (
            <form onSubmit={handleCustomerSale} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Source Warehouse */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Source Warehouse *
                  </label>
                  <div className="relative">
                    <Building2 className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                    <select
                      value={csForm.source_warehouse}
                      onChange={(e) => setCsForm({ ...csForm, source_warehouse: e.target.value })}
                      className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      required
                    >
                      {warehouses.map(w => (
                        <option key={w} value={w}>{w}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Issued By */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Issued By *
                  </label>
                  <div className="relative">
                    <Users className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                    <input
                      type="text"
                      value={csForm.issued_by}
                      onChange={(e) => setCsForm({ ...csForm, issued_by: e.target.value })}
                      className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      placeholder="Sales rep name"
                      required
                    />
                  </div>
                </div>

                {/* Customer Name */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Customer Name
                  </label>
                  <input
                    type="text"
                    value={csForm.customer_name}
                    onChange={(e) => setCsForm({ ...csForm, customer_name: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    placeholder="Customer or company name"
                  />
                </div>

                {/* Movement Date */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Sale Date *
                  </label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                    <input
                      type="date"
                      value={csForm.movement_date}
                      onChange={(e) => setCsForm({ ...csForm, movement_date: e.target.value })}
                      className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      required
                    />
                  </div>
                </div>

                {/* Notes */}
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Notes (Optional)
                  </label>
                  <textarea
                    value={csForm.notes}
                    onChange={(e) => setCsForm({ ...csForm, notes: e.target.value })}
                    rows="3"
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    placeholder="Invoice number, delivery details, etc..."
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={loading}
                  className="px-6 py-2.5 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {loading ? 'Processing...' : 'Record Sale'}
                </button>
              </div>
            </form>
          )}

          {/* Stockout Form */}
          {activeTab === 'stockout' && (
            <form onSubmit={handleStockout} className="space-y-6">
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
                <div className="flex items-start space-x-3">
                  <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5" />
                  <div>
                    <h3 className="text-sm font-medium text-red-800">Write-off Notice</h3>
                    <p className="text-sm text-red-700 mt-1">
                      Detailed notes are required to explain the reason for write-off (damage, expiry, loss, theft, etc.)
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Source Warehouse */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Warehouse *
                  </label>
                  <div className="relative">
                    <Building2 className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                    <select
                      value={soForm.source_warehouse}
                      onChange={(e) => setSoForm({ ...soForm, source_warehouse: e.target.value })}
                      className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                      required
                    >
                      {warehouses.map(w => (
                        <option key={w} value={w}>{w}</option>
                      ))}
                    </select>
                  </div>
                </div>


                {/* Issued By */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Authorized By *
                  </label>
                  <div className="relative">
                    <Users className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                    <input
                      type="text"
                      value={soForm.issued_by}
                      onChange={(e) => setSoForm({ ...soForm, issued_by: e.target.value })}
                      className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                      placeholder="Manager name"
                      required
                    />
                  </div>
                </div>

                {/* Movement Date */}
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Write-off Date *
                  </label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                    <input
                      type="date"
                      value={soForm.movement_date}
                      onChange={(e) => setSoForm({ ...soForm, movement_date: e.target.value })}
                      className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                      required
                    />
                  </div>
                </div>

                {/* Notes - REQUIRED */}
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Reason for Write-off * (minimum 5 characters)
                  </label>
                  <textarea
                    value={soForm.notes}
                    onChange={(e) => setSoForm({ ...soForm, notes: e.target.value })}
                    rows="4"
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                    placeholder="Explain the reason: damaged during transport, expired, water damage, theft, etc..."
                    required
                    minLength={5}
                  />
                  <p className="text-sm text-gray-500 mt-1">
                    {soForm.notes.length}/5 minimum characters
                  </p>
                </div>
              </div>

              {/* Item Selection Section for Stockout */}
              <div className="border-t border-gray-200 pt-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-medium text-gray-900">Select Items to Write Off</h3>
                  <div className="flex items-center space-x-2">
                    <span className="text-sm text-gray-600">
                      {selectedItems.length} item(s) selected
                    </span>
                    {selectedItems.length > 0 && (
                      <button
                        type="button"
                        onClick={handleClearAll}
                        className="text-sm text-red-600 hover:text-red-700 font-medium"
                      >
                        Clear All
                      </button>
                    )}
                  </div>
                </div>

                {/* Search and Add Items */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Search and Add Items
                  </label>
                  <div className="flex space-x-2">
                    <div className="flex-1 relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                      <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => {
                          setSearchTerm(e.target.value);
                          setShowDropdown(e.target.value.length > 0);
                        }}
                        onFocus={() => setShowDropdown(searchTerm.length > 0)}
                        placeholder="Search items by name..."
                        className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                      />
                      
                      {/* Dropdown for search results */}
                      {showDropdown && getFilteredItems().length > 0 && (
                        <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                          {getFilteredItems().map(item => (
                            <button
                              key={item.item_id}
                              type="button"
                              onClick={() => handleAddItem(item)}
                              className="w-full px-4 py-2 text-left hover:bg-gray-50 flex items-center justify-between"
                            >
                              <span className="text-sm text-gray-900">{item.item_name}</span>
                              <span className="text-xs text-gray-500">Stock: {item.closing_balance}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    
                    <button
                      type="button"
                      onClick={handleSelectAll}
                      disabled={loadingItems || inventoryItems.length === 0}
                      className="px-4 py-2.5 bg-gray-100 text-gray-700 font-medium rounded-lg hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center space-x-2"
                    >
                      <CheckSquare className="w-4 h-4" />
                      <span>Select All</span>
                    </button>
                  </div>
                </div>

                {/* Selected Items Table */}
                {selectedItems.length > 0 && (
                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    <table className="w-full">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Item Name</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Available Stock</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Quantity</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {selectedItems.map(item => (
                          <tr key={item.item_id}>
                            <td className="px-4 py-3 text-sm text-gray-900">{item.item_name}</td>
                            <td className="px-4 py-3 text-sm text-gray-600">{item.stock}</td>
                            <td className="px-4 py-3">
                              <input
                                type="number"
                                min="1"
                                max={item.stock}
                                value={item.quantity}
                                onChange={(e) => handleUpdateItemQuantity(item.item_id, e.target.value)}
                                className="w-20 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-red-500"
                              />
                            </td>
                            <td className="px-4 py-3">
                              <button
                                type="button"
                                onClick={() => handleRemoveItem(item.item_id)}
                                className="text-red-600 hover:text-red-700"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {selectedItems.length === 0 && (
                  <div className="text-center py-8 text-gray-500">
                    <Package className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                    <p>No items selected. Search and add items above.</p>
                  </div>
                )}
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={loading || selectedItems.length === 0}
                  className="px-6 py-2.5 bg-red-600 text-white font-medium rounded-lg hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {loading ? 'Processing...' : `Write Off ${selectedItems.length} Item(s)`}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      {/* Movements History */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-900">Movement History</h2>
            <button
              onClick={handleExportCSV}
              className="flex items-center space-x-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
            >
              <Download className="w-4 h-4" />
              <span>Export CSV</span>
            </button>
          </div>

          {/* Search Bar */}
          <div className="mb-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                value={searchKeyword}
                onChange={(e) => {
                  setSearchKeyword(e.target.value);
                  setCurrentPage(1); // Reset to first page on search
                }}
                placeholder="Search by item name, warehouse, issued by..."
                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
          
          {/* Filters */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm text-gray-600 mb-1">Transfer Type</label>
              <select
                value={filters.transfer_type}
                onChange={(e) => {
                  setFilters({ ...filters, transfer_type: e.target.value });
                  setTimeout(loadMovements, 100);
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                <option value="">All Types</option>
                <option value="warehouse_transfer">Warehouse Transfer</option>
                <option value="customer_sale">Customer Sale</option>
                <option value="stockout">Stockout</option>
              </select>
            </div>

            <div>
              <label className="block text-sm text-gray-600 mb-1">Warehouse</label>
              <select
                value={filters.warehouse}
                onChange={(e) => {
                  setFilters({ ...filters, warehouse: e.target.value });
                  setTimeout(loadMovements, 100);
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                <option value="">All Warehouses</option>
                {warehouses.map(w => (
                  <option key={w} value={w}>{w}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm text-gray-600 mb-1">Start Date</label>
              <input
                type="date"
                value={filters.start_date}
                onChange={(e) => {
                  setFilters({ ...filters, start_date: e.target.value });
                  setTimeout(loadMovements, 100);
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-600 mb-1">End Date</label>
              <input
                type="date"
                value={filters.end_date}
                onChange={(e) => {
                  setFilters({ ...filters, end_date: e.target.value });
                  setTimeout(loadMovements, 100);
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>
          </div>
        </div>

        {/* Movements Table */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Item
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  From
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  To
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Quantity
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Issued By
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {(() => {
                // Filter movements by search keyword
                const filteredMovements = movements.filter(movement => {
                  if (!searchKeyword) return true;
                  const keyword = searchKeyword.toLowerCase();
                  return (
                    (movement.item_name_from?.toLowerCase() || '').includes(keyword) ||
                    (movement.item_name_to?.toLowerCase() || '').includes(keyword) ||
                    (movement.from_store?.toLowerCase() || '').includes(keyword) ||
                    (movement.to_store?.toLowerCase() || '').includes(keyword) ||
                    (movement.issued_by?.toLowerCase() || '').includes(keyword) ||
                    (movement.received_by?.toLowerCase() || '').includes(keyword)
                  );
                });
                
                // Paginate
                const startIndex = (currentPage - 1) * itemsPerPage;
                const endIndex = startIndex + itemsPerPage;
                const paginatedMovements = filteredMovements.slice(startIndex, endIndex);
                
                if (filteredMovements.length === 0) {
                  return (
                    <tr>
                      <td colSpan="8" className="px-6 py-12 text-center text-gray-500">
                        <Package className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                        <p>{searchKeyword ? 'No matching movements found' : 'No movements found'}</p>
                      </td>
                    </tr>
                  );
                }
                
                return paginatedMovements.map((movement, idx) => (
                  <tr key={idx} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center space-x-2 px-3 py-1 rounded-full text-xs font-medium border ${getTransferTypeColor(movement.transfer_type)}`}>
                        {getTransferTypeIcon(movement.transfer_type)}
                        <span>
                          {movement.transfer_type === 'warehouse_transfer' && 'Transfer'}
                          {movement.transfer_type === 'customer_sale' && 'Sale'}
                          {movement.transfer_type === 'stockout' && 'Write-off'}
                        </span>
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {movement.item_name_from || movement.item_name_to}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {movement.from_store}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {movement.to_store || <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {movement.quantity}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {movement.issued_by}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {movement.movement_date ? new Date(movement.movement_date).toLocaleDateString() : '—'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {movement.status === 'completed' ? (
                        <span className="inline-flex items-center space-x-1 text-green-600">
                          <CheckCircle className="w-4 h-4" />
                          <span className="text-xs font-medium">Completed</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center space-x-1 text-yellow-600">
                          <AlertTriangle className="w-4 h-4" />
                          <span className="text-xs font-medium">{movement.status}</span>
                        </span>
                      )}
                    </td>
                  </tr>
                ));
              })()}
            </tbody>
          </table>
        </div>
        
        {/* Pagination */}
        {(() => {
          const filteredMovements = movements.filter(movement => {
            if (!searchKeyword) return true;
            const keyword = searchKeyword.toLowerCase();
            return (
              (movement.item_name_from?.toLowerCase() || '').includes(keyword) ||
              (movement.item_name_to?.toLowerCase() || '').includes(keyword) ||
              (movement.from_store?.toLowerCase() || '').includes(keyword) ||
              (movement.to_store?.toLowerCase() || '').includes(keyword) ||
              (movement.issued_by?.toLowerCase() || '').includes(keyword) ||
              (movement.received_by?.toLowerCase() || '').includes(keyword)
            );
          });
          
          const totalPages = Math.ceil(filteredMovements.length / itemsPerPage);
          
          if (totalPages <= 1) return null;
          
          return (
            <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
              <div className="text-sm text-gray-600">
                Showing {Math.min((currentPage - 1) * itemsPerPage + 1, filteredMovements.length)} to {Math.min(currentPage * itemsPerPage, filteredMovements.length)} of {filteredMovements.length} results
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Previous
                </button>
                
                {[...Array(totalPages)].map((_, i) => {
                  const page = i + 1;
                  // Show first page, last page, current page, and pages around current
                  if (
                    page === 1 ||
                    page === totalPages ||
                    (page >= currentPage - 1 && page <= currentPage + 1)
                  ) {
                    return (
                      <button
                        key={page}
                        onClick={() => setCurrentPage(page)}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                          currentPage === page
                            ? 'bg-blue-600 text-white'
                            : 'border border-gray-300 text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        {page}
                      </button>
                    );
                  } else if (page === currentPage - 2 || page === currentPage + 2) {
                    return <span key={page} className="text-gray-400">...</span>;
                  }
                  return null;
                })}
                
                <button
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                  className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Next
                </button>
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
};

export default B2BStockMovement;
