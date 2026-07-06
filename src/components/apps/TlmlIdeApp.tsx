import React, { useState, useEffect, useRef, useCallback } from "react";
import Editor, { Monaco } from "@monaco-editor/react";
import { 
  Play, 
  Square, 
  SkipForward, 
  RotateCcw, 
  Code, 
  FileCode, 
  FolderPlus, 
  FilePlus, 
  Trash2, 
  Edit3, 
  AlertTriangle, 
  CheckCircle2, 
  Sparkles, 
  Layers, 
  Folder, 
  Terminal, 
  Settings, 
  BookOpen, 
  Lock, 
  Link as LinkIcon, 
  Mail, 
  Activity, 
  Zap, 
  Briefcase, 
  Wrench, 
  List, 
  Box, 
  Shapes, 
  Braces, 
  Boxes,
  ChevronsLeftRight,
  Plus,
  RefreshCw
} from "lucide-react";
import { NodeType, VFSNode } from "../../types/os";
import { ISocAssembly, ISocNamespace, ISocType, ISocMethod, TypeKind } from "../../types/soc";
import { compileTLML, TlmlLanguageServer } from "../../kernel/tlmlCompiler";
import { TlmlInstructionRegistry } from "../../kernel/instructionRegistry";
import { initGsocCache } from "../../kernel/gsocc";
import uiStrings from "../../data/uiStrings.json";

interface TlmlIdeAppProps {
  syscall: any;
}

interface ProjectFile {
  name: string;
  path: string;
  content: string;
}

