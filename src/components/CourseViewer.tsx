import React, { useState, useEffect, useRef } from 'react';
import { DocumentAnalysis, GeneratedCourse, CourseModule, CourseUnit } from '../types';
import {
  idbGetCourseProgress,
  idbSaveCourseProgress,
} from '../utils/indexedDb';
import {
  CheckCircle2,
  Circle,
  BookOpen,
  Award,
  Clock,
  ChevronRight,
  HelpCircle,
  Terminal,
  Volume2,
  Square,
  FileCheck,
  Printer,
  StickyNote,
} from 'lucide-react';

interface CourseViewerProps {
  documentId: string;
  analysis: DocumentAnalysis;
  isDark: boolean;
}

function buildFallbackCourse(analysis: DocumentAnalysis): GeneratedCourse {
  const modules: CourseModule[] = (analysis.chapters || []).map((ch, idx) => ({
    id: `mod-${ch.number}`,
    moduleNumber: ch.number,
    title: ch.title,
    duration: '35 min',
    xpReward: 300,
    summary: ch.summary,
    units: [
      {
        id: `unit-${ch.number}-1`,
        title: `Fundamentos: ${ch.title}`,
        durationMinutes: 20,
        theoryContent: ch.detailedContent,
        practicalCodeOrCase:
          analysis.keyConcepts?.[idx]?.practicalExample ||
          ch.keyTakeaways?.join('\n• ') ||
          'Aplicación directa de los principios estudiados en el capítulo.',
        checkpointQuestion:
          analysis.quizzes?.[idx]?.question ||
          `¿Cuál es el aporte fundamental del bloque "${ch.title}"?`,
        checkpointAnswer:
          analysis.quizzes?.[idx]?.explanation ||
          ch.keyTakeaways?.[0] ||
          ch.summary,
      },
      {
        id: `unit-${ch.number}-2`,
        title: `Síntesis y Práctica Aplicada`,
        durationMinutes: 15,
        theoryContent: (ch.keyTakeaways || []).join('\n\n'),
        practicalCodeOrCase:
          analysis.activities?.[idx % Math.max(1, (analysis.activities || []).length)]
            ?.expectedDeliverable || 'Desarrollo de entregable práctico verificable.',
        checkpointQuestion: `¿Cómo se valida la implementación exitosa de ${ch.title}?`,
        checkpointAnswer:
          (ch.keyTakeaways && ch.keyTakeaways[ch.keyTakeaways.length - 1]) ||
          ch.summary,
      },
    ],
  }));

  return {
    courseTitle: `Ruta de Aprendizaje: ${analysis.documentTitle}`,
    level: 'Intermedio - Avanzado',
    totalDuration: `${Math.max(1, modules.length * 35)} min`,
    xpTotal: modules.length * 300,
    learningObjectives: (analysis.executiveSummary?.keyFindings || []).slice(0, 4),
    prerequisites: [
      'Comprensión general de los conceptos base del dominio.',
      'Lectura de la tesis central del documento.',
    ],
    modules,
    capstoneProject:
      analysis.activities?.[0]?.objective ||
      'Diseñar e implementar una solución aplicada basada en las recomendaciones accionables del documento.',
  };
}

