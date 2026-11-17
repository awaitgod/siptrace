import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './ui/theme/diptrace.css';

// Canvas text is painted once per render, so load its font before mounting the editor.
const mount = () => ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><App /></React.StrictMode>
);
if (document.fonts) {
  Promise.allSettled([
    document.fonts.load('400 12px "Inter"', 'Схема'),
    document.fonts.load('600 12px "Inter"', 'Схема'),
    document.fonts.load('400 12px "OpenGost"', 'Схема')
  ]).then(mount);
} else {
  mount();
}
