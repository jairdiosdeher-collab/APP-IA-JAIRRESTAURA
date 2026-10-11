import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import {
  Play,
  Pause,
  Square,
  Headphones,
  ChevronDown,
  ChevronUp,
  SkipForward,
  SkipBack,
  BookOpen,
  RotateCcw,
  X,
  Info,
  Maximize2,
  Minimize2,
  Sparkles,
  CheckCircle2,
  ListOrdered,
  Volume2,
} from 'lucide-react';
import { DocumentAnalysis, EditorSection, ChatMessage } from '../types';
import {
  AudiobookMode,
  AudioReadingProgressRecord,
  idbSaveAudioReadingProgress,
  idbGetAudioReadingProgress,
  idbGetLatestAudioReadingProgress,
  idbDeleteAudioReadingProgress,
} from '../utils/indexedDb';

const STORAGE_TTS_RATE_KEY = 'jairrestaura_tts_rate_v1';
const STORAGE_TTS_VOICE_KEY = 'jairrestaura_tts_voice_uri_v1';
const STORAGE_TTS_PRESET_KEY = 'jairrestaura_tts_voice_preset_v1';

export type VoiceRegionPreset = 'es-CO' | 'es-ES' | 'en-US';

export interface AudioChunkMeta {
  text: string;
  chapterNumber: number;
  chapterTitle: string;
  subtitleText?: string;
  paragraphIndex: number;
  pageNumber: number;
  totalPages: number;
  segmentType: 'title' | 'subtitle' | 'chapter' | 'paragraph';
  wordCount: number;
}

export interface LiveAudioVisualState {
  isPlaying: boolean;
  status: 'idle' | 'playing' | 'paused';
  audiobookMode: AudiobookMode;
  activeChunkIndex: number;
  totalChunks: number;
  chapterNumber: number;
  chapterTitle: string;
  subtitleText?: string;
  paragraphIndex: number;
  pageNumber: number;
  totalPages: number;
  segmentType: AudioChunkMeta['segmentType'];
  activeSentenceText: string;
  activeWordCharIndex: number;
  activeWordCharLength: number;
  percent: number;
}

export interface FloatingAudioPlayerProps {
  documentId?: string;
  analysis: DocumentAnalysis | null;
  activeSection: EditorSection;
  chatMessages: ChatMessage[];
  isDark: boolean;
  onSelectDocumentById?: (docId: string) => void;
  onActivateFullDocumentVisualReader?: () => void;
  onLiveVisualStateChange?: (state: LiveAudioVisualState) => void;
  externalTrigger?: {
    id: number;
    label: string;
    text: string;
    mode?: AudiobookMode | 'section';
  } | null;
}

const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;

export const AUDIOBOOK_MODES: Array<{
  id: AudiobookMode;
  label: string;
  listeningTitle: string;
}> = [
  {
    id: 'full-document',
    label: '🎧 Escuchar Documento Completo',
    listeningTitle: 'Todo el documento',
  },
  {
    id: 'current-page',
    label: '📄 Leer página actual',
    listeningTitle: 'Página actual',
  },
  {
    id: 'current-chapter',
    label: '📚 Leer capítulo actual',
    listeningTitle: 'Capítulo actual',
  },
  {
    id: 'summary-only',
    label: '🧠 Leer resumen automático',
    listeningTitle: 'Resumen automático',
  },
  {
    id: 'key-concepts',
    label: '📌 Leer conceptos importantes',
    listeningTitle: 'Conceptos importantes',
  },
  {
    id: 'important-questions',
    label: '❓ Leer preguntas del examen',
    listeningTitle: 'Preguntas del examen',
  },
  {
    id: 'study-mode',
    label: '🎓 Leer modo estudio',
    listeningTitle: 'Modo estudio',
  },
  {
    id: 'ai-tutor',
    label: '💬 Leer Tutor IA',
    listeningTitle: 'Tutor IA',
  },
];

const FLOATING_RADIO_OPTIONS: Array<{
  id: AudiobookMode;
  label: string;
}> = [
  { id: 'full-document', label: 'Documento Completo' },
  { id: 'current-page', label: 'Página Actual' },
  { id: 'summary-only', label: 'Resumen' },
  { id: 'key-concepts', label: 'Conceptos Clave' },
  { id: 'ai-tutor', label: 'Tutor IA' },
];

const VOICE_PRESETS: Array<{
  id: VoiceRegionPreset;
  label: string;
  langCodes: string[];
}> = [
  {
    id: 'es-CO',
    label: '🇨🇴 Español Colombia',
    langCodes: ['es-co', 'es-419', 'es-mx', 'es-us', 'es'],
  },
  {
    id: 'es-ES',
    label: '🇪🇸 Español España',
    langCodes: ['es-es', 'es'],
  },
  {
    id: 'en-US',
    label: '🇺🇸 Inglés USA',
    langCodes: ['en-us', 'en'],
  },
];

