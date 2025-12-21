import React from 'react';
import { createRoot } from 'react-dom/client';
import { Popup } from './Popup.jsx';
import './styles.css';

const container = document.getElementById('root');
const root = createRoot(container);

root.render(
  <React.StrictMode>
    <Popup />
  </React.StrictMode>
);
