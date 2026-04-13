import React from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/layout/Layout';
import { Dashboard } from './pages/Dashboard';
import { Activity } from './pages/Activity';
import { Patients } from './pages/Patients';
import { PatientDetail } from './pages/PatientDetail';
import { Revenues } from './pages/Revenues';
import { Imports } from './pages/Imports';
import { Recouvrement } from './pages/Recouvrement';
import { Login } from './pages/Login';

function PrivateRoute({ children }: { children: React.ReactNode }) {
  return sessionStorage.getItem('authenticated') === '1'
    ? <>{children}</>
    : <Navigate to="/login" replace />;
}

function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
          <Route index element={<Dashboard />} />
          <Route path="activity" element={<Activity />} />
          <Route path="patients" element={<Patients />} />
          <Route path="patients/:id" element={<PatientDetail />} />
          <Route path="revenues" element={<Revenues />} />
          <Route path="imports" element={<Imports />} />
          <Route path="recouvrement" element={<Recouvrement />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}

export default App;
