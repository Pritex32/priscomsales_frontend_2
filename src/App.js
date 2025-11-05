import React from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { Provider } from "react-redux";
import store from "./store/store";
import "./App.css";

// Import pages
import Landing from "./pages/Landing";
import Restock from './pages/Restock';
import Expenses from './pages/Expenses';
import Requisitions from './pages/Requisitions';
import VerifyEmail from './pages/VerifyEmail';
import ResendVerification from './pages/ResendVerification';

// Import only working components
import LoginForm from './components/LoginForm';
import RegisterForm from './components/RegisterForm';
import Dashboard from './components/Dashboard';
import B2BStockMovement from './components/B2BStockMovement';
import VendorRegistration from './components/VendorRegistration';
import VendorProductUpload from './components/VendorProductUpload';
import ShopFromWholesalers from './components/ShopFromWholesalers';
import ProtectedRoute from './components/ProtectedRoute';
import { useEffect } from 'react';
import api from './services/api';
import { useDispatch, useSelector } from 'react-redux';
import { setPermissions } from './store/authSlice';

// Main App component
const RBACBootstrap = () => {
  const dispatch = useDispatch();
  const isAuthenticated = useSelector(state => state.auth?.isAuthenticated);
  useEffect(() => {
    let timer = null;
    const refreshPerms = async () => {
      try {
        if (!isAuthenticated) return;
        const res = await api.get('/auth/my-permissions');
        if (res?.data) {
          console.log('[RBAC] refreshed permissions', res.data);
          dispatch(setPermissions({ permissions: res.data.permissions || [], permission_codes: res.data.permission_codes || [] }));
        }
      } catch (e) {
        // ignore
      }
    };
    refreshPerms();
    // Periodic refresh to reflect MD changes
    timer = setInterval(refreshPerms, 120000);
    return () => { if (timer) clearInterval(timer); };
  }, [isAuthenticated, dispatch]);
  return null;
};

function App() {
  return (
    <Provider store={store}>
      <Router>
        <RBACBootstrap />
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/landing" element={<Landing />} />
          <Route path="/login" element={<LoginForm />} />
          <Route path="/register" element={<RegisterForm />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/verify-email" element={<VerifyEmail />} />
          <Route path="/auth/verify" element={<VerifyEmail />} />
          <Route path="/dashboard/:page" element={<Dashboard />} />
          <Route path="/restock" element={
            <ProtectedRoute resourceKey="restock.page.access">
              <Restock />
            </ProtectedRoute>
          } />
          <Route path="/expenses" element={<Expenses />} />
          <Route path="/requisitions" element={<Requisitions />} />
          <Route path="/b2b-movement" element={
            <ProtectedRoute resourceKey="stock_movement.page.access">
              <B2BStockMovement />
            </ProtectedRoute>
          } />
          <Route path="/vendor-registration" element={<VendorRegistration />} />
          <Route path="/vendor-product-upload" element={<VendorProductUpload />} />
          <Route path="/shop" element={<ShopFromWholesalers />} />
        </Routes>
      </Router>
    </Provider>
  );
}

export default App;
