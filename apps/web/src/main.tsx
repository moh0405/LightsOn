import React from "react";
import "./main.css";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { ScreenApp } from "./screen/ScreenApp";
import { PlayApp } from "./play/PlayApp";
import { AdminApp } from "./admin/AdminApp";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/screen" element={<ScreenApp />} />
        <Route path="/play" element={<PlayApp />} />
        <Route path="/admin" element={<AdminApp />} />
        <Route path="*" element={<Navigate to="/screen" replace />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
);
