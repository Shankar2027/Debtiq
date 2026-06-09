import { Toaster } from 'react-hot-toast';
import Dashboard from './pages/Dashboard';
import './styles/globals.css';

export default function App() {
  return (
    <>
      <Toaster position="top-right" toastOptions={{
        style: {
          background: 'var(--bg-card)',
          color: 'var(--text-bright)',
          border: '1px solid var(--border-mid)',
          borderRadius: 8, fontSize: 13,
          fontFamily: 'var(--font-mono)',
        },
        success: { iconTheme: { primary: '#39ff14', secondary: '#000' } },
        error:   { iconTheme: { primary: '#ff3860', secondary: '#000' } },
      }} />
      <Dashboard />
    </>
  );
}
