import Link from "next/link";
import { MessageCircle, UserPlus, ChevronRight, ShieldCheck, Truck, Percent, HelpCircle } from "lucide-react";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-[#070b13] text-slate-100 font-sans selection:bg-emerald-500/30 selection:text-emerald-300 relative overflow-hidden flex flex-col justify-between">
      {/* Decorative background glows */}
      <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] bg-emerald-500/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[600px] h-[600px] bg-blue-500/10 rounded-full blur-[120px] pointer-events-none" />

      {/* Top Navbar */}
      <header className="w-full max-w-5xl mx-auto px-6 py-6 flex items-center justify-between z-10 relative">
        <div className="flex items-center gap-2">
          <div className="bg-emerald-500/10 p-2 rounded-xl border border-emerald-500/20 text-emerald-400">
            <Truck className="w-5 h-5" />
          </div>
          <div>
            <span className="font-black tracking-tight text-lg text-slate-100">LukeDelivery</span>
            <span className="ml-1.5 px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">B2B</span>
          </div>
        </div>
        <div className="text-xs text-slate-400 font-semibold bg-slate-900/40 border border-slate-800/80 px-3 py-1.5 rounded-full backdrop-blur-sm">
          📍 Placilla & Curauma
        </div>
      </header>

      {/* Hero Section */}
      <main className="w-full max-w-5xl mx-auto px-6 py-12 flex-grow flex flex-col lg:flex-row items-center gap-12 z-10 relative">
        
        {/* Left Column: Text & CTAs */}
        <div className="flex-1 text-center lg:text-left space-y-6 max-w-xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold w-fit mx-auto lg:mx-0">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Piloto Comercial Activo
          </div>
          
          <h1 className="text-4xl sm:text-5xl font-black tracking-tight text-slate-100 leading-[1.1]">
            Abastecimiento inteligente al <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400">costo real</span>
          </h1>
          
          <p className="text-slate-400 text-base sm:text-lg leading-relaxed font-medium">
            Accede al catálogo de distribución mayorista con precios de costo transparente y fletes consolidados de reparto. Diseñado exclusivamente para almacenes de barrio.
          </p>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row items-center gap-4 pt-4 justify-center lg:justify-start">
            <a
              href="https://wa.me/56951875221?text=Hola%20Jaime,%20necesito%20hacer%20un%20pedido"
              target="_blank"
              rel="noopener noreferrer"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 bg-[#25D366] hover:bg-[#20bd5a] text-white font-extrabold text-base px-8 py-4 rounded-2xl transition duration-300 shadow-xl shadow-[#25D366]/15 hover:shadow-[#25D366]/25 transform hover:-translate-y-0.5 cursor-pointer"
            >
              <MessageCircle className="w-5 h-5 shrink-0" />
              <span>Pedir por WhatsApp</span>
            </a>
            
            <Link
              href="/registro"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-slate-900/80 hover:bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-200 hover:text-white font-bold text-base px-8 py-4 rounded-2xl transition duration-300 backdrop-blur-sm cursor-pointer"
            >
              <UserPlus className="w-5 h-5 shrink-0 text-emerald-400" />
              <span>Registrar mi Almacén</span>
            </Link>
          </div>
        </div>

        {/* Right Column: Interactive Details & How It Works */}
        <div className="flex-1 w-full max-w-md lg:max-w-none space-y-6">
          
          {/* Card: How it works */}
          <div className="bg-slate-900/30 border border-slate-900 rounded-3xl p-6 backdrop-blur-md shadow-2xl relative">
            <h3 className="text-sm font-black uppercase tracking-widest text-emerald-400 mb-6 flex items-center gap-2">
              <HelpCircle className="w-4 h-4" />
              <span>¿Cómo funciona el bot?</span>
            </h3>
            
            <div className="space-y-6">
              {/* Step 1 */}
              <div className="flex items-start gap-4">
                <div className="w-8 h-8 rounded-full bg-slate-850 border border-slate-800 text-slate-300 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                  1
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-200">Escríbele a Jaime</h4>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                    Manda un WhatsApp a Jaime pidiéndole el catálogo o tu pedido. Él te reconocerá de inmediato.
                  </p>
                </div>
              </div>

              {/* Step 2 */}
              <div className="flex items-start gap-4">
                <div className="w-8 h-8 rounded-full bg-slate-850 border border-slate-800 text-slate-300 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                  2
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-200">Arma tu Pedido en Línea</h4>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                    Jaime te enviará un link seguro que expira en 2 horas para abrir el catálogo, ver precios de costo y armar tu carrito.
                  </p>
                </div>
              </div>

              {/* Step 3 */}
              <div className="flex items-start gap-4">
                <div className="w-8 h-8 rounded-full bg-slate-850 border border-slate-800 text-slate-300 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                  3
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-200">Recibe y Ahorra Flete</h4>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                    Confirmas tu pedido y se despacha a tu local. Si haces otro pedido en la misma ventana horaria, se fusiona automáticamente sin cobrar doble flete.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Grid: Mini Benefits */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-slate-900/30 border border-slate-900/50 rounded-2xl p-4.5 flex gap-3 items-start backdrop-blur-sm">
              <Percent className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <h5 className="text-xs font-bold text-slate-200">Precios Transparentes</h5>
                <p className="text-[10px] text-slate-500 mt-1 leading-relaxed">Pagas el costo real del mayorista.</p>
              </div>
            </div>
            <div className="bg-slate-900/30 border border-slate-900/50 rounded-2xl p-4.5 flex gap-3 items-start backdrop-blur-sm">
              <ShieldCheck className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
              <div>
                <h5 className="text-xs font-bold text-slate-200">Enlaces Seguros</h5>
                <p className="text-[10px] text-slate-500 mt-1 leading-relaxed">Acceso encriptado por WhatsApp.</p>
              </div>
            </div>
          </div>
          
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full max-w-5xl mx-auto px-6 py-8 border-t border-slate-900/60 flex flex-col sm:flex-row items-center justify-between gap-4 z-10 relative">
        <p className="text-[10px] text-slate-500 font-semibold tracking-wider uppercase">
          Honestidad Radical B2B • LukeDelivery
        </p>
        <p className="text-[9px] text-slate-600 font-bold uppercase">
          © {new Date().getFullYear()} Piloto Placilla & Curauma
        </p>
      </footer>
    </div>
  );
}
