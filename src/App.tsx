import { HashRouter, Routes, Route } from 'react-router-dom';
import { Layout } from './components/layout/Layout';
import { Dashboard } from './pages/Dashboard';
import { Activity } from './pages/Activity';
import { Patients } from './pages/Patients';
import { PatientDetail } from './pages/PatientDetail';
import { Revenues } from './pages/Revenues';
import { Imports } from './pages/Imports';
import { Recouvrement } from './pages/Recouvrement';
import { Login } from './pages/Login';

function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<Layout />}>
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
