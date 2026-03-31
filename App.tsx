import React from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import Navbar from './components/Navbar';
import Home from './pages/Home';
import GeneralDataPage from './pages/GeneralDataPage';
import CompositionPage from './pages/CompositionPage';
import AxlePage from './pages/AxlePage';
import EsalsPage from './pages/EsalsPage';
import EsalCalculationPage from './pages/EsalCalculationPage';
import UnamPage from './pages/UnamPage';
import { FirebaseProvider } from './components/FirebaseProvider';
import ErrorBoundary from './components/ErrorBoundary';

const App: React.FC = () => {
  return (
    <ErrorBoundary>
      <FirebaseProvider>
        <HashRouter>
          <div className="min-h-screen flex flex-col bg-slate-50 font-sans text-slate-900">
            <Navbar />
            <main className="flex-grow">
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/datos" element={<GeneralDataPage />} />
                <Route path="/composicion" element={<CompositionPage />} />
                <Route path="/ejes" element={<AxlePage />} />
                <Route path="/esals" element={<EsalsPage />} />
                <Route path="/calculo-esals" element={<EsalCalculationPage />} />
                <Route path="/unam" element={<UnamPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </main>
            <footer className="bg-white border-t border-slate-200 py-6 text-center text-slate-500 text-sm no-print">
              <p className="mb-1">Desarrollo por: M en I. Ing. Martín Olvera Corona</p>
              <p>Dic. 2025 tel 961-6622-614 email: incimoc@gmail.com</p>
            </footer>
          </div>
        </HashRouter>
      </FirebaseProvider>
    </ErrorBoundary>
  );
};

export default App;
