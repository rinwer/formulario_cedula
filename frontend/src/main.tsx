import React from "react";
import ReactDOM from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App";
import "./index.css";

// autoUpdate: el service worker se actualiza solo en segundo plano y toma
// control en la siguiente carga, para que un lider en campo nunca quede
// pegado en una version vieja de la app.
registerSW({ immediate: true });

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
