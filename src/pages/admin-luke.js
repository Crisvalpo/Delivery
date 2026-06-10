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
  Package,
  Edit,
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

const cleanText = (str) => {
  if (!str) return "";
  return str.replace(/Est\?\?ndar/g, "Estándar")
            .replace(/Bid\?\?n/g, "Bidón")
            .replace(/EstÃ¡ndar/g, "Estándar")
            .replace(/BidÃ³n/g, "Bidón")
            .replace(/Ã¡/g, "á")
            .replace(/Ã³/g, "ó");
};

export default function AdminLukePage() {
  const [clientes, setClientes] = useState([]);
  const [pedidos, setPedidos] = useState([]);
  const [productos, setProductos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showCatalogModal, setShowCatalogModal] = useState(false);
  const [editingProducto, setEditingProducto] = useState(null);
  const [showProductForm, setShowProductForm] = useState(false);
  const [filtroSoloActivos, setFiltroSoloActivos] = useState(true);
  const [productForm, setProductForm] = useState({
    nombre: "",
    formato_venta: "",
    precio: "",
    precio_costo: "",
    categoria_logistica: "Estándar",
    url_imagen_retail: "",
    disponible: true,
    categoria: "Abarrotes"
  });
  const [clickCoords, setClickCoords] = useState(null);
  const [saving, setSaving] = useState(false);
  const [modoEdicion, setModoEdicion] = useState(false);
  const [sidebarCliente, setSidebarCliente] = useState(null);
  const [actualizandoPedidoId, setActualizandoPedidoId] = useState(null);
  const [form, setForm] = useState({
    nombre_tienda: "",
    nombre_contacto: "",
    whatsapp: "",
    sector: SECTORES[0],
    notas_campo: "",
    prioridad_territorial: "Media",
    tipo_negocio: "Almacén",
  });

  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteForm, setInviteForm] = useState({ nombre: "", whatsapp: "" });
  const [sendingInvite, setSendingInvite] = useState(false);
  const [inviteStatus, setInviteStatus] = useState(null);

  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const markersLayer = useRef(null);
  const supabase = createClient();

  const modoEdicionRef = useRef(modoEdicion);
  useEffect(() => {
    modoEdicionRef.current = modoEdicion;
  }, [modoEdicion]);

  // --- Cargar clientes, pedidos y productos ---
  const fetchClientes = useCallback(async () => {
    try {
      const { data: clData, error: clError } = await supabase
        .from("clientes")
        .select("*")
        .order("created_at", { ascending: false });

      if (clError) throw clError;
      setClientes(clData || []);

      const { data: pedData, error: pedError } = await supabase
        .from("pedidos")
        .select(`
          id,
          cliente_id,
          total_neto,
          flete,
          total_pagar,
          total_costo,
          estado,
          created_at,
          items_pedido (
            id,
            cantidad,
            precio_unitario,
            total_item,
            productos (
              nombre,
              formato_venta
            )
          )
        `)
        .order("created_at", { ascending: false });

      if (pedError) throw pedError;
      setPedidos(pedData || []);

      const { data: prodData, error: prodError } = await supabase
        .from("productos")
        .select("*")
        .order("nombre", { ascending: true });

      if (prodError) throw prodError;
      setProductos(prodData || []);
    } catch (err) {
      console.error("[AdminLuke] Error cargando datos:", err);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetchClientes();
  }, [fetchClientes]);

  const handleSendInvitation = async (e) => {
    e.preventDefault();
    if (!inviteForm.whatsapp.trim()) return;

    setSendingInvite(true);
    setInviteStatus(null);

    try {
      const response = await fetch("/api/enviar-invitacion", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          whatsapp: inviteForm.whatsapp,
          nombre: inviteForm.nombre,
        }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setInviteStatus({
          success: true,
          message: "¡Invitación enviada con éxito por WhatsApp!",
        });
        setInviteForm({ nombre: "", whatsapp: "" });
        
        setTimeout(() => {
          setShowInviteModal(false);
          setInviteStatus(null);
        }, 2000);
      } else {
        setInviteStatus({
          success: false,
          message: data.message || "Error al enviar la invitación.",
        });
      }
    } catch (err) {
      console.error("[Invitacion] Error:", err);
      setInviteStatus({
        success: false,
        message: "Error de red al intentar enviar la invitación.",
      });
    } finally {
      setSendingInvite(false);
    }
  };

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
        if (modoEdicionRef.current) return;
        setClickCoords({ lat: e.latlng.lat, lng: e.latlng.lng });
        setForm({
          nombre_tienda: "",
          nombre_contacto: "",
          whatsapp: "",
          sector: SECTORES[0],
          notas_campo: "",
          prioridad_territorial: "Media",
          tipo_negocio: "Almacén",
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

  // --- Exponer funciones globales para Leaflet ---
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

    window.abrirSidebarPedidos = (clienteId) => {
      const cl = clientes.find(c => c.id === clienteId);
      if (cl) {
        setSidebarCliente(cl);
      }
    };

    return () => {
      delete window.generarEnlaceSeguro;
      delete window.abrirSidebarPedidos;
    };
  }, [clientes]);

  // --- Renderizar pines cuando cambian los clientes, pedidos o el modo de edición ---
  useEffect(() => {
    if (!markersLayer.current || typeof window === "undefined") return;

    import("leaflet").then((mod) => {
      const L = mod.default;
      markersLayer.current.clearLayers();

      clientes.forEach((c) => {
        const color = PRIORIDAD_COLORES[c.prioridad_territorial] || "#9ca3af";

        const tienePedidoActivo = pedidos.some(
          (p) =>
            p.cliente_id === c.id &&
            (p.estado === "Pendiente" || p.estado === "Preparado")
        );

        // Icono personalizado con SVG (pulsante si tiene pedido activo)
        const icon = L.divIcon({
          className: "",
          html: `
            <div class="${tienePedidoActivo ? 'pin-pulsante' : ''}" style="
              width: 28px; height: 28px;
              background: ${color};
              border: 3px solid ${tienePedidoActivo ? '#ffffff' : 'rgba(0,0,0,0.4)'};
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
              <div style="display: flex; gap: 6px; margin-top: 4px; margin-bottom: 6px;">
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
              <button onclick="window.abrirSidebarPedidos('${c.id}')" style="
                width: 100%;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                gap: 6px;
                padding: 8px 10px;
                background: #2563eb;
                color: white;
                border: none;
                border-radius: 10px;
                font-size: 11px;
                font-weight: 600;
                cursor: pointer;
              ">
                📦 Ver Pedidos ${tienePedidoActivo ? '🔴' : ''}
              </button>
            </div>
            `,
            { maxWidth: 280 }
          );
        }
      });
    });
  }, [clientes, pedidos, modoEdicion, fetchClientes]);

  // --- Actualizar estado de pedido ---
  const handleActualizarEstado = async (pedidoId, nuevoEstado) => {
    setActualizandoPedidoId(pedidoId);
    try {
      const { error } = await supabase
        .from("pedidos")
        .update({ estado: nuevoEstado })
        .eq("id", pedidoId);

      if (error) throw error;
      
      // Volver a cargar clientes y pedidos para refrescar el mapa y el sidebar
      await fetchClientes();
    } catch (err) {
      console.error("[AdminLuke] Error actualizando estado de pedido:", err);
      alert("Error al actualizar el estado del pedido.");
    } finally {
      setActualizandoPedidoId(null);
    }
  };

  // --- Toggle Disponibilidad de Producto ---
  const handleToggleDisponibilidad = async (producto) => {
    try {
      const { error } = await supabase
        .from("productos")
        .update({ disponible: !producto.disponible })
        .eq("id", producto.id);

      if (error) throw error;
      
      // Refrescar datos
      await fetchClientes();
    } catch (err) {
      console.error("[AdminLuke] Error al cambiar disponibilidad:", err);
      alert("Error al cambiar la disponibilidad del producto.");
    }
  };

  // --- Abrir Formulario de Producto ---
  const handleOpenProductForm = (producto = null) => {
    if (producto) {
      setEditingProducto(producto);
      setProductForm({
        nombre: producto.nombre,
        formato_venta: producto.formato_venta,
        precio: producto.precio,
        precio_costo: producto.precio_costo,
        categoria_logistica: producto.categoria_logistica,
        url_imagen_retail: producto.url_imagen_retail || "",
        disponible: producto.disponible,
        categoria: producto.categoria || "Abarrotes"
      });
    } else {
      setEditingProducto(null);
      setProductForm({
        nombre: "",
        formato_venta: "",
        precio: "",
        precio_costo: "",
        categoria_logistica: "Estándar",
        url_imagen_retail: "",
        disponible: true,
        categoria: "Abarrotes"
      });
    }
    setShowProductForm(true);
  };

  // --- Guardar/Insertar/Actualizar Producto ---
  const handleGuardarProducto = async () => {
    if (!productForm.nombre.trim() || !productForm.formato_venta.trim() || !productForm.precio || !productForm.precio_costo) {
      alert("Por favor completa los campos requeridos.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        nombre: productForm.nombre.trim(),
        formato_venta: productForm.formato_venta.trim(),
        precio: parseInt(productForm.precio),
        precio_costo: parseInt(productForm.precio_costo),
        categoria_logistica: productForm.categoria_logistica,
        url_imagen_retail: productForm.url_imagen_retail.trim() || null,
        disponible: productForm.disponible,
        categoria: productForm.categoria
      };

      if (editingProducto) {
        // Actualizar
        const { error } = await supabase
          .from("productos")
          .update(payload)
          .eq("id", editingProducto.id);

        if (error) throw error;
      } else {
        // Insertar
        const { error } = await supabase
          .from("productos")
          .insert(payload);

        if (error) throw error;
      }

      setShowProductForm(false);
      await fetchClientes(); // Refrescar lista de productos
    } catch (err) {
      console.error("[AdminLuke] Error guardando producto:", err);
      alert("Error al guardar el producto. Revisa la consola.");
    } finally {
      setSaving(false);
    }
  };

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
        tipo_negocio: form.tipo_negocio,
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
          <div className="flex items-center gap-2.5 bg-bg-surface-2 border border-border px-3 py-1.5 rounded-xl">
            <span className="text-[11px] font-bold text-text-secondary select-none">
              Ajustar Ubicación
            </span>
            <button
              onClick={() => setModoEdicion(!modoEdicion)}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 ${
                modoEdicion ? "bg-amber-500 shadow-md shadow-amber-500/20" : "bg-bg-app"
              }`}
              title="Permitir arrastrar y soltar pines para ajustar ubicación de los locales"
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                  modoEdicion ? "translate-x-4" : "translate-x-0"
                }`}
              />
            </button>
          </div>

          {/* Botón Gestionar Catálogo */}
          <button
            onClick={() => setShowCatalogModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer border bg-bg-surface-2 border-border text-text-secondary hover:text-text-primary hover:border-white/10"
            title="Administrar catálogo de productos"
          >
            <Package className="h-3.5 w-3.5 text-brand" />
            <span>Productos</span>
          </button>

          {/* Botón Enviar Invitación */}
          <button
            onClick={() => {
              setInviteForm({ nombre: "", whatsapp: "" });
              setInviteStatus(null);
              setShowInviteModal(true);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer border bg-bg-surface-2 border-border text-text-secondary hover:text-text-primary hover:border-white/10"
            title="Enviar invitación de registro a prospecto"
          >
            <MessageCircle className="h-3.5 w-3.5 text-green-500" />
            <span>Invitar</span>
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
        <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center">
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

              {/* Tipo de Negocio */}
              <div>
                <label className="block text-[11px] font-semibold text-text-dim uppercase tracking-wider mb-1.5">
                  Tipo de Negocio
                </label>
                <select
                  value={form.tipo_negocio}
                  onChange={(e) =>
                    setForm({ ...form, tipo_negocio: e.target.value })
                  }
                  className="w-full bg-bg-surface-2 border border-border rounded-xl px-3.5 py-2.5 text-sm text-text-primary focus:border-brand/50 focus:outline-none transition-colors cursor-pointer"
                >
                  {["Almacén", "Minimarket", "Botillería", "Fiambrería"].map((t) => (
                    <option key={t} value={t}>
                      {t}
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

      {/* ===== SIDEBAR PEDIDOS ===== */}
      {sidebarCliente && (
        <div className="fixed inset-0 z-[9999] flex justify-end">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setSidebarCliente(null)}
          />

          {/* Sidebar Panel */}
          <div className="relative bg-bg-surface border-l border-border w-full max-w-md h-full shadow-2xl flex flex-col z-[9999] animate-slide-left">
            {/* Header */}
            <div className="p-4 border-b border-border flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-text-primary">
                  {sidebarCliente.nombre_tienda}
                </h2>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[10px] bg-bg-surface-2 border border-border px-2 py-0.5 rounded-full text-text-secondary font-bold select-none">
                    {sidebarCliente.tipo_negocio || "Almacén"}
                  </span>
                  <button
                    onClick={() => setFiltroSoloActivos(!filtroSoloActivos)}
                    className={`text-[10px] px-2 py-0.5 rounded-full border transition-all cursor-pointer font-bold ${
                      filtroSoloActivos
                        ? "bg-brand/10 border-brand text-brand"
                        : "bg-bg-surface-2 border-border text-text-secondary hover:text-text-primary"
                    }`}
                  >
                    {filtroSoloActivos ? "Mostrar: Solo Activos 🔴" : "Mostrar: Todos"}
                  </button>
                </div>
              </div>
              <button
                onClick={() => setSidebarCliente(null)}
                className="p-1.5 rounded-lg bg-bg-surface-2 border border-border text-text-dim hover:text-text-primary transition-colors cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* List of Orders */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {pedidos.filter((p) => p.cliente_id === sidebarCliente.id).length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-6 text-text-dim">
                  <FileText className="h-12 w-12 text-border mb-3 stroke-[1.5]" />
                  <p className="text-sm font-semibold">Sin pedidos registrados</p>
                  <p className="text-[11px] mt-1">Este almacén aún no ha realizado ningún pedido B2B.</p>
                </div>
              ) : (
                (() => {
                  const filtrados = pedidos.filter((p) => {
                    if (p.cliente_id !== sidebarCliente.id) return false;
                    if (filtroSoloActivos) {
                      return p.estado === "Pendiente" || p.estado === "Preparado" || p.estado === "En Ruta";
                    }
                    return true;
                  });

                  if (filtrados.length === 0) {
                    return (
                      <div className="h-full flex flex-col items-center justify-center text-center p-6 text-text-dim">
                        <FileText className="h-10 w-10 text-border mb-2 stroke-[1.5]" />
                        <p className="text-xs font-semibold">Sin pedidos activos</p>
                        <p className="text-[10px] mt-0.5">Todos los pedidos de este local están archivados. Desactiva el filtro superior para ver el historial.</p>
                      </div>
                    );
                  }

                  return filtrados.map((p) => {
                    const esActivo = p.estado === "Pendiente" || p.estado === "Preparado";
                    return (
                      <div
                        key={p.id}
                        className={`bg-bg-surface-2 border rounded-2xl p-4 transition-all ${
                          esActivo ? "border-brand/35" : "border-border"
                        }`}
                      >
                        {/* Order Header */}
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <span className="text-xs font-mono font-bold text-text-primary">
                              #{p.id.substring(0, 8).toUpperCase()}
                            </span>
                            <span className="block text-[10px] text-text-dim mt-0.5">
                              {new Date(p.created_at).toLocaleString("es-CL", {
                                dateStyle: "short",
                                timeStyle: "short",
                              })}
                            </span>
                          </div>
                          <span
                            className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                              p.estado === "Pendiente"
                                ? "bg-amber-500/10 text-amber-500 border border-amber-500/20"
                                : p.estado === "Preparado"
                                ? "bg-indigo-500/10 text-indigo-500 border border-indigo-500/20"
                                : p.estado === "En Ruta"
                                ? "bg-blue-500/10 text-blue-500 border border-blue-500/20"
                                : p.estado === "Entregado"
                                ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"
                                : "bg-rose-500/10 text-rose-500 border border-rose-500/20"
                            }`}
                          >
                            {p.estado}
                          </span>
                        </div>

                        {/* Order Items */}
                        <div className="border-t border-b border-border/50 py-2.5 my-2.5 space-y-1.5">
                          {p.items_pedido?.map((item) => (
                            <div key={item.id} className="flex justify-between text-xs">
                              <span className="text-text-secondary">
                                {item.cantidad}x {item.productos?.nombre || "Producto"}
                                <span className="text-[10px] text-text-dim block">
                                  {item.productos?.formato_venta}
                                </span>
                              </span>
                              <span className="font-semibold text-text-primary">
                                ${item.total_item.toLocaleString("es-CL")}
                              </span>
                            </div>
                          ))}
                        </div>

                        {/* Totales */}
                        <div className="space-y-1 text-xs">
                          <div className="flex justify-between text-text-dim">
                            <span>Flete:</span>
                            <span>${p.flete.toLocaleString("es-CL")}</span>
                          </div>
                          <div className="flex justify-between font-bold text-text-primary text-sm pt-1">
                            <span>Total a Pagar:</span>
                            <span>${p.total_pagar.toLocaleString("es-CL")}</span>
                          </div>
                        </div>

                        {/* Order Management Actions */}
                        <div className="mt-4 pt-3.5 border-t border-border/50">
                          <label className="block text-[9px] font-bold text-text-dim uppercase tracking-wider mb-2">
                            Actualizar Estado
                          </label>
                          <div className="grid grid-cols-2 gap-1.5">
                            {["Pendiente", "Preparado", "En Ruta", "Entregado", "Cancelado"].map((st) => {
                              const isSelected = p.estado === st;
                              const isUpdating = actualizandoPedidoId === p.id;
                              return (
                                <button
                                  key={st}
                                  onClick={() => handleActualizarEstado(p.id, st)}
                                  disabled={isUpdating || isSelected}
                                  className={`py-1.5 px-2.5 rounded-lg text-[10px] font-bold border transition-all flex items-center justify-center gap-1 cursor-pointer ${
                                    isSelected
                                      ? st === "Pendiente"
                                        ? "bg-amber-500 text-white border-transparent"
                                        : st === "Preparado"
                                        ? "bg-indigo-500 text-white border-transparent"
                                        : st === "En Ruta"
                                        ? "bg-blue-500 text-white border-transparent"
                                        : st === "Entregado"
                                        ? "bg-emerald-500 text-white border-transparent"
                                        : "bg-rose-500 text-white border-transparent"
                                      : "bg-bg-surface border-border text-text-secondary hover:text-text-primary hover:border-white/10"
                                  }`}
                                >
                                  {isUpdating && actualizandoPedidoId === p.id && (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  )}
                                  {st}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    );
                  });
                })()
              )}
            </div>
          </div>
        </div>
      )}

      {/* ===== MODAL GESTION CATALOGO ===== */}
      {showCatalogModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setShowCatalogModal(false)}
          />

          {/* Modal Container */}
          <div className="relative bg-bg-surface border border-border rounded-2xl w-full sm:max-w-4xl max-h-[90vh] sm:max-h-[85vh] flex flex-col overflow-hidden shadow-2xl animate-fade-in z-[9999]">
            {/* Header */}
            <div className="p-5 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-text-primary flex items-center gap-2">
                  <Package className="h-5 w-5 text-brand" />
                  Catálogo B2B de Productos
                </h2>
                <p className="text-xs text-text-dim mt-0.5">
                  Gestiona los precios, disponibilidad y stock de tu furgón mayorista
                </p>
              </div>
              <div className="flex items-center justify-between sm:justify-end gap-3 w-full sm:w-auto">
                <button
                  onClick={() => handleOpenProductForm(null)}
                  className="bg-brand hover:bg-brand-hover text-white text-xs font-bold px-3 py-2 rounded-xl flex items-center gap-1 transition-colors cursor-pointer w-full sm:w-auto justify-center"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Nuevo Producto</span>
                </button>
                <button
                  onClick={() => setShowCatalogModal(false)}
                  className="p-1.5 rounded-lg bg-bg-surface-2 border border-border text-text-dim hover:text-text-primary transition-colors cursor-pointer shrink-0"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Product List */}
            <div className="flex-1 overflow-y-auto p-5">
              {productos.length === 0 ? (
                <div className="h-48 flex flex-col items-center justify-center text-center text-text-dim">
                  <Package className="h-10 w-10 text-border mb-2 stroke-[1.5]" />
                  <p className="text-sm font-semibold">No hay productos en el catálogo</p>
                  <p className="text-xs mt-0.5">Haz clic en "Nuevo Producto" para agregar uno.</p>
                </div>
              ) : (
                <>
                  {/* Vista Mobile: Lista de Tarjetas (Cards) */}
                  <div className="block md:hidden space-y-3">
                    {productos.map((prod) => (
                      <div key={prod.id} className="bg-bg-surface-2 border border-border/60 rounded-2xl p-4 flex flex-col gap-3">
                        <div className="flex items-center gap-3">
                          {prod.url_imagen_retail ? (
                            <img
                              src={prod.url_imagen_retail}
                              alt={cleanText(prod.nombre)}
                              className="w-12 h-12 rounded-xl object-cover bg-bg-surface-3"
                            />
                          ) : (
                            <div className="w-12 h-12 rounded-xl bg-bg-surface-3 flex items-center justify-center shrink-0">
                              <Package className="h-6 w-6 text-text-dim" />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <h4 className="font-bold text-sm text-text-primary truncate">{cleanText(prod.nombre)}</h4>
                            <p className="text-xs text-text-dim">{cleanText(prod.formato_venta)}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleOpenProductForm(prod)}
                              className="p-2 rounded-xl bg-bg-surface border border-border text-text-secondary hover:text-brand hover:border-brand/40 transition-colors cursor-pointer"
                              title="Editar producto"
                            >
                              <Edit className="h-4 w-4" />
                            </button>
                          </div>
                        </div>

                        <div className="flex items-center justify-between border-t border-border/30 pt-3 text-xs">
                          <div className="flex gap-4">
                            <div>
                              <span className="text-[9px] text-text-dim block uppercase font-bold tracking-wider">P. Venta</span>
                              <span className="font-bold text-text-primary text-xs">${prod.precio.toLocaleString("es-CL")}</span>
                            </div>
                            <div>
                              <span className="text-[9px] text-text-dim block uppercase font-bold tracking-wider">Costo</span>
                              <span className="text-text-dim text-xs">${prod.precio_costo.toLocaleString("es-CL")}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                              prod.categoria_logistica === "Pesado"
                                ? "bg-accent/10 text-accent border border-accent/20"
                                : "bg-brand/10 text-brand border border-brand/20"
                            }`}>
                              {cleanText(prod.categoria_logistica)}
                            </span>
                            <div className="flex items-center gap-1.5 bg-bg-surface border border-border px-2 py-0.5 rounded-lg">
                              <span className="text-[9px] font-bold text-text-secondary">Disp</span>
                              <button
                                onClick={() => handleToggleDisponibilidad(prod)}
                                className={`relative inline-flex h-4.5 w-8 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                                  prod.disponible ? "bg-brand" : "bg-bg-surface-3"
                                }`}
                              >
                                <span
                                  className={`pointer-events-none inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                                    prod.disponible ? "translate-x-3.5" : "translate-x-0"
                                  }`}
                                />
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Vista Desktop: Tabla Tradicional */}
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-left text-xs text-text-secondary border-collapse">
                      <thead>
                        <tr className="border-b border-border text-text-dim uppercase tracking-wider text-[9px] font-bold">
                          <th className="pb-3 pl-2">Imagen</th>
                          <th className="pb-3">Nombre</th>
                          <th className="pb-3">Formato</th>
                          <th className="pb-3">Precio Venta</th>
                          <th className="pb-3">Costo</th>
                          <th className="pb-3">Categoría</th>
                          <th className="pb-3 text-center">Disponible</th>
                          <th className="pb-3 text-right pr-2">Acciones</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/40">
                        {productos.map((prod) => (
                          <tr key={prod.id} className="hover:bg-bg-surface-2/30 transition-colors">
                            <td className="py-3 pl-2">
                              {prod.url_imagen_retail ? (
                                <img
                                  src={prod.url_imagen_retail}
                                  alt={cleanText(prod.nombre)}
                                  className="w-8 h-8 rounded-lg object-cover bg-bg-surface-2"
                                />
                              ) : (
                                <div className="w-8 h-8 rounded-lg bg-bg-surface-2 flex items-center justify-center">
                                  <Package className="h-4 w-4 text-text-dim" />
                                </div>
                              )}
                            </td>
                            <td className="py-3 font-semibold text-text-primary">{cleanText(prod.nombre)}</td>
                            <td className="py-3">{cleanText(prod.formato_venta)}</td>
                            <td className="py-3 font-bold text-text-primary">${prod.precio.toLocaleString("es-CL")}</td>
                            <td className="py-3 text-text-dim">${prod.precio_costo.toLocaleString("es-CL")}</td>
                            <td className="py-3">
                              <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                                prod.categoria_logistica === "Pesado"
                                  ? "bg-accent/10 text-accent border border-accent/20"
                                  : "bg-brand/10 text-brand border border-brand/20"
                              }`}>
                                {cleanText(prod.categoria_logistica)}
                              </span>
                            </td>
                            <td className="py-3 text-center">
                              <button
                                onClick={() => handleToggleDisponibilidad(prod)}
                                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                                  prod.disponible ? "bg-brand animate-pulse-glow" : "bg-bg-app border-border"
                                }`}
                              >
                                <span
                                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                                    prod.disponible ? "translate-x-4" : "translate-x-0"
                                  }`}
                                />
                              </button>
                            </td>
                            <td className="py-3 text-right pr-2">
                              <button
                                onClick={() => handleOpenProductForm(prod)}
                                className="p-1.5 rounded-lg bg-bg-surface-2 border border-border text-text-secondary hover:text-brand hover:border-brand/40 transition-colors cursor-pointer inline-flex items-center justify-center"
                                title="Editar producto"
                              >
                                <Edit className="h-3.5 w-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ===== MODAL ENVIAR INVITACION ===== */}
      {showInviteModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 animate-fade-in">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => !sendingInvite && setShowInviteModal(false)}
          />

          {/* Modal Container */}
          <div className="relative bg-bg-surface border border-border rounded-2xl w-full max-w-md flex flex-col overflow-hidden shadow-2xl z-[9999]">
            {/* Header */}
            <div className="p-5 border-b border-border flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-text-primary flex items-center gap-2">
                  <MessageCircle className="h-5 w-5 text-green-500" />
                  Enviar Invitación Terreno
                </h2>
                <p className="text-xs text-text-dim mt-0.5">
                  Envía el link de registro a un prospecto por WhatsApp
                </p>
              </div>
              <button
                onClick={() => setShowInviteModal(false)}
                disabled={sendingInvite}
                className="p-1.5 rounded-lg bg-bg-surface-2 border border-border text-text-dim hover:text-text-primary transition-colors cursor-pointer disabled:opacity-50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSendInvitation} className="p-5 space-y-4">
              {inviteStatus && (
                <div
                  className={`p-3.5 rounded-xl text-sm font-semibold border ${
                    inviteStatus.success
                      ? "bg-green-500/10 border-green-500/30 text-green-400"
                      : "bg-red-500/10 border-red-500/30 text-red-400"
                  }`}
                >
                  {inviteStatus.message}
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-text-secondary uppercase tracking-wider mb-2">
                  Nombre del Almacenero / Contacto
                </label>
                <input
                  type="text"
                  placeholder="Ej: Héctor Gómez"
                  value={inviteForm.nombre}
                  onChange={(e) =>
                    setInviteForm({ ...inviteForm, nombre: e.target.value })
                  }
                  disabled={sendingInvite}
                  className="w-full bg-bg-surface-2 border-2 border-border focus:border-brand rounded-xl py-3 px-4 text-sm font-medium text-text-primary placeholder:text-text-dim outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-text-secondary uppercase tracking-wider mb-2">
                  Número de WhatsApp *
                </label>
                <div className="relative">
                  <Phone className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-text-dim" />
                  <input
                    type="tel"
                    required
                    placeholder="Ej: +56912345678"
                    value={inviteForm.whatsapp}
                    onChange={(e) =>
                      setInviteForm({ ...inviteForm, whatsapp: e.target.value })
                    }
                    disabled={sendingInvite}
                    className="w-full bg-bg-surface-2 border-2 border-border focus:border-brand rounded-xl py-3 pl-11 pr-4 text-sm font-medium text-text-primary placeholder:text-text-dim outline-none"
                  />
                </div>
                <span className="text-[10px] text-text-dim mt-1.5 block">
                  Puedes ingresarlo con o sin código de país (+569). Se formateará automáticamente.
                </span>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={sendingInvite}
                  className="w-full bg-brand hover:bg-brand-hover active:scale-[0.98] text-white font-bold py-3.5 rounded-xl text-sm flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
                >
                  {sendingInvite ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Enviando invitación...</span>
                    </>
                  ) : (
                    <>
                      <MessageCircle className="h-4 w-4" />
                      <span>Enviar Enlace por WhatsApp</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===== MODAL FORMULARIO PRODUCTO ===== */}
      {showProductForm && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            onClick={() => setShowProductForm(false)}
          />

          {/* Form container */}
          <div className="relative bg-bg-surface border border-border rounded-2xl w-full max-w-md p-6 shadow-2xl animate-scale-up z-[10000] max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setShowProductForm(false)}
              className="absolute top-4 right-4 text-text-dim hover:text-text-primary transition-colors cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>

            <h3 className="text-base font-bold text-text-primary mb-5 flex items-center gap-2">
              <Package className="h-4.5 w-4.5 text-brand" />
              {editingProducto ? "Editar Producto" : "Nuevo Producto"}
            </h3>

            <div className="space-y-4">
              {/* Nombre */}
              <div>
                <label className="block text-[10px] font-semibold text-text-dim uppercase tracking-wider mb-1">
                  Nombre del Producto *
                </label>
                <input
                  type="text"
                  value={productForm.nombre}
                  onChange={(e) => setProductForm({ ...productForm, nombre: e.target.value })}
                  placeholder="Ej: Harina sin Polvos 1kg"
                  className="w-full bg-bg-surface-2 border border-border rounded-xl px-3.5 py-2.5 text-xs text-text-primary placeholder:text-text-dim focus:border-brand/50 focus:outline-none transition-colors"
                />
              </div>

              {/* Formato */}
              <div>
                <label className="block text-[10px] font-semibold text-text-dim uppercase tracking-wider mb-1">
                  Formato de Venta *
                </label>
                <input
                  type="text"
                  value={productForm.formato_venta}
                  onChange={(e) => setProductForm({ ...productForm, formato_venta: e.target.value })}
                  placeholder="Ej: Bolsa 1u o Saco 25kg"
                  className="w-full bg-bg-surface-2 border border-border rounded-xl px-3.5 py-2.5 text-xs text-text-primary placeholder:text-text-dim focus:border-brand/50 focus:outline-none transition-colors"
                />
              </div>

              {/* Precios */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-semibold text-text-dim uppercase tracking-wider mb-1">
                    Precio Venta ($) *
                  </label>
                  <input
                    type="number"
                    value={productForm.precio}
                    onChange={(e) => setProductForm({ ...productForm, precio: e.target.value })}
                    placeholder="1200"
                    className="w-full bg-bg-surface-2 border border-border rounded-xl px-3.5 py-2.5 text-xs text-text-primary placeholder:text-text-dim focus:border-brand/50 focus:outline-none transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-text-dim uppercase tracking-wider mb-1">
                    Precio Costo ($) *
                  </label>
                  <input
                    type="number"
                    value={productForm.precio_costo}
                    onChange={(e) => setProductForm({ ...productForm, precio_costo: e.target.value })}
                    placeholder="1000"
                    className="w-full bg-bg-surface-2 border border-border rounded-xl px-3.5 py-2.5 text-xs text-text-primary placeholder:text-text-dim focus:border-brand/50 focus:outline-none transition-colors"
                  />
                </div>
              </div>

              {/* Categoría Logística */}
              <div>
                <label className="block text-[10px] font-semibold text-text-dim uppercase tracking-wider mb-1">
                  Categoría Logística
                </label>
                <div className="flex gap-2">
                  {["Estándar", "Pesado"].map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setProductForm({ ...productForm, categoria_logistica: cat })}
                      type="button"
                      className={`flex-1 py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                        productForm.categoria_logistica === cat
                          ? "bg-brand text-white border-transparent"
                          : "text-text-dim bg-bg-surface-2 border-border hover:border-white/10"
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              {/* Categoría de Negocio */}
              <div>
                <label className="block text-[10px] font-semibold text-text-dim uppercase tracking-wider mb-1">
                  Categoría Comercial
                </label>
                <select
                  value={productForm.categoria}
                  onChange={(e) => setProductForm({ ...productForm, categoria: e.target.value })}
                  className="w-full bg-bg-surface-2 border border-border rounded-xl px-3.5 py-2.5 text-xs text-text-primary focus:border-brand/50 focus:outline-none transition-colors cursor-pointer"
                >
                  {["Abarrotes", "Confites", "Limpieza", "Verdulería", "Bebidas"].map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              {/* Imagen URL */}
              <div>
                <label className="block text-[10px] font-semibold text-text-dim uppercase tracking-wider mb-1">
                  URL de Imagen (Opcional)
                </label>
                <input
                  type="text"
                  value={productForm.url_imagen_retail}
                  onChange={(e) => setProductForm({ ...productForm, url_imagen_retail: e.target.value })}
                  placeholder="https://..."
                  className="w-full bg-bg-surface-2 border border-border rounded-xl px-3.5 py-2.5 text-xs text-text-primary placeholder:text-text-dim focus:border-brand/50 focus:outline-none transition-colors"
                />
              </div>

              {/* Disponibilidad */}
              <div className="flex items-center justify-between bg-bg-surface-2 border border-border rounded-xl p-3.5">
                <div>
                  <span className="block text-xs font-bold text-text-primary">Disponible para Venta</span>
                  <span className="block text-[10px] text-text-dim">Habilita este producto en el catálogo</span>
                </div>
                <button
                  onClick={() => setProductForm({ ...productForm, disponible: !productForm.disponible })}
                  type="button"
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    productForm.disponible ? "bg-brand" : "bg-bg-app border-border"
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      productForm.disponible ? "translate-x-4" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>

              {/* Guardar */}
              <button
                onClick={handleGuardarProducto}
                disabled={saving || !productForm.nombre.trim() || !productForm.formato_venta.trim() || !productForm.precio || !productForm.precio_costo}
                className="w-full bg-brand hover:bg-brand-hover disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer mt-4 text-xs"
              >
                {saving ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Guardando...
                  </>
                ) : (
                  <>
                    <Save className="h-3.5 w-3.5" /> Guardar Producto
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== CUSTOM PIN PULSING AND SIDEBAR SLIDE STYLE ===== */}
      <style>{`
        @keyframes pulso-halo {
          0% {
            box-shadow: 0 0 0 0 rgba(249, 115, 22, 0.8);
          }
          70% {
            box-shadow: 0 0 0 12px rgba(249, 115, 22, 0);
          }
          100% {
            box-shadow: 0 0 0 0 rgba(249, 115, 22, 0);
          }
        }
        .pin-pulsante {
          animation: pulso-halo 1.6s infinite ease-in-out !important;
        }

        @keyframes slide-left {
          from {
            transform: translateX(100%);
          }
          to {
            transform: translateX(0);
          }
        }
        .animate-slide-left {
          animation: slide-left 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }

        @keyframes scale-up {
          from {
            opacity: 0;
            transform: scale(0.95);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
        .animate-scale-up {
          animation: scale-up 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
      `}</style>
    </div>
  );
}
