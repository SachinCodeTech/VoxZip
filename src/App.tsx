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
  Briefcase,
  Home,
  LayoutGrid,
  Menu,
  X,
  Eye,
  EyeOff,
  FileText,
  Image as ImageIcon,
  Video,
  Music
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { saveAs } from 'file-saver';
import { cn, formatBytes } from './lib/utils';
import * as zip from '@zip.js/zip.js';
// @ts-ignore
import { Archive as LibArchive } from 'libarchive.js';

// Types
interface FileItem {
  id: string;
  file: File;
  progress: number;
  status: 'idle' | 'processing' | 'completed' | 'error';
  compressedSize?: number;
  errorMessage?: string;
}

interface OperationSummary {
  id: string;
  type: Mode;
  timestamp: Date;
  fileName: string;
  fileCount: number;
  status: 'success' | 'failure';
  details?: string;
}

const getFileIcon = (fileName: string) => {
  const ext = fileName.split('.').pop()?.toLowerCase();
  switch (ext) {
    // Documents
    case 'pdf': return <FileText className="w-6 h-6 text-red-400" />;
    case 'doc':
    case 'docx': return <FileText className="w-6 h-6 text-blue-400" />;
    case 'txt': return <FileText className="w-6 h-6 text-gray-400" />;
    // Media
    case 'jpg':
    case 'jpeg':
    case 'png':
    case 'gif':
    case 'webp':
    case 'svg': return <ImageIcon className="w-6 h-6 text-emerald-400" />;
    case 'mp4':
    case 'mov':
    case 'avi':
    case 'mkv': return <Video className="w-6 h-6 text-purple-400" />;
    case 'mp3':
    case 'wav':
    case 'flac': return <Music className="w-6 h-6 text-pink-400" />;
    // Archives
    case 'zip':
    case 'rar':
    case '7z':
    case 'tar':
    case 'gz': return <ArchiveIcon className="w-6 h-6 text-amber-400" />;
    // Default
    default: return <FileIcon className="w-6 h-6 text-gray-400" />;
  }
};

type Mode = 'compress' | 'extract';
type CompressionLevel = 'fast' | 'normal' | 'ultra';

