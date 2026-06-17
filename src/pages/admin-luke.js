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
  FileText,
  RefreshCw,
  Package,
  Edit,
  Trash,
  Bot,
  Users,
  Calendar,
  Clock,
  ClipboardList,
  CheckCircle,
  XCircle,
  AlertCircle,
  ShoppingCart,
  Truck,
  Menu,
} from "lucide-react";
import AdminAuthGuard from "@/components/AdminAuthGuard";

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
  const [showConsolidateModal, setShowConsolidateModal] = useState(false);
  const [consolidadoItems, setConsolidadoItems] = useState([]);
  const [loadingConsolidado, setLoadingConsolidado] = useState(false);
  const [proveedores, setProveedores] = useState([]);
  
  // Filtros, buscador y paginación para el catálogo
  const [filtroNombreSku, setFiltroNombreSku] = useState("");
  const [filtroCategoria, setFiltroCategoria] = useState("Todas");
  const [filtroBulto, setFiltroBulto] = useState("Todos");
  const [paginaActual, setPaginaActual] = useState(1);
  const itemsPorPagina = 10;

  const [productForm, setProductForm] = useState({
    nombre: "",
    formato_venta: "",
    precio: "",
    precio_costo: "",
    tipo_bulto: "Estándar",
    url_imagen_retail: "",
    disponible: true,
    categoria: "Abarrotes",
    sku: "",
    stock: 0,
    control_stock: true,
    codigo_barras: ""
  });
  const [scannerActivo, setScannerActivo] = useState(false);
  const html5QrCodeRef = useRef(null);
  const [clickCoords, setClickCoords] = useState(null);
  const [saving, setSaving] = useState(false);
  const [modoEdicion, setModoEdicion] = useState(false);
  const [modoCrear, setModoCrear] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef(null);
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

  // Invitación proactiva eliminada: se espera que el almacenero contacte primero a Jaime

  // Estados de ventanas de pedido
  const [ventanas, setVentanas] = useState([]);
  const [showVentanasModal, setShowVentanasModal] = useState(false);
  const [showVentanaForm, setShowVentanaForm] = useState(false);
  const [editingVentana, setEditingVentana] = useState(null);
  const [ventanaForm, setVentanaForm] = useState({
    nombre: "",
    fecha_cierre: "",
    fecha_entrega: "",
    activa: true
  });

  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const markersLayer = useRef(null);
  const supabase = createClient();

  const modoEdicionRef = useRef(modoEdicion);
  useEffect(() => {
    modoEdicionRef.current = modoEdicion;
  }, [modoEdicion]);

  const modoCrearRef = useRef(modoCrear);
  useEffect(() => {
    modoCrearRef.current = modoCrear;
  }, [modoCrear]);

  // Cerrar el menú desplegable al hacer clic fuera de él
  useEffect(() => {
    function handleClickOutside(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setShowMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

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
            estado,
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
        .eq("activo", true)
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

  const fetchVentanas = useCallback(async () => {
    try {
      const res = await fetch("/api/admin-ventanas", {
        headers: { "x-admin-secret": process.env.NEXT_PUBLIC_ADMIN_SECRET || "" }
      });
      const data = await res.json();
      if (data.success) {
        setVentanas(data.ventanas || []);
      }
    } catch (err) {
      console.error("[AdminLuke] Error cargando ventanas:", err);
    }
  }, []);

  const fetchProveedores = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("proveedores")
        .select("id, nombre")
        .order("nombre", { ascending: true });
      if (error) throw error;
      setProveedores(data || []);
    } catch (err) {
      console.error("[AdminLuke] Error cargando proveedores:", err);
    }
  }, [supabase]);

  useEffect(() => {
    fetchClientes();
    fetchVentanas();
    fetchProveedores();
  }, [fetchClientes, fetchVentanas, fetchProveedores]);

  useEffect(() => {
    setPaginaActual(1);
  }, [filtroNombreSku, filtroCategoria, filtroBulto]);

  const productosFiltrados = productos.filter((prod) => {
    const cumpleBusqueda = filtroNombreSku.trim() === "" || 
      cleanText(prod.nombre).toLowerCase().includes(filtroNombreSku.toLowerCase()) || 
      (prod.sku && prod.sku.toLowerCase().includes(filtroNombreSku.toLowerCase()));
    
    const cumpleCategoria = filtroCategoria === "Todas" || prod.categoria === filtroCategoria;
    
    const cumpleBulto = filtroBulto === "Todos" || prod.tipo_bulto === filtroBulto;
    
    return cumpleBusqueda && cumpleCategoria && cumpleBulto;
  });

  const totalPaginas = Math.ceil(productosFiltrados.length / itemsPorPagina) || 1;
  const indexUltimoItem = paginaActual * itemsPorPagina;
  const indexPrimerItem = indexUltimoItem - itemsPorPagina;
  const productosPaginados = productosFiltrados.slice(indexPrimerItem, indexUltimoItem);

  const fetchConsolidado = useCallback(async () => {
    setLoadingConsolidado(true);
    try {
      const res = await fetch("/api/admin-consolidar", {
        headers: { "x-admin-secret": process.env.NEXT_PUBLIC_ADMIN_SECRET || "" }
      });
      const data = await res.json();
      if (data.success) {
        setConsolidadoItems(data.items || []);
      }
    } catch (err) {
      console.error("[AdminLuke] Error cargando consolidado:", err);
    } finally {
      setLoadingConsolidado(false);
    }
  }, []);

  const handleActualizarItemConsolidado = async (productoId, accion) => {
    try {
      const res = await fetch("/api/admin-consolidar", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-secret": process.env.NEXT_PUBLIC_ADMIN_SECRET || ""
        },
        body: JSON.stringify({ producto_id: productoId, accion }),
      });
      const data = await res.json();
      if (data.success) {
        await fetchConsolidado();
        await fetchClientes();
      } else {
        alert(data.message || "Error al actualizar consolidado");
      }
    } catch (err) {
      console.error("[AdminLuke] Error al actualizar consolidado:", err);
      alert("Error de conexión al actualizar consolidado");
    }
  };

  useEffect(() => {
    if (showConsolidateModal) {
      fetchConsolidado();
    }
  }, [showConsolidateModal, fetchConsolidado]);

  const handleOpenVentanaForm = (ventana = null) => {
    if (ventana) {
      setEditingVentana(ventana);
      const fc = new Date(ventana.fecha_cierre);
      const fe = new Date(ventana.fecha_entrega);
      
      const toLocalISO = (d) => {
        const offset = d.getTimezoneOffset();
        const localDate = new Date(d.getTime() - (offset*60*1000));
        return localDate.toISOString().slice(0, 16);
      };

      setVentanaForm({
        nombre: ventana.nombre,
        fecha_cierre: toLocalISO(fc),
        fecha_entrega: toLocalISO(fe),
        activa: ventana.activa
      });
    } else {
      setEditingVentana(null);
      setVentanaForm({
        nombre: "",
        fecha_cierre: "",
        fecha_entrega: "",
        activa: true
      });
    }
    setShowVentanaForm(true);
  };

  const handleSaveVentana = async (e) => {
    e.preventDefault();
    if (!ventanaForm.nombre.trim() || !ventanaForm.fecha_cierre || !ventanaForm.fecha_entrega) return;
    
    setSaving(true);
    try {
      const method = editingVentana ? "PUT" : "POST";
      const payload = {
        ...ventanaForm,
        fecha_cierre: new Date(ventanaForm.fecha_cierre).toISOString(),
        fecha_entrega: new Date(ventanaForm.fecha_entrega).toISOString(),
      };
      if (editingVentana) {
        payload.id = editingVentana.id;
      }

      const res = await fetch("/api/admin-ventanas", {
        method,
        headers: {
          "Content-Type": "application/json",
          "x-admin-secret": process.env.NEXT_PUBLIC_ADMIN_SECRET || ""
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || "Error al guardar ventana");
      }

      setShowVentanaForm(false);
      await fetchVentanas();
    } catch (err) {
      console.error("[AdminLuke] Error guardando ventana:", err);
      alert(err.message || "Error al guardar la ventana.");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteVentana = async (id) => {
    if (!confirm("¿Estás seguro de que quieres eliminar esta ventana?")) return;
    try {
      const res = await fetch(`/api/admin-ventanas?id=${id}`, {
        method: "DELETE",
        headers: { "x-admin-secret": process.env.NEXT_PUBLIC_ADMIN_SECRET || "" }
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || "Error al eliminar la ventana");
      }
      await fetchVentanas();
    } catch (err) {
      console.error("[AdminLuke] Error eliminando ventana:", err);
      alert(err.message || "Error al eliminar. Revisa la consola.");
    }
  };

  const handleToggleActivaVentana = async (ventana) => {
    try {
      const res = await fetch("/api/admin-ventanas", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-admin-secret": process.env.NEXT_PUBLIC_ADMIN_SECRET || ""
        },
        body: JSON.stringify({
          id: ventana.id,
          nombre: ventana.nombre,
          fecha_cierre: ventana.fecha_cierre,
          fecha_entrega: ventana.fecha_entrega,
          activa: !ventana.activa
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || "Error al actualizar la ventana");
      }
      await fetchVentanas();
    } catch (err) {
      console.error("[AdminLuke] Error toggling ventana activa:", err);
      alert(err.message);
    }
  };


  // handleSendInvitation eliminado: flujo inbound only (almacenero escribe primero al bot Jaime)


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
      // Solo activo cuando modoCrearRef.current está encendido
      map.on("click", (e) => {
        if (modoEdicionRef.current) return;
        if (!modoCrearRef.current) return; // Requiere modo crear activo
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
        setModoCrear(false); // Desactivar modo crear al abrir el modal
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
      if (nuevoEstado === "Preparado") {
        const cantStr = window.prompt("¿En cuántos bultos/cajas físicas se enviará este pedido?", "1");
        if (cantStr === null) {
          setActualizandoPedidoId(null);
          return; // cancelado por el usuario
        }
        const cant = parseInt(cantStr);
        if (isNaN(cant) || cant <= 0) {
          alert("Cantidad de bultos inválida. Debe ser un número positivo.");
          setActualizandoPedidoId(null);
          return;
        }

        // Crear bultos en la base de datos
        const resBultos = await fetch("/api/bultos", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-admin-secret": process.env.NEXT_PUBLIC_ADMIN_SECRET || "",
          },
          body: JSON.stringify({
            accion: "crear",
            pedido_id: pedidoId,
            cantidad_bultos: cant,
          }),
        });
        const dataBultos = await resBultos.json();
        if (!dataBultos.success) {
          throw new Error(dataBultos.message || "Error al crear bultos");
        }
      }

      // Si el nuevo estado requiere notificación WA, usamos la API ruta-despacho
      // que actualiza el estado Y envía el mensaje al cliente
      if (nuevoEstado === "En Ruta" || nuevoEstado === "Entregado") {
        const res = await fetch("/api/ruta-despacho", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-admin-secret": process.env.NEXT_PUBLIC_ADMIN_SECRET || "",
          },
          body: JSON.stringify({ pedido_id: pedidoId, nuevo_estado: nuevoEstado }),
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error || "Error al actualizar estado.");
      } else {
        // Para otros estados (Pendiente, Preparado, Cancelado) actualizamos directo
        const { error } = await supabase
          .from("pedidos")
          .update({ estado: nuevoEstado })
          .eq("id", pedidoId);
        if (error) throw error;
      }

      // Volver a cargar clientes y pedidos para refrescar el mapa y el sidebar
      await fetchClientes();
    } catch (err) {
      console.error("[AdminLuke] Error actualizando estado de pedido:", err);
      alert("Error al actualizar el estado del pedido: " + err.message);
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

  // --- Soft Delete de Producto ---
  const handleSoftDeleteProducto = async (producto) => {
    const confirmacion = window.confirm(`¿Seguro que deseas eliminar "${producto.nombre}" del catálogo?`);
    if (!confirmacion) return;

    try {
      const { error } = await supabase
        .from("productos")
        .update({ activo: false })
        .eq("id", producto.id);

      if (error) throw error;
      
      // Refrescar datos
      await fetchClientes();
    } catch (err) {
      console.error("[AdminLuke] Error al eliminar producto:", err);
      alert("Error al eliminar el producto.");
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
        tipo_bulto: producto.tipo_bulto,
        url_imagen_retail: producto.url_imagen_retail || "",
        disponible: producto.disponible,
        categoria: producto.categoria || "Abarrotes",
        sku: producto.sku || "",
        stock: producto.stock || 0,
        control_stock: producto.control_stock !== false,
        codigo_barras: producto.codigo_barras || "",
        venta_multiplo: producto.venta_multiplo || 1,
        unidades_embalaje: producto.unidades_embalaje || "",
        precio_embalaje_unidad: producto.precio_embalaje_unidad || "",
        proveedor: producto.proveedor || ""
      });
    } else {
      setEditingProducto(null);
      setProductForm({
        nombre: "",
        formato_venta: "",
        precio: "",
        precio_costo: "",
        tipo_bulto: "Estándar",
        url_imagen_retail: "",
        disponible: true,
        categoria: "Abarrotes",
        sku: "",
        stock: 0,
        control_stock: true,
        codigo_barras: "",
        venta_multiplo: 1,
        unidades_embalaje: "",
        precio_embalaje_unidad: "",
        proveedor: ""
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
        tipo_bulto: productForm.tipo_bulto,
        url_imagen_retail: productForm.url_imagen_retail.trim() || null,
        disponible: productForm.disponible,
        categoria: productForm.categoria,
        sku: productForm.sku.trim() || "LD-" + Math.random().toString(36).substring(2, 7).toUpperCase(),
        stock: parseInt(productForm.stock) || 0,
        control_stock: productForm.control_stock,
        codigo_barras: productForm.codigo_barras.trim() || null,
        venta_multiplo: parseInt(productForm.venta_multiplo) || 1,
        unidades_embalaje: productForm.unidades_embalaje ? parseInt(productForm.unidades_embalaje) : null,
        precio_embalaje_unidad: productForm.precio_embalaje_unidad ? parseInt(productForm.precio_embalaje_unidad) : null,
        proveedor: productForm.proveedor.trim() || null
      };

      let idParaActualizar = null;
      const skuIngresado = productForm.sku.trim();
      const nombreIngresado = productForm.nombre.trim();
      const formatoIngresado = productForm.formato_venta.trim();

      if (!editingProducto) {
        // 1. Buscar por SKU
        if (skuIngresado) {
          const { data: porSku, error: errSku } = await supabase
            .from("productos")
            .select("id")
            .eq("sku", skuIngresado)
            .maybeSingle();

          if (porSku) {
            idParaActualizar = porSku.id;
          }
        }

        // 2. Si no se encontró por SKU, buscar por nombre y formato (activo = true primero)
        if (!idParaActualizar) {
          const { data: porNombre, error: errNombre } = await supabase
            .from("productos")
            .select("id")
            .ilike("nombre", nombreIngresado)
            .ilike("formato_venta", formatoIngresado)
            .order("activo", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (porNombre) {
            idParaActualizar = porNombre.id;
          }
        }
      }

      if (editingProducto || idParaActualizar) {
        // Actualizar
        const targetId = editingProducto ? editingProducto.id : idParaActualizar;
        
        // Obtener stock viejo para auditar diferencia
        const { data: prodViejo } = await supabase
          .from("productos")
          .select("stock")
          .eq("id", targetId)
          .maybeSingle();

        const { error } = await supabase
          .from("productos")
          .update({
            ...payload,
            activo: true, // Reactivar si estaba inactivo
            disponible: payload.stock > 0 || !payload.control_stock
          })
          .eq("id", targetId);

        if (error) throw error;

        if (prodViejo) {
          const diff = payload.stock - (prodViejo.stock || 0);
          if (diff !== 0) {
            await supabase.from("movimientos_stock").insert([{
              producto_id: targetId,
              cantidad: diff,
              tipo_movimiento: "ajuste_inventario",
              referencia_id: "ajuste_web_admin",
              usuario_creador: "web_admin"
            }]);
          }
        }

        if (idParaActualizar) {
          alert(`El producto "${nombreIngresado}" (${formatoIngresado}) o SKU "${skuIngresado || ''}" ya existía en el catálogo. Se actualizó el producto existente en lugar de crear uno nuevo.`);
        }
      } else {
        // Insertar nuevo
        const { data: prodsInsertados, error } = await supabase
          .from("productos")
          .insert(payload)
          .select();

        if (error) throw error;

        if (prodsInsertados && prodsInsertados.length > 0 && payload.stock > 0) {
          await supabase.from("movimientos_stock").insert([{
            producto_id: prodsInsertados[0].id,
            cantidad: payload.stock,
            tipo_movimiento: "ingreso_manual",
            referencia_id: "creacion_web_admin",
            usuario_creador: "web_admin"
          }]);
        }
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

  // --- Funciones para Lector de Código de Barras (Html5Qrcode) ---
  const iniciarScanner = async () => {
    setScannerActivo(true);
    
    // Cargar script dinámicamente si no existe
    if (!window.Html5Qrcode) {
      await new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "https://unpkg.com/html5-qrcode";
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
      });
    }

    setTimeout(async () => {
      try {
        const Lector = window.Html5Qrcode;
        if (!Lector) throw new Error("Html5Qrcode no se cargó correctamente.");
        
        const html5QrCode = new Lector("reader-prod");
        html5QrCodeRef.current = html5QrCode;
        
        await html5QrCode.start(
          { facingMode: "environment" },
          {
            fps: 10,
            qrbox: { width: 260, height: 140 }
          },
          (decodedText) => {
            setProductForm(prev => ({ ...prev, codigo_barras: decodedText }));
            detenerScanner();
          },
          () => {}
        );
      } catch (err) {
        console.error("Error iniciando lector por cámara:", err);
        alert("Permiso de cámara denegado o no disponible.");
        setScannerActivo(false);
      }
    }, 300);
  };

  const detenerScanner = async () => {
    if (html5QrCodeRef.current) {
      try {
        await html5QrCodeRef.current.stop();
      } catch (err) {
        console.error("Error al detener cámara:", err);
      }
      html5QrCodeRef.current = null;
    }
    setScannerActivo(false);
  };

  useEffect(() => {
    if (!showProductForm) {
      detenerScanner();
    }
  }, [showProductForm]);

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
    <AdminAuthGuard>
      <div className="h-screen w-screen flex flex-col bg-bg-app overflow-hidden">
      <Head>
        <title>Panel Admin | LukeDelivery</title>
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no"
        />
      </Head>

      {/* ===== TOP BAR ===== */}
      <header className="relative shrink-0 bg-bg-surface/95 backdrop-blur-lg border-b border-border px-4 py-3 flex items-center justify-between z-[9999]">
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
        </div>        <div className="flex items-center gap-2 relative">
          {/* Botón Refrescar (Siempre Visible) */}
          <button
            onClick={() => { setLoading(true); fetchClientes(); }}
            className="p-2 rounded-lg text-text-secondary hover:text-text-primary hover:bg-bg-surface-2 transition-colors cursor-pointer"
            title="Refrescar"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>

          {/* Botón Modo Crear Nuevo Almacén */}
          <button
            onClick={() => {
              setModoCrear(!modoCrear);
              if (modoEdicion) setModoEdicion(false); // mutuamente exclusivos
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer border ${
              modoCrear
                ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-400 shadow-lg shadow-emerald-500/10 animate-pulse"
                : "bg-bg-surface-2 border-border text-text-secondary hover:text-text-primary hover:border-white/10"
            }`}
            title={modoCrear ? "Haz clic en el mapa para posicionar el nuevo almacén" : "Crear nuevo almacén haciendo clic en el mapa"}
          >
            <Plus className="h-3.5 w-3.5" />
            <span className="hidden md:inline">{modoCrear ? "Clic en el mapa..." : "Nuevo Almacén"}</span>
            <span className="md:hidden">{modoCrear ? "Listo..." : "Nuevo"}</span>
            {modoCrear && <X className="h-3 w-3 ml-0.5 opacity-70" />}
          </button>

          {/* Menú Hamburguesa / Dropdown de Administración */}
          <div ref={menuRef} className="relative">
            <button
              onClick={() => setShowMenu(!showMenu)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer border ${
                showMenu
                  ? "bg-brand/20 border-brand/50 text-brand shadow-lg"
                  : "bg-bg-surface-2 border-border text-text-secondary hover:text-text-primary hover:border-white/10"
              }`}
              title="Menú de Administración"
            >
              <Menu className="h-4 w-4" />
              <span className="hidden sm:inline">Administrar</span>
            </button>

            {/* Dropdown Content */}
            {showMenu && (
              <div className="absolute right-0 mt-2 w-72 bg-bg-surface border border-border rounded-xl shadow-2xl p-4 z-[9999] flex flex-col gap-3 animate-fade-in backdrop-blur-xl">
                <div className="flex items-center justify-between border-b border-border pb-2">
                  <span className="text-xs font-black text-text-primary uppercase tracking-wider">
                    Módulos y Acciones
                  </span>
                  <div className="bg-brand/10 text-brand py-0.5 px-2 rounded-full text-[10px] font-bold">
                    {clientes.length} locales
                  </div>
                </div>

                {/* Ajustar Ubicación Switch */}
                <div className="flex items-center justify-between bg-bg-surface-2 border border-border px-3 py-2 rounded-lg">
                  <span className="text-[11px] font-bold text-text-secondary select-none">
                    Ajustar Ubicación
                  </span>
                  <button
                    onClick={() => {
                      setModoEdicion(!modoEdicion);
                      if (modoCrear) setModoCrear(false); // mutuamente exclusivos
                    }}
                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 ${
                      modoEdicion ? "bg-amber-500 shadow-md shadow-amber-500/20" : "bg-bg-app"
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                        modoEdicion ? "translate-x-4" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>

                {/* Módulos en lista limpia */}
                <div className="flex flex-col gap-1.5">
                  {/* Productos */}
                  <button
                    onClick={() => { setShowCatalogModal(true); setShowMenu(false); }}
                    className="flex items-center gap-2.5 w-full text-left px-3 py-2.5 rounded-lg text-xs font-bold transition-all text-text-secondary hover:text-text-primary hover:bg-bg-surface-2 hover:border-white/5 border border-transparent cursor-pointer"
                  >
                    <Package className="h-4 w-4 text-brand" />
                    <span>Catálogo de Productos</span>
                  </button>

                  {/* Consolidado */}
                  <button
                    onClick={() => { setShowConsolidateModal(true); setShowMenu(false); }}
                    className="flex items-center gap-2.5 w-full text-left px-3 py-2.5 rounded-lg text-xs font-bold transition-all text-text-secondary hover:text-text-primary hover:bg-bg-surface-2 hover:border-white/5 border border-transparent cursor-pointer"
                  >
                    <ClipboardList className="h-4 w-4 text-brand" />
                    <span>Consolidado de Compras</span>
                  </button>

                  {/* Ventanas de Pedido */}
                  <button
                    onClick={() => { setShowVentanasModal(true); setShowMenu(false); }}
                    className="flex items-center gap-2.5 w-full text-left px-3 py-2.5 rounded-lg text-xs font-bold transition-all text-text-secondary hover:text-text-primary hover:bg-bg-surface-2 hover:border-white/5 border border-transparent cursor-pointer"
                  >
                    <Calendar className="h-4 w-4 text-amber-500" />
                    <span>Ventanas de Pedido</span>
                  </button>

                  <div className="h-px bg-border my-1" />

                  {/* Lista de Compras (Terreno) */}
                  <button
                    onClick={() => { window.open('/compras', '_blank'); setShowMenu(false); }}
                    className="flex items-center gap-2.5 w-full text-left px-3 py-2.5 rounded-lg text-xs font-bold transition-all text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 cursor-pointer"
                  >
                    <ShoppingCart className="h-4 w-4" />
                    <span>Lista de Compras (Terreno)</span>
                  </button>

                  {/* Ruta del Día (Reparto) */}
                  <button
                    onClick={() => { window.open('/ruta', '_blank'); setShowMenu(false); }}
                    className="flex items-center gap-2.5 w-full text-left px-3 py-2.5 rounded-lg text-xs font-bold transition-all text-blue-400 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 cursor-pointer"
                  >
                    <Truck className="h-4 w-4" />
                    <span>Ruta del Día (Reparto)</span>
                  </button>

                  <div className="h-px bg-border my-1" />

                  {/* Configurar Bot */}
                  <button
                    onClick={() => { window.location.href = '/admin-bot'; setShowMenu(false); }}
                    className="flex items-center gap-2.5 w-full text-left px-3 py-2.5 rounded-lg text-xs font-bold transition-all text-text-secondary hover:text-text-primary hover:bg-bg-surface-2 hover:border-white/5 border border-transparent cursor-pointer"
                  >
                    <Bot className="h-4 w-4 text-blue-400" />
                    <span>Configurar Bot de WhatsApp</span>
                  </button>

                  {/* Gestionar Personal */}
                  <button
                    onClick={() => { window.location.href = '/admin-trabajadores'; setShowMenu(false); }}
                    className="flex items-center gap-2.5 w-full text-left px-3 py-2.5 rounded-lg text-xs font-bold transition-all text-text-secondary hover:text-text-primary hover:bg-bg-surface-2 hover:border-white/5 border border-transparent cursor-pointer"
                  >
                    <Users className="h-4 w-4 text-emerald-400" />
                    <span>Gestionar Personal</span>
                  </button>

                  {/* Gestionar Proveedores */}
                  <button
                    onClick={() => { window.location.href = '/admin-proveedores'; setShowMenu(false); }}
                    className="flex items-center gap-2.5 w-full text-left px-3 py-2.5 rounded-lg text-xs font-bold transition-all text-text-secondary hover:text-text-primary hover:bg-bg-surface-2 hover:border-white/5 border border-transparent cursor-pointer"
                  >
                    <Truck className="h-4 w-4 text-emerald-400" />
                    <span>Gestionar Proveedores</span>
                  </button>
                </div>

                {/* Leyenda de prioridad dentro del menú */}
                <div className="flex flex-col gap-2 border-t border-border pt-3 mt-1">
                  <span className="text-[10px] font-black text-text-dim uppercase tracking-wider">
                    Leyenda de Prioridad
                  </span>
                  <div className="flex items-center gap-3 text-[10px] text-text-secondary">
                    {Object.entries(PRIORIDAD_COLORES).map(([label, color]) => (
                      <div key={label} className="flex items-center gap-1">
                        <div
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ background: color }}
                        />
                        {label}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ===== MAP ===== */}
      <div className="flex-1 relative">
        <div ref={mapRef} className="h-full w-full" />

        {/* Hint overlay - cambia según modo activo */}
        <div className="absolute bottom-5 left-1/2 -translate-x-1/2 bg-bg-surface/90 backdrop-blur-md border border-border rounded-full py-2 px-4 text-xs z-20 pointer-events-none flex items-center gap-1.5">
          {modoCrear ? (
            <>
              <MapPin className="h-3 w-3 text-emerald-400 animate-bounce" />
              <span className="text-emerald-400 font-bold">Haz clic en el mapa para posicionar el nuevo almacén</span>
            </>
          ) : modoEdicion ? (
            <>
              <MapPin className="h-3 w-3 text-amber-400" />
              <span className="text-amber-400 font-semibold">Modo Ajuste: arrastra los pines para reubicar almacenes</span>
            </>
          ) : (
            <>
              <Plus className="h-3 w-3 text-text-secondary" />
              <span className="text-text-secondary">Activa "Nuevo Almacén" para agregar un local en el mapa</span>
            </>
          )}
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
                          {p.items_pedido?.map((item) => {
                            const isConseguido = item.estado === 'conseguido';
                            const isAgotado = item.estado === 'no_disponible';
                            return (
                              <div key={item.id} className="flex justify-between items-center text-xs py-1 border-b border-border/10 last:border-0">
                                <div className="flex-1 min-w-0 pr-3">
                                  <span className={`text-text-secondary ${isAgotado ? 'line-through opacity-40' : ''}`}>
                                    {item.cantidad}x {item.productos?.nombre || "Producto"}
                                  </span>
                                  <span className="text-[9px] text-text-dim block">
                                    {item.productos?.formato_venta}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider ${
                                    isConseguido 
                                      ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" 
                                      : isAgotado 
                                      ? "bg-red-500/10 text-red-400 border border-red-500/20" 
                                      : "bg-slate-500/10 text-slate-400 border border-slate-500/20"
                                  }`}>
                                    {item.estado}
                                  </span>
                                  <span className={`font-semibold ${isAgotado ? 'line-through text-text-dim text-[11px]' : 'text-text-primary'}`}>
                                    ${item.total_item.toLocaleString("es-CL")}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
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

                        {/* Trazabilidad de Bultos */}
                        {(p.estado === "Preparado" || p.estado === "En Ruta" || p.estado === "Entregado") && (
                          <div className="mt-3.5 pt-3 border-t border-border/50 flex items-center justify-between">
                            <span className="text-[9px] text-text-dim font-bold uppercase tracking-wider">Trazabilidad de Bultos</span>
                            <button
                              onClick={() => window.open(`/admin-etiquetas?pedido_id=${p.id}`, "_blank")}
                              className="inline-flex items-center gap-1.5 bg-amber-500/10 hover:bg-amber-500 border border-amber-500/20 hover:border-transparent text-amber-400 hover:text-white font-bold text-[9px] px-3 py-1.5 rounded-lg transition-all duration-200 cursor-pointer"
                            >
                              <span>🖨️ Imprimir Etiquetas</span>
                            </button>
                          </div>
                        )}

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
          <div className="relative bg-bg-surface border-2 border-border rounded-2xl w-full sm:max-w-5xl max-h-[90vh] sm:max-h-[85vh] flex flex-col overflow-hidden shadow-2xl animate-fade-in z-[9999]">
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

            {/* Filtros y Buscador */}
            <div className="bg-bg-surface-2 border-b border-border p-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Buscador */}
              <div>
                <label className="block text-[9px] font-bold text-text-dim uppercase mb-1">Buscar Producto o SKU</label>
                <input
                  type="text"
                  value={filtroNombreSku}
                  onChange={(e) => setFiltroNombreSku(e.target.value)}
                  placeholder="Ej: Harina o LD-00001"
                  className="w-full bg-bg-surface border border-border rounded-xl px-3 py-2 text-xs text-text-primary placeholder:text-text-dim focus:outline-none focus:border-brand/40"
                />
              </div>

              {/* Categoría Comercial */}
              <div>
                <label className="block text-[9px] font-bold text-text-dim uppercase mb-1">Filtrar por Categoría</label>
                <select
                  value={filtroCategoria}
                  onChange={(e) => setFiltroCategoria(e.target.value)}
                  className="w-full bg-bg-surface border border-border rounded-xl px-3 py-2 text-xs text-text-primary focus:outline-none focus:border-brand/40 cursor-pointer"
                >
                  <option value="Todas">Todas las Categorías</option>
                  {["Abarrotes", "Confites", "Limpieza", "Verdulería", "Bebidas"].map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              {/* Tipo de Bulto */}
              <div>
                <label className="block text-[9px] font-bold text-text-dim uppercase mb-1">Filtrar por Tipo de Bulto</label>
                <select
                  value={filtroBulto}
                  onChange={(e) => setFiltroBulto(e.target.value)}
                  className="w-full bg-bg-surface border border-border rounded-xl px-3 py-2 text-xs text-text-primary focus:outline-none focus:border-brand/40 cursor-pointer"
                >
                  <option value="Todos">Todos los Pesos</option>
                  <option value="Estándar">Estándar</option>
                  <option value="Pesado">Pesado</option>
                </select>
              </div>
            </div>

            {/* Product List */}
            <div className="flex-1 overflow-y-auto p-5">
              {productosFiltrados.length === 0 ? (
                <div className="h-48 flex flex-col items-center justify-center text-center text-text-dim">
                  <Package className="h-10 w-10 text-border mb-2 stroke-[1.5]" />
                  <p className="text-sm font-semibold">No se encontraron productos</p>
                  <p className="text-xs mt-0.5">Ajusta los filtros o crea un nuevo producto.</p>
                </div>
              ) : (
                <>
                  {/* Vista Mobile: Lista de Tarjetas (Cards) */}
                  <div className="block md:hidden space-y-3">
                    {productosPaginados.map((prod) => (
                      <div key={prod.id} className="bg-bg-surface-2 border border-border/60 rounded-2xl p-4 flex flex-col gap-3">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 rounded-xl overflow-hidden bg-bg-surface-3 flex items-center justify-center shrink-0 border border-border">
                            {prod.url_imagen_retail ? (
                              <img
                                src={prod.url_imagen_retail}
                                alt={cleanText(prod.nombre)}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <Package className="h-6 w-6 text-text-dim" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 className="font-bold text-sm text-text-primary truncate">{cleanText(prod.nombre)}</h4>
                            <p className="text-xs text-text-dim">{cleanText(prod.formato_venta)} {prod.sku && `· ${prod.sku}`}</p>
                            {prod.venta_multiplo > 1 && (
                              <span className="text-[10px] text-brand block mt-0.5 font-bold">Pack Mínimo: {prod.venta_multiplo}u</span>
                            )}
                            {prod.unidades_embalaje && (
                              <span className="text-[10px] text-emerald-400 block mt-0.5 font-bold">Caja: {prod.unidades_embalaje}u (${prod.precio_embalaje_unidad || prod.precio}/u)</span>
                            )}
                            {prod.proveedor && (
                              <span className="text-[10px] text-amber-500 block mt-0.5 font-bold">Proveedor: {cleanText(prod.proveedor)}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              onClick={() => handleOpenProductForm(prod)}
                              className="p-2 rounded-xl bg-bg-surface border border-border text-text-secondary hover:text-brand hover:border-brand/40 transition-colors cursor-pointer inline-flex items-center justify-center"
                              title="Editar producto"
                            >
                              <Edit className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => handleSoftDeleteProducto(prod)}
                              className="p-2 rounded-xl bg-bg-surface border border-border text-red-400 hover:text-red-300 hover:border-red-500/40 transition-colors cursor-pointer inline-flex items-center justify-center"
                              title="Eliminar producto"
                            >
                              <Trash className="h-4 w-4" />
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
                              prod.tipo_bulto === "Pesado"
                                ? "bg-accent/10 text-accent border border-accent/20"
                                : "bg-brand/10 text-brand border border-brand/20"
                            }`}>
                              {cleanText(prod.tipo_bulto)}
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
                    <table className="w-full text-left text-xs text-text-secondary border-collapse table-fixed">
                      <thead>
                        <tr className="border-b border-border text-text-dim uppercase tracking-wider text-[9px] font-bold">
                          <th className="pb-3 pl-2 w-14">Imagen</th>
                          <th className="pb-3 w-[12%]">SKU</th>
                          <th className="pb-3 w-[30%]">Nombre</th>
                          <th className="pb-3 w-[15%]">Formato</th>
                          <th className="pb-3 w-24">Precio Venta</th>
                          <th className="pb-3 w-24">Costo</th>
                          <th className="pb-3 w-28">Categoría</th>
                          <th className="pb-3 w-24 text-center">Disponible</th>
                          <th className="pb-3 w-24 text-right pr-2">Acciones</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/40">
                        {productosPaginados.map((prod) => (
                          <tr key={prod.id} className="hover:bg-bg-surface-2/30 transition-colors">
                            <td className="py-3 pl-2">
                              <div className="w-10 h-10 rounded-xl overflow-hidden bg-bg-surface-2 border border-border flex items-center justify-center shrink-0">
                                {prod.url_imagen_retail ? (
                                  <img
                                    src={prod.url_imagen_retail}
                                    alt={cleanText(prod.nombre)}
                                    className="w-full h-full object-cover"
                                  />
                                ) : (
                                  <Package className="h-5 w-5 text-text-dim" />
                                )}
                              </div>
                            </td>
                            <td className="py-3 font-mono text-[10px] text-text-dim">{prod.sku || "-"}</td>
                            <td className="py-3 font-semibold text-text-primary pr-3 leading-relaxed break-words">{cleanText(prod.nombre)}</td>
                            <td className="py-3 pr-3 font-medium text-text-secondary break-words">
                               {cleanText(prod.formato_venta)}
                               {(prod.venta_multiplo > 1 || prod.unidades_embalaje || prod.proveedor) && (
                                 <div className="text-[10px] text-text-dim mt-0.5 font-bold space-y-0.5">
                                   {prod.venta_multiplo > 1 && <div>Pack: {prod.venta_multiplo}u</div>}
                                   {prod.unidades_embalaje && <div className="text-emerald-400">Caja: {prod.unidades_embalaje}u (${prod.precio_embalaje_unidad || prod.precio}/u)</div>}
                                   {prod.proveedor && <div className="text-amber-500 font-extrabold">Prov: {cleanText(prod.proveedor)}</div>}
                                 </div>
                               )}
                            </td>
                            <td className="py-3 font-bold text-text-primary">${prod.precio.toLocaleString("es-CL")}</td>
                            <td className="py-3 text-text-dim">${prod.precio_costo.toLocaleString("es-CL")}</td>
                            <td className="py-3">
                              <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                                prod.tipo_bulto === "Pesado"
                                  ? "bg-accent/10 text-accent border border-accent/20"
                                  : "bg-brand/10 text-brand border border-brand/20"
                              }`}>
                                {cleanText(prod.tipo_bulto)}
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
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  onClick={() => handleOpenProductForm(prod)}
                                  className="p-1.5 rounded-lg bg-bg-surface border border-border text-text-secondary hover:text-brand hover:border-brand/40 transition-colors cursor-pointer inline-flex items-center justify-center"
                                  title="Editar producto"
                                >
                                  <Edit className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  onClick={() => handleSoftDeleteProducto(prod)}
                                  className="p-1.5 rounded-lg bg-bg-surface border border-border text-red-400 hover:text-red-300 hover:border-red-500/40 transition-colors cursor-pointer inline-flex items-center justify-center"
                                  title="Eliminar producto"
                                >
                                  <Trash className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Paginación */}
                  {totalPaginas > 1 && (
                    <div className="flex items-center justify-between border-t border-border/40 pt-4 mt-4 px-2 text-xs">
                      <span className="text-text-dim">
                        Mostrando productos {indexPrimerItem + 1} - {Math.min(indexUltimoItem, productosFiltrados.length)} de {productosFiltrados.length}
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setPaginaActual(p => Math.max(1, p - 1))}
                          disabled={paginaActual === 1}
                          className={`px-3 py-1.5 rounded-lg border text-[11px] font-bold transition-all cursor-pointer ${
                            paginaActual === 1
                              ? "bg-bg-surface border-border/30 text-text-dim cursor-not-allowed"
                              : "bg-bg-surface-2 border-border text-text-secondary hover:text-text-primary hover:border-white/10"
                          }`}
                        >
                          Anterior
                        </button>
                        <span className="text-text-secondary font-semibold">
                          Página {paginaActual} de {totalPaginas}
                        </span>
                        <button
                          onClick={() => setPaginaActual(p => Math.min(totalPaginas, p + 1))}
                          disabled={paginaActual === totalPaginas}
                          className={`px-3 py-1.5 rounded-lg border text-[11px] font-bold transition-all cursor-pointer ${
                            paginaActual === totalPaginas
                              ? "bg-bg-surface border-border/30 text-text-dim cursor-not-allowed"
                              : "bg-bg-surface-2 border-border text-text-secondary hover:text-text-primary hover:border-white/10"
                          }`}
                        >
                          Siguiente
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ===== MODAL GESTION CONSOLIDADO DE COMPRAS ===== */}
      {showConsolidateModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setShowConsolidateModal(false)}
          />

          {/* Modal Container */}
          <div className="relative bg-bg-surface border-2 border-border rounded-2xl w-full sm:max-w-3xl max-h-[90vh] sm:max-h-[80vh] flex flex-col overflow-hidden shadow-2xl animate-fade-in z-[9999]">
            {/* Header */}
            <div className="p-5 border-b border-border flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-text-primary flex items-center gap-2">
                  <ClipboardList className="h-5 w-5 text-brand" />
                  Consolidado de Compras (Furgón)
                </h2>
                <p className="text-xs text-text-dim mt-0.5">
                  Mercadería acumulada de los pedidos pendientes en la ventana de entrega activa
                </p>
              </div>
              <button
                onClick={() => setShowConsolidateModal(false)}
                className="p-1.5 rounded-lg bg-bg-surface-2 border border-border text-text-dim hover:text-text-primary transition-colors cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Content list */}
            <div className="flex-grow overflow-y-auto p-5">
              {loadingConsolidado ? (
                <div className="h-48 flex flex-col items-center justify-center gap-3">
                  <Loader2 className="h-8 w-8 animate-spin text-brand" />
                  <p className="text-xs text-text-dim font-semibold">Generando gran pedido consolidado...</p>
                </div>
              ) : consolidadoItems.length === 0 ? (
                <div className="h-48 flex flex-col items-center justify-center text-center text-text-dim gap-2.5">
                  <CheckCircle className="h-10 w-10 text-emerald-500/20 stroke-[1.5]" />
                  <p className="text-sm font-semibold">¡Nada pendiente por comprar!</p>
                  <p className="text-xs max-w-xs leading-relaxed">
                    No hay ítems en estado "pendiente" en los pedidos de la ventana activa, o la toma de pedidos está cerrada.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-border text-text-dim uppercase tracking-wider text-[9px] font-bold">
                        <th className="pb-3">Producto</th>
                        <th className="pb-3">Formato</th>
                        <th className="pb-3 text-center">Cantidad Total Requerida</th>
                        <th className="pb-3 text-right pr-2">Acciones de Compra</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40">
                      {consolidadoItems.map((item) => (
                        <tr key={item.producto_id} className="hover:bg-bg-surface-2/20 transition-colors">
                          <td className="py-4 font-bold text-text-primary text-sm">
                            {cleanText(item.nombre)}
                          </td>
                          <td className="py-4 font-medium text-text-secondary">
                            {cleanText(item.formato_venta)}
                          </td>
                          <td className="py-4 text-center font-black text-base text-brand">
                            {item.cantidad_total} unidades
                          </td>
                          <td className="py-4 text-right pr-2">
                            <div className="flex items-center justify-end gap-2.5">
                              <button
                                onClick={() => handleActualizarItemConsolidado(item.producto_id, "conseguido")}
                                className="inline-flex items-center gap-1.5 bg-emerald-500/10 hover:bg-emerald-500 border border-emerald-500/20 hover:border-transparent text-emerald-400 hover:text-white font-bold text-xs px-3.5 py-2 rounded-xl transition duration-200 cursor-pointer"
                                title="Marcar como conseguido"
                              >
                                <CheckCircle className="w-4 h-4 shrink-0" />
                                <span>Conseguido</span>
                              </button>
                              <button
                                onClick={() => handleActualizarItemConsolidado(item.producto_id, "no_disponible")}
                                className="inline-flex items-center gap-1.5 bg-red-500/10 hover:bg-red-500 border border-red-500/20 hover:border-transparent text-red-400 hover:text-white font-bold text-xs px-3.5 py-2 rounded-xl transition duration-200 cursor-pointer"
                                title="Marcar como sin stock/agotado"
                              >
                                <XCircle className="w-4 h-4 shrink-0" />
                                <span>Agotado</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 bg-bg-surface-2 border-t border-border flex items-center gap-2 text-xs text-text-dim">
              <AlertCircle className="w-4 h-4 text-brand shrink-0" />
              <span>Marcar un producto actualizará automáticamente el estado en cada pedido individual de los clientes.</span>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Invitación eliminado: flujo inbound only */}

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

              {/* SKU */}
              <div>
                <label className="block text-[10px] font-semibold text-text-dim uppercase tracking-wider mb-1">
                  SKU (Código Único - Opcional)
                </label>
                <input
                  type="text"
                  value={productForm.sku}
                  onChange={(e) => setProductForm({ ...productForm, sku: e.target.value })}
                  placeholder="Ej: LD-00013 (Dejar vacío para autogenerar)"
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

              {/* Configuración de Packs y Cajas */}
              <div className="border border-border/40 bg-bg-surface-2/20 p-3.5 rounded-xl space-y-3">
                <span className="block text-[10px] font-black text-text-dim uppercase tracking-wider">
                  Configuración de Packs y Cajas
                </span>
                
                <div>
                  <label className="block text-[9px] font-bold text-text-dim uppercase mb-1">
                    Múltiplo de Venta Minorista (Pack Mínimo)
                  </label>
                  <input
                    type="number"
                    value={productForm.venta_multiplo}
                    onChange={(e) => setProductForm({ ...productForm, venta_multiplo: e.target.value })}
                    placeholder="Ej: 12 (1 para venta por unidades)"
                    className="w-full bg-bg-surface-2 border border-border rounded-xl px-3.5 py-2.5 text-xs text-text-primary placeholder:text-text-dim focus:border-brand/50 focus:outline-none transition-colors"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[9px] font-bold text-text-dim uppercase mb-1">
                      Unidades por Caja
                    </label>
                    <input
                      type="number"
                      value={productForm.unidades_embalaje}
                      onChange={(e) => setProductForm({ ...productForm, unidades_embalaje: e.target.value })}
                      placeholder="Ej: 80"
                      className="w-full bg-bg-surface-2 border border-border rounded-xl px-3.5 py-2.5 text-xs text-text-primary placeholder:text-text-dim focus:border-brand/50 focus:outline-none transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-[9px] font-bold text-text-dim uppercase mb-1">
                      P. Unitario Caja ($)
                    </label>
                    <input
                      type="number"
                      value={productForm.precio_embalaje_unidad}
                      onChange={(e) => setProductForm({ ...productForm, precio_embalaje_unidad: e.target.value })}
                      placeholder="Ej: 1800"
                      className="w-full bg-bg-surface-2 border border-border rounded-xl px-3.5 py-2.5 text-xs text-text-primary placeholder:text-text-dim focus:border-brand/50 focus:outline-none transition-colors"
                    />
                  </div>
                </div>
              </div>

              {/* Tipo de Bulto */}
              <div>
                <label className="block text-[10px] font-semibold text-text-dim uppercase tracking-wider mb-1">
                  Tipo de Bulto (Peso)
                </label>
                <div className="flex gap-2">
                  {["Estándar", "Pesado"].map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setProductForm({ ...productForm, tipo_bulto: cat })}
                      type="button"
                      className={`flex-1 py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                        productForm.tipo_bulto === cat
                          ? "bg-brand text-white border-transparent"
                          : "text-text-dim bg-bg-surface-2 border-border hover:border-white/10"
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              {/* Categoría y Proveedor */}
              <div className="grid grid-cols-2 gap-3">
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
                <div>
                  <label className="block text-[10px] font-semibold text-text-dim uppercase tracking-wider mb-1">
                    Proveedor (Opcional)
                  </label>
                  <select
                    value={productForm.proveedor}
                    onChange={(e) => setProductForm({ ...productForm, proveedor: e.target.value })}
                    className="w-full bg-bg-surface-2 border border-border rounded-xl px-3.5 py-2.5 text-xs text-text-primary focus:border-brand/50 focus:outline-none transition-colors cursor-pointer"
                  >
                    <option value="">Sin proveedor</option>
                    {proveedores.map((prov) => (
                      <option key={prov.id} value={prov.nombre}>
                        {prov.nombre}
                      </option>
                    ))}
                  </select>
                </div>
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

              {/* Stock e Inventario */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-semibold text-text-dim uppercase tracking-wider mb-1">
                    Stock Inicial / Actual
                  </label>
                  <input
                    type="number"
                    value={productForm.stock}
                    onChange={(e) => setProductForm({ ...productForm, stock: e.target.value })}
                    placeholder="0"
                    className="w-full bg-bg-surface-2 border border-border rounded-xl px-3.5 py-2.5 text-xs text-text-primary placeholder:text-text-dim focus:border-brand/50 focus:outline-none transition-colors"
                  />
                </div>
                <div className="flex flex-col justify-end">
                  <div className="flex items-center justify-between bg-bg-surface-2 border border-border rounded-xl px-3.5 py-2.5 h-[38px]">
                    <span className="text-[10px] font-semibold text-text-dim uppercase">Controlar Stock</span>
                    <button
                      onClick={() => setProductForm({ ...productForm, control_stock: !productForm.control_stock })}
                      type="button"
                      className={`relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        productForm.control_stock ? "bg-brand" : "bg-bg-app border-border"
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                          productForm.control_stock ? "translate-x-3" : "translate-x-0"
                         }`}
                      />
                    </button>
                  </div>
                </div>
              </div>

              {/* Código de Barras y Lector */}
              <div>
                <label className="block text-[10px] font-semibold text-text-dim uppercase tracking-wider mb-1">
                  Código de Barras (Opcional)
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={productForm.codigo_barras}
                    onChange={(e) => setProductForm({ ...productForm, codigo_barras: e.target.value })}
                    placeholder="Ej: 7801234567890"
                    className="flex-1 bg-bg-surface-2 border border-border rounded-xl px-3.5 py-2.5 text-xs text-text-primary placeholder:text-text-dim focus:border-brand/50 focus:outline-none transition-colors"
                  />
                  <button
                    onClick={scannerActivo ? detenerScanner : iniciarScanner}
                    type="button"
                    className={`px-3 rounded-xl text-xs font-bold transition-all cursor-pointer border flex items-center justify-center gap-1.5 ${
                      scannerActivo
                        ? "bg-red-500/10 hover:bg-red-500/20 text-red-500 border-red-500/20"
                        : "bg-brand/10 hover:bg-brand/20 text-brand border-brand/20"
                    }`}
                  >
                    {scannerActivo ? "Apagar" : "📷 Escanear"}
                  </button>
                </div>
                {scannerActivo && (
                  <div className="mt-2.5 border border-border rounded-xl overflow-hidden bg-black relative">
                    <div id="reader-prod" className="w-full"></div>
                    <p className="text-[10px] text-center text-text-dim py-1">Apunta la cámara trasera al código de barras</p>
                  </div>
                )}
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

      {/* ===== MODAL GESTION VENTANAS ===== */}
      {showVentanasModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setShowVentanasModal(false)}
          />
          <div className="relative bg-bg-surface border-2 border-border rounded-2xl w-full sm:max-w-3xl max-h-[90vh] sm:max-h-[80vh] flex flex-col overflow-hidden shadow-2xl animate-fade-in z-[9999]">
            <div className="p-5 border-b border-border flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-text-primary flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-amber-500" />
                  Ventanas de Pedido B2B
                </h2>
                <p className="text-xs text-text-dim mt-0.5">
                  Programa los cierres de toma de pedidos y estimación automática de llegada
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => handleOpenVentanaForm(null)}
                  className="bg-brand hover:bg-brand-hover text-white text-xs font-bold px-3.5 py-2 rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Nueva Ventana</span>
                </button>
                <button
                  onClick={() => setShowVentanasModal(false)}
                  className="p-1.5 rounded-lg bg-bg-surface-2 border border-border text-text-dim hover:text-text-primary transition-colors cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              {ventanas.length === 0 ? (
                <div className="h-48 flex flex-col items-center justify-center text-center text-text-dim">
                  <Calendar className="h-10 w-10 text-border mb-2 stroke-[1.5]" />
                  <p className="text-sm font-semibold">No hay ventanas programadas</p>
                  <p className="text-xs mt-0.5">Haz clic en "Nueva Ventana" para crear la primera.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-text-secondary border-collapse">
                    <thead>
                      <tr className="border-b border-border text-text-dim uppercase tracking-wider text-[9px] font-bold">
                        <th className="pb-3 pl-2">Nombre</th>
                        <th className="pb-3">Cierre Pedidos</th>
                        <th className="pb-3">Entrega Despacho</th>
                        <th className="pb-3 text-center">Estado</th>
                        <th className="pb-3 text-right pr-2">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40">
                      {ventanas.map((v) => {
                        const esCerrada = new Date(v.fecha_cierre) <= new Date();
                        return (
                          <tr key={v.id} className="hover:bg-bg-surface-2/30 transition-colors">
                            <td className="py-3 pl-2 font-semibold text-text-primary">{v.nombre}</td>
                            <td className="py-3 text-text-secondary">
                              {new Date(v.fecha_cierre).toLocaleString("es-CL", {
                                dateStyle: "short",
                                timeStyle: "short",
                              })}
                            </td>
                            <td className="py-3 text-text-secondary">
                              {new Date(v.fecha_entrega).toLocaleString("es-CL", {
                                dateStyle: "short",
                                timeStyle: "short",
                              })}
                            </td>
                            <td className="py-3 text-center">
                              <button
                                onClick={() => handleToggleActivaVentana(v)}
                                className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                                  v.activa && !esCerrada
                                    ? "bg-green-500/10 text-green-400 border border-green-500/20"
                                    : "bg-red-500/10 text-red-400 border border-red-500/20"
                                }`}
                              >
                                {v.activa && !esCerrada ? "Activa" : esCerrada ? "Cerrada" : "Inactiva"}
                              </button>
                            </td>
                            <td className="py-3 text-right pr-2">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  onClick={() => handleOpenVentanaForm(v)}
                                  className="p-1.5 rounded-lg bg-bg-surface border border-border text-text-secondary hover:text-brand hover:border-brand/40 transition-colors cursor-pointer inline-flex items-center justify-center"
                                  title="Editar ventana"
                                >
                                  <Edit className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  onClick={() => handleDeleteVentana(v.id)}
                                  className="p-1.5 rounded-lg bg-bg-surface border border-border text-red-400 hover:text-red-300 hover:border-red-500/40 transition-colors cursor-pointer inline-flex items-center justify-center"
                                  title="Eliminar ventana"
                                >
                                  <Trash className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ===== MODAL FORMULARIO VENTANA ===== */}
      {showVentanaForm && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/85 backdrop-blur-sm"
            onClick={() => !saving && setShowVentanaForm(false)}
          />
          <div className="relative bg-bg-surface border border-border rounded-2xl w-full max-w-md p-6 shadow-2xl animate-scale-up z-[10000]">
            <button
              onClick={() => setShowVentanaForm(false)}
              disabled={saving}
              className="absolute top-4 right-4 text-text-dim hover:text-text-primary transition-colors cursor-pointer disabled:opacity-50"
            >
              <X className="h-4 w-4" />
            </button>

            <h3 className="text-base font-bold text-text-primary mb-5 flex items-center gap-2">
              <Calendar className="h-4.5 w-4.5 text-brand" />
              {editingVentana ? "Editar Ventana" : "Nueva Ventana de Pedido"}
            </h3>

            <form onSubmit={handleSaveVentana} className="space-y-4">
              <div>
                <label className="block text-[10px] font-semibold text-text-dim uppercase tracking-wider mb-1">
                  Nombre descriptivo *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Despacho Viernes Mañana"
                  value={ventanaForm.nombre}
                  onChange={(e) => setVentanaForm({ ...ventanaForm, nombre: e.target.value })}
                  className="w-full bg-bg-surface-2 border border-border rounded-xl px-3.5 py-2.5 text-xs text-text-primary placeholder:text-text-dim focus:border-brand/50 focus:outline-none transition-colors"
                />
              </div>

              <div>
                <label className="block text-[10px] font-semibold text-text-dim uppercase tracking-wider mb-1">
                  Fecha y Hora de Cierre *
                </label>
                <input
                  type="datetime-local"
                  required
                  value={ventanaForm.fecha_cierre}
                  onChange={(e) => setVentanaForm({ ...ventanaForm, fecha_cierre: e.target.value })}
                  className="w-full bg-bg-surface-2 border border-border rounded-xl px-3.5 py-2.5 text-xs text-text-primary focus:border-brand/50 focus:outline-none transition-colors"
                />
                <span className="text-[10px] text-text-dim mt-1.5 block leading-tight">
                  Cuándo se congelará el carrito para los almaceneros.
                </span>
              </div>

              <div>
                <label className="block text-[10px] font-semibold text-text-dim uppercase tracking-wider mb-1">
                  Fecha y Hora Estimada de Entrega *
                </label>
                <input
                  type="datetime-local"
                  required
                  value={ventanaForm.fecha_entrega}
                  onChange={(e) => setVentanaForm({ ...ventanaForm, fecha_entrega: e.target.value })}
                  className="w-full bg-bg-surface-2 border border-border rounded-xl px-3.5 py-2.5 text-xs text-text-primary focus:border-brand/50 focus:outline-none transition-colors"
                />
                <span className="text-[10px] text-text-dim mt-1.5 block leading-tight">
                  Cuándo iniciará la ruta de despacho física (se usará para calcular la fecha de llegada automática).
                </span>
              </div>

              <div className="flex items-center justify-between bg-bg-surface-2 border border-border rounded-xl p-3">
                <span className="text-xs font-semibold text-text-secondary">Ventana Activa</span>
                <button
                  type="button"
                  onClick={() => setVentanaForm({ ...ventanaForm, activa: !ventanaForm.activa })}
                  className={`relative inline-flex h-5.5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    ventanaForm.activa ? "bg-brand" : "bg-bg-surface-3"
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-4.5 w-4.5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      ventanaForm.activa ? "translate-x-4.5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>

              <button
                type="submit"
                disabled={saving || !ventanaForm.nombre.trim() || !ventanaForm.fecha_cierre || !ventanaForm.fecha_entrega}
                className="w-full bg-brand hover:bg-brand-hover disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer mt-4 text-xs"
              >
                {saving ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Guardando...
                  </>
                ) : (
                  <>
                    <Save className="h-3.5 w-3.5" /> Guardar Ventana
                  </>
                )}
              </button>
            </form>
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
    </AdminAuthGuard>
  );
}
