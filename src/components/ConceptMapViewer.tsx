import React, { useState } from 'react';
import { ConceptMapData, ConceptNode } from '../types';
import { Network } from 'lucide-react';

interface ConceptMapViewerProps {
  data: ConceptMapData;
  isDark: boolean;
}

export const ConceptMapViewer: React.FC<ConceptMapViewerProps> = ({ data, isDark }) => {
  const nodes = data?.nodes || [];
  const edges = data?.edges || [];
  const [selectedNode, setSelectedNode] = useState<ConceptNode | null>(nodes[0] || null);

  // Organize nodes by level (1: center/top, 2: middle, 3: bottom)
  const level1 = nodes.filter((n) => n.level === 1);
  const level2 = nodes.filter((n) => n.level === 2);
  const level3 = nodes.filter((n) => n.level >= 3);

  // Compute deterministic coordinates inside an 880 x 480 viewBox
  const coords: Record<string, { x: number; y: number }> = {};

  level1.forEach((n, idx) => {
    const spacing = 880 / (level1.length + 1);
    coords[n.id] = { x: spacing * (idx + 1), y: 70 };
  });

  level2.forEach((n, idx) => {
    const spacing = 880 / (level2.length + 1);
    coords[n.id] = { x: spacing * (idx + 1), y: 235 };
  });

  level3.forEach((n, idx) => {
    const spacing = 880 / (level3.length + 1);
    coords[n.id] = { x: spacing * (idx + 1), y: 400 };
  });

  // Fallback for any node with unmapped level
  nodes.forEach((n, idx) => {
    if (!coords[n.id]) {
      coords[n.id] = { x: 140 + (idx % 4) * 200, y: 240 };
    }
  });

  return (
    <div className="space-y-6">
      {/* Interactive SVG Canvas */}
      <div
        className={`border rounded-lg overflow-hidden ${
          isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
        }`}
      >
        <div
          className={`px-4 py-3 border-b flex items-center justify-between text-xs font-mono ${
            isDark
              ? 'bg-slate-950/60 border-slate-800 text-slate-400'
              : 'bg-slate-50 border-slate-200 text-slate-600'
          }`}
        >
          <span className="flex items-center gap-2">
            <Network className="w-3.5 h-3.5 text-blue-600" />
            <span>Núcleo Conceptual: {data?.centralTheme}</span>
          </span>
          <span>Haz clic en cualquier nodo para inspeccionar su definición</span>
        </div>

        <div className="w-full overflow-x-auto">
          <svg
            viewBox="0 0 880 480"
            className="w-full min-w-[680px] h-[440px] select-none"
          >
            <defs>
              <marker
                id="arrowhead"
                markerWidth="8"
                markerHeight="6"
                refX="7"
                refY="3"
                orient="auto"
              >
                <polygon
                  points="0 0, 8 3, 0 6"
                  fill={isDark ? '#64748B' : '#94A3B8'}
                />
              </marker>
            </defs>

            {/* Edges */}
            {edges.map((edge, idx) => {
              const src = coords[edge.source];
              const tgt = coords[edge.target];
              if (!src || !tgt) return null;

              const midX = (src.x + tgt.x) / 2;
              const midY = (src.y + tgt.y) / 2;

              return (
                <g key={idx}>
                  <line
                    x1={src.x}
                    y1={src.y + 24}
                    x2={tgt.x}
                    y2={tgt.y - 28}
                    stroke={isDark ? '#475569' : '#CBD5E1'}
                    strokeWidth="1.75"
                    markerEnd="url(#arrowhead)"
                  />
                  <rect
                    x={midX - 58}
                    y={midY - 10}
                    width="116"
                    height="19"
                    rx="4"
                    fill={isDark ? '#0F172A' : '#F8FAFC'}
                    stroke={isDark ? '#334155' : '#E2E8F0'}
                    strokeWidth="1"
                  />
                  <text
                    x={midX}
                    y={midY + 3}
                    textAnchor="middle"
                    fontSize="10"
                    fill={isDark ? '#94A3B8' : '#475569'}
                    fontFamily="JetBrains Mono, monospace"
                  >
                    {edge.relationLabel.slice(0, 22)}
                  </text>
                </g>
              );
            })}

            {/* Nodes */}
            {nodes.map((node) => {
              const pos = coords[node.id];
              if (!pos) return null;
              const isSelected = selectedNode?.id === node.id;
              const isRoot = node.level === 1;

              const boxFill = isRoot
                ? '#1D4ED8'
                : isSelected
                ? isDark
                  ? '#1E3A8A'
                  : '#EFF6FF'
                : isDark
                ? '#1E293B'
                : '#FFFFFF';

              const strokeColor = isRoot
                ? '#1E40AF'
                : isSelected
                ? '#2563EB'
                : isDark
                ? '#334155'
                : '#CBD5E1';

              const textColor = isRoot
                ? '#FFFFFF'
                : isDark
                ? '#F8FAFC'
                : '#0F172A';

              return (
                <g
                  key={node.id}
                  onClick={() => setSelectedNode(node)}
                  className="cursor-pointer transition-opacity hover:opacity-90"
                >
                  <rect
                    x={pos.x - 95}
                    y={pos.y - 24}
                    width="190"
                    height="48"
                    rx="8"
                    fill={boxFill}
                    stroke={strokeColor}
                    strokeWidth={isSelected ? '2.2' : '1.2'}
                  />
                  <text
                    x={pos.x}
                    y={pos.y - 3}
                    textAnchor="middle"
                    fontSize="11.5"
                    fontWeight="600"
                    fill={textColor}
                    fontFamily="Plus Jakarta Sans, sans-serif"
                  >
                    {node.label.length > 25 ? node.label.slice(0, 23) + '…' : node.label}
                  </text>
                  <text
                    x={pos.x}
                    y={pos.y + 13}
                    textAnchor="middle"
                    fontSize="9.5"
                    fill={isRoot ? '#DBEAFE' : isDark ? '#94A3B8' : '#64748B'}
                    fontFamily="JetBrains Mono, monospace"
                  >
                    Nivel 0{node.level} · {node.category.slice(0, 18)}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      </div>

      {/* Selected Node Detail Inspector & Full Relational Matrix */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-stretch">
        <div
          className={`md:col-span-5 border rounded-lg p-5 flex flex-col justify-between ${
            isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
          }`}
        >
          {selectedNode ? (
            <div>
              <div className="text-xs font-mono text-blue-600 dark:text-blue-400 mb-1">
                Nodo Seleccionado · Nivel Jerárquico 0{selectedNode.level}
              </div>
              <h3 className="text-lg font-bold font-display mb-2">
                {selectedNode.label}
              </h3>
              <p
                className={`text-sm leading-relaxed ${
                  isDark ? 'text-slate-300' : 'text-slate-700'
                }`}
              >
                {selectedNode.description}
              </p>
            </div>
          ) : (
            <p className="text-sm text-slate-500">
              Selecciona un nodo del mapa para ver su explicación detallada.
            </p>
          )}
          <div
            className={`mt-4 pt-3 border-t text-xs font-mono ${
              isDark ? 'border-slate-800 text-slate-400' : 'border-slate-100 text-slate-500'
            }`}
          >
            Categoría: {selectedNode?.category || 'General'}
          </div>
        </div>

        <div
          className={`md:col-span-7 border rounded-lg p-5 ${
            isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
          }`}
        >
          <h3 className="text-sm font-bold font-display mb-3">
            Proposiciones Semánticas del Mapa ({edges.length} relaciones)
          </h3>
          <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
            {edges.map((edge, idx) => {
              const srcNode = nodes.find((n) => n.id === edge.source);
              const tgtNode = nodes.find((n) => n.id === edge.target);
              return (
                <div
                  key={idx}
                  className={`text-xs p-2.5 rounded border flex flex-wrap items-center gap-1.5 ${
                    isDark
                      ? 'bg-slate-950/50 border-slate-800 text-slate-300'
                      : 'bg-slate-50 border-slate-200 text-slate-700'
                  }`}
                >
                  <span className="font-semibold">{srcNode?.label || edge.source}</span>
                  <span className="font-mono text-blue-600 dark:text-blue-400 px-1">
                    —[{edge.relationLabel}]→
                  </span>
                  <span className="font-semibold">{tgtNode?.label || edge.target}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
