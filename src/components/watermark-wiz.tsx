'use client';

import React, { useState, useRef, useEffect, useCallback, type ChangeEvent, type FC } from 'react';
import Image from 'next/image';
import {
  Upload,
  Image as ImageIcon,
  Download,
  Settings2,
  Trash2,
  LoaderCircle,
  CheckCircle2,
} from 'lucide-react';
import JSZip from 'jszip';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface WatermarkSettings {
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

const dataURLtoBlob = (dataurl: string): Blob | null => {
  const arr = dataurl.split(',');
  if (arr.length < 2) return null;
  const mimeMatch = arr[0].match(/:(.*?);/);
  if (!mimeMatch) return null;
  const mime = mimeMatch[1];
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], { type: mime });
};

export const WatermarkWiz: FC = () => {
  const { toast } = useToast();
  
  const [watermarkPortrait, setWatermarkPortrait] = useState<File | null>(null);
  const [watermarkPortraitPreview, setWatermarkPortraitPreview] = useState<string | null>(null);
  
  const [watermarkLandscape, setWatermarkLandscape] = useState<File | null>(null);
  const [watermarkLandscapePreview, setWatermarkLandscapePreview] = useState<string | null>(null);

  const [sourceImages, setSourceImages] = useState<File[]>([]);
  const [sourceImagePreviews, setSourceImagePreviews] = useState<string[]>([]);
  const [processedImages, setProcessedImages] = useState<string[]>([]);
  
  const [settings, setSettings] = useState<WatermarkSettings>({ opacity: 0.92 });
  const [selectedImageIndex, setSelectedImageIndex] = useState<number>(0);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [processingProgress, setProcessingProgress] = useState<number>(0);
  
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const handleWatermarkUpload = useCallback(
    async (e: ChangeEvent<HTMLInputElement>, orientation: 'portrait' | 'landscape') => {
      const file = e.target.files?.[0];
      if (file) {
        const preview = await fileToDataURL(file);
        if (orientation === 'portrait') {
          setWatermarkPortrait(file);
          setWatermarkPortraitPreview(preview);
        } else {
          setWatermarkLandscape(file);
          setWatermarkLandscapePreview(preview);
        }
      }
    },
    []
  );

  const handleImagesUpload = useCallback(async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      setSourceImages(files);
      setSelectedImageIndex(0);
      setProcessedImages([]);
      const previews = await Promise.all(files.map(fileToDataURL));
      setSourceImagePreviews(previews);
    }
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    const sourcePreview = sourceImagePreviews[selectedImageIndex];

    if (!ctx || !canvas || !sourcePreview) return;

    const sourceImg = new window.Image();
    sourceImg.onload = () => {
      canvas.width = sourceImg.naturalWidth;
      canvas.height = sourceImg.naturalHeight;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(sourceImg, 0, 0, canvas.width, canvas.height);

      const isPortrait = sourceImg.naturalHeight > sourceImg.naturalWidth;
      const watermarkPreview = isPortrait ? watermarkPortraitPreview : watermarkLandscapePreview;

      if (watermarkPreview) {
        const watermarkImg = new window.Image();
        watermarkImg.onload = () => {
          ctx.globalAlpha = settings.opacity;
          ctx.drawImage(watermarkImg, 0, 0, canvas.width, canvas.height);
          ctx.globalAlpha = 1.0;
        };
        watermarkImg.src = watermarkPreview;
      }
    };
    sourceImg.src = sourcePreview;
  }, [
    sourceImagePreviews,
    selectedImageIndex,
    watermarkPortraitPreview,
    watermarkLandscapePreview,
    settings.opacity,
  ]);

  const applyWatermarkToAll = useCallback(async () => {
    if (!watermarkPortraitPreview && !watermarkLandscapePreview) {
      toast({
        title: 'Atenção',
        description: "Carregue pelo menos uma marca d'água primeiro.",
        variant: 'destructive',
      });
      return;
    }

    if (sourceImages.length === 0) {
      toast({
        title: 'Atenção',
        description: 'Carregue as imagens de origem primeiro.',
        variant: 'destructive',
      });
      return;
    }

    setIsProcessing(true);
    setProcessingProgress(0);
    const results: string[] = [];
    const offscreenCanvas = document.createElement('canvas');
    const ctx = offscreenCanvas.getContext('2d');

    if (!ctx) {
      setIsProcessing(false);
      return;
    }

    for (let i = 0; i < sourceImages.length; i++) {
      const sourceDataUri = sourceImagePreviews[i];
      const processedData = await new Promise<string>((resolve) => {
        const sourceImg = new window.Image();
        sourceImg.onload = () => {
          offscreenCanvas.width = sourceImg.naturalWidth;
          offscreenCanvas.height = sourceImg.naturalHeight;
          ctx.drawImage(sourceImg, 0, 0);

          const isPortrait = sourceImg.naturalHeight > sourceImg.naturalWidth;
          const watermarkToUse = isPortrait ? watermarkPortraitPreview : watermarkLandscapePreview;

          if (watermarkToUse) {
            const watermarkImg = new window.Image();
            watermarkImg.onload = () => {
              ctx.globalAlpha = settings.opacity;
              ctx.drawImage(watermarkImg, 0, 0, offscreenCanvas.width, offscreenCanvas.height);
              ctx.globalAlpha = 1.0;
              const fileType = sourceImages[i].type || 'image/jpeg';
              resolve(offscreenCanvas.toDataURL(fileType, 1.0));
            };
            watermarkImg.src = watermarkToUse;
          } else {
            const fileType = sourceImages[i].type || 'image/jpeg';
            resolve(offscreenCanvas.toDataURL(fileType, 1.0));
          }
        };
        sourceImg.src = sourceDataUri;
      });

      results.push(processedData);
      setProcessingProgress(((i + 1) / sourceImages.length) * 100);
    }

    setProcessedImages(results);
    setIsProcessing(false);
  }, [watermarkPortraitPreview, watermarkLandscapePreview, sourceImages, sourceImagePreviews, settings, toast]);

  const handleDownloadAll = useCallback(async () => {
    if (processedImages.length === 0) return;
    const zip = new JSZip();
    processedImages.forEach((dataUrl, index) => {
      const blob = dataURLtoBlob(dataUrl);
      if (blob) {
        zip.file(sourceImages[index].name, blob);
      }
    });

    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(zipBlob);
    link.download = 'watermarked_images.zip';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [processedImages, sourceImages]);

  return (
    <div className="min-h-screen w-full bg-background text-foreground">
      <header className="border-b border-border/50 bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <h1 className="text-2xl font-bold tracking-tight">Watermark Wiz</h1>
          <p className="text-sm text-muted-foreground hidden sm:block">
            Sua solução de marca d'água em lote
          </p>
        </div>
      </header>

      <main className="container mx-auto p-4 md:p-8">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
          <div className="lg:col-span-3 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>1. Carregar Marcas</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label className="font-semibold text-sm">Marca d'água (Retrato)</Label>
                    <div className="relative rounded-lg border-2 border-dashed border-border p-4 text-center transition hover:border-primary">
                      <input
                        type="file"
                        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                        onChange={(e) => handleWatermarkUpload(e, 'portrait')}
                        accept="image/png, image/jpeg"
                      />
                      <div className="flex flex-col items-center justify-center space-y-1 text-muted-foreground">
                        <Upload className="h-6 w-6" />
                        <span className="text-xs">Clique ou arraste</span>
                      </div>
                    </div>
                    {watermarkPortrait && (
                      <div className="flex items-center justify-between rounded-md bg-muted p-2 text-xs">
                        <span className="truncate flex-1">{watermarkPortrait.name}</span>
                        <Button variant="ghost" size="icon" className="h-4 w-4" onClick={() => {setWatermarkPortrait(null); setWatermarkPortraitPreview(null);}}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label className="font-semibold text-sm">Marca d'água (Paisagem)</Label>
                    <div className="relative rounded-lg border-2 border-dashed border-border p-4 text-center transition hover:border-primary">
                      <input
                        type="file"
                        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                        onChange={(e) => handleWatermarkUpload(e, 'landscape')}
                        accept="image/png, image/jpeg"
                      />
                      <div className="flex flex-col items-center justify-center space-y-1 text-muted-foreground">
                        <Upload className="h-6 w-6" />
                        <span className="text-xs">Clique ou arraste</span>
                      </div>
                    </div>
                    {watermarkLandscape && (
                      <div className="flex items-center justify-between rounded-md bg-muted p-2 text-xs">
                        <span className="truncate flex-1">{watermarkLandscape.name}</span>
                        <Button variant="ghost" size="icon" className="h-4 w-4" onClick={() => {setWatermarkLandscape(null); setWatermarkLandscapePreview(null);}}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>

                <Separator />

                <div className="space-y-2">
                  <Label className="font-semibold text-sm">Fotos de Origem</Label>
                  <div className="relative rounded-lg border-2 border-dashed border-border p-6 text-center transition hover:border-primary">
                    <input
                      type="file"
                      className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                      onChange={handleImagesUpload}
                      multiple
                      accept="image/jpeg, image/png"
                    />
                    <div className="flex flex-col items-center justify-center space-y-2 text-muted-foreground">
                      <ImageIcon className="h-8 w-8" />
                      <p className="text-xs">Carregar lote de fotos</p>
                    </div>
                  </div>
                  {sourceImages.length > 0 && (
                    <div className="flex items-center justify-between rounded-md bg-muted p-2 text-xs">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                        <span>{sourceImages.length} fotos</span>
                      </div>
                      <Button variant="ghost" size="icon" className="h-4 w-4" onClick={() => {setSourceImages([]); setSourceImagePreviews([]); setProcessedImages([]);}}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {sourceImages.length > 0 && (
              <Card>
                <CardHeader className="p-4">
                  <CardTitle className="text-sm">Fila de Fotos</CardTitle>
                </CardHeader>
                <CardContent className="max-h-60 overflow-y-auto p-4 pt-0">
                  <div className="space-y-1">
                    {sourceImagePreviews.map((preview, index) => (
                      <button
                        key={index}
                        onClick={() => setSelectedImageIndex(index)}
                        className={cn(
                          'flex w-full items-center gap-2 rounded-md p-1 text-left text-xs transition',
                          selectedImageIndex === index ? 'bg-primary/20 ring-1 ring-primary' : 'hover:bg-muted'
                        )}
                      >
                        <img src={preview} alt="" className="h-8 w-8 rounded object-cover" />
                        <span className="flex-1 truncate">{sourceImages[index].name}</span>
                      </button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          <div className="lg:col-span-6">
            <Card className="sticky top-24">
              <CardHeader className="p-4">
                <CardTitle className="text-sm">Pré-visualização</CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-muted flex items-center justify-center border">
                  {sourceImagePreviews.length > 0 ? (
                    <canvas ref={canvasRef} className="max-h-full max-w-full object-contain" />
                  ) : (
                    <div className="text-center text-muted-foreground text-sm p-4">
                      <p>Aguardando upload de fotos...</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-3 space-y-6">
            <Card className="sticky top-24">
              <CardHeader className="p-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">Configurações</CardTitle>
                  <Settings2 className="h-4 w-4 text-muted-foreground" />
                </div>
              </CardHeader>
              <CardContent className="space-y-6 p-4 pt-0">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-xs">Opacidade: {Math.round(settings.opacity * 100)}%</Label>
                    <Slider
                      value={[settings.opacity]}
                      onValueChange={([v]) => setSettings((s) => ({ ...s, opacity: v }))}
                      max={1}
                      step={0.01}
                    />
                  </div>
                </div>
                <Button
                  onClick={applyWatermarkToAll}
                  disabled={isProcessing || sourceImages.length === 0}
                  className="w-full"
                >
                  {isProcessing ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : 'Aplicar em Lote'}
                </Button>
                {isProcessing && (
                  <div className="space-y-1">
                    <Progress value={processingProgress} className="h-2" />
                    <p className="text-[10px] text-center text-muted-foreground">Processando {Math.round(processingProgress)}%</p>
                  </div>
                )}
                {processedImages.length > 0 && !isProcessing && (
                  <Button onClick={handleDownloadAll} variant="secondary" className="w-full">
                    <Download className="mr-2 h-4 w-4" />
                    Baixar ZIP
                  </Button>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {processedImages.length > 0 && (
          <div className="mt-8">
            <Card>
              <CardHeader>
                <CardTitle>Fotos Processadas</CardTitle>
                <CardDescription>Clique na foto para baixar individualmente.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-6">
                  {processedImages.map((src, index) => (
                    <div key={index} className="group relative aspect-square overflow-hidden rounded-lg border">
                      <img src={src} alt="" className="h-full w-full object-cover" />
                      <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                        <a href={src} download={sourceImages[index].name} className={cn(buttonVariants({ size: 'icon', variant: 'secondary' }))}>
                          <Download className="h-4 w-4" />
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
};