// Simple Levenshtein Distance for "did you mean" errors
function getLevenshteinDistance(a: string, b: string): number {
  const tmp = [];
  let i, j;
  for (i = 0; i <= a.length; i++) tmp.push([i]);
  for (j = 1; j <= b.length; j++) tmp[0].push(j);
  for (i = 1; i <= a.length; i++) {
    for (j = 1; j <= b.length; j++) {
      tmp[i][j] = Math.min(
        tmp[i - 1][j] + 1,
        tmp[i][j - 1] + 1,
        tmp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
  }
  return tmp[a.length][b.length];
}

function findClosestMatch(target: string, options: string[]): string | null {
  let bestDist = 999;
  let bestMatch: string | null = null;
  for (const opt of options) {
    const dist = getLevenshteinDistance(target, opt);
    if (dist < bestDist && dist <= 3) {
      bestDist = dist;
      bestMatch = opt;
    }
  }
  return bestMatch;
}

export default function TlmlIdeApp({ syscall }: TlmlIdeAppProps) {
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [activeFilePath, setActiveFilePath] = useState<string>("");
  const [activeContent, setActiveContent] = useState<string>("");
  const [consoleLogs, setConsoleLogs] = useState<string[]>([]);
  const [compilerErrors, setCompilerErrors] = useState<string[]>([]);
  const [buildSuccess, setBuildSuccess] = useState<boolean | null>(null);
  
  // Debugger state
  const [debugPC, setDebugPC] = useState<number>(0);
  const [debugInstructions, setDebugInstructions] = useState<string[]>([]);
  const [debugStack, setDebugStack] = useState<string[]>([]);
  const [debugVars, setDebugVars] = useState<Record<string, string>>({});
  const [debugArgs, setDebugArgs] = useState<Record<string, string>>({});
  const [isDebugging, setIsDebugging] = useState<boolean>(false);
  const [debugCompleted, setDebugCompleted] = useState<boolean>(false);
  const [selectedMethod, setSelectedMethod] = useState<string>("");
  const [compiledAssembly, setCompiledAssembly] = useState<ISocAssembly | null>(null);

  // Monaco refs for markers & dynamic underlines
  const editorRef = useRef<any>(null);
  const monacoRef = useRef<any>(null);

  // New File/Folder state
  const [newFileName, setNewFileName] = useState<string>("");
  const [isCreatingFile, setIsCreatingFile] = useState<boolean>(false);

  // AutoCommit (IntelliSense helper) Suggestions
  const [autoCommitTip, setAutoCommitTip] = useState<string>("Welcome back! Code with elegance. Let's write some high-density TLML instructions.");
  const [autoCommitSnippet, setAutoCommitSnippet] = useState<{ label: string; code: string } | null>(null);

  const workspaceRoot = "/home/tux/Projects/TLML_Demo";

  // Bootstrap files inside the workspace
  const bootstrapProject = useCallback(() => {
    try {
      // Ensure directory structure
      syscall.createDirectory("/home/tux/Projects");
      syscall.createDirectory(workspaceRoot);

      // Create main entry code file
      const mainPath = `${workspaceRoot}/Main.tlml`;
      try {
        syscall.readFile(mainPath);
      } catch (err) {
        const defaultCode = `// Static imports of assemblies
.import assembly TLML.Lang
.import namespace TLML.Lang.Console
.import namespace TLML.Lang
Custom VFS styling sheet in VFS: "/home/tux/Documents/custom_theme.css" can be used for CSS Class overrides!

.assembly MyTuxApp
.version 1.0.4.0

.namespace TuxEngine
{
    .class Sandbox
    {
        // AddValues helper method
        .method public static double AddValues(double a, double b)
        {
            push.arg a
            push.arg b
            add
            ret
        }

        // Main Program entry
        .method public static void Main()
        {
            push.const "Welcome to the TLML Sandbox!"
            call TLML.Lang.Console.WriteLine

            // Beep tone trigger
            call TLML.Lang.Console.Beep

            // Push operands for Math evaluation
            push.const 25.0
            call TLML.Lang.Math.Sqrt
            push.const "Result of Math.Sqrt(25.0) = "
            call TLML.Lang.Console.WriteLine
            call TLML.Lang.Console.WriteLine

            // Invoke our custom addition function
            push.const 350
            push.const 70
            call TuxEngine.Sandbox.AddValues
            push.const "Result of TuxEngine.Sandbox.AddValues(350, 70) = "
            call TLML.Lang.Console.WriteLine
            call TLML.Lang.Console.WriteLine

            // Read interactive input safely
            push.const "Please enter your name: "
            call TLML.Lang.Console.WriteLine
            call TLML.Lang.Console.ReadLine
            push.const "Hello, "
            call TLML.Lang.StringUtil.Concat
            call TLML.Lang.Console.WriteLine

            push.const "Sandbox program executed successfully."
            call TLML.Lang.Console.WriteLine
            ret
        }
    }
}
`;
        syscall.writeFile(mainPath, defaultCode);
      }

      // Create Helper class code file
      const helperPath = `${workspaceRoot}/Helper.tlml`;
      try {
        syscall.readFile(helperPath);
      } catch (err) {
        const helperCode = `// Helper libraries and utilities
.import assembly Diagnostics.Telemetry
.import namespace Diagnostics.Telemetry.Monitors

.assembly SecureAuth
.version 2.1.0.0

.namespace Security
{
    .class Crypto
    {
        .method public static void LogTrace()
        {
            push.const "Crypto logs triggered."
            call Diagnostics.Telemetry.Monitors.KernelLogger.PushLog
            ret
        }
    }
}
`;
        syscall.writeFile(helperPath, helperCode);
      }

      // Create Custom Class custom stylesheet file
      const cssPath = `${workspaceRoot}/CustomStyle.css`;
      try {
        syscall.readFile(cssPath);
      } catch (err) {
        const defaultCss = `/* Custom app style configuration override */
.tlml-ide-container {
  border: 3px double #000000;
}
.debugger-step-btn {
  background-color: #e5f3ff !important;
  color: #0c4a6e !important;
}
.console-log-text {
  font-family: 'JetBrains Mono', monospace;
  color: #10b981;
}
`;
        syscall.writeFile(cssPath, defaultCss);
      }

      loadFilesFromVFS();
    } catch (e) {
      console.error("Failed to bootstrap TLML IDE workspace", e);
    }
  }, [syscall]);

  const loadFilesFromVFS = () => {
    try {
      const items = syscall.listDir(workspaceRoot);
      const loaded: ProjectFile[] = [];
      for (const item of items) {
        if (item.type === NodeType.FILE) {
          const content = syscall.readFile(`${workspaceRoot}/${item.name}`);
          loaded.push({
            name: item.name,
            path: `${workspaceRoot}/${item.name}`,
            content: content || ""
          });
        }
      }
      setFiles(loaded);
      if (loaded.length > 0) {
        setActiveFilePath(prevPath => {
          if (prevPath && loaded.some(f => f.path === prevPath)) {
            const matched = loaded.find(f => f.path === prevPath);
            if (matched) {
              setActiveContent(matched.content);
            }
            return prevPath;
          } else {
            const mainFile = loaded.find(f => f.name === "Main.tlml") || loaded[0];
            setActiveContent(mainFile.content);
            return mainFile.path;
          }
        });
      }
    } catch (e) {
      console.error("Failed to read files from VFS", e);
    }
  };

  useEffect(() => {
    bootstrapProject();
  }, [bootstrapProject]);

  // Load custom css stylesheet from workspace when CSS file exists
  useEffect(() => {
    const cssFile = files.find(f => f.name.endsWith(".css"));
    if (cssFile) {
      let styleTag = document.getElementById("tlml-vfs-custom-css");
      if (!styleTag) {
        styleTag = document.createElement("style");
        styleTag.id = "tlml-vfs-custom-css";
        document.head.appendChild(styleTag);
      }
      styleTag.innerHTML = cssFile.content;
    }
    return () => {
      const styleTag = document.getElementById("tlml-vfs-custom-css");
      if (styleTag) styleTag.remove();
    };
  }, [files]);

  // Update editor red squiggly underlines and error hover tips on the exact line numbers
  const updateEditorMarkers = useCallback((errors: string[]) => {
    if (!editorRef.current || !monacoRef.current) return;
    const model = editorRef.current.getModel();
    if (!model) return;

    if (activeFilePath.endsWith(".css")) {
      monacoRef.current.editor.setModelMarkers(model, "tlml", []);
      return;
    }

    const markers = errors.map(err => {
      const lineMatch = err.match(/^Line (\d+):/i);
      const lineNum = lineMatch ? parseInt(lineMatch[1]) : 1;
      return {
        startLineNumber: lineNum,
        startColumn: 1,
        endLineNumber: lineNum,
        endColumn: 100,
        message: err,
        severity: monacoRef.current.MarkerSeverity.Error
      };
    });

    monacoRef.current.editor.setModelMarkers(model, "tlml", markers);
  }, [activeFilePath]);

  // Live background language server linting process
  useEffect(() => {
    if (activeFilePath.endsWith(".css")) {
      setCompilerErrors([]);
      setBuildSuccess(true);
      if (editorRef.current && monacoRef.current) {
        const model = editorRef.current.getModel();
        if (model) monacoRef.current.editor.setModelMarkers(model, "tlml", []);
      }
      return;
    }
    const timer = setTimeout(() => {
      const globalGsoc = (window as any).GSOCC || initGsocCache();
      const langServer = new TlmlLanguageServer();
      const errors = langServer.lint(activeContent, globalGsoc);
      setCompilerErrors(errors);
      setBuildSuccess(errors.length === 0);
      updateEditorMarkers(errors);
    }, 450); // 450ms debounce matches live background execution
    return () => clearTimeout(timer);
  }, [activeContent, activeFilePath, updateEditorMarkers]);

  // Bulletproof fix for Monaco Editor char widths mismatch cursor alignment issue
  const handleEditorDidMount = (editor: any, monaco: any) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    if (typeof document !== "undefined" && (document as any).fonts) {
      (document as any).fonts.ready.then(() => {
        monaco.editor.remeasureFonts();
        editor.layout();
      });
    }
    setTimeout(() => {
      monaco.editor.remeasureFonts();
      editor.layout();
    }, 500);
    setTimeout(() => {
      monaco.editor.remeasureFonts();
      editor.layout();
    }, 1500);
  };

  // Handle Monaco configuration and syntax highlighting setup
  const handleEditorWillMount = (monaco: Monaco) => {
    // Register TLML custom syntax highlighting
    monaco.languages.register({ id: "tlml" });

    monaco.languages.setMonarchTokensProvider("tlml", {
      defaultToken: "",
      keywords: [
        ".assembly", ".version", ".namespace", ".class", ".method", ".import",
        "assembly", "namespace", "public", "private", "protected", "internal",
        "static", "void", "double", "string", "int", "Class", "Enum"
      ],
      instructions: TlmlInstructionRegistry.getInstance().getNames(),
      operators: [
        "=", "==", "!=", "<", ">", "<=", ">="
      ],
      constants: [
        "true", "false", "null"
      ],
      symbols: /[=><!~?:&|+\-*\/\^%]+/,
      escapes: /\\(?:[abfnrtv\\"']|x[0-9A-Fa-f]{1,4}|u[0-9A-Fa-f]{4}|U[0-9A-Fa-f]{8})/,
      tokenizer: {
        root: [
          // Dot directives (e.g. .assembly, .namespace)
          [/\.[a-zA-Z_]\w*/, "keyword"],
          
          // Label definitions & jump targets (e.g. :my_label)
          [/:\w+/, "tag"],

          // Instructions with dots (e.g., push.const, store.local) and general words
          [/[a-zA-Z_]\w*(?:\.[a-zA-Z_]\w*)*/, {
            cases: {
              "@keywords": "keyword",
              "@instructions": "keyword",
              "@constants": "constant",
              "@default": "identifier"
            }
          }],
          { include: "@whitespace" },
          [/[{}()\[\]]/, "@brackets"],
          [/[<>](?!@symbols)/, "@brackets"],
          [/@symbols/, {
            cases: {
              "@operators": "operator",
              "@default": ""
            }
          }],
          [/\d*\.\d+([eE][\-+]?\d+)?/, "number.float"],
          [/\d+/, "number"],
          [/[;,.]/, "delimiter"],
          [/"([^"\\]|\\.)*"/, "string"],
          [/'[^\\']'/, "string"],
          [/'/, "string.invalid"]
        ],
        whitespace: [
          [/[ \t\r\n]+/, "white"],
          [/\/\*/, "comment", "@comment"],
          [/\/\/.*$/, "comment"]
        ],
        comment: [
          [/[^\/*]+/, "comment"],
          [/\/\*/, "comment", "@push"],
          [/\*\//, "comment", "@pop"],
          [/[\/*]/, "comment"]
        ]
      }
    });

    // Custom interactive Hover documentation provider
    monaco.languages.registerHoverProvider("tlml", {
      provideHover: (model, position) => {
        const lineContent = model.getLineContent(position.lineNumber);
        const columnIndex = position.column - 1;

        // Scan left from the cursor to find the start of the word/identifier (supporting dots, colons, etc)
        let start = columnIndex;
        while (start > 0 && /[\w\.:\-]/.test(lineContent[start - 1])) {
          start--;
        }

        // Scan right from the cursor
        let end = columnIndex;
        while (end < lineContent.length && /[\w\.:\-]/.test(lineContent[end])) {
          end++;
        }

        const fullWord = lineContent.substring(start, end).trim();
        if (!fullWord) return null;

        const globalGsoc = (window as any).GSOCC || initGsocCache();
        const langServer = new TlmlLanguageServer();
        const hoverResult = langServer.getHover(model.getValue(), position.lineNumber, position.column, fullWord, globalGsoc);

        if (hoverResult) {
          return {
            range: {
              startLineNumber: position.lineNumber,
              startColumn: start + 1,
              endLineNumber: position.lineNumber,
              endColumn: end + 1
            },
            contents: hoverResult.contents
          };
        }
        return null;
      }
    });

    // Custom autocomplete provider (IntelliSense AutoCommit via Centralized Language Server)
    monaco.languages.registerCompletionItemProvider("tlml", {
      provideCompletionItems: (model, position) => {
        // Dynamically compute the start column of the typed word/identifier (supporting dotted paths like TLML.Lang)
        let startColumn = position.column;
        while (startColumn > 1) {
          const char = model.getValueInRange({
            startLineNumber: position.lineNumber,
            startColumn: startColumn - 1,
            endLineNumber: position.lineNumber,
            endColumn: startColumn
          });
          if (/[\w.:\-]/.test(char)) {
            startColumn--;
          } else {
            break;
          }
        }

        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: startColumn,
          endColumn: position.column
        };

        const globalGsoc = (window as any).GSOCC || initGsocCache();
        const langServer = new TlmlLanguageServer();
        const serverCompletions = langServer.getCompletions(
          model.getValue(),
          position.lineNumber - 1,
          position.column - 1,
          globalGsoc
        );

        const suggestions = serverCompletions.map(item => ({
          label: item.label,
          kind: item.kind,
          insertText: item.insertText,
          insertTextRules: item.insertText.includes("$") ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet : undefined,
          range,
          detail: item.detail,
          documentation: item.documentation
        }));

        return { suggestions };
      }
    });
  };

  const saveActiveFile = () => {
    try {
      if (!activeFilePath) return;
      syscall.writeFile(activeFilePath, activeContent);
      setFiles(prev => prev.map(f => f.path === activeFilePath ? { ...f, content: activeContent } : f));
      setAutoCommitTip(uiStrings.TlmlIdeApp.saveSuccess);
    } catch (e) {
      console.error("Failed to save file", e);
    }
  };

  // Compile TLML assembly parser using Centralized Compiler
  const runCompile = () => {
    const globalGsoc = (window as any).GSOCC || initGsocCache();
    const { assembly: newAsm, errors } = compileTLML(activeContent, globalGsoc);

    updateEditorMarkers(errors);

    if (errors.length > 0) {
      setCompilerErrors(errors);
      setBuildSuccess(false);
      setAutoCommitTip(uiStrings.TlmlIdeApp.compileFailed);
    } else if (newAsm) {
      setCompilerErrors([]);
      setBuildSuccess(true);
      setCompiledAssembly(newAsm);

      // Save compiled .soc assembly both to /sys/lib/ and into /home/tux/Documents/Assemblies/
      try {
        syscall.createDirectory("/sys");
        syscall.createDirectory("/sys/lib");
        syscall.createDirectory("/home/tux/Documents");
        syscall.createDirectory("/home/tux/Documents/Assemblies");
        
        syscall.writeFile(`/sys/lib/${newAsm.name}.soc`, JSON.stringify(newAsm, null, 2));
        syscall.writeFile(`/home/tux/Documents/Assemblies/${newAsm.name}.soc`, JSON.stringify(newAsm, null, 2));

        // Dynamically append compilation into active global cache GSOCC so Assembly Inspector can read it!
        if (globalGsoc) {
          globalGsoc.assemblies[newAsm.name] = newAsm;
        }
      } catch (e) {
        console.error("VFS Compiled saving failed", e);
      }

      setAutoCommitTip(uiStrings.TlmlIdeApp.buildSuccess);
    }
    return;

    // Remaining legacy compiler logic bypassed safely
    const errors_old: string[] = [];
    let assemblyName = "MyAssembly";
    let assemblyVersion = "1.0.0.0";
    const importedAssemblies: string[] = ["TLML.Lang"]; // Default Standard Library
    const importedNamespaces: string[] = ["TLML.Lang.Console", "TLML.Lang", "TLML.Lang.System"];

    // Basic regexes for parser
    const asmRegex = /^\s*\.assembly\s+([\w\.]+)/i;
    const verRegex = /^\s*\.version\s+([\d\.]+)/i;
    const importAsmRegex = /^\s*\.import\s+assembly\s+([\w\.]+)/i;
    const importNsRegex = /^\s*\.import\s+namespace\s+([\w\.]+)/i;
    const namespaceRegex = /^\s*\.namespace\s+([\w\.]+)/i;
    const classRegex = /^\s*\.class\s+(?:public|private|internal)?\s*(?:static)?\s*([\w\.]+)/i;
    const methodRegex = /^\s*\.method\s+(public|private|protected|internal)?\s*(static)?\s*([\w\.]+)\s+([\w\.]+)\(([^)]*)\)/i;

    const lines = activeContent.split("\n");
    let currentNamespace: ISocNamespace | null = null;
    let currentClass: any = null;
    let currentMethod: ISocMethod | null = null;
    let methodBodyLines: string[] = [];
    const namespaces: ISocNamespace[] = [];

    // Brackets tracking
    let openBrackets = 0;

    // Load registered assemblies inside GSOCC
    const globalGsoc_old = (window as any).GSOCC;
    const activeGlobalAssemblies = globalGsoc_old ? Object.keys(globalGsoc_old.assemblies) : ["TLML.Lang", "Diagnostics.Telemetry"];

    lines.forEach((line, idx) => {
      const lineNum = idx + 1;
      const trimmed = line.trim();

      // Skip comments or empty lines
      if (!trimmed || trimmed.startsWith("//")) return;

      // Brackets matching count
      if (trimmed.includes("{")) openBrackets++;
      if (trimmed.includes("}")) {
        openBrackets--;
        if (currentMethod) {
          // Finished reading method body
          currentMethod.bodySimulated = methodBodyLines.join("\n");
          if (currentClass) {
            currentClass.methods.push(currentMethod);
          }
          currentMethod = null;
          methodBodyLines = [];
        } else if (currentClass && openBrackets === 1) {
          currentClass = null;
        } else if (currentNamespace && openBrackets === 0) {
          currentNamespace = null;
        }
      }

      // 1. Static Assembly Declaration
      if (asmRegex.test(trimmed)) {
        const match = trimmed.match(asmRegex);
        if (match) assemblyName = match[1];
      }
      // 2. Assembly version
      else if (verRegex.test(trimmed)) {
        const match = trimmed.match(verRegex);
        if (match) assemblyVersion = match[1];
      }
      // 3. Import assembly verification
      else if (importAsmRegex.test(trimmed)) {
        const match = trimmed.match(importAsmRegex);
        if (match) {
          const name = match[1];
          if (!activeGlobalAssemblies.includes(name)) {
            errors.push(`Line ${lineNum}: Referenced assembly '${name}' could not be resolved in VFS /sys/lib/ or GSOCC registry. Did you register it?`);
          } else {
            importedAssemblies.push(name);
          }
        }
      }
      // 4. Import namespace
      else if (importNsRegex.test(trimmed)) {
        const match = trimmed.match(importNsRegex);
        if (match) {
          importedNamespaces.push(match[1]);
        }
      }
      // 5. Namespace declaration
      else if (namespaceRegex.test(trimmed)) {
        const match = trimmed.match(namespaceRegex);
        if (match) {
          currentNamespace = {
            name: match[1],
            fullName: match[1],
            types: [],
            constants: []
          };
          namespaces.push(currentNamespace);
        }
      }
      // 6. Class declaration
      else if (classRegex.test(trimmed)) {
        if (!currentNamespace) {
          errors.push(`Line ${lineNum}: Class declaration outside of valid namespace block.`);
          return;
        }
        const match = trimmed.match(classRegex);
        if (match) {
          currentClass = {
            name: match[1],
            fullName: `${currentNamespace.name}.${match[1]}`,
            kind: TypeKind.Class,
            accessModifier: "Public",
            namespaceName: currentNamespace.name,
            types: [],
            constants: [],
            methods: [],
            fields: [],
            properties: [],
            events: []
          };
          currentNamespace.types.push(currentClass);
        }
      }
      // 7. Method declaration
      else if (methodRegex.test(trimmed)) {
        if (!currentClass) {
          errors.push(`Line ${lineNum}: Method declaration outside of class structure.`);
          return;
        }
        const match = trimmed.match(methodRegex);
        if (match) {
          const modifier = match[1] || "Public";
          const isStatic = !!match[2];
          const retType = match[3];
          const name = match[4];
          const rawParams = match[5];

          const parameters = rawParams ? rawParams.split(",").map(p => {
            const pParts = p.trim().split(/\s+/);
            return {
              type: pParts[0],
              name: pParts[1] || "param"
            };
          }) : [];

          currentMethod = {
            name,
            returnType: retType,
            parameters,
            accessModifier: modifier as any,
            isStatic,
            bodySimulated: ""
          };
        }
      }
      // 8. Parse inside method body
      else if (currentMethod) {
        // Collect instructions
        if (trimmed !== "{" && trimmed !== "}") {
          methodBodyLines.push(trimmed);

          // Verify invalid instruction suggestions
          const instructionCmd = trimmed.split(/\s+/)[0];
          const validInstructions = [
            "push.const", "push.arg", "push.field", "push.local", "push.this",
            "store.field", "store.local", "store.arg", "store.elem",
            "add", "sub", "mul", "div", "xor", "rem", "rot.left",
            "compare.lt", "compare.gt", "compare.eq", "compare.neq", "compare.gte",
            "jump", "jump.false", "ret", "call", "import.asm", "import.type", "newobj", "newarr"
          ];

          if (!instructionCmd.startsWith("//") && !instructionCmd.startsWith(":") && !validInstructions.includes(instructionCmd)) {
            const closest = findClosestMatch(instructionCmd, validInstructions);
            const recommendation = closest ? `. Did you mean '${closest}'?` : "";
            errors.push(`Line ${lineNum}: Invalid TLML assembly instruction '${instructionCmd}'${recommendation}`);
          }

          // Verify call instruction reference resolution
          if (instructionCmd === "call") {
            const callTarget = trimmed.slice(4).trim();
            // Verify if call target belongs to standard libraries or compiled namespaces
            const isStandardCall = callTarget.startsWith("TLML.Lang") || callTarget.startsWith("Native") || callTarget.startsWith("Diagnostics.Telemetry");
            const isLocalCall = namespaces.some(ns => ns.types.some(t => t.fullName === callTarget.split(".").slice(0, -1).join(".")));
            
            if (!isStandardCall && !isLocalCall) {
              const allPossibleTypes: string[] = [
                "TLML.Lang.Console.WriteLine",
                "TLML.Lang.Console.Write",
                "TLML.Lang.Console.ReadLine",
                "TLML.Lang.Console.Clear",
                "TLML.Lang.Console.Beep",
                "TLML.Lang.Console.SetColor",
                "TLML.Lang.Math.Sqrt",
                "TLML.Lang.Math.Abs",
                "TLML.Lang.Math.Pow",
                "TLML.Lang.Math.Random",
                "TLML.Lang.Math.Max",
                "TLML.Lang.Math.Min",
                "TLML.Lang.Math.Round",
                "TLML.Lang.Environment.GetTime",
                "TLML.Lang.Environment.GetOSVersion",
                "TLML.Lang.Environment.GetCurrentUser",
                "TLML.Lang.StringUtil.Concat",
                "TLML.Lang.StringUtil.Length",
                "TLML.Lang.StringUtil.ToUpper",
                "TLML.Lang.StringUtil.ToLower",
                "TLML.Lang.Console.Console.WriteLine",
                "TLML.Lang.Console.Console.Write",
                "TLML.Lang.Console.Console.ReadLine",
                "TLML.Lang.Console.Console.Clear"
              ];
              namespaces.forEach(ns => ns.types.forEach(t => {
                if ('methods' in t) {
                  (t as any).methods.forEach((m: any) => allPossibleTypes.push(`${t.fullName}.${m.name}`));
                }
              }));
              const closest = findClosestMatch(callTarget, allPossibleTypes);
              const recommendation = closest ? `. Did you mean '${closest}'?` : "";
              errors.push(`Line ${lineNum}: Cannot resolve compilation call to target reference '${callTarget}'${recommendation}`);
            }
          }
        }
      }
    });

    if (openBrackets !== 0) {
      errors.push("Compilation Error: Mismatching bracket structure. Ensure all namespaces, classes, and methods are closed properly with '}'.");
    }

    if (errors.length > 0) {
      setCompilerErrors(errors);
      setBuildSuccess(false);
      setAutoCommitTip("Compilation failed. Correct the highlighted descriptive errors in the Diagnostics Console.");
    } else {
      setCompilerErrors([]);
      setBuildSuccess(true);
      
      const newAsm: ISocAssembly = {
        name: assemblyName,
        version: assemblyVersion,
        culture: "neutral",
        publicKeyToken: "tuxcompile7d21a93b",
        namespaces,
        dependencies: importedAssemblies.map(name => ({ assemblyName: name, version: "1.0.0.0" }))
      };

      setCompiledAssembly(newAsm);

      // Save compiled .soc assembly both to /sys/lib/ and into /home/tux/Documents/Assemblies/
      try {
        syscall.createDirectory("/sys");
        syscall.createDirectory("/sys/lib");
        syscall.createDirectory("/home/tux/Documents");
        syscall.createDirectory("/home/tux/Documents/Assemblies");
        
        syscall.writeFile(`/sys/lib/${assemblyName}.soc`, JSON.stringify(newAsm, null, 2));
        syscall.writeFile(`/home/tux/Documents/Assemblies/${assemblyName}.soc`, JSON.stringify(newAsm, null, 2));

        // Dynamically append compilation into active global cache GSOCC so Assembly Inspector can read it!
        if (globalGsoc_old) {
          globalGsoc_old.assemblies[assemblyName] = newAsm;
        }
      } catch (e) {
        console.error("VFS Compiled saving failed", e);
      }

      // Automatically generate AutoCommit suggestion
      setAutoCommitTip("Build succeeded! Assembly output written to `/sys/lib/" + assemblyName + ".soc` and registered in GSOCC successfully.");
    }
  };

  // Launch VM debugger on the compiled Assembly
  const startDebugging = () => {
    if (!compiledAssembly) {
      runCompile();
      return;
    }

    // Find the Main() entry point method to execute
    let entryMethod: ISocMethod | null = null;
    let entryFullName = "";

    for (const ns of compiledAssembly.namespaces) {
      for (const type of ns.types) {
        if ('methods' in type) {
          const main = (type as any).methods.find((m: any) => m.name === "Main");
          if (main) {
            entryMethod = main;
            entryFullName = `${type.fullName}.Main`;
            break;
          }
        }
      }
    }

    if (!entryMethod || !entryMethod.bodySimulated) {
      setConsoleLogs([`[Debugger Error] Could not find 'void Main()' entrypoint in compiled assembly.`]);
      return;
    }

    // Initialize debugger
    const instructions = entryMethod.bodySimulated.split("\n").map(l => l.trim()).filter(l => l && !l.startsWith("//") && l !== "{" && l !== "}");
    setDebugInstructions(instructions);
    setDebugPC(0);
    setDebugStack([]);
    setDebugVars({});
    setDebugArgs({});
    setIsDebugging(true);
    setDebugCompleted(false);
    setSelectedMethod(entryFullName);
    setConsoleLogs([`[Debugger Initialized] Target entry method: ${entryFullName}`, `Instructions loaded: ${instructions.length}`]);
  };

  const stepDebugger = () => {
    if (debugPC >= debugInstructions.length) {
      setDebugCompleted(true);
      setIsDebugging(false);
      setConsoleLogs(prev => [...prev, "[Debugger Completed] Reached final RET statement."]);
      return;
    }

    const currentLine = debugInstructions[debugPC];
    const parts = currentLine.trim().split(/\s+/);
    const cmd = parts[0];
    const arg = parts.slice(1).join(" ");

    let logMsg = `PC[${String(debugPC).padStart(3, "0")}]: ${currentLine}`;
    const nextStack = [...debugStack];
    const nextVars = { ...debugVars };

    switch (cmd) {
      case "push.const":
        nextStack.push(arg);
        break;
      case "push.arg":
        nextStack.push(`Arg(${arg})`);
        break;
      case "push.local":
        nextStack.push(nextVars[arg] || "Null");
        break;
      case "store.local":
        if (nextStack.length > 0) {
          nextVars[arg] = nextStack.pop()!;
        }
        break;
      case "add":
        if (nextStack.length >= 2) {
          const b = parseFloat(nextStack.pop()!);
          const a = parseFloat(nextStack.pop()!);
          nextStack.push(String(isNaN(a + b) ? 0 : a + b));
        }
        break;
      case "sub":
        if (nextStack.length >= 2) {
          const b = parseFloat(nextStack.pop()!);
          const a = parseFloat(nextStack.pop()!);
          nextStack.push(String(isNaN(a - b) ? 0 : a - b));
        }
        break;
      case "call":
        if (
          arg === "TLML.Lang.System.Console.WriteLine" || 
          arg === "TLML.Lang.Console.WriteLine" || 
          arg === "TLML.Lang.Console.Console.WriteLine"
        ) {
          const popped = nextStack.pop() || "";
          setConsoleLogs(prev => [...prev, `[Console.Out] ${popped.replace(/"/g, "")}`]);
        } else if (
          arg === "TLML.Lang.Console.Write" || 
          arg === "TLML.Lang.Console.Console.Write"
        ) {
          const popped = nextStack.pop() || "";
          setConsoleLogs(prev => {
            if (prev.length > 0 && prev[prev.length - 1].startsWith("[Console.Out] ")) {
              const updated = [...prev];
              updated[updated.length - 1] = updated[updated.length - 1] + popped.replace(/"/g, "");
              return updated;
            } else {
              return [...prev, `[Console.Out] ${popped.replace(/"/g, "")}`];
            }
          });
        } else if (
          arg === "TLML.Lang.Console.ReadLine" || 
          arg === "TLML.Lang.Console.Console.ReadLine"
        ) {
          let inputVal = "tux_standard_input";
          try {
            const prompted = window.prompt("Enter console input:");
            if (prompted !== null) {
              inputVal = prompted;
            }
          } catch(e) {
            inputVal = `tux_input_${Math.floor(Math.random() * 900 + 100)}`;
          }
          nextStack.push(`"${inputVal}"`);
          setConsoleLogs(prev => [...prev, `[Console.In] Read: "${inputVal}"`]);
        } else if (
          arg === "TLML.Lang.Console.Clear" || 
          arg === "TLML.Lang.Console.Console.Clear"
        ) {
          setConsoleLogs([]);
        } else if (
          arg === "TLML.Lang.Console.Beep" || 
          arg === "TLML.Lang.Console.Console.Beep"
        ) {
          try {
            const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
            if (AudioCtx) {
              const audio = new AudioCtx();
              const osc = audio.createOscillator();
              osc.type = "sine";
              osc.frequency.setValueAtTime(440, audio.currentTime);
              osc.connect(audio.destination);
              osc.start();
              osc.stop(audio.currentTime + 0.08);
            }
          } catch (err) {}
          setConsoleLogs(prev => [...prev, `[Console.Out] *BEEP*`]);
        } else if (
          arg === "TLML.Lang.Console.SetColor" || 
          arg === "TLML.Lang.Console.Console.SetColor"
        ) {
          const color = (nextStack.pop() || "").replace(/"/g, "");
          setConsoleLogs(prev => [...prev, `[Console.Out] (Text color set to: ${color})`]);
        } else if (arg === "TLML.Lang.System.Math.Sqrt" || arg === "TLML.Lang.Math.Sqrt") {
          if (nextStack.length > 0) {
            const val = parseFloat(nextStack.pop()!);
            nextStack.push(String(isNaN(Math.sqrt(val)) ? 0 : Math.sqrt(val)));
          }
        } else if (arg === "TLML.Lang.Math.Abs") {
          if (nextStack.length > 0) {
            const val = parseFloat(nextStack.pop()!);
            nextStack.push(String(isNaN(Math.abs(val)) ? 0 : Math.abs(val)));
          }
        } else if (arg === "TLML.Lang.Math.Pow") {
          if (nextStack.length >= 2) {
            const exponent = parseFloat(nextStack.pop()!);
            const base = parseFloat(nextStack.pop()!);
            nextStack.push(String(isNaN(Math.pow(base, exponent)) ? 0 : Math.pow(base, exponent)));
          }
        } else if (arg === "TLML.Lang.Math.Random" || arg === "TLML.Lang.System.Math.Random") {
          nextStack.push(String(Math.random()));
        } else if (arg === "TLML.Lang.Math.Max") {
          if (nextStack.length >= 2) {
            const b = parseFloat(nextStack.pop()!);
            const a = parseFloat(nextStack.pop()!);
            nextStack.push(String(Math.max(a, b)));
          }
        } else if (arg === "TLML.Lang.Math.Min") {
          if (nextStack.length >= 2) {
            const b = parseFloat(nextStack.pop()!);
            const a = parseFloat(nextStack.pop()!);
            nextStack.push(String(Math.min(a, b)));
          }
        } else if (arg === "TLML.Lang.Math.Round") {
          if (nextStack.length > 0) {
            const val = parseFloat(nextStack.pop()!);
            nextStack.push(String(Math.round(val)));
          }
        } else if (arg === "TLML.Lang.Environment.GetTime") {
          nextStack.push(String(Date.now()));
        } else if (arg === "TLML.Lang.Environment.GetOSVersion") {
          nextStack.push('"TrashLinux v0.04a-stable"');
        } else if (arg === "TLML.Lang.Environment.GetCurrentUser") {
          nextStack.push('"tux"');
        } else if (arg === "TLML.Lang.StringUtil.Concat") {
          if (nextStack.length >= 2) {
            const b = (nextStack.pop() || "").replace(/"/g, "");
            const a = (nextStack.pop() || "").replace(/"/g, "");
            nextStack.push(`"${a}${b}"`);
          }
        } else if (arg === "TLML.Lang.StringUtil.Length") {
          if (nextStack.length > 0) {
            const s = (nextStack.pop() || "").replace(/"/g, "");
            nextStack.push(String(s.length));
          }
        } else if (arg === "TLML.Lang.StringUtil.ToUpper") {
          if (nextStack.length > 0) {
            const s = (nextStack.pop() || "").replace(/"/g, "");
            nextStack.push(`"${s.toUpperCase()}"`);
          }
        } else if (arg === "TLML.Lang.StringUtil.ToLower") {
          if (nextStack.length > 0) {
            const s = (nextStack.pop() || "").replace(/"/g, "");
            nextStack.push(`"${s.toLowerCase()}"`);
          }
        } else {
          nextStack.push(`ResultOf_${arg.split(".").pop()}`);
        }
        break;
      case "ret":
        setDebugCompleted(true);
        setIsDebugging(false);
        break;
      default:
        break;
    }

    setDebugStack(nextStack);
    setDebugVars(nextVars);
    setDebugPC(prev => prev + 1);
  };

  const stopDebugger = () => {
    setIsDebugging(false);
    setDebugCompleted(false);
    setDebugPC(0);
    setDebugStack([]);
    setDebugVars({});
  };

  // AutoCommit Helper Panel Action
  const applyAutoCommitSnippet = () => {
    if (autoCommitSnippet) {
      setActiveContent(prev => prev + "\n" + autoCommitSnippet.code);
      setAutoCommitSnippet(null);
      setAutoCommitTip("AutoCommit suggestion applied successfully to file body!");
    }
  };

  // Scan file for AutoCommit helper
  useEffect(() => {
    if (activeContent.includes("Math")) {
      setAutoCommitSnippet({
        label: "Insert Math Sqrt evaluation",
        code: `            // Calculate Square Root dynamically
            push.const 81.0
            call TLML.Lang.System.Math.Sqrt
            push.const "Result of Math.Sqrt(81) = "
            call TLML.Lang.System.Console.WriteLine
            call TLML.Lang.System.Console.WriteLine`
      });
      setAutoCommitTip("Tip: I detected you are writing standard math functions. Want to insert an AutoCommit precompiled evaluation snippet?");
    } else {
      setAutoCommitSnippet(null);
    }
  }, [activeContent]);

  const createNewFile = () => {
    if (!newFileName) return;
    try {
      const fullPath = `${workspaceRoot}/${newFileName}`;
      syscall.writeFile(fullPath, `// TLML Source code for ${newFileName}\n`);
      
      const items = syscall.listDir(workspaceRoot);
      const loaded: ProjectFile[] = [];
      for (const item of items) {
        if (item.type === NodeType.FILE) {
          const content = syscall.readFile(`${workspaceRoot}/${item.name}`);
          loaded.push({
            name: item.name,
            path: `${workspaceRoot}/${item.name}`,
            content: content || ""
          });
        }
      }
      setFiles(loaded);
      
      const newFile = loaded.find(f => f.path === fullPath);
      if (newFile) {
        setActiveFilePath(newFile.path);
        setActiveContent(newFile.content);
      }
      
      setIsCreatingFile(false);
      setNewFileName("");
      setAutoCommitTip(`New file '${newFileName}' created successfully in VFS.`);
    } catch (e) {
      console.error(e);
    }
  };

  const deleteFile = (pathToDelete: string) => {
    try {
      syscall.deleteNode(pathToDelete);
      
      const items = syscall.listDir(workspaceRoot);
      const loaded: ProjectFile[] = [];
      for (const item of items) {
        if (item.type === NodeType.FILE) {
          const content = syscall.readFile(`${workspaceRoot}/${item.name}`);
          loaded.push({
            name: item.name,
            path: `${workspaceRoot}/${item.name}`,
            content: content || ""
          });
        }
      }
      setFiles(loaded);
      
      if (activeFilePath === pathToDelete) {
        if (loaded.length > 0) {
          const mainFile = loaded.find(f => f.name === "Main.tlml") || loaded[0];
          setActiveFilePath(mainFile.path);
          setActiveContent(mainFile.content);
        } else {
          setActiveFilePath("");
          setActiveContent("");
        }
      }
      
      setAutoCommitTip("File deleted successfully from project workspace.");
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="tlml-ide-container w-full h-full bg-[#f3f4f6] text-slate-800 flex flex-col font-sans text-xs">
      {/* Top Main Toolbar */}
      <div className="flex items-center justify-between bg-[#1e293b] text-white p-2 border-b border-[#0f172a]">
        <div className="flex items-center space-x-2">
          <Terminal className="w-4 h-4 text-emerald-400" />
          <span className="font-bold text-sm tracking-tight">TLML GSOCC IDE</span>
          <span className="bg-[#334155] text-[10px] text-emerald-300 px-2 py-0.5 rounded font-mono">v1.2.0-PRO</span>
        </div>
        <div className="flex items-center space-x-2">
          <button 
            onClick={saveActiveFile}
            className="flex items-center space-x-1 px-3 py-1 bg-[#334155] hover:bg-[#475569] text-white border border-[#475569] hover:border-emerald-400 rounded transition font-medium"
          >
            <span>Save</span>
          </button>
          <button 
            onClick={runCompile}
            className="flex items-center space-x-1 px-3 py-1 bg-[#10b981] hover:bg-[#059669] text-white rounded transition font-medium shadow-sm"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Compile Assembly</span>
          </button>
          <button 
            onClick={startDebugging}
            className="flex items-center space-x-1 px-3 py-1 bg-sky-500 hover:bg-sky-600 text-white rounded transition font-medium shadow-sm"
          >
            <Play className="w-3.5 h-3.5" />
            <span>Start Debugger</span>
          </button>
        </div>
      </div>

      {/* Main Workspace Frame */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* Left Sidebar: File Explorer & Assembly list */}
        <div className="w-56 bg-[#e5e7eb] border-r border-[#cbd5e1] flex flex-col overflow-y-auto">
          
          {/* File Explorer Title */}
          <div className="p-2 border-b border-[#cbd5e1] flex items-center justify-between bg-[#d1d5db]">
            <span className="font-semibold text-[#374151] flex items-center space-x-1.5">
              <Folder className="w-3.5 h-3.5" />
              <span>Project Workspace</span>
            </span>
            <button 
              onClick={() => setIsCreatingFile(!isCreatingFile)}
              className="p-1 hover:bg-[#cbd5e1] rounded transition"
              title="New File"
            >
              <Plus className="w-3.5 h-3.5 text-slate-600" />
            </button>
          </div>

          {/* New file input block */}
          {isCreatingFile && (
            <div className="p-2 bg-[#d1d5db] border-b border-[#cbd5e1] flex flex-col space-y-1.5">
              <input 
                type="text" 
                placeholder="filename.tlml"
                value={newFileName}
                onChange={(e) => setNewFileName(e.target.value)}
                className="w-full p-1 bg-white border border-slate-400 rounded text-[11px] font-mono focus:outline-none"
              />
              <div className="flex space-x-1">
                <button 
                  onClick={createNewFile}
                  className="flex-1 py-0.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[10px]"
                >
                  Create
                </button>
                <button 
                  onClick={() => setIsCreatingFile(false)}
                  className="flex-1 py-0.5 bg-slate-500 hover:bg-slate-600 text-white rounded text-[10px]"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Files List */}
          <div className="flex-1 p-1.5 space-y-1">
            {files.map(file => (
              <div 
                key={file.path}
                onClick={() => {
                  setActiveFilePath(file.path);
                  setActiveContent(file.content);
                }}
                className={`group flex items-center justify-between px-2 py-1.5 rounded cursor-pointer transition ${
                  activeFilePath === file.path 
                    ? "bg-[#1e293b] text-white" 
                    : "hover:bg-[#d1d5db] text-slate-700"
                }`}
              >
                <span className="flex items-center space-x-1.5 truncate">
                  <FileCode className={`w-3.5 h-3.5 ${activeFilePath === file.path ? "text-emerald-400" : "text-slate-500"}`} />
                  <span className="font-mono text-[11px] truncate">{file.name}</span>
                </span>
                {file.name !== "Main.tlml" && file.name !== "Helper.tlml" && (
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteFile(file.path);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-[#cbd5e1] text-red-600 rounded transition"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Static assembly library list */}
          <div className="p-2 border-t border-[#cbd5e1] bg-[#d1d5db]">
            <span className="font-semibold text-[#374151] flex items-center space-x-1.5">
              <Layers className="w-3.5 h-3.5" />
              <span>GSOCC System Libraries</span>
            </span>
          </div>
          <div className="p-2 space-y-1.5 bg-[#e5e7eb] flex-shrink-0">
            <div className="flex items-center space-x-1.5 text-[#4b5563] font-mono text-[10px]">
              <Boxes className="w-3.5 h-3.5 text-blue-500" />
              <span className="font-semibold">TLML.Lang.soc</span>
            </div>
            <div className="flex items-center space-x-1.5 text-[#4b5563] font-mono text-[10px]">
              <Boxes className="w-3.5 h-3.5 text-blue-500" />
              <span className="font-semibold">TLML.Collections.soc</span>
            </div>
            <div className="flex items-center space-x-1.5 text-[#4b5563] font-mono text-[10px]">
              <Boxes className="w-3.5 h-3.5 text-blue-500" />
              <span className="font-semibold">TLML.Cryptography.soc</span>
            </div>
            <div className="flex items-center space-x-1.5 text-[#4b5563] font-mono text-[10px]">
              <Boxes className="w-3.5 h-3.5 text-blue-500" />
              <span className="font-semibold">TLML.Diagnostics.soc</span>
            </div>
          </div>
        </div>

        {/* Center Panel: Editor and Diagnostic Consoles */}
        <div className="flex-1 flex flex-col overflow-hidden bg-white">
          
          {/* Active File Label */}
          <div className="px-3 py-1.5 bg-slate-100 border-b border-slate-300 flex items-center space-x-2">
            <span className="text-slate-500">Editing:</span>
            <span className="font-mono font-semibold text-slate-700">{activeFilePath}</span>
          </div>

          {/* Monaco Code Editor */}
          <div className="flex-1 relative border-b border-slate-300">
            <Editor
              height="100%"
              language={activeFilePath.endsWith(".css") ? "css" : "tlml"}
              theme="vs-light"
              value={activeContent}
              onChange={(val) => setActiveContent(val || "")}
              beforeMount={handleEditorWillMount}
              onMount={handleEditorDidMount}
              options={{
                fontSize: 12,
                fontFamily: "JetBrains Mono, monospace",
                minimap: { enabled: false },
                automaticLayout: true,
                scrollbar: {
                  vertical: "visible",
                  horizontal: "visible"
                }
              }}
            />
          </div>

          {/* Consoles bottom tabs */}
          <div className="h-44 bg-[#0f172a] text-slate-300 flex flex-col">
            <div className="bg-[#1e293b] border-b border-[#0f172a] px-3 py-1 flex items-center justify-between text-white font-semibold">
              <span>Diagnostics & Compiler Output</span>
              {buildSuccess !== null && (
                <span className="flex items-center space-x-1 text-xs">
                  {buildSuccess ? (
                    <span className="text-emerald-400 flex items-center space-x-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>BUILD SUCCESSFUL</span>
                    </span>
                  ) : (
                    <span className="text-red-400 flex items-center space-x-1">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      <span>BUILD FAILURE</span>
                    </span>
                  )}
                </span>
              )}
            </div>
            <div className="flex-1 p-2 font-mono overflow-y-auto text-[11px] space-y-1 bg-[#020617] scrollbar-thin">
              {compilerErrors.length === 0 && (
                <div className="text-slate-400">// Ready to compile. No compilation errors detected. Press 'Compile Assembly' to test.</div>
              )}
              {compilerErrors.map((err, i) => (
                <div key={i} className="text-red-400 flex items-start space-x-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                  <span>{err}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Panel: Interactive Step-by-Step Debugger & AutoCommit panel */}
        <div className="w-72 bg-[#e5e7eb] border-l border-[#cbd5e1] flex flex-col overflow-y-auto">
          
          {/* Debugger Pane Header */}
          <div className="p-2 border-b border-[#cbd5e1] bg-[#d1d5db] flex items-center justify-between">
            <span className="font-semibold text-[#374151] flex items-center space-x-1.5">
              <Play className="w-3.5 h-3.5 text-sky-500" />
              <span>Interactive Debugger</span>
            </span>
            {isDebugging && (
              <span className="animate-pulse bg-sky-500 text-white px-1.5 py-0.5 rounded text-[9px] font-mono">
                RUNNING
              </span>
            )}
          </div>

          <div className="p-2 space-y-2 border-b border-[#cbd5e1]">
            <div className="flex space-x-1">
              <button 
                onClick={stepDebugger}
                disabled={!isDebugging || debugCompleted}
                className="debugger-step-btn flex-1 flex items-center justify-center space-x-1 px-2 py-1 bg-white hover:bg-slate-100 disabled:bg-slate-300 disabled:text-slate-500 border border-slate-300 rounded font-semibold text-[#334155]"
              >
                <SkipForward className="w-3.5 h-3.5" />
                <span>Step</span>
              </button>
              <button 
                onClick={stopDebugger}
                disabled={!isDebugging}
                className="flex-1 flex items-center justify-center space-x-1 px-2 py-1 bg-red-100 hover:bg-red-200 disabled:bg-slate-300 disabled:text-slate-500 text-red-700 border border-red-300 rounded font-semibold"
              >
                <Square className="w-3.5 h-3.5" />
                <span>Stop</span>
              </button>
            </div>
            
            {/* Selected Active Executing Method */}
            {selectedMethod && (
              <div className="p-1.5 bg-[#f3f4f6] border border-slate-300 rounded text-[10px] font-mono text-slate-600 truncate">
                <span className="font-bold text-slate-700">Target:</span> {selectedMethod}()
              </div>
            )}
          </div>

          {/* Stack Evaluation Visualizer */}
          <div className="p-2 border-b border-[#cbd5e1] flex-1 flex flex-col min-h-[140px]">
            <span className="font-semibold text-[#4b5563] mb-1">Evaluation Stack</span>
            <div className="flex-1 bg-slate-900 border border-slate-950 rounded p-2 font-mono text-emerald-400 flex flex-col-reverse justify-start overflow-y-auto space-y-1 space-y-reverse text-[10px]">
              {debugStack.length === 0 ? (
                <span className="text-slate-500 text-center italic mt-auto py-4">[ Stack Empty ]</span>
              ) : (
                debugStack.map((item, idx) => (
                  <div key={idx} className="bg-slate-800 border-l-2 border-emerald-500 p-1 rounded flex items-center justify-between text-emerald-300">
                    <span className="truncate">{item}</span>
                    <span className="text-[9px] text-emerald-600 bg-slate-950 px-1 rounded font-bold">STK_{idx}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Local Registers visual table */}
          <div className="p-2 border-b border-[#cbd5e1] h-32 flex flex-col">
            <span className="font-semibold text-[#4b5563] mb-1">Local Registers</span>
            <div className="flex-1 bg-white border border-slate-300 rounded overflow-y-auto font-mono text-[10px]">
              {Object.keys(debugVars).length === 0 ? (
                <div className="text-slate-400 italic p-2 text-center">[ None initialized ]</div>
              ) : (
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-slate-100 border-b border-slate-200">
                      <th className="p-1 font-semibold text-slate-500">Register</th>
                      <th className="p-1 font-semibold text-slate-500">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(debugVars).map(([key, val]) => (
                      <tr key={key} className="border-b border-slate-100">
                        <td className="p-1 text-slate-600 font-bold">{key}</td>
                        <td className="p-1 text-emerald-700 truncate max-w-[120px]">{val}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Branded AutoCommit Panel */}
          <div className="p-2 bg-[#1e293b] text-white flex flex-col space-y-2">
            <div className="flex items-center space-x-1.5 text-emerald-400 font-semibold">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>AutoCommit Assistant</span>
            </div>
            
            {/* Smart helpful advice text */}
            <p className="text-[10px] text-slate-300 leading-relaxed bg-[#0f172a] p-2 rounded border border-slate-700">
              {autoCommitTip}
            </p>

            {/* Snippet insert button */}
            {autoCommitSnippet && (
              <button 
                onClick={applyAutoCommitSnippet}
                className="w-full py-1 bg-amber-500 hover:bg-amber-600 text-slate-950 rounded font-bold text-[10px] flex items-center justify-center space-x-1 transition shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{autoCommitSnippet.label}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* VM Debug Console Outputs bottom footer */}
      <div className="h-32 bg-[#020617] border-t border-[#0f172a] text-slate-300 flex flex-col font-mono text-[10px]">
        <div className="bg-[#0f172a] px-3 py-1 flex items-center justify-between text-white border-b border-[#020617] font-semibold">
          <span className="flex items-center space-x-1">
            <Terminal className="w-3.5 h-3.5 text-emerald-400" />
            <span>Virtual Console Logs & Debug Stream</span>
          </span>
          <button 
            onClick={() => setConsoleLogs([])}
            className="text-[9px] text-slate-400 hover:text-white transition"
          >
            Clear Log
          </button>
        </div>
        <div className="flex-1 p-2 overflow-y-auto space-y-1 scrollbar-thin">
          {consoleLogs.map((log, idx) => (
            <div key={idx} className="console-log-text">
              {log}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
