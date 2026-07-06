import { ISocAssembly, ISocNamespace, ISocMethod, TypeKind } from "../types/soc";
import { TlmlInstructionRegistry } from "./instructionRegistry";
import docs from "../data/compilerDocs.json";

// Helper for Levenshtein Distance (error suggestions)
export function getLevenshteinDistance(a: string, b: string): number {
  const tmp = [];
  for (let i = 0; i <= a.length; i++) {
    tmp[i] = [i];
  }
  for (let j = 0; j <= b.length; j++) {
    tmp[0][j] = j;
  }
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      tmp[i][j] = Math.min(
        tmp[i - 1][j] + 1,
        tmp[i][j - 1] + 1,
        tmp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
  }
  return tmp[a.length][b.length];
}

export function findClosestMatch(target: string, possibilities: string[]): string | null {
  let bestDist = 4; // Threshold
  let bestMatch: string | null = null;
  possibilities.forEach(p => {
    const d = getLevenshteinDistance(target, p);
    if (d < bestDist) {
      bestDist = d;
      bestMatch = p;
    }
  });
  return bestMatch;
}

// System namespaces restricted list
export const SYSTEM_NAMESPACES = docs.systemNamespaces;

// Standard list of compiler keywords & instructions
export const TLML_INSTRUCTIONS = TlmlInstructionRegistry.getInstance().getNames();

export const TLML_DIRECTIVES = docs.directivesList;

export const TLML_TYPES = docs.types;

