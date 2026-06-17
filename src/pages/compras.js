"use client";

import { useState, useEffect, useCallback } from "react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { Atkinson_Hyperlegible_Next } from "next/font/google";
import {
  ShoppingCart,
  CheckCircle2,
  XCircle,
  RotateCcw,
  ArrowLeft,
  Loader2,
  PackageX,
  Share2,
  AlertTriangle,
  Truck,
} from "lucide-react";

const atkinson = Atkinson_Hyperlegible_Next({
  subsets: ["latin"],
  weight: ["400", "700"],
  display: "swap",
});

const ADMIN_SECRET = process.env.NEXT_PUBLIC_ADMIN_SECRET || "";

// Estado visual de cada ítem en la lista local
// 'pendiente' | 'conseguido' | 'agotado'
const ESTADO_INICIAL = "pendiente";

function obtenerDesgloseTexto(Q, E, M) {
  if (!E && (!M || M === 1)) return "";
  
  let cajas = 0;
  let packs = 0;
  let unidades = Q;
  
  if (E && (!M || M === 1)) {
    cajas = Math.floor(Q / E);
    unidades = Q % E;
  } else if (!E && M > 1) {
    packs = Math.floor(Q / M);
    unidades = Q % M;
  } else if (E && M > 1) {
    cajas = Math.floor(Q / E);
    let resto = Q - (cajas * E);
    while (cajas > 0 && resto % M !== 0) {
      cajas--;
      resto = Q - (cajas * E);
    }
    packs = Math.floor(resto / M);
    unidades = resto % M;
  }
  
  const partes = [];
  if (cajas > 0) partes.push(`${cajas} ${cajas === 1 ? 'caja' : 'cajas'} (${E}u)`);
  if (packs > 0) partes.push(`${packs} ${packs === 1 ? 'pack' : 'packs'} (${M}u)`);
  if (unidades > 0) partes.push(`${unidades} ${unidades === 1 ? 'unidad' : 'unidades'}`);
  
  return partes.length > 0 ? `📦 Equivale a: ${partes.join(" + ")}` : "";
}

