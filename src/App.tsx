import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Layout } from './components/layout/Layout';
import { Dashboard } from './pages/Dashboard';
import { Activity } from './pages/Activity';
import { Patients } from './pages/Patients';
import { PatientDetail } from './pages/PatientDetail';
import { Revenues } from './pages/Revenues';
import { Imports } from './pages/Imports';
import { Users } from './pages/Users';
import { Settings } from './pages/Settings';
import { Login } from './pages/Login';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="activity" element={<Activity />} />
          <Route path="patients" element={<Patients />} />
          <Route path="patients/:id" element={<PatientDetail />} />
          <Route path="revenues" element={<Revenues />} />
          <Route path="imports" element={<Imports />} />
          <Route path="users" element={<Users />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
