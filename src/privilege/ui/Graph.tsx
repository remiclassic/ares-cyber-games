import {
  Background,
  BackgroundVariant,
  BaseEdge,
  Controls,
  EdgeLabelRenderer,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  getBezierPath,
  useNodesState,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import { createContext, useContext, useMemo } from "react";
import { edgeLabel } from "../sim/access";
import type { Puzzle, PuzzleNode, ViewEdge } from "../sim/types";
import { Icon } from "./icons";

export type Selection = Readonly<{ type: "node" | "edge"; id: string }> | null;
export type Lit = "allow" | "explored";

type GraphState = Readonly<{
  selection: Selection;
  litNodes: ReadonlySet<string>;
  subject: string | null;
  target: string | null;
  onSelect: (selection: Selection) => void;
}>;

// Nodes read their live state from context so React Flow keeps its own
// measured node objects untouched between renders.
const GraphContext = createContext<GraphState>({ selection: null, litNodes: new Set(), subject: null, target: null, onSelect: () => {} });

type EntityNode = Node<{ node: PuzzleNode }, "entity">;
type AccessEdge = Edge<{ edge: ViewEdge; lit: Lit | null; selected: boolean; onSelect: (selection: Selection) => void }, "access">;

const COLORS = { member: "#38d6ff", grant: "#5dffb0", contains: "#8fa3c8", info: "#7c8aa8", allow: "#5dffb0", explored: "#ffc14d", removed: "#56627c", changed: "#ffc14d" };

function EntityNodeView({ data }: NodeProps<EntityNode>) {
  const { node } = data;
  const state = useContext(GraphContext);
  const selected = state.selection?.type === "node" && state.selection.id === node.id;
  const classes = [
    "entity",
    `entity-${node.kind}`,
    node.sensitive ? "sensitive" : "",
    selected ? "selected" : "",
    state.litNodes.has(node.id) ? "lit" : "",
    state.subject === node.id || state.target === node.id ? "in-test" : "",
  ].join(" ");
  return (
    <button type="button" className={classes} onClick={() => state.onSelect({ type: "node", id: node.id })} aria-pressed={selected}>
      <Handle type="target" position={Position.Left} id="l" isConnectable={false} />
      <Handle type="target" position={Position.Top} id="t" isConnectable={false} />
      <span className="entity-disc">
        <Icon name={node.icon} size={34} />
      </span>
      <span className="entity-label">{node.label}</span>
      <span className="entity-sub">{node.sub}</span>
      <Handle type="source" position={Position.Right} id="r" isConnectable={false} />
      <Handle type="source" position={Position.Bottom} id="b" isConnectable={false} />
    </button>
  );
}

function AccessEdgeView({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd, data }: EdgeProps<AccessEdge>) {
  const [path, labelX, labelY] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });
  if (!data) return null;
  const { edge, lit, selected } = data;
  const classes = ["edge-pill", `pill-${edge.kind}`, edge.removed ? "removed" : "", edge.changed ? "changed" : "", lit ? `lit-${lit}` : "", selected ? "selected" : ""].join(" ");
  const text = edge.removed ? `${edgeLabel(edge)} (removed)` : edgeLabel(edge);
  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} interactionWidth={22} />
      <EdgeLabelRenderer>
        <button
          type="button"
          className={`${classes} nodrag nopan`}
          data-edge={id}
          style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
          onClick={() => data.onSelect({ type: "edge", id })}
          aria-pressed={selected}
        >
          {edge.kind === "info" ? <span className="pill-tag">Not a permission</span> : null}
          {text}
        </button>
      </EdgeLabelRenderer>
    </>
  );
}

const nodeTypes = { entity: EntityNodeView };
const edgeTypes = { access: AccessEdgeView };

type Props = Readonly<{
  puzzle: Puzzle;
  edges: readonly ViewEdge[];
  selection: Selection;
  lit: Readonly<Record<string, Lit>>;
  subject: string | null;
  target: string | null;
  onSelect: (selection: Selection) => void;
}>;

export function Graph({ puzzle, edges, selection, lit, subject, target, onSelect }: Props) {
  const [nodes, , onNodesChange] = useNodesState<EntityNode>(
    puzzle.nodes.map((node) => ({ id: node.id, type: "entity", position: { x: node.x, y: node.y }, data: { node } })),
  );

  const flowEdges = useMemo<AccessEdge[]>(
    () =>
      edges.map((edge) => {
        const state = lit[edge.id] ?? null;
        const color = edge.removed ? COLORS.removed : state ? COLORS[state] : edge.changed ? COLORS.changed : COLORS[edge.kind];
        const selected = selection?.type === "edge" && selection.id === edge.id;
        return {
          id: edge.id,
          type: "access",
          source: edge.from,
          target: edge.to,
          sourceHandle: edge.vertical ? "b" : "r",
          targetHandle: edge.vertical ? "t" : "l",
          className: ["access-edge", `kind-${edge.kind}`, edge.removed ? "removed" : "", edge.changed ? "changed" : "", state ? `lit-${state}` : "", selected ? "selected" : ""].join(" "),
          markerEnd: { type: MarkerType.ArrowClosed, color, width: 18, height: 18 },
          zIndex: state ? 2 : 0,
          data: { edge, lit: state, selected, onSelect },
        };
      }),
    [edges, lit, selection, onSelect],
  );

  const context = useMemo<GraphState>(() => {
    const litNodes = new Set<string>();
    for (const edge of edges) {
      if (lit[edge.id]) litNodes.add(edge.from).add(edge.to);
    }
    return { selection, litNodes, subject, target, onSelect };
  }, [edges, lit, selection, subject, target, onSelect]);

  return (
    <GraphContext.Provider value={context}>
      <ReactFlow
        nodes={nodes}
        edges={flowEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgeClick={(_, edge) => onSelect({ type: "edge", id: edge.id })}
        onPaneClick={() => onSelect(null)}
        nodesConnectable={false}
        nodesFocusable={false}
        edgesFocusable={false}
        elementsSelectable={false}
        zoomOnScroll={false}
        preventScrolling={false}
        minZoom={0.4}
        maxZoom={1.6}
        fitView
        fitViewOptions={{ padding: 0.12 }}
        colorMode="dark"
      >
        <Background variant={BackgroundVariant.Dots} gap={26} size={1.4} color="rgba(120, 170, 255, 0.22)" />
        <Controls showInteractive={false} position="bottom-left" />
      </ReactFlow>
    </GraphContext.Provider>
  );
}
