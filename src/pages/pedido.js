"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import { createClient } from "@/lib/supabase/client";
import {
  ShoppingCart,
  Truck,
  AlertTriangle,
  Check,
  Loader2,
  Minus,
  Plus,
  Package,
} from "lucide-react";

const MONTO_MINIMO = 35000;

const CATEGORIAS_COMPATIBLES = {
  "Almacén": ["Abarrotes", "Confites", "Limpieza", "Verdulería", "Bebidas"],
  "Minimarket": ["Abarrotes", "Confites", "Limpieza", "Verdulería", "Bebidas"],
  "Botillería": ["Bebidas", "Confites"],
  "Fiambrería": ["Abarrotes", "Limpieza"]
};

export default function PedidoPage() {
  const router = useRouter();

  const [productos, setProductos] = useState([]);
  const [carrito, setCarrito] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tokenError, setTokenError] = useState(null);
  const [clienteInfo, setClienteInfo] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState(false);
  const [orderSummary, setOrderSummary] = useState(null);
  const [ventanaActiva, setVentanaActiva] = useState(null);
  const [pedidoPendiente, setPedidoPendiente] = useState(null);
  const [tokenUsado, setTokenUsado] = useState(false);

  const supabase = createClient();

  const formatFechaEntrega = (fechaStr) => {
    if (!fechaStr) return "";
    const fecha = new Date(fechaStr);
    const ahora = new Date();
    
    const fechaClean = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());
    const ahoraClean = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
    
    const diffTime = fechaClean - ahoraClean;
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
    
    const diasSemana = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
    const meses = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
    
    const diaNombre = diasSemana[fecha.getDay()];
    const diaMes = fecha.getDate();
    const mesNombre = meses[fecha.getMonth()];
    
    const hora = fecha.getHours();
    const jornada = hora < 13 ? "la mañana" : "la tarde";
    
    const fechaFormateada = `${diaMes} de ${mesNombre}`;
    
    if (diffDays === 0) {
      return `Hoy ${diaNombre} ${fechaFormateada} durante ${jornada}`;
    } else if (diffDays === 1) {
      return `Mañana ${diaNombre} ${fechaFormateada} durante ${jornada}`;
    } else {
      return `El ${diaNombre} ${fechaFormateada} durante ${jornada}`;
    }
  };

  // Lógica de normalización tolerante para resolver problemas de codificación de la base de datos
  const cleanKey = (str) => {
    if (!str) return "almacen";
    return str.replace(/[^a-zA-Z]/g, "").toLowerCase();
  };

  const getCatsPermitidas = (tipoNegocio) => {
    const key = cleanKey(tipoNegocio);
    if (key.includes("botill")) return CATEGORIAS_COMPATIBLES["Botillería"];
    if (key.includes("fiambr")) return CATEGORIAS_COMPATIBLES["Fiambrería"];
    if (key.includes("minim")) return CATEGORIAS_COMPATIBLES["Minimarket"];
    return CATEGORIAS_COMPATIBLES["Almacén"];
  };

  const cleanCat = (catName) => {
    if (!catName) return "abarrotes";
    return catName.replace(/[^a-zA-Z]/g, "").toLowerCase();
  };

  const tipo = clienteInfo?.tipo_negocio || "Almacén";
  const catsPermitidas = getCatsPermitidas(tipo);
  const productosFiltrados = productos.filter((p) => {
    const pCat = cleanCat(p.categoria || "Abarrotes");
    return catsPermitidas.some(c => cleanCat(c) === pCat);
  });

  // --- Carga de productos e inicialización de sesión ---
  useEffect(() => {
    if (!router.isReady) return;

    async function initializePage() {
      setLoading(true);
      setError(null);
      setTokenError(null);

      const { cliente_id, token } = router.query;

      try {
        // 1. Validar identificación por token o ID directo
        if (token) {
          const res = await fetch(`/api/validar-token?token=${token}`);
          const data = await res.json();
          if (!res.ok) {
            throw new Error(data.message || "Token de sesión no válido.");
          }
          setClienteInfo(data.cliente);
          setVentanaActiva(data.ventanaActiva || null);
          setPedidoPendiente(data.pedidoPendiente || null);
          setTokenUsado(data.usado || false);
        } else if (cliente_id) {
          // Retrocompatibilidad con cliente_id directo (ej: para pruebas locales/admin)
          const { data, error: cliErr } = await supabase
            .from("clientes")
            .select("*")
            .eq("id", cliente_id)
            .single();

          if (!cliErr && data) {
            setClienteInfo(data);
          } else {
            setClienteInfo({ id: cliente_id, nombre_tienda: "Cliente Piloto" });
          }

          // Carga directa de ventana activa y pedido pendiente
          const nowISO = new Date().toISOString();
          const { data: actVent, error: ventErr } = await supabase
            .from("ventanas_pedido")
            .select("*")
            .eq("activa", true)
            .gt("fecha_cierre", nowISO)
            .order("fecha_cierre", { ascending: true })
            .limit(1)
            .maybeSingle();

          if (!ventErr && actVent) {
            setVentanaActiva(actVent);

            const { data: pedPend, error: pedErr } = await supabase
              .from("pedidos")
              .select("id, total_neto, flete, total_pagar")
              .eq("cliente_id", cliente_id)
              .eq("ventana_id", actVent.id)
              .eq("estado", "Pendiente")
              .maybeSingle();

            if (!pedErr && pedPend) {
              setPedidoPendiente(pedPend);
            }
          }
        } else {
          throw new Error("Acceso denegado. Se requiere un enlace de sesión de WhatsApp válido.");
        }

        // 2. Cargar productos
        const { data: pgProds, error: pgErr } = await supabase
          .from("productos")
          .select("*")
          .eq("disponible", true)
          .eq("activo", true)
          .order("nombre");

        if (pgErr) throw pgErr;
        setProductos(pgProds || []);
      } catch (err) {
        console.error("[LukeDelivery] Error de inicialización:", err);
        setTokenError(err.message);
      } finally {
        setLoading(false);
      }
    }

    initializePage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady, router.query]);

  // --- Funciones del carrito ---
  const setCantidad = (id, delta) => {
    setCarrito((prev) => {
      const next = Math.max(0, (prev[id] || 0) + delta);
      if (next === 0) {
        const { [id]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [id]: next };
    });
  };

  const total = productos.reduce(
    (sum, p) => sum + p.precio * (carrito[p.id] || 0),
    0
  );
  const cumpleMinimo = total >= MONTO_MINIMO;
  const faltante = MONTO_MINIMO - total;
  const itemsEnCarrito = Object.values(carrito).reduce((a, b) => a + b, 0);

  // --- Confirmar pedido ---
  const handleConfirmar = async () => {
    if (!cumpleMinimo || isSubmitting) return;
    setIsSubmitting(true);
    setError(null);

    const productosSeleccionados = Object.entries(carrito).map(
      ([id, cantidad]) => ({ id, cantidad })
    );

    try {
      const { cliente_id, token } = router.query;
      const res = await fetch("/api/pedido", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cliente_id: cliente_id,
          token: token,
          productos_seleccionados: productosSeleccionados,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Error al procesar");

      setOrderSummary(data);
      setOrderSuccess(true);
      setCarrito({});
    } catch (err) {
      console.error("[LukeDelivery] Checkout error:", err);
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };


  // --- Formatear precio CLP ---
  const fmt = (n) => `$${n.toLocaleString("es-CL")}`;

  return (
    <div className="min-h-screen bg-slate-100 pb-40">
      <Head>
        <title>Armar Pedido | LukeDelivery</title>
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no"
        />
        <meta
          name="description"
          content="Arma tu pedido al precio costo real del proveedor."
        />
      </Head>

      {/* ===== HEADER ===== */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200 px-5 py-3.5 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-2.5">
          <div className="bg-brand/15 p-2 rounded-xl">
            <Truck className="h-5 w-5 text-brand" />
          </div>
          <div>
            <h1 className="text-base font-bold text-slate-800 leading-none tracking-tight">
              {clienteInfo ? clienteInfo.nombre_tienda : "LukeDelivery"}
            </h1>
            <span className="text-[10px] text-slate-500 font-medium">
              {clienteInfo ? `Hola, ${clienteInfo.nombre_contacto}` : "Honestidad Radical B2B"}
            </span>
          </div>
        </div>
        {itemsEnCarrito > 0 && (
          <div className="flex items-center gap-1.5 bg-brand/10 text-brand text-xs font-semibold py-1.5 px-3 rounded-full">
            <Package className="h-3.5 w-3.5" />
            {itemsEnCarrito} ítems
          </div>
        )}
      </header>

      <main className="max-w-lg mx-auto px-4 pt-5 pb-36">
        {/* ===== BANNER VENTANA ACTIVA ===== */}
        {!tokenError && !loading && ventanaActiva && !tokenUsado && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4.5 mb-5 flex items-start gap-3 animate-fade-in shadow-sm">
            <Truck className="h-5.5 w-5.5 text-brand shrink-0 mt-0.5" />
            <div className="text-xs">
              <p className="font-extrabold text-slate-800 text-sm">
                Ventana de Despacho: {ventanaActiva.nombre}
              </p>
              <p className="text-slate-600 mt-1 font-medium">
                Recibes: <span className="font-black text-brand">{formatFechaEntrega(ventanaActiva.fecha_entrega)}</span>
              </p>
              <p className="text-[10px] text-slate-500 mt-2 bg-white border border-slate-200 py-1 px-2.5 rounded-lg w-fit">
                Cierre de pedidos: {new Date(ventanaActiva.fecha_cierre).toLocaleString("es-CL", {
                  dateStyle: "short",
                  timeStyle: "short"
                })}
              </p>
            </div>
          </div>
        )}

        {/* ===== VENTAS CERRADAS TEMPORALMENTE ===== */}
        {!tokenError && !loading && !ventanaActiva && (
          <div className="bg-white border border-slate-200 rounded-[24px] p-8 text-center my-10 max-w-sm mx-auto shadow-xl flex flex-col items-center gap-5">
            <div className="bg-brand/10 text-brand p-5 rounded-full w-fit">
              <AlertTriangle className="h-10 w-10 animate-bounce text-brand" />
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-800 mb-2">
                Toma de Pedidos Cerrada
              </h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                En este momento nos encontramos en el proceso de compra mayorista y reparto en ruta para asegurar los mejores precios.
              </p>
            </div>
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 text-xs text-slate-500 w-full font-semibold">
              💡 Te notificaremos por WhatsApp en cuanto abramos la próxima ventana de pedidos.
            </div>
          </div>
        )}

        {/* ===== ACCESSIBLE INFORMATION CARD (SENIOR-OPTIMIZED) ===== */}
        {!tokenError && !loading && ventanaActiva && !tokenUsado && (
          <div className="grid grid-cols-1 gap-4 mb-6 animate-fade-in">
            {/* Costo de Flete Card */}
            <div className="bg-white border border-slate-200 shadow-sm rounded-2xl p-5 text-center flex flex-col items-center">
              <span className="text-xs font-bold text-slate-600 uppercase tracking-widest mb-1">Costo de Flete Estimado</span>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-black text-brand">$</span>
                <span className="text-5xl font-black text-slate-800 leading-none">
                  {(3000 + Object.entries(carrito).reduce((sum, [id, cant]) => {
                    const p = productos.find(prod => prod.id === id);
                    return sum + (p && p.tipo_bulto === "Pesado" ? 500 * cant : 0);
                  }, 0)).toLocaleString("es-CL")}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-2 leading-tight font-medium">
                $3.000 base + $500 por bulto pesado. ¡Calculado automáticamente!
              </p>
            </div>
          </div>
        )}

        {/* ===== TOKEN ERROR (ACCESO DENEGADO) ===== */}
        {tokenError && (
          <div className="bg-white border border-red-200 rounded-2xl p-6 text-center my-10 max-w-sm mx-auto shadow-xl">
            <div className="mx-auto bg-red-500/10 text-red-500 p-4 rounded-full w-fit mb-4">
              <AlertTriangle className="h-10 w-10" />
            </div>
            <h3 className="text-lg font-bold text-slate-800 mb-2">
              Acceso Denegado
            </h3>
            <p className="text-sm text-slate-600 mb-6 leading-relaxed">
              {tokenError}
            </p>
            <a
              href="https://wa.me/56951875221"
              className="inline-flex items-center justify-center bg-[#25D366] hover:bg-[#20bd5a] text-white font-bold py-3 px-6 rounded-xl transition-all w-full text-sm shadow-lg shadow-[#25D366]/20"
            >
              📲 Solicitar Enlace por WhatsApp
            </a>
          </div>
        )}

        {/* ===== ERROR ===== */}
        {!tokenError && error && (
          <div className="bg-error-bg border border-error/20 text-red-200 text-sm p-3.5 rounded-xl mb-5 flex gap-2 items-start">
            <AlertTriangle className="h-4 w-4 text-error mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* ===== LOADING ===== */}
        {!tokenError && loading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-brand" />
            <p className="text-sm text-text-secondary">
              Cargando precios de costo...
            </p>
          </div>
        ) : !tokenError && productosFiltrados.length === 0 ? (
          <div className="text-center py-24">
            <p className="text-text-secondary">
              No hay productos disponibles para tu tipo de negocio en este momento.
            </p>
          </div>
        ) : !tokenError && tokenUsado ? (
          /* ===== VISTA DE RESUMEN DE PEDIDO (READ-ONLY) ===== */
          <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xl animate-fade-in flex flex-col gap-6">
            <div className="flex flex-col items-center text-center gap-2">
              <div className="bg-brand/10 text-brand p-3.5 rounded-full w-fit">
                <Check className="h-10 w-10 text-brand" />
              </div>
              <h2 className="text-xl font-black text-slate-800 mt-2">
                Pedido Confirmado y en Preparación
              </h2>
              <span className="bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider">
                Recibido
              </span>
            </div>

            {pedidoPendiente ? (
              <>
                {/* Info de Despacho */}
                {ventanaActiva && (
                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex gap-3 items-start">
                    <Truck className="h-5 w-5 text-brand shrink-0 mt-0.5" />
                    <div className="text-xs">
                      <p className="font-extrabold text-slate-800">Programado para entrega</p>
                      <p className="text-slate-600 mt-0.5">
                        {formatFechaEntrega(ventanaActiva.fecha_entrega)}
                      </p>
                    </div>
                  </div>
                )}

                {/* Items del Pedido */}
                <div>
                  <h3 className="text-sm font-black text-slate-600 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                    <Package className="h-4 w-4 text-brand" /> Detalle de productos
                  </h3>
                  <div className="border border-slate-200 rounded-2xl overflow-hidden divide-y divide-slate-200 bg-slate-50 max-h-60 overflow-y-auto">
                    {pedidoPendiente.items && pedidoPendiente.items.map((it) => (
                      <div key={it.id} className="p-3.5 flex items-center justify-between gap-4 text-xs">
                        <div className="min-w-0">
                          <p className="font-bold text-slate-800 truncate">{it.nombre}</p>
                          <span className="text-[10px] text-slate-500 mt-0.5 inline-block bg-white border border-slate-200 px-1.5 py-0.5 rounded">
                            {it.formato_venta}
                          </span>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-black text-slate-800">
                            {it.cantidad} {it.cantidad === 1 ? "und" : "unds"} x {fmt(it.precioUnitario)}
                          </p>
                          <p className="text-[10px] text-brand font-bold mt-0.5">
                            Subtotal: {fmt(it.totalItem)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Resumen Financiero */}
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4.5 space-y-2.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-600">Neto Mercadería:</span>
                    <span className="text-slate-800 font-bold">{fmt(pedidoPendiente.total_neto || 0)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Costo de Flete:</span>
                    <span className="text-slate-800 font-bold">{fmt(pedidoPendiente.flete || 0)}</span>
                  </div>
                  <div className="border-t border-slate-200 pt-2.5 flex justify-between text-sm font-black">
                    <span className="text-brand">TOTAL A PAGAR:</span>
                    <span className="text-brand">{fmt(pedidoPendiente.total_pagar || 0)}</span>
                  </div>
                </div>
              </>
            ) : (
              <p className="text-xs text-slate-500 text-center">
                No se encontró un pedido activo para esta ventana.
              </p>
            )}

            {/* Advertencia / Call to action */}
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4.5 flex gap-3 text-left">
              <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
              <div className="text-xs">
                <p className="font-black text-amber-600">¿Quieres agregar más productos?</p>
                <p className="text-slate-600 mt-1 leading-relaxed">
                  Por seguridad y para evitar fraudes, este enlace ya no permite modificar el pedido directamente. 
                  Si deseas agregar más artículos, solicita un nuevo enlace con el bot Jaime en WhatsApp.
                </p>
                <p className="text-slate-600 mt-1.5 font-bold">
                  ¡Los nuevos productos se fusionarán automáticamente sin flete extra!
                </p>
              </div>
            </div>

            {/* Botón WhatsApp */}
            <a
              href="https://wa.me/56951875221?text=Quiero%20agregar%20m%C3%A1s%20productos%20a%20mi%20pedido"
              className="inline-flex items-center justify-center bg-[#25D366] hover:bg-[#20bd5a] text-white font-bold py-4 px-6 rounded-xl transition-all w-full text-sm shadow-lg shadow-[#25D366]/20 uppercase tracking-wide gap-2"
            >
              📲 Solicitar nuevo enlace por WhatsApp
            </a>
          </div>
        ) : !tokenError && ventanaActiva && (
          /* ===== PRODUCT LIST AGROUPED BY CATEGORY ===== */
          <div className="space-y-8 animate-fade-in">
            {catsPermitidas.map((catName) => {
              const prodsDeCat = productosFiltrados.filter(
                (p) => cleanCat(p.categoria || "Abarrotes") === cleanCat(catName)
              );

              if (prodsDeCat.length === 0) return null;

              return (
                <div key={catName} className="mb-6">
                  {/* Category Header */}
                  <h2 className="text-xl font-extrabold text-gray-800 mb-4 border-b-2 border-gray-200 pb-2 flex items-center justify-between">
                    <span>{catName}</span>
                    <span className="text-xs bg-brand/10 text-brand px-2.5 py-0.5 rounded-full font-bold">
                      {prodsDeCat.length} {prodsDeCat.length === 1 ? 'producto' : 'productos'}
                    </span>
                  </h2>

                  {/* Category Products */}
                  <div className="space-y-4">
                    {prodsDeCat.map((p) => {
                      const cant = carrito[p.id] || 0;
                      const isActive = cant > 0;

                      return (
                        <div
                          key={p.id}
                          className={`bg-white border-2 rounded-xl p-3.5 mb-4 flex items-start gap-3.5 transition-all ${
                            isActive
                              ? "border-brand/60 shadow-lg shadow-brand/5"
                              : "border-gray-200"
                          }`}
                        >
                          {/* Imagen */}
                          <div className="relative w-[72px] h-[72px] rounded-xl overflow-hidden shrink-0 bg-gray-50 border border-gray-100 flex items-center justify-center">
                            {p.url_imagen_retail ? (
                              <img
                                src={p.url_imagen_retail}
                                alt={p.nombre}
                                className="h-full w-full object-cover"
                                loading="lazy"
                                onError={(e) => {
                                  e.target.onerror = null;
                                  e.target.style.display = "none";
                                }}
                              />
                            ) : (
                              <div className="h-full w-full flex items-center justify-center text-brand font-black text-2xl">
                                {p.nombre.charAt(0)}
                              </div>
                            )}
                            {p.tipo_bulto === "Pesado" && (
                              <div className="absolute top-0 left-0 bg-accent text-black text-[8px] font-black px-1.5 py-0.5 rounded-br-lg uppercase">
                                PESADO
                              </div>
                            )}
                          </div>

                          {/* Info y Controles */}
                          <div className="flex-1 min-w-0 flex flex-col justify-between self-stretch">
                            <div>
                              <h3 className="text-[15px] font-bold text-gray-800 leading-snug break-words">
                                {p.nombre}
                              </h3>
                              <div className="mt-0.5">
                                <span className="inline-block bg-gray-50 text-gray-500 text-[10px] font-semibold px-2 py-0.5 rounded border border-gray-200 leading-none">
                                  {p.formato_venta}
                                </span>
                              </div>
                            </div>

                            {/* Fila Inferior: Precio e Incrementador */}
                            <div className="flex items-center justify-between gap-2 mt-2">
                              <div className="flex flex-col">
                                <span className="text-[17px] font-black text-gray-900 leading-none">
                                  {fmt(p.precio)}
                                </span>
                                <span className="text-[9px] text-gray-400 font-bold uppercase tracking-wider mt-1">
                                  costo real
                                </span>
                              </div>

                              {/* Selector compacto [-] N [+] */}
                              <div className="flex items-center bg-gray-50 rounded-lg border border-gray-200 overflow-hidden h-9 shrink-0">
                                <button
                                  onClick={() => setCantidad(p.id, -1)}
                                  disabled={cant === 0}
                                  className={`h-9 w-9 flex items-center justify-center transition-all cursor-pointer font-bold ${
                                    cant === 0
                                      ? "text-gray-300 bg-gray-100/50 cursor-not-allowed"
                                      : "text-gray-700 bg-gray-100 hover:bg-gray-200 active:scale-90"
                                  }`}
                                >
                                  <Minus className="h-4 w-4 stroke-[3]" />
                                </button>
                                <span
                                  className={`w-8 text-center text-sm font-bold select-none ${
                                    isActive ? "text-brand" : "text-gray-700"
                                  }`}
                                >
                                  {cant}
                                </span>
                                <button
                                  onClick={() => setCantidad(p.id, 1)}
                                  className="h-9 w-9 flex items-center justify-center text-gray-700 bg-gray-100 hover:bg-gray-200 active:scale-90 font-bold transition-all cursor-pointer"
                                >
                                  <Plus className="h-4 w-4 stroke-[3]" />
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>


      {/* ===== STICKY FOOTER: REGLA DEL FURGÓN ===== */}
      {!tokenError && !loading && productosFiltrados.length > 0 && ventanaActiva && !tokenUsado && (
        <footer className="fixed bottom-0 inset-x-0 bg-white/95 backdrop-blur-md border-t border-slate-200 py-6 px-5 z-40 shadow-lg">
          <div className="max-w-lg mx-auto">
            {/* Progress bar */}
            <div className="mb-4">
              <div className="flex justify-between items-end text-sm mb-1.5">
                <span className="text-slate-600 font-bold uppercase tracking-wide">
                  Pedido mínimo: $35.000
                </span>
                <span
                  className={`font-black text-base ${cumpleMinimo ? "text-brand" : "text-accent"}`}
                >
                  {fmt(total)}
                </span>
              </div>
              <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    cumpleMinimo ? "bg-brand" : "bg-accent"
                  }`}
                  style={{
                    width: `${Math.min(100, (total / MONTO_MINIMO) * 100)}%`,
                  }}
                />
              </div>
            </div>

            {/* Advertencia de Fusión si ya tiene pedido Pendiente */}
            {pedidoPendiente && total > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 mb-3 flex items-start gap-2.5 text-left">
                <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                <div className="text-[11px] leading-snug">
                  <p className="font-extrabold text-amber-500">⚠️ Pedido en Curso Detectado</p>
                  <p className="text-slate-600 mt-0.5">
                    Ya tienes un pedido activo en esta ventana. Estos productos se <strong>agregarán a tu pedido anterior</strong> cobrando un flete único.
                  </p>
                </div>
              </div>
            )}

            {/* Botón */}
            {cumpleMinimo ? (
              <button
                onClick={handleConfirmar}
                disabled={isSubmitting}
                className="w-full py-4 text-lg font-bold rounded-xl shadow-lg bg-brand hover:bg-brand-hover active:scale-[0.97] text-white flex items-center justify-center gap-3 transition-all cursor-pointer shadow-brand/25 uppercase tracking-wide"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-6 w-6 animate-spin" /> Procesando...
                  </>
                ) : (
                  <>
                    <ShoppingCart className="h-6 w-6" /> {pedidoPendiente ? "Confirmar y Fusionar Pedido" : "Confirmar Pedido"}
                  </>
                )}
              </button>
            ) : (
              <div className="w-full bg-slate-50 border border-slate-200 text-center py-4 rounded-xl">
                <span className="text-base font-bold text-slate-400">
                  Confirmar Pedido
                </span>
                {total > 0 && (
                  <p className="text-base font-semibold text-accent mt-1 uppercase tracking-wide">
                    Faltan {fmt(faltante)} para el pedido mínimo
                  </p>
                )}
              </div>
            )}
          </div>
        </footer>
      )}

      {/* ===== SUCCESS STATE (FULL SCREEN MODAL OVERLAY) ===== */}
      {orderSuccess && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-5 text-center animate-fade-in">
          <div className="bg-white border-2 border-brand rounded-[32px] p-8 max-w-md w-full shadow-2xl flex flex-col items-center gap-6">
            <div className="bg-brand/10 text-brand p-5 rounded-full w-fit">
              <Check className="h-16 w-16" />
            </div>
            <h2 className="text-2xl font-black text-slate-800 leading-tight">
              {orderSummary?.fusionado ? "¡Pedido Fusionado con Éxito!" : "¡Pedido Realizado con Éxito!"}
            </h2>
            <p className="text-base text-slate-600 leading-relaxed">
              {orderSummary?.fusionado
                ? "Hemos añadido estos productos a tu pedido anterior para esta misma ventana de entrega. ¡Ahorraste el flete adicional!"
                : "Tu pedido se ha registrado correctamente y ya está en nuestro sistema. No es necesario enviar nada por WhatsApp."}
            </p>

            {/* Financial Summary */}
            <div className="bg-slate-50 w-full rounded-2xl p-5 border border-slate-200 text-left space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-600">Neto Mercadería:</span>
                <span className="text-slate-800 font-bold">{fmt(orderSummary.totalNeto)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Flete Escalonado:</span>
                <span className="text-slate-800 font-bold">{fmt(orderSummary.flete)}</span>
              </div>
              <div className="border-t border-slate-200 pt-3 flex justify-between text-base font-black">
                <span className="text-brand">TOTAL A PAGAR:</span>
                <span className="text-brand">{fmt(orderSummary.totalPagar)}</span>
              </div>
            </div>

            <button
              onClick={() => {
                setOrderSuccess(false);
                setTokenUsado(true);
                if (orderSummary) {
                  setPedidoPendiente({
                    id: orderSummary.pedido_id,
                    total_neto: orderSummary.totalNeto,
                    flete: orderSummary.flete,
                    total_pagar: orderSummary.totalPagar,
                    items: orderSummary.items
                  });
                }
              }}
              className="w-full h-16 bg-brand hover:bg-brand-hover active:scale-95 text-white text-lg font-black rounded-2xl flex items-center justify-center gap-3 transition-all cursor-pointer shadow-lg shadow-brand/25 uppercase tracking-wide"
            >
              Ver Resumen de mi Pedido
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
