import React, { useEffect, useState, useCallback } from 'react';
import {
  Sparkles,
  ChevronRight,
  ChevronLeft,
  X,
  CheckCircle2,
  Compass,
  BookOpen,
  CreditCard,
  Award,
  MessageSquare,
  Code,
  Target,
} from 'lucide-react';
import { EditorSection } from '../types';

export interface GuidedTourStep {
  id: string;
  targetSelector: string;
  sectionToActivate?: EditorSection;
  badge: string;
  title: string;
  description: string;
  tip: string;
  icon: React.ReactNode;
}

interface GuidedTourOverlayProps {
  isOpen: boolean;
  currentStepIndex: number;
  onStepChange: (newStep: number) => void;
  onClose: () => void;
  onSelectSection: (section: EditorSection) => void;
  isDark: boolean;
  documentTitle?: string;
  detectedTopic?: string;
}

export const GUIDED_TOUR_STEPS: GuidedTourStep[] = [
  {
    id: 'step-topic-summary',
    targetSelector: '[data-tour="doc-header-banner"]',
    sectionToActivate: 'resumen',
    badge: 'PASO 1 DE 7 · MOTOR DOCUMENTAL',
    title: 'Tema Principal, Tesis y Resumen Ejecutivo Propio',
    description:
      '¡Tu primer documento fue procesado con éxito! JAIRRESTAURA IA DE ESTUDIO detectó automáticamente su Tema Principal y construyó un Resumen Ejecutivo nuevo con tesis central, hallazgos numerados y barra de progreso en tiempo real.',
    tip: 'Cada nuevo PDF o DOCX que subas generará contenido 100% único sin mezclar datos previos.',
    icon: <Target className="w-4 h-4 text-blue-500" />,
  },
  {
    id: 'step-chapters-concepts',
    targetSelector: '[data-tour="sidebar-content-group"]',
    sectionToActivate: 'capitulos',
    badge: 'PASO 2 DE 7 · ESTRUCTURA EDITORIAL',
    title: 'Capítulos, Conceptos Clave, Glosario y Mapa Conceptual',
    description:
      'En este bloque del menú lateral puedes explorar los capítulos extraídos de la estructura de tu archivo, el directorio de conceptos clave categorizados, el glosario alfabético y el Mapa Conceptual interactivo en SVG.',
    tip: 'Haz clic en "5. Mapa Conceptual" en cualquier momento para visualizar la red jerárquica de ideas.',
    icon: <BookOpen className="w-4 h-4 text-blue-500" />,
  },
  {
    id: 'step-course-generator',
    targetSelector: '[data-tour="nav-item-curso"]',
    sectionToActivate: 'curso',
    badge: 'PASO 3 DE 7 · GENERADOR DE CURSOS',
    title: 'Curso Interactivo Estilo Microsoft Learn & Coursera',
    description:
      'Tu documento se ha transformado automáticamente en un curso modular con unidades didácticas, objetivos de aprendizaje, narración por voz integrada, notas personales y certificado verificable.',
    tip: 'Marca cada unidad como completada para elevar tu porcentaje de avance global.',
    icon: <Compass className="w-4 h-4 text-emerald-500" />,
  },
  {
    id: 'step-flashcards-quiz',
    targetSelector: '[data-tour="sidebar-practice-group"]',
    sectionToActivate: 'flashcards',
    badge: 'PASO 4 DE 7 · PRÁCTICA ACTIVA',
    title: 'Flashcards 3D, Cuestionario Nuevo y Examen con Rúbrica',
    description:
      'Estudia con tarjetas interactivas de repetición espaciada, pon a prueba tu retención con el cuestionario autocalificable creado con distractores reales de tu documento, o genera más tarjetas y preguntas bajo demanda.',
    tip: 'Tus respuestas y tarjetas dominadas se guardan automáticamente en IndexedDB y LocalStorage.',
    icon: <CreditCard className="w-4 h-4 text-amber-500" />,
  },
  {
    id: 'step-grades-progress',
    targetSelector: '[data-tour="nav-item-calificaciones"]',
    sectionToActivate: 'calificaciones',
    badge: 'PASO 5 DE 7 · ANALÍTICA ACADÉMICA',
    title: 'Progreso de Aprendizaje y Boletín de Calificaciones',
    description:
      'Consulta tu promedio académico (escala 0 a 10 y letra A+, A, B), el desglose de dominio por documento cargado y descarga tu Boleta Académica oficial en formato PDF.',
    tip: 'La calificación pondera cuestionarios (60%), flashcards dominadas (20%) y unidades del curso (20%).',
    icon: <Award className="w-4 h-4 text-purple-500" />,
  },
  {
    id: 'step-ai-tutor-comparator',
    targetSelector: '[data-tour="header-tutor-button"]',
    sectionToActivate: 'chat',
    badge: 'PASO 6 DE 7 · TUTOR IA & COMPARADOR',
    title: 'Tutor IA con Gemini API y Comparador de Documentos',
    description:
      'Abre el Tutor IA lateral o la vista completa para hacer preguntas sobre el documento, pedir resúmenes por capítulo o conectar tu clave de Gemini API en LocalStorage. También puedes contrastar dos archivos en el Comparador.',
    tip: 'Usa las sugerencias rápidas del Tutor IA para evaluar tu comprensión del texto.',
    icon: <MessageSquare className="w-4 h-4 text-cyan-500" />,
  },
  {
    id: 'step-export-github',
    targetSelector: '[data-tour="export-toolbar"]',
    sectionToActivate: 'web',
    badge: 'PASO 7 DE 7 · EXPORTACIÓN & GITHUB PAGES',
    title: 'Exportación Real (PDF, HTML, MD, TXT) y Código index.html',
    description:
      'Descarga el informe completo en PDF binario (jsPDF), Markdown o TXT, o dirígete a "Código index.html" para copiar o descargar el sitio web estático 100% autocontenido listo para publicar en GitHub Pages.',
    tip: 'Puedes volver a abrir este tour guiado en cualquier momento desde el botón "Tour Guiado" de la barra superior.',
    icon: <Code className="w-4 h-4 text-emerald-500" />,
  },
];

