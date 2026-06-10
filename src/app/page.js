import Link from "next/link";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-[var(--color-bg-app)] flex flex-col items-center justify-center px-6 text-center">
      {/* Logo / Brand */}
      <div className="mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-[var(--color-brand)]/15 rounded-2xl mb-4">
          <span className="text-3xl">🚚</span>
        </div>
        <h1 className="text-3xl font-bold text-[var(--color-text-primary)] tracking-tight">
          LukeDelivery
        </h1>
        <p className="text-sm text-[var(--color-text-secondary)] mt-2 max-w-md mx-auto leading-relaxed">
          Abastecimiento B2B honesto para almacenes de barrio en Placilla y
          Curauma. Precio costo real + flete transparente.
        </p>
      </div>

      {/* Links */}
      <div className="flex flex-col gap-3 w-full max-w-xs">
        <Link
          href="/registro"
          className="bg-[var(--color-brand)] hover:opacity-90 text-white font-semibold py-3.5 rounded-xl text-center transition-all shadow-lg shadow-[var(--color-brand)]/10"
        >
          🏪 Registrar mi Almacén
        </Link>
        <Link
          href="/pedido"
          className="bg-[var(--color-bg-surface-2)] border border-[var(--color-border)] hover:border-[var(--color-brand)]/20 text-[var(--color-text-secondary)] font-semibold py-3.5 rounded-xl text-center transition-all"
        >
          📦 Armar Pedido (Piloto)
        </Link>
        <Link
          href="/admin-luke"
          className="bg-[var(--color-bg-surface)] border border-[var(--color-border)] hover:border-[var(--color-brand)]/20 text-[var(--color-text-secondary)] font-semibold py-3.5 rounded-xl text-center transition-all"
        >
          🗺️ Panel Admin (Mapa)
        </Link>
      </div>

      <p className="text-[10px] text-[var(--color-text-dim)] mt-12">
        Honestidad Radical B2B · Piloto Placilla & Curauma
      </p>
    </div>
  );
}
