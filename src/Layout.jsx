import React from "react";

export default function Layout({ children, currentPageName }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <style>{`
        :root {
          --brand: #EF4444;
          --brand-dark: #DC2626;
          --brand-light: #FEF2F2;
          --brand-mid: #FECACA;
        }
      `}</style>
      {children}
    </div>
  );
}