import React, { useState, useCallback, useRef, useEffect } from 'react';
import { 
  Upload, 
  File as FileIcon, 
  Archive as ArchiveIcon, 
  Download, 
  Trash2, 
  Settings2, 
  Lock, 
  ShieldCheck, 
  Zap, 
  FileArchive,
  ArrowRight,
  Info,
  Github,
  Moon,
  Sun,
  Loader2,
  ChevronDown,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  User,
  Shield,
  Coins,
  ArrowLeft,
  Briefcase
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { saveAs } from 'file-saver';
import { cn, formatBytes } from './lib/utils';
import * as zip from '@zip.js/zip.js';
// @ts-ignore
import { Archive } from 'libarchive.js';

// Initialize LibArchive (Worker from CDN for stability in preview)
// @ts-ignore
Archive.init({
  workerUrl: 'https://cdn.jsdelivr.net/npm/libarchive.js@2.0.2/dist/worker-bundle.js'
});

// Types
interface FileItem {
  id: string;
  file: File;
  progress: number;
  status: 'idle' | 'processing' | 'completed' | 'error';
}

type Mode = 'compress' | 'extract';
type CompressionLevel = 'fast' | 'normal' | 'ultra';

export default function App() {
  const [activeView, setActiveView] = useState<'home' | 'about' | 'info' | 'privacy'>('home');
  const [mode, setMode] = useState<Mode>('compress');
  const [files, setFiles] = useState<FileItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [overallProgress, setOverallProgress] = useState(0);
  const [password, setPassword] = useState('');
  const [level, setLevel] = useState<CompressionLevel>('normal');
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [archiveName, setArchiveName] = useState('archive.zip');
  const [showProgress, setShowProgress] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isProcessing) return;
    const droppedFiles = Array.from(e.dataTransfer.files) as File[];
    addFiles(droppedFiles);
  }, [mode, isProcessing]);

  const addFiles = (newFiles: File[]) => {
    if (mode === 'extract' && newFiles.length > 0) {
      const f = newFiles[0];
      setFiles([{
        id: Math.random().toString(36).substr(2, 9),
        file: f,
        progress: 0,
        status: 'idle'
      }]);
      return;
    }

    const fileItems: FileItem[] = newFiles.map(f => ({
      id: Math.random().toString(36).substr(2, 9),
      file: f,
      progress: 0,
      status: 'idle'
    }));
    setFiles(prev => [...prev, ...fileItems]);
  };

  const removeFile = (id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id));
  };

  const clearFiles = () => setFiles([]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      addFiles(Array.from(e.target.files));
    }
  };

  // Compression Logic
  const compressFiles = async () => {
    if (files.length === 0) return;
    setIsProcessing(true);
    setShowProgress(true);
    setOverallProgress(0);

    try {
      const blobWriter = new zip.BlobWriter('application/zip');
      const zipWriter = new zip.ZipWriter(blobWriter, {
        password: password || undefined,
        zip64: true,
      });

      const levelMap: Record<CompressionLevel, number> = {
        fast: 1,
        normal: 5,
        ultra: 9
      };

      for (let i = 0; i < files.length; i++) {
        const item = files[i];
        setFiles(prev => prev.map(f => f.id === item.id ? { ...f, status: 'processing' } : f));
        
        await zipWriter.add(item.file.name, new zip.BlobReader(item.file), {
          level: levelMap[level],
          onprogress: (current, total) => {
            const p = (current / total) * 100;
            const totalP = (i / files.length) * 100 + (p / files.length);
            setOverallProgress(Math.min(totalP, 99));
            setFiles(prev => prev.map(f => f.id === item.id ? { ...f, progress: p } : f));
          }
        });
        
        setFiles(prev => prev.map(f => f.id === item.id ? { ...f, status: 'completed', progress: 100 } : f));
      }

      const resultBlob = await zipWriter.close();
      saveAs(resultBlob, archiveName.endsWith('.zip') ? archiveName : `${archiveName}.zip`);
      setOverallProgress(100);
      
      setTimeout(() => {
        setIsProcessing(false);
        setShowProgress(false);
        setOverallProgress(0);
      }, 1500);

    } catch (error) {
      console.error('Compression failed:', error);
      alert('Compression failed. Check file access or password requirements.');
      setIsProcessing(false);
    }
  };

  // Extraction Logic
  const extractFiles = async () => {
    if (files.length === 0) return;
    setIsProcessing(true);
    setShowProgress(true);
    setOverallProgress(0);

    try {
      const archiveFile = files[0].file;
      const extension = archiveFile.name.split('.').pop()?.toLowerCase();

      if (extension === 'zip') {
        const zipReader = new zip.ZipReader(new zip.BlobReader(archiveFile));
        const entries = await zipReader.getEntries();
        
        for (let i = 0; i < entries.length; i++) {
          const entry = entries[i] as any;
          if (entry.getData && !entry.directory) {
            const content = await entry.getData(new zip.BlobWriter(), {
              password: password || undefined,
              onprogress: (current: number, total: number) => {
                const p = (current / total) * 100;
                setOverallProgress(Math.min(((i + p / 100) / entries.length) * 100, 99));
              }
            });
            saveAs(content, entry.filename);
          }
        }
        await zipReader.close();
      } else {
        // RAR and others use libarchive.js
        // @ts-ignore
        const archive = await Archive.open(archiveFile);
        const obj = await archive.extractFiles();
        
        const downloadFiles = async (data: any, path = '') => {
          for (const key in data) {
            const item = data[key];
            if (item instanceof File) {
               saveAs(item, key);
            } else if (typeof item === 'object') {
              await downloadFiles(item, `${path}${key}/`);
            }
          }
        };
        
        await downloadFiles(obj);
      }

      setOverallProgress(100);
      setTimeout(() => {
        setIsProcessing(false);
        setShowProgress(false);
        setOverallProgress(0);
      }, 1500);

    } catch (error) {
      console.error('Extraction failed:', error);
      alert('Extraction failed. Format might be unsupported or restricted by the browser.');
      setIsProcessing(false);
    }
  };

  return (
    <div className={cn(
      "min-h-screen transition-colors duration-500 selection:bg-cyan-500/30 font-sans",
      isDarkMode ? "bg-[#0a0a0c] text-white" : "bg-gray-50 text-gray-900"
    )}>
      {/* Background Blobs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className={cn(
          "absolute -top-[10%] -left-[10%] w-[40%] h-[40%] rounded-full blur-[120px] transition-opacity duration-1000",
          isDarkMode ? "bg-cyan-500/10 opacity-50" : "bg-cyan-500/5 opacity-20"
        )} />
        <div className={cn(
          "absolute -bottom-[10%] -right-[10%] w-[40%] h-[40%] rounded-full blur-[120px] transition-opacity duration-1000",
          isDarkMode ? "bg-purple-600/10 opacity-50" : "bg-purple-600/5 opacity-20"
        )} />
      </div>

      <header className={cn(
        "fixed top-0 w-full z-50 border-b px-6 py-4 flex items-center justify-between backdrop-blur-xl",
        isDarkMode ? "bg-[#0a0a0c]/80 border-white/10" : "bg-white/80 border-gray-200 shadow-sm"
      )}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-400 to-purple-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
            <Zap className="w-6 h-6 text-white fill-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 to-purple-500">
              VoxZip
            </h1>
            <p className="text-[10px] text-gray-500 font-mono uppercase tracking-widest leading-none mt-0.5">High Performance Archiving</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setActiveView(activeView === 'info' ? 'home' : 'info')}
            className={cn(
              "p-2 rounded-xl transition-all duration-300 border hidden sm:flex",
              activeView === 'info' 
                ? "bg-cyan-500/10 border-cyan-500/30 text-cyan-500" 
                : (isDarkMode ? "bg-white/5 border-white/10 text-gray-400" : "bg-white border-gray-200 text-gray-600")
            )}
          >
            <HelpCircle className="w-5 h-5" />
          </button>
          <button 
            onClick={() => setIsDarkMode(!isDarkMode)}
            className={cn(
              "p-2 rounded-xl transition-all duration-300 border hover:shadow-lg",
              isDarkMode 
                ? "bg-white/5 border-white/10 text-gray-400 hover:text-white" 
                : "bg-white border-gray-200 text-gray-600 hover:text-gray-900 shadow-sm"
            )}
          >
            {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
        </div>
      </header>

      <main className="relative pt-32 pb-24 px-6 max-w-6xl mx-auto">
        <AnimatePresence mode="wait">
          {activeView === 'home' ? (
            <motion.div 
              key="home"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="grid grid-cols-1 lg:grid-cols-12 gap-8"
            >
              <div className="lg:col-span-12 xl:col-span-8 flex flex-col gap-6">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className={cn(
                    "flex gap-1 p-1 rounded-2xl border transition-colors",
                    isDarkMode ? "bg-white/5 border-white/5" : "bg-gray-100 border-gray-200"
                  )}>
                    <button 
                      onClick={() => { setMode('compress'); setFiles([]); }}
                      className={cn(
                        "px-6 py-2.5 rounded-xl text-sm font-semibold transition-all duration-300 flex items-center gap-2",
                        mode === 'compress' 
                          ? (isDarkMode ? "bg-white/10 text-white shadow-xl ring-1 ring-white/20" : "bg-white text-gray-900 shadow-sm") 
                          : "text-gray-500 hover:text-gray-300"
                      )}
                    >
                      <ArchiveIcon className="w-4 h-4" />
                      Compress
                    </button>
                    <button 
                      onClick={() => { setMode('extract'); setFiles([]); }}
                      className={cn(
                        "px-6 py-2.5 rounded-xl text-sm font-semibold transition-all duration-300 flex items-center gap-2",
                        mode === 'extract' 
                          ? (isDarkMode ? "bg-white/10 text-white shadow-xl ring-1 ring-white/20" : "bg-white text-gray-900 shadow-sm") 
                          : "text-gray-500 hover:text-gray-300"
                      )}
                    >
                      <FileArchive className="w-4 h-4" />
                      Extract
                    </button>
                  </div>

                  {files.length > 0 && (
                    <button 
                      onClick={clearFiles}
                      className="text-xs font-semibold text-red-500 hover:text-red-400 transition-colors flex items-center gap-1.5 bg-red-500/10 px-4 py-2 rounded-xl"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Clear All
                    </button>
                  )}
                </div>

                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  onDragOver={onDragOver}
                  onDrop={onDrop}
                  onClick={() => !isProcessing && fileInputRef.current?.click()}
                  className={cn(
                    "relative group h-80 rounded-3xl border-2 border-dashed flex flex-col items-center justify-center gap-4 cursor-pointer transition-all duration-500 overflow-hidden",
                    isDarkMode 
                      ? "border-white/10 bg-white/[0.02] hover:border-cyan-500/50 hover:bg-cyan-500/[0.02]" 
                      : "border-gray-200 bg-white hover:border-cyan-500/50 hover:bg-cyan-50/30 shadow-sm",
                    isProcessing && "opacity-50 pointer-events-none"
                  )}
                >
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    onChange={handleFileSelect} 
                    className="hidden" 
                    multiple={mode === 'compress'} 
                  />
                  
                  <div className={cn(
                    "w-20 h-20 rounded-3xl flex items-center justify-center group-hover:scale-110 group-hover:rotate-6 transition-all duration-500 shadow-2xl",
                    isDarkMode ? "bg-white/5 border border-white/5" : "bg-gray-100 border border-gray-100"
                  )}>
                    <Upload className="w-10 h-10 text-cyan-500" />
                  </div>
                  
                  <div className="text-center px-6">
                    <p className={cn(
                      "text-xl font-bold tracking-tight",
                      isDarkMode ? "text-gray-200" : "text-gray-700"
                    )}>
                      {mode === 'compress' ? 'Drop files to compress' : 'Drop archive to extract'}
                    </p>
                    <p className="text-sm text-gray-500 mt-2 max-w-xs mx-auto">
                      {mode === 'compress' 
                        ? 'Add multiple files or folders. Password protection supported.' 
                        : 'Supports .ZIP, .RAR, .7z, .TAR and more.'}
                    </p>
                  </div>

                  {isProcessing && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-sm z-50">
                      <div className="flex flex-col items-center gap-3">
                        <div className="w-12 h-12 rounded-full border-4 border-cyan-500 border-t-transparent animate-spin" />
                        <span className="text-sm font-bold tracking-widest uppercase text-cyan-400">Processing</span>
                      </div>
                    </div>
                  )}
                </motion.div>

                <AnimatePresence mode="popLayout">
                  {files.length > 0 && (
                    <motion.div 
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      className="grid grid-cols-1 md:grid-cols-2 gap-4"
                    >
                      {files.map(item => (
                        <motion.div 
                          layout
                          key={item.id}
                          initial={{ scale: 0.8, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          exit={{ scale: 0.8, opacity: 0 }}
                          className={cn(
                            "group relative rounded-2xl p-4 flex items-center gap-4 border transition-all duration-300",
                            isDarkMode 
                              ? "bg-white/5 border-white/10 hover:border-white/20 hover:bg-white/[0.08]" 
                              : "bg-white border-gray-100 shadow-sm hover:shadow-md hover:border-gray-200"
                          )}
                        >
                          <div className={cn(
                            "w-12 h-12 rounded-xl flex items-center justify-center shrink-0",
                            isDarkMode ? "bg-white/5" : "bg-gray-100"
                          )}>
                            {item.status === 'completed' ? <CheckCircle2 className="w-6 h-6 text-emerald-400" /> :
                             item.status === 'processing' ? <Loader2 className="w-6 h-6 text-cyan-400 animate-spin" /> :
                             item.status === 'error' ? <AlertCircle className="w-6 h-6 text-red-400" /> :
                             <FileIcon className="w-6 h-6 text-gray-400" />}
                          </div>
                          
                          <div className="flex-1 min-w-0 pr-8">
                            <h4 className="text-sm font-bold truncate">{item.file.name}</h4>
                            <p className="text-[10px] text-gray-500 font-mono mt-0.5">{formatBytes(item.file.size)}</p>
                          </div>

                          {!isProcessing && (
                            <button 
                              onClick={() => removeFile(item.id)}
                              className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-lg opacity-0 group-hover:opacity-100 transition-all hover:bg-red-500/10 text-red-400"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </motion.div>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div className="lg:col-span-12 xl:col-span-4">
                <div className="flex flex-col gap-6 lg:sticky lg:top-24">
                  
                  <motion.div 
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className={cn(
                      "rounded-3xl p-6 flex flex-col gap-8 border shadow-2xl relative overflow-hidden",
                      isDarkMode ? "bg-white/[0.02] border-white/10" : "bg-white border-gray-100"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-cyan-500/10 flex items-center justify-center">
                        <Settings2 className="w-5 h-5 text-cyan-500" />
                      </div>
                      <div>
                        <h2 className="font-bold text-lg tracking-tight">Configuration</h2>
                        <p className="text-[10px] text-gray-500 font-mono uppercase">Output Options</p>
                      </div>
                    </div>

                    {mode === 'compress' ? (
                      <div className="space-y-6">
                        <div className="space-y-3">
                          <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">Compression Level</label>
                          <div className="grid grid-cols-3 gap-2">
                            {(['fast', 'normal', 'ultra'] as const).map(l => (
                              <button
                                key={l}
                                disabled={isProcessing}
                                onClick={() => setLevel(l)}
                                className={cn(
                                  "py-2.5 rounded-xl text-xs font-bold border capitalize transition-all duration-300",
                                  level === l 
                                    ? "bg-cyan-500/10 border-cyan-500/30 text-cyan-500 shadow-inner" 
                                    : (isDarkMode ? "bg-white/5 border-transparent text-gray-500 hover:bg-white/10" : "bg-gray-100 border-transparent text-gray-500 hover:bg-gray-200")
                                )}
                              >
                                {l}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="space-y-3">
                          <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">Archive Name</label>
                          <input 
                            type="text" 
                            disabled={isProcessing}
                            value={archiveName}
                            onChange={(e) => setArchiveName(e.target.value)}
                            className={cn(
                              "w-full rounded-2xl px-5 py-4 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-cyan-500/30 transition-all border",
                              isDarkMode ? "bg-white/5 border-white/5 text-white" : "bg-gray-50 border-gray-100 text-gray-900"
                            )}
                            placeholder="archive.zip"
                          />
                        </div>

                        <div className="space-y-3">
                          <label className="text-xs font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2">
                            <Lock className="w-3.5 h-3.5" /> Password
                          </label>
                          <input 
                            type="password" 
                            disabled={isProcessing}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className={cn(
                              "w-full rounded-2xl px-5 py-4 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/30 transition-all border",
                              isDarkMode ? "bg-white/5 border-white/5 text-white" : "bg-gray-50 border-gray-100 text-gray-900"
                            )}
                            placeholder="Optional"
                          />
                        </div>
                      </div>
                    ) : (
                      <div className={cn(
                        "p-5 rounded-3xl border text-xs text-gray-500 leading-relaxed",
                        isDarkMode ? "bg-cyan-500/5 border-cyan-500/10" : "bg-cyan-50 border-cyan-100 shadow-inner"
                      )}>
                        Advanced extraction powered by LibArchive WebAssembly. Supports ZIP, RAR, 7Z, and more.
                      </div>
                    )}

                    <button 
                      disabled={files.length === 0 || isProcessing}
                      onClick={mode === 'compress' ? compressFiles : extractFiles}
                      className={cn(
                        "w-full py-5 rounded-3xl font-black text-sm uppercase tracking-widest flex items-center justify-center gap-3 transition-all duration-500 shadow-2xl relative overflow-hidden",
                        files.length === 0 || isProcessing
                          ? (isDarkMode ? "bg-white/5 text-gray-600 border border-white/5 cursor-not-allowed" : "bg-gray-100 text-gray-400 cursor-not-allowed")
                          : "bg-gradient-to-r from-cyan-500 via-blue-600 to-purple-600 text-white hover:scale-[1.02] active:scale-95 shadow-cyan-500/20"
                      )}
                    >
                      {isProcessing ? (
                         <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <>
                          {mode === 'compress' ? 'Assemble Archive' : 'Extract Files'}
                          <ArrowRight className="w-5 h-5" />
                        </>
                      )}
                    </button>
                  </motion.div>

                  <AnimatePresence>
                    {showProgress && (
                      <motion.div 
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        className={cn(
                          "rounded-3xl p-6 border shadow-2xl",
                          isDarkMode ? "bg-[#0c0c0e] border-cyan-500/30" : "bg-white border-cyan-500/30"
                        )}
                      >
                        <div className="flex items-center justify-between mb-4">
                          <span className="text-sm font-bold">{Math.round(overallProgress)}% Complete</span>
                          <div className="w-8 h-8 rounded-full border-2 border-cyan-500/20 border-t-cyan-500 animate-spin" />
                        </div>
                        
                        <div className={cn(
                          "h-3 rounded-full overflow-hidden p-0.5",
                          isDarkMode ? "bg-white/5" : "bg-gray-100"
                        )}>
                          <motion.div 
                            className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-600"
                            initial={{ width: 0 }}
                            animate={{ width: `${overallProgress}%` }}
                          />
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </motion.div>
          ) : activeView === 'about' ? (
            <motion.div 
              key="about"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="max-w-3xl mx-auto"
            >
              <button 
                onClick={() => setActiveView('home')}
                className="flex items-center gap-2 text-sm font-bold text-cyan-500 mb-8 hover:gap-3 transition-all"
              >
                <ArrowLeft className="w-4 h-4" /> Back to Workspace
              </button>
              
              <div className={cn(
                "rounded-3xl p-8 border shadow-2xl space-y-8",
                isDarkMode ? "bg-white/[0.02] border-white/10" : "bg-white border-gray-100"
              )}>
                <div className="flex items-center gap-4">
                   <div className="w-16 h-16 rounded-2xl bg-cyan-500/10 flex items-center justify-center shadow-inner">
                      <User className="w-8 h-8 text-cyan-500" />
                   </div>
                   <div>
                      <h2 className="text-2xl font-black tracking-tight">About VoxZip</h2>
                      <p className="text-sm text-gray-500">The next generation of browser-based archiving.</p>
                   </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2">
                      <Briefcase className="w-3.5 h-3.5" /> Company
                    </p>
                    <p className="text-lg font-bold">CodeTech</p>
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2">
                      <User className="w-3.5 h-3.5" /> Lead Developer
                    </p>
                    <p className="text-lg font-bold">Sachin Sheth</p>
                  </div>
                </div>

                <div className="space-y-4 pt-8 border-t border-white/5">
                  <h3 className="text-sm font-bold uppercase tracking-widest text-cyan-500">Ads Credit</h3>
                  <p className="text-sm text-gray-500 leading-relaxed italic">
                    Special thanks to our early adopters and the open-source community for making VoxZip possible. Supporting high-performance compression tools helps keep the web fast and secure.
                  </p>
                </div>
              </div>
            </motion.div>
          ) : activeView === 'info' ? (
            <motion.div 
              key="info"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="max-w-3xl mx-auto"
            >
              <button 
                onClick={() => setActiveView('home')}
                className="flex items-center gap-2 text-sm font-bold text-cyan-500 mb-8 hover:gap-3 transition-all"
              >
                <ArrowLeft className="w-4 h-4" /> Back to Workspace
              </button>
              
              <div className={cn(
                "rounded-3xl p-8 border shadow-2xl space-y-8",
                isDarkMode ? "bg-white/[0.02] border-white/10" : "bg-white border-gray-100"
              )}>
                <div className="flex items-center gap-4">
                   <div className="w-16 h-16 rounded-2xl bg-purple-500/10 flex items-center justify-center shadow-inner">
                      <HelpCircle className="w-8 h-8 text-purple-500" />
                   </div>
                   <div>
                      <h2 className="text-2xl font-black tracking-tight">App Information</h2>
                      <p className="text-sm text-gray-500">Technical details and capabilities.</p>
                   </div>
                </div>

                <div className="space-y-6">
                  <div className="p-6 rounded-2xl bg-white/5 border border-white/5">
                    <h4 className="font-bold text-white mb-2">Browser-Only Processing</h4>
                    <p className="text-sm text-gray-400">Unlike other tools, VoxZip never uploads your files to a server. All compression and extraction happens locally in your browser's RAM and WebWorker sandbox.</p>
                  </div>
                  
                  <div className="p-6 rounded-2xl bg-white/5 border border-white/5">
                    <h4 className="font-bold text-white mb-2">Supported Formats</h4>
                    <p className="text-sm text-gray-400">Compression: .ZIP (Deflate/No-Store)</p>
                    <p className="text-sm text-gray-400 mt-1">Extraction: .ZIP, .RAR (v4/v5), .7Z, .TAR, .GZ, .XZ, and more via LibArchive.js (WASM).</p>
                  </div>

                  <div className="p-6 rounded-2xl bg-white/5 border border-white/5">
                    <h4 className="font-bold text-white mb-2">Security</h4>
                    <p className="text-sm text-gray-400">VoxZip supports password-protected ZIP archives using standard ZipCrypto or AES encryption (browser capability depending).</p>
                  </div>
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div 
              key="privacy"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="max-w-3xl mx-auto"
            >
              <button 
                onClick={() => setActiveView('home')}
                className="flex items-center gap-2 text-sm font-bold text-cyan-500 mb-8 hover:gap-3 transition-all"
              >
                <ArrowLeft className="w-4 h-4" /> Back to Workspace
              </button>
              
              <div className={cn(
                "rounded-3xl p-8 border shadow-2xl space-y-8",
                isDarkMode ? "bg-white/[0.02] border-white/10" : "bg-white border-gray-100"
              )}>
                <div className="flex items-center gap-4">
                   <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 flex items-center justify-center shadow-inner">
                      <Shield className="w-8 h-8 text-emerald-500" />
                   </div>
                   <div>
                      <h2 className="text-2xl font-black tracking-tight">Privacy Policy</h2>
                      <p className="text-sm text-gray-500">Your data, your control.</p>
                   </div>
                </div>

                <div className="space-y-6 text-gray-400 text-sm leading-relaxed">
                  <p>At VoxZip, we believe privacy is a fundamental right. Our application is built on a "Privacy by Design" principle:</p>
                  
                  <ul className="list-disc pl-5 space-y-4">
                    <li><strong>Zero Uploads:</strong> Your files never leave your device. All archiving logic executes on the client-side.</li>
                    <li><strong>No Tracking:</strong> We do not store cookies or track your usage patterns. VoxZip is a tool, not a data harvester.</li>
                    <li><strong>Memory Lifecycle:</strong> Files processed are stored only in volatile memory during the operation and are never persisted by VoxZip.</li>
                    <li><strong>Local Sandbox:</strong> Browser security features ensure that VoxZip can only access files you explicitly select or drop.</li>
                  </ul>

                  <p className="pt-4 italic">VoxZip is committed to open, transparent, and secure computing.</p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <footer className={cn(
        "py-12 border-t px-6 transition-colors duration-500 mt-auto",
        isDarkMode ? "bg-black/50 border-white/5 text-gray-500" : "bg-white border-gray-100 text-gray-400"
      )}>
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="flex flex-col items-center md:items-start gap-2">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-cyan-400" />
              <span className="text-sm font-bold text-white">VoxZip</span>
            </div>
            <p className="text-[10px] opacity-50 font-mono tracking-widest uppercase">
              Client-side high-performance archiving.
            </p>
          </div>

          <div className="flex flex-wrap justify-center gap-6 text-[10px] font-bold uppercase tracking-widest leading-none">
            <button onClick={() => setActiveView('about')} className="hover:text-cyan-500 transition-colors">About</button>
            <button onClick={() => setActiveView('info')} className="hover:text-cyan-500 transition-colors">Info</button>
            <button onClick={() => setActiveView('privacy')} className="hover:text-cyan-500 transition-colors">Privacy</button>
            <a href="https://github.com" target="_blank" rel="noopener noreferrer" className="hover:text-cyan-500 transition-colors">Github</a>
          </div>

          <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/5">
            <Coins className="w-3 h-3 text-yellow-500" />
            <span className="text-[10px] font-bold uppercase text-gray-500">Free & Unlimited</span>
          </div>
        </div>
      </footer>

      <style>{`
        ::-webkit-scrollbar {
          width: 8px;
        }
        ::-webkit-scrollbar-track {
          background: ${isDarkMode ? '#0a0a0c' : '#f9fafb'};
        }
        ::-webkit-scrollbar-thumb {
          background: ${isDarkMode ? '#1c1c21' : '#e5e7eb'};
          border-radius: 20px;
        }
      `}</style>
    </div>
  );
}
