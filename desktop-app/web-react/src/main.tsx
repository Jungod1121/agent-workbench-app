import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import { queryClient } from './lib/query';
import './i18n';
import './styles/tailwind.css';
import './styles/tokens.css';
import './styles/glass.css';
import './styles/ui.css';

// 默认深色（阶段 3 由 useTheme 三态接管：light/dark/system）
document.documentElement.classList.add('dark');

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>,
);
