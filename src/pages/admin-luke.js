"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Head from "next/head";
import { createClient } from "@/lib/supabase/client";
import {
  MapPin,
  Plus,
  X,
  Save,
  Loader2,
  MessageCircle,
  Phone,
  FileText,
  RefreshCw,
} from "lucide-react";

// Coordenadas centrales de Placilla de Peñuelas
const CENTRO_PLACILLA = [-33.1015, -71.5580];
const ZOOM_INICIAL = 14;

const SECTORES = [
  "Placilla Oriente",
  "Placilla Poniente",
  "Placilla Centro",
  "Curauma Norte",
  "Curauma Sur",
  "Curauma Centro",
];

const PRIORIDAD_COLORES = {
  Alta: "#22c55e",
  Media: "#eab308",
  Baja: "#ef4444",
};

export default function AdminLukePage() {
  const [clientes, setClientes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [clickCoords, setClickCoords] = useState(null);
  const [saving, setSaving] = useState(false);
  const [modoEdicion, setModoEdicion] = useState(false);
  const [form, setForm] = useState({
    nombre_tienda: "",
    nombre_contacto: "",
    whatsapp: "",
    sector: SECTORES[0],
    notas_campo: "",
    prioridad_territorial: "Media",
  });

  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const markersLayer = useRef(null);
  const supabase = createClient();

  // --- Cargar clientes ---
  const fetchClientes = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("clientes")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setClientes(data || []);
    } catch (err) {
      console.error("[AdminLuke] Error cargando clientes:", err);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetchClientes();
  }, [fetchClientes]);

  // --- Inicializar Leaflet (client-only) ---
  useEffect(() => {
    if (typeof window === "undefined" || mapInstance.current) return;

    // Cargar CSS de Leaflet dinámicamente
    const linkEl = document.createElement("link");
    linkEl.rel = "stylesheet";
    linkEl.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    document.head.appendChild(linkEl);

    // Esperar a que el CSS se cargue antes de importar Leaflet
    linkEl.onload = async () => {
      const L = (await import("leaflet")).default;

      if (!mapRef.current || mapInstance.current) return;

      const map = L.map(mapRef.current, {
        center: CENTRO_PLACILLA,
        zoom: ZOOM_INICIAL,
        zoomControl: false,
      });

      // Tiles oscuros
      L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
        {
          attribution: '&copy; <a href="https://carto.com/">CARTO</a>',
          maxZoom: 19,
        }
      ).addTo(map);

      // Zoom control en posición bottom-right
      L.control.zoom({ position: "bottomright" }).addTo(map);

      // Capa de marcadores
      markersLayer.current = L.layerGroup().addTo(map);

      // Evento de clic en el mapa para registrar nuevos clientes
      map.on("click", (e) => {
        setClickCoords({ lat: e.latlng.lat, lng: e.latlng.lng });
        setForm({
          nombre_tienda: "",
          nombre_contacto: "",
          whatsapp: "",
          sector: SECTORES[0],
          notas_campo: "",
          prioridad_territorial: "Media",
        });
        setShowModal(true);
      });

      mapInstance.current = map;
    };

    return () => {
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
      }
    };
  }, []);

  // --- Exponer función de generación de enlace para Leaflet ---
  useEffect(() => {
    if (typeof window === "undefined") return;

    window.generarEnlaceSeguro = async (clienteId, nombreContacto) => {
      const btn = document.getElementById(`btn-enlace-${clienteId}`);
      if (btn) {
        btn.disabled = true;
        btn.innerText = "⏳...";
      }

      try {
        const res = await fetch(`/api/crear-token-prueba?cliente_id=${clienteId}`);
        const data = await res.json();
        
        if (!res.ok || !data.success) {
          throw new Error(data.message || "Error al crear el token");
        }

        const secureUrl = data.url_pedido_prueba;
        
        // Copiar al portapapeles
        await navigator.clipboard.writeText(secureUrl);
        
        if (btn) {
          btn.style.background = "#059669";
          btn.innerText = "✅ Copiado";
        }
        
        const confirmShare = window.confirm(
          `¡Enlace seguro generado y copiado al portapapeles!\n\n¿Quieres abrir WhatsApp para enviárselo a ${nombreContacto}?`
        );
        
        if (confirmShare) {
          const cliente = clientes.find(cl => cl.id === clienteId);
          if (cliente) {
            const cleanPhone = cliente.whatsapp.replace(/[^0-9]/g, "");
            const templateMsg = encodeURIComponent(
              `¡Hola ${nombreContacto}! Aquí tienes tu enlace seguro de LukeDelivery para hacer tu pedido de hoy: ${secureUrl}\n\n*(El enlace expira en 2 horas)*`
            );
            window.open(`https://wa.me/${cleanPhone}?text=${templateMsg}`, "_blank");
          }
        }
      } catch (err) {
        console.error("[generarEnlaceSeguro] Error:", err);
        alert("Error al generar el enlace de pedido: " + err.message);
        if (btn) {
          btn.disabled = false;
          btn.innerText = "🔗 Enlace";
          btn.style.background = "#10b981";
        }
      }
    };

    return () => {
      delete window.generarEnlaceSeguro;
    };
  }, [clientes]);

  // --- Renderizar pines cuando cambian los clientes o el modo de edición ---
  useEffect(() => {
    if (!markersLayer.current || typeof window === "undefined") return;

    import("leaflet").then((mod) => {
      const L = mod.default;
      markersLayer.current.clearLayers();

      clientes.forEach((c) => {
        const color = PRIORIDAD_COLORES[c.prioridad_territorial] || "#9ca3af";

        // Icono personalizado con SVG
        const icon = L.divIcon({
          className: "",
          html: `
            <div style="
              width: 28px; height: 28px;
              background: ${color};
              border: 3px solid rgba(0,0,0,0.4);
              border-radius: 50% 50% 50% 0;
              transform: rotate(-45deg);
              box-shadow: 0 4px 12px ${color}66;
            "></div>
          `,
          iconSize: [28, 28],
          iconAnchor: [14, 28],
          popupAnchor: [0, -30],
        });

        const waLink = `https://wa.me/${c.whatsapp.replace(/[^0-9+]/g, "")}`;

        const marker = L.marker([c.latitud, c.longitud], { 
          icon,
          draggable: modoEdicion 
        }).addTo(markersLayer.current);

        if (modoEdicion) {
          marker.bindTooltip(`Arrastra para mover: ${c.nombre_tienda}`, { permanent: false, direction: 'top' });
          
          marker.on("dragend", async (e) => {
            const newLatLng = e.target.getLatLng();
            const confirmacion = window.confirm(
              `¿Reubicar "${c.nombre_tienda}" a:\nLat: ${newLatLng.lat.toFixed(6)}\nLng: ${newLatLng.lng.toFixed(6)}?`
            );

            if (confirmacion) {
              const { error } = await supabase
                .from("clientes")
                .update({ latitud: newLatLng.lat, longitud: newLatLng.lng })
                .eq("id", c.id);

              if (error) {
                console.error("Error al reubicar:", error);
                alert("Error al actualizar la ubicación en la base de datos.");
              }
              // Volver a cargar clientes
              fetchClientes();
            } else {
              // Revertir posición
              fetchClientes();
            }
          });
        } else {
          marker.bindPopup(
            `
            <div style="min-width: 220px; font-family: system-ui, sans-serif;">
              <div style="font-size: 15px; font-weight: 700; margin-bottom: 6px; color: #f9fafb;">
                ${c.nombre_tienda}
              </div>
              <div style="font-size: 12px; color: #9ca3af; margin-bottom: 3px;">
                👤 ${c.nombre_contacto}
              </div>
              <div style="font-size: 12px; color: #9ca3af; margin-bottom: 3px;">
                📍 ${c.sector}
              </div>
              ${c.notas_campo ? `<div style="font-size: 11px; color: #6b7280; margin-bottom: 8px; font-style: italic;">📝 ${c.notas_campo}</div>` : ""}
              <div style="
                display: inline-block;
                padding: 2px 8px;
                border-radius: 8px;
                font-size: 10px;
                font-weight: 600;
                color: white;
                background: ${color};
                margin-bottom: 10px;
              ">
                Prioridad: ${c.prioridad_territorial}
              </div>
              <br/>
              <div style="display: flex; gap: 6px; margin-top: 4px;">
                <a href="${waLink}" target="_blank" style="
                  flex: 1;
                  display: inline-flex;
                  align-items: center;
                  justify-content: center;
                  gap: 6px;
                  padding: 8px 10px;
                  background: #25D366;
                  color: white;
                  border-radius: 10px;
                  font-size: 11px;
                  font-weight: 600;
                  text-decoration: none;
                ">
                  💬 Chat
                </a>
                <button onclick="window.generarEnlaceSeguro('${c.id}', '${c.nombre_contacto.replace(/'/g, "\\'")}')" style="
                  flex: 1;
                  display: inline-flex;
                  align-items: center;
                  justify-content: center;
                  gap: 6px;
                  padding: 8px 10px;
                  background: #10b981;
                  color: white;
                  border: none;
                  border-radius: 10px;
                  font-size: 11px;
                  font-weight: 600;
                  cursor: pointer;
                " id="btn-enlace-${c.id}">
                  🔗 Enlace
                </button>
              </div>
            </div>
            `,
            { maxWidth: 280 }
          );
        }
      });
    });
  }, [clientes, modoEdicion, fetchClientes]);

  // --- Guardar nuevo cliente ---
  const handleGuardar = async () => {
    if (
      !form.nombre_tienda.trim() ||
      !form.nombre_contacto.trim() ||
      !form.whatsapp.trim() ||
      !clickCoords
    ) {
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.from("clientes").insert({
        nombre_tienda: form.nombre_tienda.trim(),
        nombre_contacto: form.nombre_contacto.trim(),
        whatsapp: form.whatsapp.trim(),
        sector: form.sector,
        notas_campo: form.notas_campo.trim() || null,
        latitud: clickCoords.lat,
        longitud: clickCoords.lng,
        prioridad_territorial: form.prioridad_territorial,
      });

      if (error) throw error;

      setShowModal(false);
      await fetchClientes(); // Refrescar pines sin recargar la página
    } catch (err) {
      console.error("[AdminLuke] Error guardando:", err);
      alert("Error al guardar el cliente. Revisa la consola.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-bg-app overflow-hidden">
      <Head>
        <title>Panel Admin | LukeDelivery</title>
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no"
        />
      </Head>

      {/* ===== TOP BAR ===== */}
      <header className="shrink-0 bg-bg-surface/95 backdrop-blur-lg border-b border-border px-4 py-3 flex items-center justify-between z-30">
        <div className="flex items-center gap-2.5">
          <div className="bg-brand/15 p-1.5 rounded-lg">
            <MapPin className="h-4 w-4 text-brand" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-text-primary leading-none">
              Mapeo Territorial
            </h1>
            <span className="text-[10px] text-text-dim">
              Placilla & Curauma
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Switch de Modo Edición de Ubicación */}
          <button
            onClick={() => setModoEdicion(!modoEdicion)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer border ${
              modoEdicion
                ? "bg-amber-500/10 border-amber-500 text-amber-500 shadow-lg shadow-amber-500/5 animate-pulse"
                : "bg-bg-surface-2 border-border text-text-secondary hover:text-text-primary hover:border-white/10"
            }`}
            title="Ajustar ubicación de locales arrastrando los pines"
          >
            <MapPin className={`h-3.5 w-3.5 ${modoEdicion ? "text-amber-500" : "text-text-secondary"}`} />
            {modoEdicion ? "Modo Ajuste Activo" : "Ajustar Ubicaciones"}
          </button>

          <button
            onClick={() => { setLoading(true); fetchClientes(); }}
            className="p-2 rounded-lg text-text-secondary hover:text-text-primary hover:bg-bg-surface-2 transition-colors cursor-pointer"
            title="Refrescar"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>

          {/* Leyenda de prioridad */}
          <div className="hidden sm:flex items-center gap-3 text-[10px] text-text-dim bg-bg-surface-2 py-1.5 px-3 rounded-full border border-border">
            {Object.entries(PRIORIDAD_COLORES).map(([label, color]) => (
              <div key={label} className="flex items-center gap-1">
                <div
                  className="h-2 w-2 rounded-full"
                  style={{ background: color }}
                />
                {label}
              </div>
            ))}
          </div>

          <div className="bg-bg-surface-2 border border-border py-1 px-2.5 rounded-full text-[11px] text-text-secondary font-medium">
            {clientes.length} locales
          </div>
        </div>
      </header>

      {/* ===== MAP ===== */}
      <div className="flex-1 relative">
        <div ref={mapRef} className="h-full w-full" />

        {/* Hint overlay */}
        <div className="absolute bottom-5 left-1/2 -translate-x-1/2 bg-bg-surface/90 backdrop-blur-md border border-border rounded-full py-2 px-4 text-xs text-text-secondary z-20 pointer-events-none flex items-center gap-1.5">
          <Plus className="h-3 w-3 text-brand" />
          Toca el mapa para registrar un nuevo almacén
        </div>
      </div>

      {/* ===== MODAL REGISTRO ===== */}
      {showModal && clickCoords && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowModal(false)}
          />

          {/* Modal */}
          <div className="relative bg-bg-surface border border-border rounded-t-3xl sm:rounded-2xl w-full max-w-md mx-auto p-6 animate-slide-up max-h-[85vh] overflow-y-auto">
            {/* Close */}
            <button
              onClick={() => setShowModal(false)}
              className="absolute top-4 right-4 text-text-dim hover:text-text-primary transition-colors cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>

            <h2 className="text-lg font-bold text-text-primary mb-1">
              Nuevo Almacén
            </h2>
            <p className="text-xs text-text-dim mb-5">
              📍 {clickCoords.lat.toFixed(6)}, {clickCoords.lng.toFixed(6)}
            </p>

            <div className="space-y-4">
              {/* Nombre Tienda */}
              <div>
                <label className="block text-[11px] font-semibold text-text-dim uppercase tracking-wider mb-1.5">
                  Nombre de la Tienda *
                </label>
                <input
                  type="text"
                  value={form.nombre_tienda}
                  onChange={(e) =>
                    setForm({ ...form, nombre_tienda: e.target.value })
                  }
                  placeholder="Ej: Almacén Don Tito"
                  className="w-full bg-bg-surface-2 border border-border rounded-xl px-3.5 py-2.5 text-sm text-text-primary placeholder:text-text-dim focus:border-brand/50 focus:outline-none transition-colors"
                />
              </div>

              {/* Contacto */}
              <div>
                <label className="block text-[11px] font-semibold text-text-dim uppercase tracking-wider mb-1.5">
                  Nombre del Contacto *
                </label>
                <input
                  type="text"
                  value={form.nombre_contacto}
                  onChange={(e) =>
                    setForm({ ...form, nombre_contacto: e.target.value })
                  }
                  placeholder="Ej: Juan Pérez"
                  className="w-full bg-bg-surface-2 border border-border rounded-xl px-3.5 py-2.5 text-sm text-text-primary placeholder:text-text-dim focus:border-brand/50 focus:outline-none transition-colors"
                />
              </div>

              {/* WhatsApp */}
              <div>
                <label className="block text-[11px] font-semibold text-text-dim uppercase tracking-wider mb-1.5">
                  WhatsApp *
                </label>
                <input
                  type="tel"
                  value={form.whatsapp}
                  onChange={(e) =>
                    setForm({ ...form, whatsapp: e.target.value })
                  }
                  placeholder="+56912345678"
                  className="w-full bg-bg-surface-2 border border-border rounded-xl px-3.5 py-2.5 text-sm text-text-primary placeholder:text-text-dim focus:border-brand/50 focus:outline-none transition-colors"
                />
              </div>

              {/* Sector */}
              <div>
                <label className="block text-[11px] font-semibold text-text-dim uppercase tracking-wider mb-1.5">
                  Sector
                </label>
                <select
                  value={form.sector}
                  onChange={(e) =>
                    setForm({ ...form, sector: e.target.value })
                  }
                  className="w-full bg-bg-surface-2 border border-border rounded-xl px-3.5 py-2.5 text-sm text-text-primary focus:border-brand/50 focus:outline-none transition-colors cursor-pointer"
                >
                  {SECTORES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>

              {/* Prioridad */}
              <div>
                <label className="block text-[11px] font-semibold text-text-dim uppercase tracking-wider mb-1.5">
                  Prioridad Territorial
                </label>
                <div className="flex gap-2">
                  {Object.entries(PRIORIDAD_COLORES).map(([label, color]) => (
                    <button
                      key={label}
                      onClick={() =>
                        setForm({ ...form, prioridad_territorial: label })
                      }
                      className={`flex-1 py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                        form.prioridad_territorial === label
                          ? "text-white border-transparent shadow-lg"
                          : "text-text-dim bg-bg-surface-2 border-border hover:border-white/10"
                      }`}
                      style={
                        form.prioridad_territorial === label
                          ? { background: color, boxShadow: `0 4px 14px ${color}44` }
                          : {}
                      }
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Notas */}
              <div>
                <label className="block text-[11px] font-semibold text-text-dim uppercase tracking-wider mb-1.5">
                  Notas de Campo
                </label>
                <textarea
                  value={form.notas_campo}
                  onChange={(e) =>
                    setForm({ ...form, notas_campo: e.target.value })
                  }
                  rows={2}
                  placeholder="Ej: Prefiere entregas por la mañana"
                  className="w-full bg-bg-surface-2 border border-border rounded-xl px-3.5 py-2.5 text-sm text-text-primary placeholder:text-text-dim focus:border-brand/50 focus:outline-none transition-colors resize-none"
                />
              </div>

              {/* Guardar */}
              <button
                onClick={handleGuardar}
                disabled={
                  saving ||
                  !form.nombre_tienda.trim() ||
                  !form.nombre_contacto.trim() ||
                  !form.whatsapp.trim()
                }
                className="w-full bg-brand hover:bg-brand-hover disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer mt-2"
              >
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Guardando...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4" /> Guardar Almacén
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