export const CourseViewer: React.FC<CourseViewerProps> = ({
  documentId,
  analysis,
  isDark,
}) => {
  const course: GeneratedCourse = analysis.course || buildFallbackCourse(analysis);
  const allUnits: { module: CourseModule; unit: CourseUnit }[] = [];
  (course.modules || []).forEach((m) => {
    (m.units || []).forEach((u) => {
      allUnits.push({ module: m, unit: u });
    });
  });

  const [activeUnitId, setActiveUnitId] = useState<string>(
    allUnits[0]?.unit.id || ''
  );
  const [completedUnits, setCompletedUnits] = useState<string[]>([]);
  const [showCheckpointAnswer, setShowCheckpointAnswer] = useState<boolean>(false);
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);
  const [unitNotes, setUnitNotes] = useState<Record<string, string>>({});
  const [studentName, setStudentName] = useState<string>('Estudiante Profesional');
  const [showCertificateModal, setShowCertificateModal] = useState<boolean>(false);
  const synthRef = useRef<SpeechSynthesis | null>(
    typeof window !== 'undefined' && 'speechSynthesis' in window
      ? window.speechSynthesis
      : null
  );

  useEffect(() => {
    let mounted = true;
    if (allUnits.length > 0) {
      setActiveUnitId(allUnits[0].unit.id);
    }
    setShowCheckpointAnswer(false);
    stopAudioSpeech();

    try {
      const savedNotes = localStorage.getItem(`jairrestaura_notes_${documentId}`);
      if (savedNotes) {
        setUnitNotes(JSON.parse(savedNotes));
      } else {
        setUnitNotes({});
      }
    } catch {
      setUnitNotes({});
    }

    idbGetCourseProgress(documentId)
      .then((record) => {
        if (mounted && record) {
          setCompletedUnits(record.completedUnitIds || []);
        } else if (mounted) {
          setCompletedUnits([]);
        }
      })
      .catch(() => {
        if (mounted) setCompletedUnits([]);
      });

    return () => {
      mounted = false;
      stopAudioSpeech();
    };
  }, [documentId]);

  const stopAudioSpeech = () => {
    if (synthRef.current) {
      synthRef.current.cancel();
    }
    setIsSpeaking(false);
  };

  const handleToggleAudioLesson = (unit: CourseUnit) => {
    if (!synthRef.current) return;
    if (isSpeaking) {
      stopAudioSpeech();
      return;
    }

    const textToRead = `${unit.title}. ${unit.theoryContent}. Aplicación práctica: ${unit.practicalCodeOrCase}`;
    const utterance = new SpeechSynthesisUtterance(textToRead);
    utterance.lang = 'es-ES';
    utterance.rate = 1.02;
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    setIsSpeaking(true);
    synthRef.current.speak(utterance);
  };

  const handleSaveUnitNote = (unitId: string, value: string) => {
    const updated = { ...unitNotes, [unitId]: value };
    setUnitNotes(updated);
    try {
      localStorage.setItem(`jairrestaura_notes_${documentId}`, JSON.stringify(updated));
    } catch {
      // ignore quota error
    }
  };

  const currentSelection =
    allUnits.find((item) => item.unit.id === activeUnitId) || allUnits[0];

  const toggleUnitCompletion = async (unitId: string) => {
    const exists = completedUnits.includes(unitId);
    const updated = exists
      ? completedUnits.filter((id) => id !== unitId)
      : [...completedUnits, unitId];

    setCompletedUnits(updated);

    const earnedXp = Math.round(
      (updated.length / Math.max(1, allUnits.length)) * (course.xpTotal || 1200)
    );

    try {
      await idbSaveCourseProgress({
        documentId,
        completedUnitIds: updated,
        earnedXp,
        updatedAt: new Date().toISOString(),
      });
    } catch {
      // ignore IndexedDB error
    }
  };

  const progressPercentage =
    allUnits.length > 0
      ? Math.round((completedUnits.length / allUnits.length) * 100)
      : 0;

  const earnedXp = Math.round(
    (completedUnits.length / Math.max(1, allUnits.length)) * (course.xpTotal || 1200)
  );

  return (
    <div className="space-y-6">
      {/* Microsoft Learn Style Course Banner */}
      <div
        className={`border rounded-xl p-6 ${
          isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <div className="flex items-center gap-2 text-xs font-mono text-blue-600 dark:text-blue-400 mb-1">
              <span>RUTA DE APRENDIZAJE PROFESIONAL</span>
              <span>·</span>
              <span>Nivel {course.level}</span>
              <span>·</span>
              <span>{course.totalDuration}</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold font-display">
              {course.courseTitle}
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-4 font-mono text-xs tabular-nums">
            <div className="text-right">
              <div className="text-slate-500">Experiencia Acumulada</div>
              <div className="text-sm font-bold text-amber-600 dark:text-amber-400 flex items-center justify-end gap-1">
                <Award className="w-4 h-4" />
                <span>
                  {earnedXp} / {course.xpTotal} XP
                </span>
              </div>
            </div>
            <div className="text-right">
              <div className="text-slate-500">Avance del Curso</div>
              <div className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                {progressPercentage}% ({completedUnits.length}/{allUnits.length} unidades)
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowCertificateModal(true)}
              className="px-3.5 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 font-sans font-semibold text-xs flex items-center gap-1.5 cursor-pointer"
            >
              <FileCheck className="w-4 h-4" />
              <span>Emitir Certificado</span>
            </button>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mt-4">
          <div
            className={`w-full h-2 rounded-full overflow-hidden ${
              isDark ? 'bg-slate-800' : 'bg-slate-100'
            }`}
          >
            <div
              className="h-full bg-blue-600 transition-all duration-200"
              style={{ width: `${progressPercentage}%` }}
            />
          </div>
        </div>

        {/* Learning Objectives */}
        <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <div className="text-xs font-semibold text-slate-500 mb-2">
              Competencias y Objetivos de Aprendizaje:
            </div>
            <ul className="space-y-1.5">
              {(course.learningObjectives || []).map((obj, idx) => (
                <li
                  key={idx}
                  className="text-xs sm:text-sm flex items-start gap-2 text-slate-700 dark:text-slate-300"
                >
                  <span className="text-blue-600 font-bold">•</span>
                  <span>{obj}</span>
                </li>
              ))}
            </ul>
          </div>
          <div
            className={`p-4 rounded-lg border ${
              isDark
                ? 'bg-slate-950/60 border-slate-800'
                : 'bg-slate-50 border-slate-200'
            }`}
          >
            <div className="text-xs font-mono text-blue-600 dark:text-blue-400 font-semibold mb-1">
              Proyecto Integrador de Certificación (Capstone)
            </div>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              {course.capstoneProject}
            </p>
          </div>
        </div>
      </div>

      {/* Split Learning Workspace: Modules Tree (Left) + Active Unit Reader (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Modules & Units Tree */}
        <div
          className={`lg:col-span-4 border rounded-xl p-4 space-y-4 ${
            isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
          }`}
        >
          <div className="text-xs font-mono uppercase tracking-wider text-slate-400 px-2">
            Plan de Estudios ({course.modules?.length || 0} Módulos)
          </div>

          <div className="space-y-4">
            {(course.modules || []).map((mod) => (
              <div
                key={mod.id}
                className={`border rounded-lg p-3.5 space-y-2.5 ${
                  isDark
                    ? 'bg-slate-950/40 border-slate-800'
                    : 'bg-slate-50/70 border-slate-200'
                }`}
              >
                <div className="flex items-center justify-between text-xs font-mono text-slate-500">
                  <span>Módulo 0{mod.moduleNumber}</span>
                  <span className="text-amber-600 dark:text-amber-400 font-semibold">
                    +{mod.xpReward} XP
                  </span>
                </div>
                <h3 className="text-sm font-bold font-display leading-snug">
                  {mod.title}
                </h3>

                <div className="space-y-1 pt-1">
                  {(mod.units || []).map((unit) => {
                    const isSelected = currentSelection?.unit.id === unit.id;
                    const isDone = completedUnits.includes(unit.id);
                    return (
                      <button
                        key={unit.id}
                        type="button"
                        onClick={() => {
                          stopAudioSpeech();
                          setActiveUnitId(unit.id);
                          setShowCheckpointAnswer(false);
                        }}
                        className={`w-full text-left px-3 py-2 rounded-md text-xs transition-colors flex items-center justify-between gap-2 cursor-pointer ${
                          isSelected
                            ? 'bg-blue-700 text-white font-semibold'
                            : isDark
                            ? 'hover:bg-slate-800 text-slate-300'
                            : 'hover:bg-white text-slate-700'
                        }`}
                      >
                        <div className="flex items-center gap-2 truncate">
                          {isDone ? (
                            <CheckCircle2
                              className={`w-3.5 h-3.5 shrink-0 ${
                                isSelected ? 'text-white' : 'text-emerald-500'
                              }`}
                            />
                          ) : (
                            <Circle className="w-3.5 h-3.5 shrink-0 opacity-60" />
                          )}
                          <span className="truncate">{unit.title}</span>
                        </div>
                        <span className="font-mono text-[10px] opacity-75 shrink-0">
                          {unit.durationMinutes}m
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Active Unit Lesson Stage */}
        {currentSelection && (
          <div
            className={`lg:col-span-8 border rounded-xl p-6 sm:p-8 space-y-6 ${
              isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
              <div>
                <div className="flex items-center gap-2 text-xs font-mono text-blue-600 dark:text-blue-400 mb-1">
                  <BookOpen className="w-3.5 h-3.5" />
                  <span>
                    Módulo 0{currentSelection.module.moduleNumber} · Unidad Interactiva
                  </span>
                  <span>·</span>
                  <Clock className="w-3.5 h-3.5" />
                  <span>{currentSelection.unit.durationMinutes} min</span>
                </div>
                <h3 className="text-xl font-bold font-display">
                  {currentSelection.unit.title}
                </h3>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleToggleAudioLesson(currentSelection.unit)}
                  className={`px-3.5 py-2 rounded-lg text-xs font-semibold border flex items-center gap-1.5 transition-colors cursor-pointer ${
                    isSpeaking
                      ? 'bg-red-600 text-white border-red-600'
                      : isDark
                      ? 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700'
                      : 'bg-slate-100 border-slate-200 text-slate-800 hover:bg-slate-200'
                  }`}
                >
                  {isSpeaking ? (
                    <>
                      <Square className="w-3.5 h-3.5" />
                      <span>Detener Audio-Clase</span>
                    </>
                  ) : (
                    <>
                      <Volume2 className="w-3.5 h-3.5" />
                      <span>Escuchar Audio-Clase</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => toggleUnitCompletion(currentSelection.unit.id)}
                  className={`px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                    completedUnits.includes(currentSelection.unit.id)
                      ? 'bg-emerald-600 text-white'
                      : 'bg-blue-700 hover:bg-blue-800 text-white'
                  }`}
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>
                    {completedUnits.includes(currentSelection.unit.id)
                      ? 'Unidad Completada (+XP)'
                      : 'Completar Unidad'}
                  </span>
                </button>
              </div>
            </div>

            {/* Theory Content */}
            <div className="space-y-4">
              <div className="text-xs font-mono uppercase tracking-wider text-slate-400">
                Desarrollo Teórico y Conceptual
              </div>
              {currentSelection.unit.theoryContent
                .split('\n')
                .filter((p) => p.trim())
                .map((para, idx) => (
                  <p
                    key={idx}
                    className={`text-sm sm:text-base leading-relaxed ${
                      isDark ? 'text-slate-300' : 'text-slate-700'
                    }`}
                  >
                    {para}
                  </p>
                ))}
            </div>

            {/* Practical Case / Lab Block */}
            <div
              className={`border rounded-lg p-5 space-y-2 ${
                isDark
                  ? 'bg-slate-950 border-slate-800 text-slate-200'
                  : 'bg-slate-50 border-slate-200 text-slate-800'
              }`}
            >
              <div className="flex items-center gap-2 text-xs font-mono text-blue-600 dark:text-blue-400 font-semibold">
                <Terminal className="w-4 h-4" />
                <span>Laboratorio / Caso de Aplicación Práctica</span>
              </div>
              <p className="text-xs sm:text-sm leading-relaxed whitespace-pre-line">
                {currentSelection.unit.practicalCodeOrCase}
              </p>
            </div>

            {/* Knowledge Checkpoint */}
            <div
              className={`border rounded-lg p-5 space-y-3 ${
                isDark
                  ? 'bg-blue-950/25 border-blue-800/60'
                  : 'bg-blue-50/60 border-blue-200'
              }`}
            >
              <div className="flex items-center gap-2 text-xs font-mono text-blue-600 dark:text-blue-400 font-semibold">
                <HelpCircle className="w-4 h-4" />
                <span>Comprobación de Conocimientos de la Unidad</span>
              </div>
              <p className="text-sm font-semibold">
                {currentSelection.unit.checkpointQuestion}
              </p>
              <button
                type="button"
                onClick={() => setShowCheckpointAnswer((prev) => !prev)}
                className="px-3.5 py-1.5 text-xs font-semibold rounded bg-blue-700 hover:bg-blue-800 text-white cursor-pointer flex items-center gap-1"
              >
                <span>
                  {showCheckpointAnswer
                    ? 'Ocultar verificación'
                    : 'Verificar respuesta explicada'}
                </span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
              {showCheckpointAnswer && (
                <div className="pt-2 text-xs sm:text-sm text-slate-700 dark:text-slate-200 leading-relaxed">
                  <strong>Respuesta: </strong>
                  {currentSelection.unit.checkpointAnswer}
                </div>
              )}
            </div>

            {/* Personal Study Notes per Unit (Notion Style) */}
            <div
              className={`border rounded-lg p-5 space-y-2.5 ${
                isDark ? 'bg-slate-950/50 border-slate-800' : 'bg-slate-50/70 border-slate-200'
              }`}
            >
              <div className="flex items-center justify-between text-xs font-mono text-slate-500">
                <span className="flex items-center gap-1.5 font-semibold">
                  <StickyNote className="w-3.5 h-3.5 text-amber-500" />
                  <span>Apuntes Personales de la Unidad (Guardado Automático)</span>
                </span>
                <span>Sincronizado localmente</span>
              </div>
              <textarea
                rows={3}
                value={unitNotes[currentSelection.unit.id] || ''}
                onChange={(e) =>
                  handleSaveUnitNote(currentSelection.unit.id, e.target.value)
                }
                placeholder="Escribe tus reflexiones, fórmulas clave o notas de estudio sobre esta unidad..."
                className={`w-full rounded-md border p-3 text-xs sm:text-sm focus:border-blue-600 focus:outline-none ${
                  isDark
                    ? 'bg-slate-900 border-slate-800 text-slate-100'
                    : 'bg-white border-slate-200 text-slate-900'
                }`}
              />
            </div>
          </div>
        )}
      </div>

      {/* Certificate of Completion Modal */}
      {showCertificateModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div
            className={`max-w-2xl w-full rounded-xl border p-8 space-y-6 ${
              isDark
                ? 'bg-slate-900 border-slate-700 text-slate-100'
                : 'bg-white border-slate-200 text-slate-900'
            }`}
          >
            <div className="border-4 border-double border-amber-500/60 rounded-lg p-6 text-center space-y-4">
              <Award className="w-12 h-12 text-amber-500 mx-auto" />
              <div className="text-xs font-mono uppercase tracking-widest text-amber-600 dark:text-amber-400">
                JAIRRESTAURA IA DE ESTUDIO · Certificación Académica SaaS
              </div>
              <h3 className="text-2xl font-bold font-display">
                Certificado de Dominio Documental
              </h3>
              <p className="text-xs text-slate-500">Se otorga el presente reconocimiento a:</p>
              <input
                type="text"
                value={studentName}
                onChange={(e) => setStudentName(e.target.value)}
                className={`text-center text-lg font-bold font-display border-b px-4 py-1 focus:outline-none ${
                  isDark
                    ? 'bg-transparent border-slate-700 text-white'
                    : 'bg-transparent border-slate-300 text-slate-900'
                }`}
              />
              <p className="text-sm leading-relaxed max-w-lg mx-auto">
                Por completar el estudio interactivo del curso{' '}
                <strong>{course.courseTitle}</strong> ({course.level}) con un avance del{' '}
                <strong>{progressPercentage}%</strong> y{' '}
                <strong>
                  {earnedXp} / {course.xpTotal} XP
                </strong>{' '}
                acumulados.
              </p>
              <div className="pt-4 flex items-center justify-around text-xs font-mono text-slate-400">
                <span>Fecha: {new Date().toLocaleDateString('es-ES')}</span>
                <span>ID Verificación: HERC-{documentId.slice(-6).toUpperCase()}</span>
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowCertificateModal(false)}
                className="px-4 py-2 text-xs font-medium text-slate-500 cursor-pointer"
              >
                Cerrar
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="px-4 py-2 text-xs font-semibold bg-blue-700 hover:bg-blue-800 text-white rounded-lg flex items-center gap-1.5 cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Imprimir / Guardar Certificado PDF</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
