import React, { useState, useEffect } from 'react';
import { 
  FileText, 
  Filter, 
  Download, 
  Search, 
  Plus, 
  Edit3, 
  Trash2,
  Clock,
  CheckCircle,
  XCircle,
  Eye,
  Calendar,
  ThumbsUp,
  ThumbsDown,
  MessageSquare
} from 'lucide-react';
import { requisitionsApi } from '../services/requisitionsApi';
import { toast } from 'react-toastify';
import { usePermission } from '../hooks/usePermission';

const RequisitionsList = ({ onCreateNew, onEdit }) => {
  const [requisitions, setRequisitions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(20);
  const [totalCount, setTotalCount] = useState(0);
  
  // Filter states
  const [statusFilter, setStatusFilter] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  
  // Permission checks
  const { hasPermission: canApprove } = usePermission('requisitions.approve');
  const { hasPermission: canReject } = usePermission('requisitions.reject');
  const { hasPermission: canDelete } = usePermission('requisitions.delete');
  const { hasPermission: canUpdateRemark } = usePermission('requisitions.update_remark');
  
  // Remark modal state
  const [remarkModal, setRemarkModal] = useState({ show: false, requisitionId: null, currentRemark: '' });

  // Fetch requisitions
  const fetchRequisitions = async () => {
    setLoading(true);
    setError('');
    try {
      const skip = (currentPage - 1) * itemsPerPage;
      const params = { skip, limit: itemsPerPage };
      if (statusFilter) params.status = statusFilter;
      
      const response = await requisitionsApi.getRequisitions(params);
      
      // Handle both old format (array) and new format (object with data/total)
      if (Array.isArray(response.data)) {
        setRequisitions(response.data);
        setTotalCount(response.data.length);
      } else {
        setRequisitions(response.data.data || []);
        setTotalCount(response.data.total || 0);
      }
    } catch (err) {
      setError(err?.response?.data?.detail || 'Failed to fetch requisitions');
    } finally {
      setLoading(false);
    }
  };


  useEffect(() => {
    fetchRequisitions();
  }, [currentPage, statusFilter]);

  // Filter requisitions with advanced search
  const filterRequisitions = async () => {
    if (!searchTerm && !dateRange.start && !dateRange.end) {
      fetchRequisitions();
      return;
    }
    
    setLoading(true);
    try {
      const params = {};
      if (searchTerm) params.q = searchTerm;
      if (dateRange.start) params.start_date = dateRange.start;
      if (dateRange.end) params.end_date = dateRange.end;
      
      const response = await requisitionsApi.filterRequisitions(params);
      setRequisitions(response.data || []);
    } catch (err) {
      setError(err?.response?.data?.detail || 'Failed to filter requisitions');
    } finally {
      setLoading(false);
    }
  };

  // Export to CSV
  const handleExport = async (format = 'csv') => {
    try {
      const params = {};
      if (searchTerm) params.q = searchTerm;
      if (dateRange.start) params.start_date = dateRange.start;
      if (dateRange.end) params.end_date = dateRange.end;
      
      const response = await requisitionsApi.exportRequisitions(format, params);
      
      // Create download link
      const blob = new Blob([atob(response.data.content_base64)], {
        type: response.data.content_type
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = response.data.filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError('Failed to export data');
    }
  };

  // Delete requisition
  const handleDelete = async (id) => {
    if (!canDelete) {
      toast.error('You do not have permission to delete requisitions');
      return;
    }
    
    if (!window.confirm('Are you sure you want to delete this requisition?')) return;
    
    try {
      await requisitionsApi.deleteRequisition(id);
      toast.success('Requisition deleted successfully');
      // If deleting the last item on current page and not on page 1, go to previous page
      if (requisitions.length === 1 && currentPage > 1) {
        setCurrentPage(prev => prev - 1);
      } else {
        fetchRequisitions();
      }
    } catch (err) {
      const errorMsg = err?.response?.data?.detail || 'Failed to delete requisition';
      toast.error(errorMsg);
      setError(errorMsg);
    }
  };
  
  // Approve requisition
  const handleApprove = async (id) => {
    if (!canApprove) {
      toast.error('You do not have permission to approve requisitions');
      return;
    }
    
    try {
      await requisitionsApi.approveRequisition(id);
      toast.success('Requisition approved successfully');
      fetchRequisitions();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to approve requisition');
    }
  };
  
  // Reject requisition
  const handleReject = async (id) => {
    if (!canReject) {
      toast.error('You do not have permission to reject requisitions');
      return;
    }
    
    try {
      await requisitionsApi.rejectRequisition(id);
      toast.success('Requisition rejected successfully');
      fetchRequisitions();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to reject requisition');
    }
  };
  
  // Update remark
  const handleUpdateRemark = async () => {
    if (!canUpdateRemark) {
      toast.error('You do not have permission to update remarks');
      return;
    }
    
    try {
      await requisitionsApi.updateRemark(remarkModal.requisitionId, remarkModal.currentRemark);
      toast.success('Remark updated successfully');
      setRemarkModal({ show: false, requisitionId: null, currentRemark: '' });
      fetchRequisitions();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to update remark');
    }
  };

  // Get status badge color
  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'approved': return 'bg-green-100 text-green-800';
      case 'rejected': return 'bg-red-100 text-red-800';
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  // Get status icon
  const getStatusIcon = (status) => {
    switch (status?.toLowerCase()) {
      case 'approved': return <CheckCircle className="w-4 h-4" />;
      case 'rejected': return <XCircle className="w-4 h-4" />;
      case 'pending': return <Clock className="w-4 h-4" />;
      default: return <Eye className="w-4 h-4" />;
    }
  };

  const totalPages = Math.ceil(totalCount / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = Math.min(startIndex + itemsPerPage, totalCount);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <FileText className="w-7 h-7 text-blue-600" />
              Requisitions
            </h1>
            <p className="text-gray-600 mt-1">Manage inventory requisitions and approvals</p>
          </div>
          
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="flex items-center gap-2 px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
            >
              <Filter className="w-4 h-4" />
              Filters
            </button>
            
            <button
              onClick={() => handleExport('csv')}
              className="flex items-center gap-2 px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
            >
              <Download className="w-4 h-4" />
              Export CSV
            </button>
            
            <button
              onClick={() => handleExport('excel')}
              className="flex items-center gap-2 px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
            >
              <Download className="w-4 h-4" />
              Export Excel
            </button>
            
            <button
              onClick={onCreateNew}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" />
              New Requisition
            </button>
          </div>
        </div>

        {/* Filters */}
        {showFilters && (
          <div className="mt-6 p-4 bg-gray-50 rounded-lg border">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Search
                </label>
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-3 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search requisitions..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Status
                </label>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">All Statuses</option>
                  <option value="Pending">Pending</option>
                  <option value="Approved">Approved</option>
                  <option value="Rejected">Rejected</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Start Date
                </label>
                <input
                  type="date"
                  value={dateRange.start}
                  onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  End Date
                </label>
                <input
                  type="date"
                  value={dateRange.end}
                  onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>
            
            <div className="flex items-center gap-2 mt-4">
              <button
                onClick={filterRequisitions}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm transition-colors"
              >
                Apply Filters
              </button>
              <button
                onClick={() => {
                  setSearchTerm('');
                  setDateRange({ start: '', end: '' });
                  setStatusFilter('');
                  fetchRequisitions();
                }}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 text-sm transition-colors"
              >
                Clear All
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {/* Requisitions Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center">
            <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4"></div>
            <p className="text-gray-600">Loading requisitions...</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      ID & Date
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Employee
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Warehouse & Item
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Quantity
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Reason
                    </th>
                    {canUpdateRemark && (
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                        Remark
                      </th>
                    )}
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {requisitions.length === 0  ? (
                    <tr>
                      <td colSpan={canUpdateRemark ? "8" : "7"} className="px-6 py-12 text-center text-gray-500">
                        <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                        <p className="text-lg font-medium text-gray-900 mb-2">No requisitions found</p>
                        <p className="text-gray-600">Get started by creating your first requisition</p>
                      </td>
                    </tr>
                  ) : (
                    requisitions.map((req) => (
                      <tr key={req.requisition_id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">#{req.requisition_id}</div>
                          <div className="text-sm text-gray-500 flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {new Date(req.submitted_at).toLocaleDateString()}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">
                            {req.employee_name || 'Unknown'}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm font-medium text-gray-900">{req.warehouse_name}</div>
                          <div className="text-sm text-gray-500">{req.item}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">{req.quantity}</div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm text-gray-600 max-w-xs truncate" title={req.reason}>
                            {req.reason}
                          </div>
                        </td>
                        {canUpdateRemark && (
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              <div className="text-sm text-gray-600 max-w-xs truncate" title={req.remark || 'No remark'}>
                                {req.remark || '-'}
                              </div>
                              <button
                                onClick={() => setRemarkModal({ show: true, requisitionId: req.requisition_id, currentRemark: req.remark || '' })}
                                className="text-blue-600 hover:text-blue-900 p-1 hover:bg-blue-50 rounded transition-colors"
                                title="Update remark"
                              >
                                <MessageSquare className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        )}
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(req.status)}`}>
                            {getStatusIcon(req.status)}
                            {req.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <div className="flex items-center justify-end gap-2">
                            {req.status?.toLowerCase() === 'pending' && (
                              <>
                                {canApprove && (
                                  <button
                                    onClick={() => handleApprove(req.requisition_id)}
                                    className="text-green-600 hover:text-green-900 p-1 hover:bg-green-50 rounded transition-colors"
                                    title="Approve"
                                  >
                                    <ThumbsUp className="w-4 h-4" />
                                  </button>
                                )}
                                {canReject && (
                                  <button
                                    onClick={() => handleReject(req.requisition_id)}
                                    className="text-red-600 hover:text-red-900 p-1 hover:bg-red-50 rounded transition-colors"
                                    title="Reject"
                                  >
                                    <ThumbsDown className="w-4 h-4" />
                                  </button>
                                )}
                              </>
                            )}
                            <button
                              onClick={() => onEdit(req)}
                              className="text-blue-600 hover:text-blue-900 p-1 hover:bg-blue-50 rounded transition-colors"
                              title="Edit"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                            {canDelete && (
                              <button
                                onClick={() => handleDelete(req.requisition_id)}
                                className="text-red-600 hover:text-red-900 p-1 hover:bg-red-50 rounded transition-colors"
                                title="Delete"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalCount > itemsPerPage && (
              <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
                <div className="flex items-center justify-between">
                  <div className="flex-1 flex justify-between sm:hidden">
                    <button
                      onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                      disabled={currentPage === 1}
                      className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Previous
                    </button>
                    <button
                      onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                      disabled={currentPage === totalPages}
                      className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Next
                    </button>
                  </div>
                  <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm text-gray-700">
                        Showing <span className="font-medium">{startIndex + 1}</span> to{' '}
                        <span className="font-medium">{endIndex}</span> of{' '}
                        <span className="font-medium">{totalCount}</span> results
                      </p>
                    </div>
                    <div>
                      <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
                        <button
                          onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                          disabled={currentPage === 1}
                          className="relative inline-flex items-center px-3 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          Previous
                        </button>
                        
                        {/* Page number display */}
                        <span className="relative inline-flex items-center px-4 py-2 border border-gray-300 bg-white text-sm font-medium text-gray-700">
                          Page {currentPage} of {totalPages}
                        </span>
                        
                        <button
                          onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                          disabled={currentPage === totalPages}
                          className="relative inline-flex items-center px-3 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          Next
                        </button>
                      </nav>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
      
      {/* Remark Modal */}
      {remarkModal.show && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Update Remark</h3>
              <textarea
                value={remarkModal.currentRemark}
                onChange={(e) => setRemarkModal({ ...remarkModal, currentRemark: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                rows="4"
                placeholder="Enter remark..."
              />
              <div className="mt-4 flex items-center justify-end gap-3">
                <button
                  onClick={() => setRemarkModal({ show: false, requisitionId: null, currentRemark: '' })}
                  className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleUpdateRemark}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                >
                  Save Remark
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RequisitionsList;
