import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { decodeToken } from '../utils/tokenUtils';
import { usePermission } from '../hooks/usePermission';
const REACT_APP_API_URL = process.env.REACT_APP_API_URL;

const TabButton = ({ active, onClick, children, title }) => (
  <button onClick={onClick} title={title} className={`px-4 py-2 rounded-md text-sm font-medium ${active ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>{children}</button>
);

const formatDate = (d) => {
  if (!d) return '';
  if (typeof d === 'string') return d;
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const downloadCSV = (data, filename) => {
  if (!data || data.length === 0) {
    alert('No data to download');
    return;
  }
  const headers = Object.keys(data[0]);
  const csv = [
    headers.join(','),
    ...data.map(row => headers.map(h => JSON.stringify(row[h] || '')).join(','))
  ].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

const Sales = () => {
  const navigate = useNavigate();
  const [tab, setTab] = useState('List');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // List state with pagination
  const [rows, setRows] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const recordsPerPage = 20;

  // Filter state
  const today = useMemo(() => new Date(), []);
  const [fKeyword, setFKeyword] = useState('');
  const [fType, setFType] = useState('');
  const [fValues, setFValues] = useState([]);
  const [fStart, setFStart] = useState(formatDate(today));
  const [fEnd, setFEnd] = useState(formatDate(today));
  const [options, setOptions] = useState({ customer_names: [], employee_names: [], customer_phones: [], item_names: [] });
  const [filtered, setFiltered] = useState([]);
  const [filterPage, setFilterPage] = useState(1);

  // Pending with pagination
  const [pending, setPending] = useState([]);
  const [pendingPage, setPendingPage] = useState(1);
  const pendingRecordsPerPage = 20;

  // Add Sale state
  const [warehouses, setWarehouses] = useState([]);
  const [selectedWarehouse, setSelectedWarehouse] = useState('');
  const [inventoryItems, setInventoryItems] = useState({});
  const [barcodeInput, setBarcodeInput] = useState('');
  const [saleItems, setSaleItems] = useState([]);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [applyVAT, setApplyVAT] = useState(true);
  const [vatRate, setVatRate] = useState(7.5);
  const [discountType, setDiscountType] = useState('None');
  const [discountValue, setDiscountValue] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [paymentStatus, setPaymentStatus] = useState('paid');
  const [amountPaid, setAmountPaid] = useState(0);
  const [notes, setNotes] = useState('');

  // Sale item add via dropdown (prevent duplicates & auto-increment)
  const [saleSelectName, setSaleSelectName] = useState('');
  const [saleItemSearchInput, setSaleItemSearchInput] = useState('');
  const [showSaleItemSuggestions, setShowSaleItemSuggestions] = useState(false);
  
  const saleAvailableNames = useMemo(() => {
    const selected = new Set(saleItems.map(it => (it.item_name || '').trim()).filter(Boolean));
    return Object.keys(inventoryItems).filter(n => !selected.has(n));
  }, [inventoryItems, saleItems]);
  
  // Filter items based on search input for autocomplete
  const saleSuggestedItems = useMemo(() => {
    if (!saleItemSearchInput.trim()) return saleAvailableNames;
    const searchLower = saleItemSearchInput.toLowerCase().trim();
    return saleAvailableNames.filter(name =>
      name.toLowerCase().includes(searchLower)
    );
  }, [saleItemSearchInput, saleAvailableNames]);

  // Proforma state
  const [proformaItems, setProformaItems] = useState([]);
  const [proformaCustomer, setProformaCustomer] = useState('');
  const [proformaPhone, setProformaPhone] = useState('');
  const [proformaApplyVAT, setProformaApplyVAT] = useState(true);
  const [proformaVatRate, setProformaVatRate] = useState(7.5);
  const [proformaDiscountType, setProformaDiscountType] = useState('None');
  const [proformaDiscountValue, setProformaDiscountValue] = useState(0);
  const [proformaNotes, setProformaNotes] = useState('');
  const [pendingProformas, setPendingProformas] = useState([]);
  const [loadingPendingProformas, setLoadingPendingProformas] = useState(false);
  
  // Proforma list and filter state
  const [allProformas, setAllProformas] = useState([]);
  const [filteredProformas, setFilteredProformas] = useState([]);
  const [proformaFilterCustomer, setProformaFilterCustomer] = useState('');
  const [proformaFilterStatus, setProformaFilterStatus] = useState('all');
  const [proformaFilterStart, setProformaFilterStart] = useState(formatDate(today));
  const [proformaFilterEnd, setProformaFilterEnd] = useState(formatDate(today));
  const [proformaPage, setProformaPage] = useState(1);
  // Proforma item add via dropdown (prevent duplicates & auto-increment)
  const [proformaSelectName, setProformaSelectName] = useState('');
  const [proformaItemSearchInput, setProformaItemSearchInput] = useState('');
  const [showProformaItemSuggestions, setShowProformaItemSuggestions] = useState(false);
  
  const proformaAvailableNames = useMemo(() => {
    const selected = new Set(proformaItems.map(it => (it.item_name || '').trim()).filter(Boolean));
    return Object.keys(inventoryItems).filter(n => !selected.has(n));
  }, [inventoryItems, proformaItems]);
  
  // Filter items based on search input for autocomplete
  const proformaSuggestedItems = useMemo(() => {
    if (!proformaItemSearchInput.trim()) return proformaAvailableNames;
    const searchLower = proformaItemSearchInput.toLowerCase().trim();
    return proformaAvailableNames.filter(name =>
      name.toLowerCase().includes(searchLower)
    );
  }, [proformaItemSearchInput, proformaAvailableNames]);

  // Proforma conversion modal state
  const [showConversionModal, setShowConversionModal] = useState(false);
  const [conversionProformaId, setConversionProformaId] = useState(null);
  const [conversionInvoiceFile, setConversionInvoiceFile] = useState(null);
  const [conversionInvoicePreview, setConversionInvoicePreview] = useState(null);
  const [usingCamera, setUsingCamera] = useState(false);
  const [cameraStream, setCameraStream] = useState(null);

  // Report state
  const [reportStart, setReportStart] = useState(formatDate(today));
  const [reportEnd, setReportEnd] = useState(formatDate(today));
  const [reportData, setReportData] = useState(null);

  // Receipt state for Add Sale page
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [receiptSales, setReceiptSales] = useState([]);
  const [receiptCustomerFilter, setReceiptCustomerFilter] = useState('');
  const [receiptDateFilter, setReceiptDateFilter] = useState(formatDate(today));
  const [receiptFormat, setReceiptFormat] = useState('A4');
  const [receiptEmail, setReceiptEmail] = useState('');
  const [receiptCustomerList, setReceiptCustomerList] = useState([]);

  // Additional sale state for backend integration
  const [saleDate, setSaleDate] = useState(formatDate(today));
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceFile, setInvoiceFile] = useState(null);
  const [invoiceFileUrl, setInvoiceFileUrl] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [employeeName, setEmployeeName] = useState('');
  const [customerId, setCustomerId] = useState(null);
  const [invoiceOverride, setInvoiceOverride] = useState(false);
  
  // Camera state for Add Sale invoice upload
  const [saleInvoiceUsingCamera, setSaleInvoiceUsingCamera] = useState(false);
  const [saleInvoiceCameraStream, setSaleInvoiceCameraStream] = useState(null);
  const [invoicePreview, setInvoicePreview] = useState(null);
  
  // Permission checks
  const { hasPermission: canBackdateSales } = usePermission('sales.backdate.access');
  const { hasPermission: canDeleteSales } = usePermission('sales.delete_button.access');
  const { hasPermission: canDeleteProforma } = usePermission('sales.delete_proforma.access');
  const { hasPermission: canConnectPOS } = usePermission('sales.connect_pos.access');
  const { hasPermission: canOverrideInvoice } = usePermission('sales.invoice_override.access');


  const loadList = React.useCallback(async () => {
    setLoading(true); setError('');
    try {
      console.log('Loading sales data...');
      const res = await api.get('/sales', { params: { limit: 500 } });
      console.log('Sales API response:', res);
      const data = res.data || [];
      console.log(`Loaded ${data.length} sales records`);
      setRows(data);
      setCurrentPage(1);
      if (data.length === 0) {
        setError('No sales records found. Try creating a new sale.');
      }
    } catch (e) {
      console.error('Failed to load sales:', e);
      const errorMsg = e.response?.data?.detail || e.message;
      setError('Failed to load sales: ' + errorMsg);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { if (tab === 'List') loadList(); }, [tab]);

  const loadOptions = async () => {
    setError('');
    try {
      const res = await api.get('/sales/filter-options');
      setOptions(res.data || {});
    } catch (e) { /* ignore */ }
  };
  useEffect(() => { if (tab === 'Filter') loadOptions(); }, [tab]);

  const applyFilter = async () => {
    setLoading(true); setError('');
    try {
      const body = {
        keyword: fKeyword || null,
        filter_type: fType || null,
        filter_values: fValues.length ? fValues : null,
        start_date: fStart || null,
        end_date: fEnd || null,
        limit: 500,
      };
      const res = await api.post('/sales/filter', body);
      setFiltered(res.data || []);
      setFilterPage(1);
    } catch (e) {
      setError('Failed to filter sales: ' + (e.response?.data?.detail || e.message));
    } finally { setLoading(false); }
  };

  const loadPending = async () => {
    setLoading(true); setError('');
    try {
      const res = await api.get('/sales/pending');
      setPending(res.data || []);
    } catch (e) {
      setError('Failed to load pending transactions');
    } finally { setLoading(false); }
  };
  useEffect(() => { if (tab === 'Pending') loadPending(); }, [tab]);

  // Load warehouses for Add Sale
  const loadWarehouses = async () => {
    setError('');
    try {
      console.log('=== LOADING WAREHOUSES ===');
      const role = localStorage.getItem('role') || 'md';
      const currentUser = localStorage.getItem('username');
      console.log('User role:', role, 'Username:', currentUser);
      
      const res = await api.get('/sales/warehouses', { params: { role } });
      console.log('Warehouses API response:', res);
      const warehouses = res.data || [];
      console.log(`Found ${warehouses.length} warehouses:`, warehouses);
      
      setWarehouses(warehouses);
      if (warehouses.length > 0) {
        setSelectedWarehouse(warehouses[0]);
        console.log('Auto-selected warehouse:', warehouses[0]);
      } else {
        const errorMsg = 'No warehouses available. This usually means: 1) No inventory items exist, 2) User has no warehouse access, or 3) Database connection issue.';
        console.warn(errorMsg);
        setError(errorMsg);
      }
      console.log('===========================');
    } catch (e) {
      console.error('Failed to load warehouses:', e);
      const apiError = e.response?.data?.detail || e.message;
      setError('Failed to load warehouses: ' + apiError);
    }
  };

  // Load inventory items when warehouse selected
  const loadInventoryItems = async () => {
    if (!selectedWarehouse) return;
    setError('');
    try {
      console.log('=== LOADING INVENTORY ITEMS ===');
      console.log('Warehouse:', selectedWarehouse);
      const res = await api.get('/sales/inventory-items', { params: { warehouse_name: selectedWarehouse } });
      console.log('API response status:', res.status);
      console.log('API response data:', res.data);
      
      const items = res.data || {};
      const itemNames = Object.keys(items);
      console.log(`Loaded ${itemNames.length} inventory items for "${selectedWarehouse}"`);
      
      if (itemNames.length > 0) {
        console.log('Sample items:');
        itemNames.slice(0, 3).forEach(name => {
          const item = items[name];
          console.log(`  - "${name}": item_id=${item.item_id} (${typeof item.item_id}), price=${item.price}`);
        });
      } else {
        console.warn('No inventory items found for warehouse:', selectedWarehouse);
        setError(`No inventory items found for warehouse "${selectedWarehouse}". Please add items to this warehouse first.`);
      }
      
      setInventoryItems(items);
      console.log('===============================');
    } catch (e) {
      console.error('Failed to load inventory items:', e);
      setError('Failed to load inventory items: ' + (e.response?.data?.detail || e.message));
    }
  };

  useEffect(() => { 
    if (tab === 'Add Sale' || tab === 'Proforma') { 
      loadWarehouses(); 
      // Initialize employee details when accessing Add Sale or Proforma tab
      initializeEmployeeDetails();
    } 
  }, [tab]);
  
  // Barcode add handler for Add Sale
  const handleBarcodeSubmit = async () => {
    const code = (barcodeInput || '').trim();
    if (!code) return;
    if (!selectedWarehouse) {
      setError('Please select a warehouse first.');
      return;
    }
    setLoading(true); setError(''); setSuccess('');
    try {
      const res = await api.get('/sales/barcode/item', { params: { barcode: code, warehouse_name: selectedWarehouse } });
      const inv = res.data;
      // Ensure inventory map has this item
      if (!inventoryItems[inv.item_name]) {
        setInventoryItems(prev => ({ ...prev, [inv.item_name]: { item_id: inv.item_id, price: Number(inv.price) || 0 } }));
      }
      // Add or increment in saleItems - new items at top
      setSaleItems(prev => {
        const idx = prev.findIndex(it => it.item_name === inv.item_name);
        if (idx >= 0) {
          // Item exists, increment quantity and move to top
          const clone = [...prev];
          const q = Number(clone[idx].quantity) || 0;
          const updatedItem = { ...clone[idx], quantity: q + 1, unit_price: Number(inv.price) || clone[idx].unit_price, item_id: inv.item_id };
          clone.splice(idx, 1); // Remove from current position
          return [updatedItem, ...clone]; // Add to top
        }
        // New item - add to top
        return [{ item_name: inv.item_name, quantity: 1, unit_price: Number(inv.price) || 0, item_id: inv.item_id }, ...prev];
      });
      setSuccess(`Added ${inv.item_name} via barcode`);
      setBarcodeInput('');
    } catch (e) {
      const msg = e.response?.data?.detail || e.message;
      setError('Barcode lookup failed: ' + msg);
    } finally { setLoading(false); }
  };
  
  // Get current user information from localStorage and potentially from API
  const getCurrentUserInfo = async () => {
    try {
      // Read from localStorage
      const usernameLS = localStorage.getItem('username');
      const roleLS = localStorage.getItem('role');
      const userIdLS = localStorage.getItem('user_id');
      const token = localStorage.getItem('login_token');

      // Decode JWT (if present) to extract id/name reliably
      let idFromToken = null;
      let nameFromToken = null;
      if (token) {
        const payload = decodeToken(token);
        if (payload) {
          idFromToken = payload.id || payload.user_id || payload.sub || null;
          nameFromToken = payload.name || payload.username || payload.preferred_username || null;
        }
      }

      const currentUser = {
        id: (idFromToken ?? userIdLS) ? Number(idFromToken ?? userIdLS) : null,
        name: nameFromToken || usernameLS || null,
        role: roleLS || null,
      };

      console.log('Resolved currentUser:', currentUser);
      return currentUser;
    } catch (error) {
      console.error('Error getting current user info:', error);
      return { id: null, name: null, role: null };
    }
  };
  
  // Initialize employee details from current user session
  const initializeEmployeeDetails = async () => {
    try {
      const userInfo = await getCurrentUserInfo();
      const { username, role, user_id } = userInfo;
      
      console.log('Initializing employee details:', {
        username: username,
        role: role,
        stored_user_id: user_id,
        current_employee_id_state: employeeId,
        current_employee_name_state: employeeName
      });
      
      // Set employee name if not already set
      if (!employeeName && username) {
        setEmployeeName(username);
      }
      
      // Try to get user_id from stored data
      if (!employeeId) {
        if (user_id && Number(user_id) > 0) {
          setEmployeeId(user_id);
          console.log('Set employee_id from localStorage:', user_id);
        } else {
          // If no user_id in localStorage, we'll rely on the backend to resolve it
          // The backend will use current_user["id"] from the JWT token
          console.log('No user_id in localStorage, backend will resolve from JWT token');
        }
      }
    } catch (error) {
      console.error('Error initializing employee details:', error);
    }
  };
  useEffect(() => { if (selectedWarehouse) loadInventoryItems(); }, [selectedWarehouse]);

  const addSaleItem = () => {
    setSaleItems([...saleItems, { item_name: '', quantity: 1, unit_price: 0 }]);
  };

  const removeSaleItem = (idx) => {
    setSaleItems(saleItems.filter((_, i) => i !== idx));
  };

  // Handle sale item selection from dropdown (auto-add, no duplicates, increment qty)
  const handleSaleItemSelect = (selectedName) => {
    if (!selectedName) return;
    const trimmed = selectedName.trim();
    if (!trimmed) return;
    
    // Check if item already exists
    const existingIdx = saleItems.findIndex(it => (it.item_name || '').trim() === trimmed);
    if (existingIdx !== -1) {
      // Item exists, increment quantity and move to top
      const updated = [...saleItems];
      const updatedItem = { ...updated[existingIdx], quantity: (Number(updated[existingIdx].quantity) || 0) + 1 };
      updated.splice(existingIdx, 1); // Remove from current position
      setSaleItems([updatedItem, ...updated]); // Add to top
    } else {
      // Add new item to top
      const inv = inventoryItems[trimmed] || {};
      setSaleItems([{
        item_name: trimmed,
        quantity: 1,
        unit_price: inv.price || 0,
        item_id: inv.item_id,
      }, ...saleItems]);
    }
    // Reset dropdown
    setSaleSelectName('');
  };

  // Calculation functions
  const calculateItemTotal = (quantity, unitPrice) => {
    return (Number(quantity) || 0) * (Number(unitPrice) || 0);
  };

  const calculateSubtotal = () => {
    return saleItems.reduce((sum, item) => {
      return sum + calculateItemTotal(item.quantity, item.unit_price);
    }, 0);
  };

  const calculateVATAmount = (subtotal) => {
    if (!applyVAT) return 0;
    return subtotal * (Number(vatRate) || 0) / 100;
  };

  const calculateDiscountAmount = (subtotalWithVat) => {
    const discountVal = Number(discountValue) || 0;
    if (discountType === 'None' || discountVal <= 0) return 0;
    
    if (discountType === 'Percentage') {
      return subtotalWithVat * discountVal / 100;
    } else if (discountType === 'Fixed Amount') {
      return discountVal;
    }
    return 0;
  };

  const calculateGrandTotal = () => {
    const subtotal = calculateSubtotal();
    const vatAmount = calculateVATAmount(subtotal);
    const subtotalWithVat = subtotal + vatAmount;
    const discountAmount = calculateDiscountAmount(subtotalWithVat);
    return Math.max(subtotalWithVat - discountAmount, 0);
  };

  const updateSaleItem = (idx, field, value) => {
    const newItems = [...saleItems];
    newItems[idx][field] = value;
    if (field === 'item_name' && inventoryItems[value]) {
      newItems[idx].unit_price = inventoryItems[value].price;
      newItems[idx].item_id = inventoryItems[value].item_id;
    }
    setSaleItems(newItems);
  };

  // Upload invoice file
  const uploadInvoiceFile = async (file) => {
    if (!file) return null;
    
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('invoice_file', file);
      formData.append('desired_name', `invoice_${Date.now()}`);
      
      const response = await api.post('/sales/upload-invoice', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      
      return response.data.invoice_file_url;
    } catch (error) {
      console.error('Failed to upload invoice:', error);
      setError('Failed to upload invoice: ' + (error.response?.data?.detail || error.message));
      return null;
    } finally {
      setLoading(false);
    }
  };

  // Handle invoice file change
  const handleInvoiceFileChange = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    
    // Validate file type
    const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'application/pdf'];
    if (!validTypes.includes(file.type)) {
      setError('Invalid file type. Please upload PNG, JPG, or PDF');
      return;
    }
    
    // Validate file size (10MB limit)
    if (file.size > 10 * 1024 * 1024) {
      setError('File too large. Maximum size is 10MB.');
      return;
    }
    
    setInvoiceFile(file);
    
    // Create preview for images
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => setInvoicePreview(e.target.result);
      reader.readAsDataURL(file);
    } else {
      setInvoicePreview(null);
    }
    
    const uploadedUrl = await uploadInvoiceFile(file);
    if (uploadedUrl) {
      setInvoiceFileUrl(uploadedUrl);
      setSuccess('Invoice uploaded successfully!');
    }
  };
  
  // Camera functions for Add Sale invoice upload
  const startSaleInvoiceCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment' } 
      });
      setSaleInvoiceCameraStream(stream);
      setSaleInvoiceUsingCamera(true);
      
      // Attach stream to video element
      setTimeout(() => {
        const video = document.getElementById('sale-invoice-camera-video');
        if (video) {
          video.srcObject = stream;
        }
      }, 100);
    } catch (err) {
      setError('Failed to access camera: ' + err.message);
    }
  };
  
  const captureSaleInvoicePhoto = async () => {
    const video = document.getElementById('sale-invoice-camera-video');
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);
    
    canvas.toBlob(async (blob) => {
      const file = new File([blob], `invoice_${Date.now()}.jpg`, { type: 'image/jpeg' });
      setInvoiceFile(file);
      setInvoicePreview(canvas.toDataURL('image/jpeg'));
      
      // Upload the captured file
      const uploadedUrl = await uploadInvoiceFile(file);
      if (uploadedUrl) {
        setInvoiceFileUrl(uploadedUrl);
        setSuccess('Invoice captured and uploaded successfully!');
      }
      
      // Stop camera
      if (saleInvoiceCameraStream) {
        saleInvoiceCameraStream.getTracks().forEach(track => track.stop());
        setSaleInvoiceCameraStream(null);
      }
      setSaleInvoiceUsingCamera(false);
    }, 'image/jpeg', 0.9);
  };
  
  const stopSaleInvoiceCamera = () => {
    if (saleInvoiceCameraStream) {
      saleInvoiceCameraStream.getTracks().forEach(track => track.stop());
      setSaleInvoiceCameraStream(null);
    }
    setSaleInvoiceUsingCamera(false);
  };

  // Validate sale date for backdate restrictions
  const validateSaleDate = (selectedDate) => {
    const today = new Date().toISOString().split('T')[0];
    
    if (!canBackdateSales && selectedDate < today) {
      setError('You do not have permission to backdate sales. Please select today\'s date or later.');
      setSaleDate(today);
      return false;
    }
    
    return true;
  };

  // Handle sale date change
  const handleSaleDateChange = (event) => {
    const selectedDate = event.target.value;
    if (validateSaleDate(selectedDate)) {
      setSaleDate(selectedDate);
    }
  };

  const submitSale = async () => {
    if (!customerName.trim()) {
      setError('Customer name is required');
      return;
    }
    if (!selectedWarehouse) {
      setError('Please select a warehouse first.');
      return;
    }
    if (saleItems.length === 0) {
      setError('At least one item is required');
      return;
    }
    
    // Validate invoice upload - compulsory unless MD overrides
    if (!invoiceFileUrl && !invoiceOverride) {
      setError('Invoice upload is compulsory. Please upload an invoice before saving the sale, or enable override if you are an MD.');
      return;
    }
    
    // Validate backdate restriction
    const today = formatDate(new Date());
    if (saleDate < today && !canBackdateSales) {
      setError('You do not have permission to backdate sales. Please use today\'s date.');
      setSaleDate(today);
      return;
    }
    
    // Validate items have proper item_id and inventory data
    console.log('Validating sale items:', saleItems);
    console.log('Available inventory items:', inventoryItems);
    console.log('Selected warehouse:', selectedWarehouse);
    
    for (let i = 0; i < saleItems.length; i++) {
      const item = saleItems[i];
      if (!item.item_name || item.item_name.trim() === '') {
        setError(`Item ${i + 1}: Please select an item from the dropdown`);
        return;
      }
      
      // Clean item name and check if it exists in our inventory items map
      const cleanItemName = item.item_name.trim();
      const inventoryItem = inventoryItems[cleanItemName];
      if (!inventoryItem) {
        setError(`Item ${i + 1}: "${cleanItemName}" not found in inventory. Please refresh and reselect.`);
        console.error(`Item not in inventory:`, cleanItemName, 'Available:', Object.keys(inventoryItems));
        console.error(`Original item name: "${item.item_name}" vs cleaned: "${cleanItemName}"`);
        return;
      }
      
      // Check if item has valid item_id
      if (!inventoryItem.item_id) {
        setError(`Item ${i + 1}: "${cleanItemName}" has no item_id. Please contact support.`);
        console.error(`Item missing item_id:`, inventoryItem);
        return;
      }
      
      // Validate item_id is a valid number
      const itemId = inventoryItem.item_id;
      if (itemId === null || itemId === undefined) {
        setError(`Item ${i + 1}: "${item.item_name}" has null item_id`);
        console.error(`Item null item_id:`, inventoryItem);
        return;
      }
      
      // Convert to number if it's a string
      const numericItemId = typeof itemId === 'string' ? parseInt(itemId, 10) : itemId;
      if (isNaN(numericItemId) || numericItemId <= 0) {
        setError(`Item ${i + 1}: "${cleanItemName}" has invalid item_id: ${itemId} (parsed: ${numericItemId})`);
        console.error(`Item invalid item_id:`, inventoryItem);
        return;
      }
      
      if (!item.quantity || Number(item.quantity) <= 0) {
        setError(`Item ${i + 1}: Quantity must be greater than 0`);
        return;
      }
      if (!item.unit_price || Number(item.unit_price) <= 0) {
        setError(`Item ${i + 1}: Unit price must be greater than 0`);
        return;
      }
      
      console.log(`Item ${i + 1} validated:`, {
        name: cleanItemName,
        original_name: item.item_name,
        item_id: numericItemId,
        quantity: item.quantity,
        unit_price: item.unit_price
      });
    }
    
    setLoading(true); setError(''); setSuccess('');
    try {
      // Get logged-in user details for employee fields
      const currentUser = await getCurrentUserInfo();
      const currentUsername = currentUser?.name || localStorage.getItem('username') || '';

      console.log('Employee fields from currentUser:', {
        id: currentUser?.id,
        name: currentUser?.name,
        role: currentUser?.role,
        employeeIdState: employeeId,
      });
      
      const payload = {
        // Employee info - include from currentUser as requested
        employee_id: currentUser?.id || null,
        employee_name: currentUser?.name || null,
        
        // Sale info
        sale_date: saleDate || null,
        customer_name: customerName.trim(),
        customer_phone: customerPhone?.trim() || null,
        invoice_number: invoiceNumber?.trim() || null,
        notes: notes?.trim() || null,
        
        // Items with proper mapping - ensure all required fields are present
        items: saleItems.map((it, index) => {
          const cleanItemName = it.item_name.trim();
          const inventoryItem = inventoryItems[cleanItemName];
          if (!inventoryItem) {
            throw new Error(`Item ${index + 1}: "${cleanItemName}" not found in inventory`);
          }
          
          // Ensure item_id is a valid number
          const itemId = inventoryItem.item_id;
          const numericItemId = typeof itemId === 'string' ? parseInt(itemId, 10) : itemId;
          
          return {
            item_id: numericItemId,
            item_name: cleanItemName,
            quantity: Number(it.quantity),
            unit_price: Number(it.unit_price),
            total_amount: calculateItemTotal(it.quantity, it.unit_price),
            warehouse_name: selectedWarehouse || null
          };
        }),
        
        // VAT and discount
        apply_vat: applyVAT,
        vat_rate: applyVAT ? (Number(vatRate) || 0) : 0,
        discount_type: discountType,
        discount_value: Number(discountValue) || 0,
        
        // Payment info
        payment_method: paymentMethod,
        payment_status: paymentStatus,
        amount_customer_paid: Number(amountPaid) || 0,
        due_date: dueDate || null,
        
        // Partial payment details (if applicable)
        partial_payment_amount: paymentStatus === 'partial' ? Number(amountPaid) : null,
        partial_payment_date: paymentStatus === 'partial' ? saleDate : null,
        partial_payment_note: paymentStatus === 'partial' ? notes : null,
        
        // Invoice file URL and override
        invoice_file_url: invoiceFileUrl || null,
        invoice_override: invoiceOverride
      };
      
      console.log('=== SALE SUBMISSION DEBUG ===');
      console.log('Selected warehouse:', selectedWarehouse);
      console.log('Inventory items available:', Object.keys(inventoryItems).length);
      console.log('Sale items count:', saleItems.length);
      console.log('Full payload being submitted:', JSON.stringify(payload, null, 2));
      console.log('Items in payload:', payload.items.map(item => ({
        item_id: item.item_id,
        item_name: item.item_name,
        warehouse_name: item.warehouse_name
      })));
      console.log('================================');
      
      const response = await api.post('/sales/batch', payload);
      console.log('Sale response:', response.data);
      
      setSuccess(`Sale recorded successfully! Final total: ₦${calculateGrandTotal().toLocaleString()}`);
      
      // Reset form
      setCustomerName('');
      setCustomerPhone('');
      setSaleItems([]);
      setAmountPaid(0);
      setNotes('');
      setInvoiceNumber('');
      setInvoiceFile(null);
      setInvoiceFileUrl('');
      setInvoicePreview(null);
      setDueDate('');
      setCustomerId(null);
      setSaleDate(formatDate(today)); // Reset to today
      
      // Clean up camera if active
      if (saleInvoiceCameraStream) {
        saleInvoiceCameraStream.getTracks().forEach(track => track.stop());
        setSaleInvoiceCameraStream(null);
      }
      setSaleInvoiceUsingCamera(false);
      
      // Reload sales data if on List tab
      if (tab === 'List') {
        loadList();
      }
    } catch (e) {
      console.error('Sale submission error:', e);
      const errorMsg = e.response?.data?.detail || e.message;
      setError('Failed to create sale: ' + errorMsg);
    } finally { setLoading(false); }
  };
  
  // Cleanup camera on unmount or tab change
  useEffect(() => {
    return () => {
      if (saleInvoiceCameraStream) {
        saleInvoiceCameraStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [saleInvoiceCameraStream]);

  // Proforma functions
  const addProformaItem = () => {
    setProformaItems([...proformaItems, { item_name: '', quantity: 1, unit_price: 0 }]);
  };

  const removeProformaItem = (idx) => {
    setProformaItems(proformaItems.filter((_, i) => i !== idx));
  };

  // Handle proforma item selection from autocomplete (auto-add, no duplicates, increment qty)
  const handleProformaItemSelect = (selectedName) => {
    if (!selectedName) return;
    const trimmed = selectedName.trim();
    if (!trimmed) return;
    
    // Check if item already exists
    const existingIdx = proformaItems.findIndex(it => (it.item_name || '').trim() === trimmed);
    if (existingIdx !== -1) {
      // Item exists, increment quantity and move to top
      const updated = [...proformaItems];
      const updatedItem = { ...updated[existingIdx], quantity: (Number(updated[existingIdx].quantity) || 0) + 1 };
      updated.splice(existingIdx, 1); // Remove from current position
      setProformaItems([updatedItem, ...updated]); // Add to top
    } else {
      // Add new item to top
      const inv = inventoryItems[trimmed] || {};
      setProformaItems([{
        item_name: trimmed,
        quantity: 1,
        unit_price: inv.price || 0,
        item_id: inv.item_id,
      }, ...proformaItems]);
    }
    // Reset search input
    setProformaItemSearchInput('');
  };

  const updateProformaItem = (idx, field, value) => {
    const newItems = [...proformaItems];
    newItems[idx][field] = value;
    if (field === 'item_name' && inventoryItems[value]) {
      newItems[idx].unit_price = inventoryItems[value].price;
      newItems[idx].item_id = inventoryItems[value].item_id;
    }
    setProformaItems(newItems);
  };

  // Proforma calculations
  const calculateProformaSubtotal = () => {
    return proformaItems.reduce((sum, item) => {
      return sum + calculateItemTotal(item.quantity, item.unit_price);
    }, 0);
  };

  const calculateProformaVATAmount = (subtotal) => {
    if (!proformaApplyVAT) return 0;
    return subtotal * (Number(proformaVatRate) || 0) / 100;
  };

  const calculateProformaDiscountAmount = (subtotalWithVat) => {
    const val = Number(proformaDiscountValue) || 0;
    if (proformaDiscountType === 'None' || val <= 0) return 0;
    if (proformaDiscountType === 'Percentage') return subtotalWithVat * val / 100;
    if (proformaDiscountType === 'Fixed Amount') return val;
    return 0;
  };

  const calculateProformaTotal = () => {
    const subtotal = calculateProformaSubtotal();
    const vat = calculateProformaVATAmount(subtotal);
    const subtotalWithVat = subtotal + vat;
    const discount = calculateProformaDiscountAmount(subtotalWithVat);
    return Math.max(subtotalWithVat - discount, 0);
  };

  const submitProforma = async () => {
    if (!proformaCustomer.trim()) {
      setError('Customer name is required');
      return;
    }
    if (!selectedWarehouse) {
      setError('Please select a warehouse first.');
      return;
    }
    if (proformaItems.length === 0 || !proformaItems[0].item_name) {
      setError('At least one item is required');
      return;
    }
    // Validate that each selected item exists in inventory and has item_id
    for (let i = 0; i < proformaItems.length; i++) {
      const it = proformaItems[i];
      const name = (it.item_name || '').trim();
      if (!name) { setError(`Proforma item ${i+1}: select an item from the dropdown`); return; }
      const inv = inventoryItems[name];
      if (!inv || !inv.item_id) { setError(`Proforma item ${i+1}: '${name}' not found in inventory`); return; }
      if (!it.quantity || Number(it.quantity) <= 0) { setError(`Proforma item ${i+1}: quantity must be > 0`); return; }
      if (!it.unit_price || Number(it.unit_price) <= 0) { setError(`Proforma item ${i+1}: unit price must be > 0`); return; }
    }

    setLoading(true); setError(''); setSuccess('');
    try {
      const payload = {
        customer_name: proformaCustomer,
        customer_phone: proformaPhone || null,
        // VAT/discount config - server computes amounts
        apply_vat: proformaApplyVAT,
        vat_rate: proformaApplyVAT ? (Number(proformaVatRate) || 0) : 0,
        discount_type: proformaDiscountType,
        discount_value: Number(proformaDiscountValue) || 0,
        items: proformaItems.map(it => {
          const name = it.item_name.trim();
          const inv = inventoryItems[name] || {};
          return {
            item_id: inv.item_id,
            item_name: name,
            quantity: Number(it.quantity),
            unit_price: Number(it.unit_price),
            total_amount: Number(it.quantity) * Number(it.unit_price),
            warehouse_name: selectedWarehouse || null,
          };
        }),
        notes: proformaNotes || null,
      };
      await api.post('/sales/proforma', payload);
      setSuccess('Proforma invoice created successfully!');
      // Reset form
      setProformaCustomer('');
      setProformaPhone('');
      setProformaItems([]);
      setProformaApplyVAT(true);
      setProformaVatRate(7.5);
      setProformaDiscountType('None');
      setProformaDiscountValue(0);
      setProformaNotes('');
      // Refresh pending list for this (now blank) customer just in case
      setPendingProformas([]);
    } catch (e) {
      setError('Failed to create proforma: ' + (e.response?.data?.detail || e.message));
    } finally { setLoading(false); }
  };

  // Pending proformas (per customer)
  const loadPendingProformas = async () => {
    const cust = (proformaCustomer || '').trim();
    if (!cust) { setPendingProformas([]); return; }
    setLoadingPendingProformas(true);
    try {
      const res = await api.get('/sales/proforma/pending', { params: { customer_name: cust } });
      setPendingProformas(res.data || []);
    } catch (e) {
      // ignore silently, UI will show empty list
    } finally { setLoadingPendingProformas(false); }
  };

  const convertProforma = async (proformaId) => {
    // Open modal instead of showing error
    setConversionProformaId(proformaId);
    setShowConversionModal(true);
  };

  const handleConversionSubmit = async () => {
    if (!conversionInvoiceFile) {
      setError('Please upload an invoice file before conversion');
      return;
    }

    setLoading(true); setError(''); setSuccess('');
    try {
      // First upload the invoice
      const form = new FormData();
      form.append('invoice_file', conversionInvoiceFile);
      const uploadRes = await api.post(`/sales/proforma/${conversionProformaId}/upload-invoice`, form, { 
        headers: { 'Content-Type': 'multipart/form-data' } 
      });

      // Then convert the proforma
      const conversionRes = await api.post(`/sales/proforma/${conversionProformaId}/convert`);
      const conversionData = conversionRes.data;
      
      // Build detailed success message with inventory updates
      let successMsg = `✅ Proforma successfully converted to Sale\n\n`;
      successMsg += `📊 Sales Created: ${conversionData.items_count || 0} items\n`;
      
      if (conversionData.inventory_updates && conversionData.inventory_updates.length > 0) {
        successMsg += `\n📦 Inventory Updated:\n`;
        conversionData.inventory_updates.forEach((update, idx) => {
          const action = update.action === 'created' ? '➕ Created' : 
                         update.action === 'updated' ? '♻️ Updated' : 
                         update.action === 'skipped' ? '⏭️ Skipped' :
                         '⚠️ ' + update.action;
          successMsg += `  ${idx + 1}. ${update.item_name}\n`;
          successMsg += `     ${action} - Stock Out: ${update.stock_out || 0}\n`;
          
          // Show error details if action failed
          if (update.action === 'failed' && update.error) {
            successMsg += `     Error: ${update.error}\n`;
          }
        });
      }
      
      setSuccess(successMsg);
      
      // Close modal and reset state
      setShowConversionModal(false);
      setConversionProformaId(null);
      setConversionInvoiceFile(null);
      setConversionInvoicePreview(null);
      
      // Refresh lists
      await loadPendingProformas();
      if (tab === 'List') loadList();
      if (tab === 'Proforma List') loadAllProformas();
    } catch (e) {
      const errorMsg = e.response?.data?.detail || e.message;
      
      // Handle specific error cases with friendly messages
      if (errorMsg.includes('Create employee profile')) {
        setError('⚠️ Create employee profile for this user before converting Proforma. Go to Settings > Employees to add your employee record.');
      } else if (errorMsg.includes('Employee ID cannot be NULL')) {
        setError('⚠️ Employee profile required. Please create your employee record in Settings > Employees before converting proformas.');
      } else if (errorMsg.includes('already been converted')) {
        setError('⛔ This proforma has already been converted to sales. Check the Sales List tab for the converted records.');
      } else if (errorMsg.includes('Invoice already uploaded')) {
        setError('📎 Invoice already uploaded for this proforma. The invoice file has been uploaded previously.');
      } else if (errorMsg.includes('Upload invoice')) {
        setError('Please upload an invoice file before conversion');
      } else {
        setError(`Conversion failed: ${errorMsg}`);
      }
    } finally {
      setLoading(false); 
      if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
        setCameraStream(null);
      }
      setUsingCamera(false);
    }
  };

  const handleConversionFileChange = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    // Validate file type
    const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'application/pdf'];
    if (!validTypes.includes(file.type)) {
      setError('Invalid file type. Please upload PNG, JPG, or PDF');
      return;
    }

    // Validate file size (10MB limit)
    if (file.size > 10 * 1024 * 1024) {
      setError('File too large. Maximum size is 10MB.');
      return;
    }

    setConversionInvoiceFile(file);
    
    // Create preview for images
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => setConversionInvoicePreview(e.target.result);
      reader.readAsDataURL(file);
    } else {
      setConversionInvoicePreview(null);
    }
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment' } 
      });
      setCameraStream(stream);
      setUsingCamera(true);
      
      // Attach stream to video element
      setTimeout(() => {
        const video = document.getElementById('camera-video');
        if (video) {
          video.srcObject = stream;
        }
      }, 100);
    } catch (err) {
      setError('Failed to access camera: ' + err.message);
    }
  };

  const capturePhoto = () => {
    const video = document.getElementById('camera-video');
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);
    
    canvas.toBlob((blob) => {
      const file = new File([blob], `invoice_${Date.now()}.jpg`, { type: 'image/jpeg' });
      setConversionInvoiceFile(file);
      setConversionInvoicePreview(canvas.toDataURL('image/jpeg'));
      
      // Stop camera
      if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
        setCameraStream(null);
      }
      setUsingCamera(false);
    }, 'image/jpeg', 0.9);
  };

  const closeConversionModal = () => {
    setShowConversionModal(false);
    setConversionProformaId(null);
    setConversionInvoiceFile(null);
    setConversionInvoicePreview(null);
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      setCameraStream(null);
    }
    setUsingCamera(false);
    setError('');
  };

  const handleProformaInvoiceUpload = async (proformaId, file) => {
    if (!file) return;
    setLoading(true); setError(''); setSuccess('');
    try {
      const form = new FormData();
      form.append('invoice_file', file);
      const res = await api.post(`/sales/proforma/${proformaId}/upload-invoice`, form, { headers: { 'Content-Type': 'multipart/form-data' } });
      const url = res.data?.invoice_url;
      setPendingProformas(prev => prev.map(p => p.proforma_id === proformaId ? { ...p, invoice_url: url } : p));
      setSuccess('Invoice uploaded for proforma ' + proformaId);
    } catch (e) {
      setError('Failed to upload invoice: ' + (e.response?.data?.detail || e.message));
    } finally { setLoading(false); }
  };

  useEffect(() => { if (tab === 'Proforma') loadPendingProformas(); }, [tab, proformaCustomer]);

  // Receipt functions for Add Sale page
  const loadReceiptCustomers = async () => {
    setLoading(true); setError('');
    try {
      // Load unique customers from both tables
      const res = await api.get('/sales/customers');
      const customers = res.data || [];
      // Sort by name descending (latest customers first based on most recent sales)
      setReceiptCustomerList(customers);
    } catch (e) {
      setError('Failed to load customers: ' + (e.response?.data?.detail || e.message));
    } finally { setLoading(false); }
  };

  const loadReceiptSales = async () => {
    setLoading(true); setError('');
    try {
      // Load sales from both master log and history
      const res = await api.get('/sales/for-receipt', {
        params: {
          date: receiptDateFilter,
          customer_name: receiptCustomerFilter || null
        }
      });
      const sales = res.data || [];
      // Sort by date descending (newest first)
      sales.sort((a, b) => {
        const dateA = new Date(a.sale_date || a.date);
        const dateB = new Date(b.sale_date || b.date);
        return dateB - dateA;
      });
      setReceiptSales(sales);
    } catch (e) {
      setError('Failed to load sales: ' + (e.response?.data?.detail || e.message));
    } finally { setLoading(false); }
  };

  const generateReceiptForSale = async (saleId, format, action = 'download') => {
    setLoading(true); setError(''); setSuccess('');
    try {
      // Find the sale to get customer_name and date
      const sale = receiptSales.find(s => s.sale_id === saleId);
      if (!sale) {
        setError('Sale not found');
        setLoading(false);
        return;
      }
      
      const customer_name = sale.customer_name || 'Walk-in Customer';
      const date_raw = sale.sale_date || sale.date;
      const pdf_format = format;
      
      console.log('✅ Sending Receipt FormData:', customer_name, date_raw, pdf_format);
      
      // Create FormData (browser will auto-set correct Content-Type with boundary)
      const formData = new FormData();
      formData.append('customer_name', customer_name);
      formData.append('date_raw', date_raw);
      formData.append('pdf_format', pdf_format);
      
      // Use plain fetch() with authentication token
      const token = localStorage.getItem('login_token');
      const response = await fetch(`${REACT_APP_API_URL}/sales/receipt/pdf`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData,
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        console.error('❌ Receipt error:', errorData);
        setError('Failed to generate receipt: ' + errorData.detail);
        setLoading(false);
        return;
      }
      
      const data = await response.json();
      console.log('✅ Receipt PDF Generated:', data);
      
      const pdfBase64 = data.pdf_base64;
      const blob = new Blob([Uint8Array.from(atob(pdfBase64), c => c.charCodeAt(0))], { type: 'application/pdf' });
      
      if (action === 'print') {
        // Open in new window for printing
        const url = URL.createObjectURL(blob);
        const printWindow = window.open(url);
        if (printWindow) {
          printWindow.onload = () => {
            printWindow.print();
          };
        }
        URL.revokeObjectURL(url);
        setSuccess('Receipt opened for printing!');
      } else {
        // Download
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `receipt_${saleId}_${format}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
        setSuccess('Receipt downloaded successfully!');
      }
    } catch (e) {
      setError('Failed to generate receipt: ' + (e.response?.data?.detail || e.message));
    } finally { setLoading(false); }
  };

  const sendReceiptEmailForSale = async (saleId, email, format) => {
    if (!email.trim()) {
      setError('Email address is required');
      return;
    }
    setLoading(true); setError(''); setSuccess('');
    try {
      // Find the sale to get customer_name and date
      const sale = receiptSales.find(s => s.sale_id === saleId);
      if (!sale) {
        setError('Sale not found');
        setLoading(false);
        return;
      }
      
      const customer_name = sale.customer_name || 'Walk-in Customer';
      const sale_date = sale.sale_date || sale.date;
      
      await api.post('/sales/receipt/email', {
        customer_email: email,
        customer_name: customer_name,
        sale_date: sale_date,
        pdf_format: format
      });
      setSuccess(`Receipt sent to ${email} successfully!`);
    } catch (e) {
      setError('Failed to send receipt: ' + (e.response?.data?.detail || e.message));
    } finally { setLoading(false); }
  };

  // Load report
  const loadReport = async () => {
    setLoading(true); setError('');
    try {
      const res = await api.get('/sales/reports/summary', {
        params: { start_date: reportStart, end_date: reportEnd, limit: 10 }
      });
      setReportData(res.data);
    } catch (e) {
      setError('Failed to load report: ' + (e.response?.data?.detail || e.message));
    } finally { setLoading(false); }
  };

  useEffect(() => { if (tab === 'Report') loadReport(); }, [tab]);

  // Load all proformas
  const loadAllProformas = async () => {
    setLoading(true); setError('');
    try {
      const res = await api.get('/sales/proforma/all');
      const data = res.data || [];
      setAllProformas(data);
      setFilteredProformas(data);
      setProformaPage(1);
    } catch (e) {
      setError('Failed to load proformas: ' + (e.response?.data?.detail || e.message));
    } finally { setLoading(false); }
  };

  useEffect(() => { if (tab === 'Proforma List') loadAllProformas(); }, [tab]);

  // Apply proforma filters
  const applyProformaFilter = () => {
    let result = [...allProformas];
    
    // Filter by customer
    if (proformaFilterCustomer.trim()) {
      result = result.filter(p => 
        (p.customer_name || '').toLowerCase().includes(proformaFilterCustomer.toLowerCase())
      );
    }
    
    // Filter by status
    if (proformaFilterStatus !== 'all') {
      result = result.filter(p => p.status === proformaFilterStatus);
    }
    
    // Filter by date range
    if (proformaFilterStart) {
      result = result.filter(p => (p.date || p.created_at) >= proformaFilterStart);
    }
    if (proformaFilterEnd) {
      result = result.filter(p => (p.date || p.created_at) <= proformaFilterEnd);
    }
    
    setFilteredProformas(result);
    setProformaPage(1);
  };

  // Download proforma as PDF or Thermal
  const downloadProforma = async (proformaId, format = 'A4') => {
    setLoading(true); setError(''); setSuccess('');
    try {
      const res = await api.post('/sales/proforma/pdf', {
        proforma_id: proformaId,
        format: format
      });
      const pdfBase64 = res.data.pdf_base64;
      const blob = new Blob([Uint8Array.from(atob(pdfBase64), c => c.charCodeAt(0))], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `proforma_${proformaId}_${format}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      setSuccess(`Proforma ${proformaId} downloaded successfully!`);
    } catch (e) {
      setError('Failed to download proforma: ' + (e.response?.data?.detail || e.message));
    } finally { setLoading(false); }
  };

  // Delete proforma
  const deleteProforma = async (proformaId) => {
    if (!canDeleteProforma) {
      setError('You do not have permission to delete proforma invoices.');
      return;
    }
    
    if (!window.confirm(`Are you sure you want to delete Proforma #${proformaId}? This action cannot be undone.`)) {
      return;
    }
    
    setLoading(true); setError(''); setSuccess('');
    try {
      await api.delete(`/sales/proforma/${proformaId}`);
      setSuccess(`Proforma #${proformaId} deleted successfully!`);
      // Refresh the list
      loadAllProformas();
    } catch (e) {
      setError('Failed to delete proforma: ' + (e.response?.data?.detail || e.message));
    } finally { setLoading(false); }
  };

  // Delete sale
  const deleteSale = async (saleId) => {
    if (!canDeleteSales) {
      setError('You do not have permission to delete sales.');
      return;
    }
    
    if (!window.confirm(`Are you sure you want to delete Sale #${saleId}? This will revert inventory changes. This action cannot be undone.`)) {
      return;
    }
    
    setLoading(true); setError(''); setSuccess('');
    try {
      await api.delete(`/sales/${saleId}`);
      setSuccess(`Sale #${saleId} deleted successfully!`);
      // Refresh the list
      if (tab === 'List') {
        loadList();
      } else if (tab === 'Filter') {
        applyFilter();
      }
    } catch (e) {
      setError('Failed to delete sale: ' + (e.response?.data?.detail || e.message));
    } finally { setLoading(false); }
  };

  // Report interpretations
  const interpretPaymentMethods = () => {
    const data = reportData?.payment_method_summary || [];
    if (!data.length) return 'No payment method data for the selected range.';
    const total = data.reduce((s, d) => s + (Number(d.total_sales) || 0), 0);
    const sorted = [...data].sort((a, b) => (b.total_sales || 0) - (a.total_sales || 0));
    const top = sorted[0];
    const pct = total > 0 ? ((top.total_sales / total) * 100).toFixed(1) : '0.0';
    return `Customers mostly pay with ${top.payment_method} (${pct}%).`;
  };

  // Simple polyfit (degree 2) using normal equations; falls back to linear if singular
  const polyfit2 = (xs, ys) => {
    const n = xs.length;
    if (n < 2) return { a0: ys[0] || 0, a1: 0, a2: 0 };
    // Build sums for normal equations
    let Sx=0,Sx2=0,Sx3=0,Sx4=0,Sy=0,Sxy=0,Sx2y=0;
    for (let i=0;i<n;i++){
      const x=xs[i], y=ys[i];
      const x2=x*x, x3=x2*x, x4=x3*x;
      Sx+=x; Sx2+=x2; Sx3+=x3; Sx4+=x4; Sy+=y; Sxy+=x*y; Sx2y+=x2*y;
    }
    // Solve 3x3 system:
    // [ n   Sx   Sx2 ] [a0]   [ Sy   ]
    // [ Sx  Sx2  Sx3 ] [a1] = [ Sxy  ]
    // [ Sx2 Sx3  Sx4 ] [a2]   [ Sx2y ]
    const A = [
      [n,   Sx,  Sx2],
      [Sx,  Sx2, Sx3],
      [Sx2, Sx3, Sx4]
    ];
    const B = [Sy, Sxy, Sx2y];
    const det = (m) => (
      m[0][0]*(m[1][1]*m[2][2]-m[1][2]*m[2][1]) -
      m[0][1]*(m[1][0]*m[2][2]-m[1][2]*m[2][0]) +
      m[0][2]*(m[1][0]*m[2][1]-m[1][1]*m[2][0])
    );
    const inv3 = (m) => {
      const d = det(m);
      if (Math.abs(d) < 1e-9) return null;
      const inv = [[0,0,0],[0,0,0],[0,0,0]];
      inv[0][0] =  (m[1][1]*m[2][2]-m[1][2]*m[2][1])/d;
      inv[0][1] = -(m[0][1]*m[2][2]-m[0][2]*m[2][1])/d;
      inv[0][2] =  (m[0][1]*m[1][2]-m[0][2]*m[1][1])/d;
      inv[1][0] = -(m[1][0]*m[2][2]-m[1][2]*m[2][0])/d;
      inv[1][1] =  (m[0][0]*m[2][2]-m[0][2]*m[2][0])/d;
      inv[1][2] = -(m[0][0]*m[1][2]-m[0][2]*m[1][0])/d;
      inv[2][0] =  (m[1][0]*m[2][1]-m[1][1]*m[2][0])/d;
      inv[2][1] = -(m[0][0]*m[2][1]-m[0][1]*m[2][0])/d;
      inv[2][2] =  (m[0][0]*m[1][1]-m[0][1]*m[1][0])/d;
      return inv;
    };
    const invA = inv3(A);
    if (!invA) {
      // linear fallback y = a0 + a1 x
      let Sx=0,Sx2=0,Sy=0,Sxy=0; const n=xs.length;
      for (let i=0;i<n;i++){ const x=xs[i], y=ys[i]; Sx+=x; Sx2+=x*x; Sy+=y; Sxy+=x*y; }
      const denom = (n*Sx2 - Sx*Sx) || 1;
      const a1 = (n*Sxy - Sx*Sy)/denom;
      const a0 = (Sy - a1*Sx)/n;
      return { a0, a1, a2: 0 };
    }
    const a0 = invA[0][0]*B[0] + invA[0][1]*B[1] + invA[0][2]*B[2];
    const a1 = invA[1][0]*B[0] + invA[1][1]*B[1] + invA[1][2]*B[2];
    const a2 = invA[2][0]*B[0] + invA[2][1]*B[1] + invA[2][2]*B[2];
    return { a0, a1, a2 };
  };

  const interpretTimeseriesChart = () => {
    const ts = reportData?.timeseries || [];
    if (!ts.length) return 'No daily sales in this period.';
    
    // Handle single data point
    if (ts.length === 1) {
      return `Only one day of sales data available (₦${Number(ts[0].total_sales || 0).toLocaleString()}). Need more data for trend analysis.`;
    }
    
    const xs = ts.map((_, i) => i);
    const ys = ts.map(t => Number(t.total_sales) || 0);
    
    // Calculate polyfit
    const { a0, a1, a2 } = polyfit2(xs, ys);
    
    // Calculate slope at the last point (derivative of polynomial)
    const lastX = xs[xs.length - 1] || 0;
    const slopeLast = a1 + 2 * a2 * lastX;
    
    // Determine trend based on slope
    let trend = '';
    let trendIcon = '';
    if (slopeLast > 100) {
      trend = 'significantly increased';
      trendIcon = '📈';
    } else if (slopeLast > 10) {
      trend = 'increased';
      trendIcon = '📈';
    } else if (slopeLast > -10) {
      trend = 'remained relatively stable';
      trendIcon = '➡️';
    } else if (slopeLast > -100) {
      trend = 'decreased';
      trendIcon = '📉';
    } else {
      trend = 'significantly decreased';
      trendIcon = '📉';
    }
    
    // Calculate total and average
    const totalSales = ys.reduce((sum, val) => sum + val, 0);
    const avgSales = totalSales / ys.length;
    
    // Find peak and lowest days
    const maxSales = Math.max(...ys);
    const minSales = Math.min(...ys);
    const maxIdx = ys.indexOf(maxSales);
    const minIdx = ys.indexOf(minSales);
    
    return `${trendIcon} Sales have ${trend} over this ${ts.length}-day period. Average daily sales: ₦${avgSales.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}. Peak: ₦${maxSales.toLocaleString()} on ${ts[maxIdx]?.sale_date || 'N/A'}. Lowest: ₦${minSales.toLocaleString()} on ${ts[minIdx]?.sale_date || 'N/A'}.`;
  };

  const Table = ({ data, page, setPage }) => {
    const startIdx = (page - 1) * recordsPerPage;
    const endIdx = startIdx + recordsPerPage;
    const paginatedData = data.slice(startIdx, endIdx);
    const totalPages = Math.ceil(data.length / recordsPerPage);

    return (
      <div className="bg-white rounded shadow p-4">
        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left border-b">
                <th className="py-2 px-3">Date</th>
                <th className="py-2 px-3">Customer</th>
                <th className="py-2 px-3">Item</th>
                <th className="py-2 px-3">Qty</th>
                <th className="py-2 px-3">Unit</th>
                <th className="py-2 px-3">Total</th>
                <th className="py-2 px-3">Status</th>
                <th className="py-2 px-3">Method</th>
                {canDeleteSales && <th className="py-2 px-3">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {paginatedData.map((row, idx) => (
                <tr key={row.sale_id || idx} className="border-b hover:bg-gray-50">
                  <td className="py-2 px-3">{row.sale_date || row.date || ''}</td>
                  <td className="py-2 px-3">{row.customer_name || 'Walk-in Customer'}</td>
                  <td className="py-2 px-3">{row.item_name || 'Unknown Item'}</td>
                  <td className="py-2 px-3">{row.quantity ?? ''}</td>
                  <td className="py-2 px-3">₦{Number(row.unit_price || 0).toLocaleString()}</td>
                  <td className="py-2 px-3">₦{Number(row.total_amount || 0).toLocaleString()}</td>
                  <td className="py-2 px-3 capitalize">{row.payment_status || ''}</td>
                  <td className="py-2 px-3 capitalize">{row.payment_method || ''}</td>
                  {canDeleteSales && (
                    <td className="py-2 px-3">
                      <button
                        onClick={() => deleteSale(row.sale_id)}
                        disabled={loading || !row.sale_id}
                        className="px-2 py-1 rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-xs"
                        title="Delete Sale"
                      >
                        Delete
                      </button>
                    </td>
                  )}
                </tr>
              ))}
              {paginatedData.length === 0 && (
                <tr>
                  <td colSpan={canDeleteSales ? "9" : "8"} className="py-4 text-center text-gray-500">No records found</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {data.length > recordsPerPage && (
          <div className="flex items-center justify-between mt-4">
            <div className="text-sm text-gray-600">
              Showing {startIdx + 1} to {Math.min(endIdx, data.length)} of {data.length} records
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page === 1}
                className="px-3 py-1 rounded bg-gray-100 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <span className="px-3 py-1 text-sm text-gray-600">Page {page} of {totalPages}</span>
              <button
                onClick={() => setPage(Math.min(totalPages, page + 1))}
                disabled={page === totalPages}
                className="px-3 py-1 rounded bg-gray-100 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold text-gray-900">Sales</h1>
        <div className="flex gap-2 flex-wrap">
          <TabButton 
            key="List" 
            active={tab==='List'} 
            onClick={() => setTab('List')}
            title="View all sales transactions"
          >
            List
          </TabButton>
          <TabButton 
            key="Add Sale" 
            active={tab==='Add Sale'} 
            onClick={() => setTab('Add Sale')}
            title="Create a new sale with immediate payment"
          >
            Add Sale
          </TabButton>
          <TabButton 
            key="Proforma" 
            active={tab==='Proforma'} 
            onClick={() => setTab('Proforma')}
            title="Create a proforma invoice for quotations or credit sales"
          >
            Proforma
          </TabButton>
          <TabButton 
            key="Proforma List" 
            active={tab==='Proforma List'} 
            onClick={() => setTab('Proforma List')}
            title="View and manage all proforma invoices"
          >
            Proforma List
          </TabButton>
          <TabButton 
            key="Filter" 
            active={tab==='Filter'} 
            onClick={() => setTab('Filter')}
            title="Search and filter sales by customer, date, or status"
          >
            Filter
          </TabButton>
          <TabButton 
            key="Pending" 
            active={tab==='Pending'} 
            onClick={() => setTab('Pending')}
            title="View all unpaid and partially paid transactions"
          >
            Pending
          </TabButton>
          <TabButton 
            key="Report" 
            active={tab==='Report'} 
            onClick={() => setTab('Report')}
            title="Generate sales reports and analytics"
          >
            Report
          </TabButton>
        </div>
        {canConnectPOS && (
          <div className="ml-auto">
            <button
              onClick={() => navigate('/dashboard/settings')}
              className="px-3 py-2 rounded bg-purple-600 text-white hover:bg-purple-700"
              title="Connect your POS or Bank Account"
            >
              Connect POS or Account
            </button>
          </div>
        )}
      </div>

      {error && <div className="bg-red-50 text-red-700 border border-red-200 px-3 py-2 rounded whitespace-pre-line">{error}</div>}
      {success && <div className="bg-green-50 text-green-700 border border-green-200 px-3 py-2 rounded whitespace-pre-line font-mono text-sm">{success}</div>}

      {tab === 'List' && (
        <div className="space-y-3">
          <div className="flex items-center gap-3 flex-wrap">
            <button 
              onClick={() => { setCurrentPage(1); loadList(); }} 
              className="px-3 py-2 rounded bg-blue-600 text-white hover:bg-blue-700"
              title="Reload the sales list from database"
            >
              Refresh
            </button>
            <button 
              onClick={() => downloadCSV(rows, `sales_${formatDate(today)}.csv`)} 
              className="px-3 py-2 rounded bg-green-600 text-white hover:bg-green-700"
              title="Export all sales records to CSV file"
            >
              Download All
            </button>
            <div className="bg-gray-100 px-3 py-2 rounded text-sm">
              Records: {rows.length} | Auth: {localStorage.getItem('login_token') ? '✅' : '❌'}
            </div>
          </div>
          {rows.length === 0 && !loading && (
            <div className="bg-yellow-50 border border-yellow-200 rounded p-4">
              <h3 className="font-medium text-yellow-800">No Sales Records Found</h3>
              <p className="text-yellow-700 text-sm mt-1">
                This could mean:
              </p>
              <ul className="text-yellow-700 text-sm mt-2 list-disc list-inside">
                <li>No sales have been recorded yet</li>
                <li>Database connection issues</li>
                <li>Authentication problems</li>
              </ul>
              <p className="text-yellow-700 text-sm mt-2">
                Try: Create a sample sale using the "Add Sale" tab.
              </p>
            </div>
          )}
          <Table data={rows} page={currentPage} setPage={setCurrentPage} />
        </div>
      )}

      {tab === 'Add Sale' && (
        <div className="bg-white rounded shadow p-6 space-y-4">
          <h2 className="text-lg font-semibold">Add New Sale</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Sale Date *</label>
              <input 
                type="date" 
                value={saleDate} 
                onChange={handleSaleDateChange} 
                className="border rounded px-3 py-2 w-full" 
                max={canBackdateSales ? undefined : formatDate(today)}
              />
              {!canBackdateSales && (
                <div className="text-xs text-gray-500 mt-1">You do not have permission to backdate sales</div>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Warehouse</label>
              <select value={selectedWarehouse} onChange={e => setSelectedWarehouse(e.target.value)} className="border rounded px-3 py-2 w-full">
                {warehouses.map(w => <option key={w} value={w}>{w}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Invoice Number</label>
              <input value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)} className="border rounded px-3 py-2 w-full" placeholder="Enter invoice number" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Customer Name *</label>
              <input value={customerName} onChange={e => setCustomerName(e.target.value)} className="border rounded px-3 py-2 w-full" placeholder="Enter customer name" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Customer Phone</label>
              <input value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} className="border rounded px-3 py-2 w-full" placeholder="Enter phone number" />
            </div>
            {paymentStatus === 'credit' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Due Date</label>
                <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className="border rounded px-3 py-2 w-full" />
              </div>
            )}
          </div>

          <div className="space-y-3">
            <label className="block text-sm font-medium text-gray-700">Items *</label>

            {/* Warehouse selection reminder */}
            {!selectedWarehouse && (
              <div className="bg-red-50 text-red-700 border border-red-200 px-3 py-2 rounded text-sm">
                Please select a warehouse first to enable barcode scan and item selection.
              </div>
            )}

            {/* Barcode add */}
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <label className="block text-xs text-gray-600 mb-1">Scan/Add via Barcode</label>
                <input
                  value={barcodeInput}
                  onChange={e => setBarcodeInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleBarcodeSubmit(); }}
                  className="border rounded px-3 py-2 w-full text-sm"
                  placeholder="Enter or scan barcode and press Enter"
                  disabled={!selectedWarehouse || loading}
                />
              </div>
              <button
                type="button"
                onClick={handleBarcodeSubmit}
                disabled={!selectedWarehouse || !barcodeInput.trim() || loading}
                className="px-4 py-2 rounded bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 text-sm"
              >
                Add
              </button>
            </div>

            {/* Item selector with autocomplete (auto-add, no duplicates) */}
            <div className="relative">
              <label className="block text-xs text-gray-600 mb-1">Or Type to Search and Select Item</label>
              <input
                type="text"
                value={saleItemSearchInput}
                onChange={e => {
                  setSaleItemSearchInput(e.target.value);
                  setShowSaleItemSuggestions(true);
                }}
                onFocus={() => setShowSaleItemSuggestions(true)}
                onBlur={() => {
                  // Delay to allow click on suggestion
                  setTimeout(() => setShowSaleItemSuggestions(false), 200);
                }}
                disabled={!selectedWarehouse || loading}
                className="border rounded px-3 py-2 w-full text-sm"
                placeholder="Type item name to search..."
              />
              
              {/* Autocomplete Suggestions Dropdown */}
              {showSaleItemSuggestions && saleSuggestedItems.length > 0 && saleItemSearchInput.trim() && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-y-auto">
                  {saleSuggestedItems.slice(0, 10).map((name, idx) => (
                    <div
                      key={idx}
                      onClick={() => {
                        handleSaleItemSelect(name);
                        setSaleItemSearchInput('');
                        setShowSaleItemSuggestions(false);
                      }}
                      className="px-3 py-2 hover:bg-blue-50 cursor-pointer text-sm border-b last:border-b-0"
                    >
                      {name}
                    </div>
                  ))}
                  {saleSuggestedItems.length > 10 && (
                    <div className="px-3 py-2 text-xs text-gray-500 italic">
                      +{saleSuggestedItems.length - 10} more items... Keep typing to narrow down
                    </div>
                  )}
                </div>
              )}
              
              <div className="text-xs text-gray-500 mt-1">
                Type to search, then click to add. Items are added at the top. Selecting an existing item increases its quantity.
              </div>
            </div>
            
            {/* Items Table Header */}
            <div className="bg-gray-50 rounded p-3">
              <div className="grid grid-cols-12 gap-2 items-center text-sm font-medium text-gray-700">
                <div className="col-span-4">Item</div>
                <div className="col-span-2">Quantity</div>
                <div className="col-span-2">Unit Price</div>
                <div className="col-span-2">Total</div>
                <div className="col-span-2">Actions</div>
              </div>
            </div>
            
            {/* Items List */}
            <div className="space-y-2">
              {saleItems.map((item, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-center p-3 bg-white border rounded">
                  <div className="col-span-4">
                    <div className="px-3 py-2 bg-gray-50 rounded text-sm">{item.item_name || '(empty)'}</div>
                  </div>
                  <div className="col-span-2">
                    <input 
                      type="number" 
                      value={item.quantity} 
                      onChange={e => updateSaleItem(idx, 'quantity', e.target.value)} 
                      className="border rounded px-3 py-2 w-full text-sm" 
                      placeholder="Qty" 
                      min="1" 
                    />
                  </div>
                  <div className="col-span-2">
                    <input 
                      type="number" 
                      value={item.unit_price} 
                      onChange={e => updateSaleItem(idx, 'unit_price', e.target.value)} 
                      className="border rounded px-3 py-2 w-full text-sm" 
                      placeholder="Price" 
                      min="0" 
                      step="0.01" 
                    />
                  </div>
                  <div className="col-span-2">
                    <div className="px-3 py-2 bg-gray-100 rounded text-sm font-medium text-right">
                      ₦{calculateItemTotal(item.quantity, item.unit_price).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                    </div>
                  </div>
                  <div className="col-span-2">
                    <button 
                      onClick={() => removeSaleItem(idx)} 
                      className="px-3 py-2 rounded bg-red-600 text-white hover:bg-red-700 text-sm w-full"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Invoice Upload Section */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold text-gray-800">Invoice Upload</h3>
              {canOverrideInvoice && (
                <button
                  type="button"
                  onClick={() => {
                    const newValue = !invoiceOverride;
                    console.log('Invoice override toggle clicked:', newValue);
                    setInvoiceOverride(newValue);
                  }}
                  className={`px-4 py-2 rounded-lg font-medium transition-all ${
                    invoiceOverride 
                      ? 'bg-blue-600 text-white hover:bg-blue-700' 
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  {invoiceOverride ? '✓ Override Enabled' : 'Enable Override'}
                </button>
              )}
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Upload Invoice {invoiceOverride ? '(Optional - Override Enabled)' : '(Required)'}
                  {!invoiceOverride && <span className="text-red-600 ml-1">*</span>}
                </label>
                
                {/* File Upload Input */}
                <div className="mb-3">
                  <input 
                    type="file" 
                    accept=".pdf,.jpg,.jpeg,.png,.gif" 
                    onChange={handleInvoiceFileChange}
                    className="border rounded px-3 py-2 w-full text-sm"
                    disabled={loading || saleInvoiceUsingCamera}
                  />
                  <div className="text-xs text-gray-500 mt-1">
                    Supported formats: PDF, JPG, PNG, GIF. Maximum size: 10MB
                  </div>
                </div>
                
                {/* Camera Button */}
                {!saleInvoiceUsingCamera && !invoiceFile && (
                  <button
                    type="button"
                    onClick={startSaleInvoiceCamera}
                    disabled={loading}
                    className="w-full px-4 py-2 rounded bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    <span>📷</span>
                    <span>Use Camera to Capture Invoice</span>
                  </button>
                )}
                
                {/* Camera View */}
                {saleInvoiceUsingCamera && (
                  <div className="space-y-3">
                    <div className="relative bg-black rounded-lg overflow-hidden">
                      <video 
                        id="sale-invoice-camera-video" 
                        autoPlay 
                        playsInline
                        className="w-full h-auto"
                        style={{ maxHeight: '400px' }}
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={captureSaleInvoicePhoto}
                        className="flex-1 px-4 py-2 rounded bg-green-600 text-white hover:bg-green-700"
                      >
                        📸 Capture Photo
                      </button>
                      <button
                        type="button"
                        onClick={stopSaleInvoiceCamera}
                        className="flex-1 px-4 py-2 rounded bg-red-600 text-white hover:bg-red-700"
                      >
                        ✕ Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
              
              {/* Preview */}
              {invoicePreview && (
                <div className="mt-3">
                  <p className="text-sm font-medium text-gray-700 mb-2">Preview:</p>
                  <img src={invoicePreview} alt="Invoice preview" className="max-w-full h-auto rounded border" style={{ maxHeight: '300px' }} />
                </div>
              )}
              
              {invoiceFile && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-green-600">✓</span>
                  <span>Selected: {invoiceFile.name}</span>
                  <button 
                    type="button" 
                    onClick={() => {
                      setInvoiceFile(null);
                      setInvoiceFileUrl('');
                      setInvoicePreview(null);
                    }}
                    className="text-red-600 hover:text-red-700 font-bold"
                  >
                    ✕
                  </button>
                </div>
              )}
              
              {invoiceFileUrl && (
                <div className="flex items-center gap-2 text-sm text-green-600">
                  <span>✓</span>
                  <span>Invoice uploaded successfully!</span>
                  <a 
                    href={invoiceFileUrl} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-700 underline"
                  >
                    View
                  </a>
                </div>
              )}
            </div>
          </div>

          {/* Grand Total Calculation Section */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="text-lg font-semibold text-blue-800 mb-3">Price Calculation</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span>Subtotal:</span>
                <span className="font-medium">₦{calculateSubtotal().toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
              </div>
              {applyVAT && (
                <div className="flex justify-between text-green-700">
                  <span>VAT ({vatRate}%):</span>
                  <span className="font-medium">₦{calculateVATAmount(calculateSubtotal()).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                </div>
              )}
              {discountType !== 'None' && Number(discountValue) > 0 && (
                <div className="flex justify-between text-orange-700">
                  <span>Discount ({discountType === 'Percentage' ? `${discountValue}%` : `₦${discountValue}`}):</span>
                  <span className="font-medium">-₦{calculateDiscountAmount(calculateSubtotal() + calculateVATAmount(calculateSubtotal())).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                </div>
              )}
              <hr className="border-blue-300" />
              <div className="flex justify-between text-lg font-bold text-blue-900">
                <span>Grand Total:</span>
                <span>₦{calculateGrandTotal().toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* VAT Toggle - Simple button-based toggle */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  const newValue = !applyVAT;
                  console.log('VAT toggle clicked:', newValue);
                  setApplyVAT(newValue);
                  if (!newValue) {
                    setVatRate(0);
                  } else {
                    setVatRate(7.5);
                  }
                }}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                  applyVAT ? 'bg-blue-600' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    applyVAT ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
              <span className="text-sm font-medium text-gray-700">
                {applyVAT ? 'VAT Applied' : 'VAT Not Applied'}
              </span>
            </div>
            {applyVAT && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">VAT Rate (%)</label>
                <input type="number" value={vatRate} onChange={e => setVatRate(e.target.value)} className="border rounded px-3 py-2 w-full" min="0" step="0.1" />
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Discount Type</label>
              <select value={discountType} onChange={e => setDiscountType(e.target.value)} className="border rounded px-3 py-2 w-full">
                <option value="None">None</option>
                <option value="Percentage">Percentage</option>
                <option value="Fixed Amount">Fixed Amount</option>
              </select>
            </div>
            {discountType !== 'None' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Discount Value</label>
                <input type="number" value={discountValue} onChange={e => setDiscountValue(e.target.value)} className="border rounded px-3 py-2 w-full" min="0" step="0.01" />
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Payment Method</label>
              <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} className="border rounded px-3 py-2 w-full">
                <option value="cash">Cash</option>
                <option value="card">Card</option>
                <option value="transfer">Transfer</option>
                <option value="none">None</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Payment Status</label>
              <select value={paymentStatus} onChange={e => setPaymentStatus(e.target.value)} className="border rounded px-3 py-2 w-full">
                <option value="paid">Paid</option>
                <option value="credit">Credit</option>
                <option value="partial">Partial</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Amount Paid</label>
              <div className="flex gap-2">
                <input type="number" value={amountPaid} onChange={e => setAmountPaid(e.target.value)} className="border rounded px-3 py-2 flex-1" min="0" step="0.01" />
                <button 
                  type="button" 
                  onClick={() => setAmountPaid(calculateGrandTotal())} 
                  className="px-3 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 text-sm"
                  title="Set to Grand Total"
                >
                  Auto
                </button>
              </div>
              <div className="text-xs text-gray-500 mt-1">
                Balance: ₦{Math.max(calculateGrandTotal() - Number(amountPaid || 0), 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} className="border rounded px-3 py-2 w-full" rows="3" placeholder="Optional notes" />
          </div>

          <div className="flex gap-3">
            <button 
              onClick={submitSale} 
              disabled={loading} 
              className="px-6 py-3 rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
              title="Save this sale transaction to the database"
            >
              {loading ? 'Submitting...' : 'Submit Sale'}
            </button>
            <button 
              onClick={() => { 
                setShowReceiptModal(true); 
                loadReceiptCustomers();
                loadReceiptSales(); 
              }} 
              className="px-6 py-3 rounded bg-purple-600 text-white hover:bg-purple-700"
              title="Generate PDF or thermal receipt for a sale"
            >
              Receipt
            </button>
          </div>
        </div>
      )}

      {/* Receipt Modal */}
      {showReceiptModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-6xl w-full max-h-[90vh] overflow-auto">
            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold">Generate Receipt</h2>
                <button 
                  onClick={() => setShowReceiptModal(false)} 
                  className="text-gray-500 hover:text-gray-700 text-2xl"
                >
                  ×
                </button>
              </div>

              {/* Success/Error Messages in Modal */}
              {error && (
                <div className="bg-red-50 text-red-700 border border-red-200 px-4 py-3 rounded">
                  {error}
                </div>
              )}
              {success && (
                <div className="bg-green-50 text-green-700 border border-green-200 px-4 py-3 rounded">
                  {success}
                </div>
              )}

              {/* Filters */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                  <input 
                    type="date" 
                    value={receiptDateFilter} 
                    onChange={e => setReceiptDateFilter(e.target.value)} 
                    className="border rounded px-3 py-2 w-full"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Customer Name *</label>
                  <select 
                    value={receiptCustomerFilter} 
                    onChange={e => setReceiptCustomerFilter(e.target.value)} 
                    className="border rounded px-3 py-2 w-full"
                  >
                    <option value="">-- Select Customer --</option>
                    {receiptCustomerList.map((customer, idx) => (
                      <option key={idx} value={customer.name}>
                        {customer.name} {customer.phone ? `(${customer.phone})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-end">
                  <button 
                    onClick={loadReceiptSales} 
                    className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 w-full"
                  >
                    Load Sales
                  </button>
                </div>
              </div>

              {/* Sales Table */}
              <div className="overflow-auto max-h-96">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr className="text-left border-b">
                      <th className="py-2 px-3">Sale ID</th>
                      <th className="py-2 px-3">Date</th>
                      <th className="py-2 px-3">Customer</th>
                      <th className="py-2 px-3">Total</th>
                      <th className="py-2 px-3">Status</th>
                      <th className="py-2 px-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {receiptSales.map((sale, idx) => (
                      <tr key={sale.sale_id || idx} className="border-b hover:bg-gray-50">
                        <td className="py-2 px-3">#{sale.sale_id}</td>
                        <td className="py-2 px-3">{sale.sale_date || sale.date}</td>
                        <td className="py-2 px-3">{sale.customer_name || 'Walk-in'}</td>
                        <td className="py-2 px-3">₦{Number(sale.grand_total || sale.total_amount || 0).toLocaleString()}</td>
                        <td className="py-2 px-3 capitalize">{sale.payment_status}</td>
                        <td className="py-2 px-3">
                          <div className="flex flex-col gap-1">
                            <div className="flex gap-1">
                              <button 
                                onClick={() => generateReceiptForSale(sale.sale_id, 'A4', 'print')} 
                                className="px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-700 text-xs"
                                disabled={loading}
                              >
                                Print PDF
                              </button>
                              <button 
                                onClick={() => generateReceiptForSale(sale.sale_id, 'THERMAL', 'print')} 
                                className="px-2 py-1 rounded bg-purple-600 text-white hover:bg-purple-700 text-xs"
                                disabled={loading}
                              >
                                Print Thermal
                              </button>
                            </div>
                            <div className="flex gap-1">
                              <button 
                                onClick={() => generateReceiptForSale(sale.sale_id, 'A4', 'download')} 
                                className="px-2 py-1 rounded bg-green-600 text-white hover:bg-green-700 text-xs"
                                disabled={loading}
                              >
                                Download PDF
                              </button>
                              <button 
                                onClick={() => generateReceiptForSale(sale.sale_id, 'THERMAL', 'download')} 
                                className="px-2 py-1 rounded bg-teal-600 text-white hover:bg-teal-700 text-xs"
                                disabled={loading}
                              >
                                Download Thermal
                              </button>
                            </div>
                            <div>
                              <input 
                                type="email" 
                                placeholder="Enter email address" 
                                className="border rounded px-2 py-1 text-xs w-full mb-1"
                                id={`email-input-${sale.sale_id}`}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    sendReceiptEmailForSale(sale.sale_id, e.target.value, receiptFormat);
                                    e.target.value = '';
                                  }
                                }}
                              />
                              <div className="flex gap-1">
                                <select 
                                  className="border rounded px-2 py-1 text-xs flex-1"
                                  onChange={(e) => setReceiptFormat(e.target.value)}
                                  value={receiptFormat}
                                >
                                  <option value="A4">PDF</option>
                                  <option value="THERMAL">Thermal</option>
                                </select>
                                <button 
                                  onClick={() => {
                                    const emailInput = document.getElementById(`email-input-${sale.sale_id}`);
                                    if (emailInput && emailInput.value.trim()) {
                                      sendReceiptEmailForSale(sale.sale_id, emailInput.value, receiptFormat);
                                      emailInput.value = '';
                                    } else {
                                      setError('Please enter an email address');
                                    }
                                  }}
                                  className="px-3 py-1 rounded bg-orange-600 text-white hover:bg-orange-700 text-xs whitespace-nowrap"
                                  disabled={loading}
                                >
                                  Send Email
                                </button>
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {receiptSales.length === 0 && (
                      <tr>
                        <td colSpan="6" className="py-4 text-center text-gray-500">No sales found. Adjust filters and click "Load Sales"</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-end">
                <button 
                  onClick={() => setShowReceiptModal(false)} 
                  className="px-4 py-2 rounded bg-gray-500 text-white hover:bg-gray-600"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'Proforma' && (
        <div className="grid md:grid-cols-3 gap-4">
          {/* Left: Proforma form */}
          <div className="bg-white rounded shadow p-6 space-y-4 md:col-span-2">
            <h2 className="text-lg font-semibold">Create Proforma Invoice</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Customer Name *</label>
                <input value={proformaCustomer} onChange={e => setProformaCustomer(e.target.value)} className="border rounded px-3 py-2 w-full" placeholder="Enter customer name" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Customer Phone</label>
                <input value={proformaPhone} onChange={e => setProformaPhone(e.target.value)} className="border rounded px-3 py-2 w-full" placeholder="Enter phone number" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Warehouse</label>
                <select value={selectedWarehouse} onChange={e => setSelectedWarehouse(e.target.value)} className="border rounded px-3 py-2 w-full">
                  {warehouses.map(w => <option key={w} value={w}>{w}</option>)}
                </select>
              </div>
            </div>

            {!selectedWarehouse && (
              <div className="bg-red-50 text-red-700 border border-red-200 px-3 py-2 rounded text-sm">
                Please select a warehouse first to populate the item dropdown.
              </div>
            )}

            <div className="space-y-3">
              <label className="block text-sm font-medium text-gray-700">Items *</label>

              {/* Item selector with autocomplete (auto-add, no duplicates) */}
              <div className="relative">
                <label className="block text-xs text-gray-600 mb-1">Type to Search and Select Item</label>
                <input
                  type="text"
                  value={proformaItemSearchInput}
                  onChange={e => {
                    setProformaItemSearchInput(e.target.value);
                    setShowProformaItemSuggestions(true);
                  }}
                  onFocus={() => setShowProformaItemSuggestions(true)}
                  onBlur={() => {
                    // Delay to allow click on suggestion
                    setTimeout(() => setShowProformaItemSuggestions(false), 200);
                  }}
                  disabled={!selectedWarehouse || loading}
                  className="border rounded px-3 py-2 w-full text-sm"
                  placeholder="Type item name to search..."
                />
                
                {/* Autocomplete Suggestions Dropdown */}
                {showProformaItemSuggestions && proformaSuggestedItems.length > 0 && proformaItemSearchInput.trim() && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-y-auto">
                    {proformaSuggestedItems.slice(0, 10).map((name, idx) => (
                      <div
                        key={idx}
                        onClick={() => {
                          handleProformaItemSelect(name);
                          setShowProformaItemSuggestions(false);
                        }}
                        className="px-3 py-2 hover:bg-blue-50 cursor-pointer text-sm border-b last:border-b-0"
                      >
                        {name}
                      </div>
                    ))}
                    {proformaSuggestedItems.length > 10 && (
                      <div className="px-3 py-2 text-xs text-gray-500 italic">
                        +{proformaSuggestedItems.length - 10} more items... Keep typing to narrow down
                      </div>
                    )}
                  </div>
                )}
                
                <div className="text-xs text-gray-500 mt-1">
                  Type to search, then click to add. Items are added at the top. Selecting an existing item increases its quantity.
                </div>
              </div>

              {/* Proforma Items Table Header */}
              <div className="bg-gray-50 rounded p-3">
                <div className="grid grid-cols-12 gap-2 items-center text-sm font-medium text-gray-700">
                  <div className="col-span-5">Item Name</div>
                  <div className="col-span-2">Quantity</div>
                  <div className="col-span-2">Unit Price</div>
                  <div className="col-span-2">Total</div>
                  <div className="col-span-1">Actions</div>
                </div>
              </div>

              {/* Proforma Items List */}
              <div className="space-y-2">
                {proformaItems.map((item, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-center p-3 bg-white border rounded">
                    <div className="col-span-5">
                      <div className="px-3 py-2 bg-gray-50 rounded text-sm text-gray-800 border">{item.item_name || '—'}</div>
                    </div>
                    <div className="col-span-2">
                      <input
                        type="number"
                        value={item.quantity}
                        onChange={e => updateProformaItem(idx, 'quantity', e.target.value)}
                        className="border rounded px-3 py-2 w-full text-sm"
                        placeholder="Qty"
                        min="1"
                      />
                    </div>
                    <div className="col-span-2">
                      <input
                        type="number"
                        value={item.unit_price}
                        onChange={e => updateProformaItem(idx, 'unit_price', e.target.value)}
                        className="border rounded px-3 py-2 w-full text-sm"
                        placeholder="Price"
                        min="0"
                        step="0.01"
                      />
                    </div>
                    <div className="col-span-2">
                      <div className="px-3 py-2 bg-gray-100 rounded text-sm font-medium text-right">
                        ₦{calculateItemTotal(item.quantity, item.unit_price).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                      </div>
                    </div>
                    <div className="col-span-1">
                      <button
                        onClick={() => removeProformaItem(idx)}
                        className="px-2 py-2 rounded bg-red-600 text-white hover:bg-red-700 text-xs w-full"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                ))}
              </div>

            </div>

            {/* Proforma Total Calculation */}
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <h3 className="text-lg font-semibold text-green-800 mb-3">Proforma Calculation</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Subtotal:</span>
                  <span className="font-medium">₦{calculateProformaSubtotal().toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                </div>
                {proformaApplyVAT && (
                  <div className="flex justify-between text-green-700">
                    <span>VAT ({proformaVatRate}%):</span>
                    <span className="font-medium">₦{calculateProformaVATAmount(calculateProformaSubtotal()).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                  </div>
                )}
                {proformaDiscountType !== 'None' && Number(proformaDiscountValue) > 0 && (
                  <div className="flex justify-between text-orange-700">
                    <span>Discount ({proformaDiscountType === 'Percentage' ? `${proformaDiscountValue}%` : `₦${proformaDiscountValue}`}):</span>
                    <span className="font-medium">-₦{calculateProformaDiscountAmount(calculateProformaSubtotal() + calculateProformaVATAmount(calculateProformaSubtotal())).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                  </div>
                )}
                <hr className="border-green-300" />
                <div className="flex justify-between text-lg font-bold text-green-900">
                  <span>Grand Total:</span>
                  <span>₦{calculateProformaTotal().toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* ✅ FIXED: VAT Toggle - Responsive toggle button */}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setProformaApplyVAT(!proformaApplyVAT)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                    proformaApplyVAT ? 'bg-blue-600' : 'bg-gray-200'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      proformaApplyVAT ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
                <span className="text-sm font-medium text-gray-700">
                  {proformaApplyVAT ? 'VAT Applied' : 'VAT Not Applied'}
                </span>
              </div>
              {proformaApplyVAT && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">VAT Rate (%)</label>
                  <input type="number" value={proformaVatRate} onChange={e => setProformaVatRate(e.target.value)} className="border rounded px-3 py-2 w-full" min="0" step="0.1" />
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Discount Type</label>
                <select value={proformaDiscountType} onChange={e => setProformaDiscountType(e.target.value)} className="border rounded px-3 py-2 w-full">
                  <option value="None">None</option>
                  <option value="Percentage">Percentage</option>
                  <option value="Fixed Amount">Fixed Amount</option>
                </select>
              </div>
              {proformaDiscountType !== 'None' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Discount Value</label>
                  <input type="number" value={proformaDiscountValue} onChange={e => setProformaDiscountValue(e.target.value)} className="border rounded px-3 py-2 w-full" min="0" step="0.01" />
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
              <textarea value={proformaNotes} onChange={e => setProformaNotes(e.target.value)} className="border rounded px-3 py-2 w-full" rows="3" placeholder="Optional notes" />
            </div>

            <button onClick={submitProforma} disabled={loading} className="px-6 py-3 rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-50">
              {loading ? 'Creating...' : 'Create Proforma Invoice'}
            </button>
          </div>

          {/* Right: Pending proformas for selected customer */}
          <div className="bg-white rounded shadow p-6 space-y-4 md:col-span-1">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Pending Proformas</h2>
              <button onClick={loadPendingProformas} className="px-3 py-2 rounded bg-gray-100 hover:bg-gray-200 text-sm">Refresh</button>
            </div>
            <div className="text-sm text-gray-600">Customer: {proformaCustomer || '—'}</div>
            {loadingPendingProformas ? (
              <div className="text-sm text-gray-500">Loading...</div>
            ) : (
              <div className="space-y-3">
                {pendingProformas.length === 0 && (
                  <div className="text-sm text-gray-500">No pending proformas for this customer.</div>
                )}
                {pendingProformas.map(p => (
                  <div key={p.proforma_id} className="border rounded p-3">
                    <div className="flex items-center justify-between">
                      <div className="font-medium">#{p.proforma_id}</div>
                      <div className="text-xs text-gray-500">{p.date}</div>
                    </div>
                    <div className="text-sm text-gray-700 mt-1">Items: {(p.items || []).length} | Total: ₦{Number(p.grand_total || 0).toLocaleString()}</div>
                    <div className="text-xs mt-1">Invoice: {p.invoice_url ? <span className="text-green-600">Uploaded</span> : <span className="text-red-600">Missing</span>}</div>
                    {!p.invoice_url && (
                      <div className="mt-2">
                        <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={e => handleProformaInvoiceUpload(p.proforma_id, e.target.files[0])} className="text-xs" />
                      </div>
                    )}
                    <div className="mt-3 flex gap-2">
                      {p.status === 'converted' ? (
                        <span className="px-3 py-2 rounded bg-green-100 text-green-800 text-sm font-medium">✅ Converted to Sale</span>
                      ) : (
                        <button 
                          onClick={() => convertProforma(p.proforma_id)} 
                          className="px-3 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 text-sm"
                        >
                          Convert to Sales
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'Proforma List' && (
        <div className="space-y-4">
          <div className="bg-white rounded shadow p-4">
            <h2 className="text-lg font-semibold mb-4">Proforma Invoices</h2>
            
            {/* Filters */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
              <div>
                <label className="block text-sm text-gray-600 mb-1">Customer Name</label>
                <input 
                  value={proformaFilterCustomer} 
                  onChange={e => setProformaFilterCustomer(e.target.value)} 
                  className="border rounded px-3 py-2 w-full" 
                  placeholder="Search by customer"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Status</label>
                <select 
                  value={proformaFilterStatus} 
                  onChange={e => setProformaFilterStatus(e.target.value)} 
                  className="border rounded px-3 py-2 w-full"
                >
                  <option value="all">All</option>
                  <option value="pending">Pending</option>
                  <option value="converted">Converted</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Start Date</label>
                <input 
                  type="date" 
                  value={proformaFilterStart} 
                  onChange={e => setProformaFilterStart(e.target.value)} 
                  className="border rounded px-3 py-2 w-full"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">End Date</label>
                <input 
                  type="date" 
                  value={proformaFilterEnd} 
                  onChange={e => setProformaFilterEnd(e.target.value)} 
                  className="border rounded px-3 py-2 w-full"
                />
              </div>
            </div>
            
            <div className="flex gap-2 mb-4">
              <button 
                onClick={applyProformaFilter} 
                className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700"
              >
                Apply Filter
              </button>
              <button 
                onClick={loadAllProformas} 
                className="px-4 py-2 rounded bg-gray-600 text-white hover:bg-gray-700"
              >
                Refresh
              </button>
              <button 
                onClick={() => downloadCSV(filteredProformas, `proformas_${formatDate(today)}.csv`)} 
                className="px-4 py-2 rounded bg-green-600 text-white hover:bg-green-700"
              >
                Download CSV
              </button>
            </div>
            
            {/* Proforma Table */}
            <div className="overflow-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left border-b bg-gray-50">
                    <th className="py-2 px-3">ID</th>
                    <th className="py-2 px-3">Date</th>
                    <th className="py-2 px-3">Customer</th>
                    <th className="py-2 px-3">Phone</th>
                    <th className="py-2 px-3">Items</th>
                    <th className="py-2 px-3">Total</th>
                    <th className="py-2 px-3">Status</th>
                    <th className="py-2 px-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProformas.slice((proformaPage - 1) * 20, proformaPage * 20).map((p, idx) => (
                    <tr key={p.proforma_id || idx} className="border-b hover:bg-gray-50">
                      <td className="py-2 px-3">#{p.proforma_id}</td>
                      <td className="py-2 px-3">{p.date || p.created_at || '—'}</td>
                      <td className="py-2 px-3">{p.customer_name || '—'}</td>
                      <td className="py-2 px-3">{p.customer_phone || '—'}</td>
                      <td className="py-2 px-3">{(p.items || []).length}</td>
                      <td className="py-2 px-3">₦{Number(p.grand_total || 0).toLocaleString()}</td>
                      <td className="py-2 px-3">
                        <span className={`px-2 py-1 rounded text-xs ${
                          p.status === 'converted' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                        }`}>
                          {p.status || 'pending'}
                        </span>
                      </td>
                      <td className="py-2 px-3">
                        <div className="flex gap-1 flex-wrap">
                          <button 
                            onClick={() => downloadProforma(p.proforma_id, 'A4')} 
                            className="px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-700 text-xs"
                            disabled={loading}
                          >
                            PDF
                          </button>
                          <button 
                            onClick={() => downloadProforma(p.proforma_id, 'THERMAL')} 
                            className="px-2 py-1 rounded bg-purple-600 text-white hover:bg-purple-700 text-xs"
                            disabled={loading}
                          >
                            Thermal
                          </button>
                          {p.status === 'converted' ? (
                            <span className="px-2 py-1 rounded bg-green-100 text-green-800 text-xs font-medium">✅ Converted</span>
                          ) : (
                            <button 
                              onClick={() => convertProforma(p.proforma_id)} 
                              className="px-2 py-1 rounded bg-green-600 text-white hover:bg-green-700 text-xs"
                              disabled={loading}
                            >
                              Convert
                            </button>
                          )}
                          {canDeleteProforma && (
                            <button 
                              onClick={() => deleteProforma(p.proforma_id)} 
                              className="px-2 py-1 rounded bg-red-600 text-white hover:bg-red-700 text-xs"
                              disabled={loading}
                              title="Delete Proforma"
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredProformas.length === 0 && (
                    <tr>
                      <td colSpan="8" className="py-4 text-center text-gray-500">No proforma invoices found</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            
            {/* Pagination */}
            {filteredProformas.length > 20 && (
              <div className="flex items-center justify-between mt-4">
                <div className="text-sm text-gray-600">
                  Showing {((proformaPage - 1) * 20) + 1} to {Math.min(proformaPage * 20, filteredProformas.length)} of {filteredProformas.length} records
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setProformaPage(Math.max(1, proformaPage - 1))}
                    disabled={proformaPage === 1}
                    className="px-3 py-1 rounded bg-gray-100 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Previous
                  </button>
                  <span className="px-3 py-1 text-sm text-gray-600">Page {proformaPage} of {Math.ceil(filteredProformas.length / 20)}</span>
                  <button
                    onClick={() => setProformaPage(Math.min(Math.ceil(filteredProformas.length / 20), proformaPage + 1))}
                    disabled={proformaPage === Math.ceil(filteredProformas.length / 20)}
                    className="px-3 py-1 rounded bg-gray-100 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'Filter' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            <div>
              <label className="block text-sm text-gray-600">Keyword Search</label>
              <input 
                value={fKeyword} 
                onChange={e=>setFKeyword(e.target.value)} 
                className="border rounded px-3 py-2 w-full" 
                placeholder="Search across all fields (e.g., customer name, item, etc.)" 
              />
              <div className="text-xs text-gray-500 mt-1">Leave empty to search by specific fields below</div>
            </div>
            <div>
              <label className="block text-sm text-gray-600">Filter type</label>
              <select value={fType} onChange={e=>{ setFType(e.target.value); setFValues([]); }} className="border rounded px-3 py-2 w-full">
                <option value="">None</option>
                <option value="customer_name">Customer name</option>
                <option value="employee_name">Employee name</option>
                <option value="customer_phone">Customer phone</option>
                <option value="item_name">Item name</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-600">Values</label>
              <select multiple value={fValues} onChange={e=> setFValues(Array.from(e.target.selectedOptions).map(o=>o.value))} className="border rounded px-3 py-2 w-full h-28">
                {(
                  fType === 'customer_name' ? options.customer_names :
                  fType === 'employee_name' ? options.employee_names :
                  fType === 'customer_phone' ? options.customer_phones :
                  fType === 'item_name' ? options.item_names : []
                ).map(v => <option key={v} value={v}>{v}</option>)}
              </select>
              <div className="text-xs text-gray-500 mt-1">Hold Ctrl/Cmd to select multiple values</div>
            </div>
            <div>
              <label className="block text-sm text-gray-600">Start date</label>
              <input type="date" value={fStart} onChange={e=>setFStart(e.target.value)} className="border rounded px-3 py-2 w-full" />
            </div>
            <div>
              <label className="block text-sm text-gray-600">End date</label>
              <input type="date" value={fEnd} onChange={e=>setFEnd(e.target.value)} className="border rounded px-3 py-2 w-full" />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={applyFilter} className="px-4 py-2 rounded bg-blue-600 text-white disabled:opacity-50" disabled={loading}>Apply Filter</button>
            <button onClick={() => downloadCSV(filtered, `sales_filtered_${formatDate(today)}.csv`)} className="px-4 py-2 rounded bg-green-600 text-white hover:bg-green-700">Download Filtered</button>
          </div>
          <Table data={filtered} page={filterPage} setPage={setFilterPage} />
        </div>
      )}

      {tab === 'Pending' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-green-700">💰 Pending Payments</h2>
            <button
              onClick={() => {
                setPendingPage(1);
                loadPending();
              }}
              className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700"
            >
              🔄 Refresh
            </button>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-gray-700">
              📋 <strong>Review and Update Customers with Outstanding Balances</strong>
            </p>
            <p className="text-xs text-gray-600 mt-1">
              This section shows all sales, purchases, and expenses with partial or credit payment status.
            </p>
          </div>

          {pending.length === 0 ? (
            <div className="bg-white rounded shadow p-6 text-center text-gray-500">
              ℹ️ No pending transactions found.
            </div>
          ) : (
            <>
              <div className="bg-white rounded shadow p-4">
                <div className="text-sm text-gray-600 mb-3">
                  Showing {((pendingPage - 1) * pendingRecordsPerPage) + 1} to {Math.min(pendingPage * pendingRecordsPerPage, pending.length)} of {pending.length} pending transactions
                </div>
              </div>
              
              <div className="space-y-4">
                {(() => {
                  // Backend now returns pre-grouped sales, so we just need to paginate
                  const paginatedTransactions = pending.slice(
                    (pendingPage - 1) * pendingRecordsPerPage,
                    pendingPage * pendingRecordsPerPage
                  );
                  
                  return paginatedTransactions.map((tx, idx) => {
                    
                    // Identify transaction type
                    const saleId = tx.sale_id;
                    const purchaseId = tx.purchase_id;
                    const expenseId = tx.expense_id;
                    
                    // Get transaction date
                    const transactionDate = tx.sale_date || tx.purchase_date || tx.expense_date || 'unknown';
                    
                    // Get names
                    const customerName = tx.customer_name || 'Unknown Customer';
                    const supplierName = tx.supplier_name || 'Unknown Supplier';
                    const expenseName = tx.vendor_name || 'Unknown Expense';
                    
                    // Get amounts (now reflecting grouped totals)
                    const totalAmount = parseFloat(
                      tx.total_cost || tx.total_amount || 0
                    );
                    const amountPaid = parseFloat(
                      tx.total_price_paid || tx.amount_paid || 0
                    );
                    const outstandingAmount = totalAmount - amountPaid;
                    
                    // Get status and payment info
                    const paymentStatus = tx.payment_status || 'unknown';
                    const paymentMethod = tx.payment_method || 'unknown';
                    const dueDate = tx.due_date || 'unknown';
                
                    return (
                      <div key={idx} className="bg-white rounded shadow p-4 border-l-4 border-orange-500">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {/* Transaction Details */}
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-gray-700">Type:</span>
                              <span className="px-2 py-1 rounded bg-blue-100 text-blue-800 text-sm">
                                {saleId ? '🛒 Sale' : purchaseId ? '📦 Purchase' : '💸 Expense'}
                              </span>
                              {tx.item_count > 1 && (
                                <span className="px-2 py-1 rounded bg-green-100 text-green-800 text-xs font-medium">
                                  📦 {tx.item_count} items
                                </span>
                              )}
                            </div>
                        
                        {saleId && (
                          <>
                            <div>
                              <span className="font-semibold text-gray-700">Customer:</span> {customerName}
                            </div>
                            {tx.items_summary && (
                              <div>
                                <span className="font-semibold text-gray-700">Items:</span>
                                <span className="text-sm text-gray-600 ml-1">{tx.items_summary}</span>
                              </div>
                            )}
                          </>
                        )}
                        {purchaseId && (
                          <div>
                            <span className="font-semibold text-gray-700">Supplier:</span> {supplierName}
                          </div>
                        )}
                        {expenseId && (
                          <div>
                            <span className="font-semibold text-gray-700">Expense Item:</span> {expenseName}
                          </div>
                        )}
                        
                        <div>
                          <span className="font-semibold text-gray-700">Transaction Date:</span> {transactionDate}
                        </div>
                        <div>
                          <span className="font-semibold text-gray-700">Due Date:</span> {dueDate}
                        </div>
                      </div>
                      
                      {/* Payment Details */}
                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <span className="font-semibold text-gray-700">Total Amount:</span>
                          <span className="font-bold">₦{totalAmount.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="font-semibold text-gray-700">Amount Paid:</span>
                          <span className="text-green-600 font-bold">₦{amountPaid.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="font-semibold text-gray-700">Outstanding:</span>
                          <span className="text-red-600 font-bold">₦{outstandingAmount.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="font-semibold text-gray-700">Status:</span>
                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                            paymentStatus === 'paid' ? 'bg-green-100 text-green-800' :
                            paymentStatus === 'partial' ? 'bg-yellow-100 text-yellow-800' :
                            'bg-red-100 text-red-800'
                          }`}>
                            {paymentStatus.toUpperCase()}
                          </span>
                        </div>
                        <div>
                          <span className="font-semibold text-gray-700">Payment Method:</span> {paymentMethod}
                        </div>
                      </div>
                    </div>
                    
                    {/* Payment Update Section */}
                    {paymentStatus === 'partial' || paymentStatus === 'credit' ? (
                      <div className="mt-4 pt-4 border-t border-gray-200">
                        <h4 className="font-semibold text-gray-800 mb-3">💰 Update Payment</h4>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {/* Payment Type Selection */}
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Select Update Type</label>
                            <div className="space-y-2">
                              <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                  type="radio"
                                  name={`update-type-${idx}`}
                                  value="partial"
                                  defaultChecked
                                  className="w-4 h-4"
                                />
                                <span className="text-sm">Partial Payment</span>
                              </label>
                              <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                  type="radio"
                                  name={`update-type-${idx}`}
                                  value="full"
                                  className="w-4 h-4"
                                />
                                <span className="text-sm">Fully Paid</span>
                              </label>
                            </div>
                          </div>
                          
                          {/* Payment Amount Input */}
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Amount Paying Now (₦)
                            </label>
                            <input
                              type="number"
                              id={`payment-amount-${idx}`}
                              min="0"
                              max={outstandingAmount}
                              step="0.01"
                              defaultValue={0}
                              className="border rounded px-3 py-2 w-full"
                              placeholder="Enter amount"
                              onChange={(e) => {
                                const updateType = document.querySelector(`input[name="update-type-${idx}"]:checked`)?.value;
                                if (updateType === 'full') {
                                  e.target.value = outstandingAmount;
                                }
                              }}
                            />
                            <div className="text-xs text-gray-500 mt-1">
                              Maximum: ₦{outstandingAmount.toLocaleString()}
                            </div>
                          </div>
                        </div>
                        
                        {/* Payment Evidence Upload */}
                        <div className="mt-4">
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Upload Payment Evidence *
                          </label>
                          
                          <div className="space-y-3">
                            {/* File Upload Input */}
                            <div>
                              <input
                                type="file"
                                id={`evidence-file-${idx}`}
                                accept=".jpg,.jpeg,.png,.pdf"
                                className="border rounded px-3 py-2 w-full text-sm"
                                onChange={(e) => {
                                  const file = e.target.files[0];
                                  if (file) {
                                    e.target.dataset.hasFile = 'true';
                                  }
                                }}
                              />
                              <div className="text-xs text-gray-500 mt-1">
                                Supported: JPG, PNG, PDF (Max 10MB)
                              </div>
                            </div>
                            
                            {/* Camera Button */}
                            <button
                              type="button"
                              onClick={async () => {
                                try {
                                  const stream = await navigator.mediaDevices.getUserMedia({
                                    video: {
                                      facingMode: 'environment',
                                      width: { ideal: 1920 },
                                      height: { ideal: 1080 }
                                    }
                                  });
                                  
                                  const modal = document.createElement('div');
                                  modal.className = 'fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50';
                                  modal.innerHTML = `
                                    <div class="bg-white rounded-lg p-4 max-w-2xl w-full mx-4">
                                      <h3 class="text-lg font-semibold mb-3">Capture Payment Evidence</h3>
                                      <video id="camera-preview-${idx}" autoplay playsinline class="w-full rounded border mb-3" style="max-height: 400px;"></video>
                                      <div class="flex gap-2 justify-end">
                                        <button id="capture-btn-${idx}" class="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700">
                                          📸 Capture
                                        </button>
                                        <button id="cancel-btn-${idx}" class="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600">
                                          Cancel
                                        </button>
                                      </div>
                                    </div>
                                  `;
                                  document.body.appendChild(modal);
                                  
                                  const video = document.getElementById(`camera-preview-${idx}`);
                                  video.srcObject = stream;
                                  
                                  document.getElementById(`capture-btn-${idx}`).onclick = () => {
                                    const canvas = document.createElement('canvas');
                                    canvas.width = video.videoWidth;
                                    canvas.height = video.videoHeight;
                                    canvas.getContext('2d').drawImage(video, 0, 0);
                                    
                                    canvas.toBlob((blob) => {
                                      const file = new File([blob], `payment_evidence_${Date.now()}.jpg`, { type: 'image/jpeg' });
                                      const dataTransfer = new DataTransfer();
                                      dataTransfer.items.add(file);
                                      const fileInput = document.getElementById(`evidence-file-${idx}`);
                                      fileInput.files = dataTransfer.files;
                                      fileInput.dataset.hasFile = 'true';
                                      
                                      stream.getTracks().forEach(track => track.stop());
                                      document.body.removeChild(modal);
                                      
                                      setSuccess('Payment evidence captured successfully!');
                                    }, 'image/jpeg', 0.9);
                                  };
                                  
                                  document.getElementById(`cancel-btn-${idx}`).onclick = () => {
                                    stream.getTracks().forEach(track => track.stop());
                                    document.body.removeChild(modal);
                                  };
                                  
                                } catch (err) {
                                  setError('Failed to access camera: ' + err.message);
                                }
                              }}
                              className="w-full px-4 py-2 rounded bg-purple-600 text-white hover:bg-purple-700 flex items-center justify-center gap-2"
                            >
                              <span>📷</span>
                              <span>Use Camera to Capture Evidence</span>
                            </button>
                          </div>
                        </div>
                        
                        {/* Update Payment Button */}
                        <div className="mt-4">
                          <button
                            onClick={async () => {
                              const updateType = document.querySelector(`input[name="update-type-${idx}"]:checked`)?.value;
                              const amountInput = document.getElementById(`payment-amount-${idx}`);
                              const paymentAmount = updateType === 'full'
                                ? outstandingAmount
                                : parseFloat(amountInput?.value || 0);
                              
                              if (!paymentAmount || paymentAmount <= 0) {
                                setError('Please enter a valid payment amount.');
                                return;
                              }
                              
                              // Get evidence file
                              const evidenceFile = document.getElementById(`evidence-file-${idx}`)?.files[0];
                              if (!evidenceFile) {
                                setError('❌ You must upload or capture payment evidence before updating payment.');
                                return;
                              }
                              
                              setLoading(true);
                              setError('');
                              setSuccess('');
                              
                              try {
                                // Determine transaction type and record ID
                                let transactionType = '';
                                let recordId = 0;
                                
                                if (saleId) {
                                  transactionType = 'sale';
                                  recordId = saleId;
                                } else if (purchaseId) {
                                  transactionType = 'purchase';
                                  recordId = purchaseId;
                                } else if (expenseId) {
                                  transactionType = 'expense';
                                  recordId = expenseId;
                                } else {
                                  setError('❌ No valid transaction ID found.');
                                  setLoading(false);
                                  return;
                                }
                                
                                // Call the payment API
                                const paymentPayload = {
                                  transaction_type: transactionType,
                                  record_id: recordId,
                                  amount: paymentAmount,
                                  payment_method: paymentMethod || 'cash',
                                  notes: `${updateType === 'full' ? 'Full' : 'Partial'} payment via dashboard${tx.item_count > 1 ? ` (${tx.item_count} items)` : ''}`,
                                  transaction_date: transactionDate
                                };
                                
                                console.log('Submitting payment for grouped transaction:', paymentPayload);
                                console.log('Transaction has', tx.item_count || 1, 'items');
                                
                                const response = await api.post('/sales/payments', paymentPayload);
                                
                                const newStatus = response.data?.new_status || 'unknown';
                                let successMsg = `✅ Payment updated! New status: ${newStatus.toUpperCase()}`;
                                
                                // Add info about grouped items
                                if (tx.item_count > 1) {
                                  successMsg += `\n📦 All ${tx.item_count} items in this transaction have been updated.`;
                                }
                                
                                setSuccess(successMsg);
                                
                                // Refresh pending list
                                await loadPending();
                              } catch (e) {
                                console.error('Payment update failed:', e);
                                setError('Failed to update payment: ' + (e.response?.data?.detail || e.message));
                              } finally {
                                setLoading(false);
                              }
                            }}
                            disabled={loading}
                            className="w-full px-6 py-3 rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 font-medium"
                          >
                            {loading ? 'Processing...' : '💰 Update Payment'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-4 pt-4 border-t border-gray-200">
                        <div className="bg-green-50 border border-green-200 rounded p-3 text-center">
                          <span className="text-green-700 font-medium">✅ This transaction is fully paid</span>
                        </div>
                      </div>
                    )}
                      </div>
                    );
                  });
                })()}
              </div>
            
            {/* Pagination Controls */}
            {pending.length > pendingRecordsPerPage && (
              <div className="bg-white rounded shadow p-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-gray-600">
                    Page {pendingPage} of {Math.ceil(pending.length / pendingRecordsPerPage)}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setPendingPage(Math.max(1, pendingPage - 1))}
                      disabled={pendingPage === 1}
                      className="px-3 py-1 rounded bg-gray-100 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Previous
                    </button>
                    <button
                      onClick={() => setPendingPage(Math.min(Math.ceil(pending.length / pendingRecordsPerPage), pendingPage + 1))}
                      disabled={pendingPage === Math.ceil(pending.length / pendingRecordsPerPage)}
                      className="px-3 py-1 rounded bg-gray-100 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Next
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
          )}
        </div>
      )}

      {/* Proforma Conversion Modal */}
      {showConversionModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-auto">
            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold">Convert Proforma to Sale</h2>
                <button 
                  onClick={closeConversionModal} 
                  className="text-gray-500 hover:text-gray-700 text-2xl"
                  disabled={loading}
                >
                  ×
                </button>
              </div>

              <p className="text-sm text-gray-600">
                To convert Proforma #{conversionProformaId} to a sale, please upload or capture the invoice document.
              </p>

              {!usingCamera ? (
                <>
                  {/* File Upload Section */}
                  <div className="space-y-3">
                    <label className="block text-sm font-medium text-gray-700">
                      Upload Invoice File
                    </label>
                    <input 
                      type="file" 
                      accept=".pdf,.jpg,.jpeg,.png" 
                      onChange={handleConversionFileChange}
                      className="border rounded px-3 py-2 w-full text-sm"
                      disabled={loading}
                    />
                    <div className="text-xs text-gray-500">
                      Supported formats: PNG, JPG, PDF. Maximum size: 10MB
                    </div>
                  </div>

                  {/* Camera Capture Button */}
                  <div className="flex justify-center">
                    <button
                      onClick={startCamera}
                      className="px-6 py-3 rounded bg-purple-600 text-white hover:bg-purple-700 font-medium flex items-center gap-2"
                      disabled={loading}
                    >
                      <span>📷</span>
                      <span>Use Camera to Capture Invoice</span>
                    </button>
                  </div>

                  {/* Preview */}
                  {conversionInvoicePreview && (
                    <div className="border rounded p-3 bg-gray-50">
                      <p className="text-sm font-medium text-gray-700 mb-2">Preview:</p>
                      <img 
                        src={conversionInvoicePreview} 
                        alt="Invoice preview" 
                        className="max-h-64 mx-auto rounded border"
                      />
                    </div>
                  )}

                  {conversionInvoiceFile && !conversionInvoicePreview && (
                    <div className="flex items-center gap-2 text-sm text-green-600">
                      <span>✓</span>
                      <span>File selected: {conversionInvoiceFile.name}</span>
                    </div>
                  )}
                </>
              ) : (
                <>
                  {/* Camera View */}
                  <div className="space-y-3">
                    <div className="border rounded overflow-hidden bg-black">
                      <video 
                        id="camera-video" 
                        autoPlay 
                        playsInline
                        className="w-full max-h-96"
                      />
                    </div>
                    <div className="flex gap-3 justify-center">
                      <button
                        onClick={capturePhoto}
                        className="px-6 py-3 rounded bg-green-600 text-white hover:bg-green-700 font-medium"
                      >
                        📸 Capture Photo
                      </button>
                      <button
                        onClick={() => {
                          if (cameraStream) {
                            cameraStream.getTracks().forEach(track => track.stop());
                            setCameraStream(null);
                          }
                          setUsingCamera(false);
                        }}
                        className="px-6 py-3 rounded bg-gray-500 text-white hover:bg-gray-600 font-medium"
                      >
                        Cancel Camera
                      </button>
                    </div>
                  </div>
                </>
              )}

              {/* Action Buttons */}
              <div className="flex gap-3 justify-end pt-4 border-t">
                <button 
                  onClick={closeConversionModal} 
                  className="px-4 py-2 rounded bg-gray-500 text-white hover:bg-gray-600"
                  disabled={loading}
                >
                  Cancel
                </button>
                <button 
                  onClick={handleConversionSubmit}
                  disabled={!conversionInvoiceFile || loading}
                  className="px-6 py-2 rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                >
                  {loading ? 'Processing...' : 'Process Sales'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'Report' && (
        <div className="space-y-4">
          <div className="bg-white rounded shadow p-4 space-y-3">
            <h2 className="text-lg font-semibold">Sales Report</h2>
            <div className="flex gap-3 items-end flex-wrap">
              <div>
                <label className="block text-sm text-gray-600 mb-1">Start Date</label>
                <input type="date" value={reportStart} onChange={e => setReportStart(e.target.value)} className="border rounded px-3 py-2" />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">End Date</label>
                <input type="date" value={reportEnd} onChange={e => setReportEnd(e.target.value)} className="border rounded px-3 py-2" />
              </div>
              <button onClick={loadReport} disabled={loading} className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
                Generate Report
              </button>
            </div>
          </div>

          {reportData && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white rounded shadow p-4">
                  <h3 className="text-sm font-medium text-gray-600">Total Sales</h3>
                  <p className="text-2xl font-bold text-gray-900">₦{reportData.totals.total_sales.toLocaleString()}</p>
                </div>
                <div className="bg-white rounded shadow p-4">
                  <h3 className="text-sm font-medium text-gray-600">Total Paid</h3>
                  <p className="text-2xl font-bold text-green-600">₦{reportData.totals.total_paid.toLocaleString()}</p>
                </div>
                <div className="bg-white rounded shadow p-4">
                  <h3 className="text-sm font-medium text-gray-600">Total Credit</h3>
                  <p className="text-2xl font-bold text-red-600">₦{reportData.totals.total_credit.toLocaleString()}</p>
                </div>
                <div className="bg-white rounded shadow p-4">
                  <h3 className="text-sm font-medium text-gray-600">Total Expenses</h3>
                  <p className="text-2xl font-bold text-gray-900">₦{reportData.totals.total_expenses.toLocaleString()}</p>
                </div>
                <div className="bg-white rounded shadow p-4">
                  <h3 className="text-sm font-medium text-gray-600">Expenses Paid</h3>
                  <p className="text-2xl font-bold text-gray-900">₦{reportData.totals.expenses_paid.toLocaleString()}</p>
                </div>
                <div className="bg-white rounded shadow p-4">
                  <h3 className="text-sm font-medium text-gray-600">Profit</h3>
                  <p className="text-2xl font-bold text-blue-600">₦{reportData.totals.profit.toLocaleString()}</p>
                </div>
              </div>

              {/* Simple charts without external libs */}
              <div className="bg-white rounded shadow p-4">
                <h3 className="text-lg font-semibold mb-3">Sales by Payment Method</h3>
                <div className="space-y-2">
                  {(() => {
                    const data = reportData.payment_method_summary || [];
                    const maxVal = Math.max(1, ...data.map(d => d.total_sales));
                    return data.map((d, idx) => (
                      <div key={idx} className="flex items-center gap-3">
                        <div className="w-28 text-sm capitalize text-gray-700">{d.payment_method}</div>
                        <div className="flex-1 bg-gray-100 rounded h-3 overflow-hidden">
                          <div className="h-3 bg-blue-500" style={{ width: `${(d.total_sales / maxVal) * 100}%` }}></div>
                        </div>
                        <div className="w-24 text-right text-sm">₦{Number(d.total_sales).toLocaleString()}</div>
                      </div>
                    ));
                  })()}
                </div>
                <div className="mt-3 text-sm text-gray-600 italic">{interpretPaymentMethods()}</div>
              </div>

              <div className="bg-white rounded shadow p-4">
                <h3 className="text-lg font-semibold mb-3">Daily Sales (Timeseries)</h3>
                {(() => {
                  const ts = reportData.timeseries || [];
                  if (!ts.length) return <div className="text-sm text-gray-500">No data</div>;
                  const w = 600, h = 220, pad = 30;
                  const xs = ts.map((_, i) => i);
                  const ys = ts.map(t => Number(t.total_sales) || 0);
                  const maxY = Math.max(1, ...ys);
                  const scaleX = (i) => pad + (i * (w - 2*pad)) / Math.max(xs.length - 1, 1);
                  const scaleY = (y) => h - pad - (y * (h - 2*pad)) / maxY;
                  const dataPath = ys.map((y,i) => `${i===0?'M':'L'} ${scaleX(i)} ${scaleY(y)}`).join(' ');
                  const { a0, a1, a2 } = polyfit2(xs, ys);
                  const fitYs = xs.map(x => a0 + a1*x + a2*x*x);
                  const fitPath = fitYs.map((y,i) => `${i===0?'M':'L'} ${scaleX(i)} ${scaleY(Math.max(0,y))}`).join(' ');
                  return (
                    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-56">
                      {/* axes */}
                      <line x1={pad} y1={h-pad} x2={w-pad} y2={h-pad} stroke="#e5e7eb"/>
                      <line x1={pad} y1={pad} x2={pad} y2={h-pad} stroke="#e5e7eb"/>
                      {/* data line */}
                      <path d={dataPath} fill="none" stroke="#10b981" strokeWidth="2" />
                      {/* points */}
                      {ys.map((y,i)=>(
                        <circle key={i} cx={scaleX(i)} cy={scaleY(y)} r="2.5" fill="#10b981" />
                      ))}
                      {/* polyfit line */}
                      <path d={fitPath} fill="none" stroke="#3b82f6" strokeDasharray="4 3" strokeWidth="2" />
                      {/* x labels */}
                      {ts.map((t,i)=> (
                        <text key={i} x={scaleX(i)} y={h-8} fontSize="9" textAnchor="middle" fill="#6b7280">{String(t.sale_date).slice(5)}</text>
                      ))}
                    </svg>
                  );
                })()}
                <div className="mt-3 text-sm text-gray-600 italic">{interpretTimeseriesChart()}</div>
              </div>

              <div className="bg-white rounded shadow p-4">
                <h3 className="text-lg font-semibold mb-3">Top Products</h3>
                <div className="overflow-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="text-left border-b">
                        <th className="py-2 px-3">Item</th>
                        <th className="py-2 px-3">Quantity Sold</th>
                        <th className="py-2 px-3">Total Sales</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reportData.top_products.map((p, idx) => (
                        <tr key={idx} className="border-b hover:bg-gray-50">
                          <td className="py-2 px-3">{p.item_name}</td>
                          <td className="py-2 px-3">{p.quantity_sold}</td>
                          <td className="py-2 px-3">₦{p.total_sales.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="bg-white rounded shadow p-4">
                <h3 className="text-lg font-semibold mb-3">Top Customers</h3>
                <div className="overflow-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="text-left border-b">
                        <th className="py-2 px-3">Customer</th>
                        <th className="py-2 px-3">Total Spent</th>
                        <th className="py-2 px-3">Purchases</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reportData.top_customers.map((c, idx) => (
                        <tr key={idx} className="border-b hover:bg-gray-50">
                          <td className="py-2 px-3">{c.customer_name}</td>
                          <td className="py-2 px-3">₦{c.total_spent.toLocaleString()}</td>
                          <td className="py-2 px-3">{c.purchases}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'Sales Debug' && (
        <SalesDebug />
      )}
    </div>
  );
};

export default Sales;

