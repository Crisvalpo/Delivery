import { useState, useEffect } from "react";
import { Lock, AlertCircle, Loader2, Key } from "lucide-react";

export default function AdminAuthGuard({ children }) {
  const [authorized, setAuthorized] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [secretInput, setSecretInput] = useState("");
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setMounted(true);
    const localSecret = localStorage.getItem("ld_admin_secret");
    const adminSecret = process.env.NEXT_PUBLIC_ADMIN_SECRET;

    if (localSecret === adminSecret && adminSecret) {
      setAuthorized(true);
    }
  }, []);

  const handleLogin = (e) => {
    e.preventDefault();
    setError(false);
    setLoading(true);

    const adminSecret = process.env.NEXT_PUBLIC_ADMIN_SECRET;

    setTimeout(() => {
      if (secretInput === adminSecret && adminSecret) {
        localStorage.setItem("ld_admin_secret", secretInput);
        setAuthorized(true);
      } else {
        setError(true);
      }
      setLoading(false);
    }, 400); // Micro-animación de carga para hacerlo sentir más premium
  };

  if (!mounted) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-950 text-white font-sans">
        <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
      </div>
    );
  }

  if (!authorized) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950 text-white font-sans px-4 selection:bg-emerald-500/30 selection:text-emerald-300 animate-fade-in">
        <div className="w-full max-w-md bg-slate-900/40 border border-slate-800/80 rounded-2xl p-8 backdrop-blur-md shadow-2xl relative overflow-hidden">
          {/* Decorative background gradients */}
          <div className="absolute -top-24 -right-24 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

          <div className="flex flex-col items-center text-center mb-8">
            <div className="bg-emerald-500/10 p-3 rounded-2xl border border-emerald-500/20 text-emerald-400 mb-4 shadow-inner shadow-emerald-500/5">
              <Lock className="w-8 h-8" />
            </div>
            <h2 className="text-2xl font-black tracking-tight text-slate-100">Área Restringida</h2>
            <p className="text-xs text-slate-400 mt-2 leading-relaxed">
              Ingresa la clave maestra para acceder a las herramientas de administración de LukeDelivery B2B.
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="master-secret" className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <Key className="w-3.5 h-3.5 text-slate-400" />
                <span>Clave Maestra</span>
              </label>
              <input
                id="master-secret"
                type="password"
                required
                value={secretInput}
                onChange={(e) => setSecretInput(e.target.value)}
                placeholder="••••••••••••"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-slate-100 placeholder-slate-700 transition"
              />
            </div>

            {error && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl flex items-center gap-2.5 text-xs">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>La clave maestra no es correcta. Inténtalo de nuevo.</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-sm py-3.5 rounded-xl transition shadow-lg shadow-emerald-950/20 hover:shadow-emerald-900/30 flex items-center justify-center gap-2 cursor-pointer"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Verificando...</span>
                </>
              ) : (
                <span>Desbloquear Panel</span>
              )}
            </button>
          </form>
        </div>

        <p className="text-[10px] text-slate-600 mt-8 font-semibold tracking-wider uppercase">
          LukeDelivery B2B · Placilla
        </p>
      </div>
    );
  }

  return children;
}
