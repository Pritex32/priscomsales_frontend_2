import React, { useState } from 'react';
import RequisitionsList from '../components/RequisitionsList';
import RequisitionsForm from '../components/RequisitionsForm';

const Requisitions = () => {
  const [currentView, setCurrentView] = useState('list');
  const [selectedRequisition, setSelectedRequisition] = useState(null);

  const handleCreateNew = () => {
    setSelectedRequisition(null);
    setCurrentView('form');
  };

  const handleEdit = (requisition) => {
    setSelectedRequisition(requisition);
    setCurrentView('form');
  };

  const handleBack = () => {
    setSelectedRequisition(null);
    setCurrentView('list');
  };

  const handleSave = () => {
    setCurrentView('list');
    setSelectedRequisition(null);
  };

  return (
    <div className="min-h-screen bg-gray-50 py-6">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {currentView === 'list' ? (
          <RequisitionsList 
            onCreateNew={handleCreateNew}
            onEdit={handleEdit}
          />
        ) : (
          <RequisitionsForm
            requisition={selectedRequisition}
            onBack={handleBack}
            onSave={handleSave}
          />
        )}
      </div>
    </div>
  );
};

export default Requisitions;