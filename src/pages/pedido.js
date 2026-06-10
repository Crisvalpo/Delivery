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

  const supabase = createClient();

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
        } else {
          throw new Error("Acceso denegado. Se requiere un enlace de sesión de WhatsApp válido.");
        }

        // 2. Cargar productos
        const { data: pgProds, error: pgErr } = await supabase
          .from("productos")
          .select("*")
          .eq("disponible", true)
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

  // --- Abrir WhatsApp ---
  const abrirWhatsApp = () => {
    if (!orderSummary) return;
    const tel = "+56935264052";

    const items = orderSummary.items
      .map(
        (i) =>
          `• ${i.nombre} (${i.formato_venta}) x${i.cantidad} → $${i.totalItem.toLocaleString("es-CL")}`
      )
      .join("\n");

    const msg = encodeURIComponent(
      `🚚 *PEDIDO LUKEDELIVERY*\n\n${items}\n\n` +
        `*Neto:* $${orderSummary.totalNeto.toLocaleString("es-CL")}\n` +
        `*Flete:* $${orderSummary.flete.toLocaleString("es-CL")}\n` +
        `*TOTAL:* $${orderSummary.totalPagar.toLocaleString("es-CL")}`
    );

    window.open(`https://wa.me/${tel}?text=${msg}`, "_blank");
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

      <main className="max-w-lg mx-auto px-4 pt-5">
        {/* ===== BANNER ===== */}
        <div className="bg-bg-surface border border-border rounded-2xl p-4 mb-5 relative overflow-hidden">
          <div className="absolute -right-4 -top-4 opacity-[0.04]">
            <Truck className="h-28 w-28 text-white" />
          </div>
          <h2 className="text-sm font-semibold text-text-primary mb-1.5 flex items-center gap-1.5">
            <span>🚚</span> Flete Transparente
          </h2>
          <p className="text-xs text-text-secondary leading-relaxed">
            Precio costo real del mayorista. Pedido mínimo{" "}
            <span className="text-brand font-semibold">$35.000</span>. Flete:{" "}
            <span className="text-text-primary font-medium">$3.000 base</span>{" "}
            + $500/bulto pesado.
          </p>
        </div>

        {/* ===== SUCCESS STATE ===== */}
        {orderSuccess && (
          <div className="bg-brand/5 border border-brand/20 rounded-2xl p-6 mb-5 text-center animate-fade-in">
            <div className="mx-auto bg-brand/15 text-brand p-3 rounded-full w-fit mb-4">
              <Check className="h-7 w-7" />
            </div>
            <h3 className="text-lg font-bold text-text-primary mb-1.5">
              ¡Pedido Procesado!
            </h3>
            <p className="text-sm text-text-secondary mb-5">
              Envía el resumen por WhatsApp para coordinar el despacho.
            </p>

            {/* Resumen */}
            <div className="bg-bg-surface rounded-xl p-4 mb-5 border border-border text-left space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-text-secondary">Neto:</span>
                <span className="text-text-primary font-semibold">
                  {fmt(orderSummary.totalNeto)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-secondary">Flete:</span>
                <span className="text-text-primary font-semibold">
                  {fmt(orderSummary.flete)}
                </span>
              </div>
              <div className="border-t border-border pt-2 flex justify-between text-sm font-bold">
                <span className="text-brand">Total:</span>
                <span className="text-brand">{fmt(orderSummary.totalPagar)}</span>
              </div>
            </div>

            <button
              onClick={abrirWhatsApp}
              className="w-full bg-[#25D366] hover:bg-[#20bd5a] active:scale-[0.97] text-white font-bold py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg shadow-[#25D366]/20"
            >
              📲 Enviar por WhatsApp
            </button>
            <button
              onClick={() => setOrderSuccess(false)}
              className="mt-3 text-xs text-text-dim hover:text-text-secondary transition-colors cursor-pointer"
            >
              Crear otro pedido
            </button>
          </div>
        )}

        {/* ===== TOKEN ERROR (ACCESO DENEGADO) ===== */}
        {tokenError && (
          <div className="bg-bg-surface border border-red-500/30 rounded-2xl p-6 text-center my-10 max-w-sm mx-auto shadow-xl">
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
              href="https://wa.me/56935264052"
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
        ) : !tokenError && productos.length === 0 ? (
          <div className="text-center py-24">
            <p className="text-text-secondary">
              No hay productos disponibles en este momento.
            </p>
          </div>
        ) : !tokenError && (
          /* ===== PRODUCT LIST ===== */
          <div className="space-y-2.5">
            {productos.map((p) => {
              const cant = carrito[p.id] || 0;
              const isActive = cant > 0;

              return (
                <div
                  key={p.id}
                  className={`bg-bg-surface border rounded-2xl p-3 flex items-center gap-3 transition-all ${
                    isActive
                      ? "border-brand/40 shadow-lg shadow-brand/5"
                      : "border-border"
                  }`}
                >
                  {/* Imagen */}
                  <div className="relative h-[60px] w-[60px] rounded-xl overflow-hidden shrink-0 bg-bg-surface-2 border border-border">
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
                      <div className="h-full w-full flex items-center justify-center text-brand font-bold text-lg">
                        {p.nombre.charAt(0)}
                      </div>
                    )}
                    {p.categoria_logistica === "Pesado" && (
                      <div className="absolute top-0 left-0 bg-accent text-black text-[8px] font-bold px-1.5 py-px rounded-br-lg">
                        PESADO
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-text-primary truncate leading-snug">
                      {p.nombre}
                    </h3>
                    <p className="text-[11px] text-text-dim mt-0.5">
                      {p.formato_venta}
                    </p>
                    <p className="text-sm font-bold text-text-primary mt-1">
                      {fmt(p.precio)}
                      <span className="text-[9px] text-text-dim font-normal ml-1">
                        costo real
                      </span>
                    </p>
                  </div>

                  {/* Selector [-] N [+] */}
                  <div className="flex items-center bg-bg-surface-2 rounded-xl border border-border shrink-0">
                    <button
                      onClick={() => setCantidad(p.id, -1)}
                      disabled={cant === 0}
                      className={`h-9 w-9 flex items-center justify-center rounded-l-xl transition-all cursor-pointer ${
                        cant === 0
                          ? "text-text-dim cursor-not-allowed"
                          : "text-text-primary hover:bg-bg-surface-hover active:scale-90"
                      }`}
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <span
                      className={`w-8 text-center text-sm font-semibold ${
                        isActive ? "text-brand" : "text-text-dim"
                      }`}
                    >
                      {cant}
                    </span>
                    <button
                      onClick={() => setCantidad(p.id, 1)}
                      className="h-9 w-9 flex items-center justify-center rounded-r-xl text-text-primary hover:bg-bg-surface-hover active:scale-90 transition-all cursor-pointer"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* ===== STICKY FOOTER: REGLA DEL FURGÓN ===== */}
      {!tokenError && !loading && productos.length > 0 && (
        <footer className="fixed bottom-0 inset-x-0 bg-bg-surface/95 backdrop-blur-xl border-t border-border py-4 px-5 z-50">
        <div className="max-w-lg mx-auto">
          {/* Progress bar */}
          <div className="mb-3">
            <div className="flex justify-between items-end text-[11px] mb-1">
              <span className="text-text-dim font-medium">
                Meta furgón: $35.000
              </span>
              <span
                className={`font-bold ${cumpleMinimo ? "text-brand" : "text-accent"}`}
              >
                {fmt(total)}
              </span>
            </div>
            <div className="h-1.5 w-full bg-bg-surface-2 rounded-full overflow-hidden">
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

          {/* Botón */}
          {cumpleMinimo ? (
            <button
              onClick={handleConfirmar}
              disabled={isSubmitting}
              className="w-full bg-brand hover:bg-brand-hover active:scale-[0.98] text-white font-bold py-3.5 rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg shadow-brand/20"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" /> Procesando...
                </>
              ) : (
                <>
                  <ShoppingCart className="h-5 w-5" /> Confirmar Pedido por
                  WhatsApp
                </>
              )}
            </button>
          ) : (
            <div className="w-full bg-bg-surface-2 border border-border text-center py-3.5 rounded-xl">
              <span className="text-sm font-semibold text-text-dim">
                Confirmar Pedido
              </span>
              {total > 0 && (
                <p className="text-[10px] text-accent font-medium mt-0.5">
                  Faltan {fmt(faltante)} para activar el furgón
                </p>
              )}
            </div>
          )}
        </div>
      </footer>
      )}
    </div>
  );
}
