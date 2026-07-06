import { TlmlInstruction } from "./instructionRegistry";

export const defaultInstructions: TlmlInstruction[] = [
  // --- STACK INSTRUCTIONS ---
  {
    name: "push.const",
    category: "stack",
    description: "Pushes a constant value (string or number) onto the evaluation stack.",
    snippet: "push.const ${1:value}",
    execute: (mvm, arg) => {
      mvm.state.stack.push(arg);
    }
  },
  {
    name: "push.arg",
    category: "stack",
    description: "Pushes the value of a specified argument onto the stack.",
    snippet: "push.arg ${1:argName}",
    execute: (mvm, arg) => {
      mvm.state.stack.push(mvm.state.args[arg] !== undefined ? mvm.state.args[arg] : `Arg(${arg})`);
    }
  },
  {
    name: "push.local",
    category: "stack",
    description: "Pushes the value of a local variable index onto the stack.",
    snippet: "push.local ${1:varName}",
    execute: (mvm, arg) => {
      mvm.state.stack.push(mvm.state.vars[arg] !== undefined ? mvm.state.vars[arg] : "Null");
    }
  },
  {
    name: "push.field",
    category: "stack",
    description: "Pushes a class member field value onto the stack.",
    snippet: "push.field ${1:fieldName}",
    execute: (mvm, arg) => {
      mvm.state.stack.push(`Field(${arg})`);
    }
  },
  {
    name: "push.this",
    category: "stack",
    description: "Pushes the 'this' instance pointer onto the stack.",
    execute: (mvm) => {
      mvm.state.stack.push("this(Ptr)");
    }
  },
  {
    name: "store.local",
    category: "stack",
    description: "Pops the top value from the stack and stores it in a local variable.",
    snippet: "store.local ${1:varName}",
    execute: (mvm, arg) => {
      if (mvm.state.stack.length > 0) {
        mvm.state.vars[arg] = mvm.state.stack.pop()!;
      } else {
        throw new Error("Stack Underflow on store.local");
      }
    }
  },
  {
    name: "store.arg",
    category: "stack",
    description: "Pops the top value from the stack and updates an argument's value.",
    snippet: "store.arg ${1:argName}",
    execute: (mvm, arg) => {
      if (mvm.state.stack.length > 0) {
        mvm.state.args[arg] = mvm.state.stack.pop()!;
      } else {
        throw new Error("Stack Underflow on store.arg");
      }
    }
  },
  {
    name: "store.field",
    category: "stack",
    description: "Pops the top value from the stack and stores it in an object's member field.",
    snippet: "store.field ${1:fieldName}",
    execute: (mvm) => {
      if (mvm.state.stack.length > 0) {
        mvm.state.stack.pop();
      } else {
        throw new Error("Stack Underflow on store.field");
      }
    }
  },
  {
    name: "store.elem",
    category: "stack",
    description: "Pops the value, index, and array reference from the stack, storing the value at that array index.",
    execute: (mvm) => {
      if (mvm.state.stack.length >= 3) {
        mvm.state.stack.pop();
        mvm.state.stack.pop();
        mvm.state.stack.pop();
      } else {
        throw new Error("Stack Underflow on store.elem");
      }
    }
  },

  // --- ARITHMETIC INSTRUCTIONS ---
  {
    name: "add",
    category: "arithmetic",
    description: "Pops two values, adds them (or concatenates if strings), and pushes the result.",
    execute: (mvm) => {
      if (mvm.state.stack.length < 2) throw new Error("Stack Underflow on add");
      const bRaw = mvm.state.stack.pop()!;
      const aRaw = mvm.state.stack.pop()!;
      const b = parseFloat(bRaw);
      const a = parseFloat(aRaw);
      if (isNaN(a) || isNaN(b)) {
        const strA = aRaw.replace(/"/g, "");
        const strB = bRaw.replace(/"/g, "");
        mvm.state.stack.push(`"${strA}${strB}"`);
      } else {
        mvm.state.stack.push(String(a + b));
      }
    }
  },
  {
    name: "sub",
    category: "arithmetic",
    description: "Pops two values, subtracts the first popped from the second, and pushes the result.",
    execute: (mvm) => {
      if (mvm.state.stack.length < 2) throw new Error("Stack Underflow on sub");
      const b = parseFloat(mvm.state.stack.pop()!);
      const a = parseFloat(mvm.state.stack.pop()!);
      mvm.state.stack.push(String(isNaN(a - b) ? 0 : a - b));
    }
  },
  {
    name: "mul",
    category: "arithmetic",
    description: "Pops two values, multiplies them, and pushes the result.",
    execute: (mvm) => {
      if (mvm.state.stack.length < 2) throw new Error("Stack Underflow on mul");
      const b = parseFloat(mvm.state.stack.pop()!);
      const a = parseFloat(mvm.state.stack.pop()!);
      mvm.state.stack.push(String(isNaN(a * b) ? 0 : a * b));
    }
  },
  {
    name: "div",
    category: "arithmetic",
    description: "Pops two values, divides the second by the first, and pushes the result.",
    execute: (mvm) => {
      if (mvm.state.stack.length < 2) throw new Error("Stack Underflow on div");
      const b = parseFloat(mvm.state.stack.pop()!);
      const a = parseFloat(mvm.state.stack.pop()!);
      mvm.state.stack.push(String(b === 0 ? 0 : (isNaN(a / b) ? 0 : a / b)));
    }
  },
  {
    name: "rem",
    category: "arithmetic",
    description: "Pops two values, computes the remainder of division, and pushes the result.",
    execute: (mvm) => {
      if (mvm.state.stack.length < 2) throw new Error("Stack Underflow on rem");
      const b = parseFloat(mvm.state.stack.pop()!);
      const a = parseFloat(mvm.state.stack.pop()!);
      mvm.state.stack.push(String(b === 0 ? 0 : a % b));
    }
  },
  {
    name: "xor",
    category: "arithmetic",
    description: "Pops two values, performs logical XOR (for booleans) or bitwise XOR (for numbers).",
    execute: (mvm) => {
      if (mvm.state.stack.length < 2) throw new Error("Stack Underflow on xor");
      const bVal = mvm.state.stack.pop()!;
      const aVal = mvm.state.stack.pop()!;
      if (bVal === "true" || bVal === "false" || aVal === "true" || aVal === "false") {
        const bBool = bVal === "true";
        const aBool = aVal === "true";
        mvm.state.stack.push(String(aBool !== bBool));
      } else {
        const bNum = parseInt(bVal) || 0;
        const aNum = parseInt(aVal) || 0;
        mvm.state.stack.push(String(aNum ^ bNum));
      }
    }
  },
  {
    name: "rot.left",
    category: "arithmetic",
    description: "Pops bits and value, rotates the value bits to the left, and pushes the result.",
    execute: (mvm) => {
      if (mvm.state.stack.length < 2) throw new Error("Stack Underflow on rot.left");
      const bits = parseInt(mvm.state.stack.pop()!) || 0;
      const val = parseInt(mvm.state.stack.pop()!) || 0;
      const rotated = (val << bits) | (val >>> (32 - bits));
      mvm.state.stack.push(String(rotated));
    }
  },

  // --- COMPARISON INSTRUCTIONS ---
  {
    name: "compare.lt",
    category: "comparison",
    description: "Compares if the first popped value is greater than the second (i.e. second < first), pushes boolean.",
    execute: (mvm) => {
      if (mvm.state.stack.length < 2) throw new Error("Stack Underflow on compare.lt");
      const b = parseFloat(mvm.state.stack.pop()!);
      const a = parseFloat(mvm.state.stack.pop()!);
      mvm.state.stack.push(String(a < b));
    }
  },
  {
    name: "compare.gt",
    category: "comparison",
    description: "Compares if the second popped value is greater than the first (i.e. second > first), pushes boolean.",
    execute: (mvm) => {
      if (mvm.state.stack.length < 2) throw new Error("Stack Underflow on compare.gt");
      const b = parseFloat(mvm.state.stack.pop()!);
      const a = parseFloat(mvm.state.stack.pop()!);
      mvm.state.stack.push(String(a > b));
    }
  },
  {
    name: "compare.eq",
    category: "comparison",
    description: "Compares top two values for strict equality, pushes boolean.",
    execute: (mvm) => {
      if (mvm.state.stack.length < 2) throw new Error("Stack Underflow on compare.eq");
      const b = mvm.state.stack.pop()!;
      const a = mvm.state.stack.pop()!;
      mvm.state.stack.push(String(a === b || String(a).replace(/"/g, "") === String(b).replace(/"/g, "")));
    }
  },
  {
    name: "compare.neq",
    category: "comparison",
    description: "Compares top two values for inequality, pushes boolean.",
    execute: (mvm) => {
      if (mvm.state.stack.length < 2) throw new Error("Stack Underflow on compare.neq");
      const b = mvm.state.stack.pop()!;
      const a = mvm.state.stack.pop()!;
      mvm.state.stack.push(String(a !== b && String(a).replace(/"/g, "") !== String(b).replace(/"/g, "")));
    }
  },
  {
    name: "compare.gte",
    category: "comparison",
    description: "Compares if second popped value is greater than or equal to the first, pushes boolean.",
    execute: (mvm) => {
      if (mvm.state.stack.length < 2) throw new Error("Stack Underflow on compare.gte");
      const b = parseFloat(mvm.state.stack.pop()!);
      const a = parseFloat(mvm.state.stack.pop()!);
      mvm.state.stack.push(String(a >= b));
    }
  },

  // --- OBJECTS / ARRAYS ---
  {
    name: "newarr",
    category: "objects",
    description: "Creates a new array reference of the specified type with the popped size.",
    snippet: "newarr ${1:string}",
    execute: (mvm, arg) => {
      if (mvm.state.stack.length > 0) {
        const len = mvm.state.stack.pop()!;
        mvm.state.stack.push(`Array<${arg}>[${len}]`);
      } else {
        throw new Error("Stack Underflow on newarr");
      }
    }
  },
  {
    name: "newobj",
    category: "objects",
    description: "Instantiates a new class object reference and pushes it onto the stack.",
    snippet: "newobj ${1:ClassName}",
    execute: (mvm, arg) => {
      mvm.state.stack.push(`NewObj(${arg})`);
    }
  },

  // --- CONTROL FLOW ---
  {
    name: "jump",
    category: "control",
    description: "Unconditionally jumps instruction execution pointer to the designated label.",
    snippet: "jump :${1:label}",
    execute: (mvm, arg) => {
      const target = arg.trim();
      const targetIdx = mvm.findLabelPC(target);
      if (targetIdx !== -1) {
        return targetIdx;
      } else {
        throw new Error(`Label '${target}' not found`);
      }
    }
  },
  {
    name: "jump.false",
    category: "control",
    description: "Jumps to the designated label if the popped value is false, 0, Null, or empty.",
    snippet: "jump.false :${1:label}",
    execute: (mvm, arg) => {
      if (mvm.state.stack.length > 0) {
        const popped = mvm.state.stack.pop()!;
        const isFalse = popped === "false" || popped === "0" || popped === "Null" || popped === "" || popped === "False";
        if (isFalse) {
          const target = arg.trim();
          const targetIdx = mvm.findLabelPC(target);
          if (targetIdx !== -1) {
            return targetIdx;
          } else {
            throw new Error(`Label '${target}' not found`);
          }
        }
      } else {
        throw new Error("Stack Underflow on jump.false");
      }
    }
  },
  {
    name: "call",
    category: "control",
    description: "Invokes a static, native, or standard class library method.",
    snippet: "call ${1:TLML.Lang.Console.WriteLine}",
    execute: (mvm, arg) => {
      mvm.executeCall(arg);
    }
  },
  {
    name: "ret",
    category: "control",
    description: "Returns from the current method. Execution terminates if this is the entrypoint.",
    execute: (mvm) => {
      mvm.state.isCompleted = true;
      mvm.state.logs.push("[MVM] Program execution complete.");
    }
  }
];
