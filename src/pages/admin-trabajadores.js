"use client";

import { useState, useEffect, useCallback } from "react";
import Head from "next/head";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { 
  Users, 
  ArrowLeft, 
  Save, 
  Loader2, 
  Sparkles,
  CheckCircle,
  AlertCircle,
  Plus,
  Trash2,
  Edit2,
  Shield,
  UserCheck,
  UserX,
  Phone
} from "lucide-react";
import AdminAuthGuard from "@/components/AdminAuthGuard";

export default function AdminTrabajadoresPage() {
  const [trabajadores, setTrabajadores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState(null); // { type: 'success' | 'error', message: string }

  // Formulario
  const [form, setForm] = useState({
    nombre: "",
    whatsapp: "",
    rol: "Vendedor",
    activo: true
  });
  const [editingId, setEditingId] = useState(null); // ID si estamos editando, null para crear

  const supabase = createClient();

  const loadTrabajadores = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("trabajadores")
        .select("*")
        .order("nombre", { ascending: true });

      if (error) throw error;
      setTrabajadores(data || []);
    } catch (err) {
      console.error("Error cargando trabajadores:", err.message);
      setStatus({
        type: "error",
        message: "No se pudo cargar la lista de trabajadores de la base de datos.",
      });
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadTrabajadores();
  }, [loadTrabajadores]);

  const cleanWhatsApp = (phoneStr) => {
    // Elimina espacios, guiones, símbolos y el caracter +
    return phoneStr.replace(/[^0-9]/g, "").trim();
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.nombre.trim()) {
      setStatus({ type: "error", message: "El nombre no puede estar vacío." });
      return;
    }
    
    const cleanPhone = cleanWhatsApp(form.whatsapp);
    if (!cleanPhone) {
      setStatus({ type: "error", message: "El número de WhatsApp es requerido." });
      return;
    }

    setSaving(true);
    setStatus(null);

    try {
      const payload = {
        nombre: form.nombre.trim(),
        whatsapp: cleanPhone,
        rol: form.rol,
        activo: form.activo
      };

      const adminSecret = localStorage.getItem("ld_admin_secret");

      if (editingId) {
        // Actualizar existente
        const res = await fetch("/api/admin-trabajadores", {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${adminSecret}`
          },
          body: JSON.stringify({ id: editingId, ...payload })
        });
        const result = await res.json();
        if (!res.ok) throw new Error(result.message || "Error al actualizar trabajador.");
        
        setStatus({ type: "success", message: "Trabajador actualizado con éxito." });
      } else {
        // Insertar nuevo
        const res = await fetch("/api/admin-trabajadores", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${adminSecret}`
          },
          body: JSON.stringify(payload)
        });
        const result = await res.json();
        if (!res.ok) throw new Error(result.message || "Error al registrar trabajador.");

        setStatus({ type: "success", message: "Nuevo trabajador registrado con éxito." });
      }

      // Limpiar formulario
      setForm({ nombre: "", whatsapp: "", rol: "Vendedor", activo: true });
      setEditingId(null);

      // Recargar lista
      await loadTrabajadores();

      // Ocultar mensaje tras 4 segundos
      setTimeout(() => {
        setStatus(null);
      }, 4000);

    } catch (err) {
      console.error("Error guardando trabajador:", err.message);
      setStatus({
        type: "error",
        message: err.message || "Error al intentar guardar la información del trabajador."
      });
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (t) => {
    setEditingId(t.id);
    setForm({
      nombre: t.nombre,
      whatsapp: t.whatsapp,
      rol: t.rol,
      activo: t.activo
    });
    // Hacer scroll al formulario
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async (id, nombre) => {
    const confirmacion = window.confirm(`¿Estás seguro de que deseas eliminar a ${nombre} de la lista de trabajadores?`);
    if (!confirmacion) return;

    try {
      const adminSecret = localStorage.getItem("ld_admin_secret");
      const res = await fetch(`/api/admin-trabajadores?id=${id}`, {
        method: "DELETE",
        headers: {
          "Authorization": `Bearer ${adminSecret}`
        }
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.message || "Error al eliminar trabajador.");

      setStatus({ type: "success", message: `Trabajador ${nombre} eliminado correctamente.` });
      
      if (editingId === id) {
        setForm({ nombre: "", whatsapp: "", rol: "Vendedor", activo: true });
        setEditingId(null);
      }

      await loadTrabajadores();

      setTimeout(() => {
        setStatus(null);
      }, 4000);

    } catch (err) {
      console.error("Error eliminando trabajador:", err.message);
      setStatus({
        type: "error",
        message: "No se pudo eliminar al trabajador seleccionado."
      });
    }
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setForm({ nombre: "", whatsapp: "", rol: "Vendedor", activo: true });
  };

  const getRoleBadgeColor = (rol) => {
    switch (rol) {
      case "Administrador":
        return "bg-purple-500/10 border-purple-500/30 text-purple-400";
      case "Vendedor":
        return "bg-blue-500/10 border-blue-500/30 text-blue-400";
      case "Repartidor":
        return "bg-amber-500/10 border-amber-500/30 text-amber-400";
      default:
        return "bg-slate-500/10 border-slate-500/30 text-slate-400";
    }
  };

  return (
    <AdminAuthGuard>
      <div className="min-h-screen bg-slate-950 text-white font-sans selection:bg-emerald-500/30 selection:text-emerald-300">
      <Head>
        <title>Gestión de Personal B2B · LukeDelivery</title>
      </Head>

      {/* Header */}
      <header className="border-b border-slate-900 bg-slate-950/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-emerald-500/10 p-2 rounded-lg border border-emerald-500/20 text-emerald-400">
              <Users className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">Gestión de Personal & Roles</h1>
              <p className="text-xs text-slate-400">Administra los números autorizados y sus permisos en el sistema</p>
            </div>
          </div>
          <Link 
            href="/admin-luke" 
            className="flex items-center gap-2 text-sm text-slate-400 hover:text-white transition bg-slate-900/50 hover:bg-slate-900 border border-slate-800/80 px-3 py-1.5 rounded-lg animate-fade-in"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Volver al Mapa</span>
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-5xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Formulario de Agregar / Editar */}
          <div className="lg:col-span-1">
            <div className="bg-slate-900/40 border border-slate-900 rounded-xl p-6 backdrop-blur-sm sticky top-24 space-y-6">
              <div className="flex items-center gap-2 text-emerald-400 font-semibold text-sm">
                <Sparkles className="w-4 h-4" />
                <span>{editingId ? "Editar Trabajador" : "Registrar Trabajador"}</span>
              </div>

              <form onSubmit={handleSave} className="space-y-4">
                {/* Nombre */}
                <div className="space-y-1.5">
                  <label htmlFor="nombre" className="text-xs font-semibold text-slate-300 block">
                    Nombre Completo
                  </label>
                  <input
                    id="nombre"
                    type="text"
                    value={form.nombre}
                    onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm text-slate-300 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition"
                    placeholder="Ej. Héctor Gómez"
                    required
                  />
                </div>

                {/* WhatsApp */}
                <div className="space-y-1.5">
                  <label htmlFor="whatsapp" className="text-xs font-semibold text-slate-300 block">
                    WhatsApp (Identificador)
                  </label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-3 w-4 h-4 text-slate-500" />
                    <input
                      id="whatsapp"
                      type="text"
                      value={form.whatsapp}
                      onChange={(e) => setForm({ ...form, whatsapp: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-2.5 text-sm text-slate-300 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition"
                      placeholder="Ej. 56912345678"
                      required
                    />
                  </div>
                  <span className="text-[10px] text-slate-500 block leading-tight">
                    Ingresa solo números con código de país, sin signos (+) ni espacios.
                  </span>
                </div>

                {/* Rol */}
                <div className="space-y-1.5">
                  <label htmlFor="rol" className="text-xs font-semibold text-slate-300 block">
                    Rol en el Sistema
                  </label>
                  <select
                    id="rol"
                    value={form.rol}
                    onChange={(e) => setForm({ ...form, rol: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition cursor-pointer"
                  >
                    <option value="Administrador">Administrador (Control total)</option>
                    <option value="Vendedor">Vendedor (Gestión comercial)</option>
                    <option value="Repartidor">Repartidor (Logística y despacho)</option>
                  </select>
                </div>

                {/* Activo */}
                <div className="flex items-center gap-3 py-2">
                  <input
                    id="activo"
                    type="checkbox"
                    checked={form.activo}
                    onChange={(e) => setForm({ ...form, activo: e.target.checked })}
                    className="w-4 h-4 text-emerald-600 bg-slate-950 border-slate-800 rounded focus:ring-emerald-500 focus:ring-2 focus:ring-offset-slate-950 cursor-pointer accent-emerald-500"
                  />
                  <label htmlFor="activo" className="text-xs font-semibold text-slate-300 cursor-pointer select-none">
                    Cuenta Activa / Permitir acceso
                  </label>
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

                {/* Botones de acción */}
                <div className="flex gap-2 pt-2">
                  {editingId && (
                    <button
                      type="button"
                      onClick={handleCancelEdit}
                      className="flex-1 bg-slate-900 border border-slate-800 hover:bg-slate-850 hover:text-white text-slate-300 font-medium text-xs py-2.5 rounded-lg transition cursor-pointer"
                    >
                      Cancelar
                    </button>
                  )}
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex-1 flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs py-2.5 rounded-lg transition disabled:opacity-50 cursor-pointer shadow-lg shadow-emerald-950/20"
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

          {/* Listado de Trabajadores */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-slate-900/40 border border-slate-900 rounded-xl p-6 backdrop-blur-sm">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-md font-bold text-slate-200 flex items-center gap-2">
                  <Shield className="w-5 h-5 text-emerald-400" />
                  <span>Personal Registrado ({trabajadores.length})</span>
                </h2>
                <div className="text-xs text-slate-500">
                  Ordenado alfabéticamente
                </div>
              </div>

              {loading ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3">
                  <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
                  <p className="text-xs text-slate-400">Obteniendo personal desde la base de datos...</p>
                </div>
              ) : trabajadores.length === 0 ? (
                <div className="text-center py-16 border border-dashed border-slate-900 rounded-xl space-y-2">
                  <p className="text-sm text-slate-400">No hay trabajadores registrados actualmente.</p>
                  <p className="text-xs text-slate-600">Completa el formulario de la izquierda para agregar uno.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm text-slate-300">
                    <thead className="text-[10px] uppercase bg-slate-950 border border-slate-900 text-slate-400 tracking-wider">
                      <tr>
                        <th scope="col" className="px-4 py-3 rounded-l-lg">Nombre</th>
                        <th scope="col" className="px-4 py-3">WhatsApp</th>
                        <th scope="col" className="px-4 py-3">Rol</th>
                        <th scope="col" className="px-4 py-3 text-center">Estado</th>
                        <th scope="col" className="px-4 py-3 text-right rounded-r-lg">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-900">
                      {trabajadores.map((t) => (
                        <tr 
                          key={t.id} 
                          className={`hover:bg-slate-900/20 transition-colors ${
                            editingId === t.id ? "bg-emerald-500/5" : ""
                          }`}
                        >
                          {/* Nombre */}
                          <td className="px-4 py-4 font-medium text-white max-w-[150px] truncate">
                            {t.nombre}
                          </td>
                          {/* WhatsApp */}
                          <td className="px-4 py-4 font-mono text-xs text-slate-400">
                            +{t.whatsapp}
                          </td>
                          {/* Rol */}
                          <td className="px-4 py-4">
                            <span className={`px-2 py-1 border rounded-md text-[10px] font-semibold tracking-wide ${getRoleBadgeColor(t.rol)}`}>
                              {t.rol}
                            </span>
                          </td>
                          {/* Estado */}
                          <td className="px-4 py-4 text-center">
                            <div className="flex justify-center">
                              {t.activo ? (
                                <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                                  <UserCheck className="w-3 h-3" />
                                  <span>Activo</span>
                                </span>
                              ) : (
                                <span className="flex items-center gap-1 text-[10px] font-semibold text-red-400 bg-red-500/10 border border-red-500/20 px-2 py-0.5 rounded-full">
                                  <UserX className="w-3 h-3" />
                                  <span>Inactivo</span>
                                </span>
                              )}
                            </div>
                          </td>
                          {/* Acciones */}
                          <td className="px-4 py-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => handleEdit(t)}
                                className="p-1.5 hover:bg-slate-900 rounded-md text-slate-400 hover:text-emerald-400 transition cursor-pointer"
                                title="Editar"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDelete(t.id, t.nombre)}
                                className="p-1.5 hover:bg-slate-900 rounded-md text-slate-400 hover:text-red-400 transition cursor-pointer"
                                title="Eliminar"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
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
            
            {/* Guía de Roles */}
            <div className="bg-slate-900/20 border border-slate-900/60 rounded-xl p-5 text-xs text-slate-400 space-y-3">
              <h3 className="font-bold text-slate-300 flex items-center gap-2">
                <Shield className="w-4 h-4 text-emerald-400" />
                <span>Niveles de Permisos del Staff</span>
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
                <div className="space-y-1">
                  <span className="font-bold text-purple-400">1. Administrador:</span>
                  <p className="text-[11px] leading-relaxed">Acceso a configuraciones globales, edición de prompts del bot, control total sobre catálogos de precios y visualización territorial completa.</p>
                </div>
                <div className="space-y-1">
                  <span className="font-bold text-blue-400">2. Vendedor:</span>
                  <p className="text-[11px] leading-relaxed">Registro y gestión de almacenes del sector, generación de tokens de pedidos, y visualización de historial comercial del cliente.</p>
                </div>
                <div className="space-y-1">
                  <span className="font-bold text-amber-400">3. Repartidor:</span>
                  <p className="text-[11px] leading-relaxed">Consulta de rutas de despacho, notas de campo del cliente en el mapa, y actualización de estado de entregas en tiempo real.</p>
                </div>
              </div>
            </div>
          </div>

        </div>
      </main>
      </div>
    </AdminAuthGuard>
  );
}
