"use client";

import { memo, useState, useCallback, useEffect, useMemo } from "react";
import { Position } from "@xyflow/react";
import { registry } from "@/lib/registry";
import { useEditorStore } from "@/store/editor";
import { cn } from "@/lib/utils";
import { TSLHandle } from "./TSLHandle";
import { useTheme } from "next-themes";
import { MATERIAL_NODE_TYPES, POST_INPUT_DEFAULT_OUTPUTS } from "@/lib/nodes";
import { getMaterialActiveInputsSet } from "@/lib/material-inputs";
import { TEXTURE_PROP_INPUTS } from "@/lib/texture-props";
import { POST_OUTPUT_COLOR_CONTROL_INPUTS } from "@/lib/post-output-settings";
import { resolveNodeOutputTypeById } from "@/lib/type-inference";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";

import type { AppNode, Port, TSLType, TSLValueType } from "@/lib/types";
import { NodeProps } from "@xyflow/react";
import {
  MULTI_OP_OPTIONS,
  getMultiOpHandleId,
  getMultiOpLabel,
  getMultiOpParams,
  type MultiOp,
  type MultiOpType,
} from "@/lib/multi-op";
import { Separator } from "./ui/separator";
import { getUniformKindFromNode, getUniformOutputs } from "@/lib/uniform-utils";
import {
  generateGradientString,
  normalizeGradientStops,
} from "@/lib/gradient-utils";
import { Bug, Hash } from "lucide-react";
import {
  getDebugPreviewStatus,
  type DebugPreviewStatus,
} from "@/lib/debug-preview";

type TSLNodeProps = NodeProps<AppNode>;

const HANDLE_SEPARATOR = "\u001f";
const HANDLE_GROUP_SEPARATOR = "\u001e";

const serializeHandleSet = (handles: string[]) => handles.sort().join(HANDLE_SEPARATOR);

const deserializeHandleSet = (value: string) =>
  new Set(value ? value.split(HANDLE_SEPARATOR).filter(Boolean) : []);

const categoryColors: Record<string, string> = {
  Math: "border-red-200 bg-red-100 dark:bg-red-900/20",
  Constants: "border-violet-500 bg-violet-100 dark:bg-violet-900/20",
  Geometry: "border-emerald-500 bg-emerald-100 dark:bg-emerald-900/20",
  Material: "border-orange-500 bg-orange-100 dark:bg-orange-900/20",
  Subgraph: "border-blue-500 bg-blue-100 dark:bg-blue-900/20",
  Post: "border-teal-500 bg-teal-100 dark:bg-teal-900/20",
  Texture: "border-pink-500 bg-pink-100 dark:bg-pink-900/20",
  Model: "border-cyan-500 bg-cyan-100 dark:bg-cyan-900/20",
  Advanced: "border-slate-500 bg-slate-100 dark:bg-slate-900/20",
  Noise: "border-fuchsia-500 bg-fuchsia-100 dark:bg-fuchsia-900/20",
  Utils: "border-yellow-500 bg-yellow-100 dark:bg-yellow-900/20",
  Loop: "border-indigo-500 bg-indigo-100 dark:bg-indigo-900/20",
  Globals: "border-emerald-500 bg-emerald-100 dark:bg-emerald-900/20",
  Locals: "border-amber-500 bg-amber-100 dark:bg-amber-900/20",
  Default: "border-gray-500 bg-gray-100 dark:bg-gray-900/20",
};

