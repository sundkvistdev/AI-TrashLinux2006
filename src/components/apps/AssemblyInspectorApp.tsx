import React, { useState, useEffect } from "react";
import { SystemCallInterface } from "../../types/os";
import { 
  ISocAssembly, 
  TypeKind,
  ISocField,
  ISocProperty,
  ISocEvent,
  ISocMethod
} from "../../types/soc";
import { initGsocCache } from "../../kernel/gsocc";
import { TreeView } from "./assembly-inspector/TreeView";
import { stepTLML, initialVMState, VMState } from "./assembly-inspector/VMSimulator";
import { 
  Search, 
  Cpu, 
  Play, 
  Pause, 
  ChevronRight, 
  RefreshCw,
  FolderTree,
  Binary,
  Database
} from "lucide-react";

interface AssemblyInspectorAppProps {
  syscall: SystemCallInterface;
}

export default function AssemblyInspectorApp({ syscall }: AssemblyInspectorAppProps) {
  // Global GSOCC cache
  const [cache, setCache] = useState<Record<string, ISocAssembly>>({});
  const [selectedItem, setSelectedItem] = useState<any>({ type: "welcome" });
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({
    "asm_TLML.Lang.dll": true,
    "ns_TLML.Lang.dll_TLML.Lang": true
  });
  const [searchQuery, setSearchQuery] = useState("");

  // VM Simulator States for methods
  const [vmState, setVmState] = useState<VMState | null>(null);
  const [vmActiveMethod, setVmActiveMethod] = useState<string | null>(null);
  const [vmIsRunning, setVmIsRunning] = useState(false);

  // Load and initialize cache
  useEffect(() => {
    initGsocCache(syscall);
    if ((window as any).GSOCC) {
      setCache((window as any).GSOCC.assemblies);
    }
  }, [syscall]);

  const handleRefresh = () => {
    initGsocCache(syscall);
    if ((window as any).GSOCC) {
      setCache({ ...(window as any).GSOCC.assemblies });
    }
  };

  // Toggle tree directory node
  const toggleNode = (id: string) => {
    setExpandedNodes(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // Run auto step timer
  useEffect(() => {
    let timer: any = null;
    if (vmIsRunning && vmState && !vmState.isCompleted) {
      timer = setInterval(() => {
        setVmState(prev => {
          if (!prev || prev.isCompleted) {
            setVmIsRunning(false);
            return prev;
          }
          return stepTLML(prev);
        });
      }, 600);
    } else if (vmState?.isCompleted) {
      setVmIsRunning(false);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [vmIsRunning, vmState]);

  // Initialize VM state on click
  const loadVMMethod = (methodName: string, bodyText: string) => {
    setVmActiveMethod(methodName);
    setVmIsRunning(false);
    setVmState(initialVMState(methodName, bodyText));
  };

  const handleStepVM = () => {
    if (vmState) {
      setVmState(stepTLML(vmState));
    }
  };

  const handleResetVM = (bodyText: string) => {
    if (vmActiveMethod) {
      setVmIsRunning(false);
      setVmState(initialVMState(vmActiveMethod, bodyText));
    }
  };

  // Get selected details
  const getSelectedData = () => {
    if (!selectedItem || selectedItem.type === "welcome") return null;
    const asm = cache[selectedItem.assemblyName];
    if (!asm) return null;

    if (selectedItem.type === "assembly") return { assembly: asm };
    if (selectedItem.type === "references") return { assembly: asm };

    const ns = asm.namespaces.find((n: any) => n.name === selectedItem.namespaceName);
    if (!ns) return null;
    if (selectedItem.type === "namespace") return { assembly: asm, namespace: ns };

    const type = ns.types.find((t: any) => t.name === selectedItem.typeName);
    if (!type) return null;
    if (selectedItem.type === "type") return { assembly: asm, namespace: ns, type };

    // Leaf types
    const classType = type as any;
    if (selectedItem.type === "constant") {
      const c = classType.constants?.find((item: any) => item.name === selectedItem.name);
      return { assembly: asm, namespace: ns, type, item: c };
    }
    if (selectedItem.type === "field") {
      const f = classType.fields?.find((item: any) => item.name === selectedItem.name);
      return { assembly: asm, namespace: ns, type, item: f };
    }
    if (selectedItem.type === "property") {
      const p = classType.properties?.find((item: any) => item.name === selectedItem.name);
      return { assembly: asm, namespace: ns, type, item: p };
    }
    if (selectedItem.type === "event") {
      const e = classType.events?.find((item: any) => item.name === selectedItem.name);
      return { assembly: asm, namespace: ns, type, item: e };
    }
    if (selectedItem.type === "method") {
      const m = classType.methods?.find((item: any) => item.name === selectedItem.name);
      return { assembly: asm, namespace: ns, type, item: m };
    }
    return null;
  };

  const details = getSelectedData();

  return (
    <div className="h-full flex flex-col bg-[#f6f6f0] text-[#2e3436] font-sans antialiased text-xs">
      {/* Top Controls Bar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#e9e9df] border-b border-[#babdb6] shrink-0">
        <div className="flex items-center space-x-2">
          <Database className="w-4 h-4 text-[#555753]" />
          <span className="font-bold tracking-tight text-gray-800 text-[13px]">GSOCC Cache Inspector</span>
          <span className="bg-[#babdb6] text-white px-1.5 py-0.5 rounded text-[9px] font-mono leading-none">TLML Standard</span>
        </div>

        {/* Global Search Bar */}
        <div className="relative w-64">
          <input
            type="text"
            placeholder="Search types, members, or instructions..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white border border-[#babdb6] rounded pl-6 pr-2 py-0.5 text-xs font-mono outline-none focus:border-blue-500 shadow-inner"
          />
          <Search className="absolute left-2 top-1.5 w-3 h-3 text-gray-400" />
        </div>
      </div>

      {/* Main Panel Division */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Tree Pane */}
        <div className="w-[300px] bg-[#fdfdfc] border-r border-[#babdb6] flex flex-col overflow-y-auto">
          <div className="p-2 bg-[#eeeeec] border-b border-[#babdb6] flex items-center justify-between shrink-0">
            <div className="flex items-center space-x-1 text-[11px] font-bold uppercase text-[#555753]">
              <FolderTree className="w-3.5 h-3.5" />
              <span>SOC Cache Directory</span>
            </div>
            <button 
              onClick={handleRefresh}
              className="px-2 py-0.5 bg-[#d3d7cf] border border-[#babdb6] hover:bg-[#c0c4bc] rounded flex items-center space-x-1 font-mono text-[9px] cursor-pointer"
              title="Refresh GSOCC assemblies cache"
            >
              <RefreshCw className="w-2.5 h-2.5" />
              <span>Refresh</span>
            </button>
          </div>

          <TreeView
            cache={cache}
            expandedNodes={expandedNodes}
            toggleNode={toggleNode}
            selectedItem={selectedItem}
            setSelectedItem={setSelectedItem}
            searchQuery={searchQuery}
          />
        </div>

        {/* Right Details / Options Dashboard Pane */}
        <div className="flex-1 bg-white overflow-y-auto flex flex-col">
          {/* Welcome Dashboard */}
          {selectedItem.type === "welcome" && (
            <div className="p-6 max-w-4xl space-y-6">
              <div>
                <h1 className="text-xl font-bold text-gray-900 tracking-tight">Global Shared Object Collection Cache (GSOCC)</h1>
                <p className="text-gray-500 mt-1 text-[13px]">
                  Explore loaded system assemblies, inspect classes and members, or debug method bytecode in the virtual machine execution environment.
                </p>
              </div>

              {/* Statistics & Overview card */}
              <div className="bg-[#fcfcfa] border border-[#d3d7cf] rounded p-4 shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b border-[#d3d7cf] pb-2">
                  <div className="flex items-center space-x-2">
                    <Database className="w-4 h-4 text-blue-600" />
                    <span className="font-bold text-gray-800 text-[12px]">Assemblies Status Overview</span>
                  </div>
                  <button
                    onClick={handleRefresh}
                    className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-3 py-1 rounded text-[11px] shadow-sm flex items-center space-x-1"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Sync Cache</span>
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-gray-50 border border-gray-200 rounded p-3 text-center">
                    <span className="text-[10px] uppercase font-bold text-gray-500 block">Loaded Assemblies Count</span>
                    <span className="text-3xl font-bold font-mono text-purple-600 block mt-1">{Object.keys(cache).length}</span>
                  </div>
                  <div className="bg-gray-50 border border-gray-200 rounded p-3 text-center flex flex-col justify-center">
                    <span className="text-[10px] uppercase font-bold text-gray-500 block">Active Runtime</span>
                    <span className="text-sm font-bold font-mono text-emerald-600 block mt-2">TLML Managed Environment</span>
                  </div>
                </div>

                <div>
                  <h3 className="font-bold text-gray-700 text-[11px] uppercase mb-2">Registered Assemblies</h3>
                  <div className="space-y-1">
                    {Object.values(cache).map(asm => (
                      <div key={asm.name} className="flex items-center justify-between p-2 bg-gray-50 rounded border border-gray-200 font-mono text-[11px]">
                        <span className="font-bold text-gray-800">{asm.name}</span>
                        <span className="text-gray-500">v{asm.version}</span>
                      </div>
                    ))}
                    {Object.keys(cache).length === 0 && (
                      <p className="text-gray-400 italic">No assemblies loaded. Compile your TLML code in the IDE to register a new assembly.</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Assembly / Reference Detail Options */}
          {(selectedItem.type === "assembly" || selectedItem.type === "references") && details?.assembly && (
            <div className="p-5 space-y-6">
              <div className="border-b border-[#babdb6] pb-3">
                <h1 className="text-lg font-bold text-gray-900 font-mono">Assembly: {details.assembly.name}</h1>
                <p className="text-gray-500 font-mono mt-0.5 text-[11px]">Token: {details.assembly.publicKeyToken || "0x00000000"}</p>
              </div>

              {/* High density detail attributes */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-50 border border-gray-200 rounded p-3 font-mono space-y-1">
                  <span className="text-[10px] font-bold text-gray-500 block uppercase">Metadata Specifications</span>
                  <p><span className="text-gray-400">Version:</span> {details.assembly.version}</p>
                  <p><span className="text-gray-400">Bound:</span> Local Shared Directory</p>
                  <p><span className="text-gray-400">Namespaces:</span> {details.assembly.namespaces.length}</p>
                </div>

                <div className="bg-gray-50 border border-gray-200 rounded p-3 font-mono space-y-1">
                  <span className="text-[10px] font-bold text-gray-500 block uppercase">Dependencies Map</span>
                  {selectedItem.type === "references" ? (
                    <div className="text-gray-700 text-[11px] leading-tight mt-1">
                      {details.assembly.dependencies.map((dep: any, idx: number) => (
                        <p key={idx} className="flex items-center space-x-1 font-mono py-0.5 border-b border-gray-100 last:border-0">
                          <Binary className="w-3 h-3 text-purple-500" />
                          <span>{dep.assemblyName} (v{dep.version})</span>
                        </p>
                      ))}
                    </div>
                  ) : (
                    <p className="text-gray-600 italic">Select "References" in cache directory directory tree to view direct import linkages.</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Namespace Detail Options */}
          {selectedItem.type === "namespace" && details?.namespace && (
            <div className="p-5 space-y-6">
              <div className="border-b border-[#babdb6] pb-3">
                <h1 className="text-lg font-bold text-gray-900 font-mono">Namespace: {details.namespace.name}</h1>
                <p className="text-gray-500 font-mono mt-0.5 text-[11px]">Belongs to assembly: {details.assembly.name}</p>
              </div>

              {/* Category high density grids */}
              <div className="grid grid-cols-4 gap-4">
                <div className="bg-gray-50 border rounded p-3 text-center">
                  <span className="text-[10px] font-bold text-gray-500 block uppercase">Classes</span>
                  <span className="text-lg font-bold font-mono text-blue-600">
                    {details.namespace.types.filter((t: any) => t.kind === TypeKind.Class).length}
                  </span>
                </div>
                <div className="bg-gray-50 border rounded p-3 text-center">
                  <span className="text-[10px] font-bold text-gray-500 block uppercase">Interfaces</span>
                  <span className="text-lg font-bold font-mono text-rose-600">
                    {details.namespace.types.filter((t: any) => t.kind === TypeKind.Interface).length}
                  </span>
                </div>
                <div className="bg-gray-50 border rounded p-3 text-center">
                  <span className="text-[10px] font-bold text-gray-500 block uppercase">Enums</span>
                  <span className="text-lg font-bold font-mono text-teal-600">
                    {details.namespace.types.filter((t: any) => t.kind === TypeKind.Enum).length}
                  </span>
                </div>
                <div className="bg-gray-50 border rounded p-3 text-center">
                  <span className="text-[10px] font-bold text-gray-500 block uppercase">Structs</span>
                  <span className="text-lg font-bold font-mono text-cyan-600">
                    {details.namespace.types.filter((t: any) => t.kind === TypeKind.Struct).length}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Type Detail Control Options (Class / Struct / Interface / Delegate / Enum) */}
          {selectedItem.type === "type" && details?.type && (
            <div className="p-5 space-y-6">
              <div className="border-b border-[#babdb6] pb-3 flex items-center justify-between">
                <div>
                  <h1 className="text-lg font-bold text-gray-900 font-mono">Type: {details.type.name}</h1>
                  <p className="text-gray-500 font-mono mt-0.5 text-[11px]">Kind: {details.type.kind} | Modifier: {details.type.accessModifier || "Public"}</p>
                </div>
              </div>

              {/* Specific Enum Visualizer */}
              {details.type.kind === TypeKind.Enum && (
                <div className="space-y-4">
                  <div className="bg-gray-50 border rounded p-3">
                    <h3 className="font-bold text-[11px] uppercase text-gray-500 mb-2 font-mono">Bitwise Constants</h3>
                    <table className="w-full text-left font-mono text-[11px]">
                      <thead>
                        <tr className="border-b border-gray-200 text-gray-400">
                           <th className="py-1">Constant</th>
                           <th className="py-1">Dec</th>
                           <th className="py-1">Hex</th>
                           <th className="py-1">Binary Stream</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 text-gray-700">
                        {((details.type as any).constants || []).map((c: any) => (
                          <tr key={c.name}>
                            <td className="py-1.5 font-bold text-teal-700">{c.name}</td>
                            <td className="py-1.5">{c.value}</td>
                            <td className="py-1.5 text-indigo-600">0x{Number(c.value).toString(16).toUpperCase()}</td>
                            <td className="py-1.5 text-gray-500 font-mono">{String(Number(c.value).toString(2)).padStart(8, "0")}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Members listing for Classes / Structs / Interfaces */}
              {(details.type.kind === TypeKind.Class || details.type.kind === TypeKind.Struct || details.type.kind === TypeKind.Interface) && (
                <div className="bg-[#fcfcfa] border border-[#d3d7cf] rounded p-4 space-y-4">
                  <h3 className="font-bold text-gray-800 text-[12px] border-b pb-1.5">Type Members</h3>
                  <div className="space-y-2 font-mono text-[11px]">
                    {/* Fields */}
                    {((details.type as any).fields || []).length > 0 && (
                      <div>
                        <span className="text-gray-400 font-bold block mb-1">FIELDS</span>
                        <div className="pl-2 space-y-1 border-l border-gray-200">
                          {((details.type as any).fields).map((f: ISocField) => (
                            <div key={f.name} className="flex justify-between py-0.5">
                              <span className="text-gray-700 font-semibold">{f.accessModifier.toLowerCase()} {f.isStatic ? 'static ' : ''}{f.type} {f.name}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {/* Properties */}
                    {((details.type as any).properties || []).length > 0 && (
                      <div className="mt-2">
                        <span className="text-gray-400 font-bold block mb-1">PROPERTIES</span>
                        <div className="pl-2 space-y-1 border-l border-gray-200">
                          {((details.type as any).properties).map((p: ISocProperty) => (
                            <div key={p.name} className="flex justify-between py-0.5">
                              <span className="text-gray-700 font-semibold">{p.accessModifier.toLowerCase()} {p.isStatic ? 'static ' : ''}{p.type} {p.name} {'{'} {p.hasGet ? 'get; ' : ''}{p.hasSet ? 'set; ' : ''}{'}'}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {/* Events */}
                    {((details.type as any).events || []).length > 0 && (
                      <div className="mt-2">
                        <span className="text-gray-400 font-bold block mb-1">EVENTS</span>
                        <div className="pl-2 space-y-1 border-l border-gray-200">
                          {((details.type as any).events).map((e: ISocEvent) => (
                            <div key={e.name} className="flex justify-between py-0.5">
                              <span className="text-gray-700 font-semibold">{e.accessModifier.toLowerCase()} {e.isStatic ? 'static ' : ''}event {e.handlerType} {e.name}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {/* Methods */}
                    {((details.type as any).methods || []).length > 0 && (
                      <div className="mt-2">
                        <span className="text-gray-400 font-bold block mb-1">METHODS</span>
                        <div className="pl-2 space-y-1 border-l border-gray-200">
                          {((details.type as any).methods).map((m: ISocMethod) => (
                            <div key={m.name} className="flex justify-between py-0.5">
                              <span className="text-gray-700 font-semibold">{m.accessModifier.toLowerCase()} {m.isStatic ? 'static ' : ''}{m.returnType} {m.name}({m.parameters.map(p => `${p.type} ${p.name}`).join(', ')})</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Leaf members options and simulations */}
          {details && ["constant", "field", "property", "event", "method"].includes(selectedItem.type) && (
            <div className="p-5 flex-1 flex flex-col min-h-0 space-y-4">
              <div className="border-b border-[#babdb6] pb-3 shrink-0">
                <h1 className="text-lg font-bold text-gray-900 font-mono flex items-center space-x-1.5">
                  <span className="capitalize">{selectedItem.type}:</span>
                  <span className="text-blue-700">{selectedItem.name || (details as any).item?.name}</span>
                </h1>
                <p className="text-gray-500 font-mono mt-0.5 text-[11px]">
                  Parent type: {selectedItem.typeName} | Modifier: {(details as any).item?.accessModifier || "Public"}
                </p>
              </div>

              {/* Constant Options details */}
              {selectedItem.type === "constant" && (
                <div className="space-y-4">
                  <div className="bg-gray-50 border rounded p-4 font-mono text-[11px] space-y-1.5 max-w-xl">
                    <p><span className="text-gray-400">Constant Value:</span> {(details as any).item?.value}</p>
                    <p><span className="text-gray-400">Data Type:</span> {(details as any).item?.type}</p>
                    <p><span className="text-gray-400">Literal Hex Representation:</span> 0x{Number((details as any).item?.value).toString(16).toUpperCase()}</p>
                  </div>
                </div>
              )}

              {/* Field / Property / Event static details */}
              {["field", "property", "event"].includes(selectedItem.type) && (
                <div className="space-y-4">
                  <div className="bg-gray-50 border rounded p-4 font-mono text-[11px] space-y-1.5 max-w-xl">
                    <p><span className="text-gray-400">Name:</span> {selectedItem.name}</p>
                    <p><span className="text-gray-400">Type/Signature:</span> {(details as any).item?.type || (details as any).item?.handlerType || "Unknown"}</p>
                    <p><span className="text-gray-400">Scope:</span> {(details as any).item?.isStatic ? "Static" : "Instance"}</p>
                    {selectedItem.type === "property" && (
                      <p><span className="text-gray-400">Capabilities:</span> {((details as any).item?.hasGet ? "get " : "") + ((details as any).item?.hasSet ? "set" : "")}</p>
                    )}
                  </div>
                </div>
              )}

              {/* Method bytecode simulator / Interactive VM debugger */}
              {selectedItem.type === "method" && (
                <div className="flex-1 flex flex-col min-h-0 space-y-3">
                  {/* Load / reload debugger controls */}
                  <div className="flex items-center justify-between bg-gray-100 border border-gray-200 p-2 rounded shrink-0">
                    <div className="flex items-center space-x-2">
                      <Cpu className="w-4 h-4 text-emerald-600" />
                      <span className="font-bold text-gray-700 font-mono text-[11px]">Debugger state:</span>
                      {vmActiveMethod === selectedItem.name && vmState ? (
                        <span className="text-[10px] px-1.5 py-0.5 bg-emerald-100 text-emerald-800 rounded font-bold font-mono">
                          PC: {vmState.pc} / {vmState.instructions.length} {vmState.isCompleted ? "[COMPLETED]" : "[READY]"}
                        </span>
                      ) : (
                        <span className="text-[10px] px-1.5 py-0.5 bg-gray-200 text-gray-600 rounded font-bold font-mono">NOT LOADED</span>
                      )}
                    </div>

                    <div className="flex items-center space-x-2 font-mono text-[10px]">
                      {vmActiveMethod === selectedItem.name && vmState ? (
                        <>
                          <button
                            onClick={handleStepVM}
                            disabled={vmState.isCompleted || vmIsRunning}
                            className={`px-2 py-1 border rounded font-semibold flex items-center space-x-1 cursor-pointer ${
                              vmState.isCompleted || vmIsRunning ? "bg-gray-100 text-gray-400 border-gray-200" : "bg-white text-gray-800 border-gray-300 hover:bg-gray-50"
                            }`}
                            title="Execute single instruction step"
                          >
                            <ChevronRight className="w-3.5 h-3.5" />
                            <span>Step (F10)</span>
                          </button>

                          <button
                            onClick={() => setVmIsRunning(!vmIsRunning)}
                            disabled={vmState.isCompleted}
                            className={`px-2.5 py-1 rounded text-white font-semibold flex items-center space-x-1 cursor-pointer ${
                              vmState.isCompleted ? "bg-gray-300 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700"
                            }`}
                          >
                            {vmIsRunning ? <Pause className="w-3 h-3 fill-white" /> : <Play className="w-3 h-3 fill-white" />}
                            <span>{vmIsRunning ? "Pause" : "Run (F5)"}</span>
                          </button>

                          <button
                            onClick={() => handleResetVM((details as any).item?.bodySimulated || "")}
                            className="px-2 py-1 bg-white border border-gray-300 text-gray-800 hover:bg-gray-50 rounded font-semibold flex items-center space-x-1 cursor-pointer"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                            <span>Reset (F11)</span>
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => loadVMMethod(selectedItem.name, (details as any).item?.bodySimulated || "")}
                          className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded shadow-sm flex items-center space-x-1 cursor-pointer"
                        >
                          <Cpu className="w-3.5 h-3.5" />
                          <span>Attach VM Debugger</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Split screen debugger panels */}
                  {vmActiveMethod === selectedItem.name && vmState ? (
                    <div className="flex-1 grid grid-cols-12 gap-3 min-h-0 overflow-hidden">
                      {/* Left: Bytecode Instruction panel */}
                      <div className="col-span-7 border rounded flex flex-col min-h-0 bg-white">
                        <span className="bg-[#eeeeec] border-b px-2.5 py-1.5 font-bold uppercase text-gray-500 text-[10px] tracking-wider font-mono">
                          Instruction stream
                        </span>
                        <div className="flex-1 overflow-y-auto p-1 font-mono text-[10px] space-y-0.5 bg-[#fdfdfc]">
                          {vmState.instructions.map((inst, idx) => {
                            const isCurrentPC = vmState.pc === idx;
                            return (
                              <div
                                key={idx}
                                className={`flex items-center px-2 py-1 rounded transition-colors ${
                                  isCurrentPC ? "bg-yellow-100 text-yellow-900 border-l-4 border-l-yellow-500 font-bold" : "text-gray-600 hover:bg-gray-50"
                                }`}
                              >
                                <span className="w-8 shrink-0 text-gray-400 select-none">{String(idx).padStart(3, "0")}</span>
                                <span className="truncate leading-none">{inst}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Right: Stack register & local vars panel */}
                      <div className="col-span-5 flex flex-col space-y-3 min-h-0">
                        {/* Stack memory */}
                        <div className="flex-1 border rounded flex flex-col min-h-0 bg-white">
                          <span className="bg-[#eeeeec] border-b px-2.5 py-1.5 font-bold uppercase text-gray-500 text-[10px] tracking-wider font-mono">
                            Virtual Evaluation Stack
                          </span>
                          <div className="flex-1 overflow-y-auto p-2 bg-gray-50 flex flex-col-reverse justify-end space-y-reverse space-y-1.5">
                            {vmState.stack.length === 0 ? (
                              <p className="text-gray-400 font-mono text-[10px] italic text-center pt-8">[EMPTY EVAL STACK]</p>
                            ) : (
                              vmState.stack.map((item, idx) => (
                                <div
                                  key={idx}
                                  className="bg-blue-50 border border-blue-200 text-blue-800 font-mono px-2 py-1 rounded text-[10px] flex items-center justify-between shadow-xs animate-slide-in"
                                >
                                  <span className="text-gray-400 text-[9px]">S[{idx}]</span>
                                  <span className="font-bold truncate max-w-[150px]">{item}</span>
                                </div>
                              ))
                            )}
                          </div>
                        </div>

                        {/* Local registers */}
                        <div className="h-28 border rounded flex flex-col min-h-0 bg-white">
                          <span className="bg-[#eeeeec] border-b px-2.5 py-1.5 font-bold uppercase text-gray-500 text-[10px] tracking-wider font-mono">
                            Local registers
                          </span>
                          <div className="flex-1 overflow-y-auto p-1.5 bg-white font-mono text-[10px] space-y-1">
                            {Object.keys(vmState.vars).length === 0 ? (
                              <p className="text-gray-400 italic text-center pt-4">No initialized registers.</p>
                            ) : (
                              Object.entries(vmState.vars).map(([name, val], idx) => (
                                <div key={idx} className="flex items-center justify-between py-0.5 border-b last:border-0 border-gray-100">
                                  <span className="text-indigo-600 font-bold">R_{name}</span>
                                  <span className="text-gray-700 bg-gray-100 px-1 rounded truncate max-w-[120px]">{val}</span>
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex-1 flex flex-col items-center justify-center border border-dashed rounded p-12 bg-gray-50 font-mono text-center space-y-2">
                      <Cpu className="w-12 h-12 text-gray-300 animate-pulse" />
                      <p className="font-bold text-gray-600">Attached VM Engine Standby</p>
                      <p className="text-gray-400 max-w-sm text-[11px]">
                        The virtual machine registers and evaluation stack are currently unassigned. Click "Attach VM Debugger" above to begin stepping.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
