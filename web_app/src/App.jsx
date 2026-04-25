import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import HomePage from './pages/HomePage'
import UploadPage from './pages/UploadPage'
import ResultsPage from './pages/ResultsPage'
import InteractionsPage from './pages/InteractionsPage'
import HistoryPage from './pages/HistoryPage'
import DashboardPage from './pages/DashboardPage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="upload" element={<UploadPage />} />
        <Route path="results/:id" element={<ResultsPage />} />
        <Route path="results" element={<ResultsPage />} />
        <Route path="interactions" element={<InteractionsPage />} />
        <Route path="history" element={<HistoryPage />} />
        <Route path="dashboard" element={<DashboardPage />} />
      </Route>
    </Routes>
  )
}