function TSLNodeComponent({ id, data, selected, type }: TSLNodeProps) {
  const updateNodeValue = useEditorStore((s) => s.updateNodeValue);
  const addMultiOp = useEditorStore((s) => s.addMultiOp);
  const updateMultiOp = useEditorStore((s) => s.updateMultiOp);
  const removeMultiOp = useEditorStore((s) => s.removeMultiOp);
  const isDebugPreviewActive = useEditorStore(
    useCallback(
      (state) => state.activeDebugPreviewNodeIds.includes(id),
      [id],
    ),
  );
  const debugPreviewError = useEditorStore(
    useCallback((state) => state.debugPreviewErrors[id] ?? null, [id]),
  );
  const debugPreviewMode = useEditorStore(
    useCallback((state) => state.debugPreviewModes[id] ?? "color", [id]),
  );
  const toggleDebugPreviewActive = useEditorStore(
    (s) => s.toggleDebugPreviewActive,
  );
  const toggleDebugPreviewMode = useEditorStore(
    (s) => s.toggleDebugPreviewMode,
  );
  const edges = useEditorStore((s) => s.edges);
  const graphStructureVersion = useEditorStore((s) => s.graphStructureVersion);
  const subgraphs = useEditorStore((s) => s.subgraphs);
  const codeNodes = useEditorStore((s) => s.codeNodes);
  const globals = useEditorStore((s) => s.globals);
  const liveNodeData = useEditorStore(
    useCallback(
      (state) => state.nodes.find((node) => node.id === id)?.data,
      [id],
    ),
  );
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const nodeData = liveNodeData ?? data;
  const nodeType = nodeData.type;
  const def = registry.get(nodeType);
  const debugPreviewStatus = useMemo(
    () =>
      getDebugPreviewStatus({
        id,
        type: type ?? "default",
        position: { x: 0, y: 0 },
        data: nodeData,
      } as AppNode),
    [id, nodeData, type],
  );
  const showDebugPreviewSlot = isDebugPreviewActive;

  const connectedHandlesKey = useEditorStore(
    useCallback((state) => {
      const inputHandles: string[] = [];
      const outputHandles: string[] = [];
      for (const edge of state.edges) {
        if (edge.target === id && edge.targetHandle) {
          inputHandles.push(edge.targetHandle);
        }
        if (edge.source === id && edge.sourceHandle) {
          outputHandles.push(edge.sourceHandle);
        }
      }
      return `${serializeHandleSet(inputHandles)}${HANDLE_GROUP_SEPARATOR}${serializeHandleSet(outputHandles)}`;
    }, [id]),
  );

  const [connectedInputs, connectedOutputs] = useMemo(() => {
    const [inputPart = "", outputPart = ""] = connectedHandlesKey.split(HANDLE_GROUP_SEPARATOR);
    return [deserializeHandleSet(inputPart), deserializeHandleSet(outputPart)];
  }, [connectedHandlesKey]);

  const storedNameValue = nodeData.values?.localName;
  const storedName = typeof storedNameValue === "string" ? storedNameValue : "";
  const [isEditingName, setIsEditingName] = useState(false);
  const [localName, setLocalName] = useState(storedName || "local");

  useEffect(() => {
    setLocalName(storedName || "local");
  }, [storedName]);

  const handleNameSubmit = useCallback(() => {
    const trimmedName = localName.trim();
    if (trimmedName) {
      updateNodeValue(id, "localName", trimmedName);
    }
    setIsEditingName(false);
  }, [id, localName, updateNodeValue]);

  const handleNameKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") handleNameSubmit();
      else if (e.key === "Escape") {
        setLocalName(storedName);
        setIsEditingName(false);
      }
    },
    [handleNameSubmit, storedName],
  );

  // Check if this is a subgraph instance (custom node) or code node instance
  const isSubgraphInstance = nodeType.startsWith("custom/");
  const isCodeNodeInstance = nodeType.startsWith("code/");
  const isCustomInstance = isSubgraphInstance || isCodeNodeInstance;
  const isMultiOpNode = nodeType === "math/multiOp";
  const isUniformNode = nodeType === "const/uniform";
  const isMaterialNode = (MATERIAL_NODE_TYPES as readonly string[]).includes(
    nodeType,
  );
  const isPostInputNode = nodeType === "post/input";
  const isPostOutputNode = nodeType === "post/output";
  const isSubgraphInput = nodeType === "subgraph/input";
  const isSubgraphOutput = nodeType === "subgraph/output";
  const isGlobalRef = nodeType === "global/ref";
  const isAnchorNode = isSubgraphInput || isSubgraphOutput;
  const operations = Array.isArray(nodeData.operations)
    ? (nodeData.operations as MultiOp[])
    : [];
  const selectedGlobalId =
    typeof nodeData.values?.globalId === "string" ? nodeData.values.globalId : "";
  const subgraphDef = useEditorStore(
    useCallback(
      (state) => (isSubgraphInstance ? state.subgraphs[nodeType] : undefined),
      [isSubgraphInstance, nodeType],
    ),
  );
  const codeNode = useEditorStore(
    useCallback(
      (state) => (isCodeNodeInstance ? state.codeNodes[nodeType] : undefined),
      [isCodeNodeInstance, nodeType],
    ),
  );
  const globalEntry = useEditorStore(
    useCallback(
      (state) =>
        isGlobalRef && selectedGlobalId
          ? state.globals.find((entry) => entry.id === selectedGlobalId)
          : undefined,
      [isGlobalRef, selectedGlobalId],
    ),
  );
  const shouldInferOutputTypes = nodeType === "math/multiOp" || nodeType.startsWith("math/");
  const outputTypeVersion = useEditorStore(
    useCallback(
      (state) => (shouldInferOutputTypes ? state.graphStructureVersion : 0),
      [shouldInferOutputTypes],
    ),
  );

  // For subgraph and code node instances, we don't need a registry definition
  // We'll use the dynamicPorts from node data
  if (!def && !isCustomInstance) {
    return (
      <div className="min-w-[200px] bg-red-100 dark:bg-red-900/80 text-red-800 dark:text-red-200 p-3 rounded-xl">
        Unknown node: {nodeType}
      </div>
    );
  }

  // Get ports - for anchor nodes and subgraph instances, use dynamic ports from data
  let inputs: Record<string, Port> = {};
  let outputs: Record<string, Port> = {};
  let nodeLabel = def?.label || "Custom Node";

  if (isSubgraphInstance) {
    const ports = subgraphDef
      ? [...(subgraphDef.inputs || []), ...(subgraphDef.outputs || [])]
      : nodeData.dynamicPorts || [];
    // Subgraph instance: ports contain both inputs and outputs
    // Inputs have ids starting with 'in_', outputs with 'out_'
    for (const port of ports) {
      if (port.id.startsWith("in_")) {
        inputs[port.id] = {
          label: port.label,
          type: port.type as TSLType,
          connectionOnly: true,
        };
      } else if (port.id.startsWith("out_") || port.id === "out") {
        outputs[port.id] = { label: port.label, type: port.type as TSLType };
      }
    }
    // Extract name from type (custom/name-timestamp)
    const namePart = nodeType.replace("custom/", "").split("-")[0];
    // Try to get dynamic name from store, fallback to parsed name from type
    nodeLabel =
      subgraphDef?.name ||
      namePart.charAt(0).toUpperCase() + namePart.slice(1).replace(/-/g, " ");
  } else if (isCodeNodeInstance && nodeData.dynamicPorts) {
    // Code node instance: dynamicPorts contains inputs (in_*) and output (out)
    for (const port of nodeData.dynamicPorts) {
      if (port.id.startsWith("in_")) {
        // Code node inputs are editable (no connectionOnly) to allow fallback values
        inputs[port.id] = { label: port.label, type: port.type as TSLType };
      } else if (port.id === "out") {
        outputs[port.id] = { label: port.label, type: port.type as TSLType };
      }
    }
    if (codeNode) {
      nodeLabel = codeNode.name;
    } else {
      // Fallback: parse from type
      const namePart = nodeType.replace("code/", "").split("-")[0];
      nodeLabel =
        namePart.charAt(0).toUpperCase() + namePart.slice(1).replace(/-/g, " ");
    }
  } else if (isGlobalRef) {
    const outputLabel = globalEntry?.name || "Global";
    const outputType = (globalEntry?.type as TSLType) || "any";
    outputs = {
      out: { label: outputLabel, type: outputType },
    };
    nodeLabel = "Global";
  } else if (isAnchorNode && nodeData.dynamicPorts) {
    // Subgraph Input: dynamic ports become outputs (to connect to internal nodes)
    // Subgraph Output: dynamic ports become inputs (to receive from internal nodes)
    for (const port of nodeData.dynamicPorts) {
      if (isSubgraphInput) {
        outputs[port.id] = { label: port.label, type: port.type as TSLType };
      } else {
        inputs[port.id] = {
          label: port.label,
          type: port.type as TSLType,
          connectionOnly: true,
        };
      }
    }
  } else if (def) {
    inputs = def.inputs ?? {};
    outputs = def.outputs ?? {};
    nodeLabel = def.label;
    if (isUniformNode) {
      const kind = getUniformKindFromNode({ data: nodeData } as AppNode);
      inputs = {};
      outputs = getUniformOutputs(kind);
    }
  }

  const inferredOutputTypes = new Map<string, TSLType>();
  if (shouldInferOutputTypes && outputTypeVersion >= 0) {
    const state = useEditorStore.getState();
    const nodesById = new Map(state.nodes.map((node) => [node.id, node]));
    for (const [handleId, output] of Object.entries(outputs)) {
      if (output.type !== "any") continue;
      inferredOutputTypes.set(
        handleId,
        resolveNodeOutputTypeById(
          id,
          handleId,
          nodesById,
          state.edges,
          state.globals,
          state.subgraphs,
        ),
      );
    }
  }

  let category = "Default";
  if (def) {
    category = def.category;
  } else if (isSubgraphInstance || isSubgraphInput || isSubgraphOutput) {
    category = "Subgraph";
  } else if (isGlobalRef) {
    category = "Globals";
  } else if (isCodeNodeInstance) {
    category = "Advanced";
  }

  const colorClass = categoryColors[category] || categoryColors["Default"];
  const shellClass = cn(
    "min-w-[50px] flex flex-col rounded-xl shadow-lg overflow-hidden",
    "bg-white/95 shadow-gray-300/50",
    "dark:bg-card/95 dark:shadow-black/30",
    "backdrop-blur-sm transition-shadow duration-150",
    selected && "shadow-xl dark:shadow-black/50 shadow-gray-400/50",
  );
  const contentClass = "";
  const debugPreviewSlot = showDebugPreviewSlot ? (
    <DebugPreviewSlot
      nodeId={id}
      status={debugPreviewStatus}
      error={debugPreviewError}
    />
  ) : null;

  const header = (
    <div
      className={cn(
        "flex gap-2 px-3 pt-2 pb-1 rounded-t-xl",
        "border-b transition-colors duration-150",
        colorClass,
        selected ? "border-blue-500" : "border-gray-200 dark:border-white/10",
      )}
    >
      <div className="min-w-0 flex-1 flex flex-col gap-0.5">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-800 dark:text-white/90 truncate">
          {nodeLabel}
        </span>
        {isEditingName ? (
          <input
            type="text"
            className="bg-transparent border-0 border-b border-gray-300 dark:border-white/30 outline-none text-[9px] text-gray-500 dark:text-white/50 tracking-wider py-0 focus:border-blue-500 max-w-[50px]"
            value={localName}
            onChange={(e) => setLocalName(e.target.value)}
            onKeyDown={handleNameKeyDown}
            onBlur={handleNameSubmit}
            autoFocus
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          />
        ) : (
          <div className="w-0 min-w-full overflow-hidden">
            <Tooltip delayDuration={500}>
              <TooltipTrigger asChild>
                <span
                  className="text-[9px] text-gray-400 dark:text-white/40 tracking-wider cursor-pointer hover:text-gray-600 dark:hover:text-white/60 transition-colors truncate block"
                  onDoubleClick={() => {
                    setLocalName(storedName);
                    setIsEditingName(true);
                  }}
                >
                  {storedName || "(variable name)"}
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-[10px]">
                Double click to set variable name
              </TooltipContent>
            </Tooltip>
          </div>
        )}
      </div>
      {isDebugPreviewActive && (
        <Tooltip delayDuration={300}>
          <TooltipTrigger asChild>
            <button
              type="button"
              className={cn(
                "nodrag nopan inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors",
                debugPreviewMode === "raw"
                  ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-200"
                  : "border-transparent text-gray-500 hover:bg-white/40 dark:hover:bg-white/10",
              )}
              aria-label={
                debugPreviewMode === "raw"
                  ? "Show color debug preview"
                  : "Show raw value debug preview"
              }
              aria-pressed={debugPreviewMode !== "color"}
              onClick={(event) => {
                event.stopPropagation();
                toggleDebugPreviewMode(id);
              }}
              onMouseDown={(event) => event.stopPropagation()}
            >
              <Hash className="h-3 w-3" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-[10px]">
            {debugPreviewMode === "raw"
              ? "Raw value preview"
              : "Color preview"}
          </TooltipContent>
        </Tooltip>
      )}
      <Tooltip delayDuration={300}>
        <TooltipTrigger asChild>
          <button
            type="button"
            className={cn(
              "nodrag nopan inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors",
              isDebugPreviewActive
                ? "border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-200"
                : "border-transparent text-gray-500 hover:bg-white/40 dark:hover:bg-white/10",
            )}
            aria-label={
              isDebugPreviewActive
                ? "Hide node debug preview"
                : "Show node debug preview"
            }
            aria-pressed={isDebugPreviewActive}
            onClick={(event) => {
              event.stopPropagation();
              toggleDebugPreviewActive(id);
            }}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <Bug className="h-3 w-3" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-[10px]">
          {isDebugPreviewActive ? "Hide debug preview" : "Show debug preview"}
        </TooltipContent>
      </Tooltip>
    </div>
  );

  if (isMultiOpNode) {
    return (
      <div className={shellClass}>
        {header}
        {debugPreviewSlot}
        <div className={cn("flex flex-col gap-1 pt-1 pb-1.5", contentClass)}>
          {operations.length === 0 ? (
            <div className="px-3 py-2 text-[10px] text-muted-foreground">
              No operations yet
            </div>
          ) : (
            operations.map((op, index) => {
              const params = getMultiOpParams(op.op, index === 0);
              return (
                <div key={op.id} className="flex flex-col gap-1">
                  <div className="flex items-start justify-between min-h-[24px]">
                    <div className="flex flex-col gap-0.5 min-w-0">
                      {params.length === 0 ? (
                        <></>
                      ) : (
                        params.map((param) => {
                          const handleId = getMultiOpHandleId(op.id, param.key);
                          return (
                            <div
                              key={handleId}
                              className="flex items-center gap-2"
                            >
                              <TSLHandle
                                id={handleId}
                                type="target"
                                position={Position.Left}
                                dataType={param.type as TSLType}
                                label={param.label}
                                isConnected={connectedInputs.has(handleId)}
                                isDark={isDark}
                              />
                              {!connectedInputs.has(handleId) && (
                                <div className="flex-1 min-w-0">
                                  <ValuePreview
                                    type={param.type}
                                    value={
                                      nodeData.values?.[handleId] ??
                                      param.default
                                    }
                                  />
                                </div>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                    <div className="flex items-center gap-1 pr-2">
                      <div className="nodrag nopan ml-2 max-w-[100px]">
                        <Combobox
                          items={MULTI_OP_OPTIONS.map((option) => option.value)}
                          value={op.op}
                          onValueChange={(value) => {
                            if (!value) return;
                            updateMultiOp(id, op.id, value as MultiOpType);
                          }}
                          itemToStringLabel={(value) =>
                            getMultiOpLabel(String(value))
                          }
                          itemToStringValue={(value) => String(value)}
                        >
                          <ComboboxInput
                            placeholder="Select op"
                            className="h-6 min-w-[50px] max-w-[100px] bg-transparent border border-gray-200 dark:border-white/10 rounded-md text-gray-700 dark:text-white/80 [&_[data-slot=input-group-control]]:h-6 [&_[data-slot=input-group-control]]:text-[9px] [&_[data-slot=input-group-control]]:px-2 [&_[data-slot=input-group-control]]:py-0"
                            showClear={false}
                          />
                          <ComboboxContent align="start" sideOffset={4}>
                            <ComboboxEmpty>No items found.</ComboboxEmpty>
                            <ComboboxList>
                              {(item) => (
                                <ComboboxItem
                                  key={String(item)}
                                  value={item}
                                  className="text-[11px]"
                                >
                                  {getMultiOpLabel(String(item))}
                                </ComboboxItem>
                              )}
                            </ComboboxList>
                          </ComboboxContent>
                        </Combobox>
                      </div>
                      <button
                        type="button"
                        className="h-6 w-6 text-[10px] rounded-md border border-transparent text-muted-foreground hover:text-destructive hover:border-destructive/40 hover:bg-destructive/10 transition-colors"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeMultiOp(id, op.id);
                        }}
                        onMouseDown={(e) => e.stopPropagation()}
                        aria-label={`Remove ${getMultiOpLabel(op.op)}`}
                      >
                        ×
                      </button>
                    </div>
                  </div>
                  {index < operations.length - 1 && (
                    <Separator className="my-1 max-w-[90%] mx-auto" />
                  )}
                </div>
              );
            })
          )}

          <div className="px-2 pt-1">
            <button
              type="button"
              className="w-full h-7 text-[10px] uppercase tracking-wider border border-dashed border-gray-300 dark:border-white/20 rounded-md text-gray-500 dark:text-white/50 hover:text-gray-700 dark:hover:text-white/80 hover:border-gray-400 dark:hover:border-white/40 transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                addMultiOp(id, "add");
              }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              + Add Operation
            </button>
          </div>

          <div className="flex items-center justify-end">
            <TSLHandle
              id="out"
              type="source"
              position={Position.Right}
              dataType={inferredOutputTypes.get("out") ?? "any"}
              label="Out"
              isConnected={connectedOutputs.has("out")}
              isDark={isDark}
            />
          </div>
        </div>
      </div>
    );
  }

  const inputKeys = Object.keys(inputs);
  const outputKeys = Object.keys(outputs);
  const isLinearGradientNode = nodeType === "utils/linearGradient";
  const linearGradientPreview = isLinearGradientNode
    ? generateGradientString(
        "linear",
        90,
        normalizeGradientStops(nodeData.values?.stops),
        Number(nodeData.values?.mode ?? 0),
      )
    : null;

  const isTextureSample = nodeType === "texture/sample";
  const textureToggleKeys = isTextureSample
    ? new Set<string>(TEXTURE_PROP_INPUTS)
    : null;

  // Filter out hidden inputs from node UI
  let visibleInputKeys = inputKeys.filter((k) => !inputs[k].hidden);
  let visibleOutputKeys = outputKeys.filter((k) => !outputs[k].hidden);
  if (isMaterialNode) {
    const activeInputs = getMaterialActiveInputsSet(data, def, connectedInputs);
    visibleInputKeys = visibleInputKeys.filter((key) => activeInputs.has(key));
  } else if (textureToggleKeys && textureToggleKeys.size > 0) {
    const activeInputs = getMaterialActiveInputsSet(data, def, connectedInputs);
    visibleInputKeys = visibleInputKeys.filter(
      (key) => !textureToggleKeys.has(key) || activeInputs.has(key),
    );
  }
  if (isPostInputNode) {
    const activeOutputs = new Set(
      Array.isArray(nodeData.activeInputs)
        ? nodeData.activeInputs
        : POST_INPUT_DEFAULT_OUTPUTS,
    );
    for (const key of connectedOutputs) {
      if (key) activeOutputs.add(key);
    }
    visibleOutputKeys = visibleOutputKeys.filter((key) =>
      activeOutputs.has(key),
    );
  }
  if (isPostOutputNode) {
    const colorControlKeys = new Set<string>(POST_OUTPUT_COLOR_CONTROL_INPUTS);
    const activeControls = new Set(
      Array.isArray(nodeData.activeInputs) ? nodeData.activeInputs : [],
    );
    visibleInputKeys = visibleInputKeys.filter(
      (key) => !colorControlKeys.has(key) || activeControls.has(key),
    );
  }
  // Include 'out' in the main list of outputs.
  // We strictly align by index now for compactness
  const maxRows = Math.max(visibleInputKeys.length, visibleOutputKeys.length);

  const rows: Array<{
    key: string;
    input: [string, (typeof inputs)[string]] | null;
    output: [string, (typeof outputs)[string]] | null;
  }> = [];

  for (let i = 0; i < maxRows; i++) {
    const inputKey = visibleInputKeys[i];
    const outputKey = visibleOutputKeys[i];

    rows.push({
      key: `row-${i}`,
      input: inputKey ? [inputKey, inputs[inputKey]] : null,
      output: outputKey ? [outputKey, outputs[outputKey]] : null,
    });
  }

  return (
    <div className={shellClass}>
      {header}
      {debugPreviewSlot}

      {/* Content - Removed px-2 to allow handles to touch edges pattern. Added pb-3 for safe area near rounded corners */}
      <div
        className={cn(
          "flex flex-col gap-0 pt-1 pb-1.5 rounded-b-xl",
          contentClass,
        )}
      >
        {linearGradientPreview && (
          <div className="px-2 pb-1">
            <div
              className="h-3 rounded "
              style={{ background: linearGradientPreview }}
            />
          </div>
        )}
        {rows.map((row) => (
          <div
            key={row.key}
            className="flex items-center justify-between min-h-[22px]"
          >
            {/* Input Side */}
            <div className="flex items-center flex-1 min-w-0 mr-2">
              {/* Added mr-2 to separate from output side */}
              {row.input ? (
                <>
                  {!row.input[1].propertyOnly && (
                    <TSLHandle
                      id={row.input[0]}
                      type="target"
                      position={Position.Left}
                      dataType={row.input[1].type as TSLType}
                      label={row.input[1].label}
                      isConnected={connectedInputs.has(row.input[0])}
                      isDark={isDark}
                      isMaterialNode={isMaterialNode}
                    />
                  )}

                  {row.input[1].propertyOnly && (
                    <span className="text-[9px] text-gray-500 dark:text-gray-400 mr-2 font-mono uppercase tracking-wider ml-2">
                      {row.input[1].label}
                    </span>
                  )}

                  {/* Value Preview / Control - only if not connected */}
                  {!connectedInputs.has(row.input[0]) &&
                    !row.input[1].connectionOnly && (
                      <div
                        className={cn(
                          "flex-1 flex items-center min-w-0",
                          row.input[1].propertyOnly && "justify-end",
                        )}
                      >
                        <ValuePreview
                          inputKey={row.input[0]}
                          type={row.input[1].type}
                          value={
                            nodeData.values?.[row.input[0]] ??
                            row.input[1].default
                          }
                        />
                      </div>
                    )}
                </>
              ) : (
                <div className="flex-1" />
              )}
            </div>

            {/* Output Side */}
            <div className="flex items-center shrink-0">
              {row.output && (
                <TSLHandle
                  id={row.output[0]}
                  type="source"
                  position={Position.Right}
                  dataType={
                    inferredOutputTypes.get(row.output[0]) ??
                    (row.output[1].type as TSLType)
                  }
                  label={row.output[1].label}
                  isConnected={connectedOutputs.has(row.output[0])}
                  isDark={isDark}
                />
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DebugPreviewSlot({
  nodeId,
  status,
  error,
}: {
  nodeId: string;
  status: DebugPreviewStatus;
  error: string | null;
}) {
  const message = error || (!status.supported ? status.reason : null);

  return (
    <div>
      <div
        data-debug-preview-node-id={
          status.supported && !error ? nodeId : undefined
        }
        className={cn(
          "relative h-28 min-w-[120px] overflow-hidden border",
          "border-gray-200/80 dark:border-white/10",
          message ? "bg-white/95 dark:bg-card/95 backdrop-blur-sm" : "bg-transparent",
        )}
      >
        {message && (
          <div className="absolute inset-0 flex items-center justify-center px-2 text-center text-[9px] leading-tight text-muted-foreground">
            {message}
          </div>
        )}
      </div>
    </div>
  );
}

// Value Preview Components - Read-only previews for node values
interface ValuePreviewProps {
  inputKey?: string;
  type: string;
  value: TSLValueType;
}

function ValuePreview({ inputKey, type, value }: ValuePreviewProps) {
  // If type is explicitly one of these, use it.
  // If 'any', try to infer from value.
  const isVector =
    type.startsWith("vec") || (type === "any" && Array.isArray(value));
  const isBool =
    type === "bool" || (type === "any" && typeof value === "boolean");
  const isColor = type === "color"; // Value inference for color is harder (hex string vs string), assume any defaults to float/vec unless explicit hex?

  // Check if value looks like a color string if type is any?
  const looksLikeColor =
    type === "any" && typeof value === "string" && value.startsWith("#");

  if (type === "string") {
    // Handle AssetValue objects (e.g., {url: "...", assetId: "..."})
    let stringValue = "";
    if (value && typeof value === "object" && "url" in value) {
      stringValue = (value as { url: string }).url || "";
    } else {
      stringValue = String(value ?? "");
    }
    const isImage = inputKey === "url" || isLikelyImageUrl(stringValue);
    return <StringPreview value={stringValue} isImage={isImage} />;
  }
  if (isColor || looksLikeColor) {
    return <ColorInputPreview value={String(value ?? "#ffffff")} />;
  }
  if (isBool) {
    return (
      <span className="text-[10px] text-gray-500 font-mono">
        {value ? "true" : "false"}
      </span>
    );
  }
  if (isVector) {
    const arr = Array.isArray(value) ? value : [Number(value ?? 0)];
    return (
      <span className="text-[9px] text-gray-500 font-mono">
        ({arr.map((n) => (typeof n === "number" ? n.toFixed(1) : n)).join(",")})
      </span>
    );
  }
  return <NumberPreview value={Number(value ?? 0)} />;
}

function ColorInputPreview({ value }: { value: string }) {
  return (
    <div
      className="h-3 w-3 rounded-[3px] shadow-sm border border-gray-200 dark:border-white/10"
      style={{ backgroundColor: value }}
      title={value}
    />
  );
}

function NumberPreview({ value }: { value: number }) {
  return (
    //vertically center the text
    <span className="text-[9px] text-gray-500 font-mono tabular-nums flex items-center">
      ({Number.isInteger(value) ? value : value.toFixed(2)})
    </span>
  );
}

function StringPreview({
  value,
  isImage,
}: {
  value: string;
  isImage: boolean;
}) {
  if (!value)
    return (
      <span className="text-[9px] text-muted-foreground italic">Empty</span>
    );
  if (!isImage) {
    return (
      <span
        className="text-[9px] text-gray-500 font-mono truncate max-w-[80px]"
        title={value}
      >
        {value}
      </span>
    );
  }

  return (
    <div className="w-16 h-16 rounded overflow-hidden border border-gray-200 dark:border-white/10 bg-checkered">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={value}
        alt="tex"
        className="w-full h-full object-cover"
        onError={(e) => {
          (e.target as HTMLImageElement).style.display = "none";
          (e.target as HTMLImageElement).parentElement!.innerText = "Img Err";
          (e.target as HTMLImageElement).parentElement!.className =
            "w-16 h-16 text-[8px] flex items-center justify-center text-red-500 border border-red-200 bg-red-50";
        }}
      />
    </div>
  );
}

function isLikelyImageUrl(value: string): boolean {
  if (!value) return false;
  if (value.startsWith("data:image/")) return true;
  const clean = value.split("?")[0].split("#")[0].toLowerCase();
  return /\.(png|jpe?g|webp|gif|bmp|svg)$/.test(clean);
}

function areTSLNodePropsEqual(prev: TSLNodeProps, next: TSLNodeProps) {
  return (
    prev.id === next.id &&
    prev.type === next.type &&
    prev.selected === next.selected &&
    prev.data === next.data
  );
}

export const TSLNode = memo(TSLNodeComponent, areTSLNodePropsEqual);
