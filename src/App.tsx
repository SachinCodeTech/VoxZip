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
  Music,
  Activity,
  Layers,
  Cpu,
  RefreshCw
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
  dateAdded: number;
  path: string; // Internal path in archive
}

interface OperationSummary {
  id: string;
  type: Mode;
  timestamp: Date;
  fileName: string;
  fileCount: number;
  status: 'success' | 'failure';
  details?: string;
  hint?: string;
}

const Tooltip = ({ text, children }: { text: string, children: React.ReactNode }) => {
  const [show, setShow] = useState(false);
  return (
    <div className="relative inline-block" onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      {children}
      <AnimatePresence>
        {show && (
          <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 5 }}
            className="absolute z-[300] bottom-full left-1/2 -translate-x-1/2 mb-2 p-2 rounded-lg bg-black/90 border border-white/10 text-[9px] font-bold text-white w-48 text-center backdrop-blur-md shadow-2xl pointer-events-none"
          >
            {text}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

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

const CircularProgress = ({ progress, size = 120, strokeWidth = 12, isDarkMode = true }: { progress: number, size?: number, strokeWidth?: number, isDarkMode?: boolean }) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (progress / 100) * circumference;

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="transform -rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={isDarkMode ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)"}
          strokeWidth={strokeWidth}
          fill="transparent"
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="url(#gradient)"
          strokeWidth={strokeWidth}
          fill="transparent"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 0.5, ease: "easeInOut" }}
          strokeLinecap="round"
        />
        <defs>
          <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#06b6d4" />
            <stop offset="100%" stopColor="#8b5cf6" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute flex flex-col items-center justify-center">
        <span className="text-2xl font-black tracking-tighter">{Math.round(progress)}%</span>
        <span className="text-[8px] font-black uppercase tracking-widest text-gray-500">Processing</span>
      </div>
    </div>
  );
};

const BackgroundParticles = ({ isDarkMode }: { isDarkMode: boolean }) => {
  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
      <svg className="w-full h-full opacity-30">
        <filter id="glow">
          <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
          <feMerge>
            <feMergeNode in="coloredBlur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
        {[...Array(25)].map((_, i) => (
          <motion.circle
            key={i}
            r={Math.random() * 2 + 1}
            fill={isDarkMode ? (i % 2 === 0 ? "#22d3ee" : "#8b5cf6") : (i % 2 === 0 ? "#0891b2" : "#7c3aed")}
            initial={{ 
              x: Math.random() * 100 + "%", 
              y: Math.random() * 100 + "%",
              opacity: Math.random() * 0.5 + 0.2
            }}
            animate={{ 
              x: [null, Math.random() * 100 + "%"],
              y: [null, Math.random() * 100 + "%"],
              opacity: [0.2, 0.6, 0.2]
            }}
            transition={{ 
              duration: Math.random() * 20 + 20, 
              repeat: Infinity, 
              ease: "linear" 
            }}
            style={{ filter: "url(#glow)" }}
          />
        ))}
      </svg>
    </div>
  );
};

const APP_VERSION = '1.0.0';