export default function App() {
  const [isLaunching, setIsLaunching] = useState(true);
  const [activeView, setActiveView] = useState<'home' | 'about' | 'info' | 'privacy'>('home');
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [previewFiles, setPreviewFiles] = useState<{name: string, size: number}[] | null>(null);
  const [history, setHistory] = useState<OperationSummary[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [mode, setMode] = useState<Mode>('compress');
  const [files, setFiles] = useState<FileItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [overallProgress, setOverallProgress] = useState(0);
  const [password, setPassword] = useState('');
  const [encryptionMethod, setEncryptionMethod] = useState<'aes' | 'zipCrypto'>('aes');
  const [level, setLevel] = useState<CompressionLevel>('normal');
  const [zip64, setZip64] = useState(true);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [archiveName, setArchiveName] = useState('archive.zip');
  const [isNameModified, setIsNameModified] = useState(false);
  const [showProgress, setShowProgress] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstallable, setIsInstallable] = useState(false);

  useEffect(() => {
    if (mode === 'compress' && !isNameModified && !isProcessing) {
      if (files.length === 1) {
        const name = files[0].file.name;
        const lastDot = name.lastIndexOf('.');
        const baseName = lastDot !== -1 ? name.substring(0, lastDot) : name;
        setArchiveName(`${baseName}.zip`);
      } else if (files.length > 1) {
        setArchiveName('archive.zip');
      } else if (files.length === 0) {
        setArchiveName('archive.zip');
        setIsNameModified(false);
      }
    }
  }, [files, mode, isNameModified, isProcessing]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isCmd = e.metaKey || e.ctrlKey;
      
      if (isCmd && e.key === 'o') {
        e.preventDefault();
        fileInputRef.current?.click();
      }
      
      if (isCmd && e.key === 'd') {
        e.preventDefault();
        clearFiles();
      }
      
      if (e.key === 'Enter' && !isProcessing && files.length > 0) {
        mode === 'compress' ? compressFiles() : extractFiles();
      }

      if (e.key === 'Escape') {
        setPreviewFiles(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isProcessing, files, mode]);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsInstallable(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstallable(false);
    }
    setDeferredPrompt(null);
  };

  useEffect(() => {
    try {
      // @ts-ignore
      LibArchive.init({
        workerUrl: 'https://cdn.jsdelivr.net/npm/libarchive.js@2.0.2/dist/worker-bundle.js'
      });
    } catch (e) {
      console.error('LibArchive init failed:', e);
    }

    const timer = setTimeout(() => setIsLaunching(false), 1500);
    return () => clearTimeout(timer);
  }, []);

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

  const clearFiles = () => {
    setFiles([]);
    setIsNameModified(false);
    setArchiveName('archive.zip');
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      addFiles(Array.from(e.target.files));
    }
  };

  const handlePreview = async (item: FileItem) => {
    try {
      const extension = item.file.name.split('.').pop()?.toLowerCase();
      
      if (extension === 'zip') {
        const zipReader = new zip.ZipReader(new zip.BlobReader(item.file));
        const entries = await zipReader.getEntries();
        setPreviewFiles(entries.filter(e => !e.directory).map(e => ({ name: e.filename, size: e.uncompressedSize || 0 })));
        await zipReader.close();
      } else {
        // Use LibArchive for RAR, 7z, etc.
        // @ts-ignore
        const archive = await LibArchive.open(item.file);
        const obj = await archive.extractFiles();
        
        const fileList: {name: string, size: number}[] = [];
        const processObj = (data: any, path = '') => {
          for (const key in data) {
            if (data[key] instanceof File) {
              fileList.push({ name: `${path}${key}`, size: data[key].size });
            } else if (typeof data[key] === 'object') {
              processObj(data[key], `${path}${key}/`);
            }
          }
        };
        processObj(obj);
        setPreviewFiles(fileList);
      }
    } catch (e: any) {
      console.error('Preview failed:', e);
      const msg = e.message?.toLowerCase() || '';
      let errorText = 'Unable to index archive.';
      if (msg.includes('password')) errorText = 'Archive is password protected. Cannot preview.';
      if (msg.includes('corrupt') || msg.includes('signature')) errorText = 'Archive appears corrupted.';
      
      alert(errorText);
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
        zip64: zip64,
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
          // @ts-ignore
          encryptionMethod: password ? encryptionMethod : undefined,
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
      
      const summary: OperationSummary = {
        id: Math.random().toString(36).substr(2, 9),
        type: 'compress',
        timestamp: new Date(),
        fileName: archiveName.endsWith('.zip') ? archiveName : `${archiveName}.zip`,
        fileCount: files.length,
        status: 'success'
      };
      setHistory(prev => [summary, ...prev]);

      const totalOriginalSize = files.reduce((acc, f) => acc + f.file.size, 0);
      setFiles(prev => prev.map(f => ({
        ...f,
        status: 'completed',
        progress: 100,
        compressedSize: (f.file.size / totalOriginalSize) * resultBlob.size // Proportional estimation
      })));

      saveAs(resultBlob, archiveName.endsWith('.zip') ? archiveName : `${archiveName}.zip`);
      setOverallProgress(100);
      
      setTimeout(() => {
        setIsProcessing(false);
        setShowProgress(false);
        setOverallProgress(0);
      }, 1500);

    } catch (error: any) {
      console.error('Compression failed:', error);
      const summary: OperationSummary = {
        id: Math.random().toString(36).substr(2, 9),
        type: 'compress',
        timestamp: new Date(),
        fileName: archiveName,
        fileCount: files.length,
        status: 'failure',
        details: error.message || 'Unknown compression error'
      };
      setHistory(prev => [summary, ...prev]);
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
      for (let archiveIdx = 0; archiveIdx < files.length; archiveIdx++) {
        const item = files[archiveIdx];
        setFiles(prev => prev.map(f => f.id === item.id ? { ...f, status: 'processing' } : f));
        
        const archiveFile = item.file;
        const extension = archiveFile.name.split('.').pop()?.toLowerCase();

        try {
          if (extension === 'zip') {
            const zipReader = new zip.ZipReader(new zip.BlobReader(archiveFile));
            const entries = await zipReader.getEntries();
            
            for (let i = 0; i < entries.length; i++) {
              const entry = entries[i] as any;
              if (entry.getData && !entry.directory) {
                try {
                  const content = await entry.getData(new zip.BlobWriter(), {
                    password: password || undefined,
                    onprogress: (current: number, total: number) => {
                      const p = (current / total) * 100;
                      const globalP = (archiveIdx / files.length) * 100 + (p / files.length);
                      setOverallProgress(Math.min(globalP, 99));
                      setFiles(prev => prev.map(f => f.id === item.id ? { ...f, progress: p } : f));
                    }
                  });
                  saveAs(content, entry.filename);
                } catch (e: any) {
                  const msg = e.message?.toLowerCase() || '';
                  if (msg.includes('password') || msg.includes('decrypt')) {
                    throw new Error(`Password incorrect or required for ${entry.filename}`);
                  }
                  if (msg.includes('signature') || msg.includes('central directory')) {
                    throw new Error(`Archive corrupted or structure invalid: ${item.file.name}`);
                  }
                  throw e;
                }
              }
            }
            await zipReader.close();
          } else {
            // @ts-ignore
            const archive = await LibArchive.open(archiveFile);
            const obj = await archive.extractFiles();
            
            const downloadFiles = async (data: any, path = '') => {
              for (const key in data) {
                const innerItem = data[key];
                if (innerItem instanceof File) {
                   saveAs(innerItem, key);
                } else if (typeof innerItem === 'object') {
                  await downloadFiles(innerItem, `${path}${key}/`);
                }
              }
            };
            
            await downloadFiles(obj);
          }
          setFiles(prev => prev.map(f => f.id === item.id ? { ...f, status: 'completed', progress: 100 } : f));
        } catch (e: any) {
          console.error(`Inner extraction error for ${item.file.name}:`, e);
          setFiles(prev => prev.map(f => f.id === item.id ? { ...f, status: 'error', errorMessage: e.message || 'Format error' } : f));
        }
        
        setOverallProgress(((archiveIdx + 1) / files.length) * 100);
      }

      setOverallProgress(100);
      
      const summary: OperationSummary = {
        id: Math.random().toString(36).substr(2, 9),
        type: 'extract',
        timestamp: new Date(),
        fileName: files.length === 1 ? files[0].file.name : `${files.length} Archives`,
        fileCount: files.length,
        status: 'success'
      };
      setHistory(prev => [summary, ...prev]);

      setTimeout(() => {
        setIsProcessing(false);
        setShowProgress(false);
        setOverallProgress(0);
      }, 1500);

    } catch (error: any) {
      console.error('Batch extraction failed:', error);
      alert(`Extraction stalled: ${error.message || 'Unknown error'}`);
      setIsProcessing(false);
    }
  };

  return (
    <div className={cn(
      "min-h-screen transition-all duration-700 font-sans selection:bg-cyan-500/30 selection:text-cyan-200 overflow-x-hidden",
      isDarkMode ? "bg-[#050507] text-white" : "bg-gray-50 text-gray-900"
    )}>
      <AnimatePresence>
        {isLaunching && (
          <motion.div
            key="splash"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 1.1, filter: 'blur(20px)' }}
            transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
            className="fixed inset-0 z-[200] bg-[#050507] flex flex-col items-center justify-center"
          >
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              className="relative"
            >
              <div className="w-28 h-28 rounded-[2rem] bg-gradient-to-br from-cyan-400 via-blue-500 to-purple-600 flex items-center justify-center shadow-[0_0_80px_rgba(34,211,238,0.25)]">
                <Zap className="w-14 h-14 text-white fill-white animate-pulse" />
              </div>
              <motion.div 
                className="absolute inset-0 rounded-[2rem] bg-cyan-400 blur-3xl opacity-30 -z-10"
                animate={{ scale: [1, 1.4, 1], opacity: [0.2, 0.5, 0.2] }}
                transition={{ duration: 3, repeat: Infinity }}
              />
            </motion.div>
            
            <div className="mt-16 flex flex-col items-center gap-6">
              <div className="overflow-hidden">
                <motion.h2 
                  initial={{ y: 50, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.2, duration: 0.6 }}
                  className="text-4xl font-black tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 via-blue-400 to-purple-500"
                >
                  VOXZIP
                </motion.h2>
              </div>
              
              <div className="relative w-56 h-1 bg-white/5 rounded-full overflow-hidden">
                <motion.div 
                  className="absolute inset-y-0 left-0 bg-gradient-to-r from-cyan-500 to-purple-500"
                  initial={{ width: "0%" }}
                  animate={{ width: "100%" }}
                  transition={{ duration: 2, ease: [0.65, 0, 0.35, 1] }}
                />
              </div>
              
              <motion.p 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.8 }}
                className="text-[9px] font-mono font-bold uppercase tracking-[0.5em] text-gray-500 ml-[0.5em]"
              >
                Zero-Knowledge Processing
              </motion.p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Enhanced Background Mesh */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div className={cn(
          "absolute -top-[10%] -left-[10%] w-[60%] h-[60%] rounded-full blur-[140px] transition-all duration-1000",
          isDarkMode ? "bg-cyan-500/10 opacity-40 mix-blend-screen" : "bg-cyan-500/5 opacity-30"
        )} />
        <div className={cn(
          "absolute top-1/4 -right-[10%] w-[40%] h-[40%] rounded-full blur-[120px] transition-all duration-1000 delay-300",
          isDarkMode ? "bg-purple-600/10 opacity-30 mix-blend-screen" : "bg-purple-600/5 opacity-15"
        )} />
        <div className={cn(
          "absolute -bottom-[10%] left-1/4 w-[50%] h-[50%] rounded-full blur-[140px] transition-all duration-1000 delay-500",
          isDarkMode ? "bg-blue-600/10 opacity-20 mix-blend-screen" : "bg-blue-600/5 opacity-10"
        )} />
      </div>

      <header className={cn(
        "fixed top-0 w-full z-50 border-b px-4 py-3 flex items-center justify-between backdrop-blur-xl transition-all duration-500",
        isDarkMode ? "bg-[#050507]/80 border-white/10" : "bg-white/80 border-gray-200 shadow-sm"
      )}>
        <div className="flex items-center gap-2.5 cursor-pointer" onClick={() => setActiveView('home')}>
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-400 to-purple-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
            <Zap className="w-5 h-5 text-white fill-white" />
          </div>
          <div className="flex flex-col">
            <h1 className="text-base sm:text-lg font-black tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 to-purple-500 leading-none">
              VOXZIP
            </h1>
            <p className="hidden sm:block text-[8px] text-gray-500 font-mono uppercase tracking-[0.2em] leading-none mt-1">High Performance</p>
          </div>
        </div>
        
          <div className="flex items-center gap-1.5">
            {isInstallable && (
              <button 
                onClick={handleInstallClick}
                className={cn(
                  "px-2.5 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-tighter border transition-all duration-300 flex items-center gap-1.5",
                  isDarkMode 
                    ? "bg-cyan-500/10 border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/20" 
                    : "bg-cyan-50 border-cyan-200 text-cyan-600 hover:bg-cyan-100"
                )}
              >
                <Download className="w-3 h-3" />
                Install
              </button>
            )}
            <button 
              onClick={() => setIsConfigOpen(!isConfigOpen)}
            className={cn(
              "p-2 rounded-lg transition-all duration-300 border xl:hidden",
              isConfigOpen 
                ? "bg-cyan-500/10 border-cyan-500/30 text-cyan-500" 
                : (isDarkMode ? "bg-white/5 border-white/10 text-gray-400" : "bg-white border-gray-200 text-gray-600")
            )}
          >
            {isConfigOpen ? <X className="w-4 h-4" /> : <Settings2 className="w-4 h-4" />}
          </button>

          <button 
            onClick={() => setShowAbout(true)}
            className={cn(
              "p-2 rounded-xl transition-all duration-300 border",
              showAbout 
                ? "bg-cyan-500/10 border-cyan-500/30 text-cyan-500" 
                : (isDarkMode ? "bg-white/5 border-white/10 text-gray-400" : "bg-white border-gray-200 text-gray-600")
            )}
            title="About VoxZip"
          >
            <Info className="w-5 h-5" />
          </button>
          
          <button 
            onClick={() => setActiveView(activeView === 'info' ? 'home' : 'info')}
            className={cn(
              "p-2 rounded-xl transition-all duration-300 border hidden lg:flex",
              activeView === 'info' 
                ? "bg-cyan-500/10 border-cyan-500/30 text-cyan-500" 
                : (isDarkMode ? "bg-white/5 border-white/10 text-gray-400" : "bg-white border-gray-200 text-gray-600")
            )}
          >
            <HelpCircle className="w-5 h-5" />
          </button>
          
          <button 
            onClick={() => setShowHistory(!showHistory)}
            className={cn(
              "p-2 rounded-xl transition-all duration-300 border relative group",
              showHistory 
                ? "bg-cyan-500/10 border-cyan-500/30 text-cyan-500" 
                : (isDarkMode ? "bg-white/5 border-white/10 text-gray-400" : "bg-white border-gray-200 text-gray-600")
            )}
            title="Operations Hub"
          >
            <LayoutGrid className="w-5 h-5" />
            {history.length > 0 && <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-cyan-500 rounded-full border-2 border-[#050507] animate-pulse" />}
          </button>

          <button 
            onClick={() => setIsDarkMode(!isDarkMode)}
            className={cn(
              "p-2.5 rounded-xl transition-all duration-300 border hover:shadow-lg",
              isDarkMode 
                ? "bg-white/10 border-white/5 text-cyan-400 shadow-[0_0_20px_rgba(34,211,238,0.1)]" 
                : "bg-white border-gray-200 text-gray-600 shadow-sm"
            )}
          >
            {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
        </div>
      </header>

      <main className="relative pt-24 pb-20 px-4 max-w-5xl mx-auto">
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
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              onDragOver={onDragOver}
              onDrop={onDrop}
              onClick={() => !isProcessing && fileInputRef.current?.click()}
              className={cn(
                "relative group h-48 rounded-[2rem] border-2 border-dashed flex flex-col items-center justify-center gap-2 cursor-pointer transition-all duration-500 overflow-hidden backdrop-blur-md",
                isDarkMode 
                  ? "border-white/10 bg-white/[0.02] hover:border-cyan-500/40 hover:bg-cyan-500/[0.04]" 
                  : "border-gray-200 bg-white/40 hover:border-cyan-500/40 hover:bg-cyan-50 shadow-sm",
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
                "w-12 h-12 rounded-[1.2rem] flex items-center justify-center group-hover:scale-110 group-hover:rotate-3 transition-all duration-500 shadow-xl",
                isDarkMode ? "bg-white/5 border border-white/10" : "bg-white border border-gray-100 shadow-lg"
              )}>
                <Upload className="w-6 h-6 text-cyan-500" />
              </div>
              
              <div className="text-center px-4">
                <p className={cn(
                  "text-base font-black tracking-tight",
                  isDarkMode ? "text-gray-200" : "text-gray-700"
                )}>
                  {mode === 'compress' ? 'DROP FILES TO PACK' : 'DROP TO EXTRACT'}
                </p>
                <p className="text-[10px] text-gray-500 mt-0.5 max-w-sm mx-auto font-bold font-mono tracking-widest uppercase">
                  {(mode === 'compress' ? 'Multiple Files Supported' : 'Auto-Detection Active')}
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
                          initial={{ scale: 0.95, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          exit={{ scale: 0.95, opacity: 0 }}
                          className={cn(
                            "group relative rounded-2xl p-2.5 flex items-center gap-2.5 border transition-all duration-500 backdrop-blur-md overflow-hidden",
                            isDarkMode 
                              ? "bg-white/[0.03] border-white/5 hover:border-cyan-500/30 hover:bg-white/[0.05]" 
                              : "bg-white/60 border-gray-100 shadow-sm hover:shadow-md hover:border-gray-200"
                          )}
                        >
                          <div className={cn(
                            "w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-transform duration-500 group-hover:scale-105",
                            isDarkMode ? "bg-white/5 border border-white/5" : "bg-gray-100"
                          )}>
                            {item.status === 'completed' ? <CheckCircle2 className="w-5 h-5 text-emerald-400" /> :
                             item.status === 'processing' ? <Loader2 className="w-4 h-4 text-cyan-400 animate-spin" /> :
                             item.status === 'error' ? <AlertCircle className="w-4 h-4 text-red-500" /> :
                             getFileIcon(item.file.name)}
                          </div>
                          
                          <div className="flex-1 min-w-0">
                            <h4 className="text-[11px] font-black truncate tracking-tight">{item.file.name}</h4>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <p className="text-[9px] text-gray-500 font-mono font-bold uppercase">{formatBytes(item.file.size)}</p>
                              {item.compressedSize && (
                                <>
                                  <div className="w-0.5 h-0.5 rounded-full bg-gray-600" />
                                  <p className="text-[9px] text-cyan-500 font-black uppercase tracking-tighter">
                                    {(100 - (item.compressedSize / item.file.size) * 100).toFixed(0)}% Savings
                                  </p>
                                </>
                              )}
                            </div>
                          </div>

                          {!isProcessing && (
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                              {mode === 'extract' && (
                                <button
                                  onClick={() => handlePreview(item)}
                                  className="p-2 rounded-lg hover:bg-cyan-500/10 text-cyan-400"
                                  title="Quick Look (Cmd+O)"
                                >
                                  <Eye className="w-4 h-4" />
                                </button>
                              )}
                              <button 
                                onClick={() => removeFile(item.id)}
                                className="p-2 rounded-lg hover:bg-red-500/10 text-red-400"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          )}
                        </motion.div>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div className={cn(
                "lg:col-span-12 xl:col-span-4",
                "fixed inset-0 z-[100] xl:relative xl:inset-auto transition-all duration-500 xl:translate-y-0 xl:opacity-100",
                isConfigOpen ? "translate-y-0 opacity-100 visible" : "translate-y-full opacity-0 invisible xl:visible xl:opacity-100 xl:translate-y-0"
              )}>
                <div className={cn(
                  "flex flex-col gap-5 h-full xl:h-auto xl:sticky xl:top-24 p-4 xl:p-0",
                  isDarkMode ? "bg-[#050507] xl:bg-transparent" : "bg-white xl:bg-transparent"
                )}>
                  <div className="flex xl:hidden items-center justify-between mb-2">
                    <h2 className="font-black text-xl tracking-tighter">CONFIGURATION</h2>
                    <button onClick={() => setIsConfigOpen(false)} className="p-2 border border-white/10 rounded-xl"><X className="w-6 h-6" /></button>
                  </div>
                  
                  <div className="flex-1 overflow-y-auto custom-scrollbar xl:overflow-visible">
                    <motion.div 
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      className={cn(
                        "rounded-[2.5rem] p-5 flex flex-col gap-5 border shadow-[0_30px_60px_-12px_rgba(0,0,0,0.5)] relative overflow-visible backdrop-blur-2xl transition-all duration-500",
                        isDarkMode ? "bg-white/[0.03] border-white/10" : "bg-white/60 border-gray-100"
                      )}
                    >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-cyan-500/10 flex items-center justify-center border border-cyan-500/20">
                        <Settings2 className="w-4 h-4 text-cyan-500" />
                      </div>
                      <div>
                        <h2 className="font-black text-base tracking-tighter uppercase">Config</h2>
                        <p className="text-[9px] text-gray-500 font-mono uppercase tracking-[0.2em] font-bold">Parameters</p>
                      </div>
                    </div>

                    {mode === 'compress' ? (
                      <div className="space-y-5">
                        <div className="space-y-2.5">
                          <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">Compression Engine</label>
                          <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-white/5 border border-white/5">
                            {(['fast', 'normal', 'ultra'] as const).map(l => (
                              <button
                                key={l}
                                disabled={isProcessing}
                                onClick={() => setLevel(l)}
                                className={cn(
                                  "py-2 rounded-lg text-[10px] font-black uppercase tracking-tighter transition-all duration-300",
                                  level === l 
                                    ? "bg-cyan-500 text-white shadow-lg shadow-cyan-500/20" 
                                    : (isDarkMode ? "text-gray-500 hover:bg-white/5" : "bg-gray-100 border-transparent text-gray-500 hover:bg-gray-200")
                                )}
                              >
                                {l}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="space-y-2.5">
                          <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1 flex items-center justify-between">
                            Advanced Bridge
                          </label>
                          <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/5 flex items-center justify-between group hover:border-cyan-500/30 transition-all">
                            <div className="flex items-center gap-3">
                              <ShieldCheck className="w-4 h-4 text-cyan-500" />
                              <div>
                                <p className="text-[11px] font-black tracking-tight">ZIP64 LAYER</p>
                                <p className="text-[8px] text-gray-500 font-mono uppercase font-bold tracking-tighter">&gt; 4GB Data Support</p>
                              </div>
                            </div>
                            <button 
                              onClick={() => setZip64(!zip64)}
                              className={cn(
                                "w-9 h-4.5 rounded-full transition-all relative overflow-hidden",
                                zip64 ? "bg-cyan-500" : "bg-gray-800"
                              )}
                            >
                              <div className={cn(
                                "absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white transition-all shadow-sm",
                                zip64 ? "right-0.5" : "left-0.5"
                              )} />
                            </button>
                          </div>
                        </div>

                        <div className="space-y-2.5">
                          <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">Archive ID</label>
                          <input 
                            type="text" 
                            disabled={isProcessing}
                            value={archiveName}
                            onChange={(e) => {
                              setArchiveName(e.target.value);
                              setIsNameModified(true);
                            }}
                            className={cn(
                              "w-full rounded-2xl px-4 py-3 text-xs font-black placeholder:text-gray-700 focus:outline-none focus:ring-1 focus:ring-cyan-500/40 transition-all border",
                              isDarkMode ? "bg-white/[0.03] border-white/5 text-white" : "bg-gray-50 border-gray-100 text-gray-900"
                            )}
                            placeholder="NAME.ZIP"
                          />
                        </div>

                        <div className="space-y-2.5">
                          <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1 flex items-center gap-2">
                            <Lock className="w-3 h-3" /> SECURITY KEY
                          </label>
                          <div className="relative group/pass">
                            <input 
                              type={showPassword ? "text" : "password"} 
                              disabled={isProcessing}
                              value={password}
                              onChange={(e) => setPassword(e.target.value)}
                              className={cn(
                                "w-full rounded-2xl px-4 py-3 text-xs font-black placeholder:text-gray-700 focus:outline-none focus:ring-1 focus:ring-cyan-500/40 transition-all border pr-12 shadow-inner",
                                isDarkMode ? "bg-white/[0.03] border-white/5 text-white" : "bg-gray-50 border-gray-100 text-gray-900"
                              )}
                              placeholder="ENCRYPTION PASSWORD"
                            />
                            <button
                              type="button"
                              onClick={() => setShowPassword(!showPassword)}
                              className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-xl text-gray-500 hover:text-cyan-500 transition-colors"
                            >
                              {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                          {password && (
                            <div className="flex bg-white/5 rounded-xl p-1 gap-1 border border-white/5 mt-2">
                              {(['zipCrypto', 'aes'] as const).map(m => (
                                <button
                                  key={m}
                                  onClick={() => setEncryptionMethod(m)}
                                  className={cn(
                                    "flex-1 py-1 rounded-lg text-[9px] font-black uppercase tracking-tighter transition-all",
                                    encryptionMethod === m 
                                      ? "bg-cyan-500 text-white shadow-lg" 
                                      : "text-gray-500 hover:bg-white/5"
                                  )}
                                >
                                  {m === 'aes' ? 'AES-256' : 'LEGACY'}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className={cn(
                        "p-4 rounded-3xl border text-[10px] text-gray-500 font-bold leading-relaxed backdrop-blur-md italic font-mono",
                        isDarkMode ? "bg-cyan-500/5 border-cyan-500/10 shadow-[inset_0_0_20px_rgba(6,182,212,0.02)]" : "bg-cyan-50/60 border-cyan-200/50"
                      )}>
                        // Batch extraction powered by LibArchive_WASM. Supports ZIP, RAR, 7Z. Sequential processing engaged.
                      </div>
                    )}

                    <button 
                      disabled={files.length === 0 || isProcessing}
                      onClick={mode === 'compress' ? compressFiles : extractFiles}
                      className={cn(
                        "w-full py-4 rounded-[1.5rem] font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2.5 transition-all duration-500 relative overflow-hidden group/btn",
                        files.length === 0 || isProcessing
                          ? (isDarkMode ? "bg-white/5 text-gray-700 border border-white/5 cursor-not-allowed" : "bg-gray-100 text-gray-400 cursor-not-allowed")
                          : "bg-gradient-to-r from-cyan-500 via-blue-600 to-purple-600 text-white hover:scale-[1.02] active:scale-95 shadow-[0_20px_40px_-10px_rgba(6,182,212,0.3)]"
                      )}
                    >
                      {isProcessing ? (
                         <Loader2 className="w-4 h-4 animate-spin text-white" />
                      ) : (
                        <>
                          <span className="relative z-10">{mode === 'compress' ? 'GENERATE ARCHIVE' : 'EXTRACT DATA'}</span>
                          <ArrowRight className="w-4 h-4 relative z-10 transition-transform group-hover/btn:translate-x-1" />
                          <div className="absolute inset-0 bg-white/10 opacity-0 group-hover/btn:opacity-100 transition-opacity" />
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

                  <div className="p-6 rounded-2xl bg-cyan-500/10 border border-cyan-500/20">
                    <div className="flex items-center gap-3 mb-3">
                      <Download className="w-5 h-5 text-cyan-500" />
                      <h4 className="font-bold text-white">Standalone Experience</h4>
                    </div>
                    <p className="text-sm text-gray-400 leading-relaxed mb-4">You can install VoxZip as a standalone app on your device for a native-like experience and offline capabilities.</p>
                    <div className="space-y-3">
                      <div className="flex items-start gap-2">
                        <div className="w-5 h-5 rounded-full bg-cyan-500/20 flex items-center justify-center shrink-0 mt-0.5 text-[10px] font-bold">1</div>
                        <p className="text-xs text-gray-400"><strong>iOS:</strong> Tap 'Share' in Safari, then select 'Add to Home Screen'.</p>
                      </div>
                      <div className="flex items-start gap-2">
                        <div className="w-5 h-5 rounded-full bg-cyan-500/20 flex items-center justify-center shrink-0 mt-0.5 text-[10px] font-bold">2</div>
                        <p className="text-xs text-gray-400"><strong>Android/Chrome:</strong> Tap the three dots menu and select 'Install app'.</p>
                      </div>
                    </div>
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
        "py-12 pb-32 border-t px-6 transition-colors duration-500 mt-auto",
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

      {/* Mobile Bottom Navigation */}
      <nav className={cn(
        "fixed bottom-0 left-0 right-0 z-[120] xl:hidden border-t backdrop-blur-xl px-4 py-3 pb-6 flex items-center justify-around transition-all duration-500",
        isDarkMode ? "bg-black/60 border-white/5" : "bg-white/60 border-gray-100 shadow-2xl"
      )}>
        <button 
          onClick={() => { setActiveView('home'); setIsConfigOpen(false); }}
          className={cn(
            "flex flex-col items-center gap-1 transition-all outline-none",
            activeView === 'home' ? "text-cyan-400 scale-110" : "text-gray-500 scale-90"
          )}
        >
          <Home className="w-5 h-5" />
          <span className="text-[9px] font-black uppercase tracking-tight">Home</span>
        </button>
        <button 
          onClick={() => { setActiveView('info'); setIsConfigOpen(false); }}
          className={cn(
            "flex flex-col items-center gap-1 transition-all outline-none",
            activeView === 'info' ? "text-cyan-400 scale-110" : "text-gray-500 scale-90"
          )}
        >
          <Info className="w-5 h-5" />
          <span className="text-[9px] font-black uppercase tracking-tight">Info</span>
        </button>
        <button 
          onClick={() => { setActiveView('about'); setIsConfigOpen(false); }}
          className={cn(
            "flex flex-col items-center gap-1 transition-all outline-none",
            activeView === 'about' ? "text-cyan-400 scale-110" : "text-gray-500 scale-90"
          )}
        >
          <LayoutGrid className="w-5 h-5" />
          <span className="text-[9px] font-black uppercase tracking-tight">About</span>
        </button>
      </nav>

      <AnimatePresence>
        {showAbout && (
          <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAbout(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-md"
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className={cn(
                "relative w-full max-w-md rounded-[2.5rem] border shadow-[0_40px_100px_rgba(0,0,0,0.5)] p-8 text-center",
                isDarkMode ? "bg-[#0a0a0c] border-white/10" : "bg-white border-gray-200"
              )}
            >
              <div className="flex flex-col items-center gap-6">
                <div className="w-20 h-20 rounded-[1.5rem] bg-gradient-to-br from-cyan-400 to-purple-600 flex items-center justify-center shadow-xl shadow-cyan-500/20">
                  <Zap className="w-10 h-10 text-white fill-white" />
                </div>
                
                <div>
                  <h3 className="text-3xl font-black tracking-tighter">VOXZIP</h3>
                  <p className="text-[10px] font-mono font-bold text-cyan-500 uppercase tracking-widest mt-1">Version 2.2.0 • Pro Edition</p>
                </div>

                <p className="text-sm text-gray-500 leading-relaxed max-w-[280px] mx-auto">
                  High-performance, secure, and purely client-side archiving for the modern web. Your data never leaves your machine.
                </p>

                <div className="w-full grid grid-cols-1 gap-2 pt-4">
                  <button 
                    onClick={() => { setShowAbout(false); setActiveView('privacy'); }}
                    className="w-full py-3 rounded-2xl bg-white/5 border border-white/5 hover:bg-white/10 transition-all text-xs font-bold flex items-center justify-center gap-2"
                  >
                    <ShieldCheck className="w-4 h-4 text-emerald-500" />
                    Privacy Policy
                  </button>
                  <a 
                    href="https://github.com/Sachin-Sheth/VoxZip" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="w-full py-3 rounded-2xl bg-white/5 border border-white/5 hover:bg-white/10 transition-all text-xs font-bold flex items-center justify-center gap-2"
                  >
                    <Github className="w-4 h-4 text-cyan-500" />
                    Source Code
                  </a>
                </div>

                <div className="pt-8 flex flex-col items-center gap-2">
                  <p className="text-[10px] text-gray-600 font-mono uppercase tracking-[0.3em]">Crafted by CodeTech</p>
                  <div className="flex items-center gap-1.5 grayscale opacity-50">
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-500" />
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                    <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                  </div>
                </div>

                <button 
                  onClick={() => setShowAbout(false)}
                  className="absolute top-6 right-6 p-2 rounded-xl hover:bg-white/5 transition-all"
                >
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showHistory && (
          <div className="fixed inset-0 z-[150] flex items-end sm:items-center justify-end p-4 pointer-events-none">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowHistory(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm pointer-events-auto"
            />
            <motion.div
              initial={{ x: 400, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 400, opacity: 0 }}
              className={cn(
                "relative w-full max-w-md h-[85vh] sm:h-[600px] rounded-[2.5rem] border shadow-[0_40px_100px_rgba(0,0,0,0.5)] flex flex-col pointer-events-auto overflow-hidden",
                isDarkMode ? "bg-[#0a0a0c] border-white/10" : "bg-white border-gray-200"
              )}
            >
              <div className="p-8 border-b border-white/5 flex items-center justify-between">
                <div>
                  <h3 className="font-black text-xl tracking-tighter">OPERATIONS HUB</h3>
                  <p className="text-[10px] text-gray-500 font-mono font-bold uppercase tracking-widest leading-none mt-1">Transaction History</p>
                </div>
                <button onClick={() => setShowHistory(false)} className="p-2 hover:bg-white/5 rounded-xl"><X className="w-5 h-5 text-gray-500" /></button>
              </div>
              
              <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                {history.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center p-8">
                    <div className="w-16 h-16 rounded-3xl bg-white/5 flex items-center justify-center mb-4">
                      <Briefcase className="w-8 h-8 text-gray-600" />
                    </div>
                    <p className="text-sm font-bold text-gray-400">Silence in the Hub</p>
                    <p className="text-xs text-gray-600 mt-1">Completed tasks will be indexed here for your records.</p>
                  </div>
                ) : (
                  history.map((op) => (
                    <motion.div 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      key={op.id}
                      className={cn(
                        "p-4 rounded-2xl border transition-all duration-300",
                        isDarkMode ? "bg-white/5 border-white/5" : "bg-gray-50 border-gray-100"
                      )}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "w-10 h-10 rounded-xl flex items-center justify-center",
                            op.status === 'success' ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"
                          )}>
                            {op.type === 'compress' ? <ArchiveIcon className="w-5 h-5" /> : <FileArchive className="w-5 h-5" />}
                          </div>
                          <div>
                            <p className="text-xs font-bold truncate max-w-[150px]">{op.fileName}</p>
                            <p className="text-[9px] text-gray-500 font-mono mt-0.5">
                              {op.type.toUpperCase()} • {op.fileCount} ITEMS • {op.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                        </div>
                        {op.status === 'success' ? (
                          <div className="px-2 py-1 rounded-md bg-emerald-500/10 text-[9px] font-bold text-emerald-400 border border-emerald-500/20">COMPLETE</div>
                        ) : (
                          <div className="px-2 py-1 rounded-md bg-red-500/10 text-[9px] font-bold text-red-400 border border-red-500/20">FAILED</div>
                        )}
                      </div>
                      {op.details && (
                        <p className="mt-3 p-2 rounded-lg bg-black/40 text-[10px] font-mono text-red-300/80 leading-relaxed border border-red-500/10 italic">
                          &gt; {op.details}
                        </p>
                      )}
                    </motion.div>
                  ))
                )}
              </div>

              <div className="p-4 border-t border-white/5">
                <button 
                  onClick={() => setHistory([])}
                  className="w-full py-3 rounded-2xl border border-white/5 hover:bg-white/5 transition-all text-[10px] font-black uppercase tracking-widest text-gray-500"
                >
                  Wipe Hub Data
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {previewFiles && (
          <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setPreviewFiles(null)}
              className="absolute inset-0 bg-black/80 backdrop-blur-md"
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 30 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 30 }}
              className={cn(
                "relative w-full max-w-xl rounded-[2.5rem] border shadow-[0_30px_100px_rgba(0,0,0,0.5)] overflow-hidden flex flex-col max-h-[75vh]",
                isDarkMode ? "bg-[#0a0a0c] border-white/10" : "bg-white border-gray-200"
              )}
            >
              <div className="p-8 border-b border-white/5 flex items-center justify-between bg-white/[0.01]">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-[1.2rem] bg-cyan-500/10 flex items-center justify-center">
                    <LayoutGrid className="w-6 h-6 text-cyan-500" />
                  </div>
                  <div>
                    <h3 className="font-black text-xl tracking-tighter">ARCHIVE PREVIEW</h3>
                    <p className="text-[10px] text-gray-500 font-mono font-bold uppercase tracking-widest">{previewFiles.length} Object(s) Indexed</p>
                  </div>
                </div>
                <button 
                  onClick={() => setPreviewFiles(null)}
                  className="p-3 hover:bg-white/5 rounded-2xl transition-all border border-transparent hover:border-white/10"
                >
                  <X className="w-6 h-6 text-gray-500" />
                </button>
              </div>
              
              <div className="flex-1 overflow-y-auto p-6 space-y-3 custom-scrollbar">
                {previewFiles.map((file, i) => (
                  <motion.div 
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.03 }}
                    key={i} 
                    className="flex items-center justify-between p-4 rounded-2xl bg-white/[0.03] border border-white/5 group hover:border-cyan-500/30 transition-all shadow-lg"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center group-hover:scale-110 transition-transform">
                        {getFileIcon(file.name)}
                      </div>
                      <span className="text-xs font-bold truncate max-w-[280px] tracking-tight">{file.name}</span>
                    </div>
                    <span className="text-[10px] font-mono font-bold text-gray-500 bg-white/5 px-2 py-1 rounded-md">{formatBytes(file.size)}</span>
                  </motion.div>
                ))}
              </div>
              
              <div className="p-8 border-t border-white/5 bg-white/[0.01] flex justify-between items-center">
                <p className="text-[9px] font-mono text-gray-500 uppercase tracking-widest italic">End of Central Directory</p>
                <button 
                  onClick={() => setPreviewFiles(null)}
                  className="px-8 py-3 rounded-2xl bg-gradient-to-r from-cyan-600 to-blue-600 text-white text-xs font-black uppercase tracking-tighter shadow-[0_10px_30px_rgba(6,182,212,0.3)] hover:scale-105 active:scale-95 transition-all"
                >
                  Close Scanner
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

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
