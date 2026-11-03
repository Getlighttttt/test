import { useState } from 'react'
import { Routes, Route } from 'react-router-dom';
import Login from './pages/Login.jsx';
import Layout from './components/Layout.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import Tsd from './pages/Tsd.jsx';
import ReceivingArea from './pages/ReceivingArea.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Line from './pages/Line.jsx';
import Quarantine from './pages/Quarantine.jsx';
import Deviations from './pages/Deviations.jsx';
import QuarantineCases from './pages/QuarantineCases.jsx';
import Requests from './pages/Requests.jsx';
import LineInventory from './pages/LineInventory.jsx';
import Consumption from './pages/Consumption.jsx';

function App() {
  const [count, setCount] = useState(0)

  return (
    <Routes>
      <Route path="/" element={<Login />} />

      <Route path="/tsd" element={
        <ProtectedRoute role="Skladnik">
          <Layout><Tsd /></Layout>
        </ProtectedRoute>
      }/>

      <Route path="/tsd/receiving" element={
        <ProtectedRoute role="Skladnik">
          <Layout><ReceivingArea /></Layout>
        </ProtectedRoute>
      } />

      <Route path="/tsd/line" element={
        <ProtectedRoute role="Skladnik">
        <Layout><Line /></Layout>
        </ProtectedRoute>
      } />

      <Route path="/tsd/consumption" element={
        <ProtectedRoute role="Skladnik">
          <Layout><Consumption /></Layout>
        </ProtectedRoute>
      } />

      <Route path="/tsd/quarantine" element={
        <ProtectedRoute role="Skladnik">
        <Layout><Quarantine /></Layout>
        </ProtectedRoute>
      } />

      <Route path="/dashboard" element={
        <ProtectedRoute role="Dispecer">
          <Layout><Dashboard /></Layout>
        </ProtectedRoute>
      } />

      <Route path="/dashboard/deviations" element={
        <ProtectedRoute role="Dispecer">
          <Layout><Deviations /></Layout>
        </ProtectedRoute>
      } />

      <Route path="/dashboard/quarantine" element={
        <ProtectedRoute role="Dispecer">
          <Layout><QuarantineCases /></Layout>
        </ProtectedRoute>
      } />

      <Route path="/dashboard/lines" element={
        <ProtectedRoute role="Dispecer">
          <Layout><LineInventory /></Layout>
        </ProtectedRoute>
      } />

      <Route path="/dashboard/requests" element={
        <ProtectedRoute role="Dispecer">
        <Layout><Requests /></Layout>
        </ProtectedRoute>
      } />
    </Routes>
  )
}

export default App