export default function App() {
  const [isLaunching, setIsLaunching] = useState(true);
  const [activeView, setActiveView] = useState<'home' | 'about' | 'info' | 'privacy'>('home');
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [previewFiles, setPreviewFiles] = useState<{name: string, size: number}[] | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [history, setHistory] = useState<OperationSummary[]>(() => {
    const saved = localStorage.getItem('voxzip-history');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return parsed.map((h: any) => ({
          ...h,
          timestamp: new Date(h.timestamp)
        }));
      } catch (e) {
        return [];
      }
    }
    return [];
  });

  useEffect(() => {
    localStorage.setItem('voxzip-history', JSON.stringify(history));
  }, [history]);
  const [showHistory, setShowHistory] = useState(false);
  const [mode, setMode] = useState<Mode>('compress');
  const [files, setFiles] = useState<FileItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [overallProgress, setOverallProgress] = useState(0);
  const [password, setPassword] = useState('');
  const [passwordHint, setPasswordHint] = useState('');
  const [encryptionMethod, setEncryptionMethod] = useState<'aes' | 'zipCrypto'>('aes');
  const [level, setLevel] = useState<CompressionLevel>('normal');
  const [zip64, setZip64] = useState(true);
  type Theme = 'cyberpunk' | 'midnight' | 'emerald' | 'sunset';
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem('voxzip-theme') as Theme) || 'cyberpunk');
  const [searchQuery, setSearchQuery] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('voxzip-theme', theme);
  }, [theme]);

  const isDarkMode = true; // VoxZip is essentially always dark-themed but with different accent color palettes
  const [archiveName, setArchiveName] = useState('archive.zip');
  const [isNameModified, setIsNameModified] = useState(false);
  const [showProgress, setShowProgress] = useState(false);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [processedBytes, setProcessedBytes] = useState(0);
  const lastProcessedRef = useRef<number>(0);
  const [sortBy, setSortBy] = useState<'name' | 'size' | 'date' | 'type'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  interface UserPreset {
    id: string;
    name: string;
    level: CompressionLevel;
    zip64: boolean;
    encryptionMethod: 'aes' | 'zipCrypto';
    password?: string;
  }
  const [userPresets, setUserPresets] = useState<UserPreset[]>(() => {
    const saved = localStorage.getItem('voxzip-user-presets');
    return saved ? JSON.parse(saved) : [];
  });
  const [presetName, setPresetName] = useState('');

  useEffect(() => {
    localStorage.setItem('voxzip-user-presets', JSON.stringify(userPresets));
  }, [userPresets]);

  const savePreset = () => {
    if (!presetName.trim()) return;
    const newPreset: UserPreset = {
      id: Math.random().toString(36).substr(2, 9),
      name: presetName,
      level,
      zip64,
      encryptionMethod,
      password: password || undefined
    };
    setUserPresets(prev => [...prev, newPreset]);
    setPresetName('');
  };

  const deletePreset = (id: string) => {
    setUserPresets(prev => prev.filter(p => p.id !== id));
  };

  const applyOptimization = (opt: 'fast' | 'normal' | 'ultra') => {
    setLevel(opt);
    if (opt === 'fast') {
      setZip64(false);
      setEncryptionMethod('zipCrypto');
    } else if (opt === 'normal') {
      setZip64(true);
      setEncryptionMethod('aes');
    } else if (opt === 'ultra') {
      setZip64(true);
      setEncryptionMethod('aes');
    }
  };

  const applyPreset = (preset: UserPreset) => {
    setLevel(preset.level);
    setZip64(preset.zip64);
    setEncryptionMethod(preset.encryptionMethod);
    if (preset.password) setPassword(preset.password);
  };
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggleSelection = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === files.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(files.map(f => f.id)));
    }
  };

  useEffect(() => {
    // Sync selection when files are removed or search/filter changes
    const currentFileIds = new Set(files.map(f => f.id));
    setSelectedIds(prev => {
      const next = new Set<string>();
      prev.forEach(id => {
        if (currentFileIds.has(id)) next.add(id);
      });
      return next;
    });
  }, [files]);

  const [fileFilter, setFileFilter] = useState<'all' | 'images' | 'docs' | 'archives' | 'other'>('all');
  const [showBatchRename, setShowBatchRename] = useState(false);
  const [renamePrefix, setRenamePrefix] = useState('');
  const [renameSuffix, setRenameSuffix] = useState('');
  const [renameSearch, setRenameSearch] = useState('');
  const [renameReplace, setRenameReplace] = useState('');
  const [editingFileId, setEditingFileId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
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

  useEffect(() => {
    let interval: any;
    if (isProcessing && startTime) {
      interval = setInterval(() => {
        setElapsed(Math.floor((Date.now() - startTime) / 1000));
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isProcessing, startTime]);

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const onDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isProcessing) return;

    const items = e.dataTransfer.items;
    const droppedFiles: {file: File, path: string}[] = [];

    const traverseFileTree = async (item: any, path = "") => {
      if (item.isFile) {
        const file = await new Promise<File>((resolve) => item.file(resolve));
        droppedFiles.push({ file, path: path + file.name });
      } else if (item.isDirectory) {
        const dirReader = item.createReader();
        const entries = await new Promise<any[]>((resolve) => dirReader.readEntries(resolve));
        for (const entry of entries) {
          await traverseFileTree(entry, path + item.name + "/");
        }
      }
    };

    if (items) {
      const promises = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i].webkitGetAsEntry();
        if (item) {
          promises.push(traverseFileTree(item));
        }
      }
      await Promise.all(promises);
    } else {
      droppedFiles.push(...Array.from(e.dataTransfer.files).map((f: File) => ({ file: f, path: f.name })));
    }
    
    // Auto-detect extraction mode if archive files are dropped
    const archiveExtensions = ['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'tgz', 'tbz2', 'tar.gz', 'tar.bz2'];
    const hasArchive = (droppedFiles as {file: File, path: string}[]).some(f => {
      const name = f.file.name.toLowerCase();
      return archiveExtensions.some(ext => name.endsWith(ext));
    });

    if (hasArchive && mode === 'compress') {
      setMode('extract');
      setFiles([]); // Clear existing if switching to extraction
    }

    addFiles(droppedFiles);
  }, [mode, isProcessing]);

  const exportHistoryJSON = () => {
    const blob = new Blob([JSON.stringify(history, null, 2)], { type: 'application/json' });
    saveAs(blob, 'voxzip-history.json');
  };

  const exportHistoryCSV = () => {
    const headers = ['ID', 'Type', 'Timestamp', 'Filename', 'Count', 'Status', 'Details', 'Hint'];
    const rows = history.map(h => [
      h.id,
      h.type,
      h.timestamp.toISOString(),
      `"${h.fileName}"`,
      h.fileCount,
      h.status,
      `"${h.details || ''}"`,
      `"${h.hint || ''}"`
    ]);
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    saveAs(blob, 'voxzip-history.csv');
  };

  const addFiles = (newFiles: (File | {file: File, path: string})[]) => {
    const fileItems: FileItem[] = newFiles.map(f => {
      const isObject = 'file' in f;
      const fileObj = isObject ? f.file : f;
      const filePath = isObject ? f.path : f.name;
      
      return {
        id: Math.random().toString(36).substr(2, 9),
        file: fileObj,
        path: filePath,
        progress: 0,
        status: 'idle',
        dateAdded: Date.now()
      };
    });
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

  const getSortedFiles = () => {
    let filtered = [...files];
    
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(item => 
        item.file.name.toLowerCase().includes(query) || 
        (item.path && item.path.toLowerCase().includes(query))
      );
    }
    
    if (fileFilter !== 'all') {
      filtered = filtered.filter(item => {
        const ext = item.file.name.split('.').pop()?.toLowerCase();
        if (fileFilter === 'images') return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext || '');
        if (fileFilter === 'docs') return ['pdf', 'doc', 'docx', 'txt', 'xls', 'xlsx', 'ppt', 'pptx'].includes(ext || '');
        if (fileFilter === 'archives') return ['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz'].includes(ext || '');
        if (fileFilter === 'other') {
          const known = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'pdf', 'doc', 'docx', 'txt', 'xls', 'xlsx', 'ppt', 'pptx', 'zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz'];
          return !known.includes(ext || '');
        }
        return true;
      });
    }

    return filtered.sort((a, b) => {
      let comparison = 0;
      if (sortBy === 'name') {
        comparison = a.file.name.localeCompare(b.file.name);
      } else if (sortBy === 'size') {
        comparison = a.file.size - b.file.size;
      } else if (sortBy === 'date') {
        comparison = a.dateAdded - b.dateAdded;
      } else if (sortBy === 'type') {
        const extA = a.file.name.split('.').pop()?.toLowerCase() || '';
        const extB = b.file.name.split('.').pop()?.toLowerCase() || '';
        comparison = extA.localeCompare(extB);
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });
  };

  const handleBatchRename = () => {
    setFiles(prev => prev.map(item => {
      let newName = item.file.name;
      const lastDot = newName.lastIndexOf('.');
      const nameWithoutExt = lastDot !== -1 ? newName.substring(0, lastDot) : newName;
      const ext = lastDot !== -1 ? newName.substring(lastDot) : '';

      let processedName = nameWithoutExt;

      if (renameSearch) {
        processedName = processedName.replaceAll(renameSearch, renameReplace);
      }
      
      processedName = `${renamePrefix}${processedName}${renameSuffix}`;
      
      const newFile = new File([item.file], `${processedName}${ext}`, { type: item.file.type });
      return { ...item, file: newFile };
    }));
    setShowBatchRename(false);
    setRenamePrefix('');
    setRenameSuffix('');
    setRenameSearch('');
    setRenameReplace('');
  };

  const handleSingleRename = (id: string) => {
    const item = files.find(f => f.id === id);
    if (!item) return;

    const lastDot = item.file.name.lastIndexOf('.');
    const ext = lastDot !== -1 ? item.file.name.substring(lastDot) : '';
    const newFile = new File([item.file], `${editName}${ext}`, { type: item.file.type });
    
    setFiles(prev => prev.map(f => f.id === id ? { ...f, file: newFile } : f));
    setEditingFileId(null);
  };

  const getPasswordStrength = (pass: string) => {
    if (!pass) return null;
    if (pass.length < 6) return { label: 'Weak', color: 'text-red-500', bg: 'bg-red-500' };
    const hasLetters = /[a-zA-Z]/.test(pass);
    const hasNumbers = /[0-9]/.test(pass);
    const hasSymbols = /[^a-zA-Z0-9]/.test(pass);
    const strength = [hasLetters, hasNumbers, hasSymbols].filter(Boolean).length;
    
    if (pass.length >= 10 && strength === 3) return { label: 'Strong', color: 'text-emerald-500', bg: 'bg-emerald-500' };
    if (pass.length >= 8 && strength >= 2) return { label: 'Medium', color: 'text-amber-500', bg: 'bg-amber-500' };
    return { label: 'Weak', color: 'text-red-500', bg: 'bg-red-500' };
  };

  const strength = getPasswordStrength(password);

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
    setStartTime(Date.now());
    setElapsed(0);
    setProcessedBytes(0);

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
        
        lastProcessedRef.current = 0;
        await zipWriter.add(item.path || item.file.name, new zip.BlobReader(item.file), {
          level: levelMap[level],
          // @ts-ignore
          encryptionMethod: password ? encryptionMethod : undefined,
          onprogress: (current, total) => {
            const p = (current / total) * 100;
            const totalP = (i / files.length) * 100 + (p / files.length);
            setOverallProgress(Math.min(totalP, 99));
            
            const delta = current - lastProcessedRef.current;
            lastProcessedRef.current = current;
            setProcessedBytes(prev => prev + delta);

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
        status: 'success',
        hint: passwordHint || undefined
      };
      setHistory(prev => [summary, ...prev]);
      
      if (passwordHint) {
        localStorage.setItem(`voxzip-hint-${summary.id}`, passwordHint);
      }

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
  const extractFiles = async (targetHandle?: FileSystemDirectoryHandle) => {
    if (files.length === 0) return;
    setIsProcessing(true);
    setShowProgress(true);
    setOverallProgress(0);
    setStartTime(Date.now());
    setElapsed(0);
    setProcessedBytes(0);

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
                  lastProcessedRef.current = 0;
                  const content = await entry.getData(new zip.BlobWriter(), {
                    password: password || undefined,
                    onprogress: (current: number, total: number) => {
                      const p = (current / total) * 100;
                      const globalP = (archiveIdx / files.length) * 100 + (p / files.length);
                      setOverallProgress(Math.min(globalP, 99));

                      const delta = current - lastProcessedRef.current;
                      lastProcessedRef.current = current;
                      setProcessedBytes(prev => prev + delta);

                      setFiles(prev => prev.map(f => f.id === item.id ? { ...f, progress: p } : f));
                    }
                  });

                  if (targetHandle) {
                    const pathParts = entry.filename.split('/');
                    let currentDir = targetHandle;
                    for (let j = 0; j < pathParts.length - 1; j++) {
                      currentDir = await currentDir.getDirectoryHandle(pathParts[j], { create: true });
                    }
                    const fileHandle = await currentDir.getFileHandle(pathParts[pathParts.length - 1], { create: true });
                    const writable = await (fileHandle as any).createWritable();
                    await writable.write(content);
                    await writable.close();
                  } else {
                    saveAs(content, entry.filename);
                  }
                  setProcessedBytes(prev => prev + content.size);
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
            
            const downloadFiles = async (data: any, path = '', dirHandle?: FileSystemDirectoryHandle) => {
              for (const key in data) {
                const innerItem = data[key];
                if (innerItem instanceof File) {
                  if (dirHandle) {
                    const fileHandle = await dirHandle.getFileHandle(key, { create: true });
                    const writable = await (fileHandle as any).createWritable();
                    await writable.write(innerItem);
                    await writable.close();
                  } else {
                    saveAs(innerItem, key);
                  }
                  setProcessedBytes(prev => prev + innerItem.size);
                } else if (typeof innerItem === 'object') {
                  const nextDir = dirHandle ? await dirHandle.getDirectoryHandle(key, { create: true }) : undefined;
                  await downloadFiles(innerItem, `${path}${key}/`, nextDir);
                }
              }
            };
            
            await downloadFiles(obj, '', targetHandle);
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

  const handleExtractToFolder = async () => {
    try {
      // @ts-ignore
      if (!window.showDirectoryPicker) {
        return extractFiles();
      }
      // @ts-ignore
      const handle = await window.showDirectoryPicker();
      await extractFiles(handle as FileSystemDirectoryHandle);
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        alert(`Extraction Aborted: ${e.message}`);
      }
    }
  };

  const verifyArchive = async (item: FileItem, silent = false) => {
    if (!silent) setIsVerifying(true);
    try {
      const ext = item.file.name.split('.').pop()?.toLowerCase();
      if (ext === 'zip') {
        const zipReader = new zip.ZipReader(new zip.BlobReader(item.file));
        const entries = await zipReader.getEntries();
        let corrupted = false;
        
        for (const entry of entries) {
          if (!entry.directory) {
            try {
              // @ts-ignore
              await entry.getData(new zip.Uint8ArrayWriter(), {
                password: password || undefined
              });
            } catch (e) {
              corrupted = true;
              break;
            }
          }
        }
        await zipReader.close();
        
        if (corrupted) {
          if (!silent) alert(`Integrity Check Failed: ${item.file.name} appears corrupted or password protected.`);
          return false;
        } else {
          if (!silent) alert(`Integrity Verified: ${item.file.name} is healthy.`);
          return true;
        }
      } else {
        // Universal verify via LibArchive
        // @ts-ignore
        const archive = await LibArchive.open(item.file);
        // @ts-ignore
        const entries = await archive.getFilesArray();
        if (entries && entries.length > 0) {
          if (!silent) alert(`Integrity Verified: ${item.file.name} is healthy. (Scanned ${entries.length} items)`);
          return true;
        } else {
          throw new Error('Empty or invalid archive structure.');
        }
      }
    } catch (e: any) {
      if (!silent) alert(`Verification Error: ${e.message || 'Archive structure invalid or password required.'}`);
      return false;
    } finally {
      if (!silent) setIsVerifying(false);
    }
  };

  const verifyAllArchives = async () => {
    const targets = selectedIds.size > 0 
      ? files.filter(f => selectedIds.has(f.id))
      : files;
    
    if (targets.length === 0) return;
    
    setIsVerifying(true);
    let successCount = 0;
    let failCount = 0;

    // Use a small concurrency limit to avoid crashing the browser with too many parallel WASM instances or large memory reads
    const concurrencyLimit = 3;
    const results: boolean[] = [];
    
    for (let i = 0; i < targets.length; i += concurrencyLimit) {
      const chunk = targets.slice(i, i + concurrencyLimit);
      const chunkResults = await Promise.all(chunk.map(item => verifyArchive(item, true)));
      results.push(...chunkResults);
    }

    successCount = results.filter(Boolean).length;
    failCount = results.length - successCount;

    setIsVerifying(false);
    alert(`Batch Verification Complete:\n✅ Healthy: ${successCount}\n❌ Failed/Corrupted: ${failCount}`);
  };

  const previewArchive = async (item: FileItem) => {
    setIsProcessing(true);
    try {
      const ext = item.file.name.split('.').pop()?.toLowerCase();
      if (ext === 'zip') {
        const zipReader = new zip.ZipReader(new zip.BlobReader(item.file));
        const entries = await zipReader.getEntries();
        setPreviewFiles(entries.filter(e => !e.directory).map(e => ({ name: e.filename, size: e.uncompressedSize || 0 })));
        await zipReader.close();
      } else {
        // @ts-ignore
        const archive = await LibArchive.open(item.file);
        // @ts-ignore
        const entries = await archive.getFilesArray();
        setPreviewFiles(entries.map((e: any) => ({ name: e.path, size: e.size || 0 })));
      }
      setIsPreviewing(true);
    } catch (e: any) {
      alert(`Preview Error: ${e.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const totalSize = files.reduce((acc, f) => acc + f.file.size, 0);
  const fileTypeDistribution = files.reduce((acc: Record<string, number>, item) => {
    const ext = item.file.name.split('.').pop()?.toLowerCase() || 'other';
    const category = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext) ? 'Images' :
                     ['pdf', 'doc', 'docx', 'txt', 'xls', 'xlsx', 'ppt', 'pptx'].includes(ext) ? 'Docs' :
                     ['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'iso'].includes(ext) ? 'Archives' :
                     ['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(ext) ? 'Media' : 'Other';
    acc[category] = (acc[category] || 0) + 1;
    return acc;
  }, {});

  const getEstimatedSize = () => {
    if (mode === 'extract') return totalSize;
    const ratio = level === 'ultra' ? 0.35 : level === 'normal' ? 0.5 : 0.7;
    return totalSize * ratio;
  };

  const estimatedSize = getEstimatedSize();

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
                <motion.span 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.5 }}
                  className="text-[10px] font-mono font-black text-gray-600 absolute -bottom-4 right-0"
                >
                  v{APP_VERSION}
                </motion.span>
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
      <BackgroundParticles isDarkMode={isDarkMode} />
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
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-black tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 to-purple-500 leading-none">
                VOXZIP
              </h1>
              <span className="text-[8px] font-mono font-bold text-gray-500 bg-white/5 border border-white/5 px-1.5 py-0.5 rounded-full leading-none mb-0.5">V{APP_VERSION}</span>
            </div>
            <p className="hidden sm:block text-[8px] text-gray-500 font-mono uppercase tracking-[0.2em] leading-none mt-1">High Performance</p>
          </div>
        </div>
        
          <div className="flex items-center gap-1.5">
            <div className={cn(
              "hidden md:flex items-center gap-1 p-1 rounded-xl border mr-2",
              isDarkMode ? "bg-white/5 border-white/5" : "bg-gray-50 border-gray-100"
            )}>
              {(['cyberpunk', 'midnight', 'emerald', 'sunset'] as Theme[]).map(t => (
                <button
                  key={t}
                  onClick={() => setTheme(t)}
                  className={cn(
                    "w-6 h-6 rounded-lg border transition-all",
                    theme === t ? "border-cyan-500 scale-110 shadow-lg" : "border-transparent opacity-50 hover:opacity-100",
                    t === 'cyberpunk' ? "bg-cyan-500" :
                    t === 'midnight' ? "bg-blue-600" :
                    t === 'emerald' ? "bg-emerald-500" : "bg-amber-500"
                  )}
                  title={`Enforce ${t} Matrix`}
                />
              ))}
            </div>

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
            title="App Information & Help"
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
            onClick={() => setTheme(theme === 'cyberpunk' ? 'midnight' : 'cyberpunk')}
            title="Toggle Next Gen Interface"
            className={cn(
              "p-2.5 rounded-xl transition-all duration-300 border hover:shadow-lg",
              isDarkMode 
                ? "bg-white/10 border-white/5 text-cyan-400 shadow-[0_0_20px_rgba(34,211,238,0.1)]" 
                : "bg-white border-gray-200 text-gray-600 shadow-sm"
            )}
          >
            {theme === 'cyberpunk' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
        </div>
      </header>

      <main className="relative pt-24 pb-20 px-4 max-w-5xl mx-auto">
        {/* Batch Rename Modal */}
      <AnimatePresence>
        {showBatchRename && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowBatchRename(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-md"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className={cn(
                "relative w-full max-w-lg rounded-[2.5rem] border p-8 shadow-2xl flex flex-col gap-6",
                isDarkMode ? "bg-[#0a0a0c] border-white/10" : "bg-white border-gray-200"
              )}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-cyan-500/10 flex items-center justify-center border border-cyan-500/20">
                    <FileIcon className="w-5 h-5 text-cyan-500" />
                  </div>
                  <div>
                    <h2 className="font-black text-xl tracking-tighter uppercase">Batch Rename</h2>
                    <p className="text-[10px] text-gray-500 font-mono uppercase tracking-[0.2em] font-bold">Transformation Tools</p>
                  </div>
                </div>
                <button onClick={() => setShowBatchRename(false)} className="p-2 hover:bg-white/5 rounded-xl transition-colors">
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">Prefix</label>
                  <input 
                    value={renamePrefix}
                    onChange={(e) => setRenamePrefix(e.target.value)}
                    className={cn(
                      "w-full rounded-xl px-4 py-3 text-xs font-black focus:outline-none focus:ring-1 focus:ring-cyan-500/40 transition-all border",
                      isDarkMode ? "bg-white/[0.03] border-white/5 text-white" : "bg-gray-50 border-gray-100 text-gray-900"
                    )}
                    placeholder="v1_"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">Suffix</label>
                  <input 
                    value={renameSuffix}
                    onChange={(e) => setRenameSuffix(e.target.value)}
                    className={cn(
                      "w-full rounded-xl px-4 py-3 text-xs font-black focus:outline-none focus:ring-1 focus:ring-cyan-500/40 transition-all border",
                      isDarkMode ? "bg-white/[0.03] border-white/5 text-white" : "bg-gray-50 border-gray-100 text-gray-900"
                    )}
                    placeholder="_final"
                  />
                </div>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">Find & Replace</label>
                  <div className="grid grid-cols-2 gap-2">
                    <input 
                      value={renameSearch}
                      onChange={(e) => setRenameSearch(e.target.value)}
                      className={cn(
                        "w-full rounded-xl px-4 py-3 text-xs font-black focus:outline-none focus:ring-1 focus:ring-cyan-500/40 transition-all border",
                        isDarkMode ? "bg-white/[0.03] border-white/5 text-white" : "bg-gray-50 border-gray-100 text-gray-900"
                      )}
                      placeholder="Search"
                    />
                    <input 
                      value={renameReplace}
                      onChange={(e) => setRenameReplace(e.target.value)}
                      className={cn(
                        "w-full rounded-xl px-4 py-3 text-xs font-black focus:outline-none focus:ring-1 focus:ring-cyan-500/40 transition-all border",
                        isDarkMode ? "bg-white/[0.03] border-white/5 text-white" : "bg-gray-50 border-gray-100 text-gray-900"
                      )}
                      placeholder="Replace"
                    />
                  </div>
                </div>
              </div>

              <button 
                onClick={handleBatchRename}
                className="w-full py-4 mt-2 rounded-2xl bg-cyan-500 text-white font-black text-xs uppercase tracking-[0.2em] shadow-lg shadow-cyan-500/30 hover:scale-[1.02] active:scale-95 transition-all"
              >
                Apply Transformation
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

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
                <div className="flex flex-col gap-4">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className={cn(
                      "flex gap-1 p-1 rounded-2xl border transition-colors",
                      isDarkMode ? "bg-white/5 border-white/5" : "bg-gray-100 border-gray-200"
                    )}>
                      <button 
                        onClick={() => { setMode('compress'); setFiles([]); }}
                        className={cn(
                          "px-6 py-2.5 rounded-xl text-sm font-black uppercase tracking-tight transition-all duration-300 flex items-center gap-2 relative overflow-hidden",
                          mode === 'compress' 
                            ? (isDarkMode ? "bg-white/10 text-white shadow-[0_0_20px_rgba(34,211,238,0.2)] ring-1 ring-white/20" : "bg-white text-gray-900 shadow-md") 
                            : (isDarkMode ? "text-gray-400 hover:text-white hover:bg-white/5" : "text-gray-500 hover:text-gray-900 hover:bg-gray-200/50")
                        )}
                      >
                        <ArchiveIcon className={cn("w-4 h-4", mode === 'compress' ? "text-cyan-400" : "text-gray-500")} />
                        Compress
                      </button>
                      <button 
                        onClick={() => { setMode('extract'); setFiles([]); }}
                        className={cn(
                          "px-6 py-2.5 rounded-xl text-sm font-black uppercase tracking-tight transition-all duration-300 flex items-center gap-2 relative overflow-hidden",
                          mode === 'extract' 
                            ? (isDarkMode ? "bg-white/10 text-white shadow-[0_0_20px_rgba(168,85,247,0.2)] ring-1 ring-white/20" : "bg-white text-gray-900 shadow-md") 
                            : (isDarkMode ? "text-gray-400 hover:text-white hover:bg-white/5" : "text-gray-500 hover:text-gray-900 hover:bg-gray-200/50")
                        )}
                      >
                        <FileArchive className={cn("w-4 h-4", mode === 'extract' ? "text-purple-400" : "text-gray-500")} />
                        Extract
                      </button>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <div className={cn(
                        "hidden md:flex items-center gap-1 p-1 rounded-xl border mr-2",
                        isDarkMode ? "bg-white/5 border-white/5" : "bg-gray-50 border-gray-100"
                      )}>
                        {(['cyberpunk', 'midnight', 'emerald', 'sunset'] as Theme[]).map(t => (
                          <button
                            key={t}
                            onClick={() => setTheme(t)}
                            className={cn(
                              "w-6 h-6 rounded-lg border transition-all",
                              theme === t ? "border-cyan-500 scale-110 shadow-lg" : "border-transparent opacity-50 hover:opacity-100",
                              t === 'cyberpunk' ? "bg-cyan-500" :
                              t === 'midnight' ? "bg-blue-600" :
                              t === 'emerald' ? "bg-emerald-500" : "bg-amber-500"
                            )}
                            title={`Enforce ${t} Matrix`}
                          />
                        ))}
                      </div>

                      {isInstallable && (
                        <button 
                          onClick={handleInstallClick}
                          className="px-4 py-2.5 rounded-xl bg-orange-500/10 border border-orange-500/20 text-orange-500 text-[10px] font-black uppercase tracking-widest hover:bg-orange-500/20 transition-all"
                        >
                          Install PWA
                        </button>
                      )}
                    </div>
                  </div>
                </div>

            <motion.div 
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              onDragOver={onDragOver}
              onDrop={onDrop}
              className={cn(
                "relative group h-64 rounded-[2rem] border-2 border-dashed flex flex-col items-center justify-center gap-6 cursor-pointer transition-all duration-500 overflow-hidden backdrop-blur-md",
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
              
              <div className="flex flex-col items-center gap-3">
                <div className={cn(
                  "w-16 h-16 rounded-[1.5rem] flex items-center justify-center group-hover:scale-110 group-hover:rotate-3 transition-all duration-500 shadow-xl",
                  isDarkMode ? "bg-white/5 border border-white/10" : "bg-white border border-gray-100 shadow-lg"
                )}>
                  <Upload className="w-8 h-8 text-cyan-500" />
                </div>
                
                <div className="text-center px-4">
                  <p className={cn(
                    "text-lg font-black tracking-tight",
                    isDarkMode ? "text-gray-200" : "text-gray-700"
                  )}>
                    {mode === 'compress' ? 'DROP PAYLOAD HERE' : 'DROP TO EXTRACT'}
                  </p>
                  <p className="text-[10px] text-gray-500 mt-0.5 max-w-sm mx-auto font-bold font-mono tracking-widest uppercase">
                    {(mode === 'compress' ? 'Files or Folders' : 'Auto-Detection Active')}
                  </p>
                </div>
              </div>

              <div className="flex gap-3 z-10" onClick={(e) => e.stopPropagation()}>
                <button 
                  onClick={() => {
                    const input = fileInputRef.current;
                    if (input) {
                      // @ts-ignore
                      input.webkitdirectory = false;
                      input.multiple = true;
                      input.click();
                    }
                  }}
                  className={cn(
                    "px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border",
                    isDarkMode ? "bg-white/5 border-white/10 hover:bg-white/10" : "bg-white border-gray-200 hover:bg-gray-50 shadow-sm"
                  )}
                >
                  Select Files
                </button>
                {mode === 'compress' && (
                  <button 
                    onClick={() => {
                      const input = fileInputRef.current;
                      if (input) {
                        // @ts-ignore
                        input.webkitdirectory = true;
                        input.multiple = true;
                        input.click();
                      }
                    }}
                    className={cn(
                      "px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border",
                      isDarkMode ? "bg-cyan-500/10 border-cyan-500/30 text-cyan-500 hover:bg-cyan-500/20" : "bg-cyan-50 border-cyan-200 text-cyan-600 hover:bg-cyan-100 shadow-sm"
                    )}
                  >
                    Select Folder
                  </button>
                )}
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

                <AnimatePresence>
                  {files.length === 0 && history.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="space-y-4"
                    >
                      <div className="flex items-center justify-between px-1">
                        <h2 className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">Recent Streams</h2>
                        <button 
                          onClick={() => setHistory([])}
                          className="text-[9px] font-black text-red-500/60 hover:text-red-500 uppercase tracking-widest transition-colors"
                        >
                          Wipe History
                        </button>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {history.slice(0, 4).map(item => (
                          <div 
                            key={item.id}
                            className={cn(
                              "p-4 rounded-3xl border backdrop-blur-md flex items-center justify-between group hover:border-cyan-500/30 transition-all duration-500",
                              isDarkMode ? "bg-white/[0.03] border-white/5" : "bg-white/60 border-gray-100 shadow-sm"
                            )}
                          >
                            <div className="flex items-center gap-3">
                              <div className={cn(
                                "w-10 h-10 rounded-2xl flex items-center justify-center border",
                                item.type === 'compress' 
                                  ? (isDarkMode ? "bg-cyan-500/10 border-cyan-500/20 text-cyan-500" : "bg-cyan-50 border-cyan-200 text-cyan-600")
                                  : (isDarkMode ? "bg-purple-500/10 border-purple-500/20 text-purple-500" : "bg-purple-50 border-purple-200 text-purple-600")
                              )}>
                                {item.type === 'compress' ? <ArchiveIcon className="w-5 h-5" /> : <FileArchive className="w-5 h-5" />}
                              </div>
                              <div className="min-w-0">
                                <p className="text-[11px] font-black tracking-tight truncate max-w-[120px]">{item.fileName}</p>
                                <p className="text-[8px] text-gray-500 font-mono font-bold uppercase">
                                  {item.fileCount} Files • {item.timestamp.toLocaleDateString()}
                                </p>
                                {item.hint && (
                                  <div className="mt-1 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <Lock className="w-2.5 h-2.5 text-emerald-500" />
                                    <Tooltip text={`Hint: ${item.hint}`}>
                                      <p className="text-[7px] text-emerald-500 font-black uppercase tracking-widest cursor-help">Hint Available</p>
                                    </Tooltip>
                                  </div>
                                )}
                              </div>
                            </div>
                            <div className={cn(
                              "w-1.5 h-1.5 rounded-full",
                              item.status === 'success' ? "bg-emerald-500" : "bg-red-500"
                            )} />
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <AnimatePresence>
                  {files.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="grid grid-cols-1 md:grid-cols-4 gap-3"
                    >
                      <div className={cn(
                        "p-4 rounded-3xl border backdrop-blur-md transition-all h-full flex flex-col justify-between",
                        isDarkMode ? "bg-white/[0.03] border-white/5" : "bg-white/60 border-gray-100 shadow-sm"
                      )}>
                        <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest leading-none mb-2">Payload Total</p>
                        <p className="text-xl font-black tracking-tighter leading-none">{formatBytes(totalSize)}</p>
                      </div>
                      <div className={cn(
                        "p-4 rounded-3xl border backdrop-blur-md transition-all h-full flex flex-col justify-between border-cyan-500/10",
                        isDarkMode ? "bg-cyan-500/5" : "bg-cyan-50/60"
                      )}>
                        <p className="text-[9px] font-black text-cyan-500 uppercase tracking-widest leading-none mb-2">{mode === 'compress' ? 'Target Est.' : 'Native Size'}</p>
                        <p className="text-xl font-black tracking-tighter leading-none">{formatBytes(estimatedSize)}</p>
                      </div>
                      <div className={cn(
                        "p-4 rounded-3xl border backdrop-blur-md transition-all h-full flex flex-col justify-between",
                        isDarkMode ? "bg-white/[0.03] border-white/5" : "bg-white/60 border-gray-100 shadow-sm"
                      )}>
                        <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest leading-none mb-2">File Count</p>
                        <p className="text-xl font-black tracking-tighter leading-none">{files.length}</p>
                      </div>
                      <div className={cn(
                        "p-4 rounded-3xl border backdrop-blur-md transition-all h-full flex flex-col justify-between",
                        isDarkMode ? "bg-white/[0.03] border-white/5" : "bg-white/60 border-gray-100 shadow-sm"
                      )}>
                        <p className="text-[9px] font-black text-emerald-500 uppercase tracking-widest leading-none mb-2">Efficiency</p>
                        <p className="text-xl font-black tracking-tighter leading-none">
                          {mode === 'compress' ? `${Math.round((1 - (estimatedSize / totalSize)) * 100)}%` : '100%'}
                        </p>
                      </div>

                      <div className="md:col-span-4 flex flex-wrap items-center justify-between gap-4 pt-1">
                        <div className="flex flex-wrap items-center gap-4">
                          <div className={cn(
                            "flex items-center gap-1 p-1 rounded-xl border",
                            isDarkMode ? "bg-white/5 border-white/5" : "bg-gray-50 border-gray-200"
                          )}>
                            {(['date', 'name', 'size', 'type'] as const).map(s => (
                              <button 
                                key={s}
                                onClick={() => {
                                  if (sortBy === s) setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
                                  else setSortBy(s);
                                }}
                                title={`Sort by ${s}`}
                                className={cn(
                                  "px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-tighter transition-all",
                                  sortBy === s ? "bg-cyan-500 text-white shadow-lg" : "text-gray-500 hover:text-cyan-400"
                                )}
                              >
                                {s}
                              </button>
                            ))}
                          </div>

                          <button 
                            onClick={toggleSelectAll}
                            className={cn(
                              "px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all",
                              selectedIds.size === files.length && files.length > 0
                                ? "bg-cyan-500 text-white border-cyan-400"
                                : "text-gray-500 bg-white/5 border-white/5 hover:bg-white/10"
                            )}
                          >
                            {selectedIds.size === files.length && files.length > 0 ? 'Deselect All' : 'Select All'}
                          </button>

                          {mode === 'extract' && (
                            <button 
                              onClick={verifyAllArchives}
                              disabled={isProcessing || isVerifying}
                              className={cn(
                                "text-[10px] font-black transition-all uppercase tracking-widest px-4 py-2.5 rounded-xl border flex items-center gap-2",
                                selectedIds.size > 0 
                                  ? "bg-emerald-500 text-white border-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.3)]" 
                                  : "text-emerald-500 bg-emerald-500/10 border-emerald-500/20 hover:bg-emerald-500/20"
                              )}
                            >
                              {isVerifying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                              {selectedIds.size > 0 ? `Verify Selected (${selectedIds.size})` : 'Verify All'}
                            </button>
                          )}

                          <button 
                            onClick={() => setShowBatchRename(true)}
                            title="Batch Rename Files"
                            className="text-[10px] font-black text-cyan-500 hover:text-cyan-400 transition-colors uppercase tracking-widest bg-cyan-500/10 px-4 py-2.5 rounded-xl border border-cyan-500/20"
                          >
                            Batch Rename
                          </button>

                          <button 
                            onClick={clearFiles}
                            title="Clear All Files"
                            className="text-[10px] font-black text-red-500 hover:text-red-400 transition-colors uppercase tracking-widest bg-red-500/10 px-4 py-2.5 rounded-xl border border-red-500/20 flex items-center gap-2"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Clear
                          </button>
                        </div>

                        <div className="relative flex-1 max-w-xs group">
                          <Settings2 className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500 group-hover:text-cyan-500 transition-colors" />
                          <input 
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="SEARCH PAYLOAD..."
                            className={cn(
                              "w-full rounded-2xl pl-10 pr-4 py-2 text-[10px] font-black uppercase tracking-widest focus:outline-none focus:ring-1 focus:ring-cyan-500/40 transition-all border",
                              isDarkMode ? "bg-white/[0.03] border-white/10 text-white" : "bg-gray-100 border-gray-200"
                            )}
                          />
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <AnimatePresence mode="popLayout">
                  {files.length > 0 && (
                    <motion.div 
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[600px] overflow-y-auto custom-scrollbar pr-2 py-1"
                    >
                      {getSortedFiles().map(item => (
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
                              : "bg-white/60 border-gray-100 shadow-sm hover:shadow-md hover:border-gray-200",
                            selectedIds.has(item.id) && (isDarkMode ? "bg-cyan-500/10 border-cyan-500/40" : "bg-cyan-50 border-cyan-200 shadow-inner")
                          )}
                        >
                          <div 
                            onClick={() => toggleSelection(item.id)}
                            className={cn(
                              "w-5 h-5 rounded flex items-center justify-center border cursor-pointer shrink-0 transition-all",
                              selectedIds.has(item.id) 
                                ? "bg-cyan-500 border-cyan-500 text-white" 
                                : "bg-white/5 border-white/10"
                            )}
                          >
                            {selectedIds.has(item.id) && <CheckCircle2 className="w-3.5 h-3.5" />}
                          </div>

                          <div className={cn(
                            "w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-transform duration-500 group-hover:scale-105",
                            isDarkMode ? "bg-white/5 border border-white/5" : "bg-gray-100"
                          )}>
                            {item.status === 'completed' ? <CheckCircle2 className="w-5 h-5 text-emerald-400" /> :
                             item.status === 'processing' ? <Loader2 className="w-4 h-4 text-cyan-400 animate-spin" /> :
                             item.status === 'error' ? <AlertCircle className="w-4 h-4 text-red-500" /> :
                             getFileIcon(item.file.name)}
                          </div>
                                                 <div className="flex-1 min-w-0 group-hover:pr-14 transition-all duration-300">
                            {editingFileId === item.id ? (
                              <input 
                                autoFocus
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                onBlur={() => handleSingleRename(item.id)}
                                onKeyDown={(e) => e.key === 'Enter' && handleSingleRename(item.id)}
                                className="w-full bg-cyan-500/20 border border-cyan-500/30 rounded px-2 py-0.5 text-[11px] font-black text-white focus:outline-none"
                              />
                            ) : (
                              <h4 
                                onDoubleClick={() => {
                                  setEditingFileId(item.id);
                                  const name = item.file.name;
                                  const lastDot = name.lastIndexOf('.');
                                  setEditName(lastDot !== -1 ? name.substring(0, lastDot) : name);
                                }}
                                className="text-[11px] font-black truncate tracking-tight cursor-text hover:text-cyan-400 transition-colors"
                              >
                                {item.path && item.path.includes('/') ? (
                                  <span className="flex items-center gap-1">
                                    <span className="text-gray-500 font-mono text-[9px] font-bold opacity-60">{item.path.split('/').slice(0, -1).join('/')}/</span>
                                    {item.file.name}
                                  </span>
                                ) : item.file.name}
                              </h4>
                            )}
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className="text-[9px] font-mono font-bold text-gray-500 bg-white/5 px-2 py-0.5 rounded-md">
                                {formatBytes(item.file.size)}
                              </span>
                              <span className="text-[8px] font-mono font-black text-gray-400 bg-white/5 border border-white/5 px-1.5 py-0.5 rounded uppercase leading-none opacity-60">
                                {item.file.name.split('.').pop() || 'N/A'}
                              </span>
                              {item.status === 'processing' && (
                                <div className="flex items-center gap-1">
                                  <Loader2 className="w-3 h-3 text-cyan-400 animate-spin" />
                                  <span className="text-[8px] font-black text-cyan-400 uppercase tracking-tighter">Syncing...</span>
                                </div>
                              )}
                              {item.status === 'completed' && (
                                <div className="flex items-center gap-1">
                                  <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                                  <span className="text-[8px] font-black text-emerald-500 uppercase tracking-tighter">Verified</span>
                                </div>
                              )}
                              {item.status === 'error' && (
                                <Tooltip text={item.errorMessage || "System Breach Detected"}>
                                  <div className="flex items-center gap-1 cursor-help">
                                    <AlertCircle className="w-3 h-3 text-red-500 animate-pulse" />
                                    <span className="text-[8px] font-black text-red-500 uppercase tracking-tighter underline decoration-dotted">Critical Failure</span>
                                  </div>
                                </Tooltip>
                              )}
                              {item.compressedSize && item.status === 'completed' && (
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
                            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-0 group-hover:opacity-100 translate-x-4 group-hover:translate-x-0 transition-all duration-300">
                              {mode === 'extract' && (
                                <button
                                  onClick={() => handlePreview(item)}
                                  className="p-1.5 rounded-lg hover:bg-cyan-500/10 text-cyan-400 transition-colors"
                                  title="Quick Look Picker"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                </button>
                              )}
                              {mode === 'extract' && (
                                <div className="flex items-center gap-1">
                                  <button
                                    onClick={() => previewArchive(item)}
                                    className="p-1.5 rounded-lg hover:bg-cyan-500/10 text-cyan-400 transition-colors"
                                    title="Preview Archive Contents"
                                  >
                                    <Eye className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    disabled={isVerifying}
                                    onClick={() => verifyArchive(item)}
                                    className="p-1.5 rounded-lg hover:bg-emerald-500/10 text-emerald-400 transition-colors"
                                    title="Verify Integrity"
                                  >
                                    {isVerifying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                                  </button>
                                </div>
                              )}
                              <button 
                                onClick={() => removeFile(item.id)}
                                title="Remove File From List"
                                className="p-1.5 rounded-lg hover:bg-red-500/10 text-red-400 transition-colors"
                              >
                                <X className="w-3.5 h-3.5" />
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
                "fixed inset-0 z-[200] xl:relative xl:inset-auto transition-all duration-500 xl:translate-y-0 xl:opacity-100",
                isConfigOpen ? "translate-y-0 opacity-100 visible" : "translate-y-full opacity-0 invisible xl:visible xl:opacity-100 xl:translate-y-0"
              )}>
                <div className={cn(
                  "flex flex-col h-full xl:h-auto xl:sticky xl:top-24",
                  isDarkMode ? "bg-[#050507] xl:bg-transparent" : "bg-white xl:bg-transparent"
                )}>
                          <div className="flex xl:hidden items-center justify-between p-6 pb-2">
                             <h2 className="font-black text-xl tracking-tighter uppercase">Configuration</h2>
                             <button 
                               onClick={() => setIsConfigOpen(false)} 
                               className={cn(
                                 "p-2 rounded-xl border transition-all",
                                 isDarkMode ? "bg-white/5 border-white/10" : "bg-gray-100 border-gray-200"
                               )}
                             >
                               <X className="w-6 h-6" />
                             </button>
                           </div>

                           <div className="px-4 xl:px-0 space-y-4">
                             <div className={cn(
                               "rounded-[2rem] p-5 border backdrop-blur-xl",
                               isDarkMode ? "bg-white/[0.03] border-white/10" : "bg-white border-gray-100 shadow-sm"
                             )}>
                               <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1 mb-3 block">Matrix Optimization</label>
                               <div className="grid grid-cols-3 gap-2 mb-4">
                                 {[
                                   { name: 'SPEED', level: 'fast', icon: <Zap className="w-3 h-3" /> },
                                   { name: 'BALANCED', level: 'normal', icon: <Activity className="w-3 h-3" /> },
                                   { name: 'MAXIMUM', level: 'ultra', icon: <Layers className="w-3 h-3" /> }
                                 ].map(p => (
                                   <button
                                     key={p.name}
                                     onClick={() => applyOptimization(p.level as any)}
                                     className={cn(
                                       "flex flex-col items-center justify-center gap-1.5 p-3 rounded-2xl border transition-all duration-300",
                                       level === p.level 
                                         ? "bg-cyan-500 border-cyan-400 text-white shadow-lg scale-105" 
                                         : "bg-white/5 border-white/5 text-gray-500 hover:border-white/10"
                                     )}
                                   >
                                     {p.icon}
                                     <span className="text-[8px] font-black">{p.name}</span>
                                   </button>
                                 ))}
                               </div>

                               <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1 mb-3 block">Personal Matrixes</label>
                               <div className="flex gap-2 mb-4">
                                 <input 
                                   value={presetName}
                                   onChange={(e) => setPresetName(e.target.value)}
                                   placeholder="PRESET NAME..."
                                   className={cn(
                                     "flex-1 rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-widest focus:outline-none border transition-all",
                                     isDarkMode ? "bg-white/5 border-white/5" : "bg-gray-50 border-gray-100"
                                   )}
                                 />
                                 <button 
                                   onClick={savePreset}
                                   className="px-3 py-2 rounded-xl bg-cyan-500 text-white text-[10px] font-black uppercase tracking-widest shadow-md hover:scale-105 active:scale-95 transition-all"
                                 >
                                   SAVE
                                 </button>
                               </div>
                               <div className="grid grid-cols-2 gap-2">
                                 {userPresets.map(p => (
                                   <div key={p.id} className="relative group">
                                     <button
                                       onClick={() => applyPreset(p)}
                                       className={cn(
                                         "w-full text-left p-2 rounded-xl border text-[9px] font-black uppercase tracking-widest transition-all",
                                         isDarkMode ? "bg-white/5 border-white/5 hover:border-cyan-500/30" : "bg-gray-50 border-gray-100 hover:border-cyan-500/30"
                                       )}
                                     >
                                       {p.name}
                                     </button>
                                     <button 
                                       onClick={() => deletePreset(p.id)}
                                       className="absolute top-1 right-1 p-1 rounded-lg bg-red-500/10 text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                                     >
                                       <X className="w-2.5 h-2.5" />
                                     </button>
                                   </div>
                                 ))}
                                 {userPresets.length === 0 && (
                                   <p className="col-span-2 text-center py-2 text-[9px] text-gray-500 font-bold uppercase italic opacity-50 underline decoration-dotted">No custom matrixes found</p>
                                 )}
                               </div>
                             </div>
                           </div>
                  
                  <div className="flex-1 overflow-y-auto custom-scrollbar xl:max-h-[calc(100vh-160px)] px-4 xl:px-0 pb-32 xl:pb-0">
                    <motion.div 
                      key={mode}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      className={cn(
                        "rounded-[2.5rem] p-6 flex flex-col gap-6 border shadow-[0_30px_60px_-12px_rgba(0,0,0,0.5)] relative overflow-visible backdrop-blur-2xl transition-all duration-500",
                        isDarkMode ? "bg-white/[0.03] border-white/10" : "bg-white/60 border-gray-100 shadow-sm"
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
                        <div className="space-y-4">
                           <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1 flex items-center justify-between">
                            Presets (Automatic Bridge)
                           </label>
                           <div className="grid grid-cols-3 gap-2">
                             {[
                               { id: 'speed', level: 'fast', zip64: false, label: 'Speed' },
                               { id: 'balance', level: 'normal', zip64: true, label: 'Standard' },
                               { id: 'max', level: 'ultra', zip64: true, label: 'Max' }
                             ].map(preset => (
                               <button
                                 key={preset.id}
                                 onClick={() => {
                                   setLevel(preset.level as CompressionLevel);
                                   setZip64(preset.zip64);
                                 }}
                                 className={cn(
                                   "py-2 rounded-xl text-[9px] font-black uppercase tracking-tighter border transition-all",
                                   level === preset.level && zip64 === preset.zip64
                                     ? "bg-cyan-500/20 border-cyan-500/50 text-cyan-400 shadow-[0_0_15px_rgba(34,211,238,0.15)]"
                                     : "bg-white/[0.03] border-white/5 text-gray-500 hover:border-white/10 hover:text-gray-300"
                                 )}
                               >
                                 {preset.label}
                               </button>
                             ))}
                           </div>
                        </div>

                        <div className="space-y-4 pt-1">
                          <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1 flex items-center justify-between">
                            <span className="flex items-center gap-1.5">
                              Compression Level
                              <Tooltip text="Fast: Minimal compression, high speed. Normal: Balanced. Ultra: Maximum space saving but heavier on CPU.">
                                <HelpCircle className="w-3 h-3 text-gray-600 hover:text-cyan-500 cursor-help" />
                              </Tooltip>
                            </span>
                            <span className={cn(
                              "text-[9px] font-black uppercase tracking-tighter",
                              level === 'ultra' ? "text-purple-500" : level === 'normal' ? "text-cyan-500" : "text-emerald-500"
                            )}>
                              {level === 'ultra' ? 'High Entropy' : level === 'normal' ? 'Balanced' : 'High Speed'}
                            </span>
                          </label>
                          <div className="flex gap-2 p-1.5 rounded-2xl bg-white/[0.03] border border-white/5">
                            {(['fast', 'normal', 'ultra'] as const).map(l => (
                              <button
                                key={l}
                                disabled={isProcessing}
                                onClick={() => setLevel(l)}
                                className={cn(
                                  "flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-tighter transition-all duration-500 relative flex flex-col items-center gap-1",
                                  level === l 
                                    ? "bg-gradient-to-br from-cyan-500 to-purple-600 text-white shadow-lg" 
                                    : (isDarkMode ? "text-gray-500 hover:text-gray-300 hover:bg-white/5" : "bg-gray-50 text-gray-500 hover:bg-gray-100")
                                )}
                              >
                                {l}
                                {level === l && (
                                  <motion.div 
                                    layoutId="level-indicator"
                                    className="absolute -bottom-1 w-1 h-1 rounded-full bg-white shadow-[0_0_10px_white]"
                                  />
                                )}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="space-y-2.5">
                          <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1 flex items-center gap-1.5">
                            Advanced Bridge
                            <Tooltip text="ZIP64 allows support for archives larger than 4GB. Disable only for compatibility with legacy (pre-2000) ZIP readers.">
                              <HelpCircle className="w-3 h-3 text-gray-600 hover:text-cyan-500 cursor-help" />
                            </Tooltip>
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
                          <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1 flex items-center gap-1.5">
                            <span>Archive ID</span>
                            <Tooltip text="The filename of the generated archive. VoxZip will preserve folder structures internally.">
                              <HelpCircle className="w-3 h-3 text-gray-600 hover:text-cyan-500 cursor-help" />
                            </Tooltip>
                            {password && (
                              <div className="flex items-center gap-1 text-emerald-500 animate-pulse ml-auto">
                                <ShieldCheck className="w-3 h-3" />
                                <span className="text-[8px] font-black tracking-tighter">SECURED</span>
                              </div>
                            )}
                          </label>
                          <div className="relative group">
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
                                isDarkMode ? "bg-white/[0.03] border-white/5 text-white" : "bg-gray-50 border-gray-100 text-gray-900",
                                password && "pr-10 border-emerald-500/30"
                              )}
                              placeholder="NAME.ZIP"
                            />
                            {password && (
                              <Lock className="absolute right-4 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-emerald-500" />
                            )}
                          </div>
                        </div>

                        <div className="space-y-2.5">
                          <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1 flex items-center justify-between">
                            <span className="flex items-center gap-2">
                              <Lock className="w-3 h-3" /> SECURITY KEY
                              <Tooltip text="Archives are encrypted using AES-256 (standard) or ZipCrypto (legacy). Keep this safe as VoxZip cannot recover lost keys.">
                                <HelpCircle className="w-3 h-3 text-gray-600 hover:text-cyan-500 cursor-help" />
                              </Tooltip>
                            </span>
                            {strength && (
                               <span className={cn("text-[9px] font-black uppercase tracking-tighter", strength.color)}>
                                {strength.label}
                               </span>
                            )}
                          </label>
                          <div className="space-y-3">
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
                            
                            <AnimatePresence>
                              {password && (
                                <motion.div
                                  initial={{ opacity: 0, height: 0 }}
                                  animate={{ opacity: 1, height: 'auto' }}
                                  exit={{ opacity: 0, height: 0 }}
                                  className="space-y-2"
                                >
                                  <input 
                                    type="text"
                                    value={passwordHint}
                                    onChange={(e) => setPasswordHint(e.target.value)}
                                    placeholder="PASSWORD HINT (LOCAL STORAGE ONLY)"
                                    className={cn(
                                      "w-full rounded-xl px-4 py-2.5 text-[10px] font-black uppercase tracking-widest placeholder:text-gray-700 focus:outline-none focus:ring-1 focus:ring-cyan-500/40 transition-all border",
                                      isDarkMode ? "bg-white/[0.03] border-white/5 text-white" : "bg-gray-50 border-gray-100 text-gray-900"
                                    )}
                                  />
                                  <p className="text-[8px] text-gray-500 font-bold px-1">* Hint will be saved in your browser history for this archive.</p>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                          {password && (
                            <div className="flex flex-col gap-2">
                              <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                                <motion.div 
                                  initial={{ width: 0 }}
                                  animate={{ width: strength?.label === 'Strong' ? '100%' : strength?.label === 'Medium' ? '66%' : '33%' }}
                                  className={cn("h-full transition-all duration-500", strength?.bg)}
                                />
                              </div>
                              <div className="flex bg-white/5 rounded-xl p-1 gap-1 border border-white/5 mt-1">
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

                      <div className="flex flex-col gap-3">
                        <button 
                          disabled={files.length === 0 || isProcessing}
                          onClick={mode === 'compress' ? compressFiles : handleExtractToFolder}
                          className={cn(
                            "w-full py-5 rounded-[2rem] font-black text-sm uppercase tracking-[0.2em] flex items-center justify-center gap-3 transition-all duration-700 relative overflow-hidden group/btn shadow-[0_20px_50px_-10px_rgba(6,182,212,0.4)]",
                            files.length === 0 || isProcessing
                              ? (isDarkMode ? "bg-white/5 text-gray-700 border border-white/5 cursor-not-allowed" : "bg-gray-100 text-gray-400 cursor-not-allowed")
                              : "bg-gradient-to-tr from-cyan-500 via-blue-600 to-purple-600 text-white hover:scale-[1.03] active:scale-95 ring-1 ring-white/20 hover:ring-white/40"
                          )}
                        >
                          <div className="absolute inset-0 bg-[radial-gradient(circle_at_var(--x)_var(--y),rgba(255,255,255,0.2),transparent)] opacity-0 group-hover/btn:opacity-100 transition-opacity duration-300" 
                               style={{ "--x": "50%", "--y": "50%" } as any} />
                          {isProcessing ? (
                             <div className="flex items-center gap-3">
                               <Loader2 className="w-5 h-5 animate-spin text-white" />
                               <span className="relative z-10 animate-pulse">Initializing Matrix...</span>
                             </div>
                          ) : (
                            <>
                              <span className="relative z-10">{mode === 'compress' ? 'Assemble Archive' : (
                                // @ts-ignore
                                window.showDirectoryPicker ? 'Extract to Target' : 'Decompile Data'
                              )}</span>
                              <Activity className="w-5 h-5 relative z-10 transition-transform group-hover/btn:rotate-90 duration-500" />
                              <div className="absolute inset-0 bg-white/10 opacity-0 group-hover/btn:opacity-100 transition-opacity" />
                            </>
                          )}
                        </button>

                        {mode === 'extract' && (
                          <button
                            disabled={files.length === 0 || isProcessing}
                            onClick={() => extractFiles()}
                            className={cn(
                              "w-full py-3 rounded-2xl font-black text-[10px] uppercase tracking-[0.3em] flex items-center justify-center gap-2 transition-all border group",
                              isDarkMode ? "bg-white/5 border-white/10 text-gray-400 hover:text-white hover:bg-white/10" : "bg-gray-50 border-gray-100 text-gray-500"
                            )}
                          >
                            <Download className="w-3.5 h-3.5 transition-transform group-hover:-translate-y-0.5" />
                            Direct Sequential Output
                          </button>
                        )}
                      </div>
                  </motion.div>

                  <AnimatePresence>
                    {showProgress && (
                      <div className="fixed bottom-0 left-0 right-0 z-[200] p-6 lg:p-12 pointer-events-none">
                        <motion.div 
                          initial={{ y: 200, opacity: 0, scale: 0.95 }}
                          animate={{ y: 0, opacity: 1, scale: 1 }}
                          exit={{ y: 200, opacity: 0, scale: 0.95 }}
                          className="max-w-4xl mx-auto bg-[#050507]/90 backdrop-blur-3xl border border-white/10 rounded-[3rem] p-8 lg:p-10 shadow-[0_40px_120px_-20px_rgba(0,0,0,0.9)] pointer-events-auto overflow-hidden relative group"
                        >
                          <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-cyan-500 to-transparent opacity-50" />
                          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_-20%,rgba(6,182,212,0.1),transparent)] pointer-events-none" />
                          
                          <div className="flex flex-col md:flex-row items-center justify-between gap-8 mb-10">
                            <div className="flex items-center gap-6">
                              <div className="w-20 h-20 rounded-3xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center relative overflow-hidden group/icon">
                                 <motion.div 
                                   animate={{ rotate: 360 }}
                                   transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
                                   className="absolute inset-0 border-2 border-dashed border-cyan-500/10 rounded-full scale-150"
                                 />
                                 <Loader2 className="w-10 h-10 text-cyan-400 animate-spin" />
                                 <div className="absolute inset-0 bg-scan-line pointer-events-none opacity-20" />
                              </div>
                              <div>
                                <div className="flex items-center gap-3">
                                  <h3 className="text-base font-black uppercase tracking-[0.5em] text-white">Quantum Matrix Assembly</h3>
                                  <div className="flex gap-1">
                                    {[1, 2, 3].map(i => (
                                      <motion.div 
                                        key={i}
                                        animate={{ opacity: [0.3, 1, 0.3] }}
                                        transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.2 }}
                                        className="h-1.5 w-1.5 rounded-full bg-cyan-500"
                                      />
                                    ))}
                                  </div>
                                </div>
                                <div className="flex items-center gap-4 mt-3">
                                  <div className="flex items-center gap-2 text-[10px] font-mono text-gray-500 uppercase tracking-widest bg-white/5 border border-white/5 px-3 py-1.5 rounded-full">
                                    <Zap className="w-3.5 h-3.5 text-amber-500 animate-pulse" />
                                    <span>{elapsed > 0 ? formatBytes(processedBytes / elapsed) : '---'}/s</span>
                                  </div>
                                  <div className="flex items-center gap-2 text-[10px] font-mono text-gray-500 uppercase tracking-widest bg-white/5 border border-white/5 px-3 py-1.5 rounded-full">
                                    <Layers className="w-3.5 h-3.5 text-cyan-500" />
                                    <span>{files.length} Clusters</span>
                                  </div>
                                  <div className="hidden sm:flex items-center gap-2 text-[10px] font-mono text-gray-500 uppercase tracking-widest bg-white/5 border border-white/5 px-3 py-1.5 rounded-full">
                                    <Cpu className="w-3.5 h-3.5 text-purple-500" />
                                    <span>Direct IO</span>
                                  </div>
                                </div>
                              </div>
                            </div>
                            
                            <div className="flex flex-col items-end">
                              <div className="flex items-baseline gap-2">
                                <motion.span 
                                  className="text-6xl font-black font-mono text-white tracking-tighter"
                                  key={Math.round(overallProgress)}
                                  initial={{ y: 5, opacity: 0.5 }}
                                  animate={{ y: 0, opacity: 1 }}
                                >
                                  {Math.round(overallProgress)}
                                </motion.span>
                                <span className="text-xl font-black text-cyan-500 mb-1">%</span>
                              </div>
                              <div className="flex items-center gap-2 mt-2">
                                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                <span className="text-[10px] font-black text-gray-500 uppercase tracking-[0.4em]">Structural Synchronization</span>
                              </div>
                            </div>
                          </div>
                          
                          <div className="space-y-6">
                            <div className="h-3 bg-white/5 rounded-full overflow-hidden relative group/bar">
                              <motion.div 
                                className="h-full bg-gradient-to-r from-cyan-400 via-blue-600 to-purple-600 relative z-10"
                                animate={{ width: `${overallProgress}%` }}
                                transition={{ type: 'spring', damping: 30, stiffness: 70 }}
                              >
                                <div className="absolute top-0 left-0 w-full h-[1px] bg-white/30" />
                              </motion.div>
                              <div className="absolute inset-0 bg-[linear-gradient(45deg,transparent_25%,rgba(255,255,255,0.05)_50%,transparent_75%)] bg-[length:50px_50px] animate-matrix-scroll opacity-30" />
                            </div>
                            
                            <div className="grid grid-cols-3 gap-8 pt-2">
                              <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                  <span className="text-[9px] font-black text-gray-600 uppercase tracking-[0.2em]">Data Buffer</span>
                                  <span className="text-[9px] font-mono text-cyan-500/70">8.4 GB/S</span>
                                </div>
                                <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                                  <motion.div animate={{ width: ['20%', '80%', '40%'] }} transition={{ duration: 4, repeat: Infinity }} className="h-full bg-cyan-500/30" />
                                </div>
                              </div>
                              <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                  <span className="text-[9px] font-black text-gray-600 uppercase tracking-[0.2em]">Entropy Filter</span>
                                  <span className="text-[9px] font-mono text-purple-500/70">Lvl 9 Active</span>
                                </div>
                                <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                                  <motion.div animate={{ width: ['60%', '30%', '90%'] }} transition={{ duration: 3, repeat: Infinity }} className="h-full bg-purple-500/30" />
                                </div>
                              </div>
                              <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                  <span className="text-[9px] font-black text-gray-600 uppercase tracking-[0.2em]">Network Link</span>
                                  <span className="text-[9px] font-mono text-white/50">SECURE</span>
                                </div>
                                <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                                  <motion.div animate={{ width: ['40%', '60%', '50%'] }} transition={{ duration: 2, repeat: Infinity }} className="h-full bg-emerald-500/30" />
                                </div>
                              </div>
                            </div>
                          </div>
                          
                          <div className="mt-8 flex justify-center">
                             <div className="px-6 py-2 rounded-full border border-white/5 bg-white/5 backdrop-blur-md flex items-center gap-3">
                               <RefreshCw className="w-3.5 h-3.5 text-gray-500 animate-spin-reverse" />
                               <span className="text-[9px] font-mono font-black text-gray-500 uppercase tracking-[0.4em]">Calibrating structural arrays...</span>
                             </div>
                          </div>
                        </motion.div>
                      </div>
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
                className="flex items-center gap-2 text-sm font-black text-cyan-500 mb-8 group"
              >
                <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20 group-hover:scale-110 transition-transform">
                  <ArrowLeft className="w-4 h-4" />
                </div>
                <span>Back to Matrix</span>
              </button>
              
              <div className={cn(
                "rounded-[2.5rem] p-10 border shadow-2xl relative overflow-hidden backdrop-blur-3xl",
                isDarkMode ? "bg-[#0c0c0e]/80 border-white/10" : "bg-white/80 border-gray-100"
              )}>
                <div className="absolute top-0 right-0 w-64 h-64 bg-purple-500/10 rounded-full blur-[100px] -z-10" />
                <div className="absolute bottom-0 left-0 w-64 h-64 bg-cyan-500/10 rounded-full blur-[100px] -z-10" />

                <div className="space-y-12">
                  <div className="flex items-center gap-6">
                    <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-cyan-400 to-purple-600 flex items-center justify-center p-0.5 shadow-2xl">
                      <div className="w-full h-full rounded-[1.4rem] bg-[#0c0c0e] flex items-center justify-center">
                        <Zap className="w-10 h-10 text-cyan-400 fill-cyan-400/20" />
                      </div>
                    </div>
                    <div>
                      <h2 className="text-4xl font-black tracking-tighter uppercase leading-none">VoxZip Core</h2>
                      <p className="text-[10px] text-gray-500 font-mono font-bold uppercase tracking-[0.4em] mt-3 ml-1">Universal Archive Utility v{APP_VERSION}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {[
                      { icon: <Shield className="text-cyan-500" />, title: "Zero Trust", desc: "No data ever leaves your hardware." },
                      { icon: <Zap className="text-purple-500" />, title: "WASM Speed", desc: "Native-grade performance in-browser." },
                      { icon: <ShieldCheck className="text-emerald-500" />, title: "AES-256", desc: "Military grade encryption standard." }
                    ].map((item, i) => (
                      <div key={i} className="p-6 rounded-3xl bg-white/[0.03] border border-white/5 space-y-3">
                        <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center">
                          {item.icon}
                        </div>
                        <h4 className="text-sm font-black tracking-widest uppercase">{item.title}</h4>
                        <p className="text-[10px] text-gray-500 font-bold leading-relaxed">{item.desc}</p>
                      </div>
                    ))}
                  </div>

                  <div className="space-y-6 pt-10 border-t border-white/5">
                    <h3 className="text-xs font-black uppercase tracking-[0.2em] text-cyan-500">Legal Protocols</h3>
                    <div className="prose prose-sm prose-invert max-w-none text-gray-500 font-bold text-[11px] leading-relaxed">
                      <p>voxzip is a purely client-side tool. By using this software, you agree to the local processing of your data. We do not store, view, or transmit any files uploaded to this interface. The security of your archives is dependent on the strength of the passwords you provide.</p>
                      <p className="mt-4">Designed for high-performance workflows requiring extreme privacy and speed.</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-4 pt-4">
                    <button className="px-6 py-3 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
                       <Github className="w-4 h-4" /> Source Repository
                    </button>
                    <button className="px-6 py-3 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 hover:bg-cyan-500/20 transition-all text-cyan-400 text-[10px] font-black uppercase tracking-widest">
                       Documentation Hub
                    </button>
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
                  <p className="text-[10px] font-mono font-bold text-cyan-500 uppercase tracking-widest mt-1">Version {APP_VERSION} • Pro Edition</p>
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

              <div className="p-4 border-t border-white/5 space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <button 
                    disabled={history.length === 0}
                    onClick={exportHistoryCSV}
                    className="flex-1 py-3 rounded-2xl border border-white/5 hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed transition-all text-[9px] font-black uppercase tracking-widest text-emerald-500"
                  >
                    Export CSV
                  </button>
                  <button 
                    disabled={history.length === 0}
                    onClick={exportHistoryJSON}
                    className="flex-1 py-3 rounded-2xl border border-white/5 hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed transition-all text-[9px] font-black uppercase tracking-widest text-cyan-500"
                  >
                    Export JSON
                  </button>
                </div>
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
    </div>
  );
}
