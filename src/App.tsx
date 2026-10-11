import React, { useState, useRef, useMemo, useEffect } from 'react';
import {
  FileText,
  Upload,
  BookOpen,
  Layers,
  CheckSquare,
  HelpCircle,
  BookMarked,
  Code,
  Download,
  Copy,
  Check,
  Search,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  FolderArchive,
  Network,
  CreditCard,
  GraduationCap,
  MessageSquare,
  Library,
  GitCompare,
  Sun,
  Moon,
  Send,
  Trash2,
  Github,
  Menu,
  X,
  FolderDown,
  Database,
  BarChart3,
  Compass,
  Clock,
  KeyRound,
  Sparkles,
  CheckCircle2,
  ArrowRight,
  Info,
  Plus,
  Award,
  Target,
  Volume2,
} from 'lucide-react';
import {
  DocumentAnalysis,
  EditorSection,
  StoredDocumentRecord,
  SupportedFormat,
  ChatMessage,
  SemanticSearchResponse,
  DocumentComparisonResult,
  AnalysisHistoryLog,
  FlashcardItem,
} from './types';
import {
  buildWebBundle,
  generateMarkdownExport,
  generateWordDocExport,
  generatePlainTextExport,
  generateFullSiteZipBlob,
  generateRealPdfBlob,
} from './utils/webGenerator';
import {
  idbGetAllDocuments,
  idbSaveDocument,
  idbDeleteDocument,
  idbClearAllDocuments,
  idbGetAllHistory,
  idbAddHistoryLog,
  idbClearAllHistory,
  idbGetAllCourseProgress,
  CourseProgressRecord,
  AudiobookMode,
} from './utils/indexedDb';
import {
  extractTextFromFileInBrowser,
  generateLocalHeuristicAnalysis,
  analyzeWithOptionalGeminiKey,
  answerQuestionInBrowser,
  runLocalSemanticSearch,
  runLocalDocumentComparison,
  generateAdditionalFlashcardsFromAnalysis,
  generateAdditionalQuizzesFromAnalysis,
} from './utils/browserEngine';
import { ConceptMapViewer } from './components/ConceptMapViewer';
import { FlashcardDeck } from './components/FlashcardDeck';
import { CourseViewer } from './components/CourseViewer';
import { GuidedTourOverlay } from './components/GuidedTourOverlay';
import {
  FloatingAudioPlayer,
  AUDIOBOOK_MODES,
  LiveAudioVisualState,
} from './components/FloatingAudioPlayer';

const STORAGE_THEME_KEY = 'jairrestaura_ia_dark_mode';
const STORAGE_API_KEY = 'jairrestaura_gemini_api_key_local';
const STORAGE_ONBOARDING_KEY = 'jairrestaura_onboarding_completed';
const STORAGE_FIRST_UPLOAD_TOUR_KEY = 'jairrestaura_first_upload_tour_done_v1';
const STORAGE_QUIZ_RESULTS_KEY = 'jairrestaura_quiz_results_local';
const STORAGE_PURGED_LEGACY_SEED_KEY = 'jairrestaura_purged_legacy_samples_v2';

const LEGACY_SAMPLE_IDS = new Set([
  'arquitectura-ia-generativa',
  'neurociencia-aprendizaje-activo',
  'ingenieria-software-distribuido',
]);

