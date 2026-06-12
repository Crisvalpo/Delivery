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
    <div className="min-h-screen bg-bg-app pb-40">
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
      <header className="sticky top-0 z-40 bg-bg-surface/90 backdrop-blur-lg border-b border-border px-5 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="bg-brand/15 p-2 rounded-xl">
            <Truck className="h-5 w-5 text-brand" />
          </div>
          <div>
            <h1 className="text-base font-bold text-text-primary leading-none tracking-tight">
              {clienteInfo ? clienteInfo.nombre_tienda : "LukeDelivery"}
            </h1>
            <span className="text-[10px] text-text-dim font-medium">
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
        {!tokenError && !loading && ventanaActiva && (
          <div className="bg-brand/10 border border-brand/20 rounded-2xl p-4.5 mb-5 flex items-start gap-3 animate-fade-in shadow-sm">
            <Truck className="h-5.5 w-5.5 text-brand shrink-0 mt-0.5" />
            <div className="text-xs">
              <p className="font-extrabold text-text-primary text-sm">
                Ventana de Despacho: {ventanaActiva.nombre}
              </p>
              <p className="text-text-secondary mt-1 font-medium">
                Recibes: <span className="font-black text-brand">{formatFechaEntrega(ventanaActiva.fecha_entrega)}</span>
              </p>
              <p className="text-[10px] text-text-dim mt-2 bg-bg-surface border border-border py-1 px-2.5 rounded-lg w-fit">
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
          <div className="bg-bg-surface border-2 border-border rounded-[24px] p-8 text-center my-10 max-w-sm mx-auto shadow-xl flex flex-col items-center gap-5">
            <div className="bg-brand/10 text-brand p-5 rounded-full w-fit">
              <AlertTriangle className="h-10 w-10 animate-bounce text-brand" />
            </div>
            <div>
              <h3 className="text-lg font-black text-text-primary mb-2">
                Toma de Pedidos Cerrada
              </h3>
              <p className="text-sm text-text-secondary leading-relaxed">
                En este momento nos encontramos en el proceso de compra mayorista y reparto en ruta para asegurar los mejores precios.
              </p>
            </div>
            <div className="bg-bg-surface-2 p-4 rounded-2xl border border-border text-xs text-text-dim w-full font-semibold">
              💡 Te notificaremos por WhatsApp en cuanto abramos la próxima ventana de pedidos.
            </div>
          </div>
        )}

        {/* ===== ACCESSIBLE INFORMATION CARD (SENIOR-OPTIMIZED) ===== */}
        {!tokenError && !loading && ventanaActiva && (
          <div className="grid grid-cols-1 gap-4 mb-6 animate-fade-in">
            {/* Costo de Flete Card */}
            <div className="bg-bg-surface border-2 border-border rounded-2xl p-5 text-center flex flex-col items-center">
              <span className="text-xs font-bold text-text-secondary uppercase tracking-widest mb-1">Costo de Flete Estimado</span>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-black text-brand">$</span>
                <span className="text-5xl font-black text-text-primary leading-none">
                  {(3000 + Object.entries(carrito).reduce((sum, [id, cant]) => {
                    const p = productos.find(prod => prod.id === id);
                    return sum + (p && p.categoria_logistica === "Pesado" ? 500 * cant : 0);
                  }, 0)).toLocaleString("es-CL")}
                </span>
              </div>
              <p className="text-[11px] text-text-dim mt-2 leading-tight font-medium">
                $3.000 base + $500 por bulto pesado. ¡Calculado automáticamente!
              </p>
            </div>
          </div>
        )}

        {/* ===== TOKEN ERROR (ACCESO DENEGADO) ===== */}
        {tokenError && (
          <div className="bg-bg-surface border-2 border-red-500/30 rounded-2xl p-6 text-center my-10 max-w-sm mx-auto shadow-xl">
            <div className="mx-auto bg-red-500/10 text-red-500 p-4 rounded-full w-fit mb-4">
              <AlertTriangle className="h-10 w-10" />
            </div>
            <h3 className="text-lg font-bold text-text-primary mb-2">
              Acceso Denegado
            </h3>
            <p className="text-sm text-text-secondary mb-6 leading-relaxed">
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
                          className={`bg-white border-2 rounded-xl p-4 mb-4 flex items-center gap-4 transition-all ${
                            isActive
                              ? "border-brand/60 shadow-lg shadow-brand/5"
                              : "border-gray-200"
                          }`}
                        >
                          {/* Imagen */}
                          <div className="relative w-20 h-20 md:w-24 md:h-24 rounded-xl overflow-hidden shrink-0 bg-gray-100 border border-gray-200">
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
                            {p.categoria_logistica === "Pesado" && (
                              <div className="absolute top-0 left-0 bg-accent text-black text-[9px] font-black px-2 py-0.5 rounded-br-lg uppercase">
                                PESADO
                              </div>
                            )}
                          </div>

                          {/* Info */}
                          <div className="flex-1 min-w-0">
                            <h3 className="text-lg font-bold text-gray-800 leading-snug break-words">
                              {p.nombre}
                            </h3>
                            <div className="mt-1">
                              <span className="inline-block bg-gray-100 text-gray-700 text-xs font-semibold px-2.5 py-0.5 rounded-md border border-gray-200">
                                {p.formato_venta}
                              </span>
                            </div>
                            <p className="text-lg font-black text-gray-900 mt-2">
                              {fmt(p.precio)}
                              <span className="text-xs text-gray-500 font-medium ml-1.5">
                                costo real
                              </span>
                            </p>
                          </div>

                          {/* Selector [-] N [+] */}
                          <div className="flex items-center bg-gray-100 rounded-xl border-2 border-gray-300 shrink-0 h-14 overflow-hidden">
                            <button
                              onClick={() => setCantidad(p.id, -1)}
                              disabled={cant === 0}
                              className={`h-14 w-14 flex items-center justify-center transition-all cursor-pointer font-bold ${
                                cant === 0
                                  ? "text-gray-400 bg-gray-200/50 cursor-not-allowed"
                                  : "text-gray-800 bg-gray-200 hover:bg-gray-300 active:scale-90"
                              }`}
                            >
                              <Minus className="h-6 w-6 stroke-[3]" />
                            </button>
                            <span
                              className={`w-12 text-center text-xl font-bold px-1 select-none ${
                                isActive ? "text-brand" : "text-gray-700"
                              }`}
                            >
                              {cant}
                            </span>
                            <button
                              onClick={() => setCantidad(p.id, 1)}
                              className="h-14 w-14 flex items-center justify-center text-gray-800 bg-gray-200 hover:bg-gray-300 active:scale-90 font-bold transition-all cursor-pointer"
                            >
                              <Plus className="h-6 w-6 stroke-[3]" />
                            </button>
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
      {!tokenError && !loading && productosFiltrados.length > 0 && ventanaActiva && (
        <footer className="fixed bottom-0 inset-x-0 bg-bg-surface/95 backdrop-blur-xl border-t border-border py-6 px-5 z-40">
          <div className="max-w-lg mx-auto">
            {/* Progress bar */}
            <div className="mb-4">
              <div className="flex justify-between items-end text-sm mb-1.5">
                <span className="text-text-secondary font-bold uppercase tracking-wide">
                  Pedido mínimo: $35.000
                </span>
                <span
                  className={`font-black text-base ${cumpleMinimo ? "text-brand" : "text-accent"}`}
                >
                  {fmt(total)}
                </span>
              </div>
              <div className="h-3 w-full bg-bg-surface-2 rounded-full overflow-hidden">
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
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3.5 mb-3 flex items-start gap-2.5 text-left">
                <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                <div className="text-[11px] leading-snug">
                  <p className="font-extrabold text-amber-500">⚠️ Pedido en Curso Detectado</p>
                  <p className="text-text-secondary mt-0.5">
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
              <div className="w-full bg-bg-surface-2 border-2 border-border text-center py-4 rounded-xl">
                <span className="text-base font-bold text-text-dim">
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
        <div className="fixed inset-0 z-50 bg-bg-app/95 backdrop-blur-md flex items-center justify-center p-5 text-center animate-fade-in">
          <div className="bg-bg-surface border-4 border-brand rounded-[32px] p-8 max-w-md w-full shadow-2xl flex flex-col items-center gap-6">
            <div className="bg-brand/10 text-brand p-5 rounded-full w-fit">
              <Check className="h-16 w-16" />
            </div>
            <h2 className="text-2xl font-black text-text-primary leading-tight">
              {orderSummary?.fusionado ? "¡Pedido Fusionado con Éxito!" : "¡Pedido Realizado con Éxito!"}
            </h2>
            <p className="text-base text-text-secondary leading-relaxed">
              {orderSummary?.fusionado
                ? "Hemos añadido estos productos a tu pedido anterior para esta misma ventana de entrega. ¡Ahorraste el flete adicional!"
                : "Tu pedido se ha registrado correctamente y ya está en nuestro sistema. No es necesario enviar nada por WhatsApp."}
            </p>

            {/* Financial Summary */}
            <div className="bg-bg-surface-2 w-full rounded-2xl p-5 border border-border text-left space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-text-secondary">Neto Mercadería:</span>
                <span className="text-text-primary font-bold">{fmt(orderSummary.totalNeto)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-secondary">Flete Escalonado:</span>
                <span className="text-text-primary font-bold">{fmt(orderSummary.flete)}</span>
              </div>
              <div className="border-t border-border pt-3 flex justify-between text-base font-black">
                <span className="text-brand">TOTAL A PAGAR:</span>
                <span className="text-brand">{fmt(orderSummary.totalPagar)}</span>
              </div>
            </div>

            <button
              onClick={() => setOrderSuccess(false)}
              className="w-full h-16 bg-brand hover:bg-brand-hover active:scale-95 text-white text-lg font-black rounded-2xl flex items-center justify-center gap-3 transition-all cursor-pointer shadow-lg shadow-brand/25 uppercase tracking-wide"
            >
              Volver al Catálogo
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
