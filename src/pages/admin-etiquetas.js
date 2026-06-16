"use client";

import { useState, useEffect } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { createClient } from "@/lib/supabase/client";
import { Loader2, AlertTriangle, Printer, ArrowLeft } from "lucide-react";

export default function AdminEtiquetasPage() {
  const router = useRouter();
  const { pedido_id } = router.query;
  const [autenticado, setAutenticado] = useState(false);
  const [pedido, setPedido] = useState(null);
  const [bultos, setBultos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  const supabase = createClient();
  const ADMIN_SECRET = process.env.NEXT_PUBLIC_ADMIN_SECRET || "";

  // 1. Validar autenticación
  useEffect(() => {
    if (typeof window !== "undefined") {
      const auth = localStorage.getItem("luke_admin_authenticated");
      if (auth === "true") {
        setAutenticado(true);
      } else {
        const pin = prompt("Ingresa el PIN de acceso de administración:");
        if (pin === ADMIN_SECRET || pin === ADMIN_SECRET.slice(-4)) {
          setAutenticado(true);
          localStorage.setItem("luke_admin_authenticated", "true");
        } else {
          setError("Acceso no autorizado.");
          setLoading(false);
        }
      }
    }
  }, [ADMIN_SECRET]);

  // 2. Cargar datos del pedido, bultos e ítems
  useEffect(() => {
    if (!autenticado || !pedido_id) return;

    async function loadData() {
      try {
        setLoading(true);
        // Obtener datos del pedido y cliente
        const { data: pedData, error: pedErr } = await supabase
          .from("pedidos")
          .select(`
            id,
            estado,
            total_pagar,
            clientes (
              nombre_tienda,
              nombre_contacto,
              sector,
              prioridad_territorial
            ),
            items_pedido (
              cantidad,
              productos (
                nombre,
                formato_venta
              )
            )
          `)
          .eq("id", pedido_id)
          .single();

        if (pedErr) throw pedErr;
        setPedido(pedData);

        // Obtener bultos asociados
        const { data: bultosData, error: bultosErr } = await supabase
          .from("bultos_despacho")
          .select("*")
          .eq("pedido_id", pedido_id)
          .order("codigo_bulto", { ascending: true });

        if (bultosErr) throw bultosErr;
        setBultos(bultosData || []);
        
      } catch (err) {
        console.error("Error cargando etiquetas:", err.message);
        setError("Error al cargar los datos del pedido o los bultos.");
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [autenticado, pedido_id, supabase]);

  // Auto-lanzar impresión cuando termine de cargar
  useEffect(() => {
    if (!loading && bultos.length > 0 && typeof window !== "undefined") {
      const timer = setTimeout(() => {
        window.print();
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [loading, bultos]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center gap-4 text-slate-100">
        <Loader2 className="w-10 h-10 animate-spin text-amber-500" />
        <p className="text-sm font-semibold">Generando etiquetas de despacho...</p>
      </div>
    );
  }

  if (error || !pedido) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center gap-4 text-slate-100 p-6 text-center">
        <AlertTriangle className="w-12 h-12 text-rose-500" />
        <p className="text-base font-bold text-slate-200">{error || "Pedido no encontrado."}</p>
        <button
          onClick={() => window.close()}
          className="px-5 py-2.5 bg-slate-900 border border-slate-800 hover:bg-slate-800 rounded-xl text-xs font-bold transition active:scale-95"
        >
          Cerrar pestaña
        </button>
      </div>
    );
  }

  if (bultos.length === 0) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center gap-4 text-slate-100 p-6 text-center">
        <AlertTriangle className="w-12 h-12 text-amber-500" />
        <p className="text-base font-bold text-slate-200">Este pedido no tiene bultos registrados.</p>
        <p className="text-xs text-slate-500 max-w-sm">
          Por favor, marca el pedido como "Preparado" en el panel de administración para configurar la cantidad de bultos antes de imprimir.
        </p>
        <button
          onClick={() => window.close()}
          className="px-5 py-2.5 bg-slate-900 border border-slate-800 hover:bg-slate-800 rounded-xl text-xs font-bold transition active:scale-95"
        >
          Cerrar pestaña
        </button>
      </div>
    );
  }

  const cl = pedido.clientes;
  const totalBultos = bultos.length;

  return (
    <div className="min-h-screen bg-slate-900 text-slate-900 font-sans p-4 sm:p-8 flex flex-col items-center print:bg-white print:p-0 print:m-0">
      <Head>
        <title>Etiquetas Pedido #{pedido.id.substring(0, 8).toUpperCase()}</title>
      </Head>

      {/* Control panel en pantalla (oculto en impresión) */}
      <div className="w-full max-w-lg mb-6 bg-slate-950/80 backdrop-blur border border-slate-800 text-slate-100 rounded-2xl p-4 flex items-center justify-between gap-4 shadow-xl print:hidden animate-fade-in">
        <button
          onClick={() => window.close()}
          className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Volver al Admin</span>
        </button>
        <div className="text-center">
          <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Tienda</span>
          <span className="text-xs font-bold">{cl?.nombre_tienda}</span>
        </div>
        <button
          onClick={() => window.print()}
          className="inline-flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-xs px-4 py-2.5 rounded-xl transition active:scale-95 cursor-pointer"
        >
          <Printer className="w-4 h-4 shrink-0" />
          <span>Imprimir</span>
        </button>
      </div>

      {/* Contenedor de etiquetas */}
      <div className="flex flex-col gap-8 items-center w-full print:gap-0 print:block">
        {bultos.map((b, idx) => {
          const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(b.codigo_bulto)}`;
          return (
            <div
              key={b.id}
              className="etiqueta-box bg-white border border-slate-300 w-[100mm] h-[100mm] p-5 flex flex-col justify-between shadow-lg relative print:shadow-none print:border-0 print:border-b print:border-dashed print:border-slate-300 print:page-break-after-always overflow-hidden"
              style={{ boxSizing: "border-box" }}
            >
              {/* Encabezado */}
              <div className="border-b-2 border-slate-900 pb-2">
                <div className="flex justify-between items-start">
                  <div>
                    <h2 className="text-lg font-black tracking-tight leading-tight uppercase max-w-[240px] truncate text-slate-950">
                      {cl?.nombre_tienda}
                    </h2>
                    <span className="text-xs font-bold text-slate-600">
                      Contacto: {cl?.nombre_contacto}
                    </span>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="inline-block bg-slate-900 text-white font-black text-[10px] px-2 py-0.5 rounded uppercase leading-none">
                      {cl?.prioridad_territorial || "Media"}
                    </span>
                    <span className="block text-[10px] font-bold text-slate-600 mt-1">
                      Sector: {cl?.sector}
                    </span>
                  </div>
                </div>
              </div>

              {/* Centro: QR y Código */}
              <div className="flex items-center gap-4 py-2.5 flex-1 min-h-0">
                <div className="w-[120px] h-[120px] bg-slate-100 flex items-center justify-center shrink-0 border border-slate-200 rounded-lg overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={qrUrl}
                    alt={b.codigo_bulto}
                    className="w-full h-full object-contain"
                  />
                </div>
                <div className="flex flex-col justify-between flex-1 h-full min-w-0">
                  <div>
                    <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">ID Bulto</span>
                    <span className="text-base font-black text-slate-900 tracking-wider font-mono block">
                      {b.codigo_bulto}
                    </span>
                  </div>
                  <div className="mt-1 min-h-0 overflow-hidden">
                    <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider block">Detalle Pedido</span>
                    <div className="text-[10px] text-slate-700 leading-normal max-h-[60px] overflow-hidden pr-1 select-none">
                      {pedido.items_pedido?.map((item, index) => (
                        <div key={index} className="truncate font-semibold">
                          • {item.cantidad}x {item.productos?.nombre}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Pie de etiqueta */}
              <div className="border-t-2 border-slate-900 pt-2 flex justify-between items-center text-xs">
                <div className="font-bold text-slate-950 font-mono">
                  Pedido: #{pedido.id.substring(0, 8).toUpperCase()}
                </div>
                <div className="bg-slate-900 text-white font-black px-3.5 py-1.5 rounded-full text-sm">
                  BUlTO {idx + 1} DE {totalBultos}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Estilos para impresión nativos */}
      <style jsx global>{`
        @media print {
          body {
            background-color: white !important;
            color: black !important;
            padding: 0 !important;
            margin: 0 !important;
          }
          .etiqueta-box {
            border: none !important;
            box-shadow: none !important;
            width: 100mm !important;
            height: 100mm !important;
            margin: 0 auto !important;
            padding: 10mm !important;
            page-break-after: always !important;
            page-break-inside: avoid !important;
            display: flex !important;
            flex-direction: column !important;
            justify-content: space-between !important;
          }
          /* Ocultar elementos de UI */
          .print\\:hidden, 
          header, 
          footer, 
          nav {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
}
