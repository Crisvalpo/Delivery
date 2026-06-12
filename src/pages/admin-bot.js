"use client";

import { useState, useEffect } from "react";
import Head from "next/head";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { 
  Bot, 
  ArrowLeft, 
  Save, 
  Loader2, 
  Sparkles,
  CheckCircle,
  AlertCircle 
} from "lucide-react";
import AdminAuthGuard from "@/components/AdminAuthGuard";

export default function AdminBotPage() {
  const [prompt, setPrompt] = useState("");
  const [modelName, setModelName] = useState("gemini-2.5-flash");
  const [temperature, setTemperature] = useState(0.2);
  const [margenGanancia, setMargenGanancia] = useState(20);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState(null); // { type: 'success' | 'error', message: string }
  const supabase = createClient();

  useEffect(() => {
    async function loadConfig() {
      try {
        const { data, error } = await supabase
          .from("configuracion_bot")
          .select("clave, valor");

        if (error) throw error;
        if (data) {
          const promptConfig = data.find(c => c.clave === "prompt_sistema");
          const modelConfig = data.find(c => c.clave === "model_name");
          const tempConfig = data.find(c => c.clave === "temperature");
          const margenConfig = data.find(c => c.clave === "margen_ganancia");

          if (promptConfig && promptConfig.valor) setPrompt(promptConfig.valor);
          if (modelConfig && modelConfig.valor) setModelName(modelConfig.valor);
          if (tempConfig && tempConfig.valor) {
            const parsedTemp = parseFloat(tempConfig.valor);
            if (!isNaN(parsedTemp)) setTemperature(parsedTemp);
          }
          if (margenConfig && margenConfig.valor) {
            const parsedMargen = parseInt(margenConfig.valor);
            if (!isNaN(parsedMargen)) setMargenGanancia(parsedMargen);
          }
        }
      } catch (err) {
        console.error("Error cargando configuración:", err.message);
        setStatus({
          type: "error",
          message: "No se pudo cargar la configuración de la base de datos.",
        });
      } finally {
        setLoading(false);
      }
    }

    loadConfig();
  }, [supabase]);

  const handleSave = async (e) => {
    e.preventDefault();
    if (!prompt.trim()) {
      setStatus({ type: "error", message: "El prompt del sistema no puede estar vacío." });
      return;
    }

    setSaving(true);
    setStatus(null);

    try {
      const { error } = await supabase
        .from("configuracion_bot")
        .upsert([
          { clave: "prompt_sistema", valor: prompt.trim() },
          { clave: "model_name", valor: modelName },
          { clave: "temperature", valor: temperature.toString() },
          { clave: "margen_ganancia", valor: margenGanancia.toString() }
        ]);

      if (error) throw error;

      setStatus({
        type: "success",
        message: "¡Configuraciones del bot guardadas con éxito en Supabase!",
      });

      // Ocultar mensaje de éxito tras 4 segundos
      setTimeout(() => {
        setStatus(null);
      }, 4000);
    } catch (err) {
      console.error("Error guardando configuración:", err.message);
      setStatus({
        type: "error",
        message: "Error al intentar guardar la configuración en la base de datos.",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminAuthGuard>
      <div className="min-h-screen bg-slate-950 text-white font-sans selection:bg-emerald-500/30 selection:text-emerald-300">
      <Head>
        <title>Ajustes del Asistente B2B · LukeDelivery</title>
      </Head>

      {/* Header */}
      <header className="border-b border-slate-900 bg-slate-950/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-emerald-500/10 p-2 rounded-lg border border-emerald-500/20 text-emerald-400">
              <Bot className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">Asistente Virtual B2B</h1>
              <p className="text-xs text-slate-400">Personaliza la personalidad de Jaime</p>
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

      {/* Main Container */}
      <main className="max-w-4xl mx-auto px-4 py-8">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <Loader2 className="w-10 h-10 text-emerald-400 animate-spin" />
            <p className="text-sm text-slate-400">Cargando configuración desde la base de datos...</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            
            {/* Formulario */}
            <div className="md:col-span-2 space-y-6">
              <div className="bg-slate-900/40 border border-slate-900 rounded-xl p-6 backdrop-blur-sm">
                <form onSubmit={handleSave} className="space-y-6">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <label htmlFor="prompt" className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-emerald-400" />
                        <span>Instrucciones de Sistema (System Prompt)</span>
                      </label>
                      <span className="text-xs text-slate-500">
                        {modelName === "gemini-2.5-pro" ? "Gemini 2.5 Pro" : "Gemini 2.5 Flash"}
                      </span>
                    </div>

                    <textarea
                      id="prompt"
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      rows={12}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg p-4 text-sm font-mono leading-relaxed focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-slate-300 placeholder-slate-600 transition"
                      placeholder="Escribe aquí las instrucciones para el comportamiento de la IA..."
                    />
                  </div>

                  {/* Parámetros del Modelo y Negocio */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-4 border-t border-slate-800/60">
                    {/* Modelo */}
                    <div className="space-y-2">
                      <label htmlFor="modelName" className="text-xs font-semibold text-slate-300 block">
                        Modelo de Inteligencia Artificial
                      </label>
                      <select
                        id="modelName"
                        value={modelName}
                        onChange={(e) => setModelName(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition cursor-pointer"
                      >
                        <option value="gemini-2.5-flash">Gemini 2.5 Flash (Más rápido)</option>
                        <option value="gemini-2.5-pro">Gemini 2.5 Pro (Más inteligente)</option>
                      </select>
                    </div>

                    {/* Temperatura */}
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <label htmlFor="temperature" className="text-xs font-semibold text-slate-300">
                          Temperatura: <span className="text-emerald-400 font-mono">{temperature}</span>
                        </label>
                        <span className="text-[10px] text-slate-500 font-medium">
                          {temperature <= 0.2 ? "Preciso" : temperature >= 0.7 ? "Creativo" : "Equilibrado"}
                        </span>
                      </div>
                      <input
                        id="temperature"
                        type="range"
                        min="0.0"
                        max="1.0"
                        step="0.1"
                        value={temperature}
                        onChange={(e) => setTemperature(parseFloat(e.target.value))}
                        className="w-full h-1.5 bg-slate-950 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                      />
                      <div className="flex justify-between text-[10px] text-slate-500 px-1">
                        <span>Preciso (0.0)</span>
                        <span>Creativo (1.0)</span>
                      </div>
                    </div>

                    {/* Margen de Ganancia */}
                    <div className="space-y-2">
                      <label htmlFor="margenGanancia" className="text-xs font-semibold text-slate-300 block">
                        Margen de Ganancia (%)
                      </label>
                      <input
                        id="margenGanancia"
                        type="number"
                        min="0"
                        max="200"
                        required
                        value={margenGanancia}
                        onChange={(e) => setMargenGanancia(parseInt(e.target.value) || 0)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition"
                        placeholder="Ej: 20"
                      />
                    </div>
                  </div>

                  {status && (
                    <div className={`p-4 rounded-lg flex items-start gap-3 border text-sm ${
                      status.type === "success" 
                        ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" 
                        : "bg-red-500/10 border-red-500/20 text-red-400"
                    }`}>
                      {status.type === "success" ? (
                        <CheckCircle className="w-5 h-5 shrink-0" />
                      ) : (
                        <AlertCircle className="w-5 h-5 shrink-0" />
                      )}
                      <span>{status.message}</span>
                    </div>
                  )}

                  <div className="flex justify-end pt-2">
                    <button
                      type="submit"
                      disabled={saving}
                      className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-sm px-5 py-2.5 rounded-lg transition disabled:opacity-50 cursor-pointer shadow-lg shadow-emerald-950/20 hover:shadow-emerald-900/30"
                    >
                      {saving ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Guardando...</span>
                        </>
                      ) : (
                        <>
                          <Save className="w-4 h-4" />
                          <span>Guardar Ajustes</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            </div>

            {/* Panel de Ayuda */}
            <div className="space-y-6">
              <div className="bg-slate-900/40 border border-slate-900 rounded-xl p-6 backdrop-blur-sm space-y-4">
                <h2 className="text-sm font-bold tracking-wider uppercase text-emerald-400">Guía de Redacción</h2>
                <div className="text-xs space-y-3 text-slate-400 leading-relaxed">
                  <p>
                    El prompt de sistema define la <strong>personalidad</strong> y las <strong>restricciones</strong> del bot de WhatsApp.
                  </p>
                  <p>
                    💡 <strong>Consejos de Oro:</strong>
                  </p>
                  <ul className="list-disc pl-4 space-y-2">
                    <li>
                      Define el rol claramente: <i>"Actúas como Jaime, el asistente virtual amable de LukeDelivery B2B..."</i>
                    </li>
                    <li>
                      Indícale que el catálogo se le inyecta automáticamente y que debe basarse estrictamente en él.
                    </li>
                    <li>
                      Establece restricciones de largo: <i>"Mantén tus respuestas muy cortas (máximo 2 párrafos)..."</i>
                    </li>
                    <li>
                      Controla la alucinación: <i>"NO inventes productos ni precios que no estén en la lista..."</i>
                    </li>
                    <li>
                      Alineación de pedidos: Recuérdale sugerir escribir la palabra <strong>"pedido"</strong> para generar el link seguro.
                    </li>
                  </ul>
                </div>
              </div>

              <div className="bg-slate-900/20 border border-slate-900/60 rounded-xl p-5 text-xs text-slate-500 space-y-2">
                <h3 className="font-semibold text-slate-400">Información Técnica</h3>
                <p>Las actualizaciones de prompt impactan al bot inmediatamente en la siguiente consulta de cualquier usuario sin necesidad de reiniciar servidores.</p>
              </div>
            </div>

          </div>
        )}
      </main>
      </div>
    </AdminAuthGuard>
  );
}