export default function App() {
  // 1. Dark Mode persisted in LocalStorage (with automatic system theme detection fallback)
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_THEME_KEY);
      if (saved !== null) return saved === 'true';
      return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_THEME_KEY, String(isDarkMode));
    } catch {
      // ignore
    }
  }, [isDarkMode]);

  // Focus Mode (Modo enfoque sin distracciones)
  const [isFocusMode, setIsFocusMode] = useState<boolean>(false);

  // Audio Narration Trigger State for FloatingAudioPlayer
  const [audioTrigger, setAudioTrigger] = useState<{
    id: number;
    label: string;
    text: string;
    mode?: AudiobookMode | 'section';
  } | null>(null);
  const [isHeaderAudioMenuOpen, setIsHeaderAudioMenuOpen] = useState<boolean>(false);
  const [isBannerAudioMenuOpen, setIsBannerAudioMenuOpen] = useState<boolean>(false);
  const [liveAudioVisual, setLiveAudioVisual] = useState<LiveAudioVisualState | null>(null);
  const activeReadingSentenceDomRef = useRef<HTMLSpanElement | null>(null);

  const expandAllDocumentChapters = (docAnalysis: DocumentAnalysis | null) => {
    if (!docAnalysis?.chapters) return;
    const allOpen: Record<number, boolean> = {};
    docAnalysis.chapters.forEach((ch, idx) => {
      allOpen[ch.number || idx + 1] = true;
    });
    setExpandedChapters(allOpen);
  };

  const triggerSpeech = (
    label: string,
    text: string,
    mode: AudiobookMode | 'section' = 'section'
  ) => {
    if (mode === 'full-document' && analysis) {
      setActiveSection('capitulos');
      expandAllDocumentChapters(analysis);
    }
    setAudioTrigger({
      id: Date.now(),
      label,
      text,
      mode,
    });
  };

  useEffect(() => {
    if (
      liveAudioVisual?.isPlaying &&
      activeSection === 'capitulos' &&
      activeReadingSentenceDomRef.current
    ) {
      activeReadingSentenceDomRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }, [
    liveAudioVisual?.activeChunkIndex,
    liveAudioVisual?.isPlaying,
    activeSection,
  ]);

  // 2. Optional User Gemini API Key stored ONLY in LocalStorage
  const [localGeminiKey, setLocalGeminiKey] = useState<string>(() => {
    try {
      return localStorage.getItem(STORAGE_API_KEY) || '';
    } catch {
      return '';
    }
  });
  const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState<boolean>(false);
  const [tempApiKeyInput, setTempApiKeyInput] = useState<string>(localGeminiKey);

  const handleSaveApiKey = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = tempApiKeyInput.trim();
    setLocalGeminiKey(cleaned);
    try {
      if (cleaned) {
        localStorage.setItem(STORAGE_API_KEY, cleaned);
      } else {
        localStorage.removeItem(STORAGE_API_KEY);
      }
    } catch {
      // ignore
    }
    setIsApiKeyModalOpen(false);
  };

  // 3. Step-by-Step Spotlight Guided Tour Overlay (Triggered when user uploads first file or on demand)
  const [isTutorialOpen, setIsTutorialOpen] = useState<boolean>(false);
  const [tutorialStep, setTutorialStep] = useState<number>(0);

  const handleStartGuidedTour = (startAt = 0) => {
    setTutorialStep(startAt);
    setIsTutorialOpen(true);
  };

  const handleCloseTutorial = () => {
    setIsTutorialOpen(false);
    try {
      localStorage.setItem(STORAGE_ONBOARDING_KEY, 'true');
      localStorage.setItem(STORAGE_FIRST_UPLOAD_TOUR_KEY, 'true');
    } catch {
      // ignore
    }
  };

  // 4. Persistent Library, Course Progress & History via IndexedDB (All legacy examples purged)
  const [library, setLibrary] = useState<StoredDocumentRecord[]>([]);
  const [historyLogs, setHistoryLogs] = useState<AnalysisHistoryLog[]>([]);
  const [courseProgressList, setCourseProgressList] = useState<CourseProgressRecord[]>([]);
  const [idbReady, setIdbReady] = useState<boolean>(false);
  const [librarySearchQuery, setLibrarySearchQuery] = useState<string>('');
  const [libraryFormatFilter, setLibraryFormatFilter] = useState<string>('TODOS');
  const [libraryCategoryFilter, setLibraryCategoryFilter] = useState<string>('TODAS');
  const [historyFilterAction, setHistoryFilterAction] = useState<string>('ALL');

  const refreshCourseProgressFromIdb = async () => {
    try {
      const list = await idbGetAllCourseProgress();
      setCourseProgressList(list);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    let mounted = true;
    async function loadFromIndexedDB() {
      try {
        let docs = await idbGetAllDocuments();

        // Automatically purge any previous hardcoded sample documents from IndexedDB
        const hasLegacySample = docs.some((d) => LEGACY_SAMPLE_IDS.has(d.id));
        const alreadyPurged = localStorage.getItem(STORAGE_PURGED_LEGACY_SEED_KEY) === 'true';

        if (hasLegacySample || !alreadyPurged) {
          for (const d of docs) {
            if (LEGACY_SAMPLE_IDS.has(d.id)) {
              await idbDeleteDocument(d.id);
            }
          }
          localStorage.setItem(STORAGE_PURGED_LEGACY_SEED_KEY, 'true');
          docs = await idbGetAllDocuments();
        }

        if (mounted) {
          setLibrary(docs);
          if (docs.length > 0) {
            setActiveDocId(docs[0].id);
          } else {
            setIsUploadPanelOpen(false);
          }
        }

        const logs = await idbGetAllHistory();
        const cleanLogs = logs.filter((l) => !LEGACY_SAMPLE_IDS.has(l.documentId));
        const prog = await idbGetAllCourseProgress();

        if (mounted) {
          setHistoryLogs(cleanLogs);
          setCourseProgressList(prog);
          setIdbReady(true);
        }
      } catch (err) {
        console.error('IndexedDB initialization notice:', err);
        if (mounted) setIdbReady(true);
      }
    }
    loadFromIndexedDB();
    return () => {
      mounted = false;
    };
  }, []);

  const [activeDocId, setActiveDocId] = useState<string>('');
  const activeRecord = useMemo(
    () => library.find((d) => d.id === activeDocId) || library[0] || null,
    [library, activeDocId]
  );
  const analysis: DocumentAnalysis | null = activeRecord ? activeRecord.analysis : null;

  const [activeSection, setActiveSection] = useState<EditorSection>('resumen');
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState<boolean>(false);
  const [isCopilotDrawerOpen, setIsCopilotDrawerOpen] = useState<boolean>(false);

  useEffect(() => {
    refreshCourseProgressFromIdb();
  }, [activeSection, activeDocId]);

  // 5. Global Quick Search in Header
  const [globalSearchQuery, setGlobalSearchQuery] = useState<string>('');

  // 6. Browser-Native Upload & Drag-and-Drop States (PDF, DOCX, TXT, EPUB, PPTX)
  const [isUploadPanelOpen, setIsUploadPanelOpen] = useState<boolean>(false);
  const [isDraggingFile, setIsDraggingFile] = useState<boolean>(false);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [processingProgress, setProcessingProgress] = useState<number>(0);
  const [processingStageLabel, setProcessingStageLabel] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [customInstructions, setCustomInstructions] = useState<string>('');
  const [directTextInput, setDirectTextInput] = useState<string>('');
  const [uploadMode, setUploadMode] = useState<'file' | 'text'>('file');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // 7. Interactive Module States persisted in LocalStorage
  const [expandedChapters, setExpandedChapters] = useState<Record<number, boolean>>({
    1: true,
    2: true,
  });
  const [selectedConceptCategory, setSelectedConceptCategory] = useState<string>('Todos');
  const [completedSteps, setCompletedSteps] = useState<Record<string, boolean>>({});
  const [quizAnswers, setQuizAnswers] = useState<Record<number, number>>({});

  useEffect(() => {
    if (!activeDocId) {
      setQuizAnswers({});
      return;
    }
    try {
      const saved = localStorage.getItem(`${STORAGE_QUIZ_RESULTS_KEY}_${activeDocId}`);
      setQuizAnswers(saved ? JSON.parse(saved) : {});
    } catch {
      setQuizAnswers({});
    }
  }, [activeDocId]);

  const handleSelectQuizAnswer = (qIdx: number, optIdx: number) => {
    if (!activeDocId) return;
    setQuizAnswers((prev) => {
      const updated = { ...prev, [qIdx]: optIdx };
      try {
        localStorage.setItem(`${STORAGE_QUIZ_RESULTS_KEY}_${activeDocId}`, JSON.stringify(updated));
      } catch {
        // ignore
      }
      return updated;
    });
  };

  const [examDrafts, setExamDrafts] = useState<Record<string, string>>({});
  const [revealedModelAnswers, setRevealedModelAnswers] = useState<Record<string, boolean>>({});
  const [glossaryQuery, setGlossaryQuery] = useState<string>('');
  const [selectedGlossaryLetter, setSelectedGlossaryLetter] = useState<string>('Todas');

  // 8. Tutor IA con Memoria Conversacional de 20 Interacciones persistida en LocalStorage
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState<string>('');
  const [isChatLoading, setIsChatLoading] = useState<boolean>(false);

  const getChatStorageKey = (docId?: string) =>
    `jairrestaura_tutor_chat_history_v1_${docId || 'default'}`;

  useEffect(() => {
    if (!analysis || !activeRecord) {
      setChatMessages([]);
      return;
    }

    const storageKey = getChatStorageKey(activeRecord.id);
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setChatMessages(parsed.slice(-20));
          return;
        }
      }
    } catch {
      // ignore
    }

    const initialWelcome: ChatMessage[] = [
      {
        id: `welcome-${activeRecord.id}`,
        role: 'assistant',
        content: `¡Hola! Soy tu profesor y Tutor IA para "${analysis.documentTitle}". He analizado todo el contenido sobre ${
          analysis.detectedMainTopic || analysis.documentTitle
        } y mantengo memoria conversacional de nuestras últimas 20 interacciones para responder preguntas de seguimiento (por ejemplo: "¿Qué es...?" seguido de "¿Cómo se controla?"). ¿Qué te gustaría explorar primero?`,
        followUpSuggestions: [
          `¿Qué es ${analysis.keyConcepts?.[0]?.name || analysis.detectedMainTopic || analysis.documentTitle}?`,
          `¿Cómo se controla o aplica en la práctica?`,
          `¿Cuál es la enseñanza principal de este documento?`,
        ],
        timestamp: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
      },
    ];
    setChatMessages(initialWelcome);
    try {
      localStorage.setItem(storageKey, JSON.stringify(initialWelcome));
    } catch {
      // ignore
    }
  }, [activeRecord?.id, analysis?.documentTitle]);

  const handleClearTutorMemory = () => {
    if (!analysis || !activeRecord) return;
    const storageKey = getChatStorageKey(activeRecord.id);
    const resetWelcome: ChatMessage[] = [
      {
        id: `welcome-${Date.now()}`,
        role: 'assistant',
        content: `¡Hola! He reiniciado la memoria conversacional para "${analysis.documentTitle}". Puedo recordar nuestras últimas 20 interacciones para responder preguntas de seguimiento con contexto completo.`,
        followUpSuggestions: [
          `¿Qué es ${analysis.keyConcepts?.[0]?.name || analysis.detectedMainTopic || analysis.documentTitle}?`,
          `¿Cómo se controla o gestiona según el documento?`,
          `Dame un ejemplo práctico del tema principal`,
        ],
        timestamp: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
      },
    ];
    setChatMessages(resetWelcome);
    try {
      localStorage.setItem(storageKey, JSON.stringify(resetWelcome));
    } catch {
      // ignore
    }
  };

  // 9. Local Semantic Search
  const [semanticQuery, setSemanticQuery] = useState<string>('');
  const [semanticScope, setSemanticScope] = useState<'active' | 'all'>('all');
  const [isSearchingSemantics, setIsSearchingSemantics] = useState<boolean>(false);
  const [semanticResponse, setSemanticResponse] = useState<SemanticSearchResponse | null>(null);

  // 10. Document Comparator
  const [compareDocAId, setCompareDocAId] = useState<string>('');
  const [compareDocBId, setCompareDocBId] = useState<string>('');
  const [isComparing, setIsComparing] = useState<boolean>(false);
  const [comparisonResult, setComparisonResult] = useState<DocumentComparisonResult | null>(null);

  useEffect(() => {
    if (library.length > 0 && !compareDocAId) {
      setCompareDocAId(library[0].id);
    }
    if (library.length > 1 && !compareDocBId) {
      setCompareDocBId(library[1].id);
    } else if (library.length === 1 && !compareDocBId) {
      setCompareDocBId(library[0].id);
    }
  }, [library]);

  // 11. Self-Contained Static Bundle (index.html, style.css, script.js)
  const [webViewTab, setWebViewTab] = useState<'preview' | 'full' | 'html' | 'css' | 'js'>(
    'preview'
  );
  const [webTheme, setWebTheme] = useState<'editorial' | 'light' | 'dark'>('editorial');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [isGithubModalOpen, setIsGithubModalOpen] = useState<boolean>(false);
  const [githubRepoName, setGithubRepoName] = useState<string>('jairrestaura-ia-de-estudio');
  const [githubUsername, setGithubUsername] = useState<string>('usuario');

  // 12. Visual Dashboard Statistics & Academic Grades (Progreso y Calificaciones)
  const platformStats = useMemo(() => {
    const totalDocs = library.length;
    const totalWords = library.reduce(
      (acc, item) => acc + (item.analysis.wordCountEstimate || 0),
      0
    );
    const totalConcepts = library.reduce(
      (acc, item) => acc + (item.analysis.keyConcepts?.length || 0),
      0
    );
    const totalFlashcards = library.reduce(
      (acc, item) => acc + (item.analysis.flashcards?.length || 0),
      0
    );
    const totalQuestions = library.reduce(
      (acc, item) =>
        acc +
        (item.analysis.quizzes?.length || 0) +
        (item.analysis.examQuestions?.length || 0),
      0
    );
    const totalReadingMinutes = library.reduce(
      (acc, item) => acc + (item.analysis.estimatedReadingMinutes || 0),
      0
    );
    return {
      totalDocs,
      totalWords,
      totalConcepts,
      totalFlashcards,
      totalQuestions,
      totalReadingMinutes,
    };
  }, [library]);

  // Per-document Gradebook & Learning Progress Calculation
  const academicGradebook = useMemo(() => {
    return library.map((doc) => {
      // Quiz score from LocalStorage
      let quizCorrect = 0;
      let quizAnswered = 0;
      const totalQuizzes = (doc.analysis.quizzes || []).length;
      try {
        const rawQuiz = localStorage.getItem(`${STORAGE_QUIZ_RESULTS_KEY}_${doc.id}`);
        if (rawQuiz) {
          const parsed = JSON.parse(rawQuiz);
          quizAnswered = Object.keys(parsed).length;
          (doc.analysis.quizzes || []).forEach((q, idx) => {
            if (parsed[idx] === q.correctIndex) quizCorrect += 1;
          });
        }
      } catch {
        // ignore
      }
      const quizScorePct = totalQuizzes > 0 ? Math.round((quizCorrect / totalQuizzes) * 100) : 0;

      // Flashcards mastery from LocalStorage
      let masteredFc = 0;
      const totalFc = (doc.analysis.flashcards || []).length;
      try {
        const rawFc = localStorage.getItem(`jairrestaura_fc_mastery_${doc.id}`);
        if (rawFc) {
          const parsedFc = JSON.parse(rawFc);
          masteredFc = Object.values(parsedFc).filter((v) => v === 'mastered').length;
        }
      } catch {
        // ignore
      }
      const fcProgressPct = totalFc > 0 ? Math.round((masteredFc / totalFc) * 100) : 0;

      // Course units progress from IndexedDB
      const progRec = courseProgressList.find((p) => p.documentId === doc.id);
      const completedUnitsCount = progRec?.completedUnitIds?.length || 0;
      const totalUnitsCount =
        doc.analysis.course?.modules?.reduce((acc, m) => acc + (m.units?.length || 0), 0) ||
        doc.analysis.chapters?.length ||
        1;
      const courseProgressPct = Math.min(
        100,
        Math.round((completedUnitsCount / Math.max(1, totalUnitsCount)) * 100)
      );

      // Weighted Overall Learning Progress & Numeric Grade (0-100 and 0.0-10.0)
      const overallProgressPct = Math.round(
        quizScorePct * 0.4 + fcProgressPct * 0.3 + courseProgressPct * 0.3
      );
      const numericGrade10 = ((quizScorePct * 0.6 + fcProgressPct * 0.2 + courseProgressPct * 0.2) / 10).toFixed(1);

      let letterStatus = 'En Curso';
      if (Number(numericGrade10) >= 9.0) letterStatus = 'Sobresaliente (A+)';
      else if (Number(numericGrade10) >= 8.0) letterStatus = 'Notable (A)';
      else if (Number(numericGrade10) >= 7.0) letterStatus = 'Aprobado (B)';
      else if (quizAnswered > 0 || masteredFc > 0 || completedUnitsCount > 0)
        letterStatus = 'En Progreso';

      return {
        doc,
        quizCorrect,
        quizAnswered,
        totalQuizzes,
        quizScorePct,
        masteredFc,
        totalFc,
        fcProgressPct,
        completedUnitsCount,
        totalUnitsCount,
        courseProgressPct,
        overallProgressPct,
        numericGrade10,
        letterStatus,
      };
    });
  }, [library, courseProgressList, quizAnswers, activeSection]);

  const activeDocGrade = useMemo(
    () => academicGradebook.find((g) => g.doc.id === activeRecord?.id) || null,
    [academicGradebook, activeRecord?.id]
  );

  const webBundle = useMemo(
    () => buildWebBundle(analysis, webTheme),
    [analysis, webTheme]
  );

  const appendHistoryEvent = async (
    doc: StoredDocumentRecord,
    action: AnalysisHistoryLog['action'],
    details: string
  ) => {
    const entry: AnalysisHistoryLog = {
      id: `hist-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      documentId: doc.id,
      documentTitle: doc.analysis.documentTitle,
      fileName: doc.fileName,
      format: doc.format,
      action,
      timestamp: new Date().toISOString(),
      details,
    };
    setHistoryLogs((prev) => [entry, ...prev]);
    try {
      await idbAddHistoryLog(entry);
    } catch {
      // ignore
    }
  };

  const updateActiveDocumentInLibrary = async (
    updatedAnalysis: DocumentAnalysis,
    logDetail: string
  ) => {
    if (!activeRecord) return;
    const updatedRecord: StoredDocumentRecord = {
      ...activeRecord,
      analysis: updatedAnalysis,
    };
    setLibrary((prev) =>
      prev.map((item) => (item.id === updatedRecord.id ? updatedRecord : item))
    );
    try {
      await idbSaveDocument(updatedRecord);
      await appendHistoryEvent(updatedRecord, 'ANALYZED', logDetail);
    } catch {
      // ignore
    }
  };

  const handleAddCustomFlashcard = async (newCard: FlashcardItem) => {
    if (!analysis) return;
    const updatedAnalysis: DocumentAnalysis = {
      ...analysis,
      flashcards: [newCard, ...(analysis.flashcards || [])],
    };
    await updateActiveDocumentInLibrary(
      updatedAnalysis,
      `Nueva flashcard "${newCard.front.slice(0, 40)}..." agregada y guardada en IndexedDB.`
    );
  };

  const handleGenerateMoreFlashcards = async () => {
    if (!analysis) return;
    const generated = generateAdditionalFlashcardsFromAnalysis(
      analysis,
      (analysis.flashcards || []).length
    );
    const updatedAnalysis: DocumentAnalysis = {
      ...analysis,
      flashcards: [...(analysis.flashcards || []), ...generated],
    };
    await updateActiveDocumentInLibrary(
      updatedAnalysis,
      `Generadas ${generated.length} nuevas flashcards propias a partir del documento.`
    );
  };

  const handleGenerateMoreQuizzes = async () => {
    if (!analysis) return;
    const generated = generateAdditionalQuizzesFromAnalysis(
      analysis,
      (analysis.quizzes || []).length
    );
    const updatedAnalysis: DocumentAnalysis = {
      ...analysis,
      quizzes: [...(analysis.quizzes || []), ...generated],
    };
    await updateActiveDocumentInLibrary(
      updatedAnalysis,
      `Generadas ${generated.length} nuevas preguntas de cuestionario a partir del documento.`
    );
  };

  const handleSelectDocumentRecord = (record: StoredDocumentRecord) => {
    setActiveDocId(record.id);
    setCompletedSteps({});
    setExpandedChapters({ 1: true, 2: true });
    setSelectedConceptCategory('Todos');
    setGlossaryQuery('');
    setSelectedGlossaryLetter('Todas');
    setErrorMessage(null);
    setIsUploadPanelOpen(false);
    setIsMobileSidebarOpen(false);
  };

  const handleDeleteRecord = async (id: string) => {
    const updated = library.filter((item) => item.id !== id);
    setLibrary(updated);
    if (activeDocId === id) {
      setActiveDocId(updated[0]?.id || '');
    }
    try {
      await idbDeleteDocument(id);
    } catch {
      // ignore
    }
  };

  const handleClearEntireLibrary = async () => {
    setLibrary([]);
    setActiveDocId('');
    try {
      await idbClearAllDocuments();
    } catch {
      // ignore
    }
  };

  const handleClearHistory = async () => {
    setHistoryLogs([]);
    try {
      await idbClearAllHistory();
    } catch {
      // ignore
    }
  };

  const detectFormat = (fileName: string): SupportedFormat => {
    const lower = fileName.toLowerCase();
    if (lower.endsWith('.pdf')) return 'PDF';
    if (lower.endsWith('.docx')) return 'DOCX';
    if (lower.endsWith('.epub')) return 'EPUB';
    if (lower.endsWith('.pptx')) return 'PPTX';
    return 'TXT';
  };

  /**
   * Core Document Engine:
   * Every uploaded PDF, DOCX, TXT, EPUB, or PPTX automatically:
   * 1. Extracts real text via PDF.js / Mammoth.js
   * 2. Detects Main Topic
   * 3. Generates New Chapters, New Summary, New Key Concepts, New Flashcards, New Quiz, New Glossary
   */
  const processDocumentFileOrText = async (fileToProcess?: File, directText?: string) => {
    setErrorMessage(null);
    const targetFile = fileToProcess || selectedFile;

    if (uploadMode === 'file' && !targetFile && !directText) {
      setErrorMessage(
        'Selecciona o arrastra un archivo PDF, DOCX, TXT, EPUB o PPTX para generar su contenido.'
      );
      return;
    }

    if (uploadMode === 'text' && !directTextInput.trim() && !directText) {
      setErrorMessage('Introduce o pega el texto del documento para procesar.');
      return;
    }

    setIsAnalyzing(true);
    setProcessingProgress(15);
    setProcessingStageLabel('1/4 Extrayendo texto real del documento (PDF.js / Mammoth.js)...');

    try {
      let extractedText = '';
      let uploadedFileName = 'documento_analizado.txt';
      let uploadedFormat: SupportedFormat = 'TXT';

      if (targetFile) {
        uploadedFileName = targetFile.name;
        uploadedFormat = detectFormat(targetFile.name);
        extractedText = await extractTextFromFileInBrowser(targetFile);
      } else {
        extractedText = (directText || directTextInput).trim();
      }

      if (!extractedText || extractedText.trim().length < 10) {
        throw new Error('No se detectó texto suficiente dentro del archivo cargado.');
      }

      setProcessingProgress(45);
      setProcessingStageLabel(
        '2/4 Detectando tema principal y segmentando capítulos propios del documento...'
      );

      let generatedAnalysis: DocumentAnalysis;

      if (localGeminiKey && localGeminiKey.trim().length > 10) {
        setProcessingStageLabel(
          '3/4 Generando capítulos, resumen, conceptos, flashcards, cuestionario y glosario con Gemini API...'
        );
        try {
          generatedAnalysis = await analyzeWithOptionalGeminiKey(
            extractedText,
            uploadedFileName,
            localGeminiKey,
            customInstructions.trim()
          );
          const localFallback = generateLocalHeuristicAnalysis(
            extractedText,
            uploadedFileName,
            customInstructions.trim()
          );
          if (!generatedAnalysis.course) {
            generatedAnalysis.course = localFallback.course;
          }
          if (!generatedAnalysis.detectedMainTopic) {
            generatedAnalysis.detectedMainTopic = localFallback.detectedMainTopic;
          }
        } catch {
          setProcessingStageLabel(
            '3/4 Generando capítulos, resumen, conceptos, flashcards, cuestionario y glosario con el motor documental...'
          );
          generatedAnalysis = generateLocalHeuristicAnalysis(
            extractedText,
            uploadedFileName,
            customInstructions.trim()
          );
        }
      } else {
        setProcessingStageLabel(
          '3/4 Creando resumen nuevo, capítulos, conceptos clave, flashcards, cuestionario y glosario...'
        );
        await new Promise((r) => setTimeout(r, 250));
        generatedAnalysis = generateLocalHeuristicAnalysis(
          extractedText,
          uploadedFileName,
          customInstructions.trim()
        );
      }

      setProcessingProgress(88);
      setProcessingStageLabel('4/4 Guardando documento en biblioteca IndexedDB...');

      const newRecord: StoredDocumentRecord = {
        id: `doc-${Date.now()}`,
        fileName: uploadedFileName,
        format: uploadedFormat,
        category: generatedAnalysis.detectedMainTopic || 'Documento Analizado',
        processedAt: new Date().toISOString(),
        analysis: generatedAnalysis,
      };

      await idbSaveDocument(newRecord);
      await appendHistoryEvent(
        newRecord,
        'ANALYZED',
        `Tema detectado: "${
          generatedAnalysis.detectedMainTopic || generatedAnalysis.documentTitle
        }" · Creados ${generatedAnalysis.chapters?.length || 0} capítulos, ${
          generatedAnalysis.keyConcepts?.length || 0
        } conceptos, ${generatedAnalysis.flashcards?.length || 0} flashcards, ${
          generatedAnalysis.quizzes?.length || 0
        } preguntas y ${generatedAnalysis.glossary?.length || 0} términos de glosario.`
      );

      setProcessingProgress(100);
      const isFirstUploadedDocument = library.length === 0;
      setLibrary((prev) => [newRecord, ...prev]);
      setActiveDocId(newRecord.id);
      setQuizAnswers({});
      setCompletedSteps({});
      setExpandedChapters({ 1: true, 2: true });
      setSelectedConceptCategory('Todos');
      setIsUploadPanelOpen(false);
      setSelectedFile(null);
      setDirectTextInput('');
      setActiveSection('resumen');

      // Automatically trigger the step-by-step spotlight Guided Tour when the user loads their first file
      let alreadyCompletedFirstUploadTour = false;
      try {
        alreadyCompletedFirstUploadTour =
          localStorage.getItem(STORAGE_FIRST_UPLOAD_TOUR_KEY) === 'true';
      } catch {
        // ignore
      }
      if (isFirstUploadedDocument || !alreadyCompletedFirstUploadTour) {
        setTimeout(() => {
          setTutorialStep(0);
          setIsTutorialOpen(true);
        }, 320);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Ocurrió un error al procesar el archivo en el navegador.');
    } finally {
      setIsAnalyzing(false);
      setProcessingProgress(0);
      setProcessingStageLabel('');
    }
  };

  const handleAnalyzeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await processDocumentFileOrText();
  };

  // Tutor IA con Gemini (Profesor Experto Contextual + Memoria de las últimas 20 interacciones en LocalStorage)
  const handleSendChat = async (questionText?: string) => {
    if (!analysis || !activeRecord) return;
    const query = (questionText ?? chatInput).trim();
    if (!query || isChatLoading) return;

    const storageKey = getChatStorageKey(activeRecord.id);

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: query,
      timestamp: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
    };

    const historyPayload = chatMessages
      .slice(-20)
      .map((m) => ({
        role: m.role,
        content: m.content,
      }));

    setChatMessages((prev) => {
      const next = [...prev, userMsg].slice(-20);
      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });

    if (!questionText) setChatInput('');
    setIsChatLoading(true);

    try {
      const response = await answerQuestionInBrowser(query, analysis, historyPayload);

      const assistantMsg: ChatMessage = {
        id: `ai-${Date.now()}`,
        role: 'assistant',
        content: response.answer,
        citedSections: response.citedSections || [],
        followUpSuggestions: response.followUpSuggestions || [],
        timestamp: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
      };

      setChatMessages((prev) => {
        const next = [...prev, assistantMsg].slice(-20);
        try {
          localStorage.setItem(storageKey, JSON.stringify(next));
        } catch {
          // ignore
        }
        return next;
      });
    } catch {
      setChatMessages((prev) => {
        const fallbackMsg: ChatMessage = {
          id: `err-${Date.now()}`,
          role: 'assistant',
          content: `Según el documento, la idea fundamental gira en torno a que ${
            analysis.executiveSummary.thesisStatement.charAt(0).toLowerCase() +
            analysis.executiveSummary.thesisStatement.slice(1)
          }`,
          timestamp: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
        };
        const next = [...prev, fallbackMsg].slice(-20);
        try {
          localStorage.setItem(storageKey, JSON.stringify(next));
        } catch {
          // ignore
        }
        return next;
      });
    } finally {
      setIsChatLoading(false);
    }
  };

  // Local Semantic Search
  const handleSemanticSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!semanticQuery.trim() || library.length === 0) return;

    setIsSearchingSemantics(true);
    const docsPayload =
      semanticScope === 'active' && analysis
        ? [
            {
              documentTitle: analysis.documentTitle,
              executiveSummary: analysis.executiveSummary,
              chapters: analysis.chapters,
              keyConcepts: analysis.keyConcepts,
              glossary: analysis.glossary,
            },
          ]
        : library.map((rec) => ({
            documentTitle: rec.analysis.documentTitle,
            executiveSummary: rec.analysis.executiveSummary,
            chapters: rec.analysis.chapters,
            keyConcepts: rec.analysis.keyConcepts,
            glossary: rec.analysis.glossary,
          }));

    const result = runLocalSemanticSearch(semanticQuery.trim(), docsPayload);
    setSemanticResponse(result);
    setIsSearchingSemantics(false);
  };

  const handleGlobalSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!globalSearchQuery.trim() || library.length === 0) return;
    setSemanticQuery(globalSearchQuery.trim());
    const docsPayload = library.map((rec) => ({
      documentTitle: rec.analysis.documentTitle,
      executiveSummary: rec.analysis.executiveSummary,
      chapters: rec.analysis.chapters,
      keyConcepts: rec.analysis.keyConcepts,
      glossary: rec.analysis.glossary,
    }));
    setSemanticResponse(runLocalSemanticSearch(globalSearchQuery.trim(), docsPayload));
    setActiveSection('busqueda');
  };

  // Document Comparator
  const handleRunComparison = () => {
    const recordA = library.find((d) => d.id === compareDocAId);
    const recordB = library.find((d) => d.id === compareDocBId);
    if (!recordA || !recordB) return;

    setIsComparing(true);
    const res = runLocalDocumentComparison(recordA.analysis, recordB.analysis);
    setComparisonResult(res);
    setIsComparing(false);
  };

  const handleCopyCode = (code: string, key: string) => {
    navigator.clipboard.writeText(code);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleDownloadFile = (content: string | Blob, filename: string, mimeType?: string) => {
    const blob =
      content instanceof Blob ? content : new Blob([content], { type: mimeType || 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleDownloadSelfContainedIndexHtml = async () => {
    if (!webBundle) return;
    handleDownloadFile(
      webBundle.fullStandaloneHtml,
      'index.html',
      'text/html;charset=utf-8'
    );
    if (activeRecord) {
      await appendHistoryEvent(
        activeRecord,
        'EXPORTED',
        'Descargado index.html autocontenido de producción para GitHub Pages.'
      );
    }
  };

  const handleDownloadFullZip = async () => {
    const zipBlob = await generateFullSiteZipBlob(analysis, webTheme);
    const cleanSlug = activeRecord
      ? activeRecord.fileName.replace(/\.[^/.]+$/, '')
      : 'jairrestaura_ia_de_estudio';
    handleDownloadFile(zipBlob, `${cleanSlug}_github_pages.zip`);
    if (activeRecord) {
      await appendHistoryEvent(
        activeRecord,
        'EXPORTED',
        'Descargado paquete estático (index.html, style.css, script.js) para GitHub Pages.'
      );
    }
  };

  const handleExportFormat = async (format: 'pdf' | 'html' | 'markdown' | 'txt' | 'word') => {
    if (!analysis || !activeRecord) return;
    const cleanSlug = activeRecord.fileName.replace(/\.[^/.]+$/, '');
    if (format === 'pdf') {
      generateRealPdfBlob(analysis, cleanSlug);
    } else if (format === 'markdown') {
      const md = generateMarkdownExport(analysis);
      handleDownloadFile(md, `${cleanSlug}.md`, 'text/markdown;charset=utf-8');
    } else if (format === 'txt') {
      const txt = generatePlainTextExport(analysis);
      handleDownloadFile(txt, `${cleanSlug}.txt`, 'text/plain;charset=utf-8');
    } else if (format === 'word') {
      const docHtml = generateWordDocExport(analysis);
      handleDownloadFile(docHtml, `${cleanSlug}.doc`, 'application/msword;charset=utf-8');
    } else if (format === 'html' && webBundle) {
      handleDownloadFile(
        webBundle.fullStandaloneHtml,
        'index.html',
        'text/html;charset=utf-8'
      );
    }
    await appendHistoryEvent(
      activeRecord,
      'EXPORTED',
      `Exportado documento real en formato ${format.toUpperCase()} (${cleanSlug}.${format}).`
    );
  };

  const libraryCategories = useMemo(() => {
    const cats = Array.from(
      new Set(
        library
          .map((item) => (item.analysis.detectedMainTopic || item.category || '').trim())
          .filter(Boolean)
      )
    );
    return ['TODAS', ...cats];
  }, [library]);

  const filteredLibraryRecords = useMemo(() => {
    const q = librarySearchQuery.trim().toLowerCase();
    return library.filter((item) => {
      const matchesFormat =
        libraryFormatFilter === 'TODOS' || item.format === libraryFormatFilter;
      const itemCategory = (item.analysis.detectedMainTopic || item.category || '').trim();
      const matchesCategory =
        libraryCategoryFilter === 'TODAS' || itemCategory === libraryCategoryFilter;
      const matchesQuery =
        !q ||
        item.fileName.toLowerCase().includes(q) ||
        itemCategory.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q) ||
        item.analysis.documentTitle.toLowerCase().includes(q) ||
        item.format.toLowerCase().includes(q);
      return matchesFormat && matchesCategory && matchesQuery;
    });
  }, [library, libraryFormatFilter, libraryCategoryFilter, librarySearchQuery]);

  const filteredHistoryLogs = useMemo(() => {
    if (historyFilterAction === 'ALL') return historyLogs;
    return historyLogs.filter((h) => h.action === historyFilterAction);
  }, [historyLogs, historyFilterAction]);

  const conceptCategories = useMemo(() => {
    const cats = Array.from(new Set((analysis?.keyConcepts || []).map((c) => c.category)));
    return ['Todos', ...cats];
  }, [analysis?.keyConcepts]);

  const filteredConcepts = useMemo(() => {
    if (!analysis) return [];
    if (selectedConceptCategory === 'Todos') return analysis.keyConcepts || [];
    return (analysis.keyConcepts || []).filter((c) => c.category === selectedConceptCategory);
  }, [analysis, selectedConceptCategory]);

  const quizStats = useMemo(() => {
    const total = (analysis?.quizzes || []).length;
    const answeredCount = Object.keys(quizAnswers).length;
    let correctCount = 0;
    (analysis?.quizzes || []).forEach((q, idx) => {
      if (quizAnswers[idx] === q.correctIndex) {
        correctCount += 1;
      }
    });
    const percentage = total > 0 ? Math.round((correctCount / total) * 100) : 0;
    return { total, answeredCount, correctCount, percentage };
  }, [analysis?.quizzes, quizAnswers]);

  const glossaryLetters = useMemo(() => {
    const letters = Array.from(
      new Set(
        (analysis?.glossary || [])
          .map((g) => g.term.trim().charAt(0).toUpperCase())
          .filter(Boolean)
      )
    ).sort();
    return ['Todas', ...letters];
  }, [analysis?.glossary]);

  const filteredGlossary = useMemo(() => {
    return (analysis?.glossary || []).filter((item) => {
      const matchesQuery =
        !glossaryQuery.trim() ||
        item.term.toLowerCase().includes(glossaryQuery.toLowerCase()) ||
        item.definition.toLowerCase().includes(glossaryQuery.toLowerCase()) ||
        item.category.toLowerCase().includes(glossaryQuery.toLowerCase());

      const firstChar = item.term.trim().charAt(0).toUpperCase();
      const matchesLetter =
        selectedGlossaryLetter === 'Todas' || firstChar === selectedGlossaryLetter;

      return matchesQuery && matchesLetter;
    });
  }, [analysis?.glossary, glossaryQuery, selectedGlossaryLetter]);

  const sidebarGroups: {
    groupTitle: string;
    items: { id: EditorSection; label: string; count?: number; icon: React.ReactNode }[];
  }[] = [
    {
      groupTitle: 'Contenido del Documento',
      items: [
        { id: 'resumen', label: '1. Tema y Resumen Nuevo', icon: <FileText className="w-4 h-4" /> },
        {
          id: 'capitulos',
          label: '2. Capítulos Nuevos',
          count: analysis?.chapters?.length || 0,
          icon: <BookOpen className="w-4 h-4" />,
        },
        {
          id: 'conceptos',
          label: '3. Conceptos Clave Nuevos',
          count: analysis?.keyConcepts?.length || 0,
          icon: <Layers className="w-4 h-4" />,
        },
        {
          id: 'glosario',
          label: '4. Glosario Nuevo',
          count: analysis?.glossary?.length || 0,
          icon: <BookMarked className="w-4 h-4" />,
        },
        {
          id: 'mapa',
          label: '5. Mapa Conceptual',
          count: analysis?.conceptMap?.nodes?.length || 0,
          icon: <Network className="w-4 h-4" />,
        },
      ],
    },
    {
      groupTitle: 'Cursos, Práctica & Calificaciones',
      items: [
        {
          id: 'curso',
          label: 'Generador de Cursos',
          count: analysis?.course?.modules?.length || 0,
          icon: <Compass className="w-4 h-4" />,
        },
        {
          id: 'flashcards',
          label: 'Flashcards Nuevas',
          count: analysis?.flashcards?.length || 0,
          icon: <CreditCard className="w-4 h-4" />,
        },
        {
          id: 'cuestionarios',
          label: 'Cuestionario Nuevo',
          count: analysis?.quizzes?.length || 0,
          icon: <HelpCircle className="w-4 h-4" />,
        },
        {
          id: 'calificaciones',
          label: 'Progreso y Calificaciones',
          icon: <Award className="w-4 h-4" />,
        },
        {
          id: 'actividades',
          label: 'Actividades Prácticas',
          count: analysis?.activities?.length || 0,
          icon: <CheckSquare className="w-4 h-4" />,
        },
        {
          id: 'examen',
          label: 'Examen con Rúbrica',
          count: analysis?.examQuestions?.length || 0,
          icon: <GraduationCap className="w-4 h-4" />,
        },
      ],
    },
    {
      groupTitle: 'Tutor IA, Comparador & GitHub',
      items: [
        {
          id: 'chat',
          label: 'Tutor IA (Gemini API)',
          icon: <MessageSquare className="w-4 h-4" />,
        },
        {
          id: 'comparador',
          label: 'Comparador de Documentos',
          icon: <GitCompare className="w-4 h-4" />,
        },
        {
          id: 'biblioteca',
          label: 'Biblioteca IndexedDB',
          count: library.length,
          icon: <Library className="w-4 h-4" />,
        },
        {
          id: 'busqueda',
          label: 'Búsqueda Semántica',
          icon: <Search className="w-4 h-4" />,
        },
        {
          id: 'estadisticas',
          label: 'Historial de Análisis',
          count: historyLogs.length,
          icon: <BarChart3 className="w-4 h-4" />,
        },
        {
          id: 'web',
          label: 'Código index.html',
          icon: <Code className="w-4 h-4" />,
        },
      ],
    },
  ];

  return (
    <div
      className={`min-h-screen flex flex-col transition-colors duration-200 ${
        isDarkMode ? 'bg-slate-950 text-slate-100' : 'bg-[#F8FAFC] text-slate-900'
      }`}
    >
      {/* Top Header Bar (ChatGPT / Notion / Microsoft Learn Premium Aesthetic) */}
      <header
        className={`sticky top-0 z-30 border-b px-4 sm:px-6 py-3 flex items-center justify-between gap-6 backdrop-blur-md print:hidden ${
          isDarkMode
            ? 'bg-slate-900/85 border-slate-800'
            : 'bg-white/85 border-slate-200/90 shadow-2xs'
        }`}
      >
        <div className="flex items-center gap-3 shrink-0">
          <a
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              setActiveSection('resumen');
            }}
            className="flex items-center gap-2.5 group"
          >
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#2563EB] via-[#7C3AED] to-[#06B6D4] flex items-center justify-center text-lg shadow-sm">
              🧠
            </div>
            <div className="leading-tight">
              <div
                className={`text-sm sm:text-base font-extrabold tracking-tight font-display ${
                  isDarkMode ? 'text-white' : 'text-slate-900'
                }`}
              >
                JAIRRESTAURA
              </div>
              <div className="text-[10px] font-mono font-bold tracking-widest text-[#2563EB] dark:text-[#06B6D4]">
                IA DE ESTUDIO
              </div>
            </div>
          </a>
          <span className="hidden xl:inline-block text-xs text-slate-500 dark:text-slate-400 border-l border-slate-300 dark:border-slate-700 pl-3">
            Convierte cualquier documento en conocimiento inteligente
          </span>
        </div>

        {/* Global Search */}
        <div className="hidden md:flex items-center gap-4 flex-1 max-w-xl">
          <form onSubmit={handleGlobalSearchSubmit} className="relative flex-1">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              value={globalSearchQuery}
              onChange={(e) => setGlobalSearchQuery(e.target.value)}
              placeholder="Buscar en tus documentos cargados..."
              aria-label="Búsqueda global"
              className={`w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border transition-colors focus:outline-none focus:border-blue-600 ${
                isDarkMode
                  ? 'bg-slate-950/90 border-slate-800 text-slate-100 placeholder:text-slate-500'
                  : 'bg-slate-100/80 border-slate-200 text-slate-800 placeholder:text-slate-400'
              }`}
            />
          </form>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0">
          {analysis && (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setIsHeaderAudioMenuOpen(false);
                  triggerSpeech(
                    `🎧 Escuchar Documento Completo: ${analysis.documentTitle}`,
                    analysis.fullRawText || analysis.executiveSummary.overview,
                    'full-document'
                  );
                }}
                className="px-3.5 py-2 text-xs font-bold rounded-xl bg-gradient-to-r from-[#2563EB] via-[#7C3AED] to-[#06B6D4] text-white hover:opacity-95 transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap shadow-sm"
                title="Abrir visor inmersivo a pantalla completa, expandir todos los capítulos y leer todo el documento con resaltado en tiempo real"
              >
                <Volume2 className="w-3.5 h-3.5" />
                <span>🎧 Escuchar Documento Completo</span>
              </button>

              <div className="relative">
                <button
                  type="button"
                  onClick={() => setIsHeaderAudioMenuOpen((prev) => !prev)}
                  className={`p-2 text-xs font-bold rounded-xl border transition-all flex items-center justify-center cursor-pointer ${
                    isDarkMode
                      ? 'border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
                  }`}
                  title="Más modos de lectura por voz"
                  aria-label="Más modos de lectura por voz"
                >
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>

                {isHeaderAudioMenuOpen && (
                  <div
                    className={`absolute right-0 mt-2 w-64 rounded-xl border p-1.5 shadow-2xl z-50 space-y-1 ${
                      isDarkMode
                        ? 'bg-slate-900 border-slate-700 text-slate-100'
                        : 'bg-white border-slate-200 text-slate-800'
                    }`}
                  >
                    {AUDIOBOOK_MODES.slice(0, 7).map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          setIsHeaderAudioMenuOpen(false);
                          triggerSpeech(
                            `${item.label}: ${analysis.documentTitle}`,
                            analysis.fullRawText || analysis.executiveSummary.overview,
                            item.id
                          );
                        }}
                        className={`w-full text-left px-3 py-2 rounded-lg text-xs font-semibold transition flex items-center justify-between cursor-pointer ${
                          isDarkMode
                            ? 'hover:bg-slate-800 text-slate-100'
                            : 'hover:bg-slate-100 text-slate-800'
                        }`}
                      >
                        <span>{item.label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {analysis && (
            <button
              type="button"
              onClick={() => setIsFocusMode((prev) => !prev)}
              className={`px-3.5 py-2 text-xs font-semibold rounded-xl border transition-all duration-300 flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                isFocusMode
                  ? 'border-[#2563EB] bg-[#2563EB] text-white shadow-sm'
                  : isDarkMode
                  ? 'border-slate-700 bg-slate-800/80 text-slate-200 hover:bg-slate-700'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100 shadow-2xs'
              }`}
              title="Alternar Modo Enfoque sin distracciones"
            >
              <Target className="w-3.5 h-3.5" />
              <span>{isFocusMode ? 'Salir Enfoque' : 'Modo Enfoque'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setIsDarkMode((prev) => !prev)}
            className={`px-3.5 py-2 text-xs font-semibold rounded-xl border transition-all duration-300 flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              isDarkMode
                ? 'border-amber-500/40 bg-slate-800/90 text-amber-300 hover:bg-slate-700'
                : 'border-slate-200 bg-white text-slate-800 hover:bg-slate-100 shadow-2xs'
            }`}
            aria-label="Alternar entre Modo Claro y Modo Oscuro"
          >
            <span>{isDarkMode ? '☀️ Tema Claro' : '🌙 Tema Oscuro'}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setUploadMode('file');
              if (fileInputRef.current) {
                fileInputRef.current.click();
              } else {
                setIsUploadPanelOpen((prev) => !prev);
              }
            }}
            className="px-4 py-2 text-xs font-semibold text-white bg-gradient-to-r from-[#2563EB] via-[#7C3AED] to-[#06B6D4] rounded-xl hover:opacity-95 transition-all whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-2 shadow-sm"
          >
            <Upload className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Subir Documento</span>
            <span className="sm:hidden">Subir</span>
          </button>
        </div>
      </header>

      {/* Secondary Status & Export Strip (Hidden in Distraction-Free Focus Mode) */}
      {!isFocusMode && (
      <div
        className={`border-b px-4 sm:px-6 py-2.5 print:hidden ${
          isDarkMode ? 'bg-slate-900/60 border-slate-800' : 'bg-white/80 border-slate-200'
        }`}
      >
        <div className="max-w-[1440px] mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3 sm:gap-4">
            <button
              type="button"
              onClick={() => setIsMobileSidebarOpen((prev) => !prev)}
              className={`md:hidden px-2.5 py-1.5 rounded-lg border text-xs font-medium flex items-center gap-1.5 cursor-pointer ${
                isDarkMode
                  ? 'border-slate-700 bg-slate-800 text-slate-200'
                  : 'border-slate-200 bg-white text-slate-700'
              }`}
            >
              {isMobileSidebarOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
              <span>Menú</span>
            </button>

            <div className="flex flex-wrap items-center gap-3 text-xs font-mono tabular-nums">
              <span className="text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                <Database className="w-3.5 h-3.5" />
                <span>IndexedDB + PDF.js + Mammoth.js</span>
              </span>
              <span className="text-slate-300 dark:text-slate-700">·</span>
              <span>
                Docs Cargados: <strong>{platformStats.totalDocs}</strong>
              </span>
              {activeDocGrade && (
                <>
                  <span className="text-slate-300 dark:text-slate-700">·</span>
                  <span className="text-blue-600 dark:text-blue-400 font-semibold">
                    Progreso: {activeDocGrade.overallProgressPct}%
                  </span>
                  <span className="text-slate-300 dark:text-slate-700">·</span>
                  <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                    Calificación: {activeDocGrade.numericGrade10} / 10
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {analysis && (
              <>
                <button
                  type="button"
                  onClick={() => handleStartGuidedTour(0)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 ${
                    isTutorialOpen
                      ? 'bg-blue-700 text-white border-blue-700'
                      : isDarkMode
                      ? 'border-blue-500/40 bg-blue-500/10 text-blue-300 hover:bg-blue-500/20'
                      : 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100'
                  }`}
                  title="Iniciar el tour guiado paso a paso sobre las secciones clave"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Tour Guiado (7 Pasos)</span>
                </button>

                <div
                  data-tour="export-toolbar"
                  className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-xs font-mono ${
                    isDarkMode ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-slate-50'
                  }`}
                >
                  <span className="text-slate-400 pr-1">Exportar:</span>
                  <button
                    type="button"
                    onClick={() => handleExportFormat('pdf')}
                    className="px-2 py-0.5 rounded bg-blue-600 text-white font-semibold hover:bg-blue-700 transition-colors cursor-pointer"
                  >
                    PDF
                  </button>
                  <button
                    type="button"
                    onClick={() => handleExportFormat('html')}
                    className="px-2 py-0.5 rounded hover:bg-blue-600 hover:text-white transition-colors cursor-pointer"
                  >
                    HTML
                  </button>
                  <button
                    type="button"
                    onClick={() => handleExportFormat('markdown')}
                    className="px-2 py-0.5 rounded hover:bg-blue-600 hover:text-white transition-colors cursor-pointer"
                  >
                    Markdown
                  </button>
                  <button
                    type="button"
                    onClick={() => handleExportFormat('txt')}
                    className="px-2 py-0.5 rounded hover:bg-blue-600 hover:text-white transition-colors cursor-pointer"
                  >
                    TXT
                  </button>
                </div>
              </>
            )}

            <button
              type="button"
              onClick={() => setIsGithubModalOpen(true)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 ${
                isDarkMode
                  ? 'border-slate-700 bg-slate-800 text-slate-100 hover:bg-slate-700'
                  : 'border-slate-300 bg-white text-slate-800 hover:bg-slate-50'
              }`}
            >
              <Github className="w-3.5 h-3.5" />
              <span>GitHub Pages</span>
            </button>

            <button
              type="button"
              data-tour="header-tutor-button"
              onClick={() => setIsCopilotDrawerOpen((prev) => !prev)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 ${
                isCopilotDrawerOpen
                  ? 'bg-blue-700 text-white border-blue-700'
                  : isDarkMode
                  ? 'border-slate-700 bg-slate-800 text-slate-200'
                  : 'border-slate-200 bg-white text-slate-700'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>Tutor IA</span>
            </button>

            <button
              type="button"
              onClick={() => setIsDarkMode((prev) => !prev)}
              className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                isDarkMode
                  ? 'border-slate-700 bg-slate-800 text-amber-400 hover:bg-slate-700'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
              }`}
              aria-label="Alternar modo oscuro"
            >
              {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>
      )}

      {/* Expandable Upload Panel */}
      {isUploadPanelOpen && (
        <section
          className={`border-b px-6 py-8 print:hidden ${
            isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
          }`}
        >
          <div className="max-w-5xl mx-auto">
            <div
              className={`flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b ${
                isDarkMode ? 'border-slate-800' : 'border-slate-200'
              }`}
            >
              <div>
                <div className="inline-flex items-center gap-1.5 text-xs font-mono text-blue-600 dark:text-blue-400 mb-1">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>MOTOR DOCUMENTAL DINÁMICO + TOUR GUIADO INTERACTIVO</span>
                </div>
                <h2 className="text-xl font-bold font-display">
                  Cargar Nuevo Documento PDF, DOCX, TXT, EPUB o PPTX
                </h2>
                <p className="text-sm text-slate-500 mt-1">
                  Al cargar tu primer archivo se iniciará automáticamente un <strong>Tour Guiado con Overlay</strong> resaltando el tema principal, capítulos, curso, flashcards, calificaciones y Tutor IA.
                </p>
              </div>
              <div
                className={`flex items-center gap-1 p-1 rounded-lg self-start ${
                  isDarkMode ? 'bg-slate-800' : 'bg-slate-100'
                }`}
              >
                <button
                  type="button"
                  onClick={() => setUploadMode('file')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    uploadMode === 'file'
                      ? isDarkMode
                        ? 'bg-slate-950 text-white'
                        : 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-500'
                  }`}
                >
                  Subir Archivo (PDF / DOCX / TXT / EPUB / PPTX)
                </button>
                <button
                  type="button"
                  onClick={() => setUploadMode('text')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    uploadMode === 'text'
                      ? isDarkMode
                        ? 'bg-slate-950 text-white'
                        : 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-500'
                  }`}
                >
                  Pegar Texto Directo
                </button>
              </div>
            </div>

            <form
              onSubmit={handleAnalyzeSubmit}
              className="mt-6 grid grid-cols-1 lg:grid-cols-12 gap-6"
            >
              <div className="lg:col-span-7">
                {uploadMode === 'file' ? (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsDraggingFile(true);
                    }}
                    onDragLeave={() => setIsDraggingFile(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setIsDraggingFile(false);
                      const droppedFile = e.dataTransfer.files?.[0];
                      if (droppedFile) {
                        setSelectedFile(droppedFile);
                        setErrorMessage(null);
                      }
                    }}
                    className={`border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer ${
                      isDraggingFile
                        ? 'border-blue-600 bg-blue-500/10 scale-[1.01]'
                        : isDarkMode
                        ? 'border-slate-700 hover:border-blue-500 bg-slate-950/40'
                        : 'border-slate-300 hover:border-blue-600 bg-slate-50/70'
                    }`}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf,.docx,.txt,.md,.epub,.pptx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/epub+zip,application/vnd.openxmlformats-officedocument.presentationml.presentation,text/plain"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          setSelectedFile(file);
                          setErrorMessage(null);
                        }
                      }}
                      className="hidden"
                    />
                    <Upload className="w-9 h-9 text-blue-600 mx-auto mb-3" />
                    {selectedFile ? (
                      <div>
                        <p className="text-sm font-semibold">
                          Archivo seleccionado: {selectedFile.name}
                        </p>
                        <p className="text-xs text-slate-500 font-mono tabular-nums mt-1">
                          {(selectedFile.size / 1024).toFixed(1)} KB · Formato{' '}
                          {detectFormat(selectedFile.name)}
                        </p>
                      </div>
                    ) : (
                      <div>
                        <p className="text-sm font-semibold">
                          Arrastra y suelta tu PDF o DOCX aquí o haz clic para seleccionar
                        </p>
                        <p className="text-xs text-slate-500 mt-1">
                          Cada documento genera contenido 100% propio e inicia el Tour Guiado paso a paso
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-semibold mb-2">
                      Texto completo del documento
                    </label>
                    <textarea
                      rows={6}
                      value={directTextInput}
                      onChange={(e) => setDirectTextInput(e.target.value)}
                      placeholder="Pega aquí el texto de tu documento para generar automáticamente su tema principal, capítulos, resumen, conceptos, flashcards, cuestionario y glosario..."
                      className={`w-full rounded-xl border p-3.5 text-sm focus:border-blue-600 focus:outline-none ${
                        isDarkMode
                          ? 'bg-slate-950 border-slate-700 text-slate-100'
                          : 'bg-white border-slate-300 text-slate-900'
                      }`}
                    />
                  </div>
                )}
              </div>

              <div className="lg:col-span-5 flex flex-col justify-between gap-4">
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold mb-1.5">
                      Instrucciones para el Generador de Cursos (Opcional)
                    </label>
                    <input
                      type="text"
                      value={customInstructions}
                      onChange={(e) => setCustomInstructions(e.target.value)}
                      placeholder="Ej. Orientado a examen universitario o casos aplicados..."
                      className={`w-full rounded-lg border px-3.5 py-2 text-sm focus:border-blue-600 focus:outline-none ${
                        isDarkMode
                          ? 'bg-slate-950 border-slate-700 text-slate-100'
                          : 'bg-white border-slate-300 text-slate-900'
                      }`}
                    />
                  </div>

                  <div
                    className={`p-3 rounded-lg border text-xs ${
                      isDarkMode
                        ? 'bg-slate-950/60 border-slate-800 text-slate-400'
                        : 'bg-slate-50 border-slate-200 text-slate-600'
                    }`}
                  >
                    <strong>Pipeline de generación + Tour Guiado:</strong>
                    <ol className="list-decimal list-inside mt-1 space-y-0.5 text-[11px]">
                      <li>Detectar tema principal del documento</li>
                      <li>Crear capítulos, resumen y conceptos clave nuevos</li>
                      <li>Iniciar Tour Guiado con Overlay en 7 secciones</li>
                    </ol>
                  </div>
                </div>

                {isAnalyzing && (
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs font-mono">
                      <span>{processingStageLabel}</span>
                      <span>{processingProgress}%</span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                      <div
                        className="h-full bg-blue-600 transition-all duration-300"
                        style={{ width: `${processingProgress}%` }}
                      />
                    </div>
                  </div>
                )}

                {errorMessage && (
                  <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-600 dark:text-red-400">
                    {errorMessage}
                  </div>
                )}

                <div className="flex items-center justify-end gap-3 pt-2">
                  {library.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setIsUploadPanelOpen(false)}
                      className="px-4 py-2 text-xs font-medium text-slate-500 cursor-pointer"
                    >
                      Cerrar
                    </button>
                  )}
                  <button
                    type="submit"
                    disabled={isAnalyzing}
                    className="px-5 py-2.5 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-60 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  >
                    {isAnalyzing
                      ? 'Generando Contenido Propio...'
                      : 'Analizar Documento e Iniciar Tour'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </section>
      )}

      {/* Hidden Global Instant File Input for One-Click Upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.docx,.txt,.md,.epub,.pptx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/epub+zip,application/vnd.openxmlformats-officedocument.presentationml.presentation,text/plain"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            setSelectedFile(file);
            setErrorMessage(null);
            processDocumentFileOrText(file);
          }
          e.target.value = '';
        }}
        className="hidden"
      />

      {/* Main Workspace */}
      <div className="flex-1 max-w-[1440px] w-full mx-auto flex flex-col md:flex-row">
        {/* Left Sidebar Navigation (Hidden in Distraction-Free Focus Mode or when no doc is loaded) */}
        {!isFocusMode && (analysis || library.length > 0) && (
        <aside
          className={`${
            isMobileSidebarOpen ? 'block' : 'hidden'
          } md:block w-full md:w-64 lg:w-72 shrink-0 border-b md:border-b-0 md:border-r p-5 space-y-6 print:hidden transition-all duration-300 ${
            isDarkMode ? 'bg-slate-900/40 border-slate-800' : 'bg-white/80 border-slate-200/80 backdrop-blur-md'
          }`}
        >
          {/* Active Document Selector with Real-Time Search Filter by Filename or Category */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400 font-semibold">
                Biblioteca ({filteredLibraryRecords.length}/{library.length})
              </span>
              {library.length > 0 && (
                <button
                  type="button"
                  onClick={() => setActiveSection('biblioteca')}
                  className="text-xs text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                >
                  Ver Todo
                </button>
              )}
            </div>

            {library.length > 0 && (
              <div className="relative mb-2.5">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="search"
                  value={librarySearchQuery}
                  onChange={(e) => setLibrarySearchQuery(e.target.value)}
                  placeholder="Filtrar por archivo o categoría..."
                  aria-label="Filtrar documentos en la biblioteca en tiempo real"
                  className={`w-full pl-8 pr-7 py-1.5 text-xs rounded-lg border transition-colors focus:outline-none focus:border-blue-600 ${
                    isDarkMode
                      ? 'bg-slate-950/90 border-slate-800 text-slate-100 placeholder:text-slate-500'
                      : 'bg-slate-50 border-slate-200 text-slate-800 placeholder:text-slate-400'
                  }`}
                />
                {librarySearchQuery && (
                  <button
                    type="button"
                    onClick={() => setLibrarySearchQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                    title="Limpiar filtro"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            )}

            {library.length === 0 ? (
              <div
                className={`p-3 rounded-xl border text-xs ${
                  isDarkMode
                    ? 'bg-slate-950 border-slate-800 text-slate-400'
                    : 'bg-slate-50 border-slate-200 text-slate-500'
                }`}
              >
                Sube un PDF o DOCX para comenzar.
              </div>
            ) : filteredLibraryRecords.length === 0 ? (
              <div
                className={`p-3 rounded-xl border text-xs text-center ${
                  isDarkMode
                    ? 'bg-slate-950/60 border-slate-800 text-slate-400'
                    : 'bg-slate-50 border-slate-200 text-slate-500'
                }`}
              >
                Sin coincidencias para &ldquo;{librarySearchQuery}&rdquo;
              </div>
            ) : (
              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {filteredLibraryRecords.map((item) => {
                  const isSelected = activeRecord?.id === item.id;
                  const categoryLabel = item.analysis.detectedMainTopic || item.category;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleSelectDocumentRecord(item)}
                      className={`w-full text-left px-3 py-2 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-2 ${
                        isSelected
                          ? isDarkMode
                            ? 'bg-slate-800/90 border-blue-500/50 text-white shadow-2xs'
                            : 'bg-blue-50/80 border-blue-200 text-slate-900 shadow-2xs'
                          : isDarkMode
                          ? 'border-transparent hover:bg-slate-900 text-slate-400'
                          : 'border-transparent hover:bg-slate-100/70 text-slate-600'
                      }`}
                    >
                      <div className="truncate">
                        <div className="text-xs font-semibold truncate">
                          {item.fileName}
                        </div>
                        <div className="text-[10px] font-mono text-slate-400 truncate mt-0.5">
                          {item.format} · {categoryLabel}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Grouped Navigation Modules with data-tour hooks for spotlight overlay */}
          <div className="space-y-5">
            {sidebarGroups.map((group, gIdx) => (
              <div
                key={group.groupTitle}
                data-tour={
                  gIdx === 0
                    ? 'sidebar-content-group'
                    : gIdx === 1
                    ? 'sidebar-practice-group'
                    : 'sidebar-tools-group'
                }
              >
                <div className="text-[11px] font-mono uppercase tracking-wider text-slate-400 font-semibold mb-2 px-2">
                  {group.groupTitle}
                </div>
                <nav className="space-y-1">
                  {group.items.map((item) => {
                    const isActive = activeSection === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        data-tour={`nav-item-${item.id}`}
                        onClick={() => {
                          setActiveSection(item.id);
                          setIsMobileSidebarOpen(false);
                        }}
                        className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                          isActive
                            ? 'bg-gradient-to-r from-[#2563EB] to-[#7C3AED] text-white font-semibold shadow-xs'
                            : isDarkMode
                            ? 'text-slate-300 hover:bg-slate-800/70'
                            : 'text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 truncate">
                          {item.icon}
                          <span className="truncate">{item.label}</span>
                        </div>
                        {typeof item.count === 'number' && (
                          <span
                            className={`text-[11px] font-mono tabular-nums px-1.5 py-0.5 rounded-md ${
                              isActive
                                ? 'bg-white/20 text-white'
                                : isDarkMode
                                ? 'bg-slate-800 text-slate-400'
                                : 'bg-slate-100 text-slate-500'
                            }`}
                          >
                            {item.count}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </nav>
              </div>
            ))}
          </div>
        </aside>
        )}

        {/* Center Main Canvas */}
        <main className={`flex-1 min-w-0 p-5 sm:p-8 lg:p-10 transition-all duration-300 ${isFocusMode ? 'max-w-4xl mx-auto' : ''}`}>
          {!analysis || !activeRecord ? (
            /* 1. ZONA DE INICIO INTELIGENTE (ChatGPT / Notion / Arc Browser / Apple Minimalist Dropzone) */
            <div className="max-w-2xl mx-auto my-8 sm:my-14">
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDraggingFile(true);
                }}
                onDragLeave={() => setIsDraggingFile(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDraggingFile(false);
                  const droppedFile = e.dataTransfer.files?.[0];
                  if (droppedFile) {
                    setSelectedFile(droppedFile);
                    setErrorMessage(null);
                    processDocumentFileOrText(droppedFile);
                  }
                }}
                className={`relative rounded-3xl border p-8 sm:p-12 text-center transition-all duration-300 backdrop-blur-xl ${
                  isDraggingFile
                    ? 'border-[#2563EB] bg-blue-500/10 scale-[1.01] shadow-2xl'
                    : isDarkMode
                    ? 'bg-slate-900/75 border-slate-800/90 shadow-2xl shadow-black/40'
                    : 'bg-white/85 border-slate-200/90 shadow-xl shadow-slate-200/60'
                }`}
              >
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#2563EB] via-[#7C3AED] to-[#06B6D4] text-white flex items-center justify-center mx-auto text-3xl shadow-lg mb-5">
                  🧠
                </div>

                <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight font-display">
                  JAIRRESTAURA IA DE ESTUDIO
                </h1>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1.5 max-w-md mx-auto">
                  Convierte cualquier documento en conocimiento inteligente al instante.
                </p>

                {/* Minimalist Action Area: [Subir Documento] + [Arrastrar PDF aquí] */}
                <div className="mt-8 space-y-4">
                  <button
                    type="button"
                    disabled={isAnalyzing}
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full sm:w-auto min-w-[240px] px-8 py-4 text-sm font-semibold text-white bg-gradient-to-r from-[#2563EB] via-[#7C3AED] to-[#06B6D4] rounded-2xl hover:opacity-95 transition-all cursor-pointer inline-flex items-center justify-center gap-2.5 shadow-lg shadow-blue-600/20"
                  >
                    <Upload className="w-4 h-4" />
                    <span>{isAnalyzing ? 'Procesando documento...' : 'Subir Documento'}</span>
                  </button>

                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className={`mt-4 border-2 border-dashed rounded-2xl p-8 transition-all cursor-pointer ${
                      isDraggingFile
                        ? 'border-[#2563EB] bg-blue-500/10'
                        : isDarkMode
                        ? 'border-slate-800 hover:border-blue-500/60 bg-slate-950/50'
                        : 'border-slate-200 hover:border-blue-500/60 bg-slate-50/70'
                    }`}
                  >
                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                      Arrastrar PDF aquí
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                      Soporta PDF, DOCX, TXT, EPUB y PPTX · Procesamiento automático inmediato
                    </p>
                  </div>
                </div>

                {isAnalyzing && (
                  <div className="mt-6 space-y-2 text-left max-w-md mx-auto">
                    <div className="flex justify-between text-xs font-mono">
                      <span className="truncate">{processingStageLabel}</span>
                      <span>{processingProgress}%</span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-[#2563EB] to-[#7C3AED] transition-all duration-300"
                        style={{ width: `${processingProgress}%` }}
                      />
                    </div>
                  </div>
                )}

                {errorMessage && (
                  <div className="mt-5 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-600 dark:text-red-400">
                    {errorMessage}
                  </div>
                )}

                <div className="mt-6 pt-5 border-t border-slate-200/70 dark:border-slate-800/70 flex flex-wrap items-center justify-center gap-4 text-xs text-slate-400">
                  <button
                    type="button"
                    onClick={() => {
                      setUploadMode('text');
                      setIsUploadPanelOpen(true);
                    }}
                    className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer"
                  >
                    Pegar texto directo
                  </button>
                  <span>·</span>
                  <button
                    type="button"
                    onClick={handleDownloadSelfContainedIndexHtml}
                    className="text-emerald-600 dark:text-emerald-400 font-semibold hover:underline transition-colors cursor-pointer inline-flex items-center gap-1"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Descargar index.html Autocontenido (GitHub Pages 1 Archivo)</span>
                  </button>
                  {library.length > 0 && (
                    <>
                      <span>·</span>
                      <button
                        type="button"
                        onClick={() => setActiveSection('biblioteca')}
                        className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer"
                      >
                        Abrir Biblioteca ({library.length})
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* Active Document Header Banner with Detected Main Topic & Learning Progress Bar */}
              <div
                data-tour="doc-header-banner"
                className={`mb-8 pb-6 border-b ${
                  isDarkMode ? 'border-slate-800' : 'border-slate-200'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-4 mb-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
                    <span className="px-2.5 py-1 rounded-md bg-blue-600/10 text-blue-600 dark:text-blue-400 font-semibold flex items-center gap-1.5">
                      <Target className="w-3.5 h-3.5" />
                      <span>
                        TEMA DETECTADO: {analysis.detectedMainTopic || analysis.documentTitle}
                      </span>
                    </span>
                    <span className="text-slate-400">·</span>
                    <span className="text-slate-500">
                      {activeRecord.format} ({activeRecord.fileName})
                    </span>
                    <span className="text-slate-400">·</span>
                    <span className="text-slate-500">
                      {analysis.wordCountEstimate.toLocaleString('es-ES')} palabras
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setIsBannerAudioMenuOpen(false);
                          triggerSpeech(
                            `🎧 Escuchar Documento Completo: ${analysis.documentTitle}`,
                            analysis.fullRawText || analysis.executiveSummary.overview,
                            'full-document'
                          );
                        }}
                        className="px-3.5 py-1.5 text-xs font-bold rounded-lg bg-gradient-to-r from-[#2563EB] via-[#7C3AED] to-[#06B6D4] text-white hover:opacity-95 cursor-pointer flex items-center gap-1.5 shadow-xs"
                      >
                        <BookOpen className="w-3.5 h-3.5" />
                        <span>🎧 Escuchar Documento Completo</span>
                      </button>

                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => setIsBannerAudioMenuOpen((prev) => !prev)}
                          className={`p-1.5 text-xs font-bold rounded-lg border cursor-pointer flex items-center justify-center ${
                            isDarkMode
                              ? 'border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800'
                              : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
                          }`}
                          title="Opciones de lectura por voz"
                        >
                          <ChevronDown className="w-3.5 h-3.5" />
                        </button>

                        {isBannerAudioMenuOpen && (
                          <div
                            className={`absolute right-0 mt-2 w-64 rounded-xl border p-1.5 shadow-2xl z-40 space-y-1 ${
                              isDarkMode
                                ? 'bg-slate-900 border-slate-700 text-slate-100'
                                : 'bg-white border-slate-200 text-slate-800'
                            }`}
                          >
                            {AUDIOBOOK_MODES.slice(0, 7).map((item) => (
                              <button
                                key={item.id}
                                type="button"
                                onClick={() => {
                                  setIsBannerAudioMenuOpen(false);
                                  triggerSpeech(
                                    `${item.label}: ${analysis.documentTitle}`,
                                    analysis.fullRawText || analysis.executiveSummary.overview,
                                    item.id
                                  );
                                }}
                                className={`w-full text-left px-3 py-2 rounded-lg text-xs font-semibold transition flex items-center justify-between cursor-pointer ${
                                  isDarkMode
                                    ? 'hover:bg-slate-800 text-slate-100'
                                    : 'hover:bg-slate-100 text-slate-800'
                                }`}
                              >
                                <span>{item.label}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleStartGuidedTour(0)}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-lg border cursor-pointer flex items-center gap-1.5 ${
                        isDarkMode
                          ? 'border-blue-500/40 bg-blue-500/10 text-blue-300'
                          : 'border-blue-200 bg-blue-50 text-blue-700'
                      }`}
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Recorrer Secciones (Tour)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsUploadPanelOpen(true)}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-lg border cursor-pointer flex items-center gap-1.5 ${
                        isDarkMode
                          ? 'border-slate-700 bg-slate-900 text-slate-200'
                          : 'border-slate-200 bg-white text-slate-700'
                      }`}
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>Cargar Otro PDF/DOCX</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleExportFormat('pdf')}
                      className="px-3 py-1.5 text-xs font-semibold bg-blue-700 hover:bg-blue-800 text-white rounded-lg flex items-center gap-1.5 cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Exportar PDF</span>
                    </button>
                  </div>
                </div>

                <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight font-display leading-tight">
                  {analysis.documentTitle}
                </h1>
                <p
                  className={`mt-2 text-sm sm:text-base max-w-3xl leading-relaxed ${
                    isDarkMode ? 'text-slate-400' : 'text-slate-600'
                  }`}
                >
                  {analysis.subtitle}
                </p>

                {/* Real-time Learning Progress & Grade Strip */}
                {activeDocGrade && (
                  <div
                    className={`mt-5 p-4 rounded-xl border grid grid-cols-1 sm:grid-cols-4 gap-4 items-center ${
                      isDarkMode
                        ? 'bg-slate-900/70 border-slate-800'
                        : 'bg-white border-slate-200/90'
                    }`}
                  >
                    <div className="sm:col-span-2 space-y-1.5">
                      <div className="flex justify-between text-xs font-mono">
                        <span className="text-slate-500">PROGRESO DE APRENDIZAJE DEL DOCUMENTO</span>
                        <span className="font-bold text-blue-600 dark:text-blue-400">
                          {activeDocGrade.overallProgressPct}%
                        </span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                        <div
                          className="h-full bg-blue-600 transition-all duration-300"
                          style={{ width: `${activeDocGrade.overallProgressPct}%` }}
                        />
                      </div>
                    </div>
                    <div className="flex items-center justify-between sm:justify-center gap-2 border-t sm:border-t-0 sm:border-l border-slate-200 dark:border-slate-800 pt-2 sm:pt-0 sm:pl-4">
                      <div className="text-xs">
                        <div className="font-mono text-slate-400">CALIFICACIÓN ACTUAL</div>
                        <div className="text-base font-bold font-mono text-emerald-600 dark:text-emerald-400">
                          {activeDocGrade.numericGrade10} / 10 ({activeDocGrade.letterStatus})
                        </div>
                      </div>
                    </div>
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => setActiveSection('calificaciones')}
                        className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                      >
                        Ver Boletín de Calificaciones →
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* =========================================================
                  LECTURA INTELIGENTE AUTOMÁTICA (RESUMEN, CAPÍTULOS, CONCEPTOS, FLASHCARDS, GLOSARIO, TUTOR IA)
                 ========================================================= */}
              {['resumen', 'capitulos', 'conceptos', 'flashcards', 'glosario', 'chat'].includes(
                activeSection
              ) && (
                <div
                  className={`mb-6 p-3.5 rounded-xl border flex flex-wrap items-center justify-between gap-3 backdrop-blur-md transition-all ${
                    isDarkMode
                      ? 'bg-[#111827]/90 border-[#1E293B] text-slate-200'
                      : 'bg-white/90 border-[#E2E8F0] text-slate-800 shadow-2xs'
                  }`}
                >
                  <div className="flex items-center gap-2.5 text-xs">
                    <span className="px-2 py-0.5 rounded-md bg-gradient-to-r from-[#3B82F6] to-[#8B5CF6] text-white font-mono font-semibold">
                      🎙️ Lectura Inteligente
                    </span>
                    <span className="text-slate-600 dark:text-slate-300 font-medium">
                      Escucha únicamente el contenido visible de esta sección con voz en español.
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (activeSection === 'resumen') {
                        triggerSpeech(
                          'Leyendo sección: Resumen…',
                          `Resumen de ${analysis.documentTitle}. Tesis central: ${
                            analysis.executiveSummary.thesisStatement
                          }. ${analysis.executiveSummary.overview}. Ideas principales: ${(
                            analysis.executiveSummary.keyFindings || []
                          ).join('. ')}`
                        );
                      } else if (activeSection === 'capitulos') {
                        triggerSpeech(
                          'Leyendo sección: Capítulos…',
                          (analysis.chapters || [])
                            .map(
                              (c) =>
                                `Capítulo ${c.number}: ${c.title}. ${c.summary}. ${c.detailedContent}`
                            )
                            .join(' ')
                        );
                      } else if (activeSection === 'conceptos') {
                        triggerSpeech(
                          'Leyendo sección: Conceptos Clave…',
                          filteredConcepts
                            .map(
                              (k) =>
                                `Concepto: ${k.name}. Definición: ${k.definition}. Ejemplo práctico: ${k.practicalExample}`
                            )
                            .join(' ')
                        );
                      } else if (activeSection === 'flashcards') {
                        triggerSpeech(
                          'Leyendo sección: Flashcards…',
                          (analysis.flashcards || [])
                            .map(
                              (f, idx) =>
                                `Tarjeta ${idx + 1}. Pregunta: ${f.front}. Respuesta: ${f.back}`
                            )
                            .join(' ')
                        );
                      } else if (activeSection === 'glosario') {
                        triggerSpeech(
                          'Leyendo sección: Glosario…',
                          filteredGlossary
                            .map((g) => `${g.term}: ${g.definition}`)
                            .join('. ')
                        );
                      } else if (activeSection === 'chat') {
                        const assistantMsgs = chatMessages.filter((m) => m.role === 'assistant');
                        const latest =
                          assistantMsgs[assistantMsgs.length - 1]?.content ||
                          'El Tutor IA está listo para responder tus preguntas.';
                        triggerSpeech('Leyendo respuesta del Tutor IA…', latest);
                      }
                    }}
                    className="px-4 py-2 rounded-lg text-xs font-semibold text-white bg-gradient-to-r from-[#3B82F6] to-[#8B5CF6] hover:opacity-95 transition flex items-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <Volume2 className="w-3.5 h-3.5" />
                    <span>🔊 Escuchar esta sección</span>
                  </button>
                </div>
              )}

              {/* =========================================================
                  SECTION 1: GENERADOR DE CURSOS (MICROSOFT LEARN)
                 ========================================================= */}
              {activeSection === 'curso' && (
                <CourseViewer
                  documentId={activeRecord.id}
                  analysis={analysis}
                  isDark={isDarkMode}
                />
              )}

              {/* =========================================================
                  SECTION 2: TEMA PRINCIPAL Y RESUMEN NUEVO
                 ========================================================= */}
              {activeSection === 'resumen' && (
                <div className="space-y-8 max-w-4xl">
                  <div
                    className={`p-6 rounded-xl border ${
                      isDarkMode
                        ? 'bg-blue-950/30 border-blue-900/60'
                        : 'bg-blue-50/70 border-blue-200'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                      <span className="text-xs font-mono uppercase tracking-wider text-blue-600 dark:text-blue-400 font-semibold">
                        1. Tema Principal Detectado
                      </span>
                      <span className="text-xs font-mono px-2.5 py-0.5 rounded bg-blue-600 text-white">
                        {analysis.detectedMainTopic || analysis.documentTitle}
                      </span>
                    </div>
                    <div className="text-xs font-mono uppercase tracking-wider text-slate-400 mt-4 mb-1">
                      Tesis Central Extraída del Documento
                    </div>
                    <p className="text-base sm:text-lg font-medium leading-relaxed font-display">
                      {analysis.executiveSummary.thesisStatement}
                    </p>
                  </div>

                  <div
                    className={`p-6 rounded-xl border space-y-4 ${
                      isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
                    }`}
                  >
                    <h2 className="text-lg font-bold font-display">
                      Resumen Ejecutivo Generado del Documento
                    </h2>
                    {analysis.executiveSummary.overview
                      .split('\n')
                      .filter((p) => p.trim())
                      .map((paragraph, i) => (
                        <p
                          key={i}
                          className={`text-sm sm:text-base leading-relaxed ${
                            isDarkMode ? 'text-slate-300' : 'text-slate-700'
                          }`}
                        >
                          {paragraph}
                        </p>
                      ))}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div
                      className={`p-6 rounded-xl border ${
                        isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
                      }`}
                    >
                      <h3 className="text-sm font-mono uppercase tracking-wider text-slate-400 font-semibold mb-4">
                        Ideas Principales Extraídas
                      </h3>
                      <ul className="space-y-3">
                        {(analysis.executiveSummary.keyFindings || []).map((finding, idx) => (
                          <li key={idx} className="flex items-start gap-2.5 text-sm leading-relaxed">
                            <span className="font-mono text-xs font-bold text-blue-600 mt-0.5">
                              0{idx + 1}
                            </span>
                            <span>{finding}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div
                      className={`p-6 rounded-xl border ${
                        isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
                      }`}
                    >
                      <h3 className="text-sm font-mono uppercase tracking-wider text-slate-400 font-semibold mb-4">
                        Ruta de Estudio Recomendada
                      </h3>
                      <ul className="space-y-3">
                        {(analysis.executiveSummary.actionableRecommendations || []).map(
                          (rec, idx) => (
                            <li
                              key={idx}
                              className="flex items-start gap-2.5 text-sm leading-relaxed"
                            >
                              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                              <span>{rec}</span>
                            </li>
                          )
                        )}
                      </ul>
                    </div>
                  </div>
                </div>
              )}

              {/* =========================================================
                  SECTION 3: CAPÍTULOS NUEVOS (CON LECTURA VISUAL INTELIGENTE EN TIEMPO REAL)
                 ========================================================= */}
              {activeSection === 'capitulos' && (
                <div className="space-y-5 max-w-4xl">
                  {/* Visual Reading Legend & Expand All Toolbar */}
                  <div
                    className={`p-4 rounded-xl border flex flex-wrap items-center justify-between gap-3 ${
                      isDarkMode
                        ? 'bg-slate-900/90 border-slate-800 text-slate-200'
                        : 'bg-white border-slate-200 text-slate-800 shadow-2xs'
                    }`}
                  >
                    <div className="flex flex-wrap items-center gap-3 text-xs font-mono">
                      <span className="font-bold uppercase tracking-wider text-slate-400">
                        Lectura Visual Inteligente:
                      </span>
                      <span className="px-2 py-0.5 rounded bg-blue-500/15 text-blue-600 dark:text-blue-400 font-bold">
                        🟦 Capítulo actual
                      </span>
                      <span className="px-2 py-0.5 rounded bg-purple-500/15 text-purple-600 dark:text-purple-400 font-bold">
                        🟪 Subtítulo actual
                      </span>
                      <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-bold">
                        🟩 Párrafo actual
                      </span>
                      <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-600 dark:text-amber-400 font-bold">
                        🟨 Oración actual
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => expandAllDocumentChapters(analysis)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition cursor-pointer ${
                          isDarkMode
                            ? 'border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200'
                            : 'border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700'
                        }`}
                      >
                        Expandir todos los capítulos
                      </button>
                    </div>
                  </div>

                  {(analysis.chapters || []).map((chapter) => {
                    const isOpen = !!expandedChapters[chapter.number];
                    const isReadingThisChapter =
                      liveAudioVisual?.status !== 'idle' &&
                      liveAudioVisual?.chapterNumber === chapter.number;
                    const activeSentenceNormalized = (
                      liveAudioVisual?.activeSentenceText || ''
                    )
                      .trim()
                      .toLowerCase();

                    return (
                      <article
                        key={chapter.number}
                        className={`border-2 rounded-2xl overflow-hidden transition-all duration-300 ${
                          isReadingThisChapter
                            ? isDarkMode
                              ? 'bg-blue-950/25 border-blue-500 shadow-xl shadow-blue-950/30'
                              : 'bg-blue-50/40 border-blue-500 shadow-lg shadow-blue-500/10'
                            : isDarkMode
                            ? 'bg-slate-900 border-slate-800'
                            : 'bg-white border-slate-200'
                        }`}
                      >
                        {/* 🟦 Capítulo + 🟪 Subtítulo Header */}
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedChapters((prev) => ({
                              ...prev,
                              [chapter.number]: !prev[chapter.number],
                            }))
                          }
                          className={`w-full p-5 text-left flex items-center justify-between gap-4 cursor-pointer transition-colors ${
                            isReadingThisChapter
                              ? isDarkMode
                                ? 'bg-blue-600/15'
                                : 'bg-blue-100/70'
                              : ''
                          }`}
                        >
                          <div className="space-y-1.5 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-xs font-mono text-blue-600 dark:text-blue-400 font-extrabold">
                                🟦 CAPÍTULO 0{chapter.number}
                              </span>
                              {isReadingThisChapter && (
                                <span className="px-2 py-0.5 rounded-md bg-blue-600 text-white text-[10px] font-mono font-bold">
                                  LEYENDO AHORA
                                </span>
                              )}
                            </div>
                            <h3 className="text-base sm:text-lg font-bold font-display">
                              {chapter.title}
                            </h3>
                            <div
                              className={`p-2.5 rounded-lg border text-xs sm:text-sm transition-colors ${
                                isReadingThisChapter
                                  ? isDarkMode
                                    ? 'bg-purple-950/50 border-purple-500/50 text-purple-200 font-semibold'
                                    : 'bg-purple-100/80 border-purple-300 text-purple-950 font-semibold'
                                  : isDarkMode
                                  ? 'bg-slate-950/50 border-slate-800 text-slate-400'
                                  : 'bg-slate-50 border-slate-200/80 text-slate-600'
                              }`}
                            >
                              <span className="font-mono text-[10px] uppercase tracking-wider font-bold text-purple-600 dark:text-purple-400 block mb-0.5">
                                🟪 Subtítulo / Síntesis del Capítulo
                              </span>
                              {chapter.summary}
                            </div>
                          </div>
                          {isOpen ? (
                            <ChevronUp className="w-5 h-5 text-slate-400 shrink-0" />
                          ) : (
                            <ChevronDown className="w-5 h-5 text-slate-400 shrink-0" />
                          )}
                        </button>

                        {isOpen && (
                          <div
                            className={`px-5 pb-6 pt-4 border-t space-y-4 ${
                              isDarkMode ? 'border-slate-800' : 'border-slate-100'
                            }`}
                          >
                            <div className="space-y-3 text-sm sm:text-base leading-relaxed">
                              {chapter.detailedContent
                                .split('\n')
                                .filter((p) => p.trim())
                                .map((para, i) => {
                                  const sentences = para
                                    .split(/(?<=[.!?])\s+/)
                                    .filter((s) => s.trim());
                                  const isActiveParagraph =
                                    isReadingThisChapter &&
                                    activeSentenceNormalized.length > 8 &&
                                    para
                                      .toLowerCase()
                                      .includes(
                                        activeSentenceNormalized.slice(
                                          0,
                                          Math.min(35, activeSentenceNormalized.length)
                                        )
                                      );

                                  return (
                                    <div
                                      key={i}
                                      className={`p-4 rounded-xl border transition-all duration-300 ${
                                        isActiveParagraph
                                          ? isDarkMode
                                            ? 'bg-emerald-950/45 border-emerald-500/80 text-slate-100 shadow-md ring-1 ring-emerald-500/30'
                                            : 'bg-emerald-50/90 border-emerald-400 text-slate-900 shadow-sm ring-1 ring-emerald-400/30'
                                          : isDarkMode
                                          ? 'bg-slate-950/35 border-slate-800/70 text-slate-300'
                                          : 'bg-slate-50/60 border-slate-200/70 text-slate-700'
                                      }`}
                                    >
                                      {isActiveParagraph && (
                                        <div className="text-[10px] font-mono font-bold uppercase text-emerald-600 dark:text-emerald-400 mb-1.5">
                                          🟩 Párrafo actual en lectura
                                        </div>
                                      )}
                                      <p className="space-x-1 leading-relaxed">
                                        {sentences.map((sent, sIdx) => {
                                          const normSent = sent.trim().toLowerCase();
                                          const isCurrentSentence =
                                            isActiveParagraph &&
                                            activeSentenceNormalized.length > 5 &&
                                            (normSent.includes(
                                              activeSentenceNormalized.slice(
                                                0,
                                                Math.min(28, activeSentenceNormalized.length)
                                              )
                                            ) ||
                                              activeSentenceNormalized.includes(
                                                normSent.slice(
                                                  0,
                                                  Math.min(28, normSent.length)
                                                )
                                              ));

                                          return (
                                            <span
                                              key={sIdx}
                                              ref={
                                                isCurrentSentence
                                                  ? activeReadingSentenceDomRef
                                                  : null
                                              }
                                              className={`inline rounded px-1 py-0.5 transition-all ${
                                                isCurrentSentence
                                                  ? isDarkMode
                                                    ? 'bg-amber-400/25 border border-amber-400 text-amber-100 font-semibold'
                                                    : 'bg-amber-200/90 border border-amber-400 text-slate-950 font-semibold'
                                                  : ''
                                              }`}
                                            >
                                              {isCurrentSentence && (
                                                <span className="font-mono text-[10px] font-bold px-1 py-0.5 mr-1 rounded bg-amber-500 text-slate-950">
                                                  🟨
                                                </span>
                                              )}
                                              {sent}
                                            </span>
                                          );
                                        })}
                                      </p>
                                    </div>
                                  );
                                })}
                            </div>
                            <div
                              className={`p-4 rounded-lg border ${
                                isDarkMode
                                  ? 'bg-slate-950 border-slate-800'
                                  : 'bg-slate-50 border-slate-200/80'
                              }`}
                            >
                              <div className="text-xs font-mono uppercase text-slate-400 mb-2">
                                Puntos Clave del Capítulo
                              </div>
                              <ul className="space-y-1.5 text-xs sm:text-sm">
                                {(chapter.keyTakeaways || []).map((takeaway, idx) => (
                                  <li key={idx} className="flex items-start gap-2">
                                    <span className="text-blue-600 font-bold">•</span>
                                    <span>{takeaway}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              )}

              {/* =========================================================
                  SECTION 4: CONCEPTOS CLAVE NUEVOS
                 ========================================================= */}
              {activeSection === 'conceptos' && (
                <div className="space-y-6">
                  <div className="flex flex-wrap items-center gap-2">
                    {conceptCategories.map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setSelectedConceptCategory(cat)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                          selectedConceptCategory === cat
                            ? 'bg-blue-700 text-white'
                            : isDarkMode
                            ? 'bg-slate-900 border border-slate-800 text-slate-300'
                            : 'bg-white border border-slate-200 text-slate-700'
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    {filteredConcepts.map((concept, idx) => (
                      <article
                        key={idx}
                        className={`p-6 rounded-xl border flex flex-col justify-between gap-4 ${
                          isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
                        }`}
                      >
                        <div>
                          <div className="flex items-center justify-between gap-2 text-xs font-mono text-blue-600 dark:text-blue-400 mb-2">
                            <span>{concept.category}</span>
                            <span>{concept.importanceLevel}</span>
                          </div>
                          <h3 className="text-lg font-bold font-display mb-2">{concept.name}</h3>
                          <p
                            className={`text-sm leading-relaxed ${
                              isDarkMode ? 'text-slate-300' : 'text-slate-700'
                            }`}
                          >
                            {concept.definition}
                          </p>
                        </div>
                        <div
                          className={`p-3.5 rounded-lg border text-xs leading-relaxed ${
                            isDarkMode
                              ? 'bg-slate-950 border-slate-800 text-slate-400'
                              : 'bg-slate-50 border-slate-200/80 text-slate-600'
                          }`}
                        >
                          <strong className="text-slate-700 dark:text-slate-200">
                            Contexto en el Documento:
                          </strong>{' '}
                          {concept.practicalExample}
                        </div>
                      </article>
                    ))}
                  </div>
                </div>
              )}

              {/* =========================================================
                  SECTION 5: MAPA CONCEPTUAL INTERACTIVO
                 ========================================================= */}
              {activeSection === 'mapa' && (
                <ConceptMapViewer data={analysis.conceptMap} isDark={isDarkMode} />
              )}

              {/* =========================================================
                  SECTION 6: FLASHCARDS NUEVAS
                 ========================================================= */}
              {activeSection === 'flashcards' && (
                <FlashcardDeck
                  documentId={activeRecord.id}
                  cards={analysis.flashcards || []}
                  isDark={isDarkMode}
                  onAddFlashcard={handleAddCustomFlashcard}
                  onGenerateMoreFlashcards={handleGenerateMoreFlashcards}
                />
              )}

              {/* =========================================================
                  SECTION 7: CUESTIONARIO NUEVO
                 ========================================================= */}
              {activeSection === 'cuestionarios' && (
                <div className="space-y-6 max-w-4xl">
                  <div
                    className={`p-5 rounded-xl border flex flex-wrap items-center justify-between gap-4 ${
                      isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
                    }`}
                  >
                    <div>
                      <div className="text-xs font-mono text-blue-600 dark:text-blue-400">
                        CUESTIONARIO GENERADO DE &ldquo;{analysis.documentTitle.toUpperCase()}&rdquo;
                      </div>
                      <h2 className="text-lg font-bold font-display">
                        Calificación del Cuestionario: {quizStats.correctCount} / {quizStats.total} (
                        {quizStats.percentage}%)
                      </h2>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={handleGenerateMoreQuizzes}
                        className="px-3.5 py-1.5 text-xs font-semibold bg-blue-700 hover:bg-blue-800 text-white rounded-lg flex items-center gap-1.5 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Generar Más Preguntas del Documento</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setQuizAnswers({});
                          try {
                            localStorage.removeItem(`${STORAGE_QUIZ_RESULTS_KEY}_${activeDocId}`);
                          } catch {
                            // ignore
                          }
                        }}
                        className="px-3 py-1.5 text-xs font-medium border rounded-lg flex items-center gap-1.5 cursor-pointer"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Reiniciar</span>
                      </button>
                    </div>
                  </div>

                  {(analysis.quizzes || []).map((q, qIdx) => {
                    const selectedOpt = quizAnswers[qIdx];
                    const isAnswered = selectedOpt !== undefined;
                    return (
                      <div
                        key={`${q.id}-${qIdx}`}
                        className={`p-6 rounded-xl border space-y-4 ${
                          isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
                        }`}
                      >
                        <div className="flex items-center justify-between text-xs font-mono text-slate-400">
                          <span>PREGUNTA 0{qIdx + 1}</span>
                          <span>{q.difficulty}</span>
                        </div>
                        <h3 className="text-base font-bold font-display">{q.question}</h3>
                        <div className="space-y-2">
                          {(q.options || []).map((opt, oIdx) => {
                            const isSelected = selectedOpt === oIdx;
                            const isCorrect = q.correctIndex === oIdx;
                            let btnStyle = isDarkMode
                              ? 'border-slate-800 bg-slate-950 hover:border-slate-700'
                              : 'border-slate-200 bg-slate-50/70 hover:border-slate-300';

                            if (isAnswered) {
                              if (isCorrect) {
                                btnStyle =
                                  'border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-medium';
                              } else if (isSelected) {
                                btnStyle =
                                  'border-red-500 bg-red-500/10 text-red-700 dark:text-red-300';
                              }
                            }

                            return (
                              <button
                                key={oIdx}
                                type="button"
                                onClick={() => handleSelectQuizAnswer(qIdx, oIdx)}
                                className={`w-full text-left p-3.5 rounded-lg border text-sm transition-colors cursor-pointer flex items-start gap-3 ${btnStyle}`}
                              >
                                <span className="font-mono text-xs font-bold mt-0.5">
                                  {String.fromCharCode(65 + oIdx)}.
                                </span>
                                <span>{opt}</span>
                              </button>
                            );
                          })}
                        </div>
                        {isAnswered && (
                          <div
                            className={`p-4 rounded-lg text-xs leading-relaxed ${
                              isDarkMode
                                ? 'bg-slate-950 text-slate-300 border border-slate-800'
                                : 'bg-blue-50/70 text-slate-700 border border-blue-200'
                            }`}
                          >
                            <strong>Evidencia del documento:</strong> {q.explanation}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* =========================================================
                  SECTION 8: PROGRESO DE APRENDIZAJE Y CALIFICACIONES
                 ========================================================= */}
              {activeSection === 'calificaciones' && (
                <div className="space-y-6 max-w-5xl">
                  <div
                    className={`p-6 rounded-xl border flex flex-wrap items-center justify-between gap-4 ${
                      isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
                    }`}
                  >
                    <div>
                      <div className="text-xs font-mono text-blue-600 dark:text-blue-400">
                        SISTEMA DE EVALUACIÓN Y PROGRESO ACADÉMICO (INDEXEDDB + LOCALSTORAGE)
                      </div>
                      <h2 className="text-xl font-bold font-display mt-0.5">
                        Progreso de Aprendizaje y Boletín de Calificaciones
                      </h2>
                    </div>
                  </div>

                  {activeDocGrade && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      <div
                        className={`p-5 rounded-xl border ${
                          isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
                        }`}
                      >
                        <div className="text-xs font-mono text-slate-400">CALIFICACIÓN GLOBAL</div>
                        <div className="text-3xl font-bold font-mono text-emerald-600 mt-1">
                          {activeDocGrade.numericGrade10} / 10
                        </div>
                        <div className="text-xs text-slate-500 mt-1">
                          {activeDocGrade.letterStatus}
                        </div>
                      </div>
                      <div
                        className={`p-5 rounded-xl border ${
                          isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
                        }`}
                      >
                        <div className="text-xs font-mono text-slate-400">PROGRESO TOTAL</div>
                        <div className="text-3xl font-bold font-mono text-blue-600 mt-1">
                          {activeDocGrade.overallProgressPct}%
                        </div>
                        <div className="text-xs text-slate-500 mt-1">
                          Ponderado (Curso + Quiz + Flashcards)
                        </div>
                      </div>
                      <div
                        className={`p-5 rounded-xl border ${
                          isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
                        }`}
                      >
                        <div className="text-xs font-mono text-slate-400">ACIERTOS CUESTIONARIO</div>
                        <div className="text-3xl font-bold font-mono mt-1">
                          {activeDocGrade.quizCorrect} / {activeDocGrade.totalQuizzes}
                        </div>
                        <div className="text-xs text-slate-500 mt-1">
                          {activeDocGrade.quizScorePct}% de precisión
                        </div>
                      </div>
                      <div
                        className={`p-5 rounded-xl border ${
                          isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
                        }`}
                      >
                        <div className="text-xs font-mono text-slate-400">FLASHCARDS DOMINADAS</div>
                        <div className="text-3xl font-bold font-mono text-amber-600 mt-1">
                          {activeDocGrade.masteredFc} / {activeDocGrade.totalFc}
                        </div>
                        <div className="text-xs text-slate-500 mt-1">
                          {activeDocGrade.fcProgressPct}% dominado
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Full Gradebook Table across all uploaded documents */}
                  <div
                    className={`border rounded-xl overflow-hidden ${
                      isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
                    }`}
                  >
                    <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
                      <h3 className="text-sm font-bold font-display">
                        Registro de Calificaciones por Documento Cargado
                      </h3>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs sm:text-sm">
                        <thead
                          className={`border-b font-mono text-xs ${
                            isDarkMode
                              ? 'bg-slate-950 border-slate-800'
                              : 'bg-slate-50 border-slate-200'
                          }`}
                        >
                          <tr>
                            <th className="p-4">Documento</th>
                            <th className="p-4">Tema Detectado</th>
                            <th className="p-4">Unidades Curso</th>
                            <th className="p-4">Flashcards</th>
                            <th className="p-4">Cuestionario</th>
                            <th className="p-4">Progreso</th>
                            <th className="p-4">Calificación</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                          {academicGradebook.map((item) => (
                            <tr key={item.doc.id}>
                              <td className="p-4 font-semibold">{item.doc.analysis.documentTitle}</td>
                              <td className="p-4 text-xs text-slate-500">
                                {item.doc.analysis.detectedMainTopic || item.doc.category}
                              </td>
                              <td className="p-4 font-mono">
                                {item.completedUnitsCount}/{item.totalUnitsCount} (
                                {item.courseProgressPct}%)
                              </td>
                              <td className="p-4 font-mono">
                                {item.masteredFc}/{item.totalFc} ({item.fcProgressPct}%)
                              </td>
                              <td className="p-4 font-mono">
                                {item.quizCorrect}/{item.totalQuizzes} ({item.quizScorePct}%)
                              </td>
                              <td className="p-4 font-mono font-bold text-blue-600">
                                {item.overallProgressPct}%
                              </td>
                              <td className="p-4 font-mono font-bold text-emerald-600">
                                {item.numericGrade10} / 10 ({item.letterStatus})
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* =========================================================
                  SECTION 9: ACTIVIDADES PRÁCTICAS
                 ========================================================= */}
              {activeSection === 'actividades' && (
                <div className="space-y-6 max-w-4xl">
                  {(analysis.activities || []).map((act) => (
                    <div
                      key={act.id}
                      className={`p-6 rounded-xl border space-y-4 ${
                        isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono text-blue-600 dark:text-blue-400">
                        <span>
                          {act.type} · {act.difficulty}
                        </span>
                        <span>Duración: {act.duration}</span>
                      </div>
                      <h3 className="text-lg font-bold font-display">{act.title}</h3>
                      <p className="text-sm text-slate-500">{act.objective}</p>

                      <div className="space-y-2 pt-2">
                        <div className="text-xs font-mono uppercase text-slate-400">
                          Pasos Interactivos
                        </div>
                        {(act.steps || []).map((step, sIdx) => {
                          const stepKey = `${act.id}-step-${sIdx}`;
                          const done = !!completedSteps[stepKey];
                          return (
                            <label
                              key={stepKey}
                              className={`flex items-start gap-3 p-3 rounded-lg border text-sm cursor-pointer ${
                                done
                                  ? 'border-emerald-500/40 bg-emerald-500/10 line-through opacity-80'
                                  : isDarkMode
                                  ? 'border-slate-800 bg-slate-950'
                                  : 'border-slate-200 bg-slate-50/50'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={done}
                                onChange={() =>
                                  setCompletedSteps((prev) => ({
                                    ...prev,
                                    [stepKey]: !prev[stepKey],
                                  }))
                                }
                                className="mt-1"
                              />
                              <span>{step}</span>
                            </label>
                          );
                        })}
                      </div>

                      <div
                        className={`p-3.5 rounded-lg border text-xs ${
                          isDarkMode
                            ? 'bg-slate-950 border-slate-800'
                            : 'bg-slate-50 border-slate-200'
                        }`}
                      >
                        <strong>Entregable esperado:</strong> {act.expectedDeliverable}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* =========================================================
                  SECTION 10: EXAMEN CON RÚBRICA
                 ========================================================= */}
              {activeSection === 'examen' && (
                <div className="space-y-6 max-w-4xl">
                  {(analysis.examQuestions || []).map((ex, idx) => (
                    <div
                      key={ex.id || idx}
                      className={`p-6 rounded-xl border space-y-4 ${
                        isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs font-mono text-blue-600 dark:text-blue-400">
                        <span>
                          REACTIVO DE EXAMEN 0{idx + 1} · {ex.type}
                        </span>
                        <span>{ex.points} PUNTOS</span>
                      </div>
                      <h3 className="text-base font-bold font-display">{ex.question}</h3>
                      <textarea
                        rows={4}
                        value={examDrafts[ex.id] || ''}
                        onChange={(e) =>
                          setExamDrafts((prev) => ({ ...prev, [ex.id]: e.target.value }))
                        }
                        placeholder="Redacta tu respuesta de desarrollo aquí..."
                        className={`w-full rounded-lg border p-3 text-sm ${
                          isDarkMode
                            ? 'bg-slate-950 border-slate-800 text-slate-100'
                            : 'bg-slate-50 border-slate-200 text-slate-900'
                        }`}
                      />
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-mono text-slate-400">
                          Rúbrica: {(ex.evaluationRubric || []).join(' · ')}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setRevealedModelAnswers((prev) => ({
                              ...prev,
                              [ex.id]: !prev[ex.id],
                            }))
                          }
                          className="text-xs font-semibold text-blue-600 hover:underline cursor-pointer"
                        >
                          {revealedModelAnswers[ex.id]
                            ? 'Ocultar Respuesta Modelo'
                            : 'Ver Respuesta Modelo'}
                        </button>
                      </div>
                      {revealedModelAnswers[ex.id] && (
                        <div
                          className={`p-4 rounded-lg border text-xs leading-relaxed ${
                            isDarkMode
                              ? 'bg-slate-950 border-slate-800 text-slate-300'
                              : 'bg-emerald-50/70 border-emerald-200 text-slate-800'
                          }`}
                        >
                          <strong>Respuesta Modelo del Documento:</strong> {ex.modelAnswer}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* =========================================================
                  SECTION 11: GLOSARIO NUEVO
                 ========================================================= */}
              {activeSection === 'glosario' && (
                <div className="space-y-6">
                  <div className="flex flex-col sm:flex-row gap-3">
                    <input
                      type="search"
                      value={glossaryQuery}
                      onChange={(e) => setGlossaryQuery(e.target.value)}
                      placeholder="Buscar término o definición en el glosario generado..."
                      className={`flex-1 rounded-lg border px-4 py-2 text-sm ${
                        isDarkMode
                          ? 'bg-slate-900 border-slate-800 text-slate-100'
                          : 'bg-white border-slate-200 text-slate-900'
                      }`}
                    />
                    <div className="flex flex-wrap gap-1">
                      {glossaryLetters.map((letter) => (
                        <button
                          key={letter}
                          type="button"
                          onClick={() => setSelectedGlossaryLetter(letter)}
                          className={`px-2.5 py-1.5 text-xs font-mono rounded border cursor-pointer ${
                            selectedGlossaryLetter === letter
                              ? 'bg-blue-700 text-white border-blue-700'
                              : isDarkMode
                              ? 'bg-slate-900 border-slate-800 text-slate-400'
                              : 'bg-white border-slate-200 text-slate-600'
                          }`}
                        >
                          {letter}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {filteredGlossary.map((g, idx) => (
                      <div
                        key={idx}
                        className={`p-5 rounded-xl border ${
                          isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
                        }`}
                      >
                        <div className="text-xs font-mono text-blue-600 dark:text-blue-400 mb-1">
                          {g.category}
                        </div>
                        <h3 className="text-base font-bold font-display mb-1.5">{g.term}</h3>
                        <p className="text-sm text-slate-600 dark:text-slate-300 mb-2">
                          {g.definition}
                        </p>
                        <p className="text-xs italic text-slate-400">
                          &ldquo;{g.contextUsage}&rdquo;
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* =========================================================
                  SECTION 12: TUTOR IA CON GEMINI API
                 ========================================================= */}
              {activeSection === 'chat' && (
                <div
                  className={`border rounded-xl overflow-hidden flex flex-col h-[620px] max-w-4xl ${
                    isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
                  }`}
                >
                  <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-xs font-mono text-blue-600 dark:text-blue-400">
                        TUTOR IA EXPERTO CON GEMINI · MEMORIA DE LAS ÚLTIMAS 20 INTERACCIONES
                      </div>
                      <h2 className="text-base font-bold font-display">{analysis.documentTitle}</h2>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono px-2.5 py-1 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                        Memoria activa ({Math.min(20, Math.max(0, chatMessages.length - 1))}/20 turnos)
                      </span>
                      {chatMessages.length > 1 && (
                        <button
                          type="button"
                          onClick={handleClearTutorConversationMemory}
                          className="text-xs px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 hover:border-rose-500 hover:text-rose-500 transition cursor-pointer"
                          title="Reiniciar memoria conversacional de este documento"
                        >
                          Limpiar memoria
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="flex-1 p-5 overflow-y-auto space-y-4">
                    {chatMessages.map((msg) => (
                      <div
                        key={msg.id}
                        className={`flex flex-col ${
                          msg.role === 'user' ? 'items-end' : 'items-start'
                        }`}
                      >
                        <div
                          className={`max-w-2xl rounded-xl p-4 text-sm leading-relaxed ${
                            msg.role === 'user'
                              ? 'bg-blue-700 text-white'
                              : isDarkMode
                              ? 'bg-slate-950 border border-slate-800 text-slate-200'
                              : 'bg-slate-50 border border-slate-200 text-slate-800'
                          }`}
                        >
                          <p className="whitespace-pre-line">{msg.content}</p>
                          {msg.citedSections && msg.citedSections.length > 0 && (
                            <div className="mt-3 pt-2 border-t border-slate-200 dark:border-slate-800 flex flex-wrap gap-1.5">
                              {msg.citedSections.map((sec, i) => (
                                <span
                                  key={i}
                                  className="text-[11px] font-mono px-2 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400"
                                >
                                  Fuente: {sec}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        {msg.followUpSuggestions && msg.followUpSuggestions.length > 0 && (
                          <div className="flex flex-wrap gap-2 mt-2">
                            {msg.followUpSuggestions.map((sug, i) => (
                              <button
                                key={i}
                                type="button"
                                onClick={() => handleSendChat(sug)}
                                className="text-xs px-3 py-1 rounded-full border border-slate-300 dark:border-slate-700 hover:border-blue-600 cursor-pointer"
                              >
                                {sug}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleSendChat();
                    }}
                    className="p-4 border-t border-slate-200 dark:border-slate-800 flex gap-2"
                  >
                    <input
                      type="text"
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      placeholder="Pregúntale al Tutor IA sobre cualquier capítulo, concepto o pide una evaluación..."
                      className={`flex-1 rounded-lg border px-4 py-2.5 text-sm ${
                        isDarkMode
                          ? 'bg-slate-950 border-slate-800 text-slate-100'
                          : 'bg-white border-slate-300 text-slate-900'
                      }`}
                    />
                    <button
                      type="submit"
                      disabled={isChatLoading}
                      className="px-5 py-2.5 bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold rounded-lg cursor-pointer flex items-center gap-1.5"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>Preguntar</span>
                    </button>
                  </form>
                </div>
              )}

              {/* =========================================================
                  SECTION 13: BÚSQUEDA SEMÁNTICA
                 ========================================================= */}
              {activeSection === 'busqueda' && (
                <div className="space-y-6 max-w-4xl">
                  <form
                    onSubmit={handleSemanticSearch}
                    className={`p-6 rounded-xl border space-y-4 ${
                      isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <h2 className="text-lg font-bold font-display">
                        Búsqueda Semántica en Documentos Cargados
                      </h2>
                      <div className="flex gap-2 text-xs">
                        <button
                          type="button"
                          onClick={() => setSemanticScope('all')}
                          className={`px-3 py-1 rounded border cursor-pointer ${
                            semanticScope === 'all'
                              ? 'bg-blue-700 text-white border-blue-700'
                              : 'border-slate-300 dark:border-slate-700'
                          }`}
                        >
                          Toda la Biblioteca ({library.length})
                        </button>
                        <button
                          type="button"
                          onClick={() => setSemanticScope('active')}
                          className={`px-3 py-1 rounded border cursor-pointer ${
                            semanticScope === 'active'
                              ? 'bg-blue-700 text-white border-blue-700'
                              : 'border-slate-300 dark:border-slate-700'
                          }`}
                        >
                          Documento Activo
                        </button>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="search"
                        value={semanticQuery}
                        onChange={(e) => setSemanticQuery(e.target.value)}
                        placeholder="Buscar conceptos, ideas o términos..."
                        className={`flex-1 rounded-lg border px-4 py-2.5 text-sm ${
                          isDarkMode
                            ? 'bg-slate-950 border-slate-800 text-slate-100'
                            : 'bg-white border-slate-300 text-slate-900'
                        }`}
                      />
                      <button
                        type="submit"
                        disabled={isSearchingSemantics}
                        className="px-5 py-2.5 bg-blue-700 text-white text-xs font-semibold rounded-lg cursor-pointer"
                      >
                        Buscar
                      </button>
                    </div>
                  </form>

                  {semanticResponse && (
                    <div className="space-y-4">
                      <div
                        className={`p-5 rounded-xl border ${
                          isDarkMode
                            ? 'bg-blue-950/30 border-blue-900/50'
                            : 'bg-blue-50/70 border-blue-200'
                        }`}
                      >
                        <div className="text-xs font-mono text-blue-600 dark:text-blue-400 mb-1">
                          SÍNTESIS SEMÁNTICA
                        </div>
                        <p className="text-sm leading-relaxed">
                          {semanticResponse.synthesizedAnswer}
                        </p>
                      </div>

                      <div className="space-y-3">
                        {semanticResponse.results.map((res, idx) => (
                          <div
                            key={idx}
                            className={`p-5 rounded-xl border ${
                              isDarkMode
                                ? 'bg-slate-900 border-slate-800'
                                : 'bg-white border-slate-200'
                            }`}
                          >
                            <div className="flex items-center justify-between text-xs font-mono text-blue-600 dark:text-blue-400 mb-1">
                              <span>
                                {res.documentTitle} · {res.sectionType}
                              </span>
                              <span>Afinidad: {res.relevancePercentage}%</span>
                            </div>
                            <h3 className="text-base font-bold font-display mb-1">{res.title}</h3>
                            <p className="text-sm text-slate-600 dark:text-slate-300 mb-2">
                              {res.excerpt}
                            </p>
                            <p className="text-xs text-slate-400">{res.semanticRelevanceReason}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* =========================================================
                  SECTION 14: COMPARADOR DE DOCUMENTOS
                 ========================================================= */}
              {activeSection === 'comparador' && (
                <div className="space-y-6 max-w-5xl">
                  <div
                    className={`p-6 rounded-xl border space-y-4 ${
                      isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
                    }`}
                  >
                    <h2 className="text-lg font-bold font-display">
                      Comparador entre Dos Documentos Cargados
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-mono mb-1">Documento A</label>
                        <select
                          value={compareDocAId}
                          onChange={(e) => setCompareDocAId(e.target.value)}
                          className={`w-full rounded-lg border px-3 py-2 text-sm ${
                            isDarkMode
                              ? 'bg-slate-950 border-slate-800'
                              : 'bg-white border-slate-300'
                          }`}
                        >
                          {library.map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.analysis.documentTitle} ({d.format})
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-mono mb-1">Documento B</label>
                        <select
                          value={compareDocBId}
                          onChange={(e) => setCompareDocBId(e.target.value)}
                          className={`w-full rounded-lg border px-3 py-2 text-sm ${
                            isDarkMode
                              ? 'bg-slate-950 border-slate-800'
                              : 'bg-white border-slate-300'
                          }`}
                        >
                          {library.map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.analysis.documentTitle} ({d.format})
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleRunComparison}
                      disabled={isComparing}
                      className="px-5 py-2.5 bg-blue-700 text-white text-xs font-semibold rounded-lg cursor-pointer"
                    >
                      Comparar Documentos Ahora
                    </button>
                  </div>

                  {comparisonResult && (
                    <div className="space-y-6">
                      <div
                        className={`p-6 rounded-xl border space-y-3 ${
                          isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
                        }`}
                      >
                        <h3 className="text-base font-bold font-display">Síntesis Comparativa</h3>
                        <p className="text-sm leading-relaxed">
                          {comparisonResult.executiveSynthesis}
                        </p>
                        <p className="text-xs text-blue-600 dark:text-blue-400">
                          {comparisonResult.complementaryStrengths}
                        </p>
                      </div>

                      <div
                        className={`border rounded-xl overflow-hidden ${
                          isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
                        }`}
                      >
                        <table className="w-full text-left text-xs sm:text-sm">
                          <thead
                            className={`border-b font-mono text-xs ${
                              isDarkMode
                                ? 'bg-slate-950 border-slate-800'
                                : 'bg-slate-50 border-slate-200'
                            }`}
                          >
                            <tr>
                              <th className="p-4">Dimensión</th>
                              <th className="p-4">Documento A</th>
                              <th className="p-4">Documento B</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                            {comparisonResult.keyDifferences.map((diff, i) => (
                              <tr key={i}>
                                <td className="p-4 font-semibold">{diff.dimension}</td>
                                <td className="p-4">{diff.docAPerspective}</td>
                                <td className="p-4">{diff.docBPerspective}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* =========================================================
                  SECTION 15: BIBLIOTECA PERSISTENTE DE DOCUMENTOS (INDEXEDDB)
                 ========================================================= */}
              {activeSection === 'biblioteca' && (
                <div className="space-y-6">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <h2 className="text-xl font-bold font-display">
                        Biblioteca de Documentos Propios (IndexedDB)
                      </h2>
                      <p className="text-sm text-slate-500">
                        Cada documento en esta biblioteca fue generado a partir de tus propios archivos.
                      </p>
                    </div>
                    <div className="flex gap-2">
                      {library.length > 0 && (
                        <button
                          type="button"
                          onClick={handleClearEntireLibrary}
                          className="px-3 py-2 text-xs font-mono text-red-600 border border-red-500/30 rounded-lg hover:bg-red-500/10 cursor-pointer"
                        >
                          Vaciar Biblioteca
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setIsUploadPanelOpen(true)}
                        className="px-4 py-2 bg-blue-700 text-white text-xs font-semibold rounded-lg cursor-pointer"
                      >
                        + Cargar Nuevo PDF / DOCX
                      </button>
                    </div>
                  </div>

                  {/* Real-Time Search Filter by Filename or Category */}
                  <div
                    className={`p-4 rounded-2xl border space-y-3 ${
                      isDarkMode ? 'bg-slate-900/70 border-slate-800' : 'bg-white border-slate-200 shadow-2xs'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row gap-3">
                      <div className="relative flex-1">
                        <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                          type="search"
                          value={librarySearchQuery}
                          onChange={(e) => setLibrarySearchQuery(e.target.value)}
                          placeholder="Buscar en tiempo real por nombre de archivo, categoría o título..."
                          className={`w-full rounded-xl border pl-10 pr-9 py-2.5 text-sm transition-colors focus:outline-none focus:border-blue-600 ${
                            isDarkMode
                              ? 'bg-slate-950 border-slate-800 text-slate-100 placeholder:text-slate-500'
                              : 'bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-400'
                          }`}
                        />
                        {librarySearchQuery && (
                          <button
                            type="button"
                            onClick={() => setLibrarySearchQuery('')}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                            title="Limpiar búsqueda"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {['TODOS', 'PDF', 'DOCX', 'TXT', 'EPUB', 'PPTX'].map((fmt) => (
                          <button
                            key={fmt}
                            type="button"
                            onClick={() => setLibraryFormatFilter(fmt)}
                            className={`px-3 py-2 text-xs font-mono rounded-xl border transition-colors cursor-pointer ${
                              libraryFormatFilter === fmt
                                ? 'bg-blue-700 text-white border-blue-700'
                                : isDarkMode
                                ? 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                                : 'bg-slate-50 border-slate-200 text-slate-600 hover:text-slate-900'
                            }`}
                          >
                            {fmt}
                          </button>
                        ))}
                      </div>
                    </div>

                    {libraryCategories.length > 1 && (
                      <div className="flex flex-wrap items-center gap-1.5 pt-1">
                        <span className="text-[11px] font-mono text-slate-400 mr-1">
                          Categorías:
                        </span>
                        {libraryCategories.map((cat) => (
                          <button
                            key={cat}
                            type="button"
                            onClick={() => setLibraryCategoryFilter(cat)}
                            className={`px-2.5 py-1 text-xs rounded-lg border transition-colors cursor-pointer ${
                              libraryCategoryFilter === cat
                                ? 'bg-gradient-to-r from-[#2563EB] to-[#7C3AED] text-white border-transparent font-medium'
                                : isDarkMode
                                ? 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                                : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-slate-300'
                            }`}
                          >
                            {cat === 'TODAS' ? 'Todas las categorías' : cat}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {filteredLibraryRecords.length === 0 ? (
                    <div
                      className={`p-10 rounded-2xl border text-center space-y-2 ${
                        isDarkMode ? 'bg-slate-900/50 border-slate-800' : 'bg-white border-slate-200'
                      }`}
                    >
                      <p className="text-sm font-semibold">
                        No se encontraron documentos para los filtros aplicados
                      </p>
                      <p className="text-xs text-slate-500">
                        Prueba con otro nombre de archivo o categoría, o limpia el filtro de búsqueda.
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setLibrarySearchQuery('');
                          setLibraryFormatFilter('TODOS');
                          setLibraryCategoryFilter('TODAS');
                        }}
                        className="mt-2 px-4 py-2 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                      >
                        Restablecer filtros
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                      {filteredLibraryRecords.map((rec) => (
                        <div
                          key={rec.id}
                          className={`p-5 rounded-2xl border flex flex-col justify-between gap-4 transition-all ${
                            rec.id === activeRecord.id
                              ? 'border-blue-600 ring-1 ring-blue-600/30'
                              : isDarkMode
                              ? 'bg-slate-900 border-slate-800 hover:border-slate-700'
                              : 'bg-white border-slate-200 hover:border-slate-300 shadow-2xs'
                          }`}
                        >
                          <div>
                            <div className="flex items-center justify-between text-xs font-mono text-blue-600 dark:text-blue-400 mb-2">
                              <span className="truncate max-w-[200px]" title={rec.fileName}>
                                {rec.format} · {rec.fileName}
                              </span>
                              <span>{rec.analysis.estimatedReadingMinutes} min</span>
                            </div>
                            <h3 className="text-base font-bold font-display mb-1">
                              {rec.analysis.documentTitle}
                            </h3>
                            <p className="text-xs text-slate-500 mb-2">
                              Categoría: {rec.analysis.detectedMainTopic || rec.category}
                            </p>
                            <div className="flex flex-wrap gap-2 text-[11px] font-mono text-slate-400">
                              <span>{rec.analysis.chapters?.length || 0} cap.</span>
                              <span>·</span>
                              <span>{rec.analysis.flashcards?.length || 0} flashcards</span>
                              <span>·</span>
                              <span>{rec.analysis.quizzes?.length || 0} preguntas</span>
                            </div>
                          </div>
                          <div className="flex items-center justify-between pt-3 border-t border-slate-200 dark:border-slate-800">
                            <button
                              type="button"
                              onClick={() => {
                                handleSelectDocumentRecord(rec);
                                setActiveSection('resumen');
                              }}
                              className="text-xs font-semibold text-blue-600 hover:underline cursor-pointer"
                            >
                              Abrir Documento
                            </button>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() =>
                                  generateRealPdfBlob(
                                    rec.analysis,
                                    rec.fileName.replace(/\.[^/.]+$/, '')
                                  )
                                }
                                className="text-xs font-mono text-slate-500 hover:text-blue-600 cursor-pointer"
                                title="Exportar PDF"
                              >
                                PDF
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteRecord(rec.id)}
                                className="text-slate-400 hover:text-red-600 cursor-pointer"
                                title="Eliminar de IndexedDB"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* =========================================================
                  SECTION 16: HISTORIAL DE ANÁLISIS Y ESTADÍSTICAS
                 ========================================================= */}
              {activeSection === 'estadisticas' && (
                <div className="space-y-8">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div
                      className={`border rounded-xl p-5 ${
                        isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
                      }`}
                    >
                      <div className="text-xs font-mono text-slate-500">Documentos en IndexedDB</div>
                      <div className="text-2xl font-bold font-mono tabular-nums mt-1">
                        {platformStats.totalDocs}
                      </div>
                    </div>
                    <div
                      className={`border rounded-xl p-5 ${
                        isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
                      }`}
                    >
                      <div className="text-xs font-mono text-slate-500">Conceptos Extraídos</div>
                      <div className="text-2xl font-bold font-mono tabular-nums mt-1 text-blue-600">
                        {platformStats.totalConcepts}
                      </div>
                    </div>
                    <div
                      className={`border rounded-xl p-5 ${
                        isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
                      }`}
                    >
                      <div className="text-xs font-mono text-slate-500">Preguntas y Flashcards</div>
                      <div className="text-2xl font-bold font-mono tabular-nums mt-1 text-emerald-600">
                        {platformStats.totalQuestions + platformStats.totalFlashcards}
                      </div>
                    </div>
                    <div
                      className={`border rounded-xl p-5 ${
                        isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
                      }`}
                    >
                      <div className="text-xs font-mono text-slate-500">Lectura Acumulada</div>
                      <div className="text-2xl font-bold font-mono tabular-nums mt-1 text-amber-600">
                        {platformStats.totalReadingMinutes} min
                      </div>
                    </div>
                  </div>

                  <div
                    className={`border rounded-xl overflow-hidden ${
                      isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
                    }`}
                  >
                    <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
                      <h3 className="text-sm font-bold font-display flex items-center gap-2">
                        <Clock className="w-4 h-4 text-blue-600" />
                        <span>Historial de Análisis en IndexedDB</span>
                      </h3>
                      <div className="flex flex-wrap items-center gap-2">
                        {['ALL', 'ANALYZED', 'EXPORTED'].map((act) => (
                          <button
                            key={act}
                            type="button"
                            onClick={() => setHistoryFilterAction(act)}
                            className={`px-2.5 py-1 text-[11px] font-mono rounded border cursor-pointer ${
                              historyFilterAction === act
                                ? 'bg-blue-700 text-white border-blue-700'
                                : 'border-slate-300 dark:border-slate-700'
                            }`}
                          >
                            {act}
                          </button>
                        ))}
                        {historyLogs.length > 0 && (
                          <button
                            type="button"
                            onClick={handleClearHistory}
                            className="px-2.5 py-1 text-[11px] font-mono text-red-600 border border-red-500/30 rounded hover:bg-red-500/10 cursor-pointer"
                          >
                            Limpiar Historial
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="divide-y divide-slate-200 dark:divide-slate-800">
                      {filteredHistoryLogs.length === 0 ? (
                        <div className="p-6 text-center text-xs text-slate-500">
                          No hay registros en el historial todavía.
                        </div>
                      ) : (
                        filteredHistoryLogs.map((log) => (
                          <div
                            key={log.id}
                            className="px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                          >
                            <div>
                              <div className="font-semibold flex items-center gap-2">
                                <span>{log.documentTitle}</span>
                                <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400">
                                  {log.action} · {log.format}
                                </span>
                              </div>
                              <div className="text-slate-500 mt-0.5">{log.details}</div>
                            </div>
                            <div className="font-mono text-slate-400 tabular-nums shrink-0">
                              {new Date(log.timestamp).toLocaleString('es-ES')}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* =========================================================
                  SECTION 17: CÓDIGO INDEX.HTML PARA GITHUB PAGES
                 ========================================================= */}
              {activeSection === 'web' && webBundle && (
                <div className="space-y-6">
                  <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
                    <div>
                      <h2 className="text-xl font-bold font-display">
                        Código Autocontenido para GitHub Pages (index.html)
                      </h2>
                      <p className="text-sm text-slate-500 mt-0.5">
                        Generado con el contenido propio de &ldquo;{analysis.documentTitle}&rdquo;.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleDownloadSelfContainedIndexHtml}
                        className="px-4 py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg flex items-center gap-1.5 cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Descargar index.html</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleDownloadFullZip}
                        className="px-4 py-2 text-xs font-semibold bg-blue-700 hover:bg-blue-800 text-white rounded-lg flex items-center gap-1.5 cursor-pointer"
                      >
                        <FolderArchive className="w-3.5 h-3.5" />
                        <span>Descargar ZIP</span>
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 p-1 rounded-lg bg-slate-100 dark:bg-slate-900 overflow-x-auto">
                    <button
                      type="button"
                      onClick={() => setWebViewTab('preview')}
                      className={`px-3 py-1.5 text-xs font-medium rounded cursor-pointer ${
                        webViewTab === 'preview'
                          ? 'bg-white dark:bg-slate-800 shadow-xs'
                          : 'text-slate-500'
                      }`}
                    >
                      Vista Previa Interactiva
                    </button>
                    <button
                      type="button"
                      onClick={() => setWebViewTab('full')}
                      className={`px-3 py-1.5 text-xs font-mono font-medium rounded cursor-pointer ${
                        webViewTab === 'full'
                          ? 'bg-white dark:bg-slate-800 shadow-xs'
                          : 'text-slate-500'
                      }`}
                    >
                      index.html (Autocontenido)
                    </button>
                    <button
                      type="button"
                      onClick={() => setWebViewTab('css')}
                      className={`px-3 py-1.5 text-xs font-mono font-medium rounded cursor-pointer ${
                        webViewTab === 'css'
                          ? 'bg-white dark:bg-slate-800 shadow-xs'
                          : 'text-slate-500'
                      }`}
                    >
                      style.css
                    </button>
                    <button
                      type="button"
                      onClick={() => setWebViewTab('js')}
                      className={`px-3 py-1.5 text-xs font-mono font-medium rounded cursor-pointer ${
                        webViewTab === 'js'
                          ? 'bg-white dark:bg-slate-800 shadow-xs'
                          : 'text-slate-500'
                      }`}
                    >
                      script.js
                    </button>
                  </div>

                  {webViewTab === 'preview' ? (
                    <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-white">
                      <iframe
                        title="Vista Previa index.html"
                        srcDoc={webBundle.fullStandaloneHtml}
                        className="w-full h-[680px] border-0"
                      />
                    </div>
                  ) : (
                    <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950 text-slate-100">
                      <div className="bg-slate-900 border-b border-slate-800 px-4 py-3 flex items-center justify-between">
                        <span className="text-xs font-mono text-slate-300">
                          {webViewTab === 'full' && 'index.html'}
                          {webViewTab === 'css' && 'style.css'}
                          {webViewTab === 'js' && 'script.js'}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            const map = {
                              full: webBundle.fullStandaloneHtml,
                              html: webBundle.html,
                              css: webBundle.css,
                              js: webBundle.javascript,
                            };
                            handleCopyCode(map[webViewTab], `code-${webViewTab}`);
                          }}
                          className="px-3 py-1 text-xs font-mono bg-slate-800 hover:bg-slate-700 rounded flex items-center gap-1.5 cursor-pointer"
                        >
                          {copiedKey === `code-${webViewTab}` ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                              <span>Copiado</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5" />
                              <span>Copiar Código</span>
                            </>
                          )}
                        </button>
                      </div>
                      <pre className="p-5 text-xs font-mono leading-relaxed overflow-x-auto max-h-[600px] overflow-y-auto">
                        <code>
                          {webViewTab === 'full' && webBundle.fullStandaloneHtml}
                          {webViewTab === 'css' && webBundle.css}
                          {webViewTab === 'js' && webBundle.javascript}
                        </code>
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </main>

        {/* Right Docked Tutor IA Drawer */}
        {isCopilotDrawerOpen && analysis && (
          <aside
            className={`w-full md:w-80 lg:w-96 shrink-0 border-t md:border-t-0 md:border-l flex flex-col h-[520px] md:h-auto print:hidden ${
              isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
            }`}
          >
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div>
                <div className="text-xs font-mono text-blue-600 dark:text-blue-400">
                  TUTOR IA CON GEMINI API
                </div>
                <h3 className="text-sm font-bold font-display truncate max-w-[230px]">
                  {analysis.documentTitle}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsCopilotDrawerOpen(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 p-4 overflow-y-auto space-y-3 max-h-[540px]">
              {chatMessages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex flex-col ${
                    msg.role === 'user' ? 'items-end' : 'items-start'
                  }`}
                >
                  <div
                    className={`rounded-xl p-3 text-xs leading-relaxed max-w-[90%] ${
                      msg.role === 'user'
                        ? 'bg-blue-700 text-white'
                        : isDarkMode
                        ? 'bg-slate-950 border border-slate-800 text-slate-200'
                        : 'bg-slate-50 border border-slate-200 text-slate-800'
                    }`}
                  >
                    <p className="whitespace-pre-line">{msg.content}</p>
                  </div>
                </div>
              ))}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendChat();
              }}
              className="p-3 border-t border-slate-200 dark:border-slate-800 flex gap-2"
            >
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Consultar al Tutor IA..."
                className={`flex-1 rounded-lg border px-3 py-2 text-xs ${
                  isDarkMode ? 'bg-slate-950 border-slate-700' : 'bg-white border-slate-300'
                }`}
              />
              <button
                type="submit"
                disabled={isChatLoading}
                className="px-3 py-2 bg-blue-700 text-white text-xs font-semibold rounded-lg cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </form>
          </aside>
        )}
      </div>

      {/* Modal: Configurar Clave API Gemini en LocalStorage */}
      {isApiKeyModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveApiKey}
            className={`max-w-md w-full rounded-2xl border p-6 space-y-4 shadow-xl ${
              isDarkMode
                ? 'bg-slate-900 border-slate-800 text-slate-100'
                : 'bg-white border-slate-200 text-slate-900'
            }`}
          >
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-blue-600" />
                <h3 className="text-base font-bold font-display">
                  Tutor IA y Motor con Gemini API
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsApiKeyModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-500 leading-relaxed">
              Ingresa tu clave de Gemini API para potenciar el Tutor IA y la generación de
              contenido. Se almacena localmente en tu <code>LocalStorage</code> para mantener
              compatibilidad total con GitHub Pages.
            </p>

            <input
              type="password"
              value={tempApiKeyInput}
              onChange={(e) => setTempApiKeyInput(e.target.value)}
              placeholder="AIzaSy..."
              className={`w-full rounded-lg border px-3.5 py-2 text-xs font-mono ${
                isDarkMode ? 'bg-slate-950 border-slate-700' : 'bg-white border-slate-300'
              }`}
            />

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setTempApiKeyInput('');
                  setLocalGeminiKey('');
                  try {
                    localStorage.removeItem(STORAGE_API_KEY);
                  } catch {
                    // ignore
                  }
                  setIsApiKeyModalOpen(false);
                }}
                className="px-3 py-2 text-xs text-slate-500 hover:underline cursor-pointer"
              >
                Usar Motor Documental Local
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold bg-blue-700 text-white rounded-lg cursor-pointer"
              >
                Guardar Clave
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal: Publicar en GitHub Pages */}
      {isGithubModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div
            className={`max-w-xl w-full rounded-2xl border p-6 space-y-5 shadow-xl ${
              isDarkMode
                ? 'bg-slate-900 border-slate-800 text-slate-100'
                : 'bg-white border-slate-200 text-slate-900'
            }`}
          >
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Github className="w-5 h-5" />
                <h3 className="text-lg font-bold font-display">
                  Publicar en GitHub Pages
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsGithubModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs sm:text-sm text-slate-500 leading-relaxed">
              Compatible al 100% con{' '}
              <code>
                https://{githubUsername}.github.io/{githubRepoName}/
              </code>
              .
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                type="text"
                value={githubUsername}
                onChange={(e) => setGithubUsername(e.target.value)}
                placeholder="usuario"
                className={`rounded-lg border px-3 py-2 text-xs font-mono ${
                  isDarkMode ? 'bg-slate-950 border-slate-700' : 'bg-white border-slate-300'
                }`}
              />
              <input
                type="text"
                value={githubRepoName}
                onChange={(e) => setGithubRepoName(e.target.value)}
                placeholder="repositorio"
                className={`rounded-lg border px-3 py-2 text-xs font-mono ${
                  isDarkMode ? 'bg-slate-950 border-slate-700' : 'bg-white border-slate-300'
                }`}
              />
            </div>

            <div className="bg-slate-950 text-slate-200 rounded-lg p-4 text-xs font-mono space-y-1.5 overflow-x-auto">
              <div>git init &amp;&amp; git add index.html</div>
              <div>git commit -m &quot;Deploy JAIRRESTAURA IA DE ESTUDIO to GitHub Pages&quot;</div>
              <div>git branch -M main</div>
              <div>
                git remote add origin https://github.com/{githubUsername}/{githubRepoName}.git
              </div>
              <div>git push -u origin main</div>
            </div>

            <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-700 dark:text-amber-300 leading-relaxed">
              <strong>⚠️ ¿Por qué aparece en blanco si subes solo el index.html de Vite?</strong>
              <p className="mt-1">
                Si en tu repositorio de GitHub solo subes un archivo <code>index.html</code> suelto (sin la carpeta <code>assets/</code>), debes usar el botón verde <strong>&ldquo;Descargar index.html Autocontenido (1 Solo Archivo)&rdquo;</strong> de abajo, que ya trae todo el CSS y JavaScript integrados adentro.
              </p>
            </div>

            <div className="flex flex-wrap justify-end gap-2">
              {webBundle && (
                <>
                  <button
                    type="button"
                    onClick={handleDownloadSelfContainedIndexHtml}
                    className="px-4 py-2.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl cursor-pointer flex items-center gap-1.5 shadow-sm"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Descargar index.html Autocontenido (1 Solo Archivo)</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadFullZip}
                    className="px-4 py-2.5 text-xs font-semibold bg-blue-700 hover:bg-blue-800 text-white rounded-xl cursor-pointer flex items-center gap-1.5"
                  >
                    <FolderArchive className="w-3.5 h-3.5" />
                    <span>Descargar ZIP Completo</span>
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Interactive Step-by-Step Spotlight Guided Tour Overlay */}
      <GuidedTourOverlay
        isOpen={isTutorialOpen}
        currentStepIndex={tutorialStep}
        onStepChange={setTutorialStep}
        onClose={handleCloseTutorial}
        onSelectSection={(sec) => setActiveSection(sec)}
        isDark={isDarkMode}
        documentTitle={analysis?.documentTitle}
        detectedTopic={analysis?.detectedMainTopic}
      />

      {/* Always-visible Floating JAIRRESTAURA Audio Player */}
      <FloatingAudioPlayer
        documentId={activeRecord?.id}
        analysis={analysis}
        activeSection={activeSection}
        chatMessages={chatMessages}
        isDark={isDarkMode}
        onSelectDocumentById={(docId) => {
          const found = library.find((d) => d.id === docId);
          if (found) {
            handleSelectFromLibrary(found);
          }
        }}
        onActivateFullDocumentVisualReader={() => {
          setActiveSection('capitulos');
          expandAllDocumentChapters(analysis);
        }}
        onLiveVisualStateChange={setLiveAudioVisual}
        externalTrigger={audioTrigger}
      />
    </div>
  );
}
