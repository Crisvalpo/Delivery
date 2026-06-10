"use client";

import { useState } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import { createClient } from "@/lib/supabase/client";
import {
  MapPin,
  Store,
  User,
  Phone,
  Compass,
  ArrowRight,
  Loader2,
  Check,
  AlertCircle,
} from "lucide-react";

export default function RegistroPage() {
  const router = useRouter();
  const supabase = createClient();

  const [nombreTienda, setNombreTienda] = useState("");
  const [nombreContacto, setNombreContacto] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [sector, setSector] = useState("Placilla Oriente");

  // Coordenadas
  const [latitud, setLatitud] = useState(null);
  const [longitud, setLongitud] = useState(null);
  const [gpsStatus, setGpsStatus] = useState("idle"); // 'idle' | 'loading' | 'success' | 'error'

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  // Sectores de Placilla / Curauma
  const sectores = [
    "Placilla Oriente",
    "Placilla Poniente",
    "Curauma Norte",
    "Curauma Sur",
    "Fundo El Bato",
  ];

  // --- Captura de GPS ---
  const obtenerGPS = () => {
    if (!("geolocation" in navigator)) {
      setGpsStatus("error");
      setError("Tu navegador no soporta geolocalización.");
      return;
    }

    setGpsStatus("loading");
    setError(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLatitud(position.coords.latitude);
        setLongitud(position.coords.longitude);
        setGpsStatus("success");
      },
      (err) => {
        console.warn("[LukeDelivery GPS] Error:", err.message);
        setGpsStatus("error");
        // No bloqueamos, solo advertimos
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  // --- Manejo del registro ---
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;

    setError(null);
    setIsSubmitting(true);

    // Validaciones básicas
    if (!nombreTienda.trim() || !nombreContacto.trim() || !whatsapp.trim()) {
      setError("Por favor completa todos los campos requeridos.");
      setIsSubmitting(false);
      return;
    }

    // Formatear número de whatsapp (asegurar +569 si viene sin él)
    let formattedWhatsapp = whatsapp.trim().replace(/\s+/g, "");
    if (!formattedWhatsapp.startsWith("+")) {
      if (formattedWhatsapp.startsWith("569")) {
        formattedWhatsapp = "+" + formattedWhatsapp;
      } else if (formattedWhatsapp.startsWith("9") && formattedWhatsapp.length === 9) {
        formattedWhatsapp = "+56" + formattedWhatsapp;
      } else {
        formattedWhatsapp = "+569" + formattedWhatsapp;
      }
    }

    // Validar GPS obligatorio
    if (latitud === null || longitud === null) {
      setError("Para registrar tu local, es necesario verificar tu ubicación GPS para planificar la ruta de reparto.");
      setIsSubmitting(false);
      return;
    }

    // Validar cuadrante geográfico de Placilla / Curauma
    // Latitud: entre -33.155 y -33.075
    // Longitud: entre -71.615 y -71.510
    const MIN_LAT = -33.155;
    const MAX_LAT = -33.075;
    const MIN_LNG = -71.615;
    const MAX_LNG = -71.510;

    if (latitud < MIN_LAT || latitud > MAX_LAT || longitud < MIN_LNG || longitud > MAX_LNG) {
      setError("Lo sentimos, LukeDelivery B2B por el momento solo está operando en Placilla y Curauma. Tu ubicación actual está fuera del área de servicio.");
      setIsSubmitting(false);
      return;
    }

    try {
      const { data, error: insertErr } = await supabase
        .from("clientes")
        .insert({
          nombre_tienda: nombreTienda.trim(),
          nombre_contacto: nombreContacto.trim(),
          whatsapp: formattedWhatsapp,
          sector: sector,
          notas_campo: "Cliente auto-registrado en terreno (QR Volante)",
          latitud: latitud,
          longitud: longitud,
          prioridad_territorial: "Media",
        })
        .select("id")
        .single();

      if (insertErr) throw insertErr;

      setSuccess(true);
      
      // Redirigir al catálogo después de 2 segundos pasándole su nuevo cliente_id
      setTimeout(() => {
        router.push(`/pedido?cliente_id=${data.id}`);
      }, 2000);

    } catch (err) {
      console.error("[LukeDelivery Registro] Error:", err);
      setError(err.message || "Error al registrar el almacén. Inténtalo de nuevo.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg-app flex flex-col justify-center px-4 py-8">
      <Head>
        <title>Registrar mi Almacén | LukeDelivery</title>
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no"
        />
        <meta
          name="description"
          content="Regístrate en LukeDelivery B2B para acceder al catálogo al costo real."
        />
      </Head>

      <div className="max-w-md w-full mx-auto bg-bg-surface border-2 border-border rounded-3xl p-6 shadow-2xl relative overflow-hidden">
        {/* Decoración superior */}
        <div className="absolute right-0 top-0 h-20 w-20 bg-brand/5 blur-2xl rounded-full" />
        
        {/* LOGO / CABECERA */}
        <div className="text-center mb-6">
          <div className="mx-auto bg-brand/15 text-brand p-3 rounded-2xl w-fit mb-3">
            <Store className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-black text-text-primary tracking-tight">
            Regístrate en LukeDelivery
          </h1>
          <p className="text-sm text-text-secondary mt-2 leading-relaxed font-medium">
            Precios costo real de los proveedores más un flete transparente.
            Activa tu catálogo en segundos.
          </p>
        </div>

        {/* ESTADO DE ÉXITO */}
        {success ? (
          <div className="text-center py-10 space-y-4 animate-fade-in">
            <div className="mx-auto bg-brand/15 text-brand p-4 rounded-full w-fit animate-bounce">
              <Check className="h-8 w-8" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-text-primary">
                ¡Registro Completado!
              </h2>
              <p className="text-sm text-text-secondary mt-1 font-medium">
                Creando tu catálogo personalizado... Redirigiéndote.
              </p>
            </div>
            <Loader2 className="h-6 w-6 animate-spin text-brand mx-auto mt-2" />
          </div>
        ) : (
          /* FORMULARIO */
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Error message */}
            {error && (
              <div className="bg-error-bg/10 border-2 border-error text-white text-sm font-semibold p-4 rounded-2xl flex gap-3 items-start animate-shake">
                <AlertCircle className="h-5 w-5 text-error shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {/* Nombre Tienda */}
            <div>
              <label className="block text-base font-bold text-text-primary mb-2">
                Nombre de la Tienda / Almacén *
              </label>
              <div className="relative">
                <Store className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-text-secondary" />
                <input
                  type="text"
                  required
                  placeholder="Ej: Almacén Don Tito"
                  value={nombreTienda}
                  onChange={(e) => setNombreTienda(e.target.value)}
                  className="w-full bg-bg-surface-2 border-2 border-border focus:border-brand rounded-2xl py-3.5 pl-12 pr-4 text-base font-medium text-text-primary placeholder:text-text-secondary transition-colors outline-none"
                />
              </div>
            </div>

            {/* Nombre Contacto */}
            <div>
              <label className="block text-base font-bold text-text-primary mb-2">
                Nombre del Dueño o Contacto *
              </label>
              <div className="relative">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-text-secondary" />
                <input
                  type="text"
                  required
                  placeholder="Ej: Héctor Gómez"
                  value={nombreContacto}
                  onChange={(e) => setNombreContacto(e.target.value)}
                  className="w-full bg-bg-surface-2 border-2 border-border focus:border-brand rounded-2xl py-3.5 pl-12 pr-4 text-base font-medium text-text-primary placeholder:text-text-secondary transition-colors outline-none"
                />
              </div>
            </div>

            {/* WhatsApp */}
            <div>
              <label className="block text-base font-bold text-text-primary mb-2">
                Número de WhatsApp *
              </label>
              <div className="relative">
                <Phone className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-text-secondary" />
                <input
                  type="tel"
                  required
                  placeholder="Ej: +56912345678"
                  value={whatsapp}
                  onChange={(e) => setWhatsapp(e.target.value)}
                  className="w-full bg-bg-surface-2 border-2 border-border focus:border-brand rounded-2xl py-3.5 pl-12 pr-4 text-base font-medium text-text-primary placeholder:text-text-secondary transition-colors outline-none"
                />
              </div>
            </div>

            {/* Sector */}
            <div>
              <label className="block text-base font-bold text-text-primary mb-2">
                Sector / Barrio *
              </label>
              <select
                value={sector}
                onChange={(e) => setSector(e.target.value)}
                className="w-full bg-bg-surface-2 border-2 border-border focus:border-brand rounded-2xl py-3.5 px-4 text-base font-bold text-text-primary transition-colors outline-none cursor-pointer"
              >
                {sectores.map((sec) => (
                  <option key={sec} value={sec} className="bg-bg-surface text-text-primary text-base font-medium">
                    {sec}
                  </option>
                ))}
              </select>
            </div>

            {/* GEOLOCALIZACIÓN GPS */}
            <div className="bg-bg-surface-2 border-2 border-border rounded-2xl p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex-1">
                  <h3 className="text-sm font-extrabold text-text-primary flex items-center gap-1.5">
                    <MapPin className="h-4.5 w-4.5 text-brand" /> Ubicación del Local *
                  </h3>
                  <p className="text-xs text-text-secondary leading-relaxed mt-1 font-medium">
                    Es obligatorio geolocalizar tu almacén para verificar que te encuentras en Placilla/Curauma.
                  </p>
                </div>
                
                <button
                  type="button"
                  onClick={obtenerGPS}
                  disabled={gpsStatus === "loading"}
                  className={`py-3 px-4 rounded-xl font-bold text-sm transition-all cursor-pointer flex items-center gap-1.5 shrink-0 shadow-md ${
                    gpsStatus === "success"
                      ? "bg-brand/20 text-brand border-2 border-brand"
                      : gpsStatus === "error"
                      ? "bg-error/20 text-error border-2 border-error"
                      : "bg-brand text-white hover:bg-brand-hover"
                  }`}
                >
                  {gpsStatus === "loading" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : gpsStatus === "success" ? (
                    <>
                      <Check className="h-4 w-4" /> Listo
                    </>
                  ) : (
                    <>
                      <Compass className="h-4 w-4" /> GPS
                    </>
                  )}
                </button>
              </div>

              {gpsStatus === "success" && (
                <div className="mt-3 text-xs font-bold text-brand bg-brand/10 p-2.5 rounded-lg border border-brand/20 leading-none flex justify-between">
                  <span>Lat: {latitud?.toFixed(5)}</span>
                  <span>Lng: {longitud?.toFixed(5)}</span>
                </div>
              )}

              {gpsStatus === "error" && (
                <div className="mt-3 text-xs font-semibold text-red-200 bg-error-bg/10 p-3 rounded-lg border border-error/30 leading-relaxed">
                  ⚠️ No se pudo obtener tu GPS. Por favor, activa el GPS del dispositivo y autoriza el acceso a la ubicación en tu navegador para registrarte.
                </div>
              )}
            </div>

            {/* BOTÓN REGISTRAR */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-brand hover:bg-brand-hover active:scale-[0.98] text-white font-extrabold py-4 rounded-2xl text-base flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg shadow-brand/20"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-6 w-6 animate-spin" /> Registrando...
                </>
              ) : (
                <>
                  Registrar mi Local <ArrowRight className="h-5 w-5" />
                </>
              )}
            </button>
          </form>
        )}
      </div>

      <div className="text-center mt-6 text-xs font-medium text-text-secondary">
        <p>LukeDelivery B2B — Placilla & Curauma</p>
      </div>
    </div>
  );
}
