import React, { useState, useRef, useEffect } from 'react';
import { Upload, Download, Settings, Image as ImageIcon, Trash2 } from 'lucide-react';

export default function App() {
  const [image1, setImage1] = useState<string | null>(null);
  const [image2, setImage2] = useState<string | null>(null);
  const [padding, setPadding] = useState(20);
  const [imageScale, setImageScale] = useState(0.9);
  const [aspectRatio, setAspectRatio] = useState<'portrait' | 'landscape'>('portrait');
  const [format, setFormat] = useState<'image/jpeg' | 'image/png'>('image/jpeg');
  const [fileSize, setFileSize] = useState<number | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [finalBlob, setFinalBlob] = useState<Blob | null>(null);
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const downloadAnchorRef = useRef<HTMLAnchorElement>(null);

  // Handle file uploads
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, imageNumber: 1 | 2) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target?.result as string;
        if (imageNumber === 1) setImage1(dataUrl);
        else setImage2(dataUrl);

        // Auto-detect orientation to set layout automatically
        const img = new Image();
        img.onload = () => {
          if (img.width > img.height) {
            setAspectRatio('landscape'); // Stacked Vertical for wide images
          } else {
            setAspectRatio('portrait'); // Side by Side for tall images
          }
        };
        img.src = dataUrl;
      };
      reader.readAsDataURL(file);
    }
  };

  const clearImage = (imageNumber: 1 | 2) => {
    if (imageNumber === 1) setImage1(null);
    else setImage2(null);
  };

  // Generate the A4 canvas
  useEffect(() => {
    let isCancelled = false;

    const process = async () => {
      if (!canvasRef.current || (!image1 && !image2)) {
        setFileSize(null);
        setFinalBlob(null);
        return;
      }
      setIsGenerating(true);

      const loadImage = (src: string): Promise<HTMLImageElement> => {
        return new Promise((resolve) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.src = src;
        });
      };

      try {
        const img1 = image1 ? await loadImage(image1) : null;
        const img2 = image2 ? await loadImage(image2) : null;
        if (isCancelled) return;

        const baseRes = 1654; /* 200 DPI A4 Width */

        const drawToCanvas = (targetCtx?: CanvasRenderingContext2D | null, testQuality?: number): Promise<Blob | null> => {
          return new Promise((resolve) => {
            const w = targetCtx ? 800 : baseRes;
            const h = w * 1.414;
            const c = targetCtx || document.createElement('canvas').getContext('2d')!;
            c.canvas.width = w;
            c.canvas.height = h;
            c.fillStyle = '#FFFFFF';
            c.fillRect(0, 0, w, h);

            const drawImageCentered = (img: HTMLImageElement, xCenter: number, yCenter: number) => {
              const imgAspect = img.width / img.height;
              
              const compartmentW = aspectRatio === 'portrait' ? w * 0.5 : w;
              const compartmentH = aspectRatio === 'portrait' ? h : h * 0.5;
              
              let drawWidth = compartmentW * imageScale;
              let drawHeight = drawWidth / imgAspect;
              
              if (drawHeight > compartmentH * imageScale) {
                drawHeight = compartmentH * imageScale;
                drawWidth = drawHeight * imgAspect;
              }
              c.drawImage(img, xCenter - drawWidth / 2, yCenter - drawHeight / 2, drawWidth, drawHeight);
            };

            const scaledPadding = padding * (w / 800);
            if (aspectRatio === 'portrait') {
              if (img1) drawImageCentered(img1, w * 0.25 + scaledPadding, h / 2);
              if (img2) drawImageCentered(img2, w * 0.75 - scaledPadding, h / 2);
            } else {
              if (img1) drawImageCentered(img1, w / 2, h * 0.25 + scaledPadding);
              if (img2) drawImageCentered(img2, w / 2, h * 0.75 - scaledPadding);
            }

            if (!targetCtx) {
              if (format === 'image/jpeg') {
                c.canvas.toBlob((b) => resolve(b), 'image/jpeg', testQuality ?? 0.8);
              } else {
                c.canvas.toBlob((b) => resolve(b), 'image/png');
              }
            } else {
              resolve(null);
            }
          });
        };

        // Draw preview immediately
        await drawToCanvas(canvasRef.current.getContext('2d'));

        if (format === 'image/png') {
          const blob = await drawToCanvas(null);
          if (!isCancelled && blob) {
             setFinalBlob(blob);
             setFileSize(blob.size);
             setIsGenerating(false);
          }
        } else {
          // Binary search for ~150KB
          let minQ = 0.05;
          let maxQ = 0.95;
          let bestBlob: Blob | null = null;
          let closestDiff = Infinity;

          for (let i = 0; i < 7; i++) {
            if (isCancelled) break;
            const testQ = (minQ + maxQ) / 2;
            const blob = await drawToCanvas(null, testQ);
            if (!blob) continue;

            const size = blob.size;
            const diff = Math.abs(size - 150 * 1024);
            
            if (diff < closestDiff) {
               closestDiff = diff;
               bestBlob = blob;
            }

            if (size > 160 * 1024) {
              maxQ = testQ;
            } else if (size < 140 * 1024) {
              minQ = testQ;
            } else {
              break; // Within 140-160 KB range
            }
          }

          if (!isCancelled && bestBlob) {
            setFinalBlob(bestBlob);
            setFileSize(bestBlob.size);
            setIsGenerating(false);
          }
        }
      } catch (err) {
        console.error("Error drawing images", err);
        if (!isCancelled) setIsGenerating(false);
      }
    };

    const timeout = setTimeout(process, 500);
    return () => {
      clearTimeout(timeout);
      isCancelled = true;
    };
  }, [image1, image2, padding, imageScale, aspectRatio, format]);

  const handleDownload = () => {
    if (finalBlob && downloadAnchorRef.current) {
      const url = URL.createObjectURL(finalBlob);
      const ext = format === 'image/jpeg' ? 'jpg' : 'png';
      downloadAnchorRef.current.href = url;
      downloadAnchorRef.current.download = `A4_ID_Combined_${Date.now()}.${ext}`;
      downloadAnchorRef.current.click();
      URL.revokeObjectURL(url);
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getFileSizeColor = () => {
    if (!fileSize) return 'text-gray-500';
    const kb = fileSize / 1024;
    if (kb >= 100 && kb <= 180) return 'text-green-600 font-bold';
    if (kb > 180) return 'text-orange-600 font-bold';
    return 'text-blue-600 font-bold'; // under 100kb
  };

  return (
    <div className="min-h-screen bg-[var(--color-natural-bg)] text-[var(--color-natural-text)] flex flex-col font-sans overflow-x-hidden">
      
      {/* Navigation Bar */}
      <nav className="px-6 md:px-10 py-6 flex justify-between items-center border-b border-[var(--color-natural-border)] bg-white/50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[var(--color-natural-accent)] rounded-full flex items-center justify-center">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <span className="font-serif text-2xl font-semibold tracking-tight text-[var(--color-natural-text)]">DuoPrint A4</span>
        </div>
        <div className="hidden md:flex items-center gap-8 text-sm font-medium opacity-70">
          <span className="text-[var(--color-natural-accent)] font-semibold">Optimizer Active</span>
        </div>
      </nav>

      {/* Main Workspace */}
      <main className="flex-1 max-w-7xl w-full mx-auto grid grid-cols-1 md:grid-cols-12 gap-8 lg:gap-12 p-6 md:p-10">
        
        {/* Left Controls */}
        <div className="md:col-span-5 flex flex-col gap-6">
          <header>
            <h1 className="font-serif text-4xl mb-2 text-[var(--color-natural-text)]">Compose & Compress</h1>
            <p className="font-sans text-sm text-[#8E8C7D] leading-relaxed">
              Merge two images onto a standard A4 canvas. Adjust settings to confidently hit the <span className="font-semibold text-[var(--color-natural-accent)]">100KB – 200KB</span> target.
            </p>
          </header>

          <div className="flex flex-col gap-4">
            {/* Upload Slot 1 */}
            <div>
              {!image1 ? (
                <label className="dashed-border h-36 rounded-3xl flex flex-col items-center justify-center bg-white/50 hover:bg-white transition-colors cursor-pointer group relative">
                  <input type="file" accept="image/*" onChange={(e) => handleImageUpload(e, 1)} className="absolute inset-0 opacity-0 cursor-pointer" />
                  <div className="w-10 h-10 rounded-full bg-[var(--color-natural-surface)] flex items-center justify-center mb-2 group-hover:scale-105 transition-transform">
                    <svg className="w-5 h-5 text-[var(--color-natural-accent)]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"/></svg>
                  </div>
                  <p className="text-xs font-semibold uppercase tracking-widest text-[var(--color-natural-accent)]">Primary Image</p>
                  <p className="text-[10px] opacity-50 mt-1">PNG, JPG allowed</p>
                </label>
              ) : (
                <div className="relative rounded-3xl overflow-hidden border border-[var(--color-natural-border)] group h-36">
                  <img src={image1} alt="Front preview" className="w-full h-full object-cover bg-white" />
                  <button onClick={() => clearImage(1)} className="absolute top-3 right-3 p-2 bg-white/90 text-red-600 rounded-full shadow-sm opacity-0 group-hover:opacity-100 transition-opacity">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>

            {/* Upload Slot 2 */}
            <div>
              {!image2 ? (
                <label className="dashed-border h-36 rounded-3xl flex flex-col items-center justify-center bg-white/50 hover:bg-white transition-colors cursor-pointer group relative">
                  <input type="file" accept="image/*" onChange={(e) => handleImageUpload(e, 2)} className="absolute inset-0 opacity-0 cursor-pointer" />
                  <div className="w-10 h-10 rounded-full bg-[var(--color-natural-surface)] flex items-center justify-center mb-2 group-hover:scale-105 transition-transform">
                    <svg className="w-5 h-5 text-[var(--color-natural-accent)]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"/></svg>
                  </div>
                  <p className="text-xs font-semibold uppercase tracking-widest text-[var(--color-natural-accent)]">Secondary Image</p>
                  <p className="text-[10px] opacity-50 mt-1">Auto-scaled to fit</p>
                </label>
              ) : (
                <div className="relative rounded-3xl overflow-hidden border border-[var(--color-natural-border)] group h-36">
                  <img src={image2} alt="Back preview" className="w-full h-full object-cover bg-white" />
                  <button onClick={() => clearImage(2)} className="absolute top-3 right-3 p-2 bg-white/90 text-red-600 rounded-full shadow-sm opacity-0 group-hover:opacity-100 transition-opacity">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
            <div>
               <label className="block text-[10px] font-bold uppercase tracking-wider opacity-60 mb-2">Image Scale</label>
               <input type="range" min="0.1" max="1" step="0.01" value={imageScale} onChange={(e) => setImageScale(Number(e.target.value))} className="w-full accent-[var(--color-natural-accent)]" />
            </div>
            <div>
               <label className="block text-[10px] font-bold uppercase tracking-wider opacity-60 mb-2">Spacing</label>
               <input type="range" min="-100" max="200" step="1" value={padding} onChange={(e) => setPadding(Number(e.target.value))} className="w-full accent-[var(--color-natural-accent)]" />
            </div>
            <div>
               <label className="block text-[10px] font-bold uppercase tracking-wider opacity-60 mb-2">Layout</label>
               <select 
                  value={aspectRatio} 
                  onChange={(e) => setAspectRatio(e.target.value as 'portrait' | 'landscape')}
                  className="w-full text-sm bg-white border border-[var(--color-natural-border)] rounded-md px-2 py-1 outline-none text-[var(--color-natural-text)] focus:border-[var(--color-natural-accent)]"
                >
                  <option value="portrait">Side by Side</option>
                  <option value="landscape">Stacked Vertical</option>
               </select>
            </div>
            <div>
               <label className="block text-[10px] font-bold uppercase tracking-wider opacity-60 mb-2">Output Format</label>
               <select 
                  value={format} 
                  onChange={(e) => setFormat(e.target.value as 'image/jpeg' | 'image/png')}
                  className="w-full text-sm bg-white border border-[var(--color-natural-border)] rounded-md px-2 py-1 outline-none text-[var(--color-natural-text)] focus:border-[var(--color-natural-accent)]"
                >
                  <option value="image/jpeg">JPG (~150KB Target)</option>
                  <option value="image/png">PNG (Raw Quality, Large)</option>
               </select>
            </div>
          </div>

          {/* Target File Size Info */}
          <div className="mt-auto bg-[var(--color-natural-surface)] p-5 rounded-2xl flex items-center justify-between">
            <span className="text-xs font-bold uppercase opacity-60 tracking-wider">Output Target</span>
            <span className="text-xs font-mono bg-white px-2 py-1 rounded border border-[var(--color-natural-border)] text-[var(--color-natural-accent)]">
              {fileSize ? formatBytes(fileSize) : '~150 KB (Auto)'}
            </span>
          </div>

        </div>

        {/* Right Preview */}
        <div className="md:col-span-7 flex flex-col items-center justify-center">
          
          <div className={`a4-preview bg-white w-full max-w-[420px] flex flex-col border border-[var(--color-natural-border)] rounded-sm relative shadow-2xl transition-all duration-500`}>
            {(!image1 && !image2) ? (
              <div className="w-full h-full flex flex-col p-8 gap-4">
                {/* Placeholder for Pic 1 */}
                <div className="w-full h-1/2 bg-[var(--color-natural-bg)] border border-dashed border-[var(--color-natural-border)] flex items-center justify-center">
                  <span className="font-serif italic text-sm opacity-30 text-[var(--color-natural-accent)]">Upper Frame Preview</span>
                </div>
                {/* Placeholder for Pic 2 */}
                <div className="w-full h-1/2 bg-[var(--color-natural-bg)] border border-dashed border-[var(--color-natural-border)] flex items-center justify-center">
                  <span className="font-serif italic text-sm opacity-30 text-[var(--color-natural-accent)]">Lower Frame Preview</span>
                </div>
              </div>
            ) : (
                <div className="absolute inset-0">
                   <canvas 
                      ref={canvasRef} 
                      className="w-full h-full object-contain pointer-events-none"
                    />
                    {isGenerating && (
                      <div className="absolute inset-0 bg-white/40 backdrop-blur-[1px] flex items-center justify-center rounded-sm">
                        <span className="text-sm font-medium px-4 py-2 bg-white rounded-full shadow-sm text-[var(--color-natural-text)] animate-pulse">Processing...</span>
                      </div>
                    )}
                </div>
            )}
          </div>

          <div className="mt-10 flex flex-col sm:flex-row gap-4 w-full justify-center">
            <button 
              onClick={handleDownload}
              disabled={!finalBlob || isGenerating}
              className="px-8 py-3 bg-[var(--color-natural-accent)] text-white rounded-full font-medium shadow-lg shadow-[var(--color-natural-accent)]/20 flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:bg-opacity-50 disabled:cursor-not-allowed"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
              Download {format === 'image/jpeg' ? 'JPG' : 'PNG'}
            </button>
            <button 
               onClick={() => { clearImage(1); clearImage(2); }}
               className="px-8 py-3 bg-white border border-[var(--color-natural-border)] text-[var(--color-natural-accent)] rounded-full font-medium hover:bg-[var(--color-natural-surface)] transition-colors text-center"
            >
              Start Over
            </button>
          </div>
          
          <div className="mt-4 text-center">
             {fileSize && (
                <p className="text-xs text-[var(--color-natural-accent)]/80 font-medium tracking-wide">
                   Automatically sized to {formatBytes(fileSize)}
                </p>
             )}
          </div>

        </div>

      </main>

      {/* Status Bar */}
      <footer className="mt-auto px-6 md:px-10 py-3 bg-[var(--color-natural-accent)] text-[var(--color-natural-surface)] text-[10px] flex flex-col sm:flex-row gap-2 sm:gap-0 justify-between uppercase tracking-[0.2em] font-medium selection:bg-white/20">
        <span>Ready for processing</span>
        <span className="opacity-80">Organic Compression</span>
      </footer>

      <a ref={downloadAnchorRef} style={{ display: 'none' }} />
    </div>
  );

}
