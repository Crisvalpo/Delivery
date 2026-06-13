"use client";

import { useState, useEffect, useCallback } from "react";
import Head from "next/head";
import { Atkinson_Hyperlegible_Next } from "next/font/google";
import {
  Truck,
  CheckCircle2,
  Navigation,
  Phone,
  MapPin,
  Package,
  Loader2,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Lock,
  Clock,
  ArrowRight,
  MessageCircle,
} from "lucide-react";

const atkinson = Atkinson_Hyperlegible_Next({
  subsets: ["latin"],
  weight: ["400", "700"],
  display: "swap",
});

const ADMIN_SECRET = process.env.NEXT_PUBLIC_ADMIN_SECRET || "";

const ESTADO_CONFIG = {
  Preparado: {
    label: "Preparado",
    color: "text-indigo-400",
    bg: "bg-indigo-500/10 border-indigo-500/30",
    dot: "bg-indigo-400",
  },
  "En Ruta": {
    label: "En Ruta 🚐",
    color: "text-blue-400",
    bg: "bg-blue-500/10 border-blue-500/30",
    dot: "bg-blue-400 animate-pulse",
  },
  Entregado: {
    label: "Entregado ✅",
    color: "text-emerald-400",
    bg: "bg-emerald-500/10 border-emerald-500/30",
    dot: "bg-emerald-400",
  },
};

