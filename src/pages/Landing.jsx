import React, { useEffect } from "react";

export default function Landing() {
  useEffect(() => {
    document.title = "PriscomSales - Sales & Inventory Software";
    // Basic SEO tags injection (optional, for SPA)
    const metaDesc = document.createElement("meta");
    metaDesc.name = "description";
    metaDesc.content = "PriscomSales helps businesses manage sales, inventory, invoices and reports with ease.";
    document.head.appendChild(metaDesc);
    return () => {
      document.head.removeChild(metaDesc);
    };
  }, []);

  const videoUrl = "https://raw.githubusercontent.com/Pritex32/priscomac_sales_software/main/chibuzo_sales/0702-01_1751453097271.mp4";

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900">
      {/* Hero */}
      <section className="max-w-7xl mx-auto px-4 py-10 md:py-16 text-white">
        <div className="flex flex-col md:flex-row items-center gap-8">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-4">
              <img src="PriscomSales_logo_withtext_rockyart.png" alt="PriscomSales" className="w-10 h-10" />
              
            </div>
            <h1 className="text-4xl md:text-5xl font-extrabold leading-tight">
              Run a Smarter Business with Sales & Inventory that just works
            </h1>
            <p className="text-slate-300 mt-4 md:text-lg">
              Record daily sales, manage inventory, create invoices, track expenses and generate reports — all in one modern platform.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <a href="/login" className="px-5 py-2.5 rounded-md bg-emerald-500 hover:bg-emerald-600 font-semibold">Login</a>
              <a href="/register" className="px-5 py-2.5 rounded-md bg-white/10 hover:bg-white/20 border border-white/20 font-semibold">Create an account</a>
              <a href="http://localhost:8000/auth/terms" target="_blank" rel="noreferrer" className="px-5 py-2.5 rounded-md bg-white/10 hover:bg-white/20 border border-white/20 font-semibold">
                Terms & Conditions
              </a>
            </div>
          </div>
          <div className="flex-1 w-full">
            <div className="rounded-xl overflow-hidden border border-white/10 shadow-2xl">
              <video autoPlay muted loop controls style={{ width: "100%", display: "block" }}>
                <source src={videoUrl} type="video/mp4" />
                Your browser does not support HTML5 video.
              </video>
            </div>
          </div>
        </div>
      </section>

      {/* Feature Highlights */}
      <section className="max-w-7xl mx-auto px-4 py-10">
        <h2 className="text-white text-2xl md:text-3xl font-bold mb-6">Why PriscomSales?</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white/10 backdrop-blur rounded-xl border border-white/10 p-6 text-white">
            <h3 className="font-semibold text-xl mb-2">Sales & Invoices</h3>
            <p className="text-slate-300">Log sales quickly, generate professional invoices and share with customers.</p>
          </div>
          <div className="bg-white/10 backdrop-blur rounded-xl border border-white/10 p-6 text-white">
            <h3 className="font-semibold text-xl mb-2">Inventory Control</h3>
            <p className="text-slate-300">Track stock, transfers and low-stock alerts to stay on top of your goods.</p>
          </div>
          <div className="bg-white/10 backdrop-blur rounded-xl border border-white/10 p-6 text-white">
            <h3 className="font-semibold text-xl mb-2">Reports & Insights</h3>
            <p className="text-slate-300">Daily summaries and analytics to understand performance and profitability.</p>
          </div>
        </div>
      </section>

      {/* Value Proposition */}
      <section className="max-w-7xl mx-auto px-4 py-10">
        <div className="bg-white rounded-2xl shadow-xl p-6 md:p-10">
          <h3 className="text-2xl md:text-3xl font-extrabold mb-3 text-slate-900">Built for growing businesses</h3>
          <p className="text-slate-600">
            From recording sales to forecasting growth, PriscomSales gives you the right tools to scale. Create invoices,
            track expenses, reconcile payments, manage employees, transfer stock between warehouses, and export your data.
          </p>
          <ul className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-2 list-disc list-inside text-slate-700">
            <li>Sales logging with receipts and email sending</li>
            <li>Inventory & B2B stock transfer workflow</li>
            <li>Expenses, payments and vendor listing</li>
            <li>Custom sheets, requisitions and approvals</li>
            <li>CSV/Excel export and PDF receipts</li>
          </ul>
          <div className="mt-6 flex gap-3">
            <a href="/register" className="px-5 py-2.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white font-semibold">Get Started</a>
            <a href="/login" className="px-5 py-2.5 rounded-md bg-slate-900 text-white hover:bg-slate-800 font-semibold">Sign In</a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="text-center text-slate-300 text-sm py-10">
        © {new Date().getFullYear()} PriscomSales · <a href="http://localhost:8000/vendors/terms" target="_blank" rel="noreferrer" className="text-emerald-400 hover:underline">Vendor Terms</a>
      </footer>
    </div>
  );
}
