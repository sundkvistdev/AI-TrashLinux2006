import { ISocAssembly, ISocMethod } from "../types/soc";
import { TlmlInstructionRegistry } from "./instructionRegistry";
import { sysCallHandlers } from "./sysCallHandlers";

export interface MvmState {
  pc: number;
  instructions: string[];
  stack: string[];
  vars: Record<string, string>;
  args: Record<string, string>;
  logs: string[];
  isCompleted: boolean;
  hasError: boolean;
}

export class ManagedVirtualMachine {
  state: MvmState;
  onBeep?: () => void;
  onSetColor?: (color: string) => void;
  onReadLine?: () => string;

  constructor() {
    this.state = this.getInitialState();
  }

  getInitialState(): MvmState {
    return {
      pc: 0,
      instructions: [],
      stack: [],
      vars: {},
      args: {},
      logs: [],
      isCompleted: false,
      hasError: false
    };
  }

  loadMethod(methodName: string, bodyText: string, initialArgs: Record<string, string> = {}) {
    const rawLines = bodyText.split("\n");
    const instructions: string[] = [];
    rawLines.forEach(line => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("//") && trimmed !== "{" && trimmed !== "}") {
        instructions.push(trimmed);
      }
    });

    this.state = {
      pc: 0,
      instructions,
      stack: [],
      vars: {},
      args: initialArgs,
      logs: [`[MVM] Virtual CPU loaded '${methodName}'. Instructions count: ${instructions.length}`],
      isCompleted: false,
      hasError: false
    };
  }

  step() {
    if (this.state.isCompleted || this.state.hasError) return;
    if (this.state.pc >= this.state.instructions.length) {
      this.state.isCompleted = true;
      this.state.logs.push("[MVM] Program reached end (RET implicit).");
      return;
    }

    const currentLine = this.state.instructions[this.state.pc];
    const cleanLine = currentLine.trim();

    this.state.logs.push(`PC[${String(this.state.pc).padStart(3, "0")}]: ${cleanLine}`);
    let newPC = this.state.pc + 1;

    if (cleanLine.startsWith(":")) {
      // Label declaration, skip
      this.state.pc = newPC;
      return;
    }

    const parts = cleanLine.split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const arg = parts.slice(1).join(" ");

    try {
      const registry = TlmlInstructionRegistry.getInstance();
      const inst = registry.get(cmd);
      if (inst) {
        const result = inst.execute(this, arg);
        if (typeof result === "number") {
          newPC = result;
        }
      } else {
        throw new Error(`Unknown instruction '${cmd}'`);
      }
    } catch (e: any) {
      this.state.hasError = true;
      this.state.logs.push(`[MVM Error] ${e.message}`);
    }

    this.state.pc = newPC;
  }

  findLabelPC(labelName: string): number {
    const cleanLabel = labelName.startsWith(":") ? labelName : `:${labelName}`;
    return this.state.instructions.findIndex(line => line.trim() === cleanLabel);
  }

  executeCall(callTarget: string) {
    const target = callTarget.trim();
    // Map of common aliases to keys in sysCallHandlers
    const handlerMap: Record<string, string> = {
      "Native.ConsoleWrite": "Console.WriteLine",
      "Native.ConsoleRead": "Console.ReadLine",
      "Native.ConsoleClear": "Console.Clear",
      "Native.ConsoleBeep": "Console.Beep",
      "Native.ConsoleSetColor": "Console.SetColor",
      "Native.MathSqrt": "Math.Sqrt",
      "Native.MathAbs": "Math.Abs",
      "Native.MathPow": "Math.Pow",
      "Native.MathRandom": "Math.Random",
      "Native.MathMax": "Math.Max",
      "Native.MathMin": "Math.Min",
      "Native.MathRound": "Math.Round",
      "Native.EnvGetTime": "Environment.GetTime",
      "Native.EnvGetOSVersion": "Environment.GetOSVersion",
      "Native.EnvGetCurrentUser": "Environment.GetCurrentUser",
      "Native.StringConcat": "StringUtil.Concat",
      "Native.StringLength": "StringUtil.Length",
      "Native.StringToUpper": "StringUtil.ToUpper",
      "Native.StringToLower": "StringUtil.ToLower"
    };

    const handlerKey = Object.keys(sysCallHandlers).find(key => target.includes(key) || target === handlerMap[key]);
    
    if (handlerKey && sysCallHandlers[handlerKey]) {
      sysCallHandlers[handlerKey](this, target);
    } else {
      this.state.stack.push(`ResultOf_${target.split(".").pop() || "call"}`);
    }
  }
}