export const FloatingAudioPlayer: React.FC<FloatingAudioPlayerProps> = ({
  documentId,
  analysis,
  chatMessages,
  isDark,
  onSelectDocumentById,
  onActivateFullDocumentVisualReader,
  onLiveVisualStateChange,
  externalTrigger,
}) => {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voicePreset, setVoicePreset] = useState<VoiceRegionPreset>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_TTS_PRESET_KEY) as VoiceRegionPreset;
      if (saved === 'es-CO' || saved === 'es-ES' || saved === 'en-US') return saved;
      return 'es-CO';
    } catch {
      return 'es-CO';
    }
  });
  const [selectedVoiceURI, setSelectedVoiceURI] = useState<string>(() => {
    try {
      return localStorage.getItem(STORAGE_TTS_VOICE_KEY) || '';
    } catch {
      return '';
    }
  });
  const [rate, setRate] = useState<number>(() => {
    try {
      const saved = parseFloat(localStorage.getItem(STORAGE_TTS_RATE_KEY) || '1');
      return Number.isFinite(saved) && saved >= 0.5 && saved <= 2 ? saved : 1;
    } catch {
      return 1;
    }
  });

  const [audiobookMode, setAudiobookMode] = useState<AudiobookMode>('full-document');
  const [status, setStatus] = useState<'idle' | 'playing' | 'paused'>('idle');
  const [currentLabel, setCurrentLabel] = useState<string>('Listo para escuchar');
  const [isMinimized, setIsMinimized] = useState<boolean>(false);
  const [isOptionsMenuOpen, setIsOptionsMenuOpen] = useState<boolean>(false);
  const [showFullDocTourNotice, setShowFullDocTourNotice] = useState<boolean>(false);

  // Fullscreen Immersive Reading View State
  const [isImmersiveReaderOpen, setIsImmersiveReaderOpen] = useState<boolean>(false);
  const [autoFollowScroll, setAutoFollowScroll] = useState<boolean>(true);

  // Real-time tracking states for full-document & smart reading
  const [activeChunkIndex, setActiveChunkIndex] = useState<number>(0);
  const [totalChunks, setTotalChunks] = useState<number>(0);
  const [currentChapterNumber, setCurrentChapterNumber] = useState<number>(1);
  const [currentChapterTitle, setCurrentChapterTitle] = useState<string>('Capítulo 1');
  const [currentSubtitleText, setCurrentSubtitleText] = useState<string>('');
  const [currentParagraphIndex, setCurrentParagraphIndex] = useState<number>(0);
  const [currentSegmentType, setCurrentSegmentType] =
    useState<AudioChunkMeta['segmentType']>('paragraph');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [segmentKindLabel, setSegmentKindLabel] = useState<string>('Sección activa');

  // Real-time sentence & word boundary highlight state
  const [activeSentenceText, setActiveSentenceText] = useState<string>('');
  const [activeWordCharIndex, setActiveWordCharIndex] = useState<number>(-1);
  const [activeWordCharLength, setActiveWordCharLength] = useState<number>(0);

  // IndexedDB Auto-Resume Prompt State
  const [savedResumeRecord, setSavedResumeRecord] =
    useState<AudioReadingProgressRecord | null>(null);
  const [showResumePrompt, setShowResumePrompt] = useState<boolean>(false);

  const chunksMetaRef = useRef<AudioChunkMeta[]>([]);
  const currentChunkIndexRef = useRef<number>(0);
  const wordTimerRef = useRef<number | null>(null);
  const boundarySupportedRef = useRef<boolean>(false);
  const activeSentenceElementRef = useRef<HTMLSpanElement | null>(null);
  const immersiveScrollContainerRef = useRef<HTMLDivElement | null>(null);

  const clearWordTimer = useCallback(() => {
    if (wordTimerRef.current !== null) {
      window.clearInterval(wordTimerRef.current);
      wordTimerRef.current = null;
    }
  }, []);

  // Load voices from SpeechSynthesis API
  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

    const updateVoices = () => {
      const allVoices = window.speechSynthesis.getVoices();
      setVoices(allVoices);

      if (!selectedVoiceURI && allVoices.length > 0) {
        const presetObj =
          VOICE_PRESETS.find((p) => p.id === voicePreset) || VOICE_PRESETS[0];
        let matched: SpeechSynthesisVoice | undefined;
        for (const code of presetObj.langCodes) {
          matched = allVoices.find((v) => v.lang.toLowerCase().startsWith(code));
          if (matched) break;
        }
        const preferred = matched || allVoices[0];
        if (preferred) {
          setSelectedVoiceURI(preferred.voiceURI);
        }
      }
    };

    updateVoices();
    window.speechSynthesis.onvoiceschanged = updateVoices;
    return () => {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.onvoiceschanged = null;
      }
      clearWordTimer();
    };
  }, [selectedVoiceURI, voicePreset, clearWordTimer]);

  // Build Audiobook Queue with rich structural hierarchy (Chapter -> Subtitle -> Paragraph -> Sentence)
  const buildAudiobookQueue = useCallback(
    (
      doc: DocumentAnalysis,
      mode: AudiobookMode,
      targetPageNum: number = 1,
      targetChapterTitle?: string
    ): AudioChunkMeta[] => {
      const queue: AudioChunkMeta[] = [];
      const thechapters = doc.chapters && doc.chapters.length > 0 ? doc.chapters : [];

      const rawPagesCount =
        doc.pages && doc.pages.length > 0
          ? doc.pages.length
          : doc.pageCountEstimate && doc.pageCountEstimate > 0
          ? doc.pageCountEstimate
          : Math.max(1, Math.ceil((doc.wordCountEstimate || 500) / 250));

      const countWords = (str: string) =>
        str
          .trim()
          .split(/\s+/)
          .filter(Boolean).length;

      let runningParagraphCounter = 0;
      let activeDetectedSubtitle = 'Contenido Principal';

      const pushSentencesAsChunks = (
        rawBlock: string,
        chapterNumber: number,
        chapterTitle: string,
        pageNumber: number,
        defaultType: AudioChunkMeta['segmentType'] = 'paragraph',
        explicitSubtitle?: string
      ) => {
        if (explicitSubtitle) {
          activeDetectedSubtitle = explicitSubtitle;
        }

        const lines = rawBlock
          .split(/\n+/)
          .map((l) => l.trim())
          .filter(Boolean);

        for (const line of lines) {
          const cleanLine = line
            .replace(/\[\[PÁGINA\s+\d+\]\]/gi, '')
            .replace(/[*#_`~>-]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
          if (!cleanLine) continue;

          runningParagraphCounter += 1;
          const thisParaIndex = runningParagraphCounter;

          const isHeadingLine =
            cleanLine.length <= 95 &&
            !cleanLine.endsWith('.') &&
            (/^(cap[íi]tulo|secci[óo]n|unidad|tema|parte|m[óo]dulo|subt[íi]tulo|\d+(\.\d+)*)\b/i.test(
              cleanLine
            ) ||
              cleanLine === cleanLine.toUpperCase());

          if (isHeadingLine) {
            activeDetectedSubtitle = cleanLine;
            const spokenHeading = `${cleanLine}.`;
            queue.push({
              text: spokenHeading,
              chapterNumber,
              chapterTitle,
              subtitleText: activeDetectedSubtitle,
              paragraphIndex: thisParaIndex,
              pageNumber,
              totalPages: rawPagesCount,
              segmentType: 'subtitle',
              wordCount: countWords(spokenHeading),
            });
            continue;
          }

          const sentences = cleanLine.split(/(?<=[.!?])\s+/);
          let acc = '';
          for (const s of sentences) {
            if ((acc + ' ' + s).length > 190 && acc.length > 0) {
              queue.push({
                text: acc.trim(),
                chapterNumber,
                chapterTitle,
                subtitleText: activeDetectedSubtitle,
                paragraphIndex: thisParaIndex,
                pageNumber,
                totalPages: rawPagesCount,
                segmentType: defaultType,
                wordCount: countWords(acc),
              });
              acc = s;
            } else {
              acc = acc ? `${acc} ${s}` : s;
            }
          }
          if (acc.trim()) {
            queue.push({
              text: acc.trim(),
              chapterNumber,
              chapterTitle,
              subtitleText: activeDetectedSubtitle,
              paragraphIndex: thisParaIndex,
              pageNumber,
              totalPages: rawPagesCount,
              segmentType: defaultType,
              wordCount: countWords(acc),
            });
          }
        }
      };

      if (mode === 'current-page') {
        const safePage = Math.max(1, Math.min(targetPageNum || 1, rawPagesCount));
        let pageText = '';
        if (doc.pages && doc.pages.length >= safePage) {
          pageText = doc.pages[safePage - 1];
        } else if (doc.fullRawText) {
          const allWords = doc.fullRawText.split(/\s+/);
          const perPage = Math.max(150, Math.ceil(allWords.length / rawPagesCount));
          pageText = allWords
            .slice((safePage - 1) * perPage, safePage * perPage)
            .join(' ');
        } else {
          pageText = doc.executiveSummary?.overview || doc.documentTitle;
        }
        const chIdx = Math.min(
          Math.max(0, thechapters.length - 1),
          Math.floor(((safePage - 1) / Math.max(1, rawPagesCount)) * Math.max(1, thechapters.length))
        );
        const ch = thechapters[chIdx];
        const chLabel = ch
          ? /^cap[íi]tulo/i.test(ch.title)
            ? ch.title
            : `Capítulo ${ch.number || chIdx + 1} - ${ch.title}`
          : `Capítulo 1`;

        pushSentencesAsChunks(
          `Página ${safePage} de ${rawPagesCount}. ${pageText}`,
          ch?.number || 1,
          chLabel,
          safePage,
          'paragraph',
          `Página ${safePage}`
        );
      } else if (mode === 'current-chapter') {
        const matchedCh =
          thechapters.find((c) => targetChapterTitle?.includes(c.title)) ||
          thechapters[0];
        if (matchedCh) {
          const chNum = matchedCh.number || 1;
          const chLabel = /^cap[íi]tulo/i.test(matchedCh.title)
            ? matchedCh.title
            : `Capítulo ${chNum} - ${matchedCh.title}`;
          pushSentencesAsChunks(
            `${chLabel}. ${matchedCh.summary || ''}\n${matchedCh.detailedContent || ''}`,
            chNum,
            chLabel,
            Math.max(1, chNum),
            'chapter',
            matchedCh.title
          );
        } else {
          pushSentencesAsChunks(
            `${doc.documentTitle}. ${doc.executiveSummary?.overview || ''}`,
            1,
            'Capítulo 1',
            1,
            'chapter',
            doc.documentTitle
          );
        }
      } else if (mode === 'summary-only') {
        const titleSpeech = `Resumen automático del documento: ${doc.documentTitle}.`;
        queue.push({
          text: titleSpeech,
          chapterNumber: 1,
          chapterTitle: 'Resumen Automático',
          subtitleText: 'Tesis Central y Resumen Ejecutivo',
          paragraphIndex: 0,
          pageNumber: 1,
          totalPages: rawPagesCount,
          segmentType: 'title',
          wordCount: countWords(titleSpeech),
        });
        if (doc.executiveSummary?.thesisStatement) {
          pushSentencesAsChunks(
            `${doc.executiveSummary.thesisStatement}. ${doc.executiveSummary.overview || ''}`,
            1,
            'Resumen Ejecutivo',
            1,
            'paragraph',
            'Tesis Central del Documento'
          );
        }
        (doc.executiveSummary?.keyPoints || []).forEach((pt, idx) => {
          pushSentencesAsChunks(
            `Punto clave ${idx + 1}: ${pt}`,
            1,
            'Puntos Clave del Resumen',
            1,
            'paragraph',
            `Idea Principal ${idx + 1}`
          );
        });
        thechapters.forEach((ch, idx) => {
          const chTitle = /^cap[íi]tulo/i.test(ch.title)
            ? ch.title
            : `Capítulo ${ch.number || idx + 1} - ${ch.title}`;
          pushSentencesAsChunks(
            `${chTitle}. ${ch.summary || ''}`,
            ch.number || idx + 1,
            chTitle,
            Math.max(1, idx + 1),
            'chapter',
            `Síntesis del ${chTitle}`
          );
        });
      } else if (mode === 'key-concepts') {
        queue.push({
          text: `Conceptos importantes y glosario de ${doc.documentTitle}.`,
          chapterNumber: 1,
          chapterTitle: 'Conceptos Importantes',
          subtitleText: 'Definiciones Clave y Glosario',
          paragraphIndex: 0,
          pageNumber: 1,
          totalPages: rawPagesCount,
          segmentType: 'title',
          wordCount: 8,
        });
        (doc.keyConcepts || []).forEach((kc, idx) => {
          pushSentencesAsChunks(
            `Concepto ${idx + 1}: ${kc.name}. ${kc.definition}. Importancia: ${kc.importance}.`,
            idx + 1,
            `Concepto: ${kc.name}`,
            1,
            'paragraph',
            kc.category || 'Concepto Clave'
          );
        });
        (doc.glossary || []).forEach((g) => {
          pushSentencesAsChunks(
            `Término de glosario: ${g.term}. Definición: ${g.definition}.`,
            1,
            'Glosario Técnico',
            rawPagesCount,
            'paragraph',
            g.term
          );
        });
      } else if (mode === 'study-mode') {
        queue.push({
          text: `Modo estudio guiado para ${doc.documentTitle}.`,
          chapterNumber: 1,
          chapterTitle: 'Modo Estudio IA',
          subtitleText: 'Unidades y Tarjetas de Estudio',
          paragraphIndex: 0,
          pageNumber: 1,
          totalPages: rawPagesCount,
          segmentType: 'title',
          wordCount: 7,
        });
        const units = doc.courseUnits || [];
        if (units.length > 0) {
          units.forEach((u, idx) => {
            const unitLabel = `Unidad ${u.unitNumber || idx + 1}: ${u.title}`;
            pushSentencesAsChunks(
              `${unitLabel}. Objetivo: ${u.objective}. ${u.explanation}. Idea clave para recordar: ${u.keyRememberPoint}.`,
              u.unitNumber || idx + 1,
              unitLabel,
              idx + 1,
              'chapter',
              u.objective
            );
          });
        }
        (doc.flashcards || []).forEach((fc, idx) => {
          pushSentencesAsChunks(
            `Tarjeta de estudio ${idx + 1}. Pregunta: ${fc.front}. Respuesta: ${fc.back}.`,
            1,
            'Flashcards de Repaso',
            rawPagesCount,
            'paragraph',
            `Flashcard #${idx + 1}`
          );
        });
      } else if (mode === 'important-questions') {
        queue.push({
          text: `Preguntas del examen sobre ${doc.documentTitle}.`,
          chapterNumber: 1,
          chapterTitle: 'Preguntas del Examen',
          subtitleText: 'Banco de Evaluación con Respuestas',
          paragraphIndex: 0,
          pageNumber: 1,
          totalPages: rawPagesCount,
          segmentType: 'title',
          wordCount: 8,
        });
        (doc.examQuestions || []).forEach((eq, idx) => {
          pushSentencesAsChunks(
            `Pregunta de examen ${idx + 1}: ${eq.question}. Respuesta modelo: ${eq.modelAnswer}.`,
            idx + 1,
            `Pregunta de Examen ${idx + 1}`,
            1,
            'paragraph',
            eq.question
          );
        });
        (doc.quiz || doc.quizzes || []).forEach((q, idx) => {
          const correctText = q.options?.[q.correctIndex] || '';
          pushSentencesAsChunks(
            `Pregunta tipo test ${idx + 1}: ${q.question}. Respuesta correcta: ${correctText}. Explicación: ${q.explanation}.`,
            idx + 1,
            `Cuestionario ${idx + 1}`,
            1,
            'paragraph',
            q.question
          );
        });
      } else if (mode === 'ai-tutor') {
        const assistantMsgs = (chatMessages || []).filter((m) => m.role === 'assistant');
        if (assistantMsgs.length > 0) {
          assistantMsgs.forEach((m, idx) => {
            pushSentencesAsChunks(
              `Respuesta del Tutor IA ${idx + 1}: ${m.content}`,
              1,
              'Tutor IA Conversacional',
              1,
              'paragraph',
              `Intervención del Tutor #${idx + 1}`
            );
          });
        } else {
          pushSentencesAsChunks(
            `Tutor IA de JAIRRESTAURA para ${doc.documentTitle}. Idea principal: ${
              doc.executiveSummary?.thesisStatement || ''
            }. ${doc.executiveSummary?.overview || ''}`,
            1,
            'Tutor IA',
            1,
            'paragraph',
            'Explicación General del Tutor IA'
          );
        }
      } else {
        // FULL DOCUMENT MODE ('full-document'):
        // Prefer structured chapter-by-chapter reading if chapters exist AND also include full pages so every chapter is visually organized
        if (thechapters.length > 0) {
          const introChapterLabel = /^cap[íi]tulo/i.test(thechapters[0].title)
            ? thechapters[0].title
            : `Capítulo 1 - ${thechapters[0].title}`;

          const titleAnnouncement = `Documento completo: ${doc.documentTitle}. ${doc.subtitle || ''}`;
          queue.push({
            text: titleAnnouncement.trim(),
            chapterNumber: 1,
            chapterTitle: introChapterLabel,
            subtitleText: doc.detectedMainTopic || 'Introducción General del Documento',
            paragraphIndex: 0,
            pageNumber: 1,
            totalPages: rawPagesCount,
            segmentType: 'title',
            wordCount: countWords(titleAnnouncement),
          });

          // If raw pages exist and are richer than chapters, map pages into chapters; also include structured chapter headings & takeaways
          if (doc.pages && doc.pages.length > 0) {
            let lastAnnouncedChapterNum = -1;
            doc.pages.forEach((pageContent, pIdx) => {
              const pageNum = pIdx + 1;
              const mappedChapterIdx = Math.min(
                Math.max(0, thechapters.length - 1),
                Math.floor(
                  (pIdx / Math.max(1, doc.pages!.length)) * Math.max(1, thechapters.length)
                )
              );
              const mappedCh = thechapters[mappedChapterIdx];
              const chNum = mappedCh ? mappedCh.number || mappedChapterIdx + 1 : pageNum;
              const chLabel = mappedCh
                ? /^cap[íi]tulo/i.test(mappedCh.title)
                  ? mappedCh.title
                  : `Capítulo ${chNum} - ${mappedCh.title}`
                : `Capítulo ${chNum}`;

              if (chNum !== lastAnnouncedChapterNum && mappedCh) {
                lastAnnouncedChapterNum = chNum;
                const chapterHeaderSpeech = `${chLabel}. ${mappedCh.summary || ''}`;
                runningParagraphCounter += 1;
                queue.push({
                  text: chapterHeaderSpeech.trim(),
                  chapterNumber: chNum,
                  chapterTitle: chLabel,
                  subtitleText: mappedCh.summary || `Apertura del ${chLabel}`,
                  paragraphIndex: runningParagraphCounter,
                  pageNumber: pageNum,
                  totalPages: rawPagesCount,
                  segmentType: 'chapter',
                  wordCount: countWords(chapterHeaderSpeech),
                });
              }

              pushSentencesAsChunks(
                pageContent,
                chNum,
                chLabel,
                pageNum,
                'paragraph',
                mappedCh?.title || `Página ${pageNum}`
              );
            });
          } else {
            thechapters.forEach((ch, idx) => {
              const chNum = ch.number || idx + 1;
              const formattedChTitle = /^cap[íi]tulo/i.test(ch.title)
                ? ch.title
                : `Capítulo ${chNum} - ${ch.title}`;
              const pageEst = Math.max(
                1,
                Math.ceil(((idx + 1) / Math.max(1, thechapters.length)) * rawPagesCount)
              );

              runningParagraphCounter += 1;
              queue.push({
                text: `${formattedChTitle}.`,
                chapterNumber: chNum,
                chapterTitle: formattedChTitle,
                subtitleText: ch.summary || 'Resumen del Capítulo',
                paragraphIndex: runningParagraphCounter,
                pageNumber: pageEst,
                totalPages: rawPagesCount,
                segmentType: 'chapter',
                wordCount: countWords(formattedChTitle),
              });

              if (ch.summary) {
                pushSentencesAsChunks(
                  ch.summary,
                  chNum,
                  formattedChTitle,
                  pageEst,
                  'subtitle',
                  `Síntesis: ${ch.title}`
                );
              }

              pushSentencesAsChunks(
                ch.detailedContent || '',
                chNum,
                formattedChTitle,
                pageEst,
                'paragraph',
                `Desarrollo Completo: ${ch.title}`
              );

              if (ch.keyTakeaways && ch.keyTakeaways.length > 0) {
                pushSentencesAsChunks(
                  `Puntos clave del capítulo: ${ch.keyTakeaways.join('. ')}`,
                  chNum,
                  formattedChTitle,
                  pageEst,
                  'paragraph',
                  'Puntos Clave del Capítulo'
                );
              }
            });
          }
        } else if (doc.fullRawText && doc.fullRawText.trim().length > 0) {
          const rawBlocks = doc.fullRawText.split(/(?=\[\[PÁGINA\s+\d+\]\])/i);
          rawBlocks.forEach((block, bIdx) => {
            const pageMatch = block.match(/\[\[PÁGINA\s+(\d+)\]\]/i);
            const pageNum = pageMatch ? parseInt(pageMatch[1], 10) : bIdx + 1;
            pushSentencesAsChunks(
              block,
              pageNum,
              `Capítulo ${pageNum}`,
              pageNum,
              'paragraph',
              `Página ${pageNum}`
            );
          });
        }
      }

      const totalItems = Math.max(1, queue.length);
      return queue.map((item, idx) => {
        const progressivePage =
          item.pageNumber > 1
            ? item.pageNumber
            : Math.min(
                rawPagesCount,
                Math.max(1, Math.ceil(((idx + 1) / totalItems) * rawPagesCount))
              );
        return {
          ...item,
          pageNumber: progressivePage,
          totalPages: rawPagesCount,
        };
      });
    },
    [chatMessages]
  );

  // Compute preview metrics for the selected reading option ("Vas a escuchar: ...")
  const selectedModePreview = useMemo(() => {
    const modeConfig =
      AUDIOBOOK_MODES.find((m) => m.id === audiobookMode) || AUDIOBOOK_MODES[0];

    if (!analysis) {
      return {
        listeningTitle: modeConfig.listeningTitle,
        pagesCount: 0,
        wordsCount: 0,
        estimatedMinutes: 0,
        previewQueue: [] as AudioChunkMeta[],
      };
    }

    const previewQueue = buildAudiobookQueue(
      analysis,
      audiobookMode,
      currentPage,
      currentChapterTitle
    );
    const computedWords = previewQueue.reduce((acc, item) => acc + item.wordCount, 0);
    const wordsCount =
      audiobookMode === 'full-document'
        ? Math.max(computedWords, analysis.wordCountEstimate || computedWords)
        : computedWords;

    const totalDocPages =
      analysis.pages?.length ||
      analysis.pageCountEstimate ||
      Math.max(1, Math.ceil((analysis.wordCountEstimate || 500) / 250));

    const pagesCount =
      audiobookMode === 'full-document'
        ? totalDocPages
        : audiobookMode === 'current-page'
        ? 1
        : Math.max(1, Math.min(totalDocPages, Math.ceil(wordsCount / 260)));

    const wordsPerMinute = 165 * rate;
    const estimatedMinutes = Math.max(1, Math.round(wordsCount / wordsPerMinute));

    return {
      listeningTitle: modeConfig.listeningTitle,
      pagesCount,
      wordsCount,
      estimatedMinutes,
      previewQueue,
    };
  }, [
    analysis,
    audiobookMode,
    buildAudiobookQueue,
    currentPage,
    currentChapterTitle,
    rate,
  ]);

  const buildCustomTextQueue = useCallback(
    (label: string, rawText: string): AudioChunkMeta[] => {
      const clean = rawText
        .replace(/\[\[PÁGINA\s+\d+\]\]/gi, '')
        .replace(/[*#_`~>-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (!clean) return [];

      const totalDocPages =
        analysis?.pages?.length ||
        analysis?.pageCountEstimate ||
        Math.max(1, Math.ceil((analysis?.wordCountEstimate || 400) / 250));

      const sentences = clean.split(/(?<=[.!?])\s+/);
      const temp: string[] = [];
      let current = '';

      for (const s of sentences) {
        if ((current + ' ' + s).length > 190 && current.length > 0) {
          temp.push(current.trim());
          current = s;
        } else {
          current = current ? `${current} ${s}` : s;
        }
      }
      if (current.trim()) temp.push(current.trim());

      return temp.map((chunkText, i) => {
        const chList = analysis?.chapters || [];
        const chIdx = Math.min(
          Math.max(0, chList.length - 1),
          Math.floor((i / Math.max(1, temp.length)) * Math.max(1, chList.length))
        );
        const ch = chList[chIdx];
        const chTitle = ch
          ? /^cap[íi]tulo/i.test(ch.title)
            ? ch.title
            : `Capítulo ${ch.number} - ${ch.title}`
          : label;

        return {
          text: chunkText,
          chapterNumber: ch?.number || 1,
          chapterTitle: chTitle,
          subtitleText: ch?.summary || label,
          paragraphIndex: Math.floor(i / 2) + 1,
          pageNumber: Math.min(
            totalDocPages,
            Math.max(1, Math.ceil(((i + 1) / Math.max(1, temp.length)) * totalDocPages))
          ),
          totalPages: totalDocPages,
          segmentType: i === 0 ? 'title' : 'paragraph',
          wordCount: chunkText.split(/\s+/).filter(Boolean).length,
        };
      });
    },
    [analysis]
  );

  // Save reading position into IndexedDB automatically
  const persistReadingStateToIdb = useCallback(
    (chunkIndex: number, queue: AudioChunkMeta[], mode: AudiobookMode) => {
      if (!analysis || queue.length === 0) return;
      const docKey = documentId || analysis.documentTitle;
      if (!docKey) return;

      const clampedIndex = Math.max(0, Math.min(chunkIndex, queue.length - 1));
      const meta = queue[clampedIndex];
      const wordsPerMin = 165 * rate;
      const wordsRead = queue
        .slice(0, clampedIndex)
        .reduce((acc, item) => acc + item.wordCount, 0);
      const elapsedSeconds = Math.round((wordsRead / wordsPerMin) * 60);
      const percentCompleted = Math.min(
        100,
        Math.round((clampedIndex / Math.max(1, queue.length)) * 100)
      );

      const record: AudioReadingProgressRecord = {
        documentId: docKey,
        documentTitle: analysis.documentTitle,
        audiobookMode: mode,
        chunkIndex: clampedIndex,
        totalChunks: queue.length,
        chapterNumber: meta?.chapterNumber || 1,
        chapterTitle: meta?.chapterTitle || analysis.documentTitle,
        pageNumber: meta?.pageNumber || 1,
        totalPages: meta?.totalPages || 1,
        elapsedSeconds,
        percentCompleted,
        rate,
        voicePreset,
        updatedAt: new Date().toISOString(),
      };

      idbSaveAudioReadingProgress(record).catch(() => {
        // ignore IndexedDB transient errors
      });
    },
    [analysis, documentId, rate, voicePreset]
  );

  // Check IndexedDB on mount or when document changes to offer automatic resume
  useEffect(() => {
    let isMounted = true;
    const checkSavedProgress = async () => {
      try {
        if (analysis) {
          const docKey = documentId || analysis.documentTitle;
          const saved = await idbGetAudioReadingProgress(docKey);
          if (
            isMounted &&
            saved &&
            saved.chunkIndex > 0 &&
            saved.chunkIndex < saved.totalChunks
          ) {
            setSavedResumeRecord(saved);
            setShowResumePrompt(true);
            return;
          }
        } else {
          const latest = await idbGetLatestAudioReadingProgress();
          if (
            isMounted &&
            latest &&
            latest.chunkIndex > 0 &&
            latest.chunkIndex < latest.totalChunks
          ) {
            setSavedResumeRecord(latest);
            setShowResumePrompt(true);
          }
        }
      } catch {
        // ignore
      }
    };
    checkSavedProgress();
    return () => {
      isMounted = false;
    };
  }, [documentId, analysis?.documentTitle]);

  const startFallbackWordHighlighter = useCallback(
    (sentence: string, speechRate: number) => {
      clearWordTimer();
      const tokens: Array<{ start: number; length: number }> = [];
      const regex = /\S+/g;
      let match: RegExpExecArray | null;
      while ((match = regex.exec(sentence)) !== null) {
        tokens.push({ start: match.index, length: match[0].length });
      }
      if (tokens.length === 0) return;

      const msPerWord = Math.max(110, Math.round(330 / speechRate));
      let idx = 0;
      setActiveWordCharIndex(tokens[0].start);
      setActiveWordCharLength(tokens[0].length);

      wordTimerRef.current = window.setInterval(() => {
        if (boundarySupportedRef.current) {
          clearWordTimer();
          return;
        }
        idx += 1;
        if (idx < tokens.length) {
          setActiveWordCharIndex(tokens[idx].start);
          setActiveWordCharLength(tokens[idx].length);
        } else {
          clearWordTimer();
        }
      }, msPerWord);
    },
    [clearWordTimer]
  );

  const speakChunkAt = useCallback(
    (index: number, activeMode: AudiobookMode = audiobookMode) => {
      if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
      const queue = chunksMetaRef.current;
      clearWordTimer();

      if (index < 0 || index >= queue.length) {
        setStatus('idle');
        setActiveChunkIndex(queue.length);
        setActiveSentenceText('');
        setActiveWordCharIndex(-1);
        setActiveWordCharLength(0);
        setCurrentLabel('Lectura completada (100%)');
        if (analysis) {
          const docKey = documentId || analysis.documentTitle;
          idbDeleteAudioReadingProgress(docKey).catch(() => {});
        }
        return;
      }

      currentChunkIndexRef.current = index;
      const meta = queue[index];

      setActiveChunkIndex(index);
      setTotalChunks(queue.length);
      setCurrentChapterNumber(meta.chapterNumber);
      setCurrentChapterTitle(meta.chapterTitle);
      setCurrentSubtitleText(meta.subtitleText || '');
      setCurrentParagraphIndex(meta.paragraphIndex);
      setCurrentSegmentType(meta.segmentType);
      setCurrentPage(meta.pageNumber);
      setTotalPages(meta.totalPages);
      setActiveSentenceText(meta.text);
      setActiveWordCharIndex(0);
      const firstWordMatch = meta.text.match(/^\S+/);
      setActiveWordCharLength(firstWordMatch ? firstWordMatch[0].length : 0);

      setSegmentKindLabel(
        meta.segmentType === 'title'
          ? 'Título del documento'
          : meta.segmentType === 'subtitle'
          ? 'Subtítulo en lectura'
          : meta.segmentType === 'chapter'
          ? 'Capítulo en lectura'
          : 'Oración y párrafo en lectura'
      );
      setCurrentLabel(`Leyendo: ${meta.chapterTitle}`);

      persistReadingStateToIdb(index, queue, activeMode);

      const utterance = new SpeechSynthesisUtterance(meta.text);
      utterance.rate = rate;

      const chosenVoice = voices.find((v) => v.voiceURI === selectedVoiceURI);
      if (chosenVoice) {
        utterance.voice = chosenVoice;
        utterance.lang = chosenVoice.lang;
      } else {
        utterance.lang = voicePreset;
      }

      boundarySupportedRef.current = false;
      startFallbackWordHighlighter(meta.text, rate);

      utterance.onboundary = (event: SpeechSynthesisEvent) => {
        if (event.name === 'word' || typeof event.charIndex === 'number') {
          boundarySupportedRef.current = true;
          clearWordTimer();
          const cIdx = event.charIndex;
          const remaining = meta.text.slice(cIdx);
          const wordMatch = remaining.match(/^\S+/);
          const wLen =
            (event as SpeechSynthesisEvent & { charLength?: number }).charLength ||
            (wordMatch ? wordMatch[0].length : 1);
          setActiveWordCharIndex(cIdx);
          setActiveWordCharLength(wLen);
        }
      };

      utterance.onend = () => {
        clearWordTimer();
        if (currentChunkIndexRef.current + 1 < chunksMetaRef.current.length) {
          speakChunkAt(currentChunkIndexRef.current + 1, activeMode);
        } else {
          setStatus('idle');
          setActiveChunkIndex(chunksMetaRef.current.length);
          setActiveWordCharIndex(-1);
          setCurrentLabel('Documento leído por completo (100%)');
          if (analysis) {
            const docKey = documentId || analysis.documentTitle;
            idbDeleteAudioReadingProgress(docKey).catch(() => {});
          }
        }
      };

      utterance.onerror = () => {
        clearWordTimer();
        setStatus('idle');
      };

      window.speechSynthesis.speak(utterance);
    },
    [
      audiobookMode,
      analysis,
      documentId,
      rate,
      selectedVoiceURI,
      voicePreset,
      voices,
      clearWordTimer,
      persistReadingStateToIdb,
      startFallbackWordHighlighter,
    ]
  );

  const startSpeakingQueue = useCallback(
    (
      queue: AudioChunkMeta[],
      startIndex = 0,
      modeToUse: AudiobookMode = audiobookMode,
      openImmersive = false
    ) => {
      if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
      if (queue.length === 0) return;

      window.speechSynthesis.cancel();
      clearWordTimer();
      chunksMetaRef.current = queue;
      currentChunkIndexRef.current = startIndex;
      setTotalChunks(queue.length);
      setActiveChunkIndex(startIndex);
      setIsMinimized(false);
      setShowResumePrompt(false);
      setStatus('playing');
      if (openImmersive || modeToUse === 'full-document') {
        setIsImmersiveReaderOpen(true);
        if (onActivateFullDocumentVisualReader) {
          onActivateFullDocumentVisualReader();
        }
      }
      speakChunkAt(startIndex, modeToUse);
    },
    [
      audiobookMode,
      clearWordTimer,
      onActivateFullDocumentVisualReader,
      speakChunkAt,
    ]
  );

  const handleStartSelectedReading = useCallback(
    (overrideMode?: AudiobookMode, forceImmersive?: boolean) => {
      if (!analysis) return;
      const targetMode = overrideMode || audiobookMode;
      setAudiobookMode(targetMode);
      if (targetMode === 'full-document') {
        setShowFullDocTourNotice(true);
      }
      const modeQueue = buildAudiobookQueue(
        analysis,
        targetMode,
        currentPage,
        currentChapterTitle
      );
      startSpeakingQueue(
        modeQueue,
        0,
        targetMode,
        forceImmersive ?? targetMode === 'full-document'
      );
    },
    [
      analysis,
      audiobookMode,
      buildAudiobookQueue,
      currentPage,
      currentChapterTitle,
      startSpeakingQueue,
    ]
  );

  const handleSelectAudiobookMode = useCallback(
    (newMode: AudiobookMode, autoStart = false) => {
      setAudiobookMode(newMode);
      setIsOptionsMenuOpen(false);
      if (newMode === 'full-document') {
        setShowFullDocTourNotice(true);
      } else {
        setShowFullDocTourNotice(false);
      }
      if (autoStart && analysis) {
        const modeQueue = buildAudiobookQueue(
          analysis,
          newMode,
          currentPage,
          currentChapterTitle
        );
        startSpeakingQueue(modeQueue, 0, newMode, newMode === 'full-document');
      }
    },
    [analysis, buildAudiobookQueue, currentPage, currentChapterTitle, startSpeakingQueue]
  );

  const handleConfirmResumeReading = useCallback(() => {
    if (!savedResumeRecord) return;
    if (
      analysis &&
      (documentId === savedResumeRecord.documentId ||
        analysis.documentTitle === savedResumeRecord.documentTitle)
    ) {
      const modeToRestore = savedResumeRecord.audiobookMode || 'full-document';
      setAudiobookMode(modeToRestore);
      const queue = buildAudiobookQueue(
        analysis,
        modeToRestore,
        savedResumeRecord.pageNumber,
        savedResumeRecord.chapterTitle
      );
      const safeIdx = Math.min(
        Math.max(0, savedResumeRecord.chunkIndex),
        Math.max(0, queue.length - 1)
      );
      startSpeakingQueue(queue, safeIdx, modeToRestore, modeToRestore === 'full-document');
      setShowResumePrompt(false);
    } else if (onSelectDocumentById) {
      onSelectDocumentById(savedResumeRecord.documentId);
    }
  }, [
    savedResumeRecord,
    analysis,
    documentId,
    buildAudiobookQueue,
    startSpeakingQueue,
    onSelectDocumentById,
  ]);

  // Triggered when parent requests reading a specific mode or custom section
  useEffect(() => {
    if (!externalTrigger) return;
    setIsMinimized(false);
    if (externalTrigger.mode && externalTrigger.mode !== 'section' && analysis) {
      handleSelectAudiobookMode(externalTrigger.mode, true);
      return;
    }
    if (externalTrigger.text) {
      const customQueue = buildCustomTextQueue(
        externalTrigger.label,
        externalTrigger.text
      );
      startSpeakingQueue(customQueue, 0, audiobookMode, false);
    }
  }, [
    externalTrigger,
    analysis,
    audiobookMode,
    handleSelectAudiobookMode,
    buildCustomTextQueue,
    startSpeakingQueue,
  ]);

  // Reset metrics when active document changes
  useEffect(() => {
    if (!analysis) return;
    const totalDocPages =
      analysis.pages?.length ||
      analysis.pageCountEstimate ||
      Math.max(1, Math.ceil((analysis.wordCountEstimate || 400) / 250));
    setTotalPages(totalDocPages);
    setCurrentPage(1);
    const firstCh = analysis.chapters?.[0];
    if (firstCh) {
      setCurrentChapterNumber(firstCh.number || 1);
      setCurrentChapterTitle(
        /^cap[íi]tulo/i.test(firstCh.title)
          ? firstCh.title
          : `Capítulo ${firstCh.number} - ${firstCh.title}`
      );
      setCurrentSubtitleText(firstCh.summary || '');
    } else {
      setCurrentChapterNumber(1);
      setCurrentChapterTitle('Capítulo 1');
      setCurrentSubtitleText('');
    }
  }, [analysis?.documentTitle]);

  const handlePause = () => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    clearWordTimer();
    if (window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
      window.speechSynthesis.pause();
      setStatus('paused');
      persistReadingStateToIdb(
        currentChunkIndexRef.current,
        chunksMetaRef.current,
        audiobookMode
      );
    }
  };

  const handleResume = () => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
      setStatus('playing');
    } else if (status === 'paused' && chunksMetaRef.current.length > 0) {
      speakChunkAt(currentChunkIndexRef.current, audiobookMode);
      setStatus('playing');
    } else {
      handleStartSelectedReading();
    }
  };

  const handleStop = () => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    clearWordTimer();
    setStatus('idle');
    setActiveChunkIndex(0);
    currentChunkIndexRef.current = 0;
    setActiveSentenceText('');
    setActiveWordCharIndex(-1);
    setCurrentLabel('Lectura detenida');
  };

  const handleJumpToChunk = (chunkIdx: number) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    let queue = chunksMetaRef.current;
    if (queue.length === 0 && analysis) {
      queue = buildAudiobookQueue(analysis, audiobookMode, currentPage, currentChapterTitle);
      chunksMetaRef.current = queue;
      setTotalChunks(queue.length);
    }
    if (chunkIdx < 0 || chunkIdx >= queue.length) return;
    window.speechSynthesis.cancel();
    clearWordTimer();
    setStatus('playing');
    setTimeout(() => speakChunkAt(chunkIdx, audiobookMode), 35);
  };

  const handleNextChapter = () => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    let queue = chunksMetaRef.current;
    if (queue.length === 0 && analysis) {
      queue = buildAudiobookQueue(analysis, audiobookMode, currentPage, currentChapterTitle);
      chunksMetaRef.current = queue;
    }
    if (queue.length === 0) return;

    const currentCh = queue[currentChunkIndexRef.current]?.chapterNumber || 1;
    const nextIdx = queue.findIndex(
      (item, idx) => idx > currentChunkIndexRef.current && item.chapterNumber > currentCh
    );

    const targetIndex =
      nextIdx !== -1
        ? nextIdx
        : Math.min(queue.length - 1, currentChunkIndexRef.current + 5);

    window.speechSynthesis.cancel();
    clearWordTimer();
    setStatus('playing');
    setTimeout(() => speakChunkAt(targetIndex, audiobookMode), 50);
  };

  const handlePrevChapter = () => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    let queue = chunksMetaRef.current;
    if (queue.length === 0 && analysis) {
      queue = buildAudiobookQueue(analysis, audiobookMode, currentPage, currentChapterTitle);
      chunksMetaRef.current = queue;
    }
    if (queue.length === 0) return;

    const currentCh = queue[currentChunkIndexRef.current]?.chapterNumber || 1;
    const prevChapterNum = Math.max(1, currentCh - 1);
    const prevIdx = queue.findIndex((item) => item.chapterNumber === prevChapterNum);

    const targetIndex =
      prevIdx !== -1 ? prevIdx : Math.max(0, currentChunkIndexRef.current - 5);

    window.speechSynthesis.cancel();
    clearWordTimer();
    setStatus('playing');
    setTimeout(() => speakChunkAt(targetIndex, audiobookMode), 50);
  };

  const handleRateChange = (newRate: number) => {
    setRate(newRate);
    try {
      localStorage.setItem(STORAGE_TTS_RATE_KEY, String(newRate));
    } catch {
      // ignore
    }
    if (status === 'playing') {
      window.speechSynthesis.cancel();
      clearWordTimer();
      setTimeout(() => speakChunkAt(currentChunkIndexRef.current, audiobookMode), 60);
    }
  };

  const handleVoicePresetChange = (preset: VoiceRegionPreset) => {
    setVoicePreset(preset);
    try {
      localStorage.setItem(STORAGE_TTS_PRESET_KEY, preset);
    } catch {
      // ignore
    }

    const presetObj = VOICE_PRESETS.find((p) => p.id === preset);
    if (presetObj && voices.length > 0) {
      let matched: SpeechSynthesisVoice | undefined;
      for (const code of presetObj.langCodes) {
        matched = voices.find((v) => v.lang.toLowerCase().startsWith(code));
        if (matched) break;
      }
      if (matched) {
        setSelectedVoiceURI(matched.voiceURI);
        try {
          localStorage.setItem(STORAGE_TTS_VOICE_KEY, matched.voiceURI);
        } catch {
          // ignore
        }
      }
    }

    if (status === 'playing') {
      window.speechSynthesis.cancel();
      clearWordTimer();
      setTimeout(() => speakChunkAt(currentChunkIndexRef.current, audiobookMode), 60);
    }
  };

  const handleVoiceChange = (uri: string) => {
    setSelectedVoiceURI(uri);
    try {
      localStorage.setItem(STORAGE_TTS_VOICE_KEY, uri);
    } catch {
      // ignore
    }
    if (status === 'playing') {
      window.speechSynthesis.cancel();
      clearWordTimer();
      setTimeout(() => speakChunkAt(currentChunkIndexRef.current, audiobookMode), 60);
    }
  };

  // Real-time progress, elapsed time, and remaining time calculations
  const progressMetrics = useMemo(() => {
    const queue =
      chunksMetaRef.current.length > 0
        ? chunksMetaRef.current
        : selectedModePreview.previewQueue;
    const wordsPerMinute = 165 * rate;

    if (queue.length === 0) {
      const estTotalMin = Math.max(
        1,
        Math.round((selectedModePreview.wordsCount || 300) / wordsPerMinute)
      );
      return {
        percent: 0,
        elapsedText: '0 min 0 s',
        remainingText: `${estTotalMin} min restantes`,
        visualBar: '░░░░░░░░░░░░',
      };
    }

    const clampedIdx = Math.min(activeChunkIndex, queue.length);
    const percent = Math.min(
      100,
      Math.round((clampedIdx / Math.max(1, queue.length)) * 100)
    );

    const wordsRead = queue
      .slice(0, clampedIdx)
      .reduce((acc, item) => acc + item.wordCount, 0);
    const wordsRemaining = queue
      .slice(clampedIdx)
      .reduce((acc, item) => acc + item.wordCount, 0);

    const elapsedMin = Math.floor(wordsRead / wordsPerMinute);
    const elapsedSec = Math.round((wordsRead / wordsPerMinute - elapsedMin) * 60);
    const remainingMin = Math.max(0, Math.ceil(wordsRemaining / wordsPerMinute));

    const filledBlocks = Math.round((percent / 100) * 12);
    const emptyBlocks = Math.max(0, 12 - filledBlocks);
    const visualBar = '█'.repeat(filledBlocks) + '░'.repeat(emptyBlocks);

    return {
      percent,
      elapsedText:
        elapsedMin > 0 ? `${elapsedMin} min ${elapsedSec} s` : `${elapsedSec} s`,
      remainingText:
        remainingMin <= 0 && percent >= 100
          ? '0 min restantes'
          : `${remainingMin} min restantes`,
      visualBar,
    };
  }, [activeChunkIndex, totalChunks, rate, selectedModePreview]);

  // Notify parent App.tsx of live visual reading state so expanded chapters in the main canvas also highlight & auto-scroll
  useEffect(() => {
    if (!onLiveVisualStateChange) return;
    onLiveVisualStateChange({
      isPlaying: status === 'playing',
      status,
      audiobookMode,
      activeChunkIndex,
      totalChunks,
      chapterNumber: currentChapterNumber,
      chapterTitle: currentChapterTitle,
      subtitleText: currentSubtitleText,
      paragraphIndex: currentParagraphIndex,
      pageNumber: currentPage,
      totalPages,
      segmentType: currentSegmentType,
      activeSentenceText,
      activeWordCharIndex,
      activeWordCharLength,
      percent: progressMetrics.percent,
    });
  }, [
    onLiveVisualStateChange,
    status,
    audiobookMode,
    activeChunkIndex,
    totalChunks,
    currentChapterNumber,
    currentChapterTitle,
    currentSubtitleText,
    currentParagraphIndex,
    currentPage,
    totalPages,
    currentSegmentType,
    activeSentenceText,
    activeWordCharIndex,
    activeWordCharLength,
    progressMetrics.percent,
  ]);

  // Auto-scroll active sentence inside the fullscreen immersive reader AND main document viewer
  useEffect(() => {
    if (!autoFollowScroll || status !== 'playing') return;
    if (activeSentenceElementRef.current) {
      activeSentenceElementRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }, [activeChunkIndex, status, autoFollowScroll, isImmersiveReaderOpen]);

  // Group chunks into Chapters -> Paragraphs -> Sentences for the Fullscreen Immersive Visual Reader
  const structuredImmersiveChapters = useMemo(() => {
    const queue =
      chunksMetaRef.current.length > 0
        ? chunksMetaRef.current
        : selectedModePreview.previewQueue;

    const chaptersMap = new Map<
      number,
      {
        chapterNumber: number;
        chapterTitle: string;
        subtitleText: string;
        pageStart: number;
        paragraphs: Map<
          number,
          {
            paragraphIndex: number;
            subtitleText?: string;
            isSubtitleBlock: boolean;
            chunks: Array<{ chunkIndex: number; meta: AudioChunkMeta }>;
          }
        >;
      }
    >();

    queue.forEach((meta, idx) => {
      const chKey = meta.chapterNumber || 1;
      if (!chaptersMap.has(chKey)) {
        chaptersMap.set(chKey, {
          chapterNumber: chKey,
          chapterTitle: meta.chapterTitle,
          subtitleText: meta.subtitleText || '',
          pageStart: meta.pageNumber,
          paragraphs: new Map(),
        });
      }
      const chGroup = chaptersMap.get(chKey)!;
      const pKey = meta.paragraphIndex || idx;
      if (!chGroup.paragraphs.has(pKey)) {
        chGroup.paragraphs.set(pKey, {
          paragraphIndex: pKey,
          subtitleText: meta.subtitleText,
          isSubtitleBlock: meta.segmentType === 'subtitle' || meta.segmentType === 'chapter',
          chunks: [],
        });
      }
      chGroup.paragraphs.get(pKey)!.chunks.push({ chunkIndex: idx, meta });
    });

    return Array.from(chaptersMap.values()).map((ch) => ({
      ...ch,
      paragraphsList: Array.from(ch.paragraphs.values()),
    }));
  }, [selectedModePreview.previewQueue, totalChunks, activeChunkIndex]);

  // Render live sentence with real-time word highlight
  const renderHighlightedSentence = (customSentence?: string, isCurrentActive = true) => {
    const textToRender = customSentence ?? activeSentenceText;
    if (!textToRender) {
      return (
        <span className="text-slate-400 italic">
          Selecciona qué deseas escuchar y presiona &ldquo;▶ Iniciar Lectura&rdquo; para iluminar cada capítulo, subtítulo, párrafo, oración y palabra en tiempo real.
        </span>
      );
    }

    if (
      !isCurrentActive ||
      activeWordCharIndex < 0 ||
      activeWordCharIndex >= textToRender.length
    ) {
      return <span>{textToRender}</span>;
    }

    const before = textToRender.slice(0, activeWordCharIndex);
    const word = textToRender.slice(
      activeWordCharIndex,
      activeWordCharIndex + Math.max(1, activeWordCharLength)
    );
    const after = textToRender.slice(
      activeWordCharIndex + Math.max(1, activeWordCharLength)
    );

    return (
      <span className="leading-relaxed">
        <span>{before}</span>
        <mark className="px-1.5 py-0.5 rounded-md font-extrabold bg-gradient-to-r from-[#2563EB] to-[#7C3AED] text-white shadow-sm transition-all duration-75">
          {word}
        </mark>
        <span>{after}</span>
      </span>
    );
  };

  return (
    <>
      {/* =========================================================================
          FULLSCREEN IMMERSIVE VISUAL DOCUMENT READER (LECTURA VISUAL INTELIGENTE)
          Opens automatically when user triggers "🎧 Escuchar Documento Completo"
         ========================================================================= */}
      {isImmersiveReaderOpen && analysis && (
        <div
          className={`fixed inset-0 z-50 flex flex-col transition-colors duration-300 print:hidden ${
            isDark
              ? 'bg-slate-950/98 text-slate-100'
              : 'bg-slate-50/98 text-slate-900'
          } backdrop-blur-2xl`}
        >
          {/* Top Immersive Bar */}
          <div
            className={`px-4 sm:px-6 py-3.5 border-b flex flex-wrap items-center justify-between gap-4 shrink-0 ${
              isDark
                ? 'bg-slate-900/90 border-slate-800'
                : 'bg-white/95 border-slate-200 shadow-2xs'
            }`}
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#2563EB] via-[#7C3AED] to-[#06B6D4] text-white flex items-center justify-center shrink-0 shadow-md">
                <Headphones className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-mono font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-md bg-blue-600 text-white">
                    🎧 LECTURA VISUAL INTELIGENTE EN VIVO
                  </span>
                  {status === 'playing' && (
                    <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-500 font-bold flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                      SIGUIENDO LA VOZ
                    </span>
                  )}
                </div>
                <h2 className="text-sm sm:text-base font-extrabold font-display truncate mt-0.5">
                  {analysis.documentTitle}
                </h2>
              </div>
            </div>

            {/* Color Legend for Visual Hierarchy */}
            <div className="hidden xl:flex items-center gap-3 text-xs font-mono px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100/70 dark:bg-slate-950/70">
              <span className="flex items-center gap-1.5 font-bold text-blue-600 dark:text-blue-400">
                <span>🟦</span> Capítulo actual
              </span>
              <span className="text-slate-300 dark:text-slate-700">|</span>
              <span className="flex items-center gap-1.5 font-bold text-purple-600 dark:text-purple-400">
                <span>🟪</span> Subtítulo actual
              </span>
              <span className="text-slate-300 dark:text-slate-700">|</span>
              <span className="flex items-center gap-1.5 font-bold text-emerald-600 dark:text-emerald-400">
                <span>🟩</span> Párrafo actual
              </span>
              <span className="text-slate-300 dark:text-slate-700">|</span>
              <span className="flex items-center gap-1.5 font-bold text-amber-600 dark:text-amber-400">
                <span>🟨</span> Oración actual
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setAutoFollowScroll((prev) => !prev)}
                className={`px-3 py-2 rounded-xl text-xs font-bold border transition cursor-pointer flex items-center gap-1.5 ${
                  autoFollowScroll
                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                    : isDark
                    ? 'bg-slate-800 border-slate-700 text-slate-300'
                    : 'bg-white border-slate-200 text-slate-700'
                }`}
                title="Hacer scroll automático siguiendo la lectura en tiempo real"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>{autoFollowScroll ? 'Scroll Automático: ON' : 'Scroll Automático: OFF'}</span>
              </button>

              <button
                type="button"
                onClick={() => setIsImmersiveReaderOpen(false)}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition cursor-pointer flex items-center gap-1.5 ${
                  isDark
                    ? 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-100'
                    : 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-800'
                }`}
              >
                <Minimize2 className="w-3.5 h-3.5" />
                <span>Volver al Editor</span>
              </button>
            </div>
          </div>

          {/* Live Status Banner with Active Chapter, Subtitle, Page & Progress */}
          <div
            className={`px-4 sm:px-6 py-2.5 border-b flex flex-wrap items-center justify-between gap-3 text-xs shrink-0 ${
              isDark
                ? 'bg-blue-950/30 border-slate-800 text-slate-200'
                : 'bg-blue-50/80 border-blue-200/80 text-slate-800'
            }`}
          >
            <div className="flex flex-wrap items-center gap-2 sm:gap-4">
              <span className="px-2.5 py-1 rounded-lg bg-blue-600/20 border border-blue-500/40 text-blue-700 dark:text-blue-300 font-bold">
                🟦 {currentChapterTitle}
              </span>
              {currentSubtitleText && (
                <span className="px-2.5 py-1 rounded-lg bg-purple-600/15 border border-purple-500/40 text-purple-700 dark:text-purple-300 font-semibold truncate max-w-xs sm:max-w-md">
                  🟪 {currentSubtitleText}
                </span>
              )}
              <span className="font-mono text-slate-500 dark:text-slate-400">
                📄 Página {currentPage} de {totalPages}
              </span>
            </div>

            <div className="flex items-center gap-3 font-mono">
              <span className="font-bold text-blue-600 dark:text-cyan-400">
                {progressMetrics.visualBar} {progressMetrics.percent}%
              </span>
              <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                {progressMetrics.remainingText}
              </span>
            </div>
          </div>

          {/* Main Immersive Body: Left Chapter Outline + Center Full Document Stream */}
          <div className="flex-1 flex min-h-0 overflow-hidden">
            {/* Left Sidebar: All Chapters Expanded & Interactive */}
            <aside
              className={`hidden lg:flex w-80 shrink-0 border-r flex-col overflow-y-auto p-4 space-y-3 ${
                isDark ? 'bg-slate-900/60 border-slate-800' : 'bg-white border-slate-200'
              }`}
            >
              <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
                <div className="text-xs font-mono uppercase tracking-wider font-bold text-slate-400 flex items-center gap-1.5">
                  <ListOrdered className="w-3.5 h-3.5 text-blue-500" />
                  <span>Capítulos Desplegados ({structuredImmersiveChapters.length})</span>
                </div>
              </div>

              <div className="space-y-2">
                {structuredImmersiveChapters.map((ch) => {
                  const isCurrentCh = ch.chapterNumber === currentChapterNumber;
                  const firstChunkIdx =
                    ch.paragraphsList[0]?.chunks[0]?.chunkIndex ?? 0;

                  return (
                    <button
                      key={ch.chapterNumber}
                      type="button"
                      onClick={() => handleJumpToChunk(firstChunkIdx)}
                      className={`w-full text-left p-3 rounded-xl border transition-all cursor-pointer ${
                        isCurrentCh
                          ? isDark
                            ? 'bg-blue-950/70 border-blue-500 text-blue-200 shadow-md ring-2 ring-blue-500/30'
                            : 'bg-blue-50 border-blue-500 text-blue-950 shadow-sm ring-2 ring-blue-500/20'
                          : isDark
                          ? 'bg-slate-950/60 border-slate-800/90 text-slate-300 hover:bg-slate-800/70'
                          : 'bg-slate-50 border-slate-200/80 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <div className="flex items-center justify-between text-[10px] font-mono mb-1">
                        <span className="font-bold text-blue-600 dark:text-blue-400">
                          🟦 CAPÍTULO {ch.chapterNumber}
                        </span>
                        <span>Pág. {ch.pageStart}</span>
                      </div>
                      <div className="text-xs font-bold font-display leading-snug">
                        {ch.chapterTitle}
                      </div>
                      {ch.subtitleText && (
                        <div className="text-[11px] text-purple-600 dark:text-purple-400 mt-1 truncate">
                          🟪 {ch.subtitleText}
                        </div>
                      )}
                      {isCurrentCh && status === 'playing' && (
                        <div className="mt-2 flex items-center gap-1.5 text-[10px] font-mono font-bold text-emerald-500">
                          <Volume2 className="w-3 h-3 animate-bounce" />
                          <span>LEYENDO ESTE CAPÍTULO AHORA</span>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </aside>

            {/* Center Full Document Viewer with Real-Time Multi-Level Highlighting */}
            <div
              ref={immersiveScrollContainerRef}
              className="flex-1 overflow-y-auto p-4 sm:p-8 lg:p-10 space-y-8"
            >
              <div className="max-w-4xl mx-auto space-y-8 pb-24">
                {structuredImmersiveChapters.map((ch) => {
                  const isCurrentChapter = ch.chapterNumber === currentChapterNumber;

                  return (
                    <section
                      key={ch.chapterNumber}
                      className={`rounded-2xl border-2 p-6 sm:p-8 transition-all duration-300 space-y-5 ${
                        isCurrentChapter
                          ? isDark
                            ? 'bg-blue-950/25 border-blue-500 shadow-xl shadow-blue-950/30'
                            : 'bg-blue-50/50 border-blue-500 shadow-lg shadow-blue-500/10'
                          : isDark
                          ? 'bg-slate-900/70 border-slate-800/80'
                          : 'bg-white border-slate-200'
                      }`}
                    >
                      {/* 🟦 Chapter Header Highlight */}
                      <div
                        className={`p-4 rounded-xl border transition-all ${
                          isCurrentChapter
                            ? isDark
                              ? 'bg-blue-600/20 border-blue-400/60 text-blue-100'
                              : 'bg-blue-100/90 border-blue-400 text-blue-950'
                            : isDark
                            ? 'bg-slate-950/60 border-slate-800 text-slate-200'
                            : 'bg-slate-50 border-slate-200 text-slate-800'
                        }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                          <span className="text-xs font-mono font-extrabold uppercase tracking-wider text-blue-600 dark:text-blue-400 flex items-center gap-1.5">
                            <span>🟦 CAPÍTULO {ch.chapterNumber}</span>
                            {isCurrentChapter && (
                              <span className="px-2 py-0.5 rounded bg-blue-600 text-white text-[10px]">
                                EN LECTURA ACTIVA
                              </span>
                            )}
                          </span>
                          <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
                            Página {ch.pageStart} de {totalPages}
                          </span>
                        </div>
                        <h3 className="text-lg sm:text-xl font-extrabold font-display">
                          {ch.chapterTitle}
                        </h3>

                        {/* 🟪 Subtitle Highlight */}
                        {ch.subtitleText && (
                          <div
                            className={`mt-3 p-3 rounded-lg border text-xs sm:text-sm font-semibold transition-all ${
                              isCurrentChapter
                                ? isDark
                                  ? 'bg-purple-950/60 border-purple-500/60 text-purple-200'
                                  : 'bg-purple-100/80 border-purple-300 text-purple-950'
                                : isDark
                                ? 'bg-slate-900 border-slate-800 text-slate-400'
                                : 'bg-white border-slate-200 text-slate-600'
                            }`}
                          >
                            <span className="font-mono text-[11px] uppercase tracking-wider font-bold text-purple-600 dark:text-purple-400 block mb-0.5">
                              🟪 Subtítulo / Síntesis de Sección
                            </span>
                            {ch.subtitleText}
                          </div>
                        )}
                      </div>

                      {/* 🟩 Paragraphs & 🟨 Sentences Stream */}
                      <div className="space-y-4">
                        {ch.paragraphsList.map((para) => {
                          const isCurrentParagraph =
                            para.chunks.some((c) => c.chunkIndex === activeChunkIndex);

                          return (
                            <div
                              key={para.paragraphIndex}
                              className={`p-4 rounded-xl border transition-all duration-300 leading-relaxed text-sm sm:text-base ${
                                para.isSubtitleBlock
                                  ? isCurrentParagraph
                                    ? isDark
                                      ? 'bg-purple-950/60 border-purple-400 text-purple-100 font-bold shadow-md'
                                      : 'bg-purple-100 border-purple-400 text-purple-950 font-bold shadow-xs'
                                    : isDark
                                    ? 'bg-purple-950/20 border-purple-900/40 text-purple-300 font-semibold'
                                    : 'bg-purple-50/60 border-purple-200 text-purple-900 font-semibold'
                                  : isCurrentParagraph
                                  ? isDark
                                    ? 'bg-emerald-950/45 border-emerald-500/80 text-slate-100 shadow-md ring-1 ring-emerald-500/30'
                                    : 'bg-emerald-50/90 border-emerald-400 text-slate-900 shadow-sm ring-1 ring-emerald-400/30'
                                  : isDark
                                  ? 'bg-slate-950/40 border-slate-800/70 text-slate-300'
                                  : 'bg-slate-50/60 border-slate-200/70 text-slate-700'
                              }`}
                            >
                              {isCurrentParagraph && (
                                <div className="flex items-center justify-between text-[11px] font-mono font-bold mb-2 pb-1.5 border-b border-emerald-500/20 text-emerald-600 dark:text-emerald-400">
                                  <span>
                                    {para.isSubtitleBlock
                                      ? '🟪 SUBTÍTULO ACTUAL EN VOZ'
                                      : '🟩 PÁRRAFO ACTUAL EN LECTURA'}
                                  </span>
                                  <span>Haz clic en cualquier oración para saltar aquí</span>
                                </div>
                              )}

                              <p className="space-x-1.5 leading-relaxed">
                                {para.chunks.map(({ chunkIndex, meta }) => {
                                  const isCurrentSentence = chunkIndex === activeChunkIndex;

                                  return (
                                    <span
                                      key={chunkIndex}
                                      ref={
                                        isCurrentSentence ? activeSentenceElementRef : null
                                      }
                                      onClick={() => handleJumpToChunk(chunkIndex)}
                                      title="Haz clic para escuchar desde esta oración exacta"
                                      className={`inline rounded-md px-1.5 py-0.5 transition-all cursor-pointer ${
                                        isCurrentSentence
                                          ? isDark
                                            ? 'bg-amber-400/25 border border-amber-400/80 text-amber-100 font-semibold shadow-xs'
                                            : 'bg-amber-200/90 border border-amber-400 text-slate-950 font-semibold shadow-xs'
                                          : 'hover:bg-blue-500/10'
                                      }`}
                                    >
                                      {isCurrentSentence && (
                                        <span className="font-mono text-[10px] font-extrabold uppercase px-1 py-0.5 mr-1 rounded bg-amber-500 text-slate-950">
                                          🟨 Oración
                                        </span>
                                      )}
                                      {renderHighlightedSentence(
                                        meta.text,
                                        isCurrentSentence
                                      )}
                                    </span>
                                  );
                                })}
                              </p>
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Bottom Docked Playback Controls Bar in Immersive View */}
          <div
            className={`px-4 sm:px-6 py-3.5 border-t flex flex-wrap items-center justify-between gap-4 shrink-0 ${
              isDark
                ? 'bg-slate-900/95 border-slate-800'
                : 'bg-white/95 border-slate-200 shadow-lg'
            }`}
          >
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handlePrevChapter}
                className={`px-3 py-2 rounded-xl text-xs font-bold border transition cursor-pointer flex items-center gap-1.5 ${
                  isDark
                    ? 'border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200'
                    : 'border-slate-200 bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
              >
                <SkipBack className="w-3.5 h-3.5" />
                <span>⏮ Cap. Anterior</span>
              </button>

              {status !== 'playing' ? (
                <button
                  type="button"
                  onClick={() =>
                    status === 'paused'
                      ? handleResume()
                      : handleStartSelectedReading('full-document', true)
                  }
                  className="px-5 py-2 rounded-xl text-xs font-extrabold bg-gradient-to-r from-[#2563EB] via-[#7C3AED] to-[#06B6D4] text-white hover:opacity-95 transition cursor-pointer flex items-center gap-1.5 shadow-md"
                >
                  <Play className="w-4 h-4 fill-current" />
                  <span>{status === 'paused' ? '▶ Continuar' : '▶ Iniciar Lectura'}</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handlePause}
                  className="px-5 py-2 rounded-xl text-xs font-extrabold bg-amber-500 hover:bg-amber-600 text-slate-950 transition cursor-pointer flex items-center gap-1.5 shadow-md"
                >
                  <Pause className="w-4 h-4" />
                  <span>⏸ Pausar</span>
                </button>
              )}

              <button
                type="button"
                onClick={handleStop}
                disabled={status === 'idle'}
                className="px-3 py-2 rounded-xl text-xs font-bold border border-rose-500/40 bg-rose-500/10 text-rose-500 hover:bg-rose-500/20 disabled:opacity-40 transition cursor-pointer flex items-center gap-1"
              >
                <Square className="w-3.5 h-3.5" />
                <span>⏹ Detener</span>
              </button>

              <button
                type="button"
                onClick={handleNextChapter}
                className={`px-3 py-2 rounded-xl text-xs font-bold border transition cursor-pointer flex items-center gap-1.5 ${
                  isDark
                    ? 'border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200'
                    : 'border-slate-200 bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
              >
                <span>⏭ Saltar Cap.</span>
                <SkipForward className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-mono text-slate-400">Velocidad:</span>
              {SPEED_OPTIONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => handleRateChange(r)}
                  className={`px-2 py-1 rounded-lg text-xs font-mono font-bold transition cursor-pointer ${
                    rate === r
                      ? 'bg-[#2563EB] text-white'
                      : isDark
                      ? 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {r}x
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          FLOATING AUDIO WIDGET (BOTTOM RIGHT)
         ========================================================================= */}
      {isMinimized ? (
        <button
          type="button"
          onClick={() => setIsMinimized(false)}
          className="fixed bottom-5 right-5 z-40 px-5 py-3 rounded-full font-extrabold text-xs tracking-wide bg-gradient-to-r from-[#2563EB] via-[#7C3AED] to-[#06B6D4] text-white shadow-xl hover:opacity-95 transition-all flex items-center gap-2 cursor-pointer print:hidden"
          aria-label="Abrir menú flotante de lectura por voz"
        >
          <Headphones className="w-4 h-4" />
          <span>🎧 ESCUCHAR</span>
          {status === 'playing' && (
            <span className="px-1.5 py-0.5 text-[10px] font-mono rounded-full bg-white/20">
              {progressMetrics.percent}%
            </span>
          )}
        </button>
      ) : (
        <div
          className={`fixed bottom-4 right-4 z-40 w-[355px] sm:w-[435px] max-h-[90vh] overflow-y-auto rounded-2xl border backdrop-blur-xl transition-all duration-300 shadow-2xl print:hidden ${
            isDark
              ? 'bg-[#111827]/95 border-[#1E293B] text-slate-100 shadow-black/60'
              : 'bg-white/95 border-[#E2E8F0] text-slate-900 shadow-slate-900/15'
          }`}
        >
          {/* Header Bar with Floating Button Trigger 🎧 ESCUCHAR */}
          <div className="px-4 py-3 border-b border-slate-200/80 dark:border-slate-800 flex items-center justify-between gap-2 sticky top-0 z-10 backdrop-blur-md bg-inherit">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#2563EB] via-[#7C3AED] to-[#06B6D4] text-white flex items-center justify-center shrink-0 shadow-xs">
                <Headphones className="w-4 h-4" />
              </div>
              <div className="truncate">
                <div className="text-xs font-extrabold font-display flex items-center gap-1.5">
                  <span>🎧 ESCUCHAR</span>
                  {status === 'playing' && (
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-500">
                      EN VIVO
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                  {currentLabel}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1">
              {analysis && (
                <button
                  type="button"
                  onClick={() => setIsImmersiveReaderOpen(true)}
                  className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-blue-600/15 text-blue-600 dark:text-cyan-400 hover:bg-blue-600/25 transition flex items-center gap-1 cursor-pointer"
                  title="Abrir vista de lectura inmersiva a pantalla completa con resaltado en tiempo real"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                  <span>Lectura Visual</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsMinimized(true)}
                className="p-1.5 rounded-lg hover:bg-slate-200/60 dark:hover:bg-slate-800 text-slate-400 cursor-pointer"
                aria-label="Minimizar reproductor de audio a botón flotante 🎧 ESCUCHAR"
                title="Minimizar a botón 🎧 ESCUCHAR"
              >
                <ChevronDown className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="p-4 space-y-3.5">
            {/* IndexedDB Automatic Resume Prompt Banner */}
            {showResumePrompt && savedResumeRecord && (
              <div
                className={`p-3 rounded-xl border text-xs space-y-2 ${
                  isDark
                    ? 'bg-blue-950/50 border-blue-500/40 text-blue-100'
                    : 'bg-blue-50 border-blue-200 text-blue-900'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="font-bold flex items-center gap-1.5">
                    <RotateCcw className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                    <span>¿Deseas continuar la lectura desde donde la dejaste?</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowResumePrompt(false)}
                    className="text-slate-400 hover:text-slate-600 cursor-pointer"
                    aria-label="Cerrar aviso"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-300 space-y-0.5">
                  <div className="truncate">
                    📖 <strong>{savedResumeRecord.documentTitle}</strong>
                  </div>
                  <div>
                    📚 {savedResumeRecord.chapterTitle} · 📄 Pág.{' '}
                    {savedResumeRecord.pageNumber} ({savedResumeRecord.percentCompleted}%)
                  </div>
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleConfirmResumeReading}
                    className="flex-1 py-1.5 px-3 rounded-lg text-[11px] font-bold bg-[#2563EB] hover:bg-blue-700 text-white transition cursor-pointer"
                  >
                    ▶ Sí, continuar lectura
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowResumePrompt(false);
                      idbDeleteAudioReadingProgress(savedResumeRecord.documentId).catch(
                        () => {}
                      );
                    }}
                    className="py-1.5 px-2.5 rounded-lg text-[11px] font-medium border border-slate-300 dark:border-slate-700 hover:bg-slate-200/50 dark:hover:bg-slate-800 transition cursor-pointer"
                  >
                    Empezar de cero
                  </button>
                </div>
              </div>
            )}

            {/* Prominent Button: 🎧 Escuchar Documento Completo (Opens Fullscreen Visual Reader & Expands All Chapters) */}
            <button
              type="button"
              disabled={!analysis}
              onClick={() => handleStartSelectedReading('full-document', true)}
              className="w-full py-3 px-4 rounded-xl text-xs sm:text-sm font-extrabold tracking-wide bg-gradient-to-r from-[#2563EB] via-[#7C3AED] to-[#06B6D4] text-white hover:opacity-95 disabled:opacity-40 transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-blue-600/25"
            >
              <Headphones className="w-4 h-4" />
              <span>🎧 Escuchar Documento Completo</span>
            </button>

            {/* Quick Radio Selector: ¿Qué deseas escuchar? */}
            <div
              className={`p-3 rounded-xl border space-y-2 ${
                isDark
                  ? 'bg-slate-900/70 border-slate-800'
                  : 'bg-slate-50/90 border-slate-200/80'
              }`}
            >
              <div className="text-xs font-bold flex items-center justify-between">
                <span>¿Qué deseas escuchar?</span>
                <span className="text-[10px] font-mono text-blue-600 dark:text-cyan-400">
                  Selección rápida
                </span>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {FLOATING_RADIO_OPTIONS.map((opt) => {
                  const isSelected = audiobookMode === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      disabled={!analysis}
                      onClick={() => handleSelectAudiobookMode(opt.id, false)}
                      className={`text-left px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border transition flex items-center gap-1.5 cursor-pointer disabled:opacity-40 ${
                        isSelected
                          ? 'bg-blue-600/15 border-blue-500 text-[#2563EB] dark:text-[#06B6D4]'
                          : isDark
                          ? 'bg-slate-950/60 border-slate-800 text-slate-300 hover:bg-slate-800'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <span className="font-mono text-xs">
                        {isSelected ? '●' : '○'}
                      </span>
                      <span className="truncate">{opt.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Dropdown Menu Button: 🎧 Escuchar Documento */}
            <div className="relative">
              <button
                type="button"
                disabled={!analysis}
                onClick={() => setIsOptionsMenuOpen((prev) => !prev)}
                className={`w-full py-2.5 px-3.5 rounded-xl text-xs font-bold border transition-all flex items-center justify-between gap-2 cursor-pointer disabled:opacity-40 ${
                  isDark
                    ? 'bg-slate-900 border-slate-700 text-slate-100 hover:bg-slate-800'
                    : 'bg-slate-100 border-slate-300 text-slate-800 hover:bg-slate-200/70'
                }`}
              >
                <span className="flex items-center gap-2 truncate">
                  <span>🎧 Escuchar Documento</span>
                  <span className="text-[11px] font-normal text-slate-500 dark:text-slate-400 truncate">
                    ({selectedModePreview.listeningTitle})
                  </span>
                </span>
                {isOptionsMenuOpen ? (
                  <ChevronUp className="w-4 h-4 shrink-0" />
                ) : (
                  <ChevronDown className="w-4 h-4 shrink-0" />
                )}
              </button>

              {isOptionsMenuOpen && (
                <div
                  className={`mt-1.5 p-1.5 rounded-xl border shadow-xl space-y-1 ${
                    isDark
                      ? 'bg-slate-950 border-slate-800 text-slate-100'
                      : 'bg-white border-slate-200 text-slate-800'
                  }`}
                >
                  {AUDIOBOOK_MODES.slice(0, 7).map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => handleSelectAudiobookMode(m.id, false)}
                      className={`w-full text-left px-3 py-2 rounded-lg text-xs font-semibold transition flex items-center justify-between cursor-pointer ${
                        audiobookMode === m.id
                          ? 'bg-blue-600/15 text-[#2563EB] dark:text-[#06B6D4] border border-blue-500/30'
                          : isDark
                          ? 'hover:bg-slate-800/80 text-slate-200'
                          : 'hover:bg-slate-100 text-slate-700'
                      }`}
                    >
                      <span>{m.label}</span>
                      {audiobookMode === m.id && (
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-blue-600 text-white">
                          Elegido
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Guided Tour Banner when user selects 📖 Leer Todo el Documento */}
            {(showFullDocTourNotice || audiobookMode === 'full-document') && analysis && (
              <div
                className={`p-3 rounded-xl border text-xs flex items-start gap-2.5 ${
                  isDark
                    ? 'bg-indigo-950/40 border-indigo-500/40 text-indigo-200'
                    : 'bg-indigo-50 border-indigo-200 text-indigo-950'
                }`}
              >
                <Info className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
                <div className="flex-1 leading-relaxed">
                  <div className="font-bold text-[11px] uppercase tracking-wider text-indigo-500 mb-0.5">
                    Lectura Visual Inteligente
                  </div>
                  <span>
                    &ldquo;El sistema abrirá el visor completo, expandirá los capítulos y resaltará en tiempo real: 🟦 Capítulo, 🟪 Subtítulo, 🟩 Párrafo y 🟨 Oración actual.&rdquo;
                  </span>
                </div>
              </div>
            )}

            {/* Always-Visible Summary Box: "Vas a escuchar:" */}
            <div
              className={`p-3.5 rounded-xl border space-y-2 ${
                isDark
                  ? 'bg-slate-900/90 border-slate-800'
                  : 'bg-slate-50 border-slate-200/90'
              }`}
            >
              <div className="text-[11px] font-mono uppercase tracking-wider text-slate-400">
                Vas a escuchar:
              </div>
              <div className="text-sm font-extrabold font-display text-[#2563EB] dark:text-[#06B6D4]">
                &ldquo;{selectedModePreview.listeningTitle}&rdquo;
              </div>
              <div className="grid grid-cols-3 gap-2 pt-1 text-[11px]">
                <div
                  className={`p-2 rounded-lg border ${
                    isDark
                      ? 'bg-slate-950/70 border-slate-800'
                      : 'bg-white border-slate-200/70'
                  }`}
                >
                  <div className="font-mono font-bold text-xs">
                    {selectedModePreview.pagesCount} páginas
                  </div>
                  <div className="text-[10px] text-slate-400">Extensión</div>
                </div>
                <div
                  className={`p-2 rounded-lg border ${
                    isDark
                      ? 'bg-slate-950/70 border-slate-800'
                      : 'bg-white border-slate-200/70'
                  }`}
                >
                  <div className="font-mono font-bold text-xs">
                    {selectedModePreview.wordsCount.toLocaleString('es-ES')} palabras
                  </div>
                  <div className="text-[10px] text-slate-400">Contenido</div>
                </div>
                <div
                  className={`p-2 rounded-lg border ${
                    isDark
                      ? 'bg-slate-950/70 border-slate-800'
                      : 'bg-white border-slate-200/70'
                  }`}
                >
                  <div className="font-mono font-bold text-xs text-emerald-600 dark:text-emerald-400">
                    {selectedModePreview.estimatedMinutes} minutos
                  </div>
                  <div className="text-[10px] text-slate-400">Duración estimada</div>
                </div>
              </div>
            </div>

            {/* Primary Action Button: ▶ Iniciar Lectura */}
            <button
              type="button"
              disabled={!analysis}
              onClick={() => handleStartSelectedReading()}
              className="w-full py-2.5 px-4 rounded-xl text-xs font-extrabold tracking-wide bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-40 transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>▶ Iniciar Lectura ({selectedModePreview.listeningTitle})</span>
            </button>

            {/* Visual Indicator: LEYENDO AHORA */}
            {analysis && (
              <div
                className={`p-3.5 rounded-xl border space-y-2.5 text-xs transition-colors ${
                  status === 'playing'
                    ? isDark
                      ? 'bg-blue-950/30 border-blue-500/50'
                      : 'bg-blue-50/70 border-blue-300'
                    : isDark
                    ? 'bg-slate-950/80 border-slate-800/90'
                    : 'bg-slate-50/90 border-slate-200/80'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-mono font-extrabold uppercase tracking-wider text-[#2563EB] dark:text-[#06B6D4]">
                    LEYENDO AHORA:
                  </span>
                  <span className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400 font-semibold">
                    {progressMetrics.remainingText}
                  </span>
                </div>

                {/* Multi-level Color Indicator Chips */}
                <div className="space-y-1.5">
                  <div className="px-2.5 py-1 rounded-lg bg-blue-600/15 border border-blue-500/30 text-blue-700 dark:text-blue-300 font-bold text-xs truncate">
                    🟦 {currentChapterTitle}
                  </div>
                  {currentSubtitleText && (
                    <div className="px-2.5 py-1 rounded-lg bg-purple-600/15 border border-purple-500/30 text-purple-700 dark:text-purple-300 font-semibold text-[11px] truncate">
                      🟪 {currentSubtitleText}
                    </div>
                  )}
                  <div className="flex items-center justify-between text-[11px] font-mono text-slate-500 dark:text-slate-300 px-1">
                    <span>🟩 Párrafo #{Math.max(1, currentParagraphIndex)}</span>
                    <span>📄 Página {currentPage} de {totalPages}</span>
                  </div>
                </div>

                {/* ASCII Block Progress + Bar */}
                <div className="font-mono text-xs tracking-wider font-bold text-[#2563EB] dark:text-[#06B6D4]">
                  {progressMetrics.visualBar} {progressMetrics.percent}%
                </div>

                <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-[#2563EB] via-[#7C3AED] to-[#06B6D4] transition-all duration-300"
                    style={{ width: `${progressMetrics.percent}%` }}
                  />
                </div>

                {/* 🟨 Highlighted Active Sentence & Word Box */}
                <div
                  className={`mt-2 p-3 rounded-xl border text-xs transition-all ${
                    status === 'playing'
                      ? isDark
                        ? 'bg-amber-950/35 border-amber-400/60 shadow-inner'
                        : 'bg-amber-50/90 border-amber-300 shadow-xs'
                      : isDark
                      ? 'bg-slate-900/95 border-slate-800'
                      : 'bg-white border-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between text-[10px] font-mono text-amber-600 dark:text-amber-400 mb-1">
                    <span className="font-bold">🟨 ORACIÓN ACTUAL EN LECTURA</span>
                    <span>{segmentKindLabel}</span>
                  </div>
                  <div className="text-xs leading-relaxed">
                    {renderHighlightedSentence()}
                  </div>
                </div>
              </div>
            )}

            {/* Primary Transport Controls: ▶ Iniciar | ⏸ Pausar | ▶ Continuar | ⏹ Detener */}
            <div className="grid grid-cols-4 gap-1.5">
              <button
                type="button"
                disabled={!analysis}
                onClick={() => handleStartSelectedReading()}
                className="px-2 py-2 rounded-lg text-[11px] font-semibold bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white transition flex items-center justify-center gap-1 cursor-pointer"
                title="Iniciar lectura de la opción seleccionada"
              >
                <BookOpen className="w-3 h-3" />
                <span>Iniciar</span>
              </button>

              <button
                type="button"
                onClick={handlePause}
                disabled={status !== 'playing'}
                className={`px-2 py-2 rounded-lg text-[11px] font-semibold border transition flex items-center justify-center gap-1 cursor-pointer ${
                  status === 'playing'
                    ? isDark
                      ? 'border-slate-700 bg-slate-800 text-amber-300 hover:bg-slate-700'
                      : 'border-slate-200 bg-slate-100 text-amber-700 hover:bg-slate-200'
                    : 'opacity-40 cursor-not-allowed border-slate-200 dark:border-slate-800'
                }`}
                title="Pausar lectura"
              >
                <Pause className="w-3 h-3" />
                <span>Pausar</span>
              </button>

              <button
                type="button"
                onClick={handleResume}
                disabled={status !== 'paused'}
                className={`px-2 py-2 rounded-lg text-[11px] font-semibold border transition flex items-center justify-center gap-1 cursor-pointer ${
                  status === 'paused'
                    ? isDark
                      ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                      : 'border-emerald-300 bg-emerald-50 text-emerald-700'
                    : 'opacity-40 cursor-not-allowed border-slate-200 dark:border-slate-800'
                }`}
                title="Continuar lectura"
              >
                <Play className="w-3 h-3" />
                <span>Continuar</span>
              </button>

              <button
                type="button"
                onClick={handleStop}
                disabled={status === 'idle'}
                className={`px-2 py-2 rounded-lg text-[11px] font-semibold border transition flex items-center justify-center gap-1 cursor-pointer ${
                  status !== 'idle'
                    ? isDark
                      ? 'border-rose-500/40 bg-rose-500/15 text-rose-300 hover:bg-rose-500/25'
                      : 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100'
                    : 'opacity-40 cursor-not-allowed border-slate-200 dark:border-slate-800'
                }`}
                title="Detener lectura"
              >
                <Square className="w-3 h-3" />
                <span>Detener</span>
              </button>
            </div>

            {/* Chapter Navigation Controls: ⏮ Capítulo Anterior | ⏭ Saltar Capítulo */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={!analysis}
                onClick={handlePrevChapter}
                className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold border transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40 ${
                  isDark
                    ? 'border-slate-800 bg-slate-900 hover:bg-slate-800 text-slate-200'
                    : 'border-slate-200 bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
                title="Ir al capítulo anterior"
              >
                <SkipBack className="w-3.5 h-3.5" />
                <span>⏮ Capítulo Anterior</span>
              </button>

              <button
                type="button"
                disabled={!analysis}
                onClick={handleNextChapter}
                className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold border transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40 ${
                  isDark
                    ? 'border-slate-800 bg-slate-900 hover:bg-slate-800 text-slate-200'
                    : 'border-slate-200 bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
                title="Saltar al siguiente capítulo"
              >
                <span>⏭ Saltar Capítulo</span>
                <SkipForward className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Speed Selector: 0.5x | 0.75x | 1x | 1.25x | 1.5x | 2x */}
            <div className="space-y-1 pt-0.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
                  Velocidad:
                </span>
                <div className="flex flex-wrap items-center gap-1">
                  {SPEED_OPTIONS.map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => handleRateChange(r)}
                      className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold transition cursor-pointer ${
                        rate === r
                          ? 'bg-[#2563EB] text-white'
                          : isDark
                          ? 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {r}x
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Voice Presets: Español Colombia | Español España | Inglés USA */}
            <div className="space-y-1.5">
              <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
                Voces:
              </div>
              <div className="grid grid-cols-3 gap-1">
                {VOICE_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handleVoicePresetChange(preset.id)}
                    className={`px-2 py-1.5 rounded-lg text-[10px] font-semibold border transition cursor-pointer truncate ${
                      voicePreset === preset.id
                        ? 'bg-[#2563EB] text-white border-[#2563EB]'
                        : isDark
                        ? 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
                        : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>

              {voices.length > 0 && (
                <select
                  value={selectedVoiceURI}
                  onChange={(e) => handleVoiceChange(e.target.value)}
                  aria-label="Seleccionar voz del sistema"
                  className={`w-full text-[11px] rounded-lg border px-2.5 py-1.5 outline-none ${
                    isDark
                      ? 'bg-slate-950 border-slate-800 text-slate-200'
                      : 'bg-slate-50 border-slate-200 text-slate-700'
                  }`}
                >
                  {voices.map((v) => (
                    <option key={v.voiceURI} value={v.voiceURI}>
                      🎙️ {v.name} ({v.lang})
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
