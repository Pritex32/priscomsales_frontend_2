import React, { useState, useEffect } from 'react';
import { 
  ShoppingCart, 
  Package, 
  Plus, 
  Trash2, 
  Upload, 
  Search,
  Edit3,
  AlertCircle,
  CheckCircle,
  RefreshCw,
  Download,
  Calendar,
  Building,
  User,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import apiService from '../services/api';
import { toast } from 'react-toastify';
import Tooltip from '../components/Tooltip';

const Restock = () => {
  // State management
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('manage');
  // Pagination state - persist in localStorage
  const [restockPage, setRestockPage] = useState(() => {
    const saved = localStorage.getItem('restockPage');
    return saved ? parseInt(saved, 10) : 1;
  });
  const restockPageSize = 20;
  const [warehouses, setWarehouses] = useState([]);
  const [inventoryItems, setInventoryItems] = useState({});
  const [purchaseData, setPurchaseData] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);

  // Form states
   // Form states
  const [newItemForm, setNewItemForm] = useState({
    selected_items: [],
    supplier: '',
    purchase_date: new Date().toISOString().split('T')[0],
    payment_status: 'paid',
    payment_method: 'cash',
    warehouse_name: '',
    new_warehouse_name: '',
    access_choice: 'No',
    due_date: '',
    notes: '',
    total_price_paid: 0,
    invoice_file: null
  });

  const [restockForm, setRestockForm] = useState({
    supplier_name: '',
    supplier_phone: '',
    purchase_date: new Date().toISOString().split('T')[0],
    warehouse_name: '',
    selected_items: [],
    payment_status: 'paid',
    payment_method: 'cash',
    due_date: '',
    notes: '',
    total_price_paid: 0,
    invoice_file: null
  });

  const [priceUpdateForm, setPriceUpdateForm] = useState({
    warehouse_name: '',
    selected_items: []
  });

  // UI states
  const [showNewItemModal, setShowNewItemModal] = useState(false);
  const [showRestockModal, setShowRestockModal] = useState(false);
  const [showPriceUpdateModal, setShowPriceUpdateModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [apiStatus, setApiStatus] = useState('unknown');
  const [selectedWarehouseFilter, setSelectedWarehouseFilter] = useState('');
  
  // Restock item search/typeahead
  const [restockItemQuery, setRestockItemQuery] = useState('');
  const [showItemSuggestions, setShowItemSuggestions] = useState(false);
  
  // Export date range (Data tab)
  const [exportStartDate, setExportStartDate] = useState('');
  const [exportEndDate, setExportEndDate] = useState('');
  
  // Recent purchases date filters (Manage tab)
  const [recentStartDate, setRecentStartDate] = useState('');
  const [recentEndDate, setRecentEndDate] = useState('');
  
  // Reports date range
  const [reportStartDate, setReportStartDate] = useState('');
  const [reportEndDate, setReportEndDate] = useState('');
  
  // Update Prices typeahead
  const [priceUpdateQuery, setPriceUpdateQuery] = useState('');
  const [showPriceSuggestions, setShowPriceSuggestions] = useState(false);

  // Initialize component
  useEffect(() => {
    initializeComponent();
  }, []);

  // Refetch purchases when warehouse filter changes
  useEffect(() => {
    fetchPurchaseData();
  }, [selectedWarehouseFilter]);
  // Persist page number to localStorage
  useEffect(() => {
    localStorage.setItem('restockPage', restockPage.toString());
  }, [restockPage]);
  
  // Test API connection
  const testApiConnection = async () => {
    console.log('Testing API connection...');
    setApiStatus('testing');
    
    try {
      // Test basic API root endpoint
      const rootResponse = await apiService.get('/');
      console.log('Root endpoint response:', rootResponse.data);
      
      // Test if we can access protected endpoints
      try {
        const protectedResponse = await apiService.get('/users/me');
        console.log('Protected endpoint works:', protectedResponse.data);
        setApiStatus('connected');
        toast.success('API connection and authentication successful!');
      } catch (authError) {
        console.warn('Authentication issue:', authError.response?.status);
        if (authError.response?.status === 401) {
          setApiStatus('auth_failed');
          toast.error('Authentication failed. Please login again.');
        } else {
          setApiStatus('partial');
          toast.warning('API connected but authentication may be required');
        }
      }
      
    } catch (error) {
      console.error('API connection test failed:', error);
      setApiStatus('failed');
      
      if (error.code === 'ERR_NETWORK') {
        toast.error('Cannot connect to backend server. Make sure it\'s running on localhost:8000');
      } else {
        toast.error('API connection failed. Check console for details.');
      }
    }
  };

  const initializeComponent = async () => {
    try {
      setLoading(true);
      await Promise.all([
        fetchCurrentUser(),
        fetchWarehouses(),
        fetchPurchaseData()
      ]);
    } catch (error) {
      handleError('Failed to initialize component', error);
    } finally {
      setLoading(false);
    }
  };

  // API calls
  const fetchCurrentUser = async () => {
    try {
      const response = await apiService.get('/users/me');
      const user = response.data;
      setCurrentUser(user);
      
      // Store user info in localStorage for persistence
      if (user.user_id) localStorage.setItem('user_id', user.user_id);
      if (user.username) localStorage.setItem('username', user.username);
      
    } catch (error) {
      // Fallback to localStorage/JWT
      const token = localStorage.getItem('login_token');
      if (token) {
        try {
          const payload = JSON.parse(atob(token.split('.')[1]));
          setCurrentUser({
            user_id: payload.user_id || localStorage.getItem('user_id'),
            username: payload.username || localStorage.getItem('username'),
            role: payload.role
          });
        } catch (e) {
          console.warn('Could not decode user token:', e);
        }
      }
    }
  };

  const fetchWarehouses = async () => {
    try {
      console.log('Fetching warehouses...');
      
      // Try multiple endpoints to get warehouses
      let warehouseList = [];
      
      // Try primary restock endpoint
      try {
        const response = await apiService.get('/restock/warehouses');
        console.log('Restock warehouses response:', response.data);
        
        if (response.data) {
          if (Array.isArray(response.data)) {
            warehouseList = response.data;
          } else if (response.data.warehouses && Array.isArray(response.data.warehouses)) {
            warehouseList = response.data.warehouses;
          } else if (typeof response.data === 'object') {
            warehouseList = Object.values(response.data);
          }
        }
      } catch (restockError) {
        console.warn('Restock warehouses failed:', restockError.message);
        
        // Try alternative sales endpoint
        try {
          const salesResponse = await apiService.get('/sales/warehouses');
          console.log('Sales warehouses response:', salesResponse.data);
          
          if (salesResponse.data) {
            if (Array.isArray(salesResponse.data)) {
              warehouseList = salesResponse.data.map(w => ({
                warehouse_name: typeof w === 'string' ? w : w.warehouse_name || w.name
              }));
            } else if (typeof salesResponse.data === 'object') {
              warehouseList = Object.values(salesResponse.data).map(w => ({
                warehouse_name: typeof w === 'string' ? w : w.warehouse_name || w.name
              }));
            }
          }
        } catch (salesError) {
          console.warn('Sales warehouses failed:', salesError.message);
          
          // Try generic warehouse endpoint
          try {
            const genericResponse = await apiService.get('/warehouses');
            console.log('Generic warehouses response:', genericResponse.data);
            
            if (genericResponse.data) {
              if (Array.isArray(genericResponse.data)) {
                warehouseList = genericResponse.data.map(w => ({
                  warehouse_name: typeof w === 'string' ? w : w.warehouse_name || w.name
                }));
              }
            }
          } catch (genericError) {
            console.warn('All warehouse endpoints failed');
          }
        }
      }
      
      setWarehouses(warehouseList);
      console.log('Set warehouses:', warehouseList);
    } catch (error) {
      console.error('Warehouses fetch error:', error);
      handleError('Failed to fetch warehouses', error);
      setWarehouses([]);
    }
  };

  const fetchInventoryItems = async (warehouseName) => {
    if (!warehouseName) return;
    
    try {
      console.log('Fetching inventory items for warehouse:', warehouseName);
      const response = await apiService.get(`/restock/inventory-items`, { params: { warehouse_name: warehouseName } });
      console.log('Inventory items response:', response.data);
      
      let items = {};
      if (response.data && typeof response.data === 'object') {
        // Backend returns a mapping of item_name -> { item_id, price }
        items = response.data;
      }
      
      setInventoryItems(items);
      console.log('Set inventory items:', items);
    } catch (error) {
      console.error('Inventory items fetch error:', error);
      handleError(`Failed to fetch inventory items for ${warehouseName}`, error);
      setInventoryItems({});
    }
  };

  const fetchPurchaseData = async () => {
    try {
      console.log('Fetching purchase data...');
      
      const [logRes, histRes] = await Promise.all([
        apiService.get('/restock/', { params: { skip: 0, limit: 50, warehouse_name: selectedWarehouseFilter || undefined } }),
        apiService.get('/restock/history', { params: { skip: 0, limit: 100, warehouse_name: selectedWarehouseFilter || undefined } })
      ]);
      
      const logData = Array.isArray(logRes.data) ? logRes.data : [];
      const histData = Array.isArray(histRes.data) ? histRes.data : [];
      const combined = [...logData, ...histData];
      
      setPurchaseData(combined);
      console.log('Set purchase data:', combined);
    } catch (error) {
      console.error('Purchase data fetch error:', error);
      handleError('Failed to fetch purchase data', error);
      setPurchaseData([]);
    }
  };

  // Form handlers
 const handleNewItemSubmit = async (e) => {
    e.preventDefault();

    if (!validateNewItemForm()) return;

    setSubmitting(true);
try {
      // Map payment method to backend expected values
      const paymentMethodMap = { check: 'cheque', cheque: 'cheque', cash: 'cash', transfer: 'transfer', card: 'card' };
      const payment_method = paymentMethodMap[(newItemForm.payment_method || '').toLowerCase()] || 'cash';

      // Upload invoice file if present (shared for all items)
      let invoice_file_url = null;
      if (newItemForm.invoice_file) {
        const uploadData = new FormData();
        uploadData.append('invoice_file', newItemForm.invoice_file);
        uploadData.append('desired_name', 'bulk_items_invoice');
        const uploadRes = await apiService.post('/restock/upload-invoice', uploadData, { headers: { 'Content-Type': 'multipart/form-data' } });
        invoice_file_url = uploadRes.data?.invoice_file_url || null;
      }

      // Calculate total cost for all items
      const totalCostAllItems = newItemForm.selected_items.reduce((sum, item) => {
        return sum + (Number(item.quantity || 0) * Number(item.unit_price || 0));
      }, 0);

      // Determine total_price_paid based on payment_status
      let finalTotalPricePaid = null;
      if (newItemForm.payment_status === 'paid') {
        finalTotalPricePaid = totalCostAllItems;
      } else if (newItemForm.payment_status === 'partial') {
        finalTotalPricePaid = Number(newItemForm.total_price_paid || 0);
      } else {
        // credit
        finalTotalPricePaid = 0;
      }

      // Build items array - MUST match NewItemRequest model exactly
      const items = newItemForm.selected_items.map(item => {
        const itemPayload = {
          // REQUIRED fields
          item_name: item.item_name,
          supplied_quantity: Number(item.quantity || 0),
          reorder_level: Number(item.reorder_level || 0),
          unit_price: Number(item.unit_price || 0),
          purchase_date: newItemForm.purchase_date,
          payment_status: newItemForm.payment_status,
          payment_method,
          
          // OPTIONAL fields
          barcode: item.barcode || null,
          supplier_name: newItemForm.supplier || null,
          description: null,
          due_date: newItemForm.due_date || null,
          notes: newItemForm.notes || null,
          warehouse_name: newItemForm.warehouse_name || null,
          new_warehouse_name: newItemForm.new_warehouse_name || null,
          access_choice: newItemForm.access_choice || 'No',
          total_price_paid: finalTotalPricePaid,
          invoice_file_url,
          employee_id: currentUser?.user_id || currentUser?.id || null,
          employee_name: currentUser?.username || null
        };
        
        console.log('Built item payload:', JSON.stringify(itemPayload, null, 2));
        return itemPayload;
      });

      const payload = { items };

      console.log('='.repeat(80));
      console.log('FRONTEND - NEW ITEM SUBMISSION DEBUG');
      console.log('='.repeat(80));
      console.log('FORM STATE:');
      console.log('  Supplier:', newItemForm.supplier);
      console.log('  Purchase Date:', newItemForm.purchase_date);
      console.log('  Payment Status:', newItemForm.payment_status);
      console.log('  Payment Method:', newItemForm.payment_method);
      console.log('  Warehouse Name:', newItemForm.warehouse_name);
      console.log('  New Warehouse Name:', newItemForm.new_warehouse_name);
      console.log('  Access Choice:', newItemForm.access_choice);
      console.log('  Due Date:', newItemForm.due_date);
      console.log('  Notes:', newItemForm.notes);
      console.log('  Form total_price_paid:', newItemForm.total_price_paid);
      console.log('  Invoice File:', newItemForm.invoice_file?.name);
      console.log('-'.repeat(80));
      console.log('SELECTED ITEMS (from form):');
      newItemForm.selected_items.forEach((item, idx) => {
        console.log(`  Form Item ${idx + 1}:`, {
          item_name: item.item_name,
          barcode: item.barcode,
          quantity: item.quantity,
          unit_price: item.unit_price,
          reorder_level: item.reorder_level
        });
      });
      console.log('-'.repeat(80));
      console.log('CALCULATED VALUES:');
      console.log('  Total Cost All Items:', totalCostAllItems);
      console.log('  Final Total Price Paid:', finalTotalPricePaid);
      console.log('-'.repeat(80));
      console.log('ITEMS ARRAY BEING SENT:');
      items.forEach((item, idx) => {
        console.log(`  Payload Item ${idx + 1}:`, JSON.stringify(item, null, 2));
      });
      console.log('-'.repeat(80));
      console.log('FULL PAYLOAD:');
      console.log(JSON.stringify(payload, null, 2));
      console.log('='.repeat(80));
      console.log('SENDING REQUEST TO: /restock/new-item');
      console.log('='.repeat(80));

      const response = await apiService.post('/restock/new-item', payload);

      console.log('='.repeat(80));
      console.log('RESPONSE RECEIVED:');
      console.log('  Status:', response.status);
      console.log('  Data:', JSON.stringify(response.data, null, 2));
      console.log('='.repeat(80));

      toast.success(`${items.length} item(s) added successfully!`);
      toast.info('Refreshing data...');
      setShowNewItemModal(false);
      resetNewItemForm();
      await fetchWarehouses();
      await fetchPurchaseData();

    } catch (error) {
      console.log('='.repeat(80));
      console.log('ERROR CAUGHT IN NEW ITEM SUBMISSION');
      console.log('='.repeat(80));
      console.log('Error Object:', error);
      console.log('Error Message:', error.message);
      console.log('Error Response:', error.response);
      if (error.response) {
        console.log('Response Status:', error.response.status);
        console.log('Response Status Text:', error.response.statusText);
        console.log('Response Headers:', error.response.headers);
        console.log('Response Data:', JSON.stringify(error.response.data, null, 2));
        if (error.response.data?.detail) {
          console.log('Error Detail:', error.response.data.detail);
          if (Array.isArray(error.response.data.detail)) {
            console.log('Validation Errors:');
            error.response.data.detail.forEach((err, idx) => {
              console.log(`  Error ${idx + 1}:`, {
                loc: err.loc,
                msg: err.msg,
                type: err.type,
                input: err.input
              });
            });
          }
        }
      }
      console.log('='.repeat(80));
      handleError('Failed to add items', error);
    } finally {
      setSubmitting(false);
    }
  };
  const handleRestockSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateRestockForm()) return;
    
    setSubmitting(true);
    
    try {
      // Map payment method to backend expected values
      const paymentMethodMap = { check: 'cheque', cheque: 'cheque', cash: 'cash', transfer: 'transfer', card: 'card' };
      const payment_method = paymentMethodMap[(restockForm.payment_method || '').toLowerCase()] || 'cash';
      
      // Calculate grand total from selected items
      const calculatedGrandTotal = calculateTotal(restockForm.selected_items);
      
      // Determine total_price_paid based on payment_status
      let total_price_paid = 0;
      if (restockForm.payment_status === 'paid') {
        total_price_paid = calculatedGrandTotal;
      } else if (restockForm.payment_status === 'partial') {
        total_price_paid = Number(restockForm.total_price_paid || 0);
      } else {
        // credit
        total_price_paid = 0;
      }
      
      // Validation: Ensure total_price_paid is correct
      console.log('=== PAYMENT CALCULATION DEBUG ===');
      console.log('Payment Status:', restockForm.payment_status);
      console.log('Selected Items:', restockForm.selected_items);
      console.log('Calculated Grand Total:', calculatedGrandTotal);
      console.log('Total Price Paid (final):', total_price_paid);
      console.log('Form total_price_paid field:', restockForm.total_price_paid);
      console.log('================================');
      
      // Upload invoice file if present
      let invoice_file_url = null;
      if (restockForm.invoice_file) {
        const uploadData = new FormData();
        uploadData.append('invoice_file', restockForm.invoice_file);
        uploadData.append('desired_name', `restock_${restockForm.supplier_name || 'invoice'}`);
        const uploadRes = await apiService.post('/restock/upload-invoice', uploadData, { headers: { 'Content-Type': 'multipart/form-data' } });
        invoice_file_url = uploadRes.data?.invoice_file_url || null;
      }
      
      // Build items array with proper fields
      const itemsPayload = restockForm.selected_items.map(it => {
        const inv = inventoryItems[it.item_name] || {};
        return {
          item_id: inv.item_id || null,
          item_name: it.item_name,
          quantity: Number(it.quantity || 0),
          unit_price: Number(it.unit_price || 0),
          warehouse_name: restockForm.warehouse_name
        };
      });
      
      const payload = {
        supplier_name: restockForm.supplier_name,
        supplier_phone: restockForm.supplier_phone || null,
        purchase_date: restockForm.purchase_date,
        warehouse_name: restockForm.warehouse_name,
        payment_status: restockForm.payment_status,
        payment_method,
        due_date: restockForm.due_date || null,
        notes: restockForm.notes || null,
        items: itemsPayload,
        total_price_paid: total_price_paid,
        invoice_file_url,
        employee_id: currentUser?.user_id || currentUser?.id || null,
        employee_name: currentUser?.username || null
      };
      
      console.log('=== RESTOCK BATCH SUBMISSION DEBUG ===');
      console.log('Warehouse:', restockForm.warehouse_name);
      console.log('Payment Status:', restockForm.payment_status);
      console.log('Selected Items for Calculation:', restockForm.selected_items);
      console.log('Grand Total Calculated:', calculatedGrandTotal);
      console.log('Total Price Paid (final):', total_price_paid);
      console.log('Form total_price_paid field:', restockForm.total_price_paid);
      console.log('Inventory Items Available:', Object.keys(inventoryItems).length);
      console.log('Selected Items Count:', restockForm.selected_items.length);
      console.log('Full Payload:', JSON.stringify(payload, null, 2));
      console.log('Items Detail:');
      payload.items.forEach((item, idx) => {
        console.log(`  Item ${idx + 1}:`, {
          item_id: item.item_id,
          item_name: item.item_name,
          quantity: item.quantity,
          unit_price: item.unit_price,
          warehouse_name: item.warehouse_name,
          inventory_lookup: inventoryItems[item.item_name]
        });
      });
      console.log('=====================================');
      console.log('-'.repeat(80));
      console.log('INVENTORY LOOKUP:');
      console.log('  Available Items Count:', Object.keys(inventoryItems).length);
      console.log('  Sample Items:', Object.keys(inventoryItems).slice(0, 5));
      console.log('-'.repeat(80));
      console.log('CALCULATED VALUES:');
      console.log('  Grand Total Calculated:', calculatedGrandTotal);
      console.log('  Total Price Paid (final):', total_price_paid);
      console.log('  Outstanding:', calculatedGrandTotal - total_price_paid);
      console.log('-'.repeat(80));
      console.log('PAYLOAD BEING SENT:');
      console.log('  Payload Type:', typeof payload);
      console.log('  Payload Keys:', Object.keys(payload));
      console.log('  Full Payload (stringified):', JSON.stringify(payload, null, 2));
      console.log('-'.repeat(80));
      console.log('ITEMS IN PAYLOAD:');
      payload.items.forEach((item, idx) => {
        console.log(`  Payload Item ${idx + 1}:`, {
          item_id: item.item_id,
          item_name: item.item_name,
          quantity: item.quantity,
          unit_price: item.unit_price,
          warehouse_name: item.warehouse_name,
          inventory_lookup: inventoryItems[item.item_name]
        });
      });
      console.log('='.repeat(80));
      console.log('SENDING REQUEST TO: /restock/batch');
      console.log('='.repeat(80));
      
      const response = await apiService.post('/restock/batch', payload);
      
      console.log('='.repeat(80));
      console.log('RESPONSE RECEIVED:');
      console.log('  Status:', response.status);
      console.log('  Data:', JSON.stringify(response.data, null, 2));
      console.log('='.repeat(80));
      
      
      await apiService.post('/restock/batch', payload);
      
      toast.success('Restock completed successfully!');
      toast.info('Refreshing purchases...');
      setShowRestockModal(false);
      resetRestockForm();
      await fetchPurchaseData();
      
    } catch (error) {
      handleError('Failed to process restock', error);
    } finally {
      setSubmitting(false);
    }
  };

  const handlePriceUpdate = async () => {
    if (!validatePriceUpdateForm()) return;
    
    setSubmitting(true);
    
    try {
      // Build updates payload using item_id from inventoryItems
      const updates = priceUpdateForm.selected_items.map(item => {
        const inv = inventoryItems[item.item_name] || {};
        return {
          item_id: inv.item_id,
          new_price: Number(item.new_price || 0),
          new_barcode: (item.new_barcode || '').trim() || undefined
        };
      }).filter(u => u.item_id);
      
      await apiService.post('/restock/price-bulk-update', {
        warehouse_name: priceUpdateForm.warehouse_name || null,
        updates
      });
      
      toast.success('Prices updated successfully!');
      toast.info('Refreshing inventory...');
      setShowPriceUpdateModal(false);
      resetPriceUpdateForm();
      
      if (priceUpdateForm.warehouse_name) {
        await fetchInventoryItems(priceUpdateForm.warehouse_name);
      }
      
    } catch (error) {
      handleError('Failed to update prices', error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeletePurchase = async (purchase) => {
    if (!purchase?.purchase_id || !purchase?.purchase_date) {
      toast.error('Missing purchase details');
      return;
    }
    const confirmed = window.confirm('Delete this restock record? This will update inventory and remove related payments.');
    if (!confirmed) return;
    try {
      const dateOnly = (purchase.purchase_date || '').toString().split('T')[0];
      await apiService.delete('/restock/delete-by-id-date', {
        params: {
          purchase_id: purchase.purchase_id,
          purchase_date: dateOnly
        }
      });
      toast.success('Purchase deleted successfully');
      toast.info('Refreshing purchases...');
      await fetchPurchaseData();
    } catch (error) {
      handleError('Failed to delete purchase', error);
    }
  };

  // Validation functions
  const validateNewItemForm = () => {
    const errors = [];

    if (!newItemForm.selected_items.length) {
      errors.push('Please add at least one item');
    }

    for (let i = 0; i < newItemForm.selected_items.length; i++) {
      const item = newItemForm.selected_items[i];
      if (!item.item_name.trim()) {
        errors.push(`Item ${i + 1}: Item name is required`);
      }
      if (item.quantity < 0) {
        errors.push(`Item ${i + 1}: Quantity cannot be negative`);
      }
      if (item.unit_price < 0) {
        errors.push(`Item ${i + 1}: Unit price cannot be negative`);
      }
      if (item.reorder_level < 0) {
        errors.push(`Item ${i + 1}: Reorder level cannot be negative`);
      }
    }

    if (!newItemForm.warehouse_name && !newItemForm.new_warehouse_name) {
      errors.push('Please select a warehouse or create a new one');
    }
    if (newItemForm.payment_status !== 'paid' && !newItemForm.due_date) {
      errors.push('Due date is required for credit and partial payments');
    }

    if (errors.length > 0) {
      toast.error(errors.join('\n'));
      return false;
    }

    return true;
  };

  const validateRestockForm = () => {
    const errors = [];
    
    if (!restockForm.supplier_name.trim()) {
      errors.push('Supplier name is required');
    }
    if (!restockForm.warehouse_name) {
      errors.push('Please select a warehouse');
    }
    if (!restockForm.selected_items.length) {
      errors.push('Please select at least one item to restock');
    }
    if (restockForm.selected_items.some(item => item.quantity <= 0)) {
      errors.push('All quantities must be greater than 0');
    }
    if (restockForm.payment_status !== 'paid' && !restockForm.due_date) {
      errors.push('Due date is required for credit and partial payments');
    }
    
    if (errors.length > 0) {
      toast.error(errors.join('\n'));
      return false;
    }
    
    return true;
  };

  const validatePriceUpdateForm = () => {
    const errors = [];
    
    console.log('=== PRICE UPDATE VALIDATION DEBUG ===');
    console.log('Warehouse Name:', priceUpdateForm.warehouse_name);
    console.log('Selected Items:', priceUpdateForm.selected_items);
    console.log('Selected Items Count:', priceUpdateForm.selected_items.length);
    
    if (!priceUpdateForm.warehouse_name) {
      errors.push('Please select a warehouse');
      console.error('Validation Error: No warehouse selected');
    }
    if (!priceUpdateForm.selected_items.length) {
      errors.push('Please select at least one item to update');
      console.error('Validation Error: No items selected');
    }
    if (priceUpdateForm.selected_items.some(item => item.new_price < 0)) {
      errors.push('Prices cannot be negative');
      console.error('Validation Error: Negative prices detected');
      console.error('Items with negative prices:', priceUpdateForm.selected_items.filter(item => item.new_price < 0));
    }
    
    if (errors.length > 0) {
      console.error('=== VALIDATION FAILED ===');
      console.error('All Errors:', errors);
      console.error('Form State:', JSON.stringify(priceUpdateForm, null, 2));
      console.error('=====================================');
      toast.error(errors.join('\n'));
      return false;
    }
    
    console.log('=== VALIDATION PASSED ===');
    console.log('=====================================');
    return true;
  };

  // Utility functions
  const handleError = (message, error) => {
    console.error(message, error);
    
    // Extract meaningful error message
    let errorMessage = message;
    
    if (error?.response?.data) {
      if (typeof error.response.data === 'string') {
        errorMessage = error.response.data;
      } else if (error.response.data.message) {
        errorMessage = error.response.data.message;
      } else if (error.response.data.details) {
        if (Array.isArray(error.response.data.details)) {
          errorMessage = error.response.data.details.join(', ');
        } else if (typeof error.response.data.details === 'string') {
          errorMessage = error.response.data.details;
        }
      } else if (error.response.data.error) {
        errorMessage = error.response.data.error;
      }
    } else if (error?.message) {
      errorMessage = error.message;
    }
    
    toast.error(errorMessage);
  };

  const resetNewItemForm = () => {
    setNewItemForm({
      selected_items: [],
      supplier: '',
      purchase_date: new Date().toISOString().split('T')[0],
      payment_status: 'paid',
      payment_method: 'cash',
      warehouse_name: '',
      new_warehouse_name: '',
      access_choice: 'No',
      due_date: '',
      notes: '',
      total_price_paid: 0,
      invoice_file: null
    });
  };

  const resetRestockForm = () => {
    setRestockForm({
      supplier_name: '',
      supplier_phone: '',
      purchase_date: new Date().toISOString().split('T')[0],
      warehouse_name: '',
      selected_items: [],
      payment_status: 'paid',
      payment_method: 'cash',
      due_date: '',
      notes: '',
      total_price_paid: 0,
      invoice_file: null
    });
  };

  const resetPriceUpdateForm = () => {
    setPriceUpdateForm({
      warehouse_name: '',
      selected_items: []
    });
  };

  const calculateTotal = (items) => {
    return items.reduce((total, item) => total + (item.quantity * item.unit_price), 0);
  };

  const formatCurrency = (amount) => {
    return `₦${Number(amount || 0).toLocaleString('en-NG', { minimumFractionDigits: 2 })}`;
  };

  const parseDate = (d) => {
    try {
      // If the date string doesn't include time, add T00:00:00 to avoid timezone issues
      const dateStr = d && !d.includes('T') ? d + 'T00:00:00' : d;
      const dt = new Date(dateStr);
      return isNaN(dt.getTime()) ? null : dt;
    } catch {
      return null;
    }
  };

  // Normalize warehouse object/string to name
  const getWarehouseName = (w) => {
    if (typeof w === 'string') return w;
    if (!w) return '';
    return w.warehouse_name || w.name || w.value || '';
  };

  // Event handlers
  const handleWarehouseChange = (value, formType) => {
    if (formType === 'restock') {
      setRestockForm(prev => ({ ...prev, warehouse_name: value, selected_items: [] }));
      if (value) {
        fetchInventoryItems(value);
      }
    } else if (formType === 'priceUpdate') {
      setPriceUpdateForm(prev => ({ ...prev, warehouse_name: value, selected_items: [] }));
      if (value) {
        fetchInventoryItems(value);
      }
    }
  };

  const handleItemSelection = (itemName, formType) => {
    const itemData = inventoryItems[itemName];
    if (!itemData) return;

    if (formType === 'restock') {
      setRestockForm(prev => {
        const exists = prev.selected_items.find(item => item.item_name === itemName);
        if (exists) {
          return {
            ...prev,
            selected_items: prev.selected_items.filter(item => item.item_name !== itemName)
          };
        } else {
          const newItem = {
            item_name: itemName,
            quantity: 1,
            unit_price: itemData.price || 0
          };
          return {
            ...prev,
            selected_items: [...prev.selected_items, newItem]
          };
        }
      });
    } else if (formType === 'priceUpdate') {
      setPriceUpdateForm(prev => {
        const exists = prev.selected_items.find(item => item.item_name === itemName);
        if (exists) {
          return {
            ...prev,
            selected_items: prev.selected_items.filter(item => item.item_name !== itemName)
          };
        } else {
          const newItem = {
            item_name: itemName,
            current_price: itemData.price || 0,
            new_price: itemData.price || 0,
            new_barcode: ''
          };
          return {
            ...prev,
            selected_items: [...prev.selected_items, newItem]
          };
        }
      });
    }
  };

  const updateSelectedItem = (itemName, field, value, formType) => {
    if (formType === 'restock') {
      setRestockForm(prev => ({
        ...prev,
        selected_items: prev.selected_items.map(item =>
          item.item_name === itemName ? { ...item, [field]: value } : item
        )
      }));
    } else if (formType === 'priceUpdate') {
      setPriceUpdateForm(prev => ({
        ...prev,
        selected_items: prev.selected_items.map(item =>
          item.item_name === itemName ? { ...item, [field]: value } : item
        )
      }));
    }
  };
  const updateNewItem = (index, field, value) => {
    setNewItemForm(prev => ({
      ...prev,
      selected_items: prev.selected_items.map((item, i) =>
        i === index ? { ...item, [field]: value } : item
      )
    }));
  };

  const addNewItemToList = () => {
    const newItem = {
      item_name: '',
      barcode: '',
      quantity: 1,
      unit_price: 0.0,
      reorder_level: 0
    };
    setNewItemForm(prev => ({
      ...prev,
      selected_items: [newItem, ...prev.selected_items]
    }));
  };

  const removeNewItemFromList = (index) => {
    setNewItemForm(prev => ({
      ...prev,
      selected_items: prev.selected_items.filter((_, i) => i !== index)
    }));
  };


  // Calculate totals for restock form
  const grandTotal = calculateTotal(restockForm.selected_items);
  const totalPaid = restockForm.payment_status === 'paid' ? grandTotal : 
                   restockForm.payment_status === 'partial' ? Number(restockForm.total_price_paid || 0) : 0;
  const outstanding = Math.max(grandTotal - totalPaid, 0);

  // Calculate totals for new item form (for partial/credit info)
  const newItemTotalCost = Number(newItemForm.quantity || 0) * Number(newItemForm.unit_price || 0);
  const newItemPaid = newItemForm.payment_status === 'partial' ? Number(newItemForm.total_price_paid || 0) : (newItemForm.payment_status === 'paid' ? newItemTotalCost : 0);
  const newItemOutstanding = Math.max(newItemTotalCost - newItemPaid, 0);

  // Suggestions for restock items
  const restockSuggestions = Object.keys(inventoryItems)
    .filter(name => name.toLowerCase().includes(restockItemQuery.toLowerCase()) && !restockForm.selected_items.find(si => si.item_name === name))
    .slice(0, 10);

  // Pagination for restock list
  const paginatedPurchaseData = React.useMemo(() => {
    const filtered = purchaseData.filter(item => {
      const matchesSearch = !searchTerm ||
        item.item_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.supplier_name?.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesWarehouse = !selectedWarehouseFilter ||
        item.warehouse_name === selectedWarehouseFilter ||
        item.warehouse === selectedWarehouseFilter;
      
      // Date range filter for recent section
      const d = parseDate(item.purchase_date);
      const sd = recentStartDate ? parseDate(recentStartDate) : null;
      const ed = recentEndDate ? parseDate(recentEndDate) : null;
      const matchesDate = (!sd || (d && d >= sd)) && (!ed || (d && d <= ed));

      return matchesSearch && matchesWarehouse && matchesDate;
    });
    
    // Sort by date descending
    const sorted = filtered.slice().sort((a,b) => {
      const da = parseDate(a.purchase_date);
      const db = parseDate(b.purchase_date);
      return (db?.getTime()||0) - (da?.getTime()||0);
    });
    
    // Paginate
    const start = (restockPage - 1) * restockPageSize;
    return sorted.slice(start, start + restockPageSize);
  }, [purchaseData, searchTerm, selectedWarehouseFilter, recentStartDate, recentEndDate, restockPage]);
  
  const totalRestockPages = React.useMemo(() => {
    const filtered = purchaseData.filter(item => {
      const matchesSearch = !searchTerm ||
        item.item_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.supplier_name?.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesWarehouse = !selectedWarehouseFilter ||
        item.warehouse_name === selectedWarehouseFilter ||
        item.warehouse === selectedWarehouseFilter;
      
      const d = parseDate(item.purchase_date);
      const sd = recentStartDate ? parseDate(recentStartDate) : null;
      const ed = recentEndDate ? parseDate(recentEndDate) : null;
      const matchesDate = (!sd || (d && d >= sd)) && (!ed || (d && d <= ed));

      return matchesSearch && matchesWarehouse && matchesDate;
    });
    return Math.ceil(filtered.length / restockPageSize);
  }, [purchaseData, searchTerm, selectedWarehouseFilter, recentStartDate, recentEndDate]);


  // Filter functions
  const filteredPurchaseData = purchaseData.filter(item => {
    const matchesSearch = !searchTerm || 
      item.item_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.supplier_name?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesWarehouse = !selectedWarehouseFilter || 
      item.warehouse_name === selectedWarehouseFilter ||
      item.warehouse === selectedWarehouseFilter;
    
    // Date range filter for recent section
    const d = parseDate(item.purchase_date);
    const sd = recentStartDate ? parseDate(recentStartDate) : null;
    const ed = recentEndDate ? parseDate(recentEndDate) : null;
    const matchesDate = (!sd || (d && d >= sd)) && (!ed || (d && d <= ed));

    return matchesSearch && matchesWarehouse && matchesDate;
  });

  const filteredInventoryItems = Object.keys(inventoryItems).filter(itemName =>
    itemName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center">
            <ShoppingCart className="mr-3 h-8 w-8 text-blue-500" />
            Restock Management
          </h1>
          {currentUser && (
            <p className="text-gray-600 mt-2">
              Welcome, {currentUser.username} | Role: {currentUser.role?.toUpperCase()}
            </p>
          )}
        </div>
        <div className="flex space-x-2">
          <button
            onClick={() => {
              setLoading(true);
              initializeComponent();
            }}
            className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </button>
          
          <button
            onClick={testApiConnection}
            disabled={apiStatus === 'testing'}
            className={`px-4 py-2 rounded-lg flex items-center ${
              apiStatus === 'connected' ? 'bg-green-500 hover:bg-green-600' :
              apiStatus === 'partial' ? 'bg-yellow-500 hover:bg-yellow-600' :
              apiStatus === 'auth_failed' ? 'bg-orange-500 hover:bg-orange-600' :
              apiStatus === 'failed' ? 'bg-red-500 hover:bg-red-600' :
              'bg-gray-500 hover:bg-gray-600'
            } text-white disabled:opacity-50`}
          >
            <AlertCircle className="w-4 h-4 mr-2" />
            {apiStatus === 'testing' ? 'Testing...' : 
             apiStatus === 'connected' ? 'API OK' :
             apiStatus === 'partial' ? 'API Partial' :
             apiStatus === 'auth_failed' ? 'Auth Failed' :
             apiStatus === 'failed' ? 'API Failed' :
             'Test API'}
          </button>
        </div>
      </div>
      
      {/* Removed Debug Panel */}
      {false && (
        <div className="bg-gray-100 border border-gray-300 rounded-lg p-4 mb-6">
          <h3 className="font-semibold text-gray-800 mb-3">🔧 Debug Information</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div className="bg-white p-3 rounded border">
              <h4 className="font-medium text-gray-700 mb-2">Data Status</h4>
              <p>Warehouses: <span className="font-mono">{warehouses.length}</span></p>
              <p>Purchase Data: <span className="font-mono">{purchaseData.length}</span></p>
              <p>Inventory Items: <span className="font-mono">{Object.keys(inventoryItems).length}</span></p>
              <p>Current User: <span className="font-mono">{currentUser ? '✅' : '❌'}</span></p>
            </div>
            
            <div className="bg-white p-3 rounded border">
              <h4 className="font-medium text-gray-700 mb-2">API Status</h4>
              <p>Connection: <span className={`font-mono ${
                apiStatus === 'connected' ? 'text-green-600' :
                apiStatus === 'partial' ? 'text-yellow-600' :
                apiStatus === 'auth_failed' ? 'text-orange-600' :
                apiStatus === 'failed' ? 'text-red-600' : 'text-gray-600'
              }`}>{apiStatus.toUpperCase().replace('_', ' ')}</span></p>
              <p>Base URL: <span className="font-mono text-xs">localhost:8000</span></p>
              <p>Token: <span className="font-mono">{localStorage.getItem('login_token') ? '✅' : '❌'}</span></p>
            </div>
            
            <div className="bg-white p-3 rounded border">
              <h4 className="font-medium text-gray-700 mb-2">Actions</h4>
              <div className="space-y-1">
                <button 
                  onClick={() => console.log('Current state:', { warehouses, purchaseData, inventoryItems, currentUser })}
                  className="block w-full text-left px-2 py-1 bg-blue-50 hover:bg-blue-100 rounded text-xs"
                >
                  Log State to Console
                </button>
                <button 
                  onClick={() => {
                    setWarehouses([]);
                    setPurchaseData([]);
                    setInventoryItems({});
                    setCurrentUser(null);
                  }}
                  className="block w-full text-left px-2 py-1 bg-red-50 hover:bg-red-100 rounded text-xs"
                >
                  Clear All Data
                </button>
                <button 
                  onClick={() => {
                    // Add comprehensive sample data for testing
                    const sampleWarehouses = [
                      { warehouse_name: 'Main Store' }, 
                      { warehouse_name: 'Storage A' },
                      { warehouse_name: 'Storage B' }
                    ];
                    
                    const samplePurchases = [
                      {
                        item_name: 'Sample Item 1',
                        supplier_name: 'ABC Suppliers',
                        supplied_quantity: 50,
                        unit_price: 25.00,
                        total_price_paid: 1250,
                        purchase_date: new Date().toISOString(),
                        payment_status: 'paid',
                        warehouse_name: 'Main Store'
                      },
                      {
                        item_name: 'Sample Item 2',
                        supplier_name: 'XYZ Traders',
                        supplied_quantity: 30,
                        unit_price: 15.50,
                        total_price_paid: 465,
                        purchase_date: new Date(Date.now() - 86400000).toISOString(),
                        payment_status: 'partial',
                        warehouse_name: 'Storage A'
                      },
                      {
                        item_name: 'Sample Item 3',
                        supplier_name: 'DEF Distributors',
                        supplied_quantity: 25,
                        unit_price: 40.00,
                        total_price_paid: 1000,
                        purchase_date: new Date(Date.now() - 172800000).toISOString(),
                        payment_status: 'credit',
                        warehouse_name: 'Storage B'
                      }
                    ];
                    
                    const sampleInventory = {
                      'Sample Item 1': { item_name: 'Sample Item 1', quantity: 45, price: 30.00 },
                      'Sample Item 2': { item_name: 'Sample Item 2', quantity: 25, price: 18.00 },
                      'Sample Item 3': { item_name: 'Sample Item 3', quantity: 20, price: 45.00 }
                    };
                    
                    setWarehouses(sampleWarehouses);
                    setPurchaseData(samplePurchases);
                    setInventoryItems(sampleInventory);
                    
                    toast.success('Sample data loaded successfully!');
                  }}
                  className="block w-full text-left px-2 py-1 bg-green-50 hover:bg-green-100 rounded text-xs"
                >
                  Add Sample Data
                </button>
                
                {apiStatus === 'auth_failed' && (
                  <button 
                    onClick={() => {
                      localStorage.removeItem('login_token');
                      window.location.href = '/login';
                    }}
                    className="block w-full text-left px-2 py-1 bg-orange-50 hover:bg-orange-100 rounded text-xs mt-1"
                  >
                    Go to Login
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg mb-6">
        {[
          { key: 'manage', label: '📦 Manage Items', icon: Package },
          { key: 'data', label: '📊 View Data', icon: Building },
          { key: 'reports', label: '📈 Reports', icon: Calendar }
        ].map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 flex items-center justify-center py-2 px-4 rounded-md transition-colors ${
                activeTab === tab.key
                  ? 'bg-white shadow text-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Icon className="w-4 h-4 mr-2" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      {activeTab === 'manage' && (
        <div className="space-y-6">
          {/* Action Buttons */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="relative">
              <button
                onClick={() => setShowNewItemModal(true)}
                className="w-full bg-green-500 hover:bg-green-600 text-white p-4 rounded-lg flex items-center justify-center"
              >
                <Plus className="w-5 h-5 mr-2" />
                Add New Item
              </button>
              <div className="absolute top-2 right-2">
                <Tooltip text="Add a brand new item to inventory with initial stock" position="left" />
              </div>
            </div>
            <div className="relative">
              <button
                onClick={() => setShowRestockModal(true)}
                className="w-full bg-blue-500 hover:bg-blue-600 text-white p-4 rounded-lg flex items-center justify-center"
              >
                <Package className="w-5 h-5 mr-2" />
                Restock Items
              </button>
              <div className="absolute top-2 right-2">
                <Tooltip text="Add stock to existing items from suppliers" position="left" />
              </div>
            </div>
            <div className="relative">
              <button
                onClick={() => setShowPriceUpdateModal(true)}
                className="w-full bg-yellow-500 hover:bg-yellow-600 text-white p-4 rounded-lg flex items-center justify-center"
              >
                <Edit3 className="w-5 h-5 mr-2" />
                Update Prices
              </button>
              <div className="absolute top-2 right-2">
                <Tooltip text="Bulk update prices and barcodes for existing items" position="left" />
              </div>
            </div>
          </div>

          {/* Recent Purchases */}
          <div className="bg-white rounded-lg shadow">
            <div className="p-6">
              <h2 className="text-xl font-semibold mb-4">Recent Purchases</h2>
              
              {/* Search and Filters */}
              <div className="mb-4 grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="relative md:col-span-2">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <input
                    type="text"
                    placeholder="Search by item or supplier..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 pr-4 py-2 w-full border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                
                <div>
                  <select
                    value={selectedWarehouseFilter}
                    onChange={(e) => setSelectedWarehouseFilter(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">All Warehouses</option>
                    {warehouses.map((w, idx) => {
                      const name = getWarehouseName(w);
                      return (
                        <option key={`${name}-${idx}`} value={name}>
                          {name}
                        </option>
                      );
                    })}
                  </select>
                </div>

                <div>
                  <input
                    type="date"
                    value={recentStartDate}
                    onChange={(e) => setRecentStartDate(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <input
                    type="date"
                    value={recentEndDate}
                    onChange={(e) => setRecentEndDate(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>

              {/* Purchase List */}
              <div className="overflow-x-auto">
                {filteredPurchaseData.length === 0 ? (
                  <div className="text-center py-12">
                    <Package className="mx-auto h-12 w-12 text-gray-400" />
                    <h3 className="mt-2 text-sm font-medium text-gray-900">No purchase data found</h3>
                    <p className="mt-1 text-sm text-gray-500">
                      {purchaseData.length === 0 ?
                        'No purchases have been recorded yet.' :
                        'No purchases match your search criteria.'
                      }
                    </p>
                    <div className="mt-6">
                      <button
                        onClick={() => setShowNewItemModal(true)}
                        className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
                      >
                        <Plus className="-ml-1 mr-2 h-5 w-5" />
                        Add First Item
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Item
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Supplier
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Quantity
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Amount
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Date
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Status
                          </th>
                          <th className="px-6 py-3"></th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {paginatedPurchaseData.map((purchase, index) => (
                          <tr key={index} className="hover:bg-gray-50">
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                              {purchase.item_name || 'N/A'}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {purchase.supplier_name || 'N/A'}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {purchase.supplied_quantity || 0}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {formatCurrency(purchase.total_price_paid || 0)}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {purchase.purchase_date ? new Date(purchase.purchase_date + 'T00:00:00').toLocaleDateString() : 'N/A'}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                purchase.payment_status === 'paid' ? 'bg-green-100 text-green-800' :
                                purchase.payment_status === 'partial' ? 'bg-yellow-100 text-yellow-800' :
                                'bg-red-100 text-red-800'
                              }`}>
                                {purchase.payment_status || 'N/A'}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-right">
                              <button
                                disabled={!purchase.purchase_id || !purchase.purchase_date}
                                onClick={() => handleDeletePurchase(purchase)}
                                className="text-red-600 hover:text-red-800 disabled:opacity-50"
                                title="Delete"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    
                    {/* Pagination Controls */}
                    {totalRestockPages > 1 && (
                      <div className="bg-gray-50 px-6 py-4 border-t border-gray-200">
                        <div className="flex items-center justify-between">
                          <div className="text-sm text-gray-700">
                            Page <span className="font-medium">{restockPage}</span> of{' '}
                            <span className="font-medium">{totalRestockPages}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setRestockPage(Math.max(1, restockPage - 1))}
                              disabled={restockPage === 1}
                              className="relative inline-flex items-center px-3 py-2 border border-gray-300 bg-white text-sm font-medium rounded-md text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              <ChevronLeft className="w-4 h-4 mr-1" />
                              Previous
                            </button>
                            <button
                              onClick={() => setRestockPage(Math.min(totalRestockPages, restockPage + 1))}
                              disabled={restockPage === totalRestockPages}
                              className="relative inline-flex items-center px-3 py-2 border border-gray-300 bg-white text-sm font-medium rounded-md text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              Next
                              <ChevronRight className="w-4 h-4 ml-1" />
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      {activeTab === 'data' && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Purchase Data</h2>
          
          {/* Date Range + Export */}
          <div className="mb-4 grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
              <input
                type="date"
                value={exportStartDate}
                onChange={(e) => setExportStartDate(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
              <input
                type="date"
                value={exportEndDate}
                onChange={(e) => setExportEndDate(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div className="md:col-span-2">
              <button
                onClick={async () => {
                  try {
                    // Use the backend endpoint for proper date filtering
                    const params = {};
                    if (exportStartDate) params.start_date = exportStartDate;
                    if (exportEndDate) params.end_date = exportEndDate;
                    
                    console.log('Fetching export data with params:', params);
                    const response = await apiService.get('/restock/history/range', { params });
                    const rows = response.data || [];
                    
                    console.log('Export data received:', rows.length, 'rows');
                    
                    if (rows.length === 0) {
                      toast.error('No data in selected date range');
                      return;
                    }
                    
                    // Generate CSV content with headers in first row, data in subsequent rows
                    // Helper function to clean and escape CSV values
                    const cleanCSVValue = (value) => {
                      if (value === null || value === undefined) return '';
                      const str = String(value);
                      // Remove newlines, carriage returns, and extra whitespace
                      const cleaned = str.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
                      // Escape quotes
                      const escaped = cleaned.replace(/"/g, '""');
                      // Wrap in quotes if contains comma, quote, or space
                      if (escaped.includes(',') || escaped.includes('"') || escaped.includes(' ')) {
                        return `"${escaped}"`;
                      }
                      return escaped;
                    };
                    
                    const csvContent = "data:text/csv;charset=utf-8," +
                      ["Item,Supplier,Quantity,Unit Price,Total Cost,Total Paid,Date,Status,Warehouse,Employee"].concat(
                        rows.map(row =>
                          [
                            cleanCSVValue(row.item_name),
                            cleanCSVValue(row.supplier_name),
                            row.supplied_quantity || 0,
                            row.unit_price || 0,
                            row.total_cost || 0,
                            row.total_price_paid || 0,
                            row.purchase_date || '',
                            cleanCSVValue(row.payment_status),
                            cleanCSVValue(row.warehouse_name),
                            cleanCSVValue(row.employee_name)
                          ].join(',')
                        )
                      ).join('\n');
                    
                    const encodedUri = encodeURI(csvContent);
                    const link = document.createElement('a');
                    link.setAttribute('href', encodedUri);
                    link.setAttribute('download', `restock_data_${exportStartDate || 'all'}_${exportEndDate || 'all'}.csv`);
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    toast.success(`Exported ${rows.length} rows`);
                  } catch (error) {
                    console.error('Export failed:', error);
                    handleError('Failed to export data', error);
                  }
                }}
                className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-lg flex items-center w-full justify-center"
              >
                <Download className="w-4 h-4 mr-2" />
                Export CSV
              </button>
            </div>
          </div>

          {/* Data Table */}
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Item</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Supplier</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Quantity</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Unit Price</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {purchaseData.map((purchase, index) => (
                  <tr key={index} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {purchase.item_name || 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {purchase.supplier_name || 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {purchase.supplied_quantity || 0}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatCurrency(purchase.unit_price || 0)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatCurrency(purchase.total_price_paid || 0)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {purchase.purchase_date ? new Date(purchase.purchase_date + 'T00:00:00').toLocaleDateString() : 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        purchase.payment_status === 'paid' ? 'bg-green-100 text-green-800' :
                        purchase.payment_status === 'partial' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-red-100 text-red-800'
                      }`}>
                        {purchase.payment_status || 'N/A'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'reports' && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Purchase Reports</h2>
          
          {/* Date Range */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-6 items-end">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
              <input
                type="date"
                value={reportStartDate}
                onChange={(e) => setReportStartDate(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
              <input
                type="date"
                value={reportEndDate}
                onChange={(e) => setReportEndDate(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
            {(() => {
              const rf = purchaseData.filter(p => {
                const d = parseDate(p.purchase_date);
                const sd = reportStartDate ? parseDate(reportStartDate) : null;
                const ed = reportEndDate ? parseDate(reportEndDate) : null;
                return (!sd || (d && d >= sd)) && (!ed || (d && d <= ed));
              });
              const totalAmount = rf.reduce((sum, item) => sum + (Number(item.total_price_paid) || 0), 0);
              const itemsCount = rf.reduce((sum, item) => sum + (Number(item.supplied_quantity) || 0), 0);
              const uniqueWarehouses = Array.from(new Set(rf.map(r => r.warehouse_name).filter(Boolean))).length;
              return (
                <>
                  <div className="bg-blue-50 p-4 rounded-lg">
                    <div className="flex items-center">
                      <ShoppingCart className="w-8 h-8 text-blue-500" />
                      <div className="ml-3">
                        <p className="text-sm font-medium text-gray-500">Total Purchases</p>
                        <p className="text-lg font-semibold text-gray-900">{rf.length}</p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="bg-green-50 p-4 rounded-lg">
                    <div className="flex items-center">
                      <CheckCircle className="w-8 h-8 text-green-500" />
                      <div className="ml-3">
                        <p className="text-sm font-medium text-gray-500">Total Amount</p>
                        <p className="text-lg font-semibold text-gray-900">{formatCurrency(totalAmount)}</p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="bg-yellow-50 p-4 rounded-lg">
                    <div className="flex items-center">
                      <Package className="w-8 h-8 text-yellow-500" />
                      <div className="ml-3">
                        <p className="text-sm font-medium text-gray-500">Items Restocked</p>
                        <p className="text-lg font-semibold text-gray-900">{itemsCount}</p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="bg-purple-50 p-4 rounded-lg">
                    <div className="flex items-center">
                      <Building className="w-8 h-8 text-purple-500" />
                      <div className="ml-3">
                        <p className="text-sm font-medium text-gray-500">Warehouses</p>
                        <p className="text-lg font-semibold text-gray-900">{uniqueWarehouses}</p>
                      </div>
                    </div>
                  </div>
                </>
              );
            })()}
          </div>

           {/* Recent Activity */}
          <div>
            <h3 className="text-lg font-medium mb-3">Recent Activity</h3>
            <div className="space-y-3">
              {purchaseData
                .filter(p => {
                  const d = parseDate(p.purchase_date);
                  const sd = reportStartDate ? parseDate(reportStartDate) : null;
                  const ed = reportEndDate ? parseDate(reportEndDate) : null;
                  return (!sd || (d && d >= sd)) && (!ed || (d && d <= ed));
                })
                .slice()
                .sort((a,b) => {
                  const da = parseDate(a.purchase_date); const db = parseDate(b.purchase_date);
                  return (db?.getTime()||0) - (da?.getTime()||0);
                })
                .slice(0, 5)
                .map((purchase, index) => (
                <div key={index} className="flex items-center p-3 bg-gray-50 rounded-lg">
                  <CheckCircle className="w-5 h-5 text-green-500 mr-3" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900">
                      {purchase.item_name || 'Unknown Item'} restocked
                    </p>
                    <p className="text-xs text-gray-500">
                      {purchase.supplied_quantity || 0} units from {purchase.supplier_name || 'Unknown Supplier'}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-gray-900">
                      {formatCurrency(purchase.total_price_paid || 0)}
                    </p>
                    <p className="text-xs text-gray-500">
                      {purchase.purchase_date ? new Date(purchase.purchase_date + 'T00:00:00').toLocaleDateString() : 'N/A'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Add New Item Modal */}
      {showNewItemModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-4xl max-h-screen overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">Add New Items</h2>
              <button
                onClick={() => {
                  setShowNewItemModal(false);
                  resetNewItemForm();
                }}
                className="text-gray-500 hover:text-gray-700"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleNewItemSubmit} className="space-y-4">
              {/* Common fields */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Supplier
                  </label>
                  <input
                    type="text"
                    value={newItemForm.supplier}
                    onChange={(e) => setNewItemForm(prev => ({...prev, supplier: e.target.value}))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Purchase Date
                  </label>
                  <input
                    type="date"
                    value={newItemForm.purchase_date}
                    onChange={(e) => setNewItemForm(prev => ({...prev, purchase_date: e.target.value}))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center">
                    Payment Status
                    <Tooltip text="Payment status: Paid (full), Partial (part payment), Credit (pay later)" />
                  </label>
                  <select
                    value={newItemForm.payment_status}
                    onChange={(e) => setNewItemForm(prev => ({...prev, payment_status: e.target.value}))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="paid">Paid</option>
                    <option value="partial">Partial</option>
                    <option value="credit">Credit</option>
                  </select>
                  {newItemForm.payment_status === 'partial' && (
                    <div className="mt-2">
                      <label className="block text-xs text-gray-600 mb-1">Amount Paid (₦)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={newItemForm.total_price_paid}
                        onChange={(e) => setNewItemForm(prev => ({...prev, total_price_paid: parseFloat(e.target.value) || 0}))}
                        className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                      />
                      <div className="text-xs text-gray-600 mt-1">Outstanding: <span className="font-medium">{formatCurrency(newItemOutstanding)}</span></div>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Payment Method
                  </label>
                  <select
                    value={newItemForm.payment_method}
                    onChange={(e) => setNewItemForm(prev => ({...prev, payment_method: e.target.value}))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="cash">Cash</option>
                    <option value="transfer">Transfer</option>
                    <option value="check">Check</option>
                    <option value="card">Card</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center">
                    Warehouse
                    <Tooltip text="Select existing warehouse or create new one below" />
                  </label>
                  <select
                    value={newItemForm.warehouse_name}
                    onChange={(e) => setNewItemForm(prev => ({...prev, warehouse_name: e.target.value}))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">Select Warehouse</option>
                    {warehouses.map((w, idx) => {
                      const name = getWarehouseName(w);
                      return (
                        <option key={`${name}-${idx}`} value={name}>
                          {name}
                        </option>
                      );
                    })}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    New Warehouse Name
                  </label>
                  <input
                    type="text"
                    value={newItemForm.new_warehouse_name}
                    onChange={(e) => setNewItemForm(prev => ({...prev, new_warehouse_name: e.target.value}))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Create new warehouse"
                  />
                </div>

                {newItemForm.new_warehouse_name?.trim() && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Give access to all employees?
                    </label>
                    <select
                      value={newItemForm.access_choice}
                      onChange={(e) => setNewItemForm(prev => ({...prev, access_choice: e.target.value}))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="No">No</option>
                      <option value="Yes">Yes</option>
                    </select>
                  </div>
                )}

                {newItemForm.payment_status !== 'paid' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Due Date *
                    </label>
                    <input
                      type="date"
                      value={newItemForm.due_date}
                      onChange={(e) => setNewItemForm(prev => ({...prev, due_date: e.target.value}))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      required
                    />
                  </div>
                )}
              </div>

              {/* Items Section - Moved before Notes and Invoice */}
              <div className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-medium text-gray-900">Items to Add</h3>
                  <button
                    type="button"
                    onClick={addNewItemToList}
                    className="px-3 py-1 bg-blue-500 text-white rounded text-sm hover:bg-blue-600"
                  >
                    + Add Item
                  </button>
                </div>

                {newItemForm.selected_items.length === 0 ? (
                  <p className="text-gray-500 text-center py-4">No items added yet. Click "Add Item" to start.</p>
                ) : (
                  <div className="space-y-3">
                    {newItemForm.selected_items.map((item, index) => (
                      <div key={index} className="grid grid-cols-12 gap-3 items-center p-3 bg-gray-50 rounded">
                        <div className="col-span-3">
                          <label className="block text-xs text-gray-600 mb-1">Item Name *</label>
                          <input
                            type="text"
                            value={item.item_name}
                            onChange={(e) => updateNewItem(index, 'item_name', e.target.value)}
                            className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                            required
                          />
                        </div>
                        <div className="col-span-2">
                          <label className="block text-xs text-gray-600 mb-1">Barcode</label>
                          <input
                            type="text"
                            value={item.barcode}
                            onChange={(e) => updateNewItem(index, 'barcode', e.target.value)}
                            className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                          />
                        </div>
                        <div className="col-span-2">
                          <label className="block text-xs text-gray-600 mb-1">Quantity *</label>
                          <input
                            type="number"
                            min="0"
                            value={item.quantity}
                            onChange={(e) => updateNewItem(index, 'quantity', parseInt(e.target.value) || 0)}
                            className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                            required
                          />
                        </div>
                        <div className="col-span-2">
                          <label className="block text-xs text-gray-600 mb-1">Unit Price (₦) *</label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={item.unit_price}
                            onChange={(e) => updateNewItem(index, 'unit_price', parseFloat(e.target.value) || 0)}
                            className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                            required
                          />
                        </div>
                        <div className="col-span-2">
                          <label className="block text-xs text-gray-600 mb-1">Reorder Level</label>
                          <input
                            type="number"
                            min="0"
                            value={item.reorder_level}
                            onChange={(e) => updateNewItem(index, 'reorder_level', parseInt(e.target.value) || 0)}
                            className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                          />
                        </div>
                        <div className="col-span-1 flex justify-end">
                          <button
                            type="button"
                            onClick={() => removeNewItemFromList(index)}
                            className="text-red-600 hover:text-red-800"
                            title="Remove"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Notes
                </label>
                <textarea
                  value={newItemForm.notes}
                  onChange={(e) => setNewItemForm(prev => ({...prev, notes: e.target.value}))}
                  rows="3"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Invoice File
                </label>
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  onChange={(e) => setNewItemForm(prev => ({...prev, invoice_file: e.target.files[0]}))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowNewItemModal(false);
                    resetNewItemForm();
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50"
                >
                  {submitting ? 'Adding...' : 'Add Item'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      
      {/* Restock Items Modal */}
      {showRestockModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-4xl max-h-screen overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">Restock Items</h2>
              <button
                onClick={() => {
                  setShowRestockModal(false);
                  resetRestockForm();
                }}
                className="text-gray-500 hover:text-gray-700"
              >
                ✕
              </button>
            </div>
            
            <form onSubmit={handleRestockSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Supplier Name *
                  </label>
                  <input
                    type="text"
                    value={restockForm.supplier_name}
                    onChange={(e) => setRestockForm(prev => ({...prev, supplier_name: e.target.value}))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Supplier Phone
                  </label>
                  <input
                    type="tel"
                    value={restockForm.supplier_phone}
                    onChange={(e) => setRestockForm(prev => ({...prev, supplier_phone: e.target.value}))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Purchase Date
                  </label>
                  <input
                    type="date"
                    value={restockForm.purchase_date}
                    onChange={(e) => setRestockForm(prev => ({...prev, purchase_date: e.target.value}))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Warehouse *
                  </label>
                  <select
                    value={restockForm.warehouse_name}
                    onChange={(e) => handleWarehouseChange(e.target.value, 'restock')}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                  >
                  <option value="">Select Warehouse</option>
                  {warehouses.map((w, idx) => {
                    const name = getWarehouseName(w);
                    return (
                      <option key={`${name}-${idx}`} value={name}>
                        {name}
                      </option>
                    );
                  })}
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Payment Status
                  </label>
                  <select
                    value={restockForm.payment_status}
                    onChange={(e) => setRestockForm(prev => ({...prev, payment_status: e.target.value}))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="paid">Paid</option>
                    <option value="partial">Partial</option>
                    <option value="credit">Credit</option>
                  </select>
                  {restockForm.payment_status === 'partial' && (
                    <div className="mt-2">
                      <label className="block text-xs text-gray-600 mb-1">Amount Paid (₦)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={restockForm.total_price_paid}
                        onChange={(e) => setRestockForm(prev => ({...prev, total_price_paid: parseFloat(e.target.value) || 0}))}
                        className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                      />
                      <div className="text-xs text-gray-600 mt-1">Outstanding: <span className="font-medium">{formatCurrency(outstanding)}</span></div>
                    </div>
                  )}
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Payment Method
                  </label>
                  <select
                    value={restockForm.payment_method}
                    onChange={(e) => setRestockForm(prev => ({...prev, payment_method: e.target.value}))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="cash">Cash</option>
                    <option value="transfer">Transfer</option>
                    <option value="check">Check</option>
                    <option value="card">Card</option>
                  </select>
                </div>
              </div>
              
              {/* Items Selection */}
              {restockForm.warehouse_name && (
                <div className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-medium text-gray-900">Add Items</h3>
                    {/* Total Items Counter for Restock */}
                    {restockForm.selected_items.length > 0 && (
                      <div className="px-4 py-2 rounded-lg bg-green-50 border-2 border-green-500">
                        <span className="text-green-700 font-bold text-lg">
                          Total Items: {restockForm.selected_items.reduce((sum, item) => sum + (parseInt(item.quantity) || 0), 0)}
                        </span>
                      </div>
                    )}
                  </div>

                  {Object.keys(inventoryItems).length === 0 ? (
                    <p className="text-gray-500 text-center py-4">No items found in selected warehouse</p>
                  ) : (
                    <div className="space-y-2">
                      <div className="relative">
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={restockItemQuery}
                            onChange={(e) => { setRestockItemQuery(e.target.value); setShowItemSuggestions(true); }}
                            onFocus={() => setShowItemSuggestions(true)}
                            placeholder="Type item name to search..."
                            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          />
                          {/* Bulk Select All Button for Restock */}
                          {restockItemQuery.trim() && restockSuggestions.length > 0 && (
                            <button
                              type="button"
                              onClick={() => {
                                const searchTerm = restockItemQuery.toLowerCase().trim();
                                // Collect all matching items first
                                const newItems = restockSuggestions
                                  .filter(name => name.toLowerCase().includes(searchTerm))
                                  .map(name => {
                                    const it = inventoryItems[name] || {};
                                    return { item_name: name, quantity: 1, unit_price: Number(it.price || 0) };
                                  });
                                
                                // Add all items at once
                                setRestockForm(prev => ({
                                  ...prev,
                                  selected_items: [...prev.selected_items, ...newItems]
                                }));
                                
                                setRestockItemQuery('');
                                setShowItemSuggestions(false);
                                toast.success(`Added ${newItems.length} matching "${searchTerm}" items to restock!`);
                              }}
                              className="px-4 py-2 rounded-lg bg-purple-600 text-white hover:bg-purple-700 text-sm whitespace-nowrap"
                            >
                              Select All
                            </button>                          
                          )}
                        </div>
                        {showItemSuggestions && restockItemQuery && (
                          <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded shadow max-h-48 overflow-auto">
                            {restockSuggestions.length === 0 ? (
                              <div className="px-3 py-2 text-sm text-gray-500">No matches</div>
                            ) : (
                              restockSuggestions.map(name => (
                                <div
                                  key={name}
                                  onClick={() => {
                                    const it = inventoryItems[name] || {};
                                    setRestockForm(prev => ({
                                      ...prev,
                                      selected_items: [...prev.selected_items, { item_name: name, quantity: 1, unit_price: Number(it.price || 0) }]
                                    }));
                                    setRestockItemQuery('');
                                    setShowItemSuggestions(false);
                                    toast.success(`${name} added`);
                                  }}
                                  className="px-3 py-2 hover:bg-gray-50 cursor-pointer flex items-center justify-between"
                                >
                                  <span className="text-sm">{name}</span>
                                  <span className="text-xs text-gray-500">{formatCurrency((inventoryItems[name]?.price) || 0)}</span>
                                </div>
                              ))
                            )}
                          </div>
                        )}
                        <div className="text-xs text-gray-500 mt-1">
                          Type to search, then click to add. Use "Select All" to add all matching items at once.
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
              
              {/* Selected Items */}
              {restockForm.selected_items.length > 0 && (
                <div className="border border-gray-200 rounded-lg p-4">
                  <h3 className="font-medium text-gray-900 mb-3">Restock Details</h3>
                  
                  <div className="space-y-3">
                    {restockForm.selected_items.map((item) => (
                      <div key={item.item_name} className="grid grid-cols-12 gap-3 items-center p-3 bg-gray-50 rounded">
                        <div className="col-span-4 md:col-span-5">
                          <span className="text-sm font-medium">{item.item_name}</span>
                        </div>
                        <div className="col-span-4 md:col-span-3">
                          <label className="block text-xs text-gray-600 mb-1">Quantity</label>
                          <input
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={(e) => updateSelectedItem(item.item_name, 'quantity', parseInt(e.target.value) || 1, 'restock')}
                            className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                          />
                        </div>
                        <div className="col-span-3 md:col-span-3">
                          <label className="block text-xs text-gray-600 mb-1">Unit Price (₦)</label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={item.unit_price}
                            onChange={(e) => updateSelectedItem(item.item_name, 'unit_price', parseFloat(e.target.value) || 0, 'restock')}
                            className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                          />
                        </div>
                        <div className="col-span-1 flex justify-end">
                          <button
                            type="button"
                            onClick={() => setRestockForm(prev => ({...prev, selected_items: prev.selected_items.filter(si => si.item_name !== item.item_name)}))}
                            className="text-red-600 hover:text-red-800"
                            title="Remove"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                    
                    <div className="border-t pt-3">
                      <div className="flex justify-between text-sm">
                        <span>Total:</span>
                        <span className="font-semibold">{formatCurrency(grandTotal)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              
              {restockForm.payment_status !== 'paid' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Due Date *
                  </label>
                  <input
                    type="date"
                    value={restockForm.due_date}
                    onChange={(e) => setRestockForm(prev => ({...prev, due_date: e.target.value}))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                  />
                </div>
              )}
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Notes
                </label>
                <textarea
                  value={restockForm.notes}
                  onChange={(e) => setRestockForm(prev => ({...prev, notes: e.target.value}))}
                  rows="3"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Invoice File
                </label>
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  onChange={(e) => setRestockForm(prev => ({...prev, invoice_file: e.target.files[0]}))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              
              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowRestockModal(false);
                    resetRestockForm();
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || restockForm.selected_items.length === 0}
                  className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
                >
                  {submitting ? 'Processing...' : 'Complete Restock'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      
      {/* Update Prices Modal */}
      {showPriceUpdateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-3xl max-h-screen overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">Update Prices</h2>
              <button
                onClick={() => {
                  setShowPriceUpdateModal(false);
                  resetPriceUpdateForm();
                }}
                className="text-gray-500 hover:text-gray-700"
              >
                ✕
              </button>
            </div>
            
              <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Warehouse *
                </label>
                <select
                  value={priceUpdateForm.warehouse_name}
                  onChange={(e) => handleWarehouseChange(e.target.value, 'priceUpdate')}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                >
                  <option value="">Select Warehouse</option>
                  {warehouses.map((w, idx) => {
                    const name = getWarehouseName(w);
                    return (
                      <option key={`${name}-${idx}`} value={name}>
                        {name}
                      </option>
                    );
                  })}
                </select>
              </div>
              
              {/* Items Selection - Typeahead Dropdown */}
              {priceUpdateForm.warehouse_name && (
                <div className="border border-gray-200 rounded-lg p-4 space-y-3">
                  <h3 className="font-medium text-gray-900 mb-1">Add Items</h3>
                  {Object.keys(inventoryItems).length === 0 ? (
                    <p className="text-gray-500 text-center py-4">No items found in selected warehouse</p>
                  ) : (
                    <>
                      <div className="relative">
                        <input
                          type="text"
                          value={priceUpdateQuery}
                          onChange={(e) => { setPriceUpdateQuery(e.target.value); setShowPriceSuggestions(true); }}
                          onFocus={() => setShowPriceSuggestions(true)}
                          placeholder="Type item name to search..."
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                        {showPriceSuggestions && priceUpdateQuery && (
                          <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded shadow max-h-48 overflow-auto">
                            {Object.keys(inventoryItems)
                              .filter(name => name.toLowerCase().includes(priceUpdateQuery.toLowerCase()) && !priceUpdateForm.selected_items.find(si => si.item_name === name))
                              .slice(0,10)
                              .map(name => (
                                <div
                                  key={name}
                                  onClick={() => {
                                    const it = inventoryItems[name] || {};
                                    setPriceUpdateForm(prev => ({
                                      ...prev,
                                      selected_items: [...prev.selected_items, {
                                        item_name: name,
                                        current_price: Number(it.price || 0),
                                        new_price: Number(it.price || 0),
                                        new_barcode: ''
                                      }]
                                    }));
                                    setPriceUpdateQuery('');
                                    setShowPriceSuggestions(false);
                                    toast.success(`${name} added`);
                                  }}
                                  className="px-3 py-2 hover:bg-gray-50 cursor-pointer flex items-center justify-between"
                                >
                                  <span className="text-sm">{name}</span>
                                  <span className="text-xs text-gray-500">{formatCurrency((inventoryItems[name]?.price)||0)}</span>
                                </div>
                              ))}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center space-x-2">
                        <input
                          type="text"
                          placeholder="Scan/Enter Barcode"
                          onKeyDown={async (e) => {
                            if (e.key === 'Enter') {
                              const code = e.currentTarget.value.trim();
                              if (!code) return;
                              try {
                                const res = await apiService.get('/sales/barcode/item', {
                                  params: { barcode: code, warehouse_name: priceUpdateForm.warehouse_name }
                                });
                                const name = res.data?.item_name || res.data?.item?.item_name;
                                const price = res.data?.price || res.data?.item?.price || 0;
                                if (!name) throw new Error('Item not found for barcode');
                                setPriceUpdateForm(prev => ({
                                  ...prev,
                                  selected_items: prev.selected_items.find(si => si.item_name === name) ? prev.selected_items : [
                                    ...prev.selected_items,
                                    { item_name: name, current_price: Number(price||0), new_price: Number(price||0), new_barcode: '' }
                                  ]
                                }));
                                toast.success('Item added by barcode');
                                e.currentTarget.value = '';
                              } catch (err) {
                                toast.error('Barcode not found');
                              }
                            }
                          }}
                          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                        <span className="text-xs text-gray-500">Press Enter</span>
                      </div>
                    </>
                  )}
                </div>
              )}
              
              {/* Price Update Details */}
              {priceUpdateForm.selected_items.length > 0 && (
                <div className="border border-gray-200 rounded-lg p-4">
                  <h3 className="font-medium text-gray-900 mb-3">Price Update Details</h3>
                  
                  <div className="space-y-3">
                    {priceUpdateForm.selected_items.map((item) => (
                      <div key={item.item_name} className="grid grid-cols-12 gap-3 items-center p-3 bg-gray-50 rounded">
                        <div className="col-span-4">
                          <span className="text-sm font-medium">{item.item_name}</span>
                          <div className="text-xs text-gray-500">Current: {formatCurrency(item.current_price)}</div>
                        </div>
                        <div className="col-span-3">
                          <label className="block text-xs text-gray-600 mb-1">New Price (₦)</label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={item.new_price}
                            onChange={(e) => updateSelectedItem(item.item_name, 'new_price', parseFloat(e.target.value) || 0, 'priceUpdate')}
                            className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                          />
                        </div>
                        <div className="col-span-3">
                          <label className="block text-xs text-gray-600 mb-1">New Barcode</label>
                          <input
                            type="text"
                            value={item.new_barcode || ''}
                            onChange={(e) => updateSelectedItem(item.item_name, 'new_barcode', e.target.value, 'priceUpdate')}
                            className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                            placeholder="Optional"
                          />
                        </div>
                        <div className="col-span-2 flex justify-end">
                          <button
                            type="button"
                            onClick={() => setPriceUpdateForm(prev => ({...prev, selected_items: prev.selected_items.filter(si => si.item_name !== item.item_name)}))}
                            className="text-red-600 hover:text-red-800"
                            title="Remove"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowPriceUpdateModal(false);
                    resetPriceUpdateForm();
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handlePriceUpdate}
                  disabled={submitting || priceUpdateForm.selected_items.length === 0}
                  className="px-4 py-2 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 disabled:opacity-50"
                >
                  {submitting ? 'Updating...' : 'Update Prices'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Restock;
