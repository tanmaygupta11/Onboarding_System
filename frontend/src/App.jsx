import { Routes, Route, Navigate, useParams } from 'react-router-dom';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import ClientForm from './pages/ClientForm';
import PmLayout from './components/PmLayout';
import PayrollLeadLayout from './components/PayrollLeadLayout';
import PayrollClientLayout from './components/PayrollClientLayout';
import PayrollHeadLayout from './components/PayrollHeadLayout';
import PmDashboardHome from './pages/PmDashboardHome';
import PmClientsPage from './pages/PmClientsPage';
import PmClientDetail from './pages/PmClientDetail';
import PayrollLeadDashboardHome from './pages/PayrollLeadDashboardHome';
import PayrollClientDashboardHome from './pages/PayrollClientDashboardHome';
import PayrollClientApprovedEmployeesPage from './pages/PayrollClientApprovedEmployeesPage';
import PayrollClientFinalApprovedEmployeesPage from './pages/PayrollClientFinalApprovedEmployeesPage';
import PayrollClientRejectedEmployeesPage from './pages/PayrollClientRejectedEmployeesPage';
import PayrollClientIdentityNumbersPage from './pages/PayrollClientIdentityNumbersPage';
import PayrollHeadDashboardHome from './pages/PayrollHeadDashboardHome';
import PayrollHeadClientsPage from './pages/PayrollHeadClientsPage';
import OnboardingForm from './pages/OnboardingForm';
import OnboardingStatusPage from './pages/OnboardingStatusPage';
import ProtectedRoute from './components/ProtectedRoute';

function PmClientDefaultRedirect() {
  const { id } = useParams();
  return <Navigate to={`/pm-dashboard/client/${id}/pending`} replace />;
}

function PayrollClientDefaultRedirect() {
  const { id } = useParams();
  return <Navigate to={`/dashboard/client/${id}/dashboard`} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route
        path="/dashboard"
        element={
          <ProtectedRoute role="PAYROLL_LEAD">
            <PayrollLeadLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="clients" replace />} />
        <Route path="dashboard" element={<PayrollLeadDashboardHome />} />
        <Route path="clients" element={<Dashboard />} />
      </Route>
      <Route path="/clients/new" element={
        <ProtectedRoute role="PAYROLL_LEAD"><ClientForm /></ProtectedRoute>
      } />
      <Route path="/clients/:id/edit" element={
        <ProtectedRoute role="PAYROLL_LEAD"><ClientForm /></ProtectedRoute>
      } />
      <Route
        path="/dashboard/client/:id"
        element={
          <ProtectedRoute role="PAYROLL_LEAD">
            <PayrollClientDefaultRedirect />
          </ProtectedRoute>
        }
      />
      <Route
        path="/dashboard/client/:id"
        element={
          <ProtectedRoute role="PAYROLL_LEAD">
            <PayrollClientLayout />
          </ProtectedRoute>
        }
      >
        <Route path="dashboard" element={<PayrollClientDashboardHome />} />
        <Route path="approved-employees" element={<PayrollClientApprovedEmployeesPage />} />
        <Route path="pl-approved-employees" element={<PayrollClientFinalApprovedEmployeesPage />} />
        <Route path="rejected-employees" element={<PayrollClientRejectedEmployeesPage />} />
        <Route path="identity-numbers" element={<PayrollClientIdentityNumbersPage />} />
      </Route>

      <Route
        path="/pm-dashboard"
        element={
          <ProtectedRoute role="PROGRAM_MANAGER">
            <PmLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="clients" replace />} />
        <Route path="dashboard" element={<PmDashboardHome />} />
        <Route path="clients" element={<PmClientsPage />} />
        <Route path="client/:id" element={<PmClientDefaultRedirect />} />
        <Route path="client/:id/:tab" element={<PmClientDetail />} />
      </Route>
      <Route
        path="/admin-dashboard"
        element={
          <ProtectedRoute role="PAYROLL_HEAD">
            <PayrollHeadLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<PayrollHeadDashboardHome />} />
        <Route path="clients" element={<PayrollHeadClientsPage />} />
      </Route>

      <Route path="/onboardingform" element={<OnboardingForm />} />
      <Route path="/onboarding-status" element={<OnboardingStatusPage />} />

      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
