"use client";

import { useState, useEffect, useCallback } from "react";
import Head from "next/head";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { 
  Truck, 
  ArrowLeft, 
  Save, 
  Loader2, 
  Sparkles,
  CheckCircle,
  AlertCircle,
  Plus,
  Trash2,
  Edit2,
  MapPin,
  MessageSquare,
  Phone
} from "lucide-react";
import AdminAuthGuard from "@/components/AdminAuthGuard";

export default function AdminProveedoresPage() {
  const [proveedores, setProveedores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState(null); // { type: 'success' | 'error', message: string }

  // Formulario
  const [form, setForm] = useState({
    nombre: "",
    contacto: "",
    telefono: "",
    contacto_whatsapp: "",
    direccion: "",
    notas: ""
  });
  const [editingId, setEditingId] = useState(null); // ID si estamos editando, null para crear

  const supabase = createClient();

  const loadProveedores = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("proveedores")
        .select("*")
        .order("nombre", { ascending: true });

      if (error) throw error;
      setProveedores(data || []);
    } catch (err) {
      console.error("Error cargando proveedores:", err.message);
      setStatus({
        type: "error",
        message: "No se pudo cargar la lista de proveedores de la base de datos.",
      });
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    loadProveedores();
  }, [loadProveedores]);

  const cleanPhone = (phoneStr) => {
    if (!phoneStr) return "";
    return phoneStr.replace(/[^0-9]/g, "").trim();
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.nombre.trim()) {
      setStatus({ type: "error", message: "El nombre del proveedor es requerido." });
      return;
    }

    setSaving(true);
    setStatus(null);

    const whatsappLimpio = cleanPhone(form.contacto_whatsapp);

    try {
      const payload = {
        nombre: form.nombre.trim(),
        contacto: form.contacto.trim() || null,
        telefono: form.telefono.trim() || null,
        contacto_whatsapp: whatsappLimpio || null,
        direccion: form.direccion.trim() || null,
        notas: form.notas.trim() || null
      };

      if (editingId) {
        // Actualizar
        const { error } = await supabase
          .from("proveedores")
          .update(payload)
          .eq("id", editingId);

        if (error) throw error;
        setStatus({ type: "success", message: "Proveedor actualizado con éxito." });
      } else {
        // Insertar
        const { error } = await supabase
          .from("proveedores")
          .insert(payload);

        if (error) throw error;
        setStatus({ type: "success", message: "Proveedor registrado con éxito." });
      }

      // Limpiar formulario
      setForm({
        nombre: "",
        contacto: "",
        telefono: "",
        contacto_whatsapp: "",
        direccion: "",
        notas: ""
      });
      setEditingId(null);

      // Recargar lista
      await loadProveedores();

      setTimeout(() => {
        setStatus(null);
      }, 4000);

    } catch (err) {
      console.error("Error guardando proveedor:", err.message);
      setStatus({
        type: "error",
        message: err.message || "Error al intentar guardar la información del proveedor."
      });
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (p) => {
    setEditingId(p.id);
    setForm({
      nombre: p.nombre,
      contacto: p.contacto || "",
      telefono: p.telefono || "",
      contacto_whatsapp: p.contacto_whatsapp || "",
      direccion: p.direccion || "",
      notes: p.notas || "", // compatibility mapping
      notas: p.notas || ""
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async (id, nombre) => {
    const confirmacion = window.confirm(`¿Estás seguro de que deseas eliminar al proveedor "${nombre}"?`);
    if (!confirmacion) return;

    try {
      const { error } = await supabase
        .from("proveedores")
        .delete()
        .eq("id", id);

      if (error) throw error;

      setStatus({ type: "success", message: `Proveedor "${nombre}" eliminado correctamente.` });
      
      if (editingId === id) {
        setForm({
          nombre: "",
          contacto: "",
          telefono: "",
          contacto_whatsapp: "",
          direccion: "",
          notas: ""
        });
        setEditingId(null);
      }

      await loadProveedores();

      setTimeout(() => {
        setStatus(null);
      }, 4000);

    } catch (err) {
      console.error("Error eliminando proveedor:", err.message);
      setStatus({
        type: "error",
        message: "No se pudo eliminar al proveedor seleccionado."
      });
    }
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setForm({
      nombre: "",
      contacto: "",
      telefono: "",
      contacto_whatsapp: "",
      direccion: "",
      notas: ""
    });
  };

  const abrirChatWhatsApp = (numero, nombreVendedor, nombreProveedor) => {
    if (!numero) return;
    const cleanNum = cleanPhone(numero);
    const mensaje = encodeURIComponent(
      `¡Hola ${nombreVendedor || "vendedor"}! Te contacto de parte de LukeDelivery sobre el proveedor ${nombreProveedor}.`
    );
    window.open(`https://wa.me/${cleanNum}?text=${mensaje}`, "_blank");
  };

  return (
    <AdminAuthGuard>
      <div className="min-h-screen bg-slate-950 text-white font-sans selection:bg-emerald-500/30 selection:text-emerald-300">
      <Head>
        <title>Gestión de Proveedores · LukeDelivery</title>
      </Head>

      {/* Header */}
      <header className="border-b border-slate-900 bg-slate-950/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-emerald-500/10 p-2 rounded-lg border border-emerald-500/20 text-emerald-400">
              <Truck className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">Gestión de Proveedores</h1>
              <p className="text-xs text-slate-400">Define los proveedores del mercado y sus contactos de ventas clave</p>
            </div>
          </div>
          <Link 
            href="/admin-luke" 
            className="flex items-center gap-2 text-sm text-slate-400 hover:text-white transition bg-slate-900/50 hover:bg-slate-900 border border-slate-800/80 px-3 py-1.5 rounded-lg"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Volver al Mapa</span>
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-5xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Formulario */}
          <div className="lg:col-span-1">
            <div className="bg-slate-900/40 border border-slate-900 rounded-xl p-6 backdrop-blur-sm sticky top-24 space-y-6">
              <div className="flex items-center gap-2 text-emerald-400 font-semibold text-sm">
                <Sparkles className="w-4 h-4" />
                <span>{editingId ? "Editar Proveedor" : "Registrar Proveedor"}</span>
              </div>

              <form onSubmit={handleSave} className="space-y-4">
                {/* Nombre */}
                <div className="space-y-1.5">
                  <label htmlFor="nombre" className="text-xs font-semibold text-slate-300 block">
                    Nombre del Proveedor *
                  </label>
                  <input
                    id="nombre"
                    type="text"
                    value={form.nombre}
                    onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm text-slate-300 placeholder-slate-650 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition"
                    placeholder="Ej. Distribuidor Chino Meiggs"
                    required
                  />
                </div>

                {/* Vendedor / Contacto */}
                <div className="space-y-1.5">
                  <label htmlFor="contacto" className="text-xs font-semibold text-slate-300 block">
                    Vendedor / Contacto
                  </label>
                  <input
                    id="contacto"
                    type="text"
                    value={form.contacto}
                    onChange={(e) => setForm({ ...form, contacto: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm text-slate-300 placeholder-slate-650 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition"
                    placeholder="Ej. Pedro Li"
                  />
                </div>

                {/* Teléfono General */}
                <div className="space-y-1.5">
                  <label htmlFor="telefono" className="text-xs font-semibold text-slate-300 block">
                    Teléfono Local / Fijo
                  </label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-3 w-4 h-4 text-slate-500" />
                    <input
                      id="telefono"
                      type="text"
                      value={form.telefono}
                      onChange={(e) => setForm({ ...form, telefono: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-2.5 text-sm text-slate-300 placeholder-slate-650 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition"
                      placeholder="Ej. 222334455"
                    />
                  </div>
                </div>

                {/* WhatsApp Vendedor */}
                <div className="space-y-1.5">
                  <label htmlFor="contacto_whatsapp" className="text-xs font-semibold text-slate-300 block">
                    WhatsApp de Contacto (Pedidos)
                  </label>
                  <div className="relative">
                    <MessageSquare className="absolute left-3 top-3 w-4 h-4 text-emerald-500" />
                    <input
                      id="contacto_whatsapp"
                      type="text"
                      value={form.contacto_whatsapp}
                      onChange={(e) => setForm({ ...form, contacto_whatsapp: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-2.5 text-sm text-slate-300 placeholder-slate-650 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition"
                      placeholder="Ej. 56912345678"
                    />
                  </div>
                  <span className="text-[10px] text-slate-500 block leading-tight">
                    Para el enlace directo a WhatsApp (código de país sin signo +).
                  </span>
                </div>

                {/* Dirección */}
                <div className="space-y-1.5">
                  <label htmlFor="direccion" className="text-xs font-semibold text-slate-300 block">
                    Dirección Física
                  </label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-3 w-4 h-4 text-slate-500" />
                    <input
                      id="direccion"
                      type="text"
                      value={form.direccion}
                      onChange={(e) => setForm({ ...form, direccion: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-2.5 text-sm text-slate-300 placeholder-slate-650 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition"
                      placeholder="Ej. Bascuñán Guerrero 456, Santiago"
                    />
                  </div>
                </div>

                {/* Notas */}
                <div className="space-y-1.5">
                  <label htmlFor="notas" className="text-xs font-semibold text-slate-300 block">
                    Notas adicionales
                  </label>
                  <textarea
                    id="notas"
                    value={form.notas}
                    onChange={(e) => setForm({ ...form, notas: e.target.value })}
                    rows={3}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm text-slate-300 placeholder-slate-650 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition"
                    placeholder="Horarios, montos mínimos, etc."
                  />
                </div>

                {status && (
                  <div className={`p-3.5 rounded-lg flex items-start gap-2 border text-xs leading-relaxed animate-fade-in ${
                    status.type === "success" 
                      ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" 
                      : "bg-red-500/10 border-red-500/20 text-red-400"
                  }`}>
                    {status.type === "success" ? (
                      <CheckCircle className="w-4.5 h-4.5 shrink-0" />
                    ) : (
                      <AlertCircle className="w-4.5 h-4.5 shrink-0" />
                    )}
                    <span>{status.message}</span>
                  </div>
                )}

                {/* Botones */}
                <div className="flex gap-2 pt-2">
                  {editingId && (
                    <button
                      type="button"
                      onClick={handleCancelEdit}
                      className="flex-1 bg-slate-900 border border-slate-800 hover:bg-slate-850 hover:text-white text-slate-300 font-medium text-xs py-2.5 rounded-lg transition"
                    >
                      Cancelar
                    </button>
                  )}
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex-1 flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs py-2.5 rounded-lg transition disabled:opacity-50 shadow-lg shadow-emerald-950/20"
                  >
                    {saving ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Guardando...</span>
                      </>
                    ) : (
                      <>
                        <Save className="w-3.5 h-3.5" />
                        <span>{editingId ? "Actualizar" : "Registrar"}</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>

          {/* Listado */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-slate-900/40 border border-slate-900 rounded-xl p-6 backdrop-blur-sm">
              <h2 className="text-md font-bold text-slate-200 mb-6 flex items-center gap-2">
                <Truck className="w-5 h-5 text-emerald-400" />
                <span>Proveedores Definidos ({proveedores.length})</span>
              </h2>

              {loading ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3">
                  <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
                  <p className="text-xs text-slate-400">Obteniendo proveedores de la base de datos...</p>
                </div>
              ) : proveedores.length === 0 ? (
                <div className="text-center py-16 border border-dashed border-slate-900 rounded-xl space-y-2">
                  <p className="text-sm text-slate-400">No hay proveedores registrados todavía.</p>
                  <p className="text-xs text-slate-650">Ingresa la información en el formulario para agregar el primero.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {proveedores.map((p) => (
                    <div 
                      key={p.id} 
                      className={`p-4 rounded-xl border transition-all ${
                        editingId === p.id 
                          ? "bg-emerald-500/5 border-emerald-500/30" 
                          : "bg-slate-900/60 border-slate-800/80 hover:border-slate-700/80"
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-bold text-base text-white">{p.nombre}</h3>
                            {p.contacto && (
                              <span className="text-[10px] bg-slate-800 text-slate-300 border border-slate-700 px-2 py-0.5 rounded-full font-semibold">
                                Vendedor: {p.contacto}
                              </span>
                            )}
                          </div>

                          {p.direccion && (
                            <p className="text-xs text-slate-400 flex items-center gap-1.5">
                              <MapPin className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                              <span>{p.direccion}</span>
                            </p>
                          )}

                          {p.telefono && (
                            <p className="text-xs text-slate-400 flex items-center gap-1.5">
                              <Phone className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                              <span>Tlf: {p.telefono}</span>
                            </p>
                          )}

                          {p.notas && (
                            <p className="text-xs text-slate-500 italic bg-slate-950/40 p-2 rounded-lg border border-slate-900/40 mt-1">
                              📝 {p.notas}
                            </p>
                          )}
                        </div>

                        {/* Botones de acción del proveedor */}
                        <div className="flex sm:flex-col items-center justify-end gap-2 shrink-0">
                          {p.contacto_whatsapp && (
                            <button
                              onClick={() => abrirChatWhatsApp(p.contacto_whatsapp, p.contacto, p.nombre)}
                              className="flex items-center gap-1 bg-emerald-600/10 hover:bg-emerald-600/20 border border-emerald-500/30 text-emerald-400 hover:text-emerald-300 text-xs px-3 py-1.5 rounded-lg transition cursor-pointer font-bold w-full justify-center"
                              title="Iniciar chat con vendedor"
                            >
                              <MessageSquare className="w-3.5 h-3.5" />
                              <span>WhatsApp</span>
                            </button>
                          )}
                          <div className="flex gap-2 w-full justify-end">
                            <button
                              onClick={() => handleEdit(p)}
                              className="p-2 hover:bg-slate-800 border border-slate-800 rounded-lg text-slate-400 hover:text-white transition cursor-pointer flex-1 sm:flex-none justify-center flex"
                              title="Editar"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDelete(p.id, p.nombre)}
                              className="p-2 hover:bg-slate-800 border border-slate-800 rounded-lg text-slate-400 hover:text-red-400 transition cursor-pointer flex-1 sm:flex-none justify-center flex"
                              title="Eliminar"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

        </div>
      </main>
      </div>
    </AdminAuthGuard>
  );
}
