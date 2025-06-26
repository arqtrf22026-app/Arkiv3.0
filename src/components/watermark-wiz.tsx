"use client";

import { useState, useRef, useEffect, useCallback, type ChangeEvent } from 'react';
import Image from 'next/image';
import {
  Upload,
  Image as ImageIcon,
  Sparkles,
  Download,
  Settings2,
  Trash2,
  LoaderCircle,
  X,
  CheckCircle2,
} from 'lucide-react';
import JSZip from 'jszip';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { optimizeWatermarkPlacement, type OptimizeWatermarkPlacementInput } from '@/ai/flows/optimize-watermark-placement';
import { cn } from '@/lib/utils';

interface WatermarkSettings {
  x: number;
  y: number;
  scale: number;
  opacity: number;
}

const fileToDataURL = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (error) => reject(error);
    reader.readAsDataURL(file);
  });
};

export function WatermarkWiz() {
  const { toast } = useToast();
  const [watermark, setWatermark] = useState<File | null>(null);
  const [watermarkPreview, setWatermarkPreview] = useState<string | null>(null);
  const [sourceImages, setSourceImages] = useState<File[]>([]);
  const [sourceImagePreviews, setSourceImagePreviews] = useState<string[]>([]);
  const [processedImages, setProcessedImages] = useState<string[]>([]);
  const [settings, setSettings] = useState<WatermarkSettings>({ x: 0.5, y: 0.5, scale: 0.2, opacity: 0.7 });
  const [selectedImageIndex, setSelectedImageIndex] = useState<number>(0);
  
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingProgress, setProcessingProgress] = useState(0);

  const canvasRef = useRef<HTMLCanvasElement>(null);

  const handleWatermarkUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setWatermark(file);
      const preview = await fileToDataURL(file);
      setWatermarkPreview(preview);
    }
  };

  const handleImagesUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      setSourceImages(files);
      setSelectedImageIndex(0);
      setProcessedImages([]);
      const previews = await Promise.all(files.map(fileToDataURL));
      setSourceImagePreviews(previews);
    }
  };

  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    const sourcePreview = sourceImagePreviews[selectedImageIndex];
    
    if (!ctx || !canvas || !watermarkPreview || !sourcePreview) return;

    const sourceImg = new window.Image();
    const watermarkImg = new window.Image();

    let sourceLoaded = false;
    let watermarkLoaded = false;

    const render = () => {
      if (!sourceLoaded || !watermarkLoaded) return;
      
      canvas.width = sourceImg.naturalWidth;
      canvas.height = sourceImg.naturalHeight;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(sourceImg, 0, 0, canvas.width, canvas.height);

      ctx.globalAlpha = settings.opacity;
      
      const watermarkAspectRatio = watermarkImg.naturalWidth / watermarkImg.naturalHeight;
      const newWidth = canvas.width * settings.scale;
      const newHeight = newWidth / watermarkAspectRatio;

      const posX = (canvas.width - newWidth) * settings.x;
      const posY = (canvas.height - newHeight) * settings.y;

      ctx.drawImage(watermarkImg, posX, posY, newWidth, newHeight);
      ctx.globalAlpha = 1.0;
    };

    sourceImg.onload = () => {
      sourceLoaded = true;
      render();
    };
    watermarkImg.onload = () => {
      watermarkLoaded = true;
      render();
    };

    sourceImg.src = sourcePreview;
    watermarkImg.src = watermarkPreview;
  }, [watermarkPreview, sourceImagePreviews, selectedImageIndex, settings]);

  useEffect(() => {
    drawCanvas();
  }, [drawCanvas]);

  const handleAiOptimize = async () => {
    if (!watermark || !sourceImages.length) {
        toast({ title: 'Erro', description: 'Por favor, carregue uma marca d\'água e pelo menos uma imagem.', variant: 'destructive' });
        return;
    }
    setIsAiLoading(true);
    try {
        const photoDataUri = await fileToDataURL(sourceImages[selectedImageIndex]);
        const watermarkDataUri = await fileToDataURL(watermark);
        
        const input: OptimizeWatermarkPlacementInput = { photoDataUri, watermarkDataUri };
        const result = await optimizeWatermarkPlacement(input);
        
        setSettings(prev => ({ ...prev, x: result.x, y: result.y, scale: result.scale }));
        toast({ title: 'Sucesso!', description: 'Marca d\'água otimizada com IA.', className: 'bg-green-100 dark:bg-green-900' });
    } catch (error) {
        console.error('AI optimization failed:', error);
        toast({ title: 'Falha na Otimização', description: 'Não foi possível otimizar a marca d\'água. Tente novamente.', variant: 'destructive' });
    } finally {
        setIsAiLoading(false);
    }
  };

  const applyWatermarkToAll = async () => {
    if (!watermark || !sourceImages.length) {
      toast({ title: 'Erro', description: 'Carregue a marca d\'água e as imagens primeiro.', variant: 'destructive' });
      return;
    }
    
    setIsProcessing(true);
    setProcessingProgress(0);
    const results: string[] = [];
    const offscreenCanvas = document.createElement('canvas');
    const ctx = offscreenCanvas.getContext('2d');
    const watermarkDataUri = await fileToDataURL(watermark);

    if (!ctx) {
        toast({ title: 'Erro', description: 'Não foi possível iniciar o processamento.', variant: 'destructive' });
        setIsProcessing(false);
        return;
    }

    for (let i = 0; i < sourceImages.length; i++) {
        const sourceDataUri = await fileToDataURL(sourceImages[i]);

        const processedData = await new Promise<string>((resolve) => {
            const sourceImg = new window.Image();
            const watermarkImg = new window.Image();
            sourceImg.onload = () => {
                watermarkImg.onload = () => {
                    offscreenCanvas.width = sourceImg.naturalWidth;
                    offscreenCanvas.height = sourceImg.naturalHeight;
                    ctx.drawImage(sourceImg, 0, 0);
                    ctx.globalAlpha = settings.opacity;
                    const watermarkAspectRatio = watermarkImg.naturalWidth / watermarkImg.naturalHeight;
                    const newWidth = offscreenCanvas.width * settings.scale;
                    const newHeight = newWidth / watermarkAspectRatio;
                    const posX = (offscreenCanvas.width - newWidth) * settings.x;
                    const posY = (offscreenCanvas.height - newHeight) * settings.y;
                    ctx.drawImage(watermarkImg, posX, posY, newWidth, newHeight);
                    ctx.globalAlpha = 1.0;
                    resolve(offscreenCanvas.toDataURL('image/jpeg', 0.9));
                };
                watermarkImg.src = watermarkDataUri;
            };
            sourceImg.src = sourceDataUri;
        });

        results.push(processedData);
        setProcessingProgress(((i + 1) / sourceImages.length) * 100);
    }
    
    setProcessedImages(results);
    setIsProcessing(false);
  };
  
  const handleDownloadAll = async () => {
    const zip = new JSZip();
    processedImages.forEach((dataUrl, index) => {
        const blob = dataURLtoBlob(dataUrl);
        zip.file(`watermarked_${sourceImages[index].name}`, blob);
    });

    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(zipBlob);
    link.download = 'watermarked_images.zip';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
  };

  const dataURLtoBlob = (dataurl: string) => {
    const arr = dataurl.split(',');
    const mimeMatch = arr[0].match(/:(.*?);/);
    if (!mimeMatch) throw new Error("Invalid data URL");
    const mime = mimeMatch[1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while(n--){
        u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], {type:mime});
  }

  const FileInput = ({ id, label, onUpload, multiple = false, accept, icon: Icon, files, onClear }: {
    id: string;
    label: string;
    onUpload: (e: ChangeEvent<HTMLInputElement>) => void;
    multiple?: boolean;
    accept: string;
    icon: React.ElementType;
    files: File[] | File | null;
    onClear: () => void;
  }) => (
    <div className="space-y-2">
      <Label className="text-lg font-semibold">{label}</Label>
      <div className="relative rounded-lg border-2 border-dashed border-border p-6 text-center transition hover:border-primary">
          <input
            id={id}
            type="file"
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            onChange={onUpload}
            multiple={multiple}
            accept={accept}
          />
          <div className="flex flex-col items-center justify-center space-y-2 text-muted-foreground">
            <Icon className="h-10 w-10" />
            <p>Arraste e solte ou clique para carregar</p>
          </div>
      </div>
       {(files && (Array.isArray(files) ? files.length > 0 : true)) && (
        <div className="pt-2">
          <div className="flex items-center justify-between rounded-md bg-muted p-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <CheckCircle2 className="h-5 w-5 text-green-500" />
                <span>{Array.isArray(files) ? `${files.length} arquivo(s) carregado(s)` : (files as File).name}</span>
              </div>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClear}>
                <Trash2 className="h-4 w-4" />
              </Button>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen w-full bg-background text-foreground">
      <header className="border-b border-border/50 bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <h1 className="text-2xl font-bold tracking-tight">Watermark Wiz</h1>
          <p className="text-sm text-muted-foreground">Sua solução para marcas d'água em lote</p>
        </div>
      </header>
      
      <main className="container mx-auto p-4 md:p-8">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
            {/* Left Panel: Uploads and Image List */}
            <div className="lg:col-span-3 space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>1. Carregar Arquivos</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <FileInput
                    id="watermark-upload"
                    label="Marca D'água"
                    onUpload={handleWatermarkUpload}
                    accept="image/png, image/jpeg"
                    icon={Upload}
                    files={watermark}
                    onClear={() => { setWatermark(null); setWatermarkPreview(null); }}
                  />
                  <FileInput
                    id="images-upload"
                    label="Imagens"
                    onUpload={handleImagesUpload}
                    multiple
                    accept="image/jpeg"
                    icon={ImageIcon}
                    files={sourceImages}
                    onClear={() => { setSourceImages([]); setSourceImagePreviews([]); setProcessedImages([]); }}
                  />
                </CardContent>
              </Card>

              {sourceImages.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Imagens na Fila</CardTitle>
                    <CardDescription>{sourceImages.length} imagens prontas para processar.</CardDescription>
                  </CardHeader>
                  <CardContent className="max-h-96 overflow-y-auto">
                    <div className="space-y-2">
                      {sourceImagePreviews.map((preview, index) => (
                        <button
                          key={index}
                          onClick={() => setSelectedImageIndex(index)}
                          className={cn(
                            "flex w-full items-center gap-3 rounded-md p-2 text-left transition",
                            selectedImageIndex === index ? 'bg-primary/50 ring-2 ring-primary' : 'hover:bg-muted'
                          )}
                        >
                          <Image src={preview} alt={`Preview ${index + 1}`} width={48} height={48} className="h-12 w-12 rounded-md object-cover" />
                          <span className="flex-1 truncate font-medium">{sourceImages[index].name}</span>
                        </button>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Middle Panel: Editor Canvas */}
            <div className="lg:col-span-6">
              <Card className="sticky top-24">
                <CardHeader>
                  <CardTitle>2. Editor de Visualização</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-muted flex items-center justify-center">
                    {!watermarkPreview || sourceImagePreviews.length === 0 ? (
                       <div className="text-center text-muted-foreground p-4">
                         <p>Carregue uma marca d'água e uma imagem para começar.</p>
                       </div>
                    ) : (
                      <canvas ref={canvasRef} className="max-h-full max-w-full object-contain" />
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Right Panel: Settings and Actions */}
            <div className="lg:col-span-3 space-y-6">
               <Card className="sticky top-24">
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <CardTitle>3. Ajustes</CardTitle>
                        <Settings2 className="h-5 w-5 text-muted-foreground" />
                    </div>
                </CardHeader>
                <CardContent className="space-y-6">
                    <Button onClick={handleAiOptimize} disabled={isAiLoading || !watermark || sourceImages.length === 0} className="w-full bg-accent hover:bg-accent/80 text-accent-foreground">
                        {isAiLoading && <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />}
                        <Sparkles className="mr-2 h-4 w-4" />
                        Otimizar com IA
                    </Button>
                    
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="x-pos">Posição X: {Math.round(settings.x * 100)}%</Label>
                        <Slider id="x-pos" value={[settings.x]} onValueChange={([v]) => setSettings(s => ({...s, x: v}))} max={1} step={0.01} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="y-pos">Posição Y: {Math.round(settings.y * 100)}%</Label>
                        <Slider id="y-pos" value={[settings.y]} onValueChange={([v]) => setSettings(s => ({...s, y: v}))} max={1} step={0.01} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="scale">Tamanho: {Math.round(settings.scale * 100)}%</Label>
                        <Slider id="scale" value={[settings.scale]} onValueChange={([v]) => setSettings(s => ({...s, scale: v}))} min={0.05} max={1} step={0.01} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="opacity">Opacidade: {Math.round(settings.opacity * 100)}%</Label>
                        <Slider id="opacity" value={[settings.opacity]} onValueChange={([v]) => setSettings(s => ({...s, opacity: v}))} max={1} step={0.01} />
                      </div>
                    </div>
                    
                    <Separator />

                    <Button onClick={applyWatermarkToAll} disabled={isProcessing || !watermark || sourceImages.length === 0} className="w-full">
                         {isProcessing && <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />}
                         Aplicar em Tudo
                    </Button>
                    {isProcessing && (
                      <div className="space-y-2">
                        <Progress value={processingProgress} />
                        <p className="text-sm text-center text-muted-foreground">Processando {Math.round(processingProgress)}%</p>
                      </div>
                    )}
                </CardContent>
              </Card>
            </div>
        </div>

        {processedImages.length > 0 && (
          <div className="mt-12">
            <Card>
              <CardHeader>
                <div className="flex flex-col items-start gap-2 md:flex-row md:items-center md:justify-between">
                  <div>
                    <CardTitle>4. Resultados</CardTitle>
                    <CardDescription>{processedImages.length} imagens processadas com sucesso.</CardDescription>
                  </div>
                  <Button onClick={handleDownloadAll}>
                    <Download className="mr-2 h-4 w-4" />
                    Baixar Todas (ZIP)
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
                  {processedImages.map((src, index) => (
                    <div key={index} className="group relative aspect-square overflow-hidden rounded-lg">
                      <Image src={src} alt={`Processed image ${index + 1}`} layout="fill" className="object-cover" />
                      <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
                        <a href={src} download={`watermarked_${sourceImages[index].name}`} className={cn(buttonVariants({ size: 'icon' }))}>
                          <Download className="h-5 w-5" />
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </main>
    </div>
  );
}

// Re-exporting buttonVariants to be used in the component
import { cva } from 'class-variance-authority';
import { buttonVariants } from '@/components/ui/button';

export { buttonVariants };
