'use client';

import {useState, useRef, useEffect, useCallback, type ChangeEvent, type FC} from 'react';
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
import {Button, buttonVariants} from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import {Slider} from '@/components/ui/slider';
import {Label} from '@/components/ui/label';
import {Progress} from '@/components/ui/progress';
import {Separator} from '@/components/ui/separator';
import {useToast} from '@/hooks/use-toast';
import {cn} from '@/lib/utils';

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
  return new Blob([u8arr], {type: mime});
};

export const WatermarkWiz: FC = () => {
  const {toast} = useToast();
  const [watermark, setWatermark] = useState<File | null>(null);
  const [watermarkPreview, setWatermarkPreview] = useState<string | null>(null);
  const [sourceImages, setSourceImages] = useState<File[]>([]);
  const [sourceImagePreviews, setSourceImagePreviews] = useState<string[]>([]);
  const [processedImages, setProcessedImages] = useState<string[]>([]);
  const [settings, setSettings] = useState<WatermarkSettings>({opacity: 0.92});
  const [selectedImageIndex, setSelectedImageIndex] = useState<number>(0);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [processingProgress, setProcessingProgress] = useState<number>(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const handleWatermarkUpload = useCallback(async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setWatermark(file);
      const preview = await fileToDataURL(file);
      setWatermarkPreview(preview);
    }
  }, []);

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

  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    const sourcePreview = sourceImagePreviews[selectedImageIndex];

    if (!ctx || !canvas || !watermarkPreview || !sourcePreview) return;

    const sourceImg = new window.Image();
    const watermarkImg = new window.Image();

    sourceImg.onload = () => {
      watermarkImg.onload = () => {
        canvas.width = sourceImg.naturalWidth;
        canvas.height = sourceImg.naturalHeight;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(sourceImg, 0, 0, canvas.width, canvas.height);

        ctx.globalAlpha = settings.opacity;
        ctx.drawImage(watermarkImg, 0, 0, canvas.width, canvas.height);
        ctx.globalAlpha = 1.0;
      };
      watermarkImg.src = watermarkPreview;
    };
    sourceImg.src = sourcePreview;
  }, [watermarkPreview, sourceImagePreviews, selectedImageIndex, settings]);

  useEffect(() => {
    if (sourceImagePreviews.length > 0 && watermarkPreview) {
      drawCanvas();
    }
  }, [drawCanvas, sourceImagePreviews, watermarkPreview]);

  const applyWatermarkToAll = useCallback(async () => {
    if (!watermark || sourceImages.length === 0) {
      toast({
        title: 'Error',
        description: 'Upload watermark and images first.',
        variant: 'destructive',
      });
      return;
    }

    setIsProcessing(true);
    setProcessingProgress(0);
    const results: string[] = [];
    const offscreenCanvas = document.createElement('canvas');
    const ctx = offscreenCanvas.getContext('2d');

    if (!ctx || !watermarkPreview) {
      toast({
        title: 'Error',
        description: 'Could not start processing.',
        variant: 'destructive',
      });
      setIsProcessing(false);
      return;
    }

    for (let i = 0; i < sourceImages.length; i++) {
      const sourceDataUri = sourceImagePreviews[i];
      const processedData = await new Promise<string>((resolve) => {
        const sourceImg = new window.Image();
        const watermarkImg = new window.Image();
        sourceImg.onload = () => {
          watermarkImg.onload = () => {
            offscreenCanvas.width = sourceImg.naturalWidth;
            offscreenCanvas.height = sourceImg.naturalHeight;
            ctx.drawImage(sourceImg, 0, 0);
            ctx.globalAlpha = settings.opacity;
            ctx.drawImage(
              watermarkImg,
              0,
              0,
              offscreenCanvas.width,
              offscreenCanvas.height
            );
            ctx.globalAlpha = 1.0;
            const fileType = sourceImages[i].type === 'image/jpeg' ? 'image/jpeg' : 'image/png';
            resolve(offscreenCanvas.toDataURL(fileType, 1.0));
          };
          watermarkImg.src = watermarkPreview!;
        };
        sourceImg.src = sourceDataUri;
      });

      results.push(processedData);
      setProcessingProgress(((i + 1) / sourceImages.length) * 100);
    }

    setProcessedImages(results);
    setIsProcessing(false);
  }, [watermark, watermarkPreview, sourceImages, sourceImagePreviews, settings, toast]);

  const handleDownloadAll = useCallback(async () => {
    if (processedImages.length === 0) return;
    const zip = new JSZip();
    processedImages.forEach((dataUrl, index) => {
      const blob = dataURLtoBlob(dataUrl);
      if (blob) {
        zip.file(sourceImages[index].name, blob);
      }
    });

    const zipBlob = await zip.generateAsync({type: 'blob'});
    const link = document.createElement('a');
    link.href = URL.createObjectURL(zipBlob);
    link.download = 'watermarked_images.zip';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
  }, [processedImages, sourceImages]);

  return (
    <div className="min-h-screen w-full bg-background text-foreground">
      <header className="border-b border-border/50 bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <h1 className="text-2xl font-bold tracking-tight">Watermark Wiz</h1>
          <p className="text-sm text-muted-foreground">
            Your batch watermarking solution
          </p>
        </div>
      </header>

      <main className="container mx-auto p-4 md:p-8">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
          <div className="lg:col-span-3 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>1. Upload Files</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label className="text-lg font-semibold">Watermark</Label>
                  <div className="relative rounded-lg border-2 border-dashed border-border p-6 text-center transition hover:border-primary">
                    <input
                      id="watermark-upload"
                      type="file"
                      className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                      onChange={handleWatermarkUpload}
                      multiple={false}
                      accept="image/png, image/jpeg"
                    />
                    <div className="flex flex-col items-center justify-center space-y-2 text-muted-foreground">
                      <Upload className="h-10 w-10" />
                      <p>Drag & drop or click to upload</p>
                    </div>
                  </div>
                  {watermark && (
                    <div className="pt-2">
                      <div className="flex items-center justify-between rounded-md bg-muted p-2">
                        <div className="flex items-center gap-2 text-sm font-medium">
                          <CheckCircle2 className="h-5 w-5 text-green-500" />
                          <span>{watermark.name}</span>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => {
                            setWatermark(null);
                            setWatermarkPreview(null);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <Label className="text-lg font-semibold">Images</Label>
                  <div className="relative rounded-lg border-2 border-dashed border-border p-6 text-center transition hover:border-primary">
                    <input
                      id="images-upload"
                      type="file"
                      className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                      onChange={handleImagesUpload}
                      multiple={true}
                      accept="image/jpeg, image/png"
                    />
                    <div className="flex flex-col items-center justify-center space-y-2 text-muted-foreground">
                      <ImageIcon className="h-10 w-10" />
                      <p>Drag & drop or click to upload</p>
                    </div>
                  </div>
                  {sourceImages.length > 0 && (
                    <div className="pt-2">
                      <div className="flex items-center justify-between rounded-md bg-muted p-2">
                        <div className="flex items-center gap-2 text-sm font-medium">
                          <CheckCircle2 className="h-5 w-5 text-green-500" />
                          <span>{`${sourceImages.length} file(s) loaded`}</span>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => {
                            setSourceImages([]);
                            setSourceImagePreviews([]);
                            setProcessedImages([]);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {sourceImages.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Image Queue</CardTitle>
                  <CardDescription>
                    {sourceImages.length} images ready to process.
                  </CardDescription>
                </CardHeader>
                <CardContent className="max-h-96 overflow-y-auto">
                  <div className="space-y-2">
                    {sourceImagePreviews.map((preview, index) => (
                      <button
                        key={index}
                        onClick={() => setSelectedImageIndex(index)}
                        className={cn(
                          'flex w-full items-center gap-3 rounded-md p-2 text-left transition',
                          selectedImageIndex === index
                            ? 'bg-primary/50 ring-2 ring-primary'
                            : 'hover:bg-muted'
                        )}
                      >
                        <Image
                          src={preview}
                          alt={`Preview ${index + 1}`}
                          width={48}
                          height={48}
                          className="h-12 w-12 rounded-md object-cover"
                        />
                        <span className="flex-1 truncate font-medium">
                          {sourceImages[index].name}
                        </span>
                      </button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          <div className="lg:col-span-6">
            <Card className="sticky top-24">
              <CardHeader>
                <CardTitle>2. Preview Editor</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-muted flex items-center justify-center">
                  {!watermarkPreview || sourceImagePreviews.length === 0 ? (
                    <div className="text-center text-muted-foreground p-4">
                      <p>Upload a watermark and an image to begin.</p>
                    </div>
                  ) : (
                    <canvas
                      ref={canvasRef}
                      className="max-h-full max-w-full object-contain"
                    />
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-3 space-y-6">
            <Card className="sticky top-24">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>3. Adjustments</CardTitle>
                  <Settings2 className="h-5 w-5 text-muted-foreground" />
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="opacity">
                      Opacity: {Math.round(settings.opacity * 100)}%
                    </Label>
                    <Slider
                      id="opacity"
                      value={[settings.opacity]}
                      onValueChange={([v]) =>
                        setSettings((s) => ({...s, opacity: v}))
                      }
                      max={1}
                      step={0.01}
                    />
                  </div>
                </div>
                <Separator />
                <Button
                  onClick={applyWatermarkToAll}
                  disabled={
                    isProcessing || !watermark || sourceImages.length === 0
                  }
                  className="w-full"
                >
                  {isProcessing && (
                    <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Apply to All
                </Button>
                {isProcessing && (
                  <div className="space-y-2">
                    <Progress value={processingProgress} />
                    <p className="text-sm text-center text-muted-foreground">
                      Processing {Math.round(processingProgress)}%
                    </p>
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
                    <CardTitle>4. Results</CardTitle>
                    <CardDescription>
                      {processedImages.length} images successfully processed.
                    </CardDescription>
                  </div>
                  <Button onClick={handleDownloadAll}>
                    <Download className="mr-2 h-4 w-4" />
                    Download All (ZIP)
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
                  {processedImages.map((src, index) => (
                    <div
                      key={index}
                      className="group relative aspect-square overflow-hidden rounded-lg"
                    >
                      <Image
                        src={src}
                        alt={`Processed image ${index + 1}`}
                        fill
                        className="object-cover"
                      />
                      <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
                        <a
                          href={src}
                          download={sourceImages[index].name}
                          className={cn(buttonVariants({size: 'icon'}))}
                        >
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
};
