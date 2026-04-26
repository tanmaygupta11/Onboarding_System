import { Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import ClientForm from './pages/ClientForm';
import PmDashboard from './pages/PmDashboard';
import PmClientDetail from './pages/PmClientDetail';
import ProtectedRoute from './components/ProtectedRoute';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route path="/dashboard" element={
        <ProtectedRoute role="PAYROLL_LEAD"><Dashboard /></ProtectedRoute>
      } />
      <Route path="/clients/new" element={
        <ProtectedRoute role="PAYROLL_LEAD"><ClientForm /></ProtectedRoute>
      } />
      <Route path="/clients/:id/edit" element={
        <ProtectedRoute role="PAYROLL_LEAD"><ClientForm /></ProtectedRoute>
      } />

      <Route path="/pm-dashboard" element={
        <ProtectedRoute role="PROGRAM_MANAGER"><PmDashboard /></ProtectedRoute>
      } />
      <Route path="/pm-dashboard/client/:id" element={
        <ProtectedRoute role="PROGRAM_MANAGER"><PmClientDetail /></ProtectedRoute>
      } />

      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
