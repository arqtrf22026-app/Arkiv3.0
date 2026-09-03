import WatermarkWiz from "@/components/watermark-wiz";

export default function Home() {
  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-black text-zinc-900 dark:text-zinc-50 flex flex-col items-center justify-center p-4 sm:p-8">
      <div className="w-full max-w-5xl mx-auto">
        <header className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight">Arkiv 3.0</h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">
            Sistema inteligente de gerenciamento e aplicação de marcas d'água
          </p>
        </header>
        
        {/* Componente principal do seu aplicativo */}
        <WatermarkWiz />
      </div>
    </main>
  );
}