import React, { useState, useEffect } from 'react';
import { FlashcardItem } from '../types';
import {
  ChevronLeft,
  ChevronRight,
  RotateCw,
  CheckCircle2,
  HelpCircle,
  Plus,
  Shuffle,
  Sparkles,
} from 'lucide-react';

interface FlashcardDeckProps {
  documentId: string;
  cards: FlashcardItem[];
  isDark: boolean;
  onAddFlashcard?: (card: FlashcardItem) => void;
  onGenerateMoreFlashcards?: () => void;
}

const MASTERY_STORAGE_PREFIX = 'jairrestaura_fc_mastery_';

export const FlashcardDeck: React.FC<FlashcardDeckProps> = ({
  documentId,
  cards,
  isDark,
  onAddFlashcard,
  onGenerateMoreFlashcards,
}) => {
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [isFlipped, setIsFlipped] = useState<boolean>(false);
  const [filterMode, setFilterMode] = useState<'all' | 'review' | 'mastered'>('all');
  const [viewMode, setViewMode] = useState<'deck' | 'grid' | 'create'>('deck');

  const [masteryMap, setMasteryMap] = useState<Record<string, 'mastered' | 'review'>>(() => {
    try {
      const saved = localStorage.getItem(`${MASTERY_STORAGE_PREFIX}${documentId}`);
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  useEffect(() => {
    try {
      const saved = localStorage.getItem(`${MASTERY_STORAGE_PREFIX}${documentId}`);
      setMasteryMap(saved ? JSON.parse(saved) : {});
      setCurrentIndex(0);
      setIsFlipped(false);
    } catch {
      setMasteryMap({});
    }
  }, [documentId]);

  const saveMasteryMap = (updated: Record<string, 'mastered' | 'review'>) => {
    setMasteryMap(updated);
    try {
      localStorage.setItem(`${MASTERY_STORAGE_PREFIX}${documentId}`, JSON.stringify(updated));
    } catch {
      // ignore
    }
  };

  // New card creation state
  const [newFront, setNewFront] = useState('');
  const [newBack, setNewBack] = useState('');
  const [newCategory, setNewCategory] = useState('Concepto Clave');
  const [newDifficulty, setNewDifficulty] = useState('Medio');
  const [newHint, setNewHint] = useState('');

  const filteredCards = (cards || []).filter((c) => {
    if (filterMode === 'all') return true;
    return masteryMap[c.id] === filterMode;
  });

  const activeDeck = filteredCards.length > 0 ? filteredCards : cards || [];
  const safeIndex = activeDeck.length > 0 ? currentIndex % activeDeck.length : 0;
  const currentCard = activeDeck[safeIndex];

  const masteredCount = (cards || []).filter((c) => masteryMap[c.id] === 'mastered').length;
  const reviewCount = (cards || []).filter((c) => masteryMap[c.id] === 'review').length;

  const handleNext = () => {
    if (activeDeck.length === 0) return;
    setIsFlipped(false);
    setCurrentIndex((prev) => (prev + 1) % activeDeck.length);
  };

  const handlePrev = () => {
    if (activeDeck.length === 0) return;
    setIsFlipped(false);
    setCurrentIndex((prev) => (prev - 1 + activeDeck.length) % activeDeck.length);
  };

  const handleShuffle = () => {
    if (activeDeck.length <= 1) return;
    setIsFlipped(false);
    const randomIdx = Math.floor(Math.random() * activeDeck.length);
    setCurrentIndex(randomIdx);
  };

  const markCard = (status: 'mastered' | 'review') => {
    if (!currentCard) return;
    const updated = { ...masteryMap, [currentCard.id]: status };
    saveMasteryMap(updated);
    handleNext();
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFront.trim() || !newBack.trim() || !onAddFlashcard) return;
    const card: FlashcardItem = {
      id: `fc-custom-${Date.now()}`,
      category: newCategory.trim() || 'Personalizada',
      difficulty: newDifficulty,
      front: newFront.trim(),
      back: newBack.trim(),
      mnemonicHint: newHint.trim() || 'Asociar directamente con la tesis del documento.',
    };
    onAddFlashcard(card);
    setNewFront('');
    setNewBack('');
    setNewHint('');
    setViewMode('deck');
  };

  if (!cards || cards.length === 0) {
    return (
      <div className="p-8 text-center border rounded-xl border-slate-200 dark:border-slate-800 space-y-3">
        <p className="text-sm text-slate-500">
          No hay tarjetas de estudio disponibles para este documento.
        </p>
        {onGenerateMoreFlashcards && (
          <button
            type="button"
            onClick={onGenerateMoreFlashcards}
            className="px-4 py-2 text-xs font-semibold bg-blue-700 text-white rounded-lg cursor-pointer"
          >
            Generar Flashcards del Documento Ahora
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Controls & Mastery Progress */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3 text-xs font-mono tabular-nums">
          <button
            type="button"
            onClick={() => {
              setFilterMode('all');
              setCurrentIndex(0);
            }}
            className={`px-2.5 py-1 rounded border cursor-pointer ${
              filterMode === 'all'
                ? 'bg-blue-700 text-white border-blue-700'
                : 'border-slate-300 dark:border-slate-700'
            }`}
          >
            Todas ({cards.length})
          </button>
          <button
            type="button"
            onClick={() => {
              setFilterMode('mastered');
              setCurrentIndex(0);
            }}
            className={`px-2.5 py-1 rounded border cursor-pointer ${
              filterMode === 'mastered'
                ? 'bg-emerald-600 text-white border-emerald-600'
                : 'border-emerald-500/40 text-emerald-600 dark:text-emerald-400'
            }`}
          >
            Dominadas: {masteredCount}
          </button>
          <button
            type="button"
            onClick={() => {
              setFilterMode('review');
              setCurrentIndex(0);
            }}
            className={`px-2.5 py-1 rounded border cursor-pointer ${
              filterMode === 'review'
                ? 'bg-amber-600 text-white border-amber-600'
                : 'border-amber-500/40 text-amber-600 dark:text-amber-400'
            }`}
          >
            Por repasar: {reviewCount}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {onGenerateMoreFlashcards && (
            <button
              type="button"
              onClick={onGenerateMoreFlashcards}
              className="px-3 py-1.5 text-xs font-semibold bg-blue-600/10 text-blue-600 dark:text-blue-400 border border-blue-500/30 rounded-lg flex items-center gap-1.5 hover:bg-blue-600 hover:text-white transition-colors cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Generar Más del Texto</span>
            </button>
          )}

          <div
            className={`flex items-center gap-1 p-1 rounded-lg ${
              isDark ? 'bg-slate-800' : 'bg-slate-100'
            }`}
          >
            <button
              type="button"
              onClick={() => setViewMode('deck')}
              className={`px-3 py-1 text-xs font-medium rounded transition-colors cursor-pointer ${
                viewMode === 'deck'
                  ? isDark
                    ? 'bg-slate-900 text-white'
                    : 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-500'
              }`}
            >
              Modo Estudio
            </button>
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`px-3 py-1 text-xs font-medium rounded transition-colors cursor-pointer ${
                viewMode === 'grid'
                  ? isDark
                    ? 'bg-slate-900 text-white'
                    : 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-500'
              }`}
            >
              Cuadrícula ({cards.length})
            </button>
            <button
              type="button"
              onClick={() => setViewMode('create')}
              className={`px-3 py-1 text-xs font-medium rounded transition-colors flex items-center gap-1 cursor-pointer ${
                viewMode === 'create'
                  ? isDark
                    ? 'bg-slate-900 text-white'
                    : 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-500'
              }`}
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Nueva Tarjeta</span>
            </button>
          </div>
        </div>
      </div>

      {viewMode === 'create' && (
        <form
          onSubmit={handleCreateSubmit}
          className={`p-6 rounded-xl border space-y-4 max-w-2xl ${
            isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
          }`}
        >
          <h3 className="text-base font-bold font-display">
            Crear Nueva Flashcard en este Documento (IndexedDB)
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-mono mb-1">Categoría</label>
              <input
                type="text"
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                className={`w-full rounded-lg border px-3 py-2 text-xs ${
                  isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
                }`}
              />
            </div>
            <div>
              <label className="block text-xs font-mono mb-1">Dificultad</label>
              <select
                value={newDifficulty}
                onChange={(e) => setNewDifficulty(e.target.value)}
                className={`w-full rounded-lg border px-3 py-2 text-xs ${
                  isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
                }`}
              >
                <option value="Fácil">Fácil</option>
                <option value="Medio">Medio</option>
                <option value="Avanzado">Avanzado</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-mono mb-1">Anverso (Pregunta / Concepto)</label>
            <input
              type="text"
              required
              value={newFront}
              onChange={(e) => setNewFront(e.target.value)}
              placeholder="¿Qué establece el documento sobre...?"
              className={`w-full rounded-lg border px-3 py-2 text-sm ${
                isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
              }`}
            />
          </div>
          <div>
            <label className="block text-xs font-mono mb-1">Reverso (Respuesta Verificada)</label>
            <textarea
              rows={3}
              required
              value={newBack}
              onChange={(e) => setNewBack(e.target.value)}
              placeholder="Escribe la definición o explicación completa..."
              className={`w-full rounded-lg border p-3 text-sm ${
                isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
              }`}
            />
          </div>
          <div>
            <label className="block text-xs font-mono mb-1">Pista Mnemotécnica (Opcional)</label>
            <input
              type="text"
              value={newHint}
              onChange={(e) => setNewHint(e.target.value)}
              placeholder="Palabra clave o regla para recordar..."
              className={`w-full rounded-lg border px-3 py-2 text-xs ${
                isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
              }`}
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setViewMode('deck')}
              className="px-4 py-2 text-xs text-slate-500 cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-semibold bg-blue-700 text-white rounded-lg cursor-pointer"
            >
              Guardar Flashcard en IndexedDB
            </button>
          </div>
        </form>
      )}

      {viewMode === 'deck' && currentCard && (
        <div className="space-y-5">
          {/* Interactive Flip Card */}
          <div
            onClick={() => setIsFlipped((prev) => !prev)}
            className={`min-h-[290px] border rounded-xl p-8 flex flex-col justify-between cursor-pointer transition-all select-none ${
              isFlipped
                ? isDark
                  ? 'bg-blue-950/30 border-blue-700'
                  : 'bg-blue-50/60 border-blue-300'
                : isDark
                ? 'bg-slate-900 border-slate-800 hover:border-slate-700'
                : 'bg-white border-slate-200 hover:border-blue-400'
            }`}
          >
            <div className="flex items-center justify-between text-xs font-mono text-slate-500">
              <span>
                Tarjeta {safeIndex + 1} de {activeDeck.length} · {currentCard.category} ·{' '}
                {currentCard.difficulty}
              </span>
              <span className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400">
                <RotateCw className="w-3.5 h-3.5" />
                <span>{isFlipped ? 'Reverso (Respuesta)' : 'Anverso (Pregunta)'}</span>
              </span>
            </div>

            <div className="my-6 text-center max-w-2xl mx-auto">
              {!isFlipped ? (
                <>
                  <div className="text-xs font-mono uppercase tracking-wider text-slate-400 mb-2">
                    Pregunta de Estudio Activo
                  </div>
                  <h3 className="text-xl sm:text-2xl font-bold font-display leading-snug">
                    {currentCard.front}
                  </h3>
                </>
              ) : (
                <>
                  <div className="text-xs font-mono uppercase tracking-wider text-blue-600 dark:text-blue-400 mb-2">
                    Respuesta Verificada del Documento
                  </div>
                  <p className="text-base sm:text-lg leading-relaxed font-medium">
                    {currentCard.back}
                  </p>
                  {currentCard.mnemonicHint && (
                    <div
                      className={`mt-4 pt-3 border-t text-xs font-mono ${
                        isDark
                          ? 'border-blue-900/60 text-slate-300'
                          : 'border-blue-200 text-slate-600'
                      }`}
                    >
                      Pista mnemotécnica: {currentCard.mnemonicHint}
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="text-center text-xs text-slate-400">
              Haz clic sobre la tarjeta para voltear entre pregunta y respuesta
            </div>
          </div>

          {/* Navigation and Spaced Repetition Rating */}
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handlePrev}
                className={`px-3.5 py-2 text-xs font-medium rounded-lg border flex items-center gap-1.5 cursor-pointer ${
                  isDark
                    ? 'bg-slate-900 border-slate-800 text-slate-200 hover:bg-slate-800'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Anterior</span>
              </button>
              <button
                type="button"
                onClick={handleNext}
                className={`px-3.5 py-2 text-xs font-medium rounded-lg border flex items-center gap-1.5 cursor-pointer ${
                  isDark
                    ? 'bg-slate-900 border-slate-800 text-slate-200 hover:bg-slate-800'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <span>Siguiente</span>
                <ChevronRight className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={handleShuffle}
                className={`px-3.5 py-2 text-xs font-medium rounded-lg border flex items-center gap-1.5 cursor-pointer ${
                  isDark
                    ? 'bg-slate-900 border-slate-800 text-slate-200 hover:bg-slate-800'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
                title="Mezclar orden"
              >
                <Shuffle className="w-3.5 h-3.5" />
                <span>Aleatoria</span>
              </button>
            </div>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => markCard('review')}
                className="px-4 py-2 text-xs font-semibold rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300 hover:bg-amber-500/20 flex items-center gap-1.5 cursor-pointer"
              >
                <HelpCircle className="w-3.5 h-3.5" />
                <span>Necesito Repasar</span>
              </button>
              <button
                type="button"
                onClick={() => markCard('mastered')}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1.5 cursor-pointer"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Concepto Dominado</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {viewMode === 'grid' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch">
          {cards.map((card, idx) => {
            const status = masteryMap[card.id];
            return (
              <div
                key={card.id || idx}
                className={`border rounded-lg p-5 flex flex-col justify-between ${
                  isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between text-xs font-mono text-slate-500 mb-2">
                    <span>
                      0{idx + 1} · {card.category} · {card.difficulty}
                    </span>
                    {status === 'mastered' && (
                      <span className="text-emerald-600 font-semibold">Dominada</span>
                    )}
                    {status === 'review' && (
                      <span className="text-amber-600 font-semibold">En repaso</span>
                    )}
                  </div>
                  <h4 className="text-base font-bold font-display mb-2">{card.front}</h4>
                  <p
                    className={`text-sm leading-relaxed ${
                      isDark ? 'text-slate-300' : 'text-slate-700'
                    }`}
                  >
                    {card.back}
                  </p>
                </div>
                <div
                  className={`mt-4 pt-3 border-t text-xs font-mono ${
                    isDark ? 'border-slate-800 text-slate-400' : 'border-slate-100 text-slate-500'
                  }`}
                >
                  Pista: {card.mnemonicHint}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