export default function RutaPage() {
  // Autenticación simple
  const [pinInput, setPinInput] = useState("");
  const [autenticado, setAutenticado] = useState(false);
  const [pinError, setPinError] = useState(false);

  // Auto-login Single Sign-On
  useEffect(() => {
    if (typeof window !== "undefined") {
      const auth = localStorage.getItem("luke_admin_authenticated");
      if (auth === "true") {
        setAutenticado(true);
      }
    }
  }, []);

  const [pedidos, setPedidos] = useState([]);
  const [ventana, setVentana] = useState(null);
  const [loading, setLoading] = useState(false);
  const [actualizando, setActualizando] = useState({}); // { [pedido_id]: bool }
  const [expandido, setExpandido] = useState({}); // { [pedido_id]: bool }
  const [toast, setToast] = useState(null);
  const [error, setError] = useState(null);

  const mostrarToast = (message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const validarPin = () => {
    if (pinInput === ADMIN_SECRET || pinInput === (ADMIN_SECRET?.slice(-4))) {
      setAutenticado(true);
      setPinError(false);
      if (typeof window !== "undefined") {
        localStorage.setItem("luke_admin_authenticated", "true");
      }
    } else {
      setPinError(true);
      setPinInput("");
    }
  };

  const fetchPedidos = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ruta-despacho", {
        headers: { "x-admin-secret": ADMIN_SECRET },
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.message || "Error al cargar los pedidos.");
        return;
      }
      // Ordenar: Preparado primero, En Ruta después, Entregado al final
      const orden = { Preparado: 0, "En Ruta": 1, Entregado: 2 };
      const sorted = [...(data.pedidos || [])].sort(
        (a, b) => (orden[a.estado] ?? 3) - (orden[b.estado] ?? 3)
      );
      setPedidos(sorted);
      setVentana(data.ventana || null);
    } catch (err) {
      setError("Error de conexión. Verifica tu red.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (autenticado) fetchPedidos();
  }, [autenticado, fetchPedidos]);

  const handleCambiarEstado = async (pedidoId, nuevoEstado) => {
    setActualizando((prev) => ({ ...prev, [pedidoId]: true }));
    try {
      const res = await fetch("/api/ruta-despacho", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-secret": ADMIN_SECRET,
        },
        body: JSON.stringify({ pedido_id: pedidoId, nuevo_estado: nuevoEstado }),
      });
      const data = await res.json();
      if (!data.success) {
        mostrarToast(`Error: ${data.error || "No se pudo actualizar."}`, "error");
        return;
      }

      // Actualizar estado local optimistamente
      setPedidos((prev) =>
        [...prev]
          .map((p) => (p.id === pedidoId ? { ...p, estado: nuevoEstado } : p))
          .sort((a, b) => {
            const orden = { Preparado: 0, "En Ruta": 1, Entregado: 2 };
            return (orden[a.estado] ?? 3) - (orden[b.estado] ?? 3);
          })
      );

      const msg =
        nuevoEstado === "En Ruta"
          ? `🚐 Pedido en ruta${data.wa_enviado ? " · WA enviado ✅" : ""}`
          : `✅ Entregado${data.wa_enviado ? " · WA enviado ✅" : ""}`;
      mostrarToast(msg, "success");
    } catch (err) {
      mostrarToast("Error de conexión.", "error");
    } finally {
      setActualizando((prev) => ({ ...prev, [pedidoId]: false }));
    }
  };

  const toggleExpandido = (pedidoId) => {
    setExpandido((prev) => ({ ...prev, [pedidoId]: !prev[pedidoId] }));
  };

  // Métricas
  const preparados = pedidos.filter((p) => p.estado === "Preparado").length;
  const enRuta = pedidos.filter((p) => p.estado === "En Ruta").length;
  const entregados = pedidos.filter((p) => p.estado === "Entregado").length;
  const total = pedidos.length;
  const progreso = total > 0 ? Math.round((entregados / total) * 100) : 0;

  // ─── Pantalla de autenticación ───────────────────────────────────────────────
  if (!autenticado) {
    return (
      <div className={`min-h-screen bg-slate-950 flex flex-col items-center justify-center px-6 ${atkinson.className}`}>
        <Head>
          <title>Ruta de Despacho | LukeDelivery</title>
          <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
        </Head>

        <div className="w-full max-w-xs space-y-6 text-center">
          <div className="flex justify-center">
            <div className="bg-blue-500/10 border border-blue-500/20 p-5 rounded-full">
              <Truck className="w-10 h-10 text-blue-400" />
            </div>
          </div>
          <div>
            <h1 className="text-xl font-black text-white">Ruta de Despacho</h1>
            <p className="text-xs text-slate-500 mt-1">Ingresa el PIN de acceso</p>
          </div>

          <div className="space-y-3">
            <div className="relative">
              <Lock className="absolute left-3 top-3 w-4 h-4 text-slate-500" />
              <input
                type="password"
                value={pinInput}
                onChange={(e) => { setPinInput(e.target.value); setPinError(false); }}
                onKeyDown={(e) => e.key === "Enter" && validarPin()}
                placeholder="PIN de administrador"
                className={`w-full bg-slate-900 border rounded-xl pl-9 pr-4 py-3 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-2 transition ${
                  pinError
                    ? "border-red-500/50 focus:ring-red-500/20"
                    : "border-slate-800 focus:ring-blue-500/20 focus:border-blue-500/50"
                }`}
                autoFocus
              />
            </div>
            {pinError && (
              <p className="text-xs text-red-400 font-semibold">PIN incorrecto. Intenta de nuevo.</p>
            )}
            <button
              onClick={validarPin}
              className="w-full bg-blue-600 hover:bg-blue-500 active:scale-95 text-white font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2"
            >
              <ArrowRight className="w-4 h-4" />
              Acceder a la Ruta
            </button>
          </div>
          <p className="text-[10px] text-slate-600 font-semibold uppercase tracking-wider">
            LukeDelivery B2B · Uso exclusivo personal autorizado
          </p>
        </div>
      </div>
    );
  }

  // ─── Vista principal del repartidor ─────────────────────────────────────────
  return (
    <div className={`min-h-screen bg-slate-950 text-slate-100 ${atkinson.className}`}>
      <Head>
        <title>Ruta de Despacho | LukeDelivery</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
      </Head>

      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-4 left-1/2 -translate-x-1/2 z-[99999] px-5 py-3 rounded-2xl text-sm font-bold shadow-xl animate-fade-in whitespace-nowrap ${
            toast.type === "success"
              ? "bg-emerald-500 text-white"
              : "bg-red-500 text-white"
          }`}
        >
          {toast.message}
        </div>
      )}

      {/* HEADER */}
      <header className="sticky top-0 z-50 bg-slate-950/95 backdrop-blur-md border-b border-slate-900 px-4 py-3">
        <div className="max-w-lg mx-auto">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-2.5">
              <div className="bg-blue-500/10 border border-blue-500/20 p-2 rounded-xl">
                <Truck className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <h1 className="text-base font-black text-white leading-none">Ruta del Día</h1>
                <p className="text-[10px] text-slate-500 mt-0.5 truncate max-w-[180px]">
                  {ventana?.nombre ?? "Sin ventana activa"}
                </p>
              </div>
            </div>
            <button
              onClick={fetchPedidos}
              disabled={loading}
              className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white transition active:scale-95"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>

          {/* Barra de progreso + chips */}
          {total > 0 && (
            <>
              <div className="flex items-center justify-between text-[10px] font-bold text-slate-500 mb-1">
                <span>Entregas completadas</span>
                <span>{entregados}/{total}</span>
              </div>
              <div className="w-full h-2 bg-slate-900 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500 bg-emerald-500"
                  style={{ width: `${progreso}%` }}
                />
              </div>
              <div className="flex gap-2 mt-2 text-[10px] font-bold flex-wrap">
                <span className="bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 px-2 py-0.5 rounded-full">
                  📦 {preparados} preparados
                </span>
                <span className="bg-blue-500/10 border border-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full">
                  🚐 {enRuta} en ruta
                </span>
                <span className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full">
                  ✅ {entregados} entregados
                </span>
              </div>
            </>
          )}
        </div>
      </header>

      {/* CONTENIDO */}
      <main className="max-w-lg mx-auto px-4 py-4 pb-24 space-y-3">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-32 gap-4">
            <Loader2 className="w-10 h-10 animate-spin text-blue-400" />
            <p className="text-sm text-slate-400 font-semibold">Cargando ruta del día...</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
            <AlertTriangle className="w-12 h-12 text-amber-400/50" />
            <p className="text-sm font-bold text-slate-300">{error}</p>
            <button
              onClick={fetchPedidos}
              className="flex items-center gap-2 px-4 py-2 bg-slate-800 border border-slate-700 text-slate-300 text-sm font-bold rounded-xl"
            >
              <RefreshCw className="w-4 h-4" />
              Reintentar
            </button>
          </div>
        ) : pedidos.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 gap-4 text-center">
            <Package className="w-16 h-16 text-slate-800 stroke-[1.2]" />
            <p className="text-base font-bold text-slate-400">Sin pedidos para despachar</p>
            <p className="text-xs text-slate-600 max-w-xs leading-relaxed">
              No hay pedidos en estado "Preparado" o "En Ruta" para la ventana activa.
            </p>
          </div>
        ) : (
          <>
            {/* Hint */}
            <div className="flex items-start gap-2 text-[11px] text-slate-500 bg-slate-900/60 border border-slate-800/60 rounded-xl px-3.5 py-2.5">
              <MessageCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-blue-400/60" />
              <span>Al marcar "En Ruta" y "Entregado", Jaime le enviará un aviso automático al cliente por WhatsApp.</span>
            </div>

            {pedidos.map((pedido) => {
              const cl = pedido.clientes;
              const cfg = ESTADO_CONFIG[pedido.estado] || ESTADO_CONFIG["Preparado"];
              const isActualizando = actualizando[pedido.id];
              const isEntregado = pedido.estado === "Entregado";
              const isEnRuta = pedido.estado === "En Ruta";
              const isExpandido = expandido[pedido.id];

              const waLink = cl?.whatsapp
                ? `https://wa.me/${cl.whatsapp.replace(/[^0-9]/g, "")}`
                : null;
              const mapsLink =
                cl?.latitud && cl?.longitud
                  ? `https://www.google.com/maps/dir/?api=1&destination=${cl.latitud},${cl.longitud}&travelmode=driving`
                  : null;

              return (
                <div
                  key={pedido.id}
                  className={`rounded-2xl border transition-all duration-300 overflow-hidden ${
                    isEntregado
                      ? "bg-emerald-500/5 border-emerald-500/20 opacity-70"
                      : isEnRuta
                      ? "bg-blue-500/5 border-blue-500/25 shadow-lg shadow-blue-500/5"
                      : "bg-slate-900/70 border-slate-800"
                  }`}
                >
                  <div className="p-4 space-y-3">
                    {/* Fila 1: Estado + Nombre */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] font-black uppercase tracking-wider mb-1.5 ${cfg.bg} ${cfg.color}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                          {cfg.label}
                        </div>
                        <h2 className="font-black text-base text-white leading-tight truncate">
                          {cl?.nombre_tienda ?? "Sin nombre"}
                        </h2>
                        <p className="text-xs text-slate-400 font-semibold">
                          {cl?.nombre_contacto} · {cl?.tipo_negocio ?? "Almacén"}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xl font-black text-white leading-none">
                          ${pedido.total_pagar?.toLocaleString("es-CL") ?? "0"}
                        </p>
                        <p className="text-[10px] text-slate-500 font-semibold mt-0.5">Total a cobrar</p>
                      </div>
                    </div>

                    {/* Fila 2: Sector + notas */}
                    <div className="flex items-center gap-1.5 text-xs text-slate-400">
                      <MapPin className="w-3.5 h-3.5 shrink-0 text-slate-600" />
                      <span className="font-semibold">{cl?.sector ?? "Sin sector"}</span>
                      {cl?.notas_campo && (
                        <>
                          <span className="text-slate-700">·</span>
                          <span className="italic text-slate-500 truncate max-w-[180px]">{cl.notas_campo}</span>
                        </>
                      )}
                    </div>

                    {/* Fila 3: Botones de acción táctiles */}
                    <div className="flex gap-2">
                      {/* Ir en Maps */}
                      {mapsLink && (
                        <a
                          href={mapsLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center justify-center gap-1.5 flex-1 py-3 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 font-bold text-sm active:scale-95 transition-all"
                        >
                          <Navigation className="w-4 h-4 text-blue-400" />
                          <span>Navegar</span>
                        </a>
                      )}
                      {/* WhatsApp */}
                      {waLink && (
                        <a
                          href={waLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center justify-center gap-1.5 flex-1 py-3 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 font-bold text-sm active:scale-95 transition-all"
                        >
                          <Phone className="w-4 h-4 text-emerald-400" />
                          <span>Avisar</span>
                        </a>
                      )}
                    </div>

                    {/* Fila 4: Botones de estado */}
                    {!isEntregado && (
                      <div className="flex gap-2">
                        {!isEnRuta && (
                          <button
                            onClick={() => handleCambiarEstado(pedido.id, "En Ruta")}
                            disabled={isActualizando}
                            className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl bg-blue-600 hover:bg-blue-500 active:scale-95 text-white font-black text-sm transition-all disabled:opacity-60"
                          >
                            {isActualizando ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Truck className="w-4 h-4" />
                            )}
                            Salir en Ruta
                          </button>
                        )}
                        <button
                          onClick={() => handleCambiarEstado(pedido.id, "Entregado")}
                          disabled={isActualizando}
                          className={`flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl font-black text-sm transition-all active:scale-95 disabled:opacity-60 ${
                            isEnRuta
                              ? "bg-emerald-600 hover:bg-emerald-500 text-white"
                              : "bg-slate-800 border border-slate-700 text-slate-300 hover:text-white"
                          }`}
                        >
                          {isActualizando ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <CheckCircle2 className="w-4 h-4" />
                          )}
                          Marcar Entregado
                        </button>
                      </div>
                    )}

                    {isEntregado && (
                      <div className="flex items-center justify-center gap-2 py-2 text-emerald-400 font-black text-sm">
                        <CheckCircle2 className="w-5 h-5" />
                        ¡Entregado!
                      </div>
                    )}

                    {/* Expandir ítems */}
                    <button
                      onClick={() => toggleExpandido(pedido.id)}
                      className="w-full flex items-center justify-between text-[10px] text-slate-600 hover:text-slate-400 font-bold uppercase tracking-wider pt-1 transition-colors"
                    >
                      <span className="flex items-center gap-1.5">
                        <Package className="w-3 h-3" />
                        {pedido.items_pedido?.length ?? 0} producto(s)
                      </span>
                      {isExpandido ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    </button>

                    {/* Detalle de ítems */}
                    {isExpandido && (
                      <div className="border-t border-slate-800/60 pt-2 space-y-1.5 animate-fade-in">
                        {pedido.items_pedido?.map((item, idx) => {
                          const agotado = item.estado === "no_disponible";
                          return (
                            <div key={idx} className={`flex justify-between items-center text-xs py-1 ${agotado ? "opacity-40" : ""}`}>
                              <div className="flex-1 min-w-0">
                                <span className={`font-semibold ${agotado ? "line-through text-slate-500" : "text-slate-300"}`}>
                                  {item.cantidad}x {item.productos?.nombre}
                                </span>
                                <span className="text-[10px] text-slate-600 block">{item.productos?.formato_venta}</span>
                              </div>
                              {agotado && (
                                <span className="text-[9px] font-black text-red-400 border border-red-500/20 bg-red-500/10 px-1.5 py-0.5 rounded">
                                  SIN STOCK
                                </span>
                              )}
                            </div>
                          );
                        })}

                        <div className="border-t border-slate-800/60 pt-2 flex justify-between text-xs font-bold text-slate-400">
                          <span>Flete incluido:</span>
                          <span>${pedido.flete?.toLocaleString("es-CL") ?? "0"}</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Cierre al completar todo */}
            {entregados === total && total > 0 && (
              <div className="flex flex-col items-center gap-3 py-8 text-center animate-fade-in">
                <div className="text-5xl">🎉</div>
                <p className="font-black text-emerald-400 text-lg">¡Ruta completada!</p>
                <p className="text-xs text-slate-500 leading-relaxed max-w-xs">
                  Todos los pedidos del día han sido entregados y los clientes notificados.
                </p>
              </div>
            )}
          </>
        )}
      </main>

      {/* Info de la ventana en el footer */}
      {ventana && (
        <div className="fixed bottom-0 left-0 right-0 bg-slate-950/95 border-t border-slate-900 px-4 py-3 z-30">
          <div className="max-w-lg mx-auto flex items-center justify-between text-[10px] text-slate-600 font-semibold">
            <span className="flex items-center gap-1.5">
              <Clock className="w-3 h-3" />
              Ventana: {ventana.nombre}
            </span>
            <span>
              Entrega:{" "}
              {new Date(ventana.fecha_entrega).toLocaleDateString("es-CL", {
                weekday: "short",
                day: "numeric",
                month: "short",
              })}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
