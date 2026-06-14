"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import Link from "next/link";
import { Atkinson_Hyperlegible_Next } from "next/font/google";
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
  ChevronDown,
  Smartphone,
} from "lucide-react";

const atkinson = Atkinson_Hyperlegible_Next({
  subsets: ["latin"],
  weight: ["400", "700"],
  display: "swap",
});

export default function RegistroPage() {
  const router = useRouter();
  const supabase = createClient();

  const [nombreTienda, setNombreTienda] = useState("");
  const [nombreContacto, setNombreContacto] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [whatsappLid, setWhatsappLid] = useState("");
  const [isPhonePrefilled, setIsPhonePrefilled] = useState(false);
  const [checkingRegistered, setCheckingRegistered] = useState(true);

  // Cargar teléfono o LID del query string y validar registro previo
  useEffect(() => {
    if (!router.isReady) return;

    const checkRegistration = async (phoneVal, lidVal) => {
      setCheckingRegistered(true);
      
      let finalLid = lidVal ? lidVal.replace(/[^0-9]/g, "") : null;
      if (finalLid) {
        setWhatsappLid(finalLid);
      }

      let formattedWhatsapp = null;
      const cleanVal = phoneVal ? phoneVal.replace(/[^0-9]/g, "") : "";
      
      if (cleanVal) {
        // Si parece un LID de WhatsApp (longitud mayor a 11 o no empieza con 569/9)
        const isLid = cleanVal.length > 11 || (!cleanVal.startsWith("569") && !cleanVal.startsWith("9"));

        if (isLid) {
          if (!finalLid) {
            finalLid = cleanVal;
            setWhatsappLid(cleanVal);
          }
          setIsPhonePrefilled(false); // Sigue siendo editable ya que necesitamos su celular real
        } else {
          let formatted = cleanVal;
          if (formatted.startsWith("9") && formatted.length === 9) {
            formatted = "+56" + formatted;
          } else if (formatted.startsWith("569") && formatted.length === 11) {
            formatted = "+" + formatted;
          }
          formattedWhatsapp = formatted;
          setWhatsapp(formatted);
          setIsPhonePrefilled(true); // Bloqueamos edición
        }
      }

      try {
        // Consultar Supabase si ya existe el cliente con este número o LID
        let orConditions = "";
        if (formattedWhatsapp) {
          const cleanNoPlus = formattedWhatsapp.replace(/\+/g, "");
          orConditions = `whatsapp.eq.${cleanNoPlus},whatsapp.eq.${formattedWhatsapp}`;
        }
        if (finalLid) {
          if (orConditions) orConditions += ",";
          orConditions += `whatsapp_lid.eq.${finalLid}`;
        }

        if (orConditions) {
          const { data: clientes, error: clientError } = await supabase
            .from("clientes")
            .select("id")
            .or(orConditions);

          if (!clientError && clientes && clientes.length > 0) {
            console.log("[Registro] Cliente ya existe. Redirigiendo al catálogo...", clientes[0].id);
            router.push(`/pedido?cliente_id=${clientes[0].id}`);
            return;
          }
        }
      } catch (err) {
        console.error("[Registro] Error validando registro previo:", err);
      } finally {
        setCheckingRegistered(false);
      }
    };

    if (router.query) {
      const qPhone = router.query.phone ? router.query.phone.toString().trim() : null;
      const qLid = router.query.lid ? router.query.lid.toString().trim() : null;
      
      if (qPhone || qLid) {
        checkRegistration(qPhone, qLid);
      } else {
        setCheckingRegistered(false);
      }
    } else {
      setCheckingRegistered(false);
    }
  }, [router.query, router.isReady]);

  const [sector, setSector] = useState("Placilla Oriente");
  const [tipoNegocio, setTipoNegocio] = useState("Almacén");

  // Coordenadas
  const [latitud, setLatitud] = useState(null);
  const [longitud, setLongitud] = useState(null);
  const [gpsStatus, setGpsStatus] = useState("idle"); // 'idle' | 'loading' | 'success' | 'error'

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [gpsErrorMsg, setGpsErrorMsg] = useState(null);
  const [success, setSuccess] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);

  // Detectar si el usuario está en escritorio al montar
  useEffect(() => {
    const checkDesktop = () => setIsDesktop(window.innerWidth >= 768);
    checkDesktop();
    window.addEventListener("resize", checkDesktop);
    return () => window.removeEventListener("resize", checkDesktop);
  }, []);

  // Sectores de Placilla / Curauma
  const sectores = [
    "Placilla Oriente",
    "Placilla Poniente",
    "Curauma Norte",
    "Curauma Sur",
    "Fundo El Bato",
  ];

  const tiposNegocio = [
    "Almacén",
    "Minimarket",
    "Botillería",
    "Fiambrería",
  ];

  // --- Captura de GPS (con fallback para iPhone) ---
  const obtenerGPS = () => {
    if (!("geolocation" in navigator)) {
      setGpsStatus("error");
      setGpsErrorMsg("Tu navegador no soporta geolocalización. Intenta desde Safari en iPhone.");
      return;
    }

    setGpsStatus("loading");
    setGpsErrorMsg(null);
    setError(null);

    const onSuccess = (position) => {
      setLatitud(position.coords.latitude);
      setLongitud(position.coords.longitude);
      setGpsStatus("success");
      setGpsErrorMsg(null);
    };

    const onError = (err) => {
      console.warn("[LukeDelivery GPS] Error high accuracy:", err.code, err.message);
      // En iPhone, intentar con baja precisión como fallback
      navigator.geolocation.getCurrentPosition(
        onSuccess,
        (err2) => {
          console.warn("[LukeDelivery GPS] Error low accuracy fallback:", err2.code, err2.message);
          setGpsStatus("error");
          if (err2.code === 1) {
            // PERMISSION_DENIED
            setGpsErrorMsg(
              "Acceso a ubicación denegado. En iPhone: ve a Configuración → Safari → Ubicación → Permitir. Luego recarga esta página."
            );
          } else if (err2.code === 2) {
            // POSITION_UNAVAILABLE
            setGpsErrorMsg("No se pudo obtener tu ubicación. Asegúrate de estar al aire libre o cerca de una ventana e inténtalo de nuevo.");
          } else if (err2.code === 3) {
            // TIMEOUT
            setGpsErrorMsg("La búsqueda de GPS tomó demasiado tiempo. Inténtalo de nuevo en un lugar con mejor señal.");
          } else {
            setGpsErrorMsg("No se pudo obtener tu ubicación. Inténtalo de nuevo.");
          }
        },
        { enableHighAccuracy: false, timeout: 20000, maximumAge: 60000 }
      );
    };

    // Primer intento: alta precisión (GPS real)
    navigator.geolocation.getCurrentPosition(
      onSuccess,
      onError,
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
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
          whatsapp_lid: whatsappLid || null,
          sector: sector,
          notas_campo: "Cliente auto-registrado en terreno (QR Volante)",
          latitud: latitud,
          longitud: longitud,
          prioridad_territorial: "Media",
          tipo_negocio: tipoNegocio,
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

  // Bloqueo para escritorio
  if (isDesktop) {
    return (
      <div className={`min-h-screen bg-slate-950 flex flex-col items-center justify-center px-6 ${atkinson.className}`}>
        <Head>
          <title>Solo Móvil | LukeDelivery</title>
        </Head>
        <div className="max-w-sm w-full text-center space-y-6">
          <div className="flex justify-center">
            <div className="bg-orange-500/10 border border-orange-500/20 p-6 rounded-full">
              <Smartphone className="h-12 w-12 text-orange-400" />
            </div>
          </div>
          <div className="space-y-3">
            <h1 className="text-2xl font-black text-slate-100 tracking-tight">
              Página solo disponible en móvil
            </h1>
            <p className="text-slate-400 text-sm leading-relaxed font-medium">
              El registro de almacenes requiere GPS y está diseñado exclusivamente para ser completado desde tu teléfono celular.
            </p>
            <p className="text-slate-500 text-xs font-semibold">
              Escanea el QR de nuestro volante desde tu smartphone para continuar.
            </p>
          </div>
          <div className="border-t border-slate-800 pt-6">
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-orange-400 hover:text-orange-300 font-bold text-sm transition-colors"
            >
              ← Volver al inicio
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (checkingRegistered) {
    return (
      <div className={`min-h-screen bg-slate-100 flex flex-col items-center justify-center py-8 ${atkinson.className}`}>
        <Head>
          <title>Verificando cuenta | LukeDelivery</title>
        </Head>
        <div className="w-full max-w-md bg-white rounded-3xl shadow-xl flex flex-col items-center justify-center p-12 border border-slate-100 text-center space-y-6">
          <div className="bg-orange-50 p-6 rounded-full shadow-inner animate-pulse border border-orange-100">
            <Store className="h-12 w-12 text-orange-500" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-bold text-slate-800 animate-pulse">
              Verificando tu Cuenta
            </h2>
            <p className="text-sm text-slate-500 font-medium leading-relaxed max-w-[280px]">
              Comprobando si tu número de WhatsApp ya se encuentra registrado...
            </p>
          </div>
          <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen bg-slate-100 flex flex-col items-center justify-start py-8 ${atkinson.className}`}>
      <Head>
        <title>Registrar mi Almacén | LukeDelivery</title>
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1"
        />
        <meta
          name="description"
          content="Regístrate en LukeDelivery B2B para acceder al catálogo de ofertas al costo real."
        />
      </Head>

      <div className="w-full max-w-md bg-white rounded-3xl shadow-xl flex flex-col justify-between relative overflow-hidden border border-slate-100">
        {/* CABECERA CURVA NARANJA (Inspirada en el Screenshot) */}
        <div className="relative bg-gradient-to-br from-orange-500 to-amber-600 pt-12 pb-14 px-6 rounded-bl-[80px] md:rounded-bl-[100px] shadow-lg flex flex-col items-center justify-center">
          {/* Logo circular blanco */}
          <div className="bg-white p-4 rounded-full shadow-md flex items-center justify-center mb-4 border-4 border-orange-100">
            <Store className="h-8 w-8 text-orange-500" />
          </div>
          
          <h1 className="text-3xl font-extrabold text-white tracking-tight">
            Registrarse
          </h1>
          <p className="text-orange-100 text-xs text-center mt-2 leading-relaxed max-w-[280px] font-medium">
            Accede al catálogo de ofertas al costo real para tu negocio en Placilla y Curauma.
          </p>
        </div>

        {/* CONTENIDO PRINCIPAL */}
        <div className="flex-1 px-6 py-8">
          {success ? (
            <div className="text-center py-16 space-y-4 animate-fade-in flex flex-col items-center justify-center">
              <div className="bg-emerald-50 text-emerald-500 p-5 rounded-full shadow-inner animate-bounce border border-emerald-100">
                <Check className="h-10 w-10" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-800">
                  ¡Registro Completado!
                </h2>
                <p className="text-sm text-slate-500 mt-1 font-medium">
                  Creando tu catálogo personalizado... Redirigiéndote.
                </p>
              </div>
              <Loader2 className="h-6 w-6 animate-spin text-orange-500 mt-4" />
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Error message */}
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm font-semibold p-4 rounded-2xl flex gap-3 items-start animate-shake">
                  <AlertCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              {/* Nombre Tienda */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider pl-1">
                  Nombre de la Tienda / Almacén *
                </label>
                <div className="relative flex items-center bg-white border border-slate-200 shadow-sm shadow-slate-100 rounded-full px-4 focus-within:ring-2 focus-within:ring-orange-500/20 focus-within:border-orange-500 transition-all">
                  <Store className="h-4 w-4 text-slate-400 shrink-0" />
                  <input
                    type="text"
                    required
                    placeholder="Ej: Almacén Don Tito"
                    value={nombreTienda}
                    onChange={(e) => setNombreTienda(e.target.value)}
                    className="w-full bg-transparent border-0 outline-none text-slate-800 placeholder-slate-400 text-sm font-semibold py-3 px-3"
                  />
                </div>
              </div>

              {/* Nombre Contacto */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider pl-1">
                  Nombre del Dueño o Contacto *
                </label>
                <div className="relative flex items-center bg-white border border-slate-200 shadow-sm shadow-slate-100 rounded-full px-4 focus-within:ring-2 focus-within:ring-orange-500/20 focus-within:border-orange-500 transition-all">
                  <User className="h-4 w-4 text-slate-400 shrink-0" />
                  <input
                    type="text"
                    required
                    placeholder="Ej: Héctor Gómez"
                    value={nombreContacto}
                    onChange={(e) => setNombreContacto(e.target.value)}
                    className="w-full bg-transparent border-0 outline-none text-slate-800 placeholder-slate-400 text-sm font-semibold py-3 px-3"
                  />
                </div>
              </div>

              {/* WhatsApp */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider pl-1">
                  Número de WhatsApp *
                </label>
                <div className={`relative flex items-center border shadow-sm shadow-slate-100 rounded-full px-4 transition-all ${isPhonePrefilled ? 'bg-slate-50 border-slate-200' : 'bg-white border-slate-200 focus-within:ring-2 focus-within:ring-orange-500/20 focus-within:border-orange-500'}`}>
                  <Phone className="h-4 w-4 text-slate-400 shrink-0" />
                  <input
                    type="tel"
                    required
                    placeholder="Ej: +56912345678"
                    value={whatsapp}
                    onChange={(e) => setWhatsapp(e.target.value)}
                    readOnly={isPhonePrefilled}
                    className={`w-full bg-transparent border-0 outline-none placeholder-slate-400 text-sm font-semibold py-3 px-3 ${isPhonePrefilled ? 'text-slate-500 cursor-not-allowed' : 'text-slate-800'}`}
                  />
                </div>
                {isPhonePrefilled && (
                  <p className="text-[10px] text-slate-400 font-semibold pl-2">
                    Tu número de WhatsApp se ha cargado automáticamente y no es editable para garantizar la entrega.
                  </p>
                )}
              </div>

              {/* Sector */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider pl-1">
                  Sector / Barrio *
                </label>
                <div className="relative flex items-center bg-white border border-slate-200 shadow-sm shadow-slate-100 rounded-full px-4 focus-within:ring-2 focus-within:ring-orange-500/20 focus-within:border-orange-500 transition-all">
                  <MapPin className="h-4 w-4 text-slate-400 shrink-0" />
                  <select
                    value={sector}
                    onChange={(e) => setSector(e.target.value)}
                    className="w-full bg-transparent border-0 outline-none text-slate-800 text-sm font-semibold py-3 px-3 appearance-none cursor-pointer"
                  >
                    {sectores.map((sec) => (
                      <option key={sec} value={sec} className="text-slate-800 font-medium">
                        {sec}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="h-4 w-4 text-slate-400 shrink-0 pointer-events-none absolute right-4" />
                </div>
              </div>

              {/* Tipo de Negocio */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider pl-1">
                  Tipo de Negocio / Giro *
                </label>
                <div className="relative flex items-center bg-white border border-slate-200 shadow-sm shadow-slate-100 rounded-full px-4 focus-within:ring-2 focus-within:ring-orange-500/20 focus-within:border-orange-500 transition-all">
                  <Store className="h-4 w-4 text-slate-400 shrink-0" />
                  <select
                    value={tipoNegocio}
                    onChange={(e) => setTipoNegocio(e.target.value)}
                    className="w-full bg-transparent border-0 outline-none text-slate-800 text-sm font-semibold py-3 px-3 appearance-none cursor-pointer"
                  >
                    {tiposNegocio.map((t) => (
                      <option key={t} value={t} className="text-slate-800 font-medium">
                        {t}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="h-4 w-4 text-slate-400 shrink-0 pointer-events-none absolute right-4" />
                </div>
              </div>

              {/* GEOLOCALIZACIÓN GPS (Premium card) */}
              <div className="bg-slate-50 border border-slate-100 rounded-3xl p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <MapPin className="h-5 w-5 text-orange-500" />
                  <span className="text-sm font-extrabold text-slate-700">Ubicación del Local *</span>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed font-medium">
                  Es obligatorio geolocalizar tu almacén para validar que te encuentras en Placilla o Curauma.
                </p>
                <button
                  type="button"
                  onClick={obtenerGPS}
                  disabled={gpsStatus === "loading"}
                  className={`w-full py-3 px-4 rounded-full font-bold text-sm transition-all cursor-pointer flex items-center justify-center gap-2 shadow-sm ${
                    gpsStatus === "success"
                      ? "bg-emerald-50 text-emerald-600 border border-emerald-200"
                      : gpsStatus === "error"
                      ? "bg-red-50 text-red-600 border border-red-200"
                      : "bg-orange-500 hover:bg-orange-600 text-white shadow-orange-950/20 shadow-lg hover:shadow-orange-700/30"
                  }`}
                >
                  {gpsStatus === "loading" ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Buscando GPS...</span>
                    </>
                  ) : gpsStatus === "success" ? (
                    <>
                      <Check className="h-4 w-4" />
                      <span>Ubicación Registrada</span>
                    </>
                  ) : (
                    <>
                      <Compass className="h-4 w-4" />
                      <span>Activar GPS</span>
                    </>
                  )}
                </button>

                {gpsStatus === "error" && gpsErrorMsg && (
                  <div className="bg-red-50 border border-red-200 rounded-2xl p-3 flex gap-2 items-start">
                    <AlertCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                    <p className="text-xs text-red-700 font-semibold leading-relaxed">
                      {gpsErrorMsg}
                    </p>
                  </div>
                )}

                {gpsStatus === "success" && (
                  <div className="text-center text-[10px] font-mono text-slate-400 font-bold">
                    Lat: {latitud?.toFixed(5)} | Lng: {longitud?.toFixed(5)}
                  </div>
                )}
              </div>

              {/* BOTÓN REGISTRAR */}
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 active:scale-[0.98] text-white font-bold py-4 rounded-full text-base flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg shadow-orange-950/20"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-6 w-6 animate-spin" />
                    <span>Registrando Almacén...</span>
                  </>
                ) : (
                  <>
                    <span>REGISTRARSE</span>
                    <ArrowRight className="h-5 w-5" />
                  </>
                )}
              </button>
            </form>
          )}
        </div>

        {/* PIE DE PÁGINA (Footer) */}
        <div className="border-t border-slate-100 py-6 px-6 text-center space-y-2 bg-slate-50/50">
          <p className="text-xs text-slate-500 font-medium">
            ¿Ya tienes un local registrado?{" "}
            <Link href="/pedido" className="text-orange-500 font-extrabold hover:underline">
              Ir al Catálogo
            </Link>
          </p>
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
            LukeDelivery B2B · Placilla & Curauma
          </p>
        </div>
      </div>
    </div>
  );
}
