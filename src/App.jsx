import { HashRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './auth/AuthProvider.jsx'
import { ToastProvider } from './components/Toast.jsx'
import RequireAuth from './components/RequireAuth.jsx'
import AppLayout from './components/AppLayout.jsx'
import LoginPage from './pages/LoginPage.jsx'
import HomePage from './pages/HomePage.jsx'
import VolumesPage from './board/VolumesPage.jsx'
import VolumeBoardPage from './board/VolumeBoardPage.jsx'
import ComparePage from './board/ComparePage.jsx'

function Placeholder({ name }) {
  return <p className="text-gray-500">{name} — 이후 단계에서 구현됩니다.</p>
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <HashRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              element={
                <RequireAuth>
                  <AppLayout />
                </RequireAuth>
              }
            >
              <Route path="/" element={<HomePage />} />
              <Route path="/volumes" element={<VolumesPage />} />
              <Route path="/volumes/:id" element={<VolumeBoardPage />} />
              <Route path="/compare" element={<ComparePage />} />
              <Route path="/schedule" element={<Placeholder name="일정" />} />
              <Route path="/library" element={<Placeholder name="자료실" />} />
              <Route path="/contacts" element={<Placeholder name="연락처" />} />
            </Route>
          </Routes>
        </HashRouter>
      </ToastProvider>
    </AuthProvider>
  )
}