export default function ComprasPage() {
  const router = useRouter();
  const [items, setItems] = useState([]); // lista del servidor
  const [estadoLocal, setEstadoLocal] = useState({}); // { [producto_id]: 'pendiente' | 'conseguido' | 'agotado' }
  const [ventana, setVentana] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [guardando, setGuardando] = useState({}); // { [producto_id]: boolean }
  const [toast, setToast] = useState(null); // { message, type }
  const [activandoRuta, setActivandoRuta] = useState(false);

  const activarRutaDespacho = async () => {
    setActivandoRuta(true);
    try {
      const res = await fetch("/api/admin-consolidar", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-secret": ADMIN_SECRET,
        },
        body: JSON.stringify({ accion: "preparar_todos" }),
      });
      const data = await res.json();
      if (!data.success) {
        mostrarToast("Error al activar la ruta de despacho.", "error");
        return;
      }
      
      // Auto-login Single Sign-On
      if (typeof window !== "undefined") {
        localStorage.setItem("luke_admin_authenticated", "true");
      }
      mostrarToast("🚚 Pedidos preparados. ¡Iniciando ruta!", "success");
      router.push("/ruta");
    } catch {
      mostrarToast("Error de conexión al activar la ruta.", "error");
    } finally {
      setActivandoRuta(false);
    }
  };

  const mostrarToast = (message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 2500);
  };

  const fetchConsolidado = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin-consolidar", {
        headers: { "x-admin-secret": ADMIN_SECRET },
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.message || "Error al cargar la lista de compras.");
        setItems([]);
        return;
      }
      setItems(data.items || []);
      setVentana(data.ventana || null);

      // Inicializar estado local con el estado real retornado del servidor
      const inicial = {};
      (data.items || []).forEach((it) => {
        inicial[it.producto_id] = it.estado || ESTADO_INICIAL;
      });
      setEstadoLocal(inicial);
    } catch (err) {
      setError("Error de conexión al cargar la lista.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConsolidado();
  }, [fetchConsolidado]);

  const marcarItem = async (productoId, accion) => {
    // Optimistic UI
    setEstadoLocal((prev) => ({ ...prev, [productoId]: accion }));
    setGuardando((prev) => ({ ...prev, [productoId]: true }));

    try {
      const res = await fetch("/api/admin-consolidar", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-secret": ADMIN_SECRET,
        },
        body: JSON.stringify({ producto_id: productoId, accion }),
      });
      const data = await res.json();
      if (!data.success) {
        // Revertir
        setEstadoLocal((prev) => ({ ...prev, [productoId]: ESTADO_INICIAL }));
        mostrarToast("Error al guardar. Intenta de nuevo.", "error");
      } else {
        mostrarToast(
          accion === "conseguido" ? "✅ Marcado como conseguido" : "❌ Marcado como agotado",
          accion === "conseguido" ? "success" : "warning"
        );
      }
    } catch {
      setEstadoLocal((prev) => ({ ...prev, [productoId]: ESTADO_INICIAL }));
      mostrarToast("Error de conexión.", "error");
    } finally {
      setGuardando((prev) => ({ ...prev, [productoId]: false }));
    }
  };

  const resetearItem = async (productoId) => {
    // Optimistic UI
    setEstadoLocal((prev) => ({ ...prev, [productoId]: ESTADO_INICIAL }));
    setGuardando((prev) => ({ ...prev, [productoId]: true }));

    try {
      const res = await fetch("/api/admin-consolidar", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-secret": ADMIN_SECRET,
        },
        body: JSON.stringify({ producto_id: productoId, accion: "pendiente" }),
      });
      const data = await res.json();
      if (!data.success) {
        setEstadoLocal((prev) => ({ ...prev, [productoId]: "conseguido" }));
        mostrarToast("Error al restablecer. Intenta de nuevo.", "error");
      } else {
        mostrarToast("🔄 Producto restablecido a pendiente", "success");
      }
    } catch {
      setEstadoLocal((prev) => ({ ...prev, [productoId]: "conseguido" }));
      mostrarToast("Error de conexión.", "error");
    } finally {
      setGuardando((prev) => ({ ...prev, [productoId]: false }));
    }
  };

  // Métricas
  const total = items.length;
  const conseguidos = Object.values(estadoLocal).filter((s) => s === "conseguido").length;
  const agotados = Object.values(estadoLocal).filter((s) => s === "agotado").length;
  const pendientes = total - conseguidos - agotados;
  const progreso = total > 0 ? Math.round(((conseguidos + agotados) / total) * 100) : 0;

  // Ordenar: pendientes primero, luego conseguidos, luego agotados
  const itemsOrdenados = [...items].sort((a, b) => {
    const orden = { pendiente: 0, conseguido: 1, agotado: 2 };
    return (orden[estadoLocal[a.producto_id]] ?? 0) - (orden[estadoLocal[b.producto_id]] ?? 0);
  });

  const itemsAgrupadosPorProveedor = itemsOrdenados.reduce((acc, item) => {
    const prov = item.proveedor || "Sin Proveedor";
    if (!acc[prov]) {
      acc[prov] = [];
    }
    acc[prov].push(item);
    return acc;
  }, {});

  const proveedoresOrdenados = Object.keys(itemsAgrupadosPorProveedor).sort((a, b) => {
    if (a === "Sin Proveedor" && b !== "Sin Proveedor") return 1;
    if (b === "Sin Proveedor" && a !== "Sin Proveedor") return -1;
    return a.localeCompare(b);
  });

  const compartirLista = () => {
    const lineas = [];
    
    proveedoresOrdenados.forEach((provNombre) => {
      lineas.push(`*${provNombre}:*`);
      itemsAgrupadosPorProveedor[provNombre].forEach((it) => {
        const estado = estadoLocal[it.producto_id];
        const icono = estado === "conseguido" ? "✅" : estado === "agotado" ? "❌" : "🔲";
        const desc = obtenerDesgloseTexto(it.cantidad_total, it.unidades_embalaje, it.venta_multiplo);
        const descTexto = desc ? ` (${desc.replace('📦 Equivale a: ', '')})` : '';
        lineas.push(`${icono} ${it.cantidad_total}x ${it.nombre} (${it.formato_venta})${descTexto}`);
      });
      lineas.push("");
    });

    const texto = lineas.join("\n").trim();

    const mensaje = `📋 Lista de Compras LukeDelivery\n${ventana ? `Ventana: ${ventana.nombre}\n` : ""}${new Date().toLocaleDateString("es-CL")}\n\n${texto}\n\n✅ ${conseguidos} conseguidos  ❌ ${agotados} agotados  🔲 ${pendientes} pendientes`;

    if (navigator.share) {
      navigator.share({ title: "Lista de Compras LukeDelivery", text: mensaje });
    } else {
      navigator.clipboard.writeText(mensaje).then(() =>
        mostrarToast("📋 Lista copiada al portapapeles", "success")
      );
    }
  };

  return (
    <div className={`min-h-screen bg-slate-950 text-slate-100 ${atkinson.className}`}>
      <Head>
        <title>Lista de Compras | LukeDelivery</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
        <meta name="description" content="Lista de compras consolidada para el furgón LukeDelivery." />
      </Head>

      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-4 left-1/2 -translate-x-1/2 z-[99999] px-5 py-3 rounded-2xl text-sm font-bold shadow-xl transition-all animate-fade-in ${
            toast.type === "success"
              ? "bg-emerald-500 text-white"
              : toast.type === "warning"
              ? "bg-amber-500 text-white"
              : "bg-red-500 text-white"
          }`}
        >
          {toast.message}
        </div>
      )}

      {/* HEADER */}
      <header className="sticky top-0 z-50 bg-slate-950/95 backdrop-blur-md border-b border-slate-900 px-4 py-3">
        <div className="max-w-lg mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link
              href="/admin-luke"
              className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div>
              <h1 className="text-base font-bold leading-none text-white flex items-center gap-1.5">
                <ShoppingCart className="w-4 h-4 text-emerald-400" />
                Lista de Compras
              </h1>
              <p className="text-[10px] text-slate-500 mt-0.5">
                {ventana ? ventana.nombre : "Furgón LukeDelivery"}
              </p>
            </div>
          </div>
          <button
            onClick={compartirLista}
            disabled={items.length === 0}
            className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-emerald-400 transition-colors disabled:opacity-30"
            title="Compartir lista"
          >
            <Share2 className="w-4 h-4" />
          </button>
        </div>

        {/* Barra de progreso */}
        {!loading && items.length > 0 && (
          <div className="max-w-lg mx-auto mt-3">
            <div className="flex items-center justify-between text-[10px] font-bold text-slate-500 mb-1.5">
              <span>Progreso de compra</span>
              <span>{progreso}% completado</span>
            </div>
            <div className="w-full h-2 bg-slate-900 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${progreso}%`,
                  background:
                    progreso === 100
                      ? "#22c55e"
                      : progreso > 60
                      ? "#84cc16"
                      : progreso > 30
                      ? "#eab308"
                      : "#f97316",
                }}
              />
            </div>
            {/* Chips de métricas */}
            <div className="flex gap-2 mt-2 text-[10px] font-bold">
              <span className="bg-slate-800 border border-slate-700 text-slate-300 px-2 py-0.5 rounded-full">
                🔲 {pendientes} pendientes
              </span>
              <span className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full">
                ✅ {conseguidos} conseguidos
              </span>
              <span className="bg-red-500/10 border border-red-500/20 text-red-400 px-2 py-0.5 rounded-full">
                ❌ {agotados} agotados
              </span>
            </div>
          </div>
        )}
      </header>

      {/* CONTENIDO */}
      <main className="max-w-lg mx-auto px-4 py-5 pb-24 space-y-3">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-32 gap-4">
            <Loader2 className="w-10 h-10 animate-spin text-emerald-400" />
            <p className="text-sm text-slate-400 font-semibold">Cargando lista de compras...</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
            <AlertTriangle className="w-12 h-12 text-amber-400/50" />
            <p className="text-sm font-bold text-slate-300">{error}</p>
            <button
              onClick={fetchConsolidado}
              className="flex items-center gap-2 px-4 py-2 bg-slate-800 border border-slate-700 text-slate-300 text-sm font-bold rounded-xl transition hover:bg-slate-700"
            >
              <RotateCcw className="w-4 h-4" />
              Reintentar
            </button>
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 gap-4 text-center">
            <PackageX className="w-16 h-16 text-slate-700 stroke-[1.2]" />
            <div>
              <p className="text-base font-bold text-slate-300">¡Nada por comprar!</p>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed max-w-xs">
                No hay pedidos pendientes en la ventana activa, o todos los ítems ya fueron marcados.
              </p>
            </div>
            <button
              onClick={fetchConsolidado}
              className="flex items-center gap-2 px-4 py-2 bg-slate-800 border border-slate-700 text-slate-300 text-sm font-bold rounded-xl transition hover:bg-slate-700"
            >
              <RotateCcw className="w-4 h-4" />
              Recargar
            </button>
          </div>
        ) : (
          <>
            {/* Hint */}
            <div className="flex items-start gap-2 text-[11px] text-slate-500 bg-slate-900/60 border border-slate-800/60 rounded-xl px-3.5 py-2.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-500/60" />
              <span>Marca cada producto a medida que lo consigas. Esto actualiza el estado en los pedidos de los clientes.</span>
            </div>

            {/* Lista de ítems agrupados por proveedor */}
            {proveedoresOrdenados.map((provNombre) => (
              <div key={provNombre} className="space-y-3">
                <div className="flex items-center gap-2 px-1 pt-3 pb-1">
                  <div className="bg-amber-500/10 p-1.5 rounded-lg text-amber-400 border border-amber-500/20">
                    <Truck className="w-3.5 h-3.5 animate-pulse" />
                  </div>
                  <h3 className="text-xs font-black text-amber-500 uppercase tracking-widest">
                    {provNombre}
                  </h3>
                  <div className="h-px bg-slate-900 flex-1 ml-2" />
                </div>
                {itemsAgrupadosPorProveedor[provNombre].map((item) => {
                  const estado = estadoLocal[item.producto_id] || "pendiente";
                  const esConseguido = estado === "conseguido";
                  const esAgotado = estado === "agotado";
                  const esPendiente = estado === "pendiente";
                  const cargando = guardando[item.producto_id];

                  return (
                    <div
                      key={item.producto_id}
                      className={`relative rounded-2xl border transition-all duration-300 overflow-hidden ${
                        esConseguido
                          ? "bg-emerald-500/5 border-emerald-500/25 opacity-75"
                          : esAgotado
                          ? "bg-red-500/5 border-red-500/25 opacity-60"
                          : "bg-slate-900/70 border-slate-800"
                      }`}
                    >
                      {/* Indicador lateral de estado */}
                      <div
                        className={`absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl transition-all ${
                          esConseguido ? "bg-emerald-500" : esAgotado ? "bg-red-500" : "bg-slate-700"
                        }`}
                      />

                      <div className="pl-4 pr-4 py-4">
                        {/* Fila principal */}
                        <div className="flex items-start gap-3">
                          {/* Indicador visual de estado */}
                          <div className="mt-0.5 shrink-0">
                            {esConseguido ? (
                              <CheckCircle2 className="w-6 h-6 text-emerald-400" />
                            ) : esAgotado ? (
                              <XCircle className="w-6 h-6 text-red-400" />
                            ) : (
                              <div className="w-6 h-6 rounded-full border-2 border-slate-600" />
                            )}
                          </div>

                          {/* Info del producto */}
                          <div className="flex-1 min-w-0">
                            <p
                              className={`font-bold text-sm leading-snug ${
                                esConseguido
                                  ? "line-through text-slate-500"
                                  : esAgotado
                                  ? "line-through text-red-400/60"
                                  : "text-slate-100"
                              }`}
                            >
                              {item.nombre}
                            </p>
                            <p className="text-[11px] text-slate-500 mt-0.5">{item.formato_venta}</p>
                            {(() => {
                              const desc = obtenerDesgloseTexto(item.cantidad_total, item.unidades_embalaje, item.venta_multiplo);
                              return desc ? (
                                <p className="text-[10px] text-emerald-400 font-bold mt-1 bg-slate-900/40 py-1 px-2 rounded w-fit border border-slate-800/40">
                                  {desc}
                                </p>
                              ) : null;
                            })()}
                          </div>

                          {/* Cantidad */}
                          <div
                            className={`shrink-0 text-right ${
                              esConseguido ? "text-emerald-400" : esAgotado ? "text-red-400" : "text-white"
                            }`}
                          >
                            <span className="text-2xl font-black leading-none">{item.cantidad_total}</span>
                            <span className="text-[10px] text-slate-500 block font-bold">unidades</span>
                          </div>
                        </div>

                        {/* Botones de acción */}
                        <div className="flex gap-2 mt-3.5">
                          {esPendiente && (
                            <>
                              <button
                                onClick={() => marcarItem(item.producto_id, "conseguido")}
                                disabled={cargando}
                                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 font-bold text-sm active:scale-95 transition-all disabled:opacity-50"
                              >
                                {cargando ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <CheckCircle2 className="w-4 h-4" />
                                )}
                                Conseguido
                              </button>
                              <button
                                onClick={() => marcarItem(item.producto_id, "no_disponible")}
                                disabled={cargando}
                                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-red-500/10 border border-red-500/25 text-red-400 font-bold text-sm active:scale-95 transition-all disabled:opacity-50"
                              >
                                {cargando ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <XCircle className="w-4 h-4" />
                                )}
                                Agotado
                              </button>
                            </>
                          )}

                          {(esConseguido || esAgotado) && (
                            <button
                              onClick={() => resetearItem(item.producto_id)}
                              disabled={cargando}
                              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-slate-800/60 border border-slate-700 text-slate-400 font-bold text-sm active:scale-95 transition-all disabled:opacity-50"
                            >
                              {cargando ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <RotateCcw className="w-4 h-4" />
                              )}
                              Deshacer
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}

            {/* Mensaje de cierre al completar */}
            {progreso === 100 && (
              <div className="flex flex-col items-center gap-3.5 py-8 text-center animate-fade-in bg-slate-900/40 border border-slate-900 rounded-3xl p-6">
                <div className="text-5xl">🎉</div>
                <div>
                  <p className="font-black text-emerald-400 text-lg">¡Lista completada!</p>
                  <p className="text-xs text-slate-400 leading-relaxed max-w-xs mt-1">
                    Todos los ítems han sido marcados. Puedes iniciar la ruta para avisar a los clientes automáticamente.
                  </p>
                </div>
                <button
                  onClick={activarRutaDespacho}
                  disabled={activandoRuta}
                  className="w-full max-w-xs flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-black text-sm py-4 rounded-2xl shadow-lg transition-all disabled:opacity-60"
                >
                  {activandoRuta ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <Truck className="w-5 h-5" />
                  )}
                  Iniciar Ruta de Despacho 🚐
                </button>
              </div>
            )}
          </>
        )}
      </main>

      {/* FAB: Recargar lista */}
      {!loading && (
        <div className="fixed bottom-6 right-4 z-40">
          <button
            onClick={fetchConsolidado}
            className="flex items-center gap-2 bg-slate-800 border border-slate-700 hover:bg-slate-700 text-slate-300 font-bold text-xs px-4 py-3 rounded-2xl shadow-xl transition-all active:scale-95"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Actualizar lista
          </button>
        </div>
      )}
    </div>
  );
}
