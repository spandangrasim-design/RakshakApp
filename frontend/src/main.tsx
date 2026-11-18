import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import 'leaflet/dist/leaflet.css';
import './index.css';
import { installAuthFetch } from './services/api';
import { installAlertShim } from './components/ui/Toast';

installAuthFetch();
installAlertShim();

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);