// Parser & Compiler Function
export function compileTLML(code: string, globalGsoc: any): { assembly: ISocAssembly | null; errors: string[] } {
  const errors: string[] = [];
  let assemblyName = "MyAssembly";
  let assemblyVersion = "1.0.0.0";
  const importedAssemblies: string[] = ["TLML.Lang"];
  const importedNamespaces: string[] = ["TLML.Lang.Console", "TLML.Lang", "TLML.Lang.System"];

  const asmRegex = /^\s*\.assembly\s+([\w\.]+)/i;
  const verRegex = /^\s*\.version\s+([\d\.]+)/i;
  const importAsmRegex = /^\s*\.import\s+assembly\s+([\w\.]+)/i;
  const importNsRegex = /^\s*\.import\s+namespace\s+([\w\.]+)/i;
  const namespaceRegex = /^\s*\.namespace\s+([\w\.]+)/i;
  const classRegex = /^\s*\.class\s+(?:public|private|internal)?\s*(?:static)?\s*([\w\.]+)/i;
  const methodRegex = /^\s*\.method\s+(public|private|protected|internal)?\s*(static)?\s*([\w\.]+)\s+([\w\.]+)\(([^)]*)\)/i;

  const fieldRegex = /^\s*\.field\s+(public|private|protected|internal)?\s*(static)?\s*([\w\.]+)\s+(\w+)/i;

  const lines = code.split("\n");
  let currentNamespace: ISocNamespace | null = null;
  let currentClass: any = null;
  let currentMethod: ISocMethod | null = null;
  let methodBodyLines: string[] = [];
  const namespaces: ISocNamespace[] = [];
  let openBrackets = 0;

  const activeGlobalAssemblies = globalGsoc ? Object.keys(globalGsoc.assemblies) : ["TLML.Lang"];

  // 1. Optimized Pre-pass to extract all local method signatures (enabling forward references without re-scanning)
  const fileLocalMethods: string[] = [];
  let preLastNamespace = "";
  let preLastClass = "";
  lines.forEach(line => {
    const commentIdx = line.indexOf("//");
    const cleanLine = commentIdx !== -1 ? line.substring(0, commentIdx) : line;
    const trimmed = cleanLine.trim();
    if (!trimmed) return;

    const nsM = trimmed.match(namespaceRegex);
    if (nsM) preLastNamespace = nsM[1];

    const clM = trimmed.match(classRegex);
    if (clM) preLastClass = clM[1];

    const methM = trimmed.match(methodRegex);
    if (methM) {
      const methName = methM[4];
      if (preLastNamespace && preLastClass) {
        fileLocalMethods.push(`${preLastNamespace}.${preLastClass}.${methName}`);
      }
      if (preLastClass) {
        fileLocalMethods.push(`${preLastClass}.${methName}`);
      }
      fileLocalMethods.push(methName);
    }
  });

  // 2. Pre-build the entire possible call targets list once to solve O(N*M) scaling issue
  const allPossibleTypes: string[] = [
    ...Object.keys(docs.standardLibs),
    "TLML.Lang.Console.Console.WriteLine",
    "TLML.Lang.Console.Console.Write",
    "TLML.Lang.Console.Console.ReadLine",
    "TLML.Lang.Console.Console.Clear",
    "TLML.Lang.Console.Console.Beep",
    ...fileLocalMethods
  ];

  if (globalGsoc) {
    Object.keys(globalGsoc.assemblies || {}).forEach(asmName => {
      const asm = globalGsoc.assemblies[asmName];
      if (asm && asm.namespaces) {
        asm.namespaces.forEach((ns: any) => {
          if (ns.types) {
            ns.types.forEach((t: any) => {
              if (t.methods) {
                t.methods.forEach((m: any) => {
                  allPossibleTypes.push(`${t.fullName}.${m.name}`);
                  allPossibleTypes.push(`${m.name}`);
                });
              }
            });
          }
        });
      }
    });
  }

  // 3. Main Compiler Single Pass
  lines.forEach((line, idx) => {
    const lineNum = idx + 1;
    
    // Clean trailing comments and trim
    const commentIdx = line.indexOf("//");
    const cleanLine = commentIdx !== -1 ? line.substring(0, commentIdx) : line;
    const trimmed = cleanLine.trim();

    if (!trimmed) return;

    if (trimmed.includes("{")) openBrackets++;
    if (trimmed.includes("}")) {
      openBrackets--;
      if (currentMethod) {
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

    // Compute scope at this point in iteration
    let currentScope: "ROOT" | "NAMESPACE" | "CLASS" | "METHOD" = "ROOT";
    if (currentMethod) {
      currentScope = "METHOD";
    } else if (currentClass) {
      currentScope = "CLASS";
    } else if (currentNamespace) {
      currentScope = "NAMESPACE";
    } else {
      currentScope = "ROOT";
    }

    if (asmRegex.test(trimmed)) {
      if (currentScope !== "ROOT") {
        errors.push(`Line ${lineNum}: Directive '.assembly' is only allowed at the root scope (outside of namespaces/classes).`);
        return;
      }
      const match = trimmed.match(asmRegex);
      if (match) assemblyName = match[1];
    } else if (verRegex.test(trimmed)) {
      if (currentScope !== "ROOT") {
        errors.push(`Line ${lineNum}: Directive '.version' is only allowed at the root scope.`);
        return;
      }
      const match = trimmed.match(verRegex);
      if (match) assemblyVersion = match[1];
    } else if (importAsmRegex.test(trimmed)) {
      if (currentScope !== "ROOT") {
        errors.push(`Line ${lineNum}: Directive '.import assembly' is only allowed at the root scope.`);
        return;
      }
      const match = trimmed.match(importAsmRegex);
      if (match) {
        const name = match[1];
        if (!activeGlobalAssemblies.includes(name)) {
          errors.push(`Line ${lineNum}: Referenced assembly '${name}' could not be resolved in VFS /sys/lib/ or GSOCC registry. Did you register it?`);
        } else {
          importedAssemblies.push(name);
        }
      }
    } else if (importNsRegex.test(trimmed)) {
      if (currentScope !== "ROOT") {
        errors.push(`Line ${lineNum}: Directive '.import namespace' is only allowed at the root scope.`);
        return;
      }
      const match = trimmed.match(importNsRegex);
      if (match) {
        importedNamespaces.push(match[1]);
      }
    } else if (namespaceRegex.test(trimmed)) {
      if (currentScope !== "ROOT") {
        errors.push(`Line ${lineNum}: Namespace declaration '.namespace' is only allowed at the root scope.`);
        return;
      }
      const match = trimmed.match(namespaceRegex);
      if (match) {
        const nsName = match[1];
        const isSystemAssembly = assemblyName === "TLML.Lang" || assemblyName.startsWith("TLML.Lang.");
        if (SYSTEM_NAMESPACES.includes(nsName) && !isSystemAssembly) {
          errors.push(`Line ${lineNum}: Namespace '${nsName}' is a reserved system namespace. Non-system assembly '${assemblyName}' cannot modify system namespaces.`);
        }
        currentNamespace = {
          name: nsName,
          fullName: nsName,
          types: [],
          constants: []
        };
        namespaces.push(currentNamespace);
      }
    } else if (classRegex.test(trimmed)) {
      if (currentScope !== "NAMESPACE") {
        if (currentScope === "ROOT") {
          errors.push(`Line ${lineNum}: Class declaration outside of valid namespace block.`);
        } else if (currentScope === "CLASS") {
          errors.push(`Line ${lineNum}: Nested class declarations are not supported.`);
        } else if (currentScope === "METHOD") {
          errors.push(`Line ${lineNum}: Class declaration '.class' is not allowed inside a method.`);
        }
        return;
      }
      const match = trimmed.match(classRegex);
      if (match && currentNamespace) {
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
    } else if (methodRegex.test(trimmed)) {
      if (currentScope !== "CLASS") {
        if (currentScope === "ROOT" || currentScope === "NAMESPACE") {
          errors.push(`Line ${lineNum}: Method declaration outside of class structure.`);
        } else if (currentScope === "METHOD") {
          errors.push(`Line ${lineNum}: Nested method declarations are not supported.`);
        }
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
        methodBodyLines = [];
      }
    } else if (fieldRegex.test(trimmed)) {
      if (currentScope !== "CLASS") {
        if (currentScope === "ROOT" || currentScope === "NAMESPACE") {
          errors.push(`Line ${lineNum}: Field declaration must be inside a class.`);
        } else if (currentScope === "METHOD") {
          errors.push(`Line ${lineNum}: Fields cannot be declared inside a method. Use local variable slots instead.`);
        }
        return;
      }
      const match = trimmed.match(fieldRegex);
      if (match && currentClass) {
        const modifier = match[1] || "Public";
        const isStatic = !!match[2];
        const fType = match[3];
        const fName = match[4];
        currentClass.fields.push({
          name: fName,
          type: fType,
          accessModifier: (modifier.charAt(0).toUpperCase() + modifier.slice(1)) as any,
          isStatic
        });
      }
    } else {
      // Standalone brackets skip
      if (trimmed === "{" || trimmed === "}") return;

      if (currentScope === "METHOD") {
        methodBodyLines.push(trimmed);

        const parts = trimmed.split(/\s+/);
        const command = parts[0];
        const argValue = parts.slice(1).join(" ");

        // Correctly handle labels (e.g. `:loop_head` or `:end`)
        if (command.startsWith(":")) {
          return;
        }

        if (!TLML_INSTRUCTIONS.includes(command)) {
          errors.push(`Line ${lineNum}: Unresolved stack VM bytecode instruction operator '${command}'.`);
        } else if (command === "call") {
          let foundTarget = false;
          const callTarget = argValue.trim();

          if (allPossibleTypes.includes(callTarget)) {
            foundTarget = true;
          }

          if (!foundTarget) {
            const closest = findClosestMatch(callTarget, allPossibleTypes);
            const recommendation = closest ? `. Did you mean '${closest}'?` : "";
            errors.push(`Line ${lineNum}: Cannot resolve compilation call to target reference '${callTarget}'${recommendation}`);
          }
        }
      } else {
        // Not in METHOD scope, meaning any instruction or labels are compilation errors!
        if (trimmed.startsWith(":")) {
          errors.push(`Line ${lineNum}: Jump label '${trimmed}' must be defined inside a method body.`);
        } else {
          const parts = trimmed.split(/\s+/);
          const command = parts[0];
          if (TLML_INSTRUCTIONS.includes(command)) {
            errors.push(`Line ${lineNum}: Stack instruction '${command}' is not allowed in ${currentScope.toLowerCase()} scope. All instructions must be inside a '.method' body.`);
          } else {
            errors.push(`Line ${lineNum}: Unrecognized statement or syntax '${trimmed}' in ${currentScope.toLowerCase()} scope.`);
          }
        }
      }
    }
  });

  if (openBrackets !== 0) {
    errors.push("Compilation Error: Mismatching bracket structure. Ensure all namespaces, classes, and methods are closed properly with '}'.");
  }

  if (errors.length > 0) {
    return { assembly: null, errors };
  }

  const assemblyOutput: ISocAssembly = {
    name: assemblyName,
    version: assemblyVersion,
    culture: "neutral",
    publicKeyToken: "tuxcompile7d21a93b",
    namespaces,
    dependencies: importedAssemblies.map(name => ({ assemblyName: name, version: "1.0.0.0" }))
  };

  return { assembly: assemblyOutput, errors: [] };
}

// TLML Language Server Mock/Service
export interface TlmlCompletionItem {
  label: string;
  kind: number; // Monaco CompletionItemKind (Method=1, Function=2, Field=4, Variable=5, Class=6, Keyword=13, Snippet=25)
  insertText: string;
  detail?: string;
  documentation?: string;
}

export class TlmlLanguageServer {
  private static assemblyCache: Record<string, any> = {};
  private static instructionCache: TlmlCompletionItem[] | null = null;
  private static lastCodeImports: string = "";

  private getImportedAssemblies(code: string): string[] {
    const importAsmRegex = /^\s*\.import\s+assembly\s+([\w\.]+)/gi;
    const imports: string[] = ["TLML.Lang"]; // default
    let match;
    while ((match = importAsmRegex.exec(code)) !== null) {
      imports.push(match[1]);
    }
    return Array.from(new Set(imports));
  }

  public static invalidateInstructionCache() {
    TlmlLanguageServer.instructionCache = null;
  }

  lint(code: string, globalGsoc: any): string[] {
    const { errors } = compileTLML(code, globalGsoc);
    return errors;
  }

  getHover(code: string, line: number, column: number, word: string, globalGsoc: any): { contents: { value: string }[] } | null {
    if (!word) return null;

    // 1. Check if it's a VM instruction
    const inst = TlmlInstructionRegistry.getInstance().get(word);
    if (inst) {
      return {
        contents: [
          { value: `**Instruction: \`${inst.name}\`**` },
          { value: `*Category: ${inst.category.toUpperCase()}*` },
          { value: inst.description },
          { value: inst.snippet ? `**Code Snippet:**\n\`\`\`assembly\n${inst.snippet}\n\`\`\`` : "" }
        ]
      };
    }

    // 2. Check if it's a directive
    if (word.startsWith(".")) {
      const directiveDesc = docs.directives as Record<string, { title: string, desc: string, syntax: string }>;

      const key = Object.keys(directiveDesc).find(d => word.startsWith(d));
      if (key) {
        const info = directiveDesc[key];
        return {
          contents: [
            { value: `**Directive: \`${info.title}\`**` },
            { value: info.desc },
            { value: `**Syntax:**\n\`\`\`assembly\n${info.syntax}\n\`\`\`` }
          ]
        };
      }
    }

    // 3. Check local labels (starts with ':')
    if (word.startsWith(":")) {
      return {
        contents: [
          { value: `**Local Label: \`${word}\`**` },
          { value: "Marks a jump destination address offset inside the current method body. You can redirect control flow here using `jump` or `jump.false` instructions." }
        ]
      };
    }

    // 4. Standard library hover details
    const standardLibs = docs.standardLibs as Record<string, string>;

    if (standardLibs[word]) {
      return {
        contents: [
          { value: `**Standard Method: \`${word}\`**` },
          { value: standardLibs[word] }
        ]
      };
    }

    const partialKey = Object.keys(standardLibs).find(k => k.endsWith("." + word));
    if (partialKey) {
      return {
        contents: [
          { value: `**Standard Method: \`${partialKey}\`**` },
          { value: standardLibs[partialKey] }
        ]
      };
    }

    // 5. Look for local code declarations
    const lines = code.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith(".method") && line.includes(word)) {
        return {
          contents: [
            { value: `**Local Method: \`${word}\`**` },
            { value: `Declared on Line ${i + 1}:\n\`\`\`assembly\n${line}\n\`\`\`` }
          ]
        };
      }
      if (line.startsWith(".class") && line.includes(word)) {
        return {
          contents: [
            { value: `**Local Class: \`${word}\`**` },
            { value: `Declared on Line ${i + 1}:\n\`\`\`assembly\n${line}\n\`\`\`` }
          ]
        };
      }
      if (line.startsWith(".field") && line.includes(word)) {
        return {
          contents: [
            { value: `**Local Field: \`${word}\`**` },
            { value: `Declared on Line ${i + 1}:\n\`\`\`assembly\n${line}\n\`\`\`` }
          ]
        };
      }
    }

    return null;
  }

  getCompletions(code: string, lineIndex: number, colIndex: number, globalGsoc: any): TlmlCompletionItem[] {
    const lines = code.split("\n");
    const currentLine = lines[lineIndex] || "";
    const textBeforeCursor = currentLine.substring(0, colIndex);
    const trimmedBeforeCursor = textBeforeCursor.trim();

    // Context analysis: What are we inside?
    interface ScopeState {
      type: "ROOT" | "NAMESPACE" | "CLASS" | "METHOD";
      name: string;
      lineStart: number;
      params?: string[];
      fields?: string[];
      methods?: string[];
    }

    const scopeStack: ScopeState[] = [
      { type: "ROOT", name: "", lineStart: 0 }
    ];

    const namespaceRegex = /^\s*\.namespace\s+([\w\.]+)/i;
    const classRegex = /^\s*\.class\s+(?:public|private|internal|protected)?\s*(?:static)?\s*([\w\.]+)/i;
    const methodRegex = /^\s*\.method\s+(?:public|private|protected|internal)?\s*(?:static)?\s*([\w\.]+)\s+([\w\.]+)\(([^)]*)\)/i;
    const fieldRegex = /^\s*\.field\s+(?:public|private|protected|internal)?\s*(?:static)?\s*([\w\.]+)\s+(\w+)/i;

    let pendingScope: ScopeState | null = null;

    for (let i = 0; i < lineIndex; i++) {
      const line = lines[i];
      const commentIdx = line.indexOf("//");
      const cleanLine = commentIdx !== -1 ? line.substring(0, commentIdx) : line;
      const trimmed = cleanLine.trim();

      if (!trimmed) continue;

      // Extract pending scopes
      if (namespaceRegex.test(trimmed)) {
        const match = trimmed.match(namespaceRegex);
        if (match) {
          pendingScope = { type: "NAMESPACE", name: match[1], lineStart: i };
        }
      } else if (classRegex.test(trimmed)) {
        const match = trimmed.match(classRegex);
        if (match) {
          pendingScope = { type: "CLASS", name: match[1], lineStart: i, fields: [], methods: [] };
        }
      } else if (methodRegex.test(trimmed)) {
        const match = trimmed.match(methodRegex);
        if (match) {
          const rawParams = match[3];
          const params = rawParams ? rawParams.split(",").map(p => {
            const parts = p.trim().split(/\s+/);
            return parts[parts.length - 1] || "";
          }).filter(p => p !== "") : [];
          pendingScope = { type: "METHOD", name: match[2], lineStart: i, params };
        }
      }

      // If we are in CLASS scope, track fields and methods dynamically
      const activeClassScope = [...scopeStack].reverse().find(s => s.type === "CLASS");
      if (activeClassScope) {
        if (fieldRegex.test(trimmed)) {
          const match = trimmed.match(fieldRegex);
          if (match) {
            activeClassScope.fields = activeClassScope.fields || [];
            activeClassScope.fields.push(match[2]);
          }
        } else if (methodRegex.test(trimmed)) {
          const match = trimmed.match(methodRegex);
          if (match) {
            activeClassScope.methods = activeClassScope.methods || [];
            activeClassScope.methods.push(match[2]);
          }
        }
      }

      // Scan characters for curly braces to update stack
      for (let char of cleanLine) {
        if (char === "{") {
          if (pendingScope) {
            scopeStack.push(pendingScope);
            pendingScope = null;
          } else {
            const top = scopeStack[scopeStack.length - 1];
            scopeStack.push({ type: top.type, name: top.name, lineStart: i, params: top.params, fields: top.fields, methods: top.methods });
          }
        } else if (char === "}") {
          if (scopeStack.length > 1) {
            scopeStack.pop();
          }
        }
      }
    }

    // Inspect the active scope at cursor line
    const activeScope = scopeStack[scopeStack.length - 1];
    const items: TlmlCompletionItem[] = [];

    // Helper to load explicitly imported assemblies to local cache, or reuse cache
    const currentImports = this.getImportedAssemblies(code);
    const importsKey = currentImports.sort().join(",");
    
    if (importsKey !== TlmlLanguageServer.lastCodeImports) {
      TlmlLanguageServer.assemblyCache = {};
      currentImports.forEach(asmName => {
        if (globalGsoc && globalGsoc.assemblies && globalGsoc.assemblies[asmName]) {
          TlmlLanguageServer.assemblyCache[asmName] = globalGsoc.assemblies[asmName];
        }
      });
      TlmlLanguageServer.lastCodeImports = importsKey;
    }

    // --- CASE 1: INSIDE METHOD SCOPE ---
    if (activeScope.type === "METHOD") {
      const activeClass = [...scopeStack].reverse().find(s => s.type === "CLASS");

      // 1A. Call method completions
      if (trimmedBeforeCursor.match(/\bcall\s+[\w.:\-]*$/i)) {
        // System Library calls
        const systemCalls = docs.completions as { label: string, doc: string }[];
        systemCalls.forEach(c => {
          items.push({
            label: c.label,
            kind: 1, // Method
            insertText: c.label,
            detail: "System Library Call",
            documentation: c.doc
          });
        });

        // Local methods in same class
        if (activeClass && activeClass.methods) {
          activeClass.methods.forEach(m => {
            items.push({
              label: m,
              kind: 2, // Function / Local Method
              insertText: m,
              detail: "Local Method Call",
              documentation: `Invoke local method '${m}' defined in active class.`
            });
          });
        }

        // External GSOCC assemblies methods
        Object.keys(TlmlLanguageServer.assemblyCache).forEach(asmName => {
          const asm = TlmlLanguageServer.assemblyCache[asmName];
          if (asm && asm.namespaces) {
            asm.namespaces.forEach((ns: any) => {
              if (ns.types) {
                ns.types.forEach((t: any) => {
                  if (t.methods) {
                    t.methods.forEach((m: any) => {
                      const fullName = `${t.fullName}.${m.name}`;
                      items.push({
                        label: fullName,
                        kind: 1,
                        insertText: fullName,
                        detail: `Assembly ${asmName}`,
                        documentation: `Call referenced assembly method '${fullName}'`
                      });
                    });
                  }
                });
              }
            });
          }
        });

        return items;
      }

      // 1B. Class fields completions (push.field / store.field)
      if (trimmedBeforeCursor.match(/\b(push\.field|store\.field)\s+[\w.:\-]*$/i)) {
        if (activeClass && activeClass.fields) {
          activeClass.fields.forEach(f => {
            items.push({
              label: f,
              kind: 4, // Field
              insertText: f,
              detail: "Class Member Field",
              documentation: `Active class member field variable '${f}'`
            });
          });
        }
        return items;
      }

      // 1C. Method parameters completions (push.arg / store.arg)
      if (trimmedBeforeCursor.match(/\b(push\.arg|store\.arg)\s+[\w.:\-]*$/i)) {
        if (activeScope.params) {
          activeScope.params.forEach(p => {
            items.push({
              label: p,
              kind: 5, // Variable
              insertText: p,
              detail: "Method Argument",
              documentation: `Method input parameter variable '${p}'`
            });
          });
        }
        return items;
      }

      // 1D. Local registers slots completions (push.local / store.local)
      if (trimmedBeforeCursor.match(/\b(push\.local|store\.local)\s+[\w.:\-]*$/i)) {
        for (let i = 0; i < 5; i++) {
          items.push({
            label: String(i),
            kind: 5, // Variable
            insertText: String(i),
            detail: `Local Register Slot [${i}]`,
            documentation: `Stack frame virtual local register slot ${i}.`
          });
        }
        return items;
      }

      // 1E. Jump Labels completions (jump / jump.true / jump.false)
      if (trimmedBeforeCursor.match(/\b(jump|jump\.false|jump\.true)\s+[\w.:\-]*$/i)) {
        // Scan current method lines for labels starting with ":"
        const labels: string[] = [];
        const startLine = activeScope.lineStart;
        for (let idx = startLine; idx <= lineIndex; idx++) {
          const l = (lines[idx] || "").trim();
          if (l.startsWith(":")) {
            const commentPart = l.indexOf("//");
            const cleanLabel = commentPart !== -1 ? l.substring(0, commentPart).trim() : l;
            labels.push(cleanLabel);
          }
        }

        labels.forEach(lbl => {
          items.push({
            label: lbl,
            kind: 5, // Variable / Label
            insertText: lbl,
            detail: "Local Jump Label",
            documentation: `Jump execution to label offset '${lbl}'`
          });
        });
        return items;
      }

      // 1F. Default: Bytecode Instructions
      if (!TlmlLanguageServer.instructionCache) {
        TlmlLanguageServer.instructionCache = TlmlInstructionRegistry.getInstance().getAll().map(inst => ({
          label: inst.name,
          kind: 13, // Keyword
          insertText: inst.snippet || inst.name,
          detail: `[${inst.category.toUpperCase()}] Instruction`,
          documentation: inst.description
        }));
      }
      
      items.push(...TlmlLanguageServer.instructionCache);
      
      // Add local label snippet
      items.push({
        label: ":label",
        kind: 25, // Snippet
        insertText: ":${1:label_name}",
        detail: "Define local jump label",
        documentation: "Define a jump offset label target."
      });

      return items;
    }

    // --- CASE 2: INSIDE CLASS SCOPE ---
    if (activeScope.type === "CLASS") {
      items.push({
        label: ".method static",
        kind: 25, // Snippet
        insertText: ".method public static void ${1:Main}(${2:string arg})\n{\n    $0\n}",
        detail: "Static method declaration block",
        documentation: "Declare a new compiled static method routine."
      });
      items.push({
        label: ".method instance",
        kind: 25, // Snippet
        insertText: ".method public void ${1:MyMethod}()\n{\n    $0\n    ret\n}",
        detail: "Instance method declaration block",
        documentation: "Declare an instance member method."
      });
      items.push({
        label: ".field private",
        kind: 25, // Snippet
        insertText: ".field private ${1:int} ${2:myField}",
        detail: "Private field declaration",
        documentation: "Declare a private object member state field."
      });
      items.push({
        label: ".field public",
        kind: 25, // Snippet
        insertText: ".field public ${1:string} ${2:myField}",
        detail: "Public field declaration",
        documentation: "Declare a public member state field."
      });
      items.push({
        label: ".property",
        kind: 25, // Snippet
        insertText: ".property public ${1:int} ${2:MyProperty}",
        detail: "Property declaration snippet",
        documentation: "Declare a managed public getter/setter property."
      });

      // Also suggest data types for declaring fields/methods
      const types = docs.types as string[];
      types.forEach(t => {
        items.push({
          label: t,
          kind: 13, // Keyword
          insertText: t,
          detail: "TLML Value/Reference Type",
          documentation: `Standard type reference for '${t}'.`
        });
      });

      return items;
    }

    // --- CASE 3: INSIDE NAMESPACE SCOPE ---
    if (activeScope.type === "NAMESPACE") {
      items.push({
        label: ".class public",
        kind: 25, // Snippet
        insertText: ".class public ${1:Program}\n{\n    $0\n}",
        detail: "Public Class declaration snippet",
        documentation: "Declare a public object class block."
      });
      items.push({
        label: ".class private",
        kind: 25, // Snippet
        insertText: ".class private ${1:Helper}\n{\n    $0\n}",
        detail: "Private Class declaration snippet",
        documentation: "Declare a private container class."
      });
      return items;
    }

    // --- CASE 4: ROOT SCOPE ---
    items.push({
      label: ".assembly",
      kind: 25,
      insertText: ".assembly ${1:MyCompiledCode}",
      detail: "Define assembly name",
      documentation: "Define the logical name of the generated assembly output."
    });
    items.push({
      label: ".version",
      kind: 25,
      insertText: ".version ${1:1.0.0.0}",
      detail: "Define assembly version",
      documentation: "Define the semantic binary assembly version."
    });
    items.push({
      label: ".import assembly",
      kind: 25,
      insertText: ".import assembly ${1:TLML.Lang}",
      detail: "Import binary GSOCC dependency",
      documentation: "Import a compiled .soc library assembly from system storage."
    });
    items.push({
      label: ".import namespace",
      kind: 25,
      insertText: ".import namespace ${1:TLML.Lang.Console}",
      detail: "Import namespace mapping",
      documentation: "Add namespace mapping references for compiler lookup shortcutting."
    });
    items.push({
      label: ".namespace",
      kind: 25,
      insertText: ".namespace ${1:MyCustomApp}\n{\n    $0\n}",
      detail: "Declare Namespace block",
      documentation: "Declare a standard organizational namespace block scope."
    });

    return items;
  }
}