interface SpotlightRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export const GuidedTourOverlay: React.FC<GuidedTourOverlayProps> = ({
  isOpen,
  currentStepIndex,
  onStepChange,
  onClose,
  onSelectSection,
  isDark,
  documentTitle,
  detectedTopic,
}) => {
  const [rect, setRect] = useState<SpotlightRect | null>(null);
  const step = GUIDED_TOUR_STEPS[currentStepIndex] || GUIDED_TOUR_STEPS[0];

  const updateSpotlightPosition = useCallback(() => {
    if (!isOpen) return;
    const el = document.querySelector(step.targetSelector) as HTMLElement | null;
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        setRect({
          top: Math.max(8, r.top - 6),
          left: Math.max(8, r.left - 6),
          width: Math.min(window.innerWidth - 16, r.width + 12),
          height: r.height + 12,
        });
        return;
      }
    }
    setRect(null);
  }, [isOpen, step.targetSelector]);

  useEffect(() => {
    if (!isOpen) return;
    if (step.sectionToActivate) {
      onSelectSection(step.sectionToActivate);
    }
    const timer = setTimeout(() => {
      updateSpotlightPosition();
    }, 180);

    window.addEventListener('resize', updateSpotlightPosition);
    window.addEventListener('scroll', updateSpotlightPosition, true);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', updateSpotlightPosition);
      window.removeEventListener('scroll', updateSpotlightPosition, true);
    };
  }, [isOpen, currentStepIndex, step.sectionToActivate, updateSpotlightPosition]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowRight') {
        if (currentStepIndex < GUIDED_TOUR_STEPS.length - 1) {
          onStepChange(currentStepIndex + 1);
        } else {
          onClose();
        }
      } else if (e.key === 'ArrowLeft' && currentStepIndex > 0) {
        onStepChange(currentStepIndex - 1);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, currentStepIndex, onStepChange, onClose]);

  if (!isOpen) return null;

  // Compute smart tooltip position near the highlighted element
  const getTooltipStyle = (): React.CSSProperties => {
    if (!rect || window.innerWidth < 768) {
      return {
        position: 'fixed',
        bottom: '20px',
        left: '50%',
        transform: 'translateX(-50%)',
        width: 'min(94vw, 460px)',
        zIndex: 90,
      };
    }

    const cardWidth = 440;
    const cardHeightEstimate = 310;
    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;

    // Prefer placing below target if space allows
    let top = rect.top + rect.height + 16;
    let left = Math.min(Math.max(16, rect.left), viewportW - cardWidth - 16);

    // If target is in left sidebar, place tooltip to the right of sidebar
    if (rect.left < 300 && rect.width < 340) {
      left = Math.min(rect.left + rect.width + 20, viewportW - cardWidth - 20);
      top = Math.min(Math.max(20, rect.top), viewportH - cardHeightEstimate - 20);
    } else if (top + cardHeightEstimate > viewportH - 16) {
      // Place above target
      top = Math.max(16, rect.top - cardHeightEstimate - 16);
    }

    return {
      position: 'fixed',
      top: `${top}px`,
      left: `${left}px`,
      width: `${cardWidth}px`,
      zIndex: 90,
    };
  };

  return (
    <div
      className="fixed inset-0 z-80 pointer-events-auto print:hidden"
      role="dialog"
      aria-modal="true"
      aria-label="Tour guiado interactivo de JAIRRESTAURA IA DE ESTUDIO"
    >
      {/* Dimmed Backdrop with Spotlight Cutout */}
      {rect ? (
        <>
          <div
            onClick={onClose}
            className="fixed inset-0 bg-transparent cursor-pointer"
            style={{ zIndex: 81 }}
          />
          <div
            className="fixed pointer-events-none rounded-xl transition-all duration-300 ease-out"
            style={{
              top: `${rect.top}px`,
              left: `${rect.left}px`,
              width: `${rect.width}px`,
              height: `${rect.height}px`,
              boxShadow: '0 0 0 9999px rgba(9, 13, 22, 0.72)',
              border: '2px solid #3B82F6',
              zIndex: 82,
            }}
          >
            <span className="absolute -top-3 -right-3 flex h-6 w-6">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-6 w-6 bg-blue-600 text-white text-[10px] font-mono font-bold items-center justify-center shadow">
                {currentStepIndex + 1}
              </span>
            </span>
          </div>
        </>
      ) : (
        <div
          onClick={onClose}
          className="fixed inset-0 bg-slate-950/75 backdrop-blur-xs transition-opacity"
          style={{ zIndex: 81 }}
        />
      )}

      {/* Floating Tour Step Card */}
      <div
        style={getTooltipStyle()}
        className={`rounded-2xl border p-6 shadow-2xl transition-all duration-300 ${
          isDark
            ? 'bg-slate-900 border-blue-500/40 text-slate-100'
            : 'bg-white border-blue-200 text-slate-900'
        }`}
      >
        {/* Top bar */}
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono font-semibold bg-blue-600/10 text-blue-600 dark:text-blue-400">
            {step.icon}
            <span>{step.badge}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-xs font-mono text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 flex items-center gap-1 cursor-pointer"
          >
            <span>Omitir tour</span>
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Context banner for first uploaded document */}
        {currentStepIndex === 0 && documentTitle && (
          <div
            className={`mb-3 px-3 py-2 rounded-lg border text-xs flex items-center justify-between gap-2 ${
              isDark
                ? 'bg-emerald-950/30 border-emerald-800/50 text-emerald-300'
                : 'bg-emerald-50 border-emerald-200 text-emerald-800'
            }`}
          >
            <div className="truncate">
              <span className="font-semibold">Archivo activo:</span> {documentTitle}
            </div>
            {detectedTopic && (
              <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-emerald-600 text-white shrink-0">
                {detectedTopic}
              </span>
            )}
          </div>
        )}

        <h3 className="text-lg font-bold font-display leading-snug">{step.title}</h3>
        <p
          className={`mt-2 text-xs sm:text-sm leading-relaxed ${
            isDark ? 'text-slate-300' : 'text-slate-600'
          }`}
        >
          {step.description}
        </p>

        {/* Actionable Tip Callout */}
        <div
          className={`mt-3.5 p-3 rounded-xl border text-xs flex items-start gap-2 ${
            isDark
              ? 'bg-slate-950/80 border-slate-800 text-slate-300'
              : 'bg-slate-50 border-slate-200/90 text-slate-600'
          }`}
        >
          <Sparkles className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
          <span>{step.tip}</span>
        </div>

        {/* Progress Dots + Navigation Controls */}
        <div className="mt-5 pt-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5">
            {GUIDED_TOUR_STEPS.map((s, idx) => (
              <button
                key={s.id}
                type="button"
                onClick={() => onStepChange(idx)}
                aria-label={`Ir al paso ${idx + 1}`}
                className={`h-2 rounded-full transition-all cursor-pointer ${
                  idx === currentStepIndex
                    ? 'w-6 bg-blue-600'
                    : idx < currentStepIndex
                    ? 'w-2 bg-emerald-500'
                    : 'w-2 bg-slate-300 dark:bg-slate-700'
                }`}
              />
            ))}
          </div>

          <div className="flex items-center gap-2">
            {currentStepIndex > 0 && (
              <button
                type="button"
                onClick={() => onStepChange(currentStepIndex - 1)}
                className={`px-3 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1 cursor-pointer ${
                  isDark
                    ? 'border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700'
                    : 'border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>Anterior</span>
              </button>
            )}

            {currentStepIndex < GUIDED_TOUR_STEPS.length - 1 ? (
              <button
                type="button"
                onClick={() => onStepChange(currentStepIndex + 1)}
                className="px-4 py-1.5 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold flex items-center gap-1 cursor-pointer shadow-xs"
              >
                <span>Siguiente</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Finalizar Tour</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
