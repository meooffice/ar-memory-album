import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout.jsx'
import ProtectedRoute from './components/ProtectedRoute.jsx'
import Home from './pages/Home.jsx'
import AlbumDetails from './pages/AlbumDetails.jsx'
import ARScanner from './pages/ARScanner.jsx'
import Login from './pages/Login.jsx'
import Dashboard from './pages/admin/Dashboard.jsx'
import AlbumManage from './pages/admin/AlbumManage.jsx'
import Stats from './pages/admin/Stats.jsx'

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        <Route path="/album/:slug" element={<AlbumDetails />} />
        <Route path="/album/:slug/scan" element={<ARScanner />} />
        <Route path="/login" element={<Login />} />
        <Route element={<ProtectedRoute />}>
          <Route path="/admin" element={<Dashboard />} />
          <Route path="/admin/album/:id" element={<AlbumManage />} />
          <Route path="/admin/stats" element={<Stats />} />
        </Route>
      </Route>
    </Routes>
  )
}
