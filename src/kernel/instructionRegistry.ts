import { ManagedVirtualMachine } from "./mvm";
import { defaultInstructions } from "./defaultInstructions";

export interface TlmlInstruction {
  name: string;
  category: "stack" | "arithmetic" | "comparison" | "control" | "objects" | "utility";
  description: string;
  snippet?: string;
  execute: (mvm: ManagedVirtualMachine, arg: string) => number | void;
}

export class TlmlInstructionRegistry {
  private static instance: TlmlInstructionRegistry;
  private instructions: Map<string, TlmlInstruction> = new Map();

  private constructor() {
    this.registerDefaults();
  }

  public static getInstance(): TlmlInstructionRegistry {
    if (!TlmlInstructionRegistry.instance) {
      TlmlInstructionRegistry.instance = new TlmlInstructionRegistry();
    }
    return TlmlInstructionRegistry.instance;
  }

  public register(instruction: TlmlInstruction) {
    this.instructions.set(instruction.name.toLowerCase(), instruction);
  }

  public get(name: string): TlmlInstruction | undefined {
    return this.instructions.get(name.toLowerCase());
  }

  public getAll(): TlmlInstruction[] {
    return Array.from(this.instructions.values());
  }

  public getNames(): string[] {
    return Array.from(this.instructions.keys());
  }

  private registerDefaults() {
    defaultInstructions.forEach(inst => this.register(inst));
  }
}